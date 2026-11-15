import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import CalismaKarti from "../models/CalismaKarti.js";
import { kartKilidiniAl, kartKilidiniBirak } from "./calismaKartiLock.js";
import { geminiIleHaritaTabanliKartUret } from "./geminiService.js";
import { konuHaritasiniOzetle, dersMetniniGrupla, haritaKartlariniDogrula } from "./haritaTabanliKartPlanlama.mjs";


const imza = (s) => createHash("sha256").update(s).digest("hex");
const kimlik = (s) => String(s);
const sorgu = (d = {}) => ({
    DersModel: d.DersModel || Ders,
    HaritaModel: d.HaritaModel || KonuHaritasi,
    MateryalModel: d.MateryalModel || Materyal,
    ParcaModel: d.ParcaModel || MetinParcasi,
    KartModel: d.KartModel || CalismaKarti,
    uret: d.uret || geminiIleHaritaTabanliKartUret,
    gruplama: d.gruplama || dersMetniniGrupla,
});

export class HaritaKartiHatasi extends Error {
    constructor(message, status = 422, kod = "HARITA_KART_HATASI") {
        super(message);
        this.status = status;
        this.kod = kod;
    }
}

const materyalImzasi = (materyaller) => imza(materyaller
    .map((m) => kimlik(m._id) + ":" + kimlik(m.aktifIslemeId)).sort().join("|"));

const dersDurumunuGetir = (x, kullaniciId, dersId) => x.DersModel.findOne({
    _id: dersId, kullaniciId, temizleniyor: { $ne: true },
}).lean();

const tumKartlar = (x, kullaniciId, dersId) => x.KartModel.find({ kullaniciId, dersId })
    .sort({ createdAt: 1, _id: 1 }).lean();

const kartKaynaklariniGetir = async (x, kullaniciId, dersId) => {
    const harita = await x.HaritaModel.findOne({
        kullaniciId, dersId, durum: "hazir",
    }).select("anaKonular").lean();
    if (!harita?.anaKonular?.length) {
        throw new HaritaKartiHatasi("Dersin hazır konu haritası bulunamadı.");
    }
    const materyaller = await x.MateryalModel.find({
        kullaniciId, dersId, durum: "hazir", aktifIslemeId: { $ne: null },
    }).select("_id aktifIslemeId dosyaAdi orijinalDosyaAdi").lean();
    if (!materyaller.length) {
        throw new HaritaKartiHatasi("Onaylanmış ders metni bulunamadı.");
    }
    const parcalar = await x.ParcaModel.find({
        kullaniciId, dersId,
        $or: materyaller.map((materyal) => ({
            materyalId: materyal._id, islemeId: materyal.aktifIslemeId,
        })),
    }).select("materyalId parcaIndex icerik")
        .sort({ materyalId: 1, parcaIndex: 1 }).lean();
    if (!parcalar.length) {
        throw new HaritaKartiHatasi("Ders dosyalarından çıkarılmış metin bulunamadı.");
    }
    const { agac, konular } = konuHaritasiniOzetle(harita);
    const gruplar = x.gruplama(parcalar, materyaller);
    if (!gruplar.length) {
        throw new HaritaKartiHatasi("Ders dosyalarının metni boş.");
    }
    const kaynakImzasi = materyalImzasi(materyaller);
    const surum = imza(kaynakImzasi + ":" + JSON.stringify(agac));
    const liste = gruplar.map((g, i) => ({
        ...g,
        imza: imza(surum + ":" + i + ":" + g.metin),
        sira: i + 1,
    }));
    return { agac, konular, gruplar: liste, surum, kaynakImzasi, materyaller };
};

const kartlariKaydet = async (x, { kullaniciId, dersId, token, kartlar }) => {
    const sahip = await x.DersModel.findOne({
        _id: dersId, kullaniciId, kartUretimToken: token,
        temizleniyor: { $ne: true },
    }).select("_id").lean();
    if (!sahip) {
        throw new HaritaKartiHatasi("Kart üretim kilidi kaybedildi.", 409, "KART_KILIDI_KAYBEDILDI");
    }
    if (!kartlar.length) return;
    const islemler = kartlar.map((kart) => {
        const soruKimligi = imza(kart.soru.trim().toLocaleLowerCase("tr-TR"));
        return {
            updateOne: {
                filter: { kullaniciId, dersId, konuId: kart.konuId, soruKimligi },
                update: { $setOnInsert: { kullaniciId, dersId, ...kart, soruKimligi } },
                upsert: true,
            },
        };
    });
    await x.KartModel.bulkWrite(islemler, { ordered: false });
};

const kaydet = async (x, { kullaniciId, dersId, token, imzaliGrup, kartlar }) => {
    await kartlariKaydet(x, { kullaniciId, dersId, token, kartlar });
    const guncelle = await x.DersModel.updateOne({
        _id: dersId, kullaniciId, kartUretimToken: token,
        temizleniyor: { $ne: true },
    }, {
        $addToSet: { kartHaritaIslenenGrupImzalari: imzaliGrup.imza },
        $currentDate: { kartUretimSonYenileme: true },
    });
    if ((guncelle.matchedCount ?? guncelle.n) !== 1) {
        throw new HaritaKartiHatasi("Kart üretim ilerlemesi kaydedilemedi.", 409);
    }
};

/**
 * Yeni varsayılan oluşturma yolu: ders metninin TAMAMI, her partide TAM harita.
 * Kart adedine 4/6 alt hedef verilmez; yalnızca konu başına 8 üst sınır.
 * Bir grup başarısızsa o grup işlenmiş sayılmaz, başarıyla üretilenler hemen
 * kaydedilir. Tekrar deneme sadece başarısız metin gruplarını işler.
 */
export const haritaTabanliKartlariOlustur = async ({ kullaniciId, dersId }, d = {}) => {
    const baslangic = Date.now();
    const x = sorgu(d);
    const ders = await dersDurumunuGetir(x, kullaniciId, dersId);
    if (!ders) throw new HaritaKartiHatasi("Ders bulunamadı.", 404, "DERS_BULUNAMADI");
    if (!ders.materyallerOnaylandi) throw new HaritaKartiHatasi("Önce ders materyallerini onaylayın.");
    const token = new mongoose.Types.ObjectId();
    const kilit = await kartKilidiniAl(x.DersModel, kullaniciId, dersId, token);
    if (!kilit) {
        throw new HaritaKartiHatasi(
            "Kart üretimi bu ders için devam ediyor.", 409, "KART_URETIM_DEVAM_EDIYOR"
        );
    }
    try {
        const guncelDers = await dersDurumunuGetir(x, kullaniciId, dersId);
        if (!guncelDers) throw new HaritaKartiHatasi("Ders bulunamadı.", 404);
        const { agac, konular, gruplar, surum, kaynakImzasi, materyaller } =
            await kartKaynaklariniGetir(x, kullaniciId, dersId);

        if (guncelDers.kartHaritaSurumImzasi &&
            guncelDers.kartHaritaSurumImzasi !== surum) {
            throw new HaritaKartiHatasi(
                "Ders materyalleri veya konu haritası değişti. Eski kartlar korunuyor.",
                409, "KART_KAYNAK_SURUMU_DEGISTI"
            );
        }
        if (guncelDers.kartKaynakSurumImzasi &&
            guncelDers.kartKaynakSurumImzasi !== kaynakImzasi) {
            throw new HaritaKartiHatasi(
                "Ders materyalleri değişti. Eski kartlar korunuyor.",
                409, "KART_KAYNAK_SURUMU_DEGISTI"
            );
        }
        if (!guncelDers.kartHaritaSurumImzasi) {
            const r = await x.DersModel.updateOne({
                _id: dersId, kullaniciId, kartUretimToken: token,
            }, {
                $set: {
                    kartHaritaSurumImzasi: surum,
                    kartKaynakSurumImzasi: kaynakImzasi,
                    kartHaritaToplamGrupSayisi: gruplar.length,
                    kartHaritaIslenenGrupImzalari: [],
                    kartHaritaEksikKapsamGruplari: [],
                    kartHaritaKapsamTamamlananGrupImzalari: [],
                    kartHaritaZenginlestirmeTamamlandi: false,
                    kartHaritaKapsamDenetimSurumu: 2,
                    kartHaritaTamamlandi: false,
                },
            });
            if ((r.matchedCount ?? r.n) !== 1) {
                throw new HaritaKartiHatasi("Kart üretim durumu başlatılamadı.", 409);
            }
        }

        // Önceki kapsam denetimi kartlar üretirken boş "eksik bilgi" listesine
        // güvendiğinden eksik konuları kaçırabildi. Eski 58/115 kartları
        // DEĞİŞTİRMEDEN, yalnızca bağımsız kontrol turunu bir kez aç.
        if (guncelDers.kartHaritaSurumImzasi &&
            Number(guncelDers.kartHaritaKapsamDenetimSurumu || 0) < 2) {
            const surumGecisi = await x.DersModel.updateOne({
                _id: dersId, kullaniciId, kartUretimToken: token,
                temizleniyor: { $ne: true },
            }, {
                $set: {
                    kartHaritaKapsamDenetimSurumu: 2,
                    kartHaritaZenginlestirmeTamamlandi: false,
                    kartHaritaKapsamTamamlananGrupImzalari: [],
                },
            });
            if ((surumGecisi.matchedCount ?? surumGecisi.n) !== 1) {
                throw new HaritaKartiHatasi("Kapsam sürümü güncellenemedi.", 409);
            }
        }

        const kaydedilen = new Set(guncelDers.kartHaritaIslenenGrupImzalari || []);
        const kalan = gruplar.filter((grup) => !kaydedilen.has(grup.imza));
        const mevcutKartlar = await tumKartlar(x, kullaniciId, dersId);
        const gorulenKartlar = [...mevcutKartlar];
        let yeniKartSayisi = 0;
        let gecersizKartSayisi = 0;
        let tekrarSayisi = 0;
        let basarisizGrupSayisi = 0;
        let ilkHata = null;
        let kotaAsildi = false;
        let sira = 0;
        // Gemini istekleri en fazla iki eşzamanlıdır. Veritabanı yazımı
        // sıralıdır: paralel gruplar aynı kartı iki kez ekleyemez.
        let kayitSirasi = Promise.resolve();
        const siraliKaydet = (fn) => {
            const islem = kayitSirasi.then(fn);
            kayitSirasi = islem.catch(() => {});
            return islem;
        };
        const isci = async () => {
            while (sira < kalan.length && !kotaAsildi) {
                const grup = kalan[sira++];
                const t0 = Date.now();
                try {
                    const girdi = {
                        dersAdi: guncelDers.dersAdi,
                        konuHaritasi: agac,
                        grup,
                        oncekiSorular: mevcutKartlar,
                    };
                    let cevap;
                    try {
                        cevap = await x.uret(girdi);
                    } catch (hata) {
                        if (Number(hata?.status) !== 502) throw hata;
                        // Kesilmiş JSON oluştuysa bir kez daha, daha kısa cevap iste.
                        // Kota hatasında hiçbir ek istek yapılmaz.
                        console.warn("[CalismaKartlari][harita] JSON kesildi, kısa yanıt deneniyor", {
                            grup: grup.sira, status: 502,
                        });
                        cevap = await x.uret({ ...girdi, kartLimiti: 24 });
                    }
                    await siraliKaydet(async () => {
                        const kontrol = haritaKartlariniDogrula({
                            hamKartlar: cevap?.kartlar,
                            konular,
                            kaynaklar: grup.kaynaklar,
                            oncekiKartlar: gorulenKartlar,
                            ayrinti: true,
                        });
                        // Gemini kart döndürdüğü halde tamamı geçersizse kaydetme,
                        // bu metin bölümünün bir kez yeniden denenebilmesini sağla.
                        if ((cevap?.kartlar?.length || 0) > 0 && !kontrol.kartlar.length &&
                            kontrol.gecersiz > 0 && !kontrol.tekrar && !kontrol.limit) {
                            throw new HaritaKartiHatasi(
                                "Gemini konu/kaynak kimliklerini hatalı döndürdü.", 502,
                                "KART_GECERSIZ_YANIT"
                            );
                        }
                        await kaydet(x, {
                            kullaniciId, dersId, token, imzaliGrup: grup,
                            kartlar: kontrol.kartlar,
                        });
                        gorulenKartlar.push(...kontrol.kartlar);
                        yeniKartSayisi += kontrol.kartlar.length;
                        gecersizKartSayisi += kontrol.gecersiz;
                        tekrarSayisi += kontrol.tekrar;
                        kaydedilen.add(grup.imza);
                        console.info("[CalismaKartlari][harita] Metin grubu kaydedildi", {
                            grup: grup.sira, toplamGrup: gruplar.length,
                            gelenKart: cevap?.kartlar?.length || 0,
                            kaydedilenKart: kontrol.kartlar.length,
                            gecersizKart: kontrol.gecersiz, tekrar: kontrol.tekrar,
                            sureMs: Date.now() - t0,
                        });
                    });
                } catch (hata) {
                    if (Number(hata?.status) === 429) kotaAsildi = true;
                    basarisizGrupSayisi += 1;
                    if (!ilkHata) ilkHata = hata;
                    console.warn("[CalismaKartlari][harita] Grup işlenemedi", {
                        grup: grup.sira, toplamGrup: gruplar.length,
                        status: Number(hata?.status) || 0,
                        kod: String(hata?.kod || "BILINMIYOR").slice(0, 64),
                        kotaTuru: String(hata?.tanilama?.kotaTuru || "bilinmiyor").slice(0, 20),
                        sureMs: Date.now() - t0,
                    });
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(2, kalan.length) }, () => isci()));

        // Kaynak sürümü üretim sırasında değişmediyse tamamlandı olarak işaretle.
        const guncelMateryaller = await x.MateryalModel.find({
            kullaniciId, dersId, durum: "hazir", aktifIslemeId: { $ne: null },
        }).select("_id aktifIslemeId").lean();
        if (materyalImzasi(guncelMateryaller) !== kaynakImzasi) {
            throw new HaritaKartiHatasi(
                "Ders materyali üretim sırasında değişti. Kaydedilen kartlar korunuyor.",
                409, "KART_KAYNAK_SURUMU_DEGISTI"
            );
        }
        const tamamlandi = gruplar.every((grup) => kaydedilen.has(grup.imza));
        const finalR = await x.DersModel.updateOne({
            _id: dersId, kullaniciId, kartUretimToken: token,
        }, {
            $set: { kartHaritaTamamlandi: tamamlandi, kartHaritaToplamGrupSayisi: gruplar.length },
            $currentDate: { kartUretimSonYenileme: true },
        });
        if ((finalR.matchedCount ?? finalR.n) !== 1) {
            throw new HaritaKartiHatasi("Kart üretim durumu güncellenemedi.", 409);
        }
        // Gemini'nin ilk kart üretimi sırasında bildirdiği boş "eksik bilgi"
        // listesi yeterlilik kanıtı değildir. İLK üretim ve bağımsız içerik
        // incelemesi AYRI Gemini istekleridir. Her ders metni grubu yalnızca
        // bir kez denetlenir. 1 veya 6 kartlı konu fark etmeksizin, yeni
        // önemli bilgi yoksa hiç kart eklenmez; üst sınır 8 korunur.
        let zenginlestirmeTamamlandi = Boolean(
            guncelDers.kartHaritaZenginlestirmeTamamlandi &&
            Number(guncelDers.kartHaritaKapsamDenetimSurumu || 0) >= 2
        );
        let zenginlestirmeYeniKartSayisi = 0;
        let kapsamBekleyen = 0;
        if (tamamlandi && !zenginlestirmeTamamlandi && !kotaAsildi) {
            const sonDers = await dersDurumunuGetir(x, kullaniciId, dersId);
            const tamamlanan = new Set(
                Number(guncelDers.kartHaritaKapsamDenetimSurumu || 0) >= 2
                    ? (sonDers.kartHaritaKapsamTamamlananGrupImzalari || [])
                    : []
            );
            const bekleyen = gruplar.filter((grup) => !tamamlanan.has(grup.imza));
            const oncekiler = await tumKartlar(x, kullaniciId, dersId);
            let basarisiz = false;
            let auditIndex = 0;
            let auditKayitSirasi = Promise.resolve();
            const auditKaydet = (fn) => {
                const islem = auditKayitSirasi.then(fn);
                auditKayitSirasi = islem.catch(() => {});
                return islem;
            };
            const kontrolIscisi = async () => {
                while (auditIndex < bekleyen.length && !kotaAsildi) {
                    const grup = bekleyen[auditIndex++];
                    const t0 = Date.now();
                    try {
                        const cevap = await x.uret({
                            dersAdi: guncelDers.dersAdi,
                            konuHaritasi: agac,
                            grup,
                            oncekiSorular: oncekiler,
                            kapsamKontrolu: true,
                            kartLimiti: 24,
                        });
                        if (!Array.isArray(cevap?.kartlar)) {
                            throw new HaritaKartiHatasi(
                                "Kapsam kontrolü geçerli kart listesi döndürmedi.", 502,
                                "KAPSAM_GECERSIZ_YANIT"
                            );
                        }
                        await auditKaydet(async () => {
                            const kontrol = haritaKartlariniDogrula({
                                hamKartlar: cevap.kartlar,
                                konular, kaynaklar: grup.kaynaklar,
                                oncekiKartlar: oncekiler, ayrinti: true,
                            });
                            // Tümü geçersiz bir yanıtı tamamlandı sanma.
                            if (cevap.kartlar.length && !kontrol.kartlar.length &&
                                kontrol.gecersiz && !kontrol.tekrar && !kontrol.limit) {
                                throw new HaritaKartiHatasi(
                                    "Kapsam kontrolü yanlış konu/kaynak kodları döndürdü.",
                                    502, "KAPSAM_GECERSIZ_YANIT"
                                );
                            }
                            await kartlariKaydet(x, {
                                kullaniciId, dersId, token, kartlar: kontrol.kartlar,
                            });
                            oncekiler.push(...kontrol.kartlar);
                            zenginlestirmeYeniKartSayisi += kontrol.kartlar.length;
                            const sonuc = await x.DersModel.updateOne({
                                _id: dersId, kullaniciId, kartUretimToken: token,
                                temizleniyor: { $ne: true },
                            }, {
                                $addToSet: {
                                    kartHaritaKapsamTamamlananGrupImzalari: grup.imza,
                                },
                            });
                            if ((sonuc.matchedCount ?? sonuc.n) !== 1) {
                                throw new HaritaKartiHatasi(
                                    "Kapsam denetimi ilerlemesi kaydedilemedi.", 409
                                );
                            }
                            tamamlanan.add(grup.imza);
                            console.info("[CalismaKartlari][kapsam] Bağımsız grup kontrolü", {
                                grup: grup.sira, toplamGrup: gruplar.length,
                                adayKart: cevap.kartlar.length,
                                eklenenKart: kontrol.kartlar.length,
                                gecersizKart: kontrol.gecersiz,
                                tekrarKart: kontrol.tekrar,
                                sureMs: Date.now() - t0,
                            });
                        });
                    } catch (hata) {
                        basarisiz = true;
                        if ([429, 503].includes(Number(hata?.status))) kotaAsildi = true;
                        console.warn("[CalismaKartlari][kapsam] İnceleme tamamlanamadı", {
                            grup: grup.sira, toplamGrup: gruplar.length,
                            status: Number(hata?.status) || 0,
                            kod: String(hata?.kod || "BILINMIYOR").slice(0, 64),
                            sureMs: Date.now() - t0,
                        });
                    }
                }
            };
            await Promise.all(Array.from(
                { length: Math.min(2, bekleyen.length) }, () => kontrolIscisi()
            ));
            kapsamBekleyen = gruplar.filter((g) => !tamamlanan.has(g.imza)).length;
            zenginlestirmeTamamlandi = !basarisiz && kapsamBekleyen === 0;
            if (zenginlestirmeTamamlandi) {
                const sonuc = await x.DersModel.updateOne({
                    _id: dersId, kullaniciId, kartUretimToken: token,
                    temizleniyor: { $ne: true },
                }, {
                    $set: {
                        kartHaritaKapsamDenetimSurumu: 2,
                        kartHaritaZenginlestirmeTamamlandi: true,
                    },
                });
                if ((sonuc.matchedCount ?? sonuc.n) !== 1) {
                    throw new HaritaKartiHatasi("Kapsam denetimi durumu kaydedilemedi.", 409);
                }
            }
            console.info("[CalismaKartlari][kapsam] Ders denetimi", {
                toplamGrup: gruplar.length, kalanGrup: kapsamBekleyen,
                yeniKart: zenginlestirmeYeniKartSayisi,
                tamamlandi: zenginlestirmeTamamlandi,
            });
        }
        const kartlar = await tumKartlar(x, kullaniciId, dersId);
        const kartliKonular = new Set(kartlar.map((kart) => String(kart.konuId)));
        const res = {
            kartlar,
            tamamlandi: tamamlandi && zenginlestirmeTamamlandi,
            haritaTabanliTamamlandi: tamamlandi && zenginlestirmeTamamlandi,
            kapsamKontroluTamamlandi: zenginlestirmeTamamlandi,
            kapsamKontroluBekleyenGrupSayisi: kapsamBekleyen,
            kapsamKontroluYeniKartSayisi: zenginlestirmeYeniKartSayisi,
            toplamKonuSayisi: konular.length,
            tamamlananKonuSayisi: konular.filter((konu) => kartliKonular.has(konu.konuId)).length,
            atlananKonuSayisi: tamamlandi
                ? konular.filter((konu) => !kartliKonular.has(konu.konuId)).length : 0,
            toplamGrupSayisi: gruplar.length,
            islenenGrupSayisi: kaydedilen.size,
            yeniKartSayisi: yeniKartSayisi + zenginlestirmeYeniKartSayisi,
            gecersizKartSayisi, tekrarSayisi,
            basarisizGrupSayisi,
            sureMs: Date.now() - baslangic,
        };
        console.info("[CalismaKartlari][harita] Ders üretimi", {
            toplamKonu: konular.length,
            toplamKart: kartlar.length,
            yeniKart: yeniKartSayisi + zenginlestirmeYeniKartSayisi,
            tamamlandi: res.tamamlandi, basarisizGrup: basarisizGrupSayisi,
            toplamSureMs: res.sureMs,
        });
        // Tek bir HTTP isteğinde tamamlanamayan parçalar için öğrenciye
        // teknik hata gösterme; saklı başarılar ve devam et seçeneği sun.
        if (!tamamlandi && !kartlar.length && ilkHata && basarisizGrupSayisi === kalan.length) {
            // Yanıt yine de 202: tekrar denenebilir ve hata terminalde açıklanır.
            res.yenidenDenenebilir = true;
        }
        return res;
    } finally {
        await kartKilidiniBirak(x.DersModel, kullaniciId, dersId, token);
    }
};

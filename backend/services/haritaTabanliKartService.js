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

const kaydet = async (x, { kullaniciId, dersId, token, imzaliGrup, kartlar }) => {
    const sahip = await x.DersModel.findOne({
        _id: dersId, kullaniciId, kartUretimToken: token,
        temizleniyor: { $ne: true },
    }).select("_id").lean();
    if (!sahip) throw new HaritaKartiHatasi("Kart üretim kilidi kaybedildi.", 409, "KART_KILIDI_KAYBEDILDI");
    if (kartlar.length) {
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
    }
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
                    kartHaritaTamamlandi: false,
                },
            });
            if ((r.matchedCount ?? r.n) !== 1) {
                throw new HaritaKartiHatasi("Kart üretim durumu başlatılamadı.", 409);
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
        const kartlar = await tumKartlar(x, kullaniciId, dersId);
        const kartliKonular = new Set(kartlar.map((kart) => String(kart.konuId)));
        const res = {
            kartlar, tamamlandi, haritaTabanliTamamlandi: tamamlandi,
            toplamKonuSayisi: konular.length,
            tamamlananKonuSayisi: konular.filter((konu) => kartliKonular.has(konu.konuId)).length,
            atlananKonuSayisi: tamamlandi
                ? konular.filter((konu) => !kartliKonular.has(konu.konuId)).length : 0,
            toplamGrupSayisi: gruplar.length,
            islenenGrupSayisi: kaydedilen.size,
            yeniKartSayisi, gecersizKartSayisi, tekrarSayisi,
            basarisizGrupSayisi,
            sureMs: Date.now() - baslangic,
        };
        console.info("[CalismaKartlari][harita] Ders üretimi", {
            toplamKonu: konular.length,
            toplamKart: kartlar.length,
            yeniKart: yeniKartSayisi,
            tamamlandi, basarisizGrup: basarisizGrupSayisi,
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

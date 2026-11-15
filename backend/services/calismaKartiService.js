import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import CalismaKarti from "../models/CalismaKarti.js";
import { geminiIleCalismaKartiPartisiUret, geminiIleHizliCalismaKartlariUret } from "./geminiService.js";
import { konuIcinParcalariSirala } from "./testService.js";
import { dengeliOzetParcalariniSec } from "./dersOzetiService.js";
import { kartKilidiniAl, kartKilidiniBirak } from "./calismaKartiLock.js";
import {
    konuListesiOlustur,
    makulKartSayisiniBelirle,
    konuKotalariniBelirle,
    partiKaynaklariniOlustur,
    kartAdaylariniDogrula,
    kaynakMetnindenYedekKartOlustur,
    sinirliParalelKartPartileri,
    tekKartliKonulariOnarimIcinSec,
} from "./kartUretimPlanlama.mjs";

export {
    konuListesiOlustur,
    makulKartSayisiniBelirle,
    konuKotalariniBelirle,
} from "./kartUretimPlanlama.mjs";

const PARTI_KONU_SAYISI = 3;
const PARTI_KONU_KARAKTER_BUTCESI = 4500;

export class CalismaKartiHatasi extends Error {
    constructor(message, status = 422, kod = "KART_HATASI") {
        super(message);
        this.status = status;
        this.kod = kod;
    }
}

const deps = (d = {}) => ({
    DersModel: d.DersModel || Ders,
    HaritaModel: d.HaritaModel || KonuHaritasi,
    MateryalModel: d.MateryalModel || Materyal,
    ParcaModel: d.ParcaModel || MetinParcasi,
    KartModel: d.KartModel || CalismaKarti,
    uret: d.uret || geminiIleCalismaKartiPartisiUret,
    hizliUret: d.hizliUret || geminiIleHizliCalismaKartlariUret,
    parcaSec: d.parcaSec || dengeliOzetParcalariniSec,
    eslestir: d.eslestir || konuIcinParcalariSirala,
});

const dersGetir = async (kullaniciId, dersId, d) => {
    const ders = await d.DersModel.findOne({
        _id: dersId,
        kullaniciId,
        temizleniyor: { $ne: true },
    }).lean();
    if (!ders) {
        throw new CalismaKartiHatasi(
            "Ders bulunamadı veya bu ders için yetkiniz yok.",
            404,
            "DERS_BULUNAMADI"
        );
    }
    return ders;
};

const kartlariGetir = (x, kullaniciId, dersId) => (
    x.KartModel.find({ kullaniciId, dersId })
        .sort({ createdAt: 1, _id: 1 }).lean()
);

const uretimDurumunuOlustur = (ders, kartlar) => {
    const hedef = ders?.kartUretimHedefKonuIds || [];
    const tamamlanan = new Set(ders?.kartTamamlananKonuIds || []);
    const atlanan = new Set(ders?.kartAtlananKonuIds || []);
    const toplamKonuSayisi = hedef.length;
    const islenenKonuSayisi = hedef.filter((id) => tamamlanan.has(id) || atlanan.has(id)).length;
    const atlananKonuSayisi = hedef.filter((id) => atlanan.has(id)).length;
    return {
        kartlar,
        // Eski sistemde üretilmiş kartları değiştirmeden koru.
        tamamlandi: toplamKonuSayisi
            ? islenenKonuSayisi === toplamKonuSayisi
            : kartlar.length > 0,
        toplamKonuSayisi,
        tamamlananKonuSayisi: islenenKonuSayisi,
        atlananKonuSayisi,
        hizliUretimYapildi: Boolean(ders?.kartHizliUretimSurumImzasi &&
            ders.kartHizliUretimSurumImzasi === ders.kartKaynakSurumImzasi),
        haritaTabanliTamamlandi: Boolean(ders?.kartHaritaTamamlandi &&
            ders?.kartHaritaZenginlestirmeTamamlandi &&
            Number(ders?.kartHaritaKapsamDenetimSurumu || 0) >= 2),
        kapsamKontroluTamamlandi: Boolean(ders?.kartHaritaZenginlestirmeTamamlandi &&
            Number(ders?.kartHaritaKapsamDenetimSurumu || 0) >= 2),
        kapsamKontroluBekleyenGrupSayisi: ders?.kartHaritaTamamlandi &&
            (!ders?.kartHaritaZenginlestirmeTamamlandi ||
                Number(ders?.kartHaritaKapsamDenetimSurumu || 0) < 2)
            ? Math.max(0, Number(ders?.kartHaritaToplamGrupSayisi || 0) -
                (Number(ders?.kartHaritaKapsamDenetimSurumu || 0) >= 2
                    ? (ders?.kartHaritaKapsamTamamlananGrupImzalari || []).length
                    : 0))
            : 0,
        toplamGrupSayisi: Number(ders?.kartHaritaToplamGrupSayisi || 0),
        islenenGrupSayisi: (ders?.kartHaritaIslenenGrupImzalari || []).length,
    };
};

export const calismaKartlariDurumunuGetir = async ({ kullaniciId, dersId }, d = {}) => {
    const x = deps(d);
    const ders = await dersGetir(kullaniciId, dersId, x);
    const kartlar = await kartlariGetir(x, kullaniciId, dersId);
    return uretimDurumunuOlustur(ders, kartlar);
};

export const calismaKartlariniListele = async (girdi, d = {}) => (
    (await calismaKartlariDurumunuGetir(girdi, d)).kartlar
);

const kaynakSurumImzasi = (materyaller) => createHash("sha256")
    .update(materyaller.map((materyal) => (
        String(materyal._id) + ":" + String(materyal.aktifIslemeId)
    )).sort().join("|"))
    .digest("hex");

const hazirKaynaklariGetir = async ({ kullaniciId, dersId }, x) => {
    const harita = await x.HaritaModel.findOne({
        kullaniciId, dersId, durum: "hazir",
    }).select("anaKonular").lean();
    if (!harita?.anaKonular?.length) {
        throw new CalismaKartiHatasi("Hazır konu haritası bulunamadı.");
    }
    const materyaller = await x.MateryalModel.find({
        kullaniciId, dersId, durum: "hazir", aktifIslemeId: { $ne: null },
    }).select("_id aktifIslemeId dosyaAdi orijinalDosyaAdi").lean();
    if (!materyaller.length) {
        throw new CalismaKartiHatasi("İşlenmiş materyal bulunamadı.");
    }
    const parcalar = await x.ParcaModel.find({
        kullaniciId, dersId,
        $or: materyaller.map((materyal) => ({
            materyalId: materyal._id,
            islemeId: materyal.aktifIslemeId,
        })),
    }).select("materyalId parcaIndex icerik")
        .sort({ materyalId: 1, parcaIndex: 1 }).lean();
    if (!parcalar.length) {
        throw new CalismaKartiHatasi("İşlenmiş materyal metni bulunamadı.");
    }
    const konular = konuListesiOlustur(harita).map((konu) => {
        const eslesen = x.eslestir(parcalar, konu);
        return {
            ...konu,
            parcalar: eslesen,
            karakterSayisi: eslesen.reduce((toplam, parca) => (
                toplam + String(parca.icerik || "").length
            ), 0),
        };
    });
    const hedef = makulKartSayisiniBelirle({
        konuSayisi: konular.length,
        karakterSayisi: konular.reduce((toplam, konu) => toplam + konu.karakterSayisi, 0),
    });
    const kotalar = konuKotalariniBelirle(konular, hedef);
    if (!kotalar.length) {
        throw new CalismaKartiHatasi("Konularla eşleşen yeterli materyal içeriği bulunamadı.");
    }
    return { materyaller, kotalar, konular };
};

const islemSahibiniDogrula = async (x, kullaniciId, dersId, token) => {
    const guncel = await x.DersModel.findOne({
        _id: dersId, kullaniciId, temizleniyor: { $ne: true }, kartUretimToken: token,
    }).select("_id").lean();
    if (!guncel) {
        throw new CalismaKartiHatasi("Kart üretim işleminin sahipliği kaybedildi.", 409, "KART_KILIDI_KAYBEDILDI");
    }
};

export const calismaKartlariniOlustur = async ({ kullaniciId, dersId, azamiKonuSayisi = 3, yalnizcaKaynak = false }, d = {}) => {
    const x = deps(d);
    const ders = await dersGetir(kullaniciId, dersId, x);
    if (!ders.materyallerOnaylandi) {
        throw new CalismaKartiHatasi("Önce ders materyallerini onaylayın.");
    }

    const oncekiKartlar = await kartlariGetir(x, kullaniciId, dersId);
    // Önceki sürümün tamamlanmış kartlarını yeni bir üretime sokma.
    if (!ders.kartUretimHedefKonuIds?.length && oncekiKartlar.length) {
        return uretimDurumunuOlustur(ders, oncekiKartlar);
    }
    if (ders.kartUretimHedefKonuIds?.length &&
        ders.kartUretimHedefKonuIds.every((id) =>
            (ders.kartTamamlananKonuIds || []).includes(id) || (ders.kartAtlananKonuIds || []).includes(id))) {
        return uretimDurumunuOlustur(ders, oncekiKartlar);
    }

    const token = new mongoose.Types.ObjectId();
    const kilit = await kartKilidiniAl(x.DersModel, kullaniciId, dersId, token);
    if (!kilit) {
        throw new CalismaKartiHatasi(
            "Bu ders için kart üretimi devam ediyor. Aynı işlemi tekrar başlatmayın.",
            409,
            "KART_URETIM_DEVAM_EDIYOR"
        );
    }

    try {
        const kayitliKartlar = await kartlariGetir(x, kullaniciId, dersId);
        const kilitliDers = await dersGetir(kullaniciId, dersId, x);
        if (!kilitliDers.kartUretimHedefKonuIds?.length && kayitliKartlar.length) {
            return uretimDurumunuOlustur(kilitliDers, kayitliKartlar);
        }
        const { materyaller, kotalar } = await hazirKaynaklariGetir({ kullaniciId, dersId }, x);
        const imza = kaynakSurumImzasi(materyaller);
        let hedefIds = kilitliDers.kartUretimHedefKonuIds || [];
        let tamamlananIds = kilitliDers.kartTamamlananKonuIds || [];
        let atlananIds = kilitliDers.kartAtlananKonuIds || [];

        if (!hedefIds.length) {
            hedefIds = kotalar.map((konu) => String(konu.konuId));
            tamamlananIds = [];
            atlananIds = [];
            await x.DersModel.updateOne({
                _id: dersId, kullaniciId, kartUretimToken: token,
            }, {
                $set: {
                    kartUretimHedefKonuIds: hedefIds,
                    kartTamamlananKonuIds: [],
                    kartAtlananKonuIds: [],
                    kartKaynakSurumImzasi: imza,
                },
            });
        } else if (kilitliDers.kartKaynakSurumImzasi !== imza) {
            throw new CalismaKartiHatasi(
                "Materyaller üretim sırasında değişmiş. Mevcut kartlar korundu; dersinizi kontrol edin.",
                409,
                "KART_MATERYAL_SURUMU_DEGISTI"
            );
        }

        const tamamlananSeti = new Set([...tamamlananIds, ...atlananIds]);
        const kotalarMap = new Map(kotalar.map((konu) => [String(konu.konuId), konu]));
        const kalanKonular = hedefIds.filter((id) => !tamamlananSeti.has(id))
            .map((id) => kotalarMap.get(id))
            .filter(Boolean);
        const partiBoyutu = Number.isInteger(azamiKonuSayisi)
            ? Math.max(1, Math.min(PARTI_KONU_SAYISI, azamiKonuSayisi))
            : PARTI_KONU_SAYISI;
        const parti = kalanKonular.slice(0, partiBoyutu);
        if (!parti.length) {
            throw new CalismaKartiHatasi(
                "Konu haritası değişmiş. Önceden üretilen kartlar korundu.",
                409,
                "KART_KONU_HARITASI_DEGISTI"
            );
        }

        const adlar = new Map(materyaller.map((materyal) => [
            String(materyal._id), materyal.orijinalDosyaAdi || materyal.dosyaAdi,
        ]));
        const kaynakliKonular = partiKaynaklariniOlustur(
            parti, adlar, x.parcaSec, PARTI_KONU_KARAKTER_BUTCESI
        );
        // Geçersiz Gemini JSON'u veya eksik kart listesi sonsuz retry döngüsüne neden
        // olmamalı. Yalnızca aynı kaynakta geçen açıklayıcı cümleden yedek kart oluştur.
        let yanit = { kartlar: [] };
        if (kaynakliKonular.length && !yalnizcaKaynak) {
            try {
                yanit = await x.uret({ dersAdi: kilitliDers.dersAdi, konular: kaynakliKonular });
            } catch (hata) {
                if (![502, 503, 504].includes(Number(hata?.status))) throw hata;
                console.warn("[CalismaKartlari] Gemini JSON doğrulanamadı; kaynak tabanlı yedek kullanılıyor.", {
                    kod: hata.kod || "GEMINI_502",
                });
            }
        }
        const mevcutSorular = new Set(kayitliKartlar.map((kart) => (
            String(kart.konuId) + ":" + String(kart.soru).toLocaleLowerCase("tr-TR")
        )));
        const adaylar = kartAdaylariniDogrula({
            cevap: yanit, konular: kaynakliKonular, mevcutSorular,
        });
        const kartliKonular = new Set(adaylar.map((kart) => String(kart.konuId)));
        for (const konu of kaynakliKonular) {
            if (kartliKonular.has(String(konu.konuId))) continue;
            const yedek = kaynakMetnindenYedekKartOlustur(konu, mevcutSorular);
            if (yedek) {
                adaylar.push(yedek);
                kartliKonular.add(String(konu.konuId));
            }
        }
        // Kaynaktan güvenilir bir cümle bulunamadıysa konu atlanır ve kullanıcıya
        // sayısı bildirilir; uydurma kart veya bitmeyen 502 tekrarları üretilmez.

        const guncelMateryaller = await x.MateryalModel.find({
            kullaniciId, dersId, durum: "hazir", aktifIslemeId: { $ne: null },
        }).select("_id aktifIslemeId").lean();
        if (kaynakSurumImzasi(guncelMateryaller) !== imza) {
            throw new CalismaKartiHatasi(
                "Materyal sürümü değişti. Kart üretimini yeniden deneyin.",
                409,
                "KART_MATERYAL_SURUMU_DEGISTI"
            );
        }
        await islemSahibiniDogrula(x, kullaniciId, dersId, token);

        // Retry halinde aynı soru ikinci kez eklenmez.
        if (adaylar.length) await x.KartModel.bulkWrite(adaylar.map((kart) => {
            const soruKimligi = createHash("sha256")
                .update(kart.soru.toLocaleLowerCase("tr-TR")).digest("hex");
            return {
                updateOne: {
                    filter: { kullaniciId, dersId, konuId: kart.konuId, soruKimligi },
                    update: { $setOnInsert: { kullaniciId, dersId, ...kart, soruKimligi } },
                    upsert: true,
                },
            };
        }), { ordered: false });

        // Gemini bazen partideki tüm konular için kart dönmeyebilir.
        // Sadece en az bir doğrulanmış kart üretilen konuları tamamlandı say.
        const partiIds = [...new Set(adaylar.map((kart) => String(kart.konuId)))];
        const atlananPartiIds = parti.map((konu) => String(konu.konuId))
            .filter((id) => !partiIds.includes(id));
        const yenile = await x.DersModel.updateOne({
            _id: dersId, kullaniciId, kartUretimToken: token,
            temizleniyor: { $ne: true },
        }, {
            $addToSet: {
                kartTamamlananKonuIds: { $each: partiIds },
                kartAtlananKonuIds: { $each: atlananPartiIds },
            },
            $currentDate: { kartUretimSonYenileme: true },
        });
        if ((yenile.matchedCount ?? yenile.n) !== 1) {
            throw new CalismaKartiHatasi("Kart üretimi ilerlemesi kaydedilemedi.", 409);
        }
        const sonrakiKartlar = await kartlariGetir(x, kullaniciId, dersId);
        const tamamlananYeni = new Set([...tamamlananIds, ...atlananIds, ...partiIds, ...atlananPartiIds]);
        return {
            kartlar: sonrakiKartlar,
            tamamlandi: hedefIds.every((id) => tamamlananYeni.has(id)),
            toplamKonuSayisi: hedefIds.length,
            tamamlananKonuSayisi: hedefIds.filter((id) => tamamlananYeni.has(id)).length,
            atlananKonuSayisi: new Set([...atlananIds, ...atlananPartiIds]).size,
            partiGeminiKartiSayisi: adaylar.filter((kart) => kart.uretimYontemi === "gemini").length,
            partiKaynakKartiSayisi: adaylar.filter((kart) => kart.uretimYontemi === "kaynak").length,
        };
    } finally {
        await kartKilidiniBirak(x.DersModel, kullaniciId, dersId, token);
    }
};


/**
 * Gösterim/demo için tek HTTP çağrısıyla hızlı tam ders üretimi.
 * Tek Gemini çağrısı (en fazla 26s) veya kaynak tabanlı güvenli cevap.
 * Mevcut kartlar asla silinmez, zaten kaydedilmiş sorular tekrar yazılmaz.
 */
export const calismaKartlariniHizliOlustur = async ({ kullaniciId, dersId }, d = {}) => {
    const baslangic = Date.now();
    const x = deps(d);
    const ders = await dersGetir(kullaniciId, dersId, x);
    if (!ders.materyallerOnaylandi) {
        throw new CalismaKartiHatasi("Önce ders materyallerini onaylayın.");
    }
    const token = new mongoose.Types.ObjectId();
    const kilit = await kartKilidiniAl(x.DersModel, kullaniciId, dersId, token);
    if (!kilit) {
        throw new CalismaKartiHatasi(
            "Bu ders için kart üretimi zaten devam ediyor.", 409, "KART_URETIM_DEVAM_EDIYOR"
        );
    }
    try {
        const guncelDers = await dersGetir(kullaniciId, dersId, x);
        const eskiKartlar = await kartlariGetir(x, kullaniciId, dersId);
        const { materyaller, konular } = await hazirKaynaklariGetir({ kullaniciId, dersId }, x);
        const imza = kaynakSurumImzasi(materyaller);
        if (guncelDers.kartKaynakSurumImzasi && guncelDers.kartKaynakSurumImzasi !== imza) {
            throw new CalismaKartiHatasi(
                "Ders materyalleri değişti. Kayıtlı kartların kaynakları doğrulanmalıdır.",
                409, "KART_MATERYAL_SURUMU_DEGISTI"
            );
        }

        const adetler = new Map();
        const sorular = new Set();
        for (const kart of eskiKartlar) {
            const id = String(kart.konuId);
            adetler.set(id, (adetler.get(id) || 0) + 1);
            sorular.add(id + ":" + String(kart.soru).trim().toLocaleLowerCase("tr-TR"));
        }
        // Eski sürümde >25 konu için yapay "2 kart" sınırı vardı.
        // Artık her konu en fazla 8 kart taşır; içerik zenginliğine göre
        // yaklaşık 4-6 farklı soru hedeflenir, mevcut kartlar korunur.
        const uygun = konular.filter((konu) =>
            (adetler.get(String(konu.konuId)) || 0) < 8
        ).map((konu) => {
            const onceki = adetler.get(String(konu.konuId)) || 0;
            const hedef = konu.karakterSayisi >= 900 ? 6 : 4;
            return {
                ...konu,
                adet: Math.min(8 - onceki, Math.max(1, hedef - onceki)),
                oncekiSorular: eskiKartlar.filter((kart) => String(kart.konuId) === String(konu.konuId))
                    .map((kart) => String(kart.soru).slice(0, 140)).slice(0, 8),
            };
        }).filter((konu) => konu.adet > 0);
        const adlar = new Map(materyaller.map((m) => [
            String(m._id), m.orijinalDosyaAdi || m.dosyaAdi,
        ]));
        // En fazla ~2k karakter konu başına, modeli token ve hız açısından korur.
        const secilen = partiKaynaklariniOlustur(uygun, adlar, x.parcaSec, 2200);
        const kaynakHaritasi = new Map(secilen.map((konu) => [String(konu.konuId), konu.kaynaklar]));
        // Konu haritasında bulunan ancak kelime eşleşmesi bulunamayan konular da
        // modele başlık olarak gider; AI genel bilgi üretirse dosyadanmış gibi sunulmaz.
        const kaynakliKonular = uygun.map((konu) => ({
            konuId: konu.konuId,
            baslik: konu.baslik,
            adet: konu.adet,
            karakterSayisi: konu.karakterSayisi,
            oncekiSorular: konu.oncekiSorular,
            kaynaklar: kaynakHaritasi.get(String(konu.konuId)) || [],
        }));
        let apiBasarili = false;
        let aiKartiSayisi = 0;
        const adaylar = [];
        // Büyük JSON'lar (20 konu) eksik cevap üretiyordu. Artık ~5-6 konuluk
        // partiler sadece 2 eşzamanlı Gemini çağrısıyla işlenir.
        const partiler = [];
        const PARTI_BOYUTU = 6;
        for (let i = 0; i < kaynakliKonular.length; i += PARTI_BOYUTU) {
            partiler.push(kaynakliKonular.slice(i, i + PARTI_BOYUTU));
        }
        const baslangicParti = Date.now();
        const cevaplar = await sinirliParalelKartPartileri(partiler, async (parti, indeks) => {
            const t0 = Date.now();
            try {
                const yanit = await x.hizliUret({ dersAdi: guncelDers.dersAdi, konular: parti });
                console.info("[CalismaKartlari][hizli] Gemini parti tamamlandı", {
                    parti: indeks + 1, konuSayisi: parti.length,
                    hamKartSayisi: yanit?.kartlar?.length || 0,
                    sureMs: Date.now() - t0,
                });
                return yanit;
            } catch (hata) {
                console.warn("[CalismaKartlari][hizli] Gemini parti hatası", {
                    parti: indeks + 1, konuSayisi: parti.length,
                    status: Number(hata?.status) || 0,
                    kod: String(hata?.kod || "BILINMIYOR").slice(0, 80),
                    kotaTuru: String(hata?.tanilama?.kotaTuru || "bilinmiyor").slice(0, 30),
                    sureMs: Date.now() - t0,
                });
                throw hata;
            }
        }, 2);
        let basarisizPartiSayisi = 0;
        let kotaAsildi = false;
        for (let i = 0; i < partiler.length; i += 1) {
            const sonuc = cevaplar[i];
            if (sonuc.status !== "fulfilled") {
                basarisizPartiSayisi += 1;
                if (Number(sonuc.reason?.status) === 429) kotaAsildi = true;
                continue;
            }
            const dogrulanan = kartAdaylariniDogrula({
                cevap: sonuc.value, konular: partiler[i], mevcutSorular: sorular,
            });
            adaylar.push(...dogrulanan);
            aiKartiSayisi += dogrulanan.length;
            if (dogrulanan.length > 0) apiBasarili = true;
            console.info("[CalismaKartlari][hizli] Parti doğrulandı", {
                parti: i + 1, hamKartSayisi: sonuc.value?.kartlar?.length || 0,
                kabulEdilenKartSayisi: dogrulanan.length,
            });
        }
        console.info("[CalismaKartlari][hizli] Gemini aşaması", {
            toplamParti: partiler.length,
            basarisizParti: basarisizPartiSayisi,
            toplamGeminiKarti: aiKartiSayisi,
            sureMs: Date.now() - baslangicParti,
        });

        // Tek kartta kalan önemli konulara aynı buton tıklamasında ikinci,
        // küçük bir üretim hakkı ver. Kaynak/önceki soruları ekleyerek tekrarı önle.
        const eksikKonular = tekKartliKonulariOnarimIcinSec(
            kaynakliKonular, eskiKartlar, adaylar
        );
        const kalanSureMs = Date.now() - baslangic;
        // Gerçek kullanıcı için işlemin makul sürede kalması amacıyla
        // onarım isteklerini ve toplam süreyi sınırla.
        const azamiOnarimPartisi = kalanSureMs < 25_000 ? 4 : kalanSureMs < 48_000 ? 2 : 0;
        const onarimSecimi = kotaAsildi ? [] : eksikKonular.slice(0, azamiOnarimPartisi * 4);
        const onarimKaynaklari = partiKaynaklariniOlustur(
            onarimSecimi.map((konu) => ({
                ...konu,
                parcalar: konular.find((kaynak) => String(kaynak.konuId) === String(konu.konuId))?.parcalar || [],
            })),
            adlar, x.parcaSec, 3200
        );
        const kaynak2 = new Map(onarimKaynaklari.map((konu) => [String(konu.konuId), konu.kaynaklar]));
        const onarilacakKonular = onarimSecimi.map((konu) => ({
            ...konu,
            kaynaklar: kaynak2.get(String(konu.konuId)) || konu.kaynaklar,
        }));
        const onarimPartileri = [];
        for (let i = 0; i < onarilacakKonular.length; i += 4) {
            onarimPartileri.push(onarilacakKonular.slice(i, i + 4));
        }
        const onarimYanitlari = await sinirliParalelKartPartileri(
            onarimPartileri,
            async (parti, i) => {
                try {
                    return await x.hizliUret({
                        dersAdi: guncelDers.dersAdi,
                        konular: parti,
                    });
                } catch (hata) {
                    console.warn("[CalismaKartlari][onarim] Tek kartlı konu isteği başarısız", {
                        parti: i + 1,
                        status: Number(hata?.status) || 0,
                        kod: String(hata?.kod || "BILINMIYOR").slice(0, 80),
                    });
                    throw hata;
                }
            }, 2
        );
        for (let i = 0; i < onarimPartileri.length; i += 1) {
            const sonuc = onarimYanitlari[i];
            if (sonuc.status !== "fulfilled") {
                basarisizPartiSayisi += 1;
                continue;
            }
            const dogrulanan = kartAdaylariniDogrula({
                cevap: sonuc.value,
                konular: onarimPartileri[i],
                mevcutSorular: sorular,
            });
            adaylar.push(...dogrulanan);
            aiKartiSayisi += dogrulanan.length;
            if (dogrulanan.length > 0) apiBasarili = true;
        }
        const kalanTekKartli = tekKartliKonulariOnarimIcinSec(
            kaynakliKonular, eskiKartlar, adaylar
        ).length;
        console.info("[CalismaKartlari][hizli] Konu kapsamı onarımı", {
            baslangictaAzKartli: eksikKonular.length,
            hedeflenenKonu: onarilacakKonular.length,
            kalanAzKartli: kalanTekKartli,
            sureMs: Date.now() - baslangic,
        });

        // Gemini boş dönerse veya bazı konuları atlarsa, yalnızca gerçek kaynak
        // cümlesi bulunan ve önceden kartı olmayan konulara yerel bir kart ekle.
        const yeniKonuIdleri = new Set(adaylar.map((kart) => String(kart.konuId)));
        for (const konu of kaynakliKonular) {
            const id = String(konu.konuId);
            if (yeniKonuIdleri.has(id) || (adetler.get(id) || 0) > 0) continue;
            const yedek = kaynakMetnindenYedekKartOlustur(konu, sorular);
            if (yedek) {
                adaylar.push(yedek);
                yeniKonuIdleri.add(id);
            }
        }
        // İçeriğinde sadece "konuyu öğrenin" gibi talimatlar olan dosyalarla
        // öğretici kart sayısını yapay olarak şişirme.
        const guncelMateryaller = await x.MateryalModel.find({
            kullaniciId, dersId, durum: "hazir", aktifIslemeId: { $ne: null },
        }).select("_id aktifIslemeId").lean();
        if (kaynakSurumImzasi(guncelMateryaller) !== imza) {
            throw new CalismaKartiHatasi(
                "Materyal sürümü üretim sırasında değişti.", 409,
                "KART_MATERYAL_SURUMU_DEGISTI"
            );
        }
        await islemSahibiniDogrula(x, kullaniciId, dersId, token);
        if (adaylar.length) {
            await x.KartModel.bulkWrite(adaylar.map((kart) => {
                const soruKimligi = createHash("sha256")
                    .update(kart.soru.toLocaleLowerCase("tr-TR")).digest("hex");
                return {
                    updateOne: {
                        filter: { kullaniciId, dersId, konuId: kart.konuId, soruKimligi },
                        update: { $setOnInsert: {
                            kullaniciId, dersId, ...kart, soruKimligi,
                        } },
                        upsert: true,
                    },
                };
            }), { ordered: false });
        }
        const tumKartlar = await kartlariGetir(x, kullaniciId, dersId);
        const basariliHizliSurum = (aiKartiSayisi > 0 ||
            guncelDers.kartHizliUretimSurumImzasi === imza) && basarisizPartiSayisi === 0;
        console.info("[CalismaKartlari][hizli] Kayıt sonucu", {
            mevcutKart: eskiKartlar.length,
            yeniKart: tumKartlar.length - eskiKartlar.length,
            toplamKart: tumKartlar.length,
            secilenKonuSayisi: uygun.length,
            toplamSureMs: Date.now() - baslangic,
        });
        const kartliKonular = new Set(tumKartlar.map((kart) => String(kart.konuId)));
        const hedef = (guncelDers.kartUretimHedefKonuIds?.length
            ? guncelDers.kartUretimHedefKonuIds : konular.map((konu) => String(konu.konuId)));
        const tamamlanan = hedef.filter((id) => kartliKonular.has(String(id)));
        const atlanan = hedef.filter((id) => !kartliKonular.has(String(id)));
        // Tek tam güncelleme: eski kart kayıtlarına dokunmadan ders ilerlemesini düzelt.
        const guncelle = await x.DersModel.updateOne({
            _id: dersId, kullaniciId, kartUretimToken: token, temizleniyor: { $ne: true },
        }, {
            $set: {
                kartKaynakSurumImzasi: imza,
                kartHizliUretimSurumImzasi: basariliHizliSurum ? imza : "",
                kartUretimHedefKonuIds: hedef,
                kartTamamlananKonuIds: tamamlanan,
                kartAtlananKonuIds: atlanan,
            },
        });
        if ((guncelle.matchedCount ?? guncelle.n) !== 1) {
            throw new CalismaKartiHatasi("Kart üretim durumu kaydedilemedi.", 409);
        }
        return {
            kartlar: tumKartlar,
            tamamlandi: true,
            toplamKonuSayisi: hedef.length,
            tamamlananKonuSayisi: hedef.length,
            atlananKonuSayisi: atlanan.length,
            hizliUretimYapildi: basariliHizliSurum,
            yeniKartSayisi: tumKartlar.length - eskiKartlar.length,
            partiGeminiKartiSayisi: aiKartiSayisi,
            partiKaynakKartiSayisi: adaylar.length - aiKartiSayisi,
            geminiYanitiAlindi: apiBasarili,
            sureMs: Date.now() - baslangic,
        };
    } finally {
        await kartKilidiniBirak(x.DersModel, kullaniciId, dersId, token);
    }
};

export const calismaKartiDurumuGuncelle = async ({
    kullaniciId, dersId, kartId, goruldu, yildizli, zorluk,
}, d = {}) => {
    const x = deps(d);
    await dersGetir(kullaniciId, dersId, x);
    const set = {};
    if (typeof goruldu === "boolean") set.goruldu = goruldu;
    if (typeof yildizli === "boolean") set.yildizli = yildizli;
    if (["zor", "orta", "kolay"].includes(zorluk)) set.zorluk = zorluk;
    if (!Object.keys(set).length) {
        throw new CalismaKartiHatasi("Geçersiz kart durumu.", 400);
    }
    const kart = await x.KartModel.findOneAndUpdate(
        { _id: kartId, kullaniciId, dersId },
        { $set: set },
        { new: true, runValidators: true }
    ).lean();
    if (!kart) throw new CalismaKartiHatasi("Kart bulunamadı.", 404);
    return kart;
};

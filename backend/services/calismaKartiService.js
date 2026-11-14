import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import CalismaKarti from "../models/CalismaKarti.js";
import { geminiIleCalismaKartiPartisiUret } from "./geminiService.js";
import { konuIcinParcalariSirala } from "./testService.js";
import { dengeliOzetParcalariniSec } from "./dersOzetiService.js";
import { kartKilidiniAl, kartKilidiniBirak } from "./calismaKartiLock.js";
import {
    konuListesiOlustur,
    makulKartSayisiniBelirle,
    konuKotalariniBelirle,
    partiKaynaklariniOlustur,
    kartAdaylariniDogrula,
} from "./kartUretimPlanlama.mjs";

export {
    konuListesiOlustur,
    makulKartSayisiniBelirle,
    konuKotalariniBelirle,
} from "./kartUretimPlanlama.mjs";

const PARTI_KONU_SAYISI = 3;
const PARTI_KONU_KARAKTER_BUTCESI = 7000;

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
    parcaSec: d.parcaSec || dengeliOzetParcalariniSec,
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
    const toplamKonuSayisi = hedef.length;
    const tamamlananKonuSayisi = hedef.filter((id) => tamamlanan.has(id)).length;
    return {
        kartlar,
        // Eski sistemde üretilmiş kartları değiştirmeden koru.
        tamamlandi: toplamKonuSayisi
            ? tamamlananKonuSayisi === toplamKonuSayisi
            : kartlar.length > 0,
        toplamKonuSayisi,
        tamamlananKonuSayisi,
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
        const eslesen = konuIcinParcalariSirala(parcalar, konu);
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
    return { materyaller, kotalar };
};

const islemSahibiniDogrula = async (x, kullaniciId, dersId, token) => {
    const guncel = await x.DersModel.findOne({
        _id: dersId, kullaniciId, temizleniyor: { $ne: true }, kartUretimToken: token,
    }).select("_id").lean();
    if (!guncel) {
        throw new CalismaKartiHatasi("Kart üretim işleminin sahipliği kaybedildi.", 409, "KART_KILIDI_KAYBEDILDI");
    }
};

export const calismaKartlariniOlustur = async ({ kullaniciId, dersId }, d = {}) => {
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
        ders.kartUretimHedefKonuIds.every((id) => (ders.kartTamamlananKonuIds || []).includes(id))) {
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

        if (!hedefIds.length) {
            hedefIds = kotalar.map((konu) => String(konu.konuId));
            tamamlananIds = [];
            await x.DersModel.updateOne({
                _id: dersId, kullaniciId, kartUretimToken: token,
            }, {
                $set: {
                    kartUretimHedefKonuIds: hedefIds,
                    kartTamamlananKonuIds: [],
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

        const tamamlananSeti = new Set(tamamlananIds);
        const kotalarMap = new Map(kotalar.map((konu) => [String(konu.konuId), konu]));
        const kalanKonular = hedefIds.filter((id) => !tamamlananSeti.has(id))
            .map((id) => kotalarMap.get(id))
            .filter(Boolean);
        const parti = kalanKonular.slice(0, PARTI_KONU_SAYISI);
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
        if (!kaynakliKonular.length) {
            throw new CalismaKartiHatasi("Kart üretmek için doğrulanabilir konu kaynağı bulunamadı.");
        }

        // Bir HTTP isteğinde en fazla üç konu: küçük, kaynaklı tek Gemini çağrısı.
        const yanit = await x.uret({ dersAdi: kilitliDers.dersAdi, konular: kaynakliKonular });
        const mevcutSorular = new Set(kayitliKartlar.map((kart) => (
            String(kart.konuId) + ":" + String(kart.soru).toLocaleLowerCase("tr-TR")
        )));
        const adaylar = kartAdaylariniDogrula({
            cevap: yanit, konular: kaynakliKonular, mevcutSorular,
        });
        if (!adaylar.length) {
            throw new CalismaKartiHatasi(
                "Gemini bu kaynaklardan doğrulanabilir çalışma kartı üretmedi. Yeniden deneyebilirsiniz.",
                502,
                "KART_GECERSIZ_YANIT"
            );
        }

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
        await x.KartModel.bulkWrite(adaylar.map((kart) => {
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

        const partiIds = parti.map((konu) => String(konu.konuId));
        const yenile = await x.DersModel.updateOne({
            _id: dersId, kullaniciId, kartUretimToken: token,
            temizleniyor: { $ne: true },
        }, {
            $addToSet: { kartTamamlananKonuIds: { $each: partiIds } },
            $currentDate: { kartUretimSonYenileme: true },
        });
        if ((yenile.matchedCount ?? yenile.n) !== 1) {
            throw new CalismaKartiHatasi("Kart üretimi ilerlemesi kaydedilemedi.", 409);
        }
        const sonrakiKartlar = await kartlariGetir(x, kullaniciId, dersId);
        const tamamlananYeni = new Set([...tamamlananIds, ...partiIds]);
        return {
            kartlar: sonrakiKartlar,
            tamamlandi: hedefIds.every((id) => tamamlananYeni.has(id)),
            toplamKonuSayisi: hedefIds.length,
            tamamlananKonuSayisi: hedefIds.filter((id) => tamamlananYeni.has(id)).length,
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

import mongoose from "mongoose";
import { createHash } from "node:crypto";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import CalismaKarti from "../models/CalismaKarti.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { kartKilidiniAl, kartKilidiniBirak } from "./calismaKartiLock.js";
import { geminiIleDersKartlariUret } from "./geminiService.js";
import {
    dersKartlariniDogrula, kartDersKaynakImzasi, konuBaglantiliKartGruplariniOlustur,
} from "./dersKartPlanlama.mjs";

export class DersKartiHatasi extends Error {
    constructor(message, status = 422, kod = "DERS_KART_HATASI") {
        super(message);
        this.status = status; this.kod = kod;
    }
}
const sha = (x) => createHash("sha256").update(String(x)).digest("hex");
const bagimliliklar = (d = {}) => ({
    DersModel: d.DersModel || Ders,
    MateryalModel: d.MateryalModel || Materyal,
    ParcaModel: d.ParcaModel || MetinParcasi,
    KartModel: d.KartModel || CalismaKarti,
    KonuHaritasiModel: d.KonuHaritasiModel || KonuHaritasi,
    uret: d.uret || geminiIleDersKartlariUret,
});

const dersGetir = (x, kullaniciId, dersId) =>
    x.DersModel.findOne({ _id: dersId, kullaniciId,
        temizleniyor: { $ne: true } }).lean();

const kartGetir = (x, kullaniciId, dersId) =>
    x.KartModel.find({ kullaniciId, dersId }).sort({ createdAt: 1, _id: 1 }).lean();

export const dersKartKaynaklariniGetir = async (x, kullaniciId, dersId) => {
    const materyaller = await x.MateryalModel.find({
        kullaniciId, dersId, durum: "hazir", aktifIslemeId: { $ne: null },
    }).select("_id aktifIslemeId orijinalDosyaAdi dosyaAdi").lean();
    if (!materyaller.length) throw new DersKartiHatasi(
        "Ders için işlenmiş materyal bulunamadı.", 422, "KART_MATERYAL_YOK"
    );
    const parcalar = await x.ParcaModel.find({
        kullaniciId, dersId,
        $or: materyaller.map((m) =>
            ({ materyalId: m._id, islemeId: m.aktifIslemeId })),
    }).select("materyalId islemeId parcaIndex icerik")
        .sort({ materyalId: 1, parcaIndex: 1 }).lean();
    if (!parcalar.length) throw new DersKartiHatasi(
        "Ders materyallerinde işlenmiş metin bulunamadı.", 422, "KART_METIN_YOK"
    );
    const harita = await x.KonuHaritasiModel.findOne({ kullaniciId, dersId, durum: "hazir" })
        .select("anaKonular parcaAtamaSurumu parcaKonuAtamalari").lean();
    if (harita?.parcaAtamaSurumu !== 1) throw new DersKartiHatasi(
        "Dersin konu haritası ve metin bağlantıları hazır değil.", 422, "KART_KONU_KAYNAGI_EKSIK"
    );
    const gruplar = konuBaglantiliKartGruplariniOlustur(parcalar, materyaller, harita);
    if (!gruplar.length) throw new DersKartiHatasi(
        "Ders materyallerinde çalışma kartına uygun metin bulunamadı.", 422, "KART_METIN_BOS"
    );
    return { gruplar,
        surum: "konu-v2:" + sha(kartDersKaynakImzasi(materyaller, parcalar) + gruplar.map((g) => g.imza).join(":")) };
};

const yeniKartlariKaydet = async (x, { kullaniciId, dersId, token, kartlar }) => {
    const sahip = await x.DersModel.findOne({
        _id: dersId, kullaniciId, kartUretimToken: token,
        temizleniyor: { $ne: true },
    }).select("_id").lean();
    if (!sahip) throw new DersKartiHatasi(
        "Kart üretim kilidi kaybedildi.", 409, "KART_KILIDI_KAYBEDILDI"
    );
    if (!kartlar.length) return 0;
    const sonuc = await x.KartModel.bulkWrite(kartlar.map((kart) => {
        const soruKimligi = sha(kart.soru.trim().toLocaleLowerCase("tr-TR"));
        return { updateOne: {
            filter: { kullaniciId, dersId, soruKimligi, konuId: kart.konuId },
            // Tekrar kayıt güvenlidir; eski kart ve öğrenci işaretleri değişmez.
            update: { $setOnInsert: { kullaniciId, dersId, ...kart, soruKimligi } },
            upsert: true,
        } };
    }), { ordered: false });
    return sonuc.upsertedCount;
};

export const dersGeneliKartlariOlustur = async ({ kullaniciId, dersId }, d = {}) => {
    const bas = Date.now(), x = bagimliliklar(d);
    const ders = await dersGetir(x, kullaniciId, dersId);
    if (!ders) throw new DersKartiHatasi("Ders bulunamadı.", 404, "DERS_BULUNAMADI");
    if (!ders.materyallerOnaylandi) throw new DersKartiHatasi("Önce ders materyallerini onaylayın.");
    const token = new mongoose.Types.ObjectId();
    const kilit = await kartKilidiniAl(x.DersModel, kullaniciId, dersId, token);
    if (!kilit) throw new DersKartiHatasi(
        "Bu ders için kart üretimi devam ediyor.", 409, "KART_URETIM_DEVAM_EDIYOR"
    );
    const kalpAtisi = setInterval(() => {
        void x.DersModel.updateOne({
            _id: dersId, kullaniciId, kartUretimToken: token,
            temizleniyor: { $ne: true },
        }, { $currentDate: { kartUretimSonYenileme: true } }).catch(() => {});
    }, 30_000);
    kalpAtisi.unref?.();
    const durumuKaydet = async (guncelleme) => {
        const r = await x.DersModel.updateOne({
            _id: dersId, kullaniciId, kartUretimToken: token, temizleniyor: { $ne: true },
        }, guncelleme);
        if ((r.matchedCount ?? r.n) !== 1) throw new DersKartiHatasi(
            "Kart üretim kilidi kaybedildi.", 409, "KART_KILIDI_KAYBEDILDI"
        );
    };
    try {
        const kaynak = await dersKartKaynaklariniGetir(x, kullaniciId, dersId);
        const guncel = await dersGetir(x, kullaniciId, dersId);
        if (!guncel) throw new DersKartiHatasi("Ders bulunamadı.", 404);
        const islenen = new Set((guncel.kartDersIslenenGrupImzalari || [])
            .filter((imza) => kaynak.gruplar.some((g) => g.imza === imza)));
        await durumuKaydet({ $set: {
            kartDersSurumImzasi: kaynak.surum,
            kartDersIslenenGrupImzalari: [...islenen],
            kartDersToplamGrupSayisi: kaynak.gruplar.length,
            kartDersTamamlandi: false,
        } });
        let yeniKart = 0;
        for (const grup of kaynak.gruplar) {
            if (islenen.has(grup.imza)) continue;
            const cevap = await x.uret({
                dersBilgisi: { dersAdi: ders.dersAdi, aciklama: ders.aciklama }, grup,
            });
            const kartlar = dersKartlariniDogrula({
                hamKartlar: cevap?.kartlar, kaynaklar: grup.kaynaklar, konular: grup.konular,
            });
            yeniKart += await yeniKartlariKaydet(x, { kullaniciId, dersId, token, kartlar });
            await durumuKaydet({
                $addToSet: { kartDersIslenenGrupImzalari: grup.imza },
                $currentDate: { kartUretimSonYenileme: true },
            });
            islenen.add(grup.imza);
        }
        // Ara kayıtlar yalnız kurtarma içindir; tüm gruplar bitince görünür olur.
        const kartlar = await kartGetir(x, kullaniciId, dersId);
        await durumuKaydet({ $set: { kartDersTamamlandi: true } });
        return {
            kartlar,
            tamamlandi: true, dersKartTamamlandi: true,
            toplamGrupSayisi: kaynak.gruplar.length,
            islenenGrupSayisi: islenen.size, yeniKartSayisi: yeniKart,
            sureMs: Date.now() - bas,
        };
    } finally {
        clearInterval(kalpAtisi);
        await kartKilidiniBirak(x.DersModel, kullaniciId, dersId, token);
    }
};

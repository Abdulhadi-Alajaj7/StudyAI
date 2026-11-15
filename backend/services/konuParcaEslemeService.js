import { createHash } from "node:crypto";
import Ders from "../models/Ders.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuParcaEslesmesi from "../models/KonuParcaEslesmesi.js";
import { embeddingAyarlariGetir, embeddingleriUret } from "./embeddingService.js";
import { konuHaritasiniOzetle } from "./haritaTabanliKartPlanlama.mjs";
import {
    KONU_PARCA_ALGORITMA_SURUMU, konuParcaBaglantilariniHesapla,
    konuParcaSurumImzasi, konuKaynakGruplariniOlustur,
} from "./konuParcaPlanlama.mjs";

const sha = (s) => createHash("sha256").update(s).digest("hex");
const id = (v) => String(v ?? "");

export class KonuParcaEslemeHatasi extends Error {
    constructor(message, status = 422, kod = "KONU_PARCA_ESLEME_HATASI") {
        super(message); this.status = status; this.kod = kod;
    }
}

const bagimliliklariAl = (d = {}) => ({
    DersModel: d.DersModel || Ders,
    HaritaModel: d.HaritaModel || KonuHaritasi,
    MateryalModel: d.MateryalModel || Materyal,
    ParcaModel: d.ParcaModel || MetinParcasi,
    EslemeModel: d.EslemeModel || KonuParcaEslesmesi,
    embeddingUret: d.embeddingUret || embeddingleriUret,
    ayarlar: d.ayarlar || embeddingAyarlariGetir(),
});

export const konuParcaKaynaklariniGetir = async ({ kullaniciId, dersId }, d = {}) => {
    const x = bagimliliklariAl(d);
    const ders = await x.DersModel.findOne({ _id: dersId, kullaniciId,
        temizleniyor: { $ne: true } }).lean();
    if (!ders) throw new KonuParcaEslemeHatasi("Ders bulunamadı.", 404);
    if (!ders.materyallerOnaylandi) {
        throw new KonuParcaEslemeHatasi("Önce ders materyallerini onaylayın.");
    }
    const harita = await x.HaritaModel.findOne({
        kullaniciId, dersId, durum: "hazir",
    }).select("anaKonular").lean();
    if (!harita?.anaKonular?.length) {
        throw new KonuParcaEslemeHatasi("Hazır konu haritası bulunamadı.");
    }
    const materyaller = await x.MateryalModel.find({
        kullaniciId, dersId, durum: "hazir", aktifIslemeId: { $ne: null },
    }).select("_id aktifIslemeId dosyaAdi orijinalDosyaAdi").lean();
    if (!materyaller.length) {
        throw new KonuParcaEslemeHatasi("Hazır ders dosyası bulunamadı.");
    }
    const parcalar = await x.ParcaModel.find({
        kullaniciId, dersId,
        $or: materyaller.map((m) => ({
            materyalId: m._id, islemeId: m.aktifIslemeId,
        })),
    }).select("+embedding _id materyalId islemeId parcaIndex icerik icerikHash embeddingDurumu embeddingModel embeddingBoyutu embeddingGirdiHash")
        .sort({ materyalId: 1, parcaIndex: 1 }).lean();
    if (!parcalar.length) {
        throw new KonuParcaEslemeHatasi("Ders metni bulunamadı.");
    }
    const { agac, konular } = konuHaritasiniOzetle(harita);
    return { x, ders, agac, konular, materyaller, parcalar };
};

/**
 * Harita hazır olduktan sonra, ilk ihtiyaçta indekslenir. Quiz de aynı
 * fonksiyonu çağırarak saklanmış konu-parça bağlarını yeniden kullanabilir.
 * Tek öğrenci/ders için kart üretim kilidi çağıran servis tarafından alınır.
 */
export const konuParcaEslemesiniHazirla = async (girdi, d = {}) => {
    const { x, agac, konular, materyaller, parcalar } =
        await konuParcaKaynaklariniGetir(girdi, d);
    const { model, boyut } = x.ayarlar;
    const kaynakSurumu = konuParcaSurumImzasi({
        agac, materyaller, model, boyut,
    });
    const parcaImzasi = sha(JSON.stringify(parcalar.map((p) => [
        id(p._id), id(p.icerikHash), id(p.embeddingDurumu),
        id(p.embeddingModel), p.embeddingBoyutu, id(p.embeddingGirdiHash),
    ])));
    const surumImzasi = sha(kaynakSurumu + ":" + parcaImzasi);
    const onceki = await x.EslemeModel.findOne({
        kullaniciId: girdi.kullaniciId, dersId: girdi.dersId,
        surumImzasi, durum: "hazir",
    }).lean();
    if (onceki) {
        return { esleme: onceki, agac, konular, materyaller, parcalar,
            onbellekten: true };
    }
    const metinler = konular.map((k) =>
        "Konu: " + k.baslik + ". Açıklama: " + (k.aciklama || "") + ".");
    const sorguVektorleri = await x.embeddingUret(metinler, {
        tur: "sorgu", ayarlar: x.ayarlar,
    });
    if (!Array.isArray(sorguVektorleri) || sorguVektorleri.length !== konular.length) {
        throw new KonuParcaEslemeHatasi(
            "Konu vektörleri eksik üretildi; metin parçaları korunuyor.",
            503, "KONU_EMBEDDING_EKSIK"
        );
    }
    const hesap = konuParcaBaglantilariniHesapla({
        konular, parcalar, sorguVektorleri, model, boyut,
    });
    if (hesap.konular.every((k) => !k.kaynaklar.length)) {
        throw new KonuParcaEslemeHatasi(
            "Hiçbir konu için güvenilir metin parçası eşleşmedi; dosyalar korunuyor.",
            422, "KONU_KAYNAK_ESLESMEDI"
        );
    }
    const guncel = await x.MateryalModel.find({
        kullaniciId: girdi.kullaniciId, dersId: girdi.dersId,
        durum: "hazir", aktifIslemeId: { $ne: null },
    }).select("_id aktifIslemeId").lean();
    const aktifImza = (list) => list.map((m) =>
        id(m._id) + ":" + id(m.aktifIslemeId)).sort().join("|");
    if (aktifImza(guncel) !== aktifImza(materyaller)) {
        throw new KonuParcaEslemeHatasi(
            "Ders dosyaları eşleştirme sırasında değişti; tekrar deneyin.",
            409, "KONU_KAYNAK_SURUMU_DEGISTI"
        );
    }
    const kayit = {
        kullaniciId: girdi.kullaniciId, dersId: girdi.dersId,
        surumImzasi, algoritmaSurumu: KONU_PARCA_ALGORITMA_SURUMU,
        embeddingModel: model, embeddingBoyutu: boyut, durum: "hazir",
        ...hesap,
    };
    const esleme = await x.EslemeModel.findOneAndUpdate({
        kullaniciId: girdi.kullaniciId, dersId: girdi.dersId,
    }, { $set: kayit }, { upsert: true, new: true }).lean();
    console.info("[KonuParca] İndeks hazır", {
        toplamParca: hesap.toplamParcaSayisi,
        eslesenParca: hesap.eslesenParcaSayisi,
        eslesmeyenParca: hesap.eslesmeyenParcaIds.length,
        bosKonu: hesap.bosKonuIds.length,
        embeddingsizParca: hesap.embeddingiEksikParcaIds.length,
        konu: konular.length,
    });
    return { esleme, agac, konular, materyaller, parcalar,
        onbellekten: false };
};

/** Kaynak okuma API'si: kartlar ve ileride test modülü aynı indeksi kullanır. */
export const konuKaynakGruplariniGetir = async (girdi, d = {}) => {
    const sonuc = await konuParcaEslemesiniHazirla(girdi, d);
    return {
        ...sonuc,
        gruplar: konuKaynakGruplariniOlustur(sonuc),
    };
};

export const tekKonununKaynaklariniGetir = async ({
    kullaniciId, dersId, konuId,
}, d = {}) => {
    const { esleme, parcalar } = await konuParcaEslemesiniHazirla({
        kullaniciId, dersId,
    }, d);
    const konu = esleme.konular.find((k) => k.konuId === String(konuId));
    if (!konu) throw new KonuParcaEslemeHatasi("Konu bulunamadı.", 404);
    const parcaMap = new Map(parcalar.map((p) => [String(p._id), p]));
    return {
        konuId: konu.konuId, baslik: konu.baslik, aciklama: konu.aciklama,
        kaynaklar: konu.kaynaklar.map((k) => ({
            parca: parcaMap.get(String(k.parcaId)), skor: k.skor, yontem: k.yontem,
        })).filter((k) => k.parca),
    };
};

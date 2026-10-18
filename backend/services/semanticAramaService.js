import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import {
    embeddingAyarlariGetir,
    embeddingleriUret,
    kosinusBenzerligi,
} from "./embeddingService.js";

const tamSayiSinirla = (deger, varsayilan, alt, ust) => {
    const sayi = Number.parseInt(deger, 10);
    if (!Number.isInteger(sayi)) return varsayilan;
    return Math.min(ust, Math.max(alt, sayi));
};

const minimumSkorGetir = () => {
    const sayi = Number.parseFloat(process.env.SEMANTIK_ARAMA_MIN_SKOR);
    return Number.isFinite(sayi) ? Math.min(1, Math.max(-1, sayi)) : 0.2;
};

export const semanticAramaYap = async ({
    kullaniciId,
    dersId,
    sorgu,
    limit = 5,
}, bagimliliklar = {}) => {
    const DersModel = bagimliliklar.DersModel || Ders;
    const MateryalModel = bagimliliklar.MateryalModel || Materyal;
    const MetinParcasiModel = bagimliliklar.MetinParcasiModel || MetinParcasi;
    const embeddingUret = bagimliliklar.embeddingUret || embeddingleriUret;
    const ayarlar = bagimliliklar.ayarlar || embeddingAyarlariGetir();
    const sonucLimiti = tamSayiSinirla(limit, 5, 1, 10);
    const adayLimiti = tamSayiSinirla(
        process.env.SEMANTIK_ARAMA_MAKS_ADAY,
        2500,
        100,
        10_000
    );

    const ders = await DersModel.findOne({ _id: dersId, kullaniciId });
    if (!ders) {
        const hata = new Error("Ders bulunamadı veya bu ders için yetkiniz yok.");
        hata.kod = "DERS_BULUNAMADI";
        hata.status = 404;
        throw hata;
    }

    const materyaller = await MateryalModel.find({
        kullaniciId,
        dersId,
        durum: "hazir",
        aktifIslemeId: { $ne: null },
    })
        .select("_id orijinalDosyaAdi dosyaAdi aktifIslemeId embeddingDurumu")
        .lean();

    if (materyaller.length === 0) {
        return {
            sonuclar: [],
            meta: { toplamAday: 0, hazirMateryalSayisi: 0, indeksliMateryalSayisi: 0, eksikIndeksSayisi: 0 }
        };
    }

    const aktifSurumler = materyaller.map((materyal) => ({
        materyalId: materyal._id,
        islemeId: materyal.aktifIslemeId,
    }));
    const materyalHaritasi = new Map(materyaller.map((materyal) => [String(materyal._id), materyal]));

    const parcalar = await MetinParcasiModel.find({
        kullaniciId,
        dersId,
        embeddingDurumu: "hazir",
        embeddingModel: ayarlar.model,
        embeddingBoyutu: ayarlar.boyut,
        $or: aktifSurumler,
    })
        .select("+embedding materyalId islemeId parcaIndex icerik")
        .limit(adayLimiti)
        .lean();

    if (parcalar.length === 0) {
        return {
            sonuclar: [],
            meta: {
                toplamAday: 0,
                hazirMateryalSayisi: materyaller.length,
                indeksliMateryalSayisi: 0,
                eksikIndeksSayisi: materyaller.length,
            }
        };
    }

    const [sorguEmbedding] = await embeddingUret([sorgu], {
        tur: "sorgu",
        ayarlar,
    });
    if (!sorguEmbedding) {
        const hata = new Error("Arama sorgusu için embedding oluşturulamadı.");
        hata.kod = "SORGU_EMBEDDING_HATASI";
        hata.status = 503;
        throw hata;
    }

    const indeksliMateryalIds = new Set();
    const sonuclar = [];
    for (const parca of parcalar) {
        const materyal = materyalHaritasi.get(String(parca.materyalId));
        if (!materyal) continue;
        const skor = kosinusBenzerligi(sorguEmbedding, parca.embedding);
        if (skor == null) continue;
        indeksliMateryalIds.add(String(parca.materyalId));
        if (skor < minimumSkorGetir()) continue;
        sonuclar.push({
            materyalId: String(parca.materyalId),
            materyalAdi: materyal.orijinalDosyaAdi || materyal.dosyaAdi,
            parcaIndex: parca.parcaIndex,
            icerik: parca.icerik,
            skor: Number(skor.toFixed(6)),
        });
    }

    sonuclar.sort((sol, sag) => sag.skor - sol.skor || sol.parcaIndex - sag.parcaIndex);

    return {
        sonuclar: sonuclar.slice(0, sonucLimiti),
        meta: {
            toplamAday: parcalar.length,
            hazirMateryalSayisi: materyaller.length,
            indeksliMateryalSayisi: indeksliMateryalIds.size,
            eksikIndeksSayisi: Math.max(0, materyaller.length - indeksliMateryalIds.size),
            adayLimiti,
            adaylarSinirlandi: parcalar.length === adayLimiti,
            model: ayarlar.model,
            boyut: ayarlar.boyut,
        }
    };
};

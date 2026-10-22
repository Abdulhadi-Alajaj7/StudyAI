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

const kimlikMetni = (deger) => String(deger ?? "");

const esitAralikliIndeksler = (uzunluk, adet) => {
    if (adet >= uzunluk) return Array.from({ length: uzunluk }, (_, index) => index);
    return Array.from(
        { length: adet },
        (_, index) => Math.min(uzunluk - 1, Math.floor(((index + 0.5) * uzunluk) / adet))
    );
};

/**
 * Aday sınırı aşıldığında ilk MongoDB kayıtlarını almak yerine her materyale
 * dengeli kota verir ve her materyalin başı/ortası/sonu boyunca eşit aralıklı
 * parçalar seçer. Girdi sırası değişse de aynı kimlikler seçilir.
 */
export const dengeliAdayKimlikleriniSec = (kayitlar, limit) => {
    if (!Array.isArray(kayitlar) || kayitlar.length === 0 || limit < 1) return [];

    const gruplarHaritasi = new Map();
    for (const kayit of kayitlar) {
        const anahtar = kimlikMetni(kayit.materyalId);
        if (!gruplarHaritasi.has(anahtar)) gruplarHaritasi.set(anahtar, []);
        gruplarHaritasi.get(anahtar).push(kayit);
    }

    let gruplar = [...gruplarHaritasi.entries()]
        .sort(([sol], [sag]) => sol.localeCompare(sag))
        .map(([materyalId, parcalar]) => ({
            materyalId,
            kota: 0,
            parcalar: parcalar.sort((sol, sag) => (
                (sol.parcaIndex ?? 0) - (sag.parcaIndex ?? 0) ||
                kimlikMetni(sol._id).localeCompare(kimlikMetni(sag._id))
            )),
        }));

    // Teorik olarak materyal sayısı limitten fazlaysa ilk materyalleri kayırma;
    // materyal kümesinin tamamına eşit aralıklı örnekleme uygula.
    if (gruplar.length > limit) {
        gruplar = esitAralikliIndeksler(gruplar.length, limit).map((index) => gruplar[index]);
    }

    let kalan = Math.min(limit, kayitlar.length);
    let uygunGruplar = gruplar;
    while (kalan > 0 && uygunGruplar.length > 0) {
        const pay = Math.max(1, Math.floor(kalan / uygunGruplar.length));
        const sonrakiTur = [];
        for (const grup of uygunGruplar) {
            if (kalan === 0) break;
            const bosYer = grup.parcalar.length - grup.kota;
            const eklenecek = Math.min(pay, bosYer, kalan);
            grup.kota += eklenecek;
            kalan -= eklenecek;
            if (grup.kota < grup.parcalar.length) sonrakiTur.push(grup);
        }
        uygunGruplar = sonrakiTur;
    }

    return gruplar.flatMap((grup) => (
        esitAralikliIndeksler(grup.parcalar.length, grup.kota)
            .map((index) => grup.parcalar[index]._id)
    ));
};

const aktifSurumAnahtari = (materyalId, islemeId) => (
    `${kimlikMetni(materyalId)}:${kimlikMetni(islemeId)}`
);

export const semanticAramaYap = async ({
    kullaniciId,
    dersId,
    sorgu,
    limit = 5,
    materyalIds = null,
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
        ...(Array.isArray(materyalIds) ? { _id: { $in: materyalIds } } : {}),
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
    // Önce yalnızca hafif metadata alınır. Böylece aday sınırı uygulanırken
    // binlerce 768 boyutlu vektör ve metin belleğe taşınmaz.
    const adayMetadatasi = await MetinParcasiModel.find({
        kullaniciId,
        dersId,
        embeddingDurumu: "hazir",
        embeddingModel: ayarlar.model,
        embeddingBoyutu: ayarlar.boyut,
        $or: aktifSurumler,
    })
        .select("_id materyalId islemeId parcaIndex")
        .sort({ materyalId: 1, parcaIndex: 1, _id: 1 })
        .lean();

    const adayKimlikleri = dengeliAdayKimlikleriniSec(adayMetadatasi, adayLimiti);
    const parcalar = adayKimlikleri.length === 0
        ? []
        : await MetinParcasiModel.find({
            _id: { $in: adayKimlikleri },
            kullaniciId,
            dersId,
            embeddingDurumu: "hazir",
            embeddingModel: ayarlar.model,
            embeddingBoyutu: ayarlar.boyut,
            $or: aktifSurumler,
        })
        .select("+embedding materyalId islemeId parcaIndex icerik")
        .sort({ materyalId: 1, parcaIndex: 1, _id: 1 })
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

    // Sorgu embedding'i üretilirken materyal silinmiş veya yeniden işlenmiş
    // olabilir. Yanıt verilmeden hemen önce aktif sürümleri tekrar doğrula.
    const guncelMateryaller = await MateryalModel.find({
        kullaniciId,
        dersId,
        durum: "hazir",
        aktifIslemeId: { $ne: null },
        _id: { $in: materyaller.map((materyal) => materyal._id) },
    })
        .select("_id orijinalDosyaAdi dosyaAdi aktifIslemeId embeddingDurumu")
        .lean();
    const guncelMateryalHaritasi = new Map(
        guncelMateryaller.map((materyal) => [kimlikMetni(materyal._id), materyal])
    );
    const guncelAktifSurumler = new Set(
        guncelMateryaller.map((materyal) => aktifSurumAnahtari(materyal._id, materyal.aktifIslemeId))
    );
    const indeksliMateryalIds = new Set(
        adayMetadatasi
            .filter((parca) => guncelAktifSurumler.has(aktifSurumAnahtari(parca.materyalId, parca.islemeId)))
            .map((parca) => kimlikMetni(parca.materyalId))
    );
    const sonuclar = [];
    for (const parca of parcalar) {
        const surumAnahtari = aktifSurumAnahtari(parca.materyalId, parca.islemeId);
        if (!guncelAktifSurumler.has(surumAnahtari)) continue;
        const materyal = guncelMateryalHaritasi.get(kimlikMetni(parca.materyalId));
        if (!materyal) continue;
        const skor = kosinusBenzerligi(sorguEmbedding, parca.embedding);
        if (skor == null) continue;
        if (skor < minimumSkorGetir()) continue;
        sonuclar.push({
            metinParcasiId: String(parca._id),
            materyalId: String(parca.materyalId),
            materyalAdi: materyal.orijinalDosyaAdi || materyal.dosyaAdi,
            parcaIndex: parca.parcaIndex,
            icerik: parca.icerik,
            skor: Number(skor.toFixed(6)),
        });
    }

    sonuclar.sort((sol, sag) => (
        sag.skor - sol.skor ||
        sol.materyalId.localeCompare(sag.materyalId) ||
        sol.parcaIndex - sag.parcaIndex
    ));

    return {
        sonuclar: sonuclar.slice(0, sonucLimiti),
        meta: {
            toplamAday: parcalar.length,
            toplamUygunParca: adayMetadatasi.length,
            hazirMateryalSayisi: guncelMateryaller.length,
            indeksliMateryalSayisi: indeksliMateryalIds.size,
            eksikIndeksSayisi: Math.max(0, guncelMateryaller.length - indeksliMateryalIds.size),
            adayLimiti,
            adaylarSinirlandi: adayMetadatasi.length > adayKimlikleri.length,
            model: ayarlar.model,
            boyut: ayarlar.boyut,
        }
    };
};

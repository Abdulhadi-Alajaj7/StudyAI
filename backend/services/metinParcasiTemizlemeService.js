import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import { baslangicKurtarmaEtkinMi } from "./baslangicKurtarmaService.js";

const kimliklerEsit = (sol, sag) => (
    sol != null && sag != null && String(sol) === String(sag)
);

/**
 * Bir parça ya taahhüt edilmiş aktif sürüme ya da hâlen devam eden işleme
 * aitse korunur. Eski, sürümlenmemiş kayıtlarda iki token da null olabilir;
 * veri kaybı riskine karşı bu belirsiz kayıtlar da korunur.
 */
export const metinParcasiKullaniliyorMu = (parca, materyal) => {
    if (!materyal) {
        return false;
    }

    if (parca.islemeId == null && materyal.aktifIslemeId == null) {
        return true;
    }

    if (kimliklerEsit(parca.islemeId, materyal.aktifIslemeId)) {
        return true;
    }

    return materyal.durum === "isleniyor" &&
        kimliklerEsit(parca.islemeId, materyal.islemeId);
};

/**
 * Metin parçalarını küçük gruplarla temizler. Çoklu-instance varsayılanında
 * yalnızca materyali artık bulunmayan gerçek yetimler silinir. Eski sürüm ve
 * terk edilmiş staging temizliği, başlangıç kurtarmasıyla aynı açık
 * single-instance güvenlik sınırı içinde çalışır. Her aday silme öncesi tekrar
 * doğrulanır; sonradan eklenen kayıtlar incelenen _id listesi dışında kalır.
 */
export const kullanilmayanMetinParcalariniTemizle = async ({
    batchSize = 500,
    logger = console,
    mod = process.env.STUDYAI_STARTUP_RECOVERY_MODE
} = {}) => {
    if (!Number.isInteger(batchSize) || batchSize < 1) {
        throw new Error("Metin parçası temizleme batchSize değeri pozitif bir tam sayı olmalıdır.");
    }

    let sonParcaId = null;
    let incelenenParcaSayisi = 0;
    let silinenParcaSayisi = 0;
    const tekInstanceTemizligi = baslangicKurtarmaEtkinMi(mod);

    const materyalHaritasiGetir = async (materyalIds) => {
        const materyaller = await Materyal.find({ _id: { $in: materyalIds } })
            .select("_id durum islemeId aktifIslemeId")
            .lean();
        return new Map(
            materyaller.map((materyal) => [String(materyal._id), materyal])
        );
    };

    const silinebilir = (parca, materyalHaritasi) => {
        const materyal = materyalHaritasi.get(String(parca.materyalId));

        // Çoklu instance modunda işlem sahipliği/liveness bilgisi bulunmadığı için
        // mevcut bir materyalin hiçbir sürümü terk edilmiş varsayılmaz. Materyali
        // tamamen silinmiş gerçek yetimler ise tüm modlarda güvenle temizlenebilir.
        if (!materyal) return true;
        return tekInstanceTemizligi && !metinParcasiKullaniliyorMu(parca, materyal);
    };

    while (true) {
        const filtre = sonParcaId
            ? { _id: { $gt: sonParcaId } }
            : {};
        const parcalar = await MetinParcasi.find(filtre)
            .select("_id materyalId islemeId")
            .sort({ _id: 1 })
            .limit(batchSize)
            .lean();

        if (parcalar.length === 0) {
            break;
        }

        sonParcaId = parcalar.at(-1)._id;
        incelenenParcaSayisi += parcalar.length;

        const materyalIds = [...new Set(
            parcalar.map((parca) => String(parca.materyalId))
        )];
        const materyalHaritasi = await materyalHaritasiGetir(materyalIds);

        const silmeAdaylari = parcalar.filter((parca) => (
            silinebilir(parca, materyalHaritasi)
        ));

        if (silmeAdaylari.length > 0) {
            // Aday seçimi ile silme arasındaki durum değişikliklerini yakala.
            // Tek-instance modunda bu ikinci okuma savunma katmanıdır; çoklu
            // instance modunda yalnızca hâlâ materyalsiz olan yetimler silinir.
            const adayMateryalIds = [...new Set(
                silmeAdaylari.map((parca) => String(parca.materyalId))
            )];
            const guncelMateryalHaritasi = await materyalHaritasiGetir(adayMateryalIds);
            const silinecekParcaIds = silmeAdaylari
                .filter((parca) => silinebilir(parca, guncelMateryalHaritasi))
                .map((parca) => parca._id);

            if (silinecekParcaIds.length > 0) {
                const sonuc = await MetinParcasi.deleteMany({
                    _id: { $in: silinecekParcaIds }
                });
                silinenParcaSayisi += sonuc.deletedCount || 0;
            }
        }

        if (parcalar.length < batchSize) {
            break;
        }
    }

    if (silinenParcaSayisi > 0) {
        logger.log(
            `Başlangıç temizliği: ${silinenParcaSayisi} kullanılmayan metin parçası silindi.`
        );
    }

    return { incelenenParcaSayisi, silinenParcaSayisi };
};

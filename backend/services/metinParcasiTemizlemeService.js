import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";

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
 * Aktif veya geçerli staging olmayan metin parçalarını küçük gruplarla temizler.
 * Silme yalnızca daha önce incelenmiş parça _id'leriyle yapıldığı için eşzamanlı
 * başka bir instance'ın sonradan eklediği staging kayıtları sorguya yakalanmaz.
 */
export const kullanilmayanMetinParcalariniTemizle = async ({
    batchSize = 500,
    logger = console
} = {}) => {
    if (!Number.isInteger(batchSize) || batchSize < 1) {
        throw new Error("Metin parçası temizleme batchSize değeri pozitif bir tam sayı olmalıdır.");
    }

    let sonParcaId = null;
    let incelenenParcaSayisi = 0;
    let silinenParcaSayisi = 0;

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
        const materyaller = await Materyal.find({ _id: { $in: materyalIds } })
            .select("_id durum islemeId aktifIslemeId")
            .lean();
        const materyalHaritasi = new Map(
            materyaller.map((materyal) => [String(materyal._id), materyal])
        );

        const silinecekParcaIds = parcalar
            .filter((parca) => !metinParcasiKullaniliyorMu(
                parca,
                materyalHaritasi.get(String(parca.materyalId))
            ))
            .map((parca) => parca._id);

        if (silinecekParcaIds.length > 0) {
            const sonuc = await MetinParcasi.deleteMany({
                _id: { $in: silinecekParcaIds }
            });
            silinenParcaSayisi += sonuc.deletedCount || 0;
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

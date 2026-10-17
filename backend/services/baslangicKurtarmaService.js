import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import KonuHaritasi from "../models/KonuHaritasi.js";

export const TEK_INSTANCE_KURTARMA_MODU = "single-instance";

export const baslangicKurtarmaEtkinMi = (
    mod = process.env.STUDYAI_STARTUP_RECOVERY_MODE
) => mod === TEK_INSTANCE_KURTARMA_MODU;

/**
 * Sahiplik/heartbeat bilgisi bulunmadığı için kurtarma yalnızca operatörün
 * açık tek-instance onayıyla çalışır. Varsayılan davranış başka instance'ların
 * geçerli işlemlerine dokunmamaktır.
 */
export const baslangicIslemleriniKurtar = async ({
    mod = process.env.STUDYAI_STARTUP_RECOVERY_MODE,
    logger = console
} = {}) => {
    if (!baslangicKurtarmaEtkinMi(mod)) {
        logger.warn(
            "Başlangıç işlem kurtarması atlandı: STUDYAI_STARTUP_RECOVERY_MODE=single-instance açıkça ayarlanmadı."
        );
        return {
            calisti: false,
            materyalSayisi: 0,
            konuHaritasiSayisi: 0,
            dersSayisi: 0
        };
    }

    const yenidenIslenenMateryaller = await Materyal.updateMany(
        {
            durum: "isleniyor",
            aktifIslemeId: { $ne: null }
        },
        {
            $set: {
                durum: "hazir",
                islemeId: null,
                islemeHatasi: "Sunucu yeniden başlatıldığı için yeniden işleme yarıda kaldı; önceki başarılı sürüm korundu."
            }
        }
    );

    const ilkKezIslenenMateryaller = await Materyal.updateMany(
        {
            durum: "isleniyor",
            $or: [
                { aktifIslemeId: null },
                { aktifIslemeId: { $exists: false } }
            ]
        },
        {
            $set: {
                durum: "hata",
                islemeId: null,
                islemeHatasi: "Sunucu yeniden başlatıldığı için işlem yarıda kaldı."
            }
        }
    );

    const oncekiHaritasiOlanlar = await KonuHaritasi.updateMany(
        {
            durum: "olusturuluyor",
            degisikliklereKilitli: { $ne: true },
            "anaKonular.0": { $exists: true }
        },
        {
            $set: {
                durum: "hazir",
                olusturmaHatasi: "Sunucu yeniden başlatıldığı için son konu haritası güncellemesi yarıda kaldı; önceki başarılı harita korundu.",
                aktifIslemToken: null,
                kilitSonYenilemeTarihi: null
            }
        }
    );

    const ilkKezOlusturulanHaritalar = await KonuHaritasi.updateMany(
        {
            durum: "olusturuluyor",
            degisikliklereKilitli: { $ne: true },
            "anaKonular.0": { $exists: false }
        },
        {
            $set: {
                durum: "hata",
                olusturmaHatasi: "Sunucu yeniden başlatıldığı için konu haritası üretimi yarıda kaldı.",
                aktifIslemToken: null,
                kilitSonYenilemeTarihi: null
            }
        }
    );

    const kurtarilanDersler = await Ders.updateMany(
        { aktifMateryalIslemSayisi: { $gt: 0 } },
        { $set: { aktifMateryalIslemSayisi: 0 } },
        { timestamps: false }
    );

    const materyalSayisi =
        yenidenIslenenMateryaller.modifiedCount +
        ilkKezIslenenMateryaller.modifiedCount;
    const konuHaritasiSayisi =
        oncekiHaritasiOlanlar.modifiedCount +
        ilkKezOlusturulanHaritalar.modifiedCount;
    const dersSayisi = kurtarilanDersler.modifiedCount;

    if (materyalSayisi > 0 || konuHaritasiSayisi > 0 || dersSayisi > 0) {
        logger.log(
            `Sunucu başlangıcı: ${materyalSayisi} materyal, ${konuHaritasiSayisi} konu haritası ve ${dersSayisi} ders sayacı güvenli tek-instance modunda kurtarıldı.`
        );
    }

    return {
        calisti: true,
        materyalSayisi,
        konuHaritasiSayisi,
        dersSayisi
    };
};

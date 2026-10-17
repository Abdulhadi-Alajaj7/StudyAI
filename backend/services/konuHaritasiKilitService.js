import KonuHaritasi from "../models/KonuHaritasi.js";

export const KONU_HARITASI_KILIT_ZAMAN_ASIMI_MS = 5 * 60 * 1000;
export const KONU_HARITASI_HEARTBEAT_ARALIGI_MS = 60 * 1000;

export class KonuHaritasiKilitKaybiHatasi extends Error {
    constructor(mesaj = "Konu haritası işlem kilidi kaybedildi.") {
        super(mesaj);
        this.name = "KonuHaritasiKilitKaybiHatasi";
        this.kod = "KONU_HARITASI_KILIDI_KAYBEDILDI";
    }
}

export const konuHaritasiKilidiAktifMi = (
    harita,
    simdi = Date.now()
) => {
    if (!harita || harita.durum !== "olusturuluyor") {
        return false;
    }

    const sonYenileme = harita.kilitSonYenilemeTarihi || harita.updatedAt;
    const sonYenilemeZamani = sonYenileme
        ? new Date(sonYenileme).getTime()
        : 0;

    return Number.isFinite(sonYenilemeZamani) &&
        simdi - sonYenilemeZamani < KONU_HARITASI_KILIT_ZAMAN_ASIMI_MS;
};

/**
 * Kilit boşsa veya lease gerçekten zaman aşımına uğramışsa devralmaya izin verir.
 * Eski kayıtlarda lease alanı bulunmadığı için updatedAt geriye dönük fallback'tir.
 * Çoklu instance saat farklarının erken devralmaya yol açmaması için eşik MongoDB
 * sunucusunun $$NOW değeriyle hesaplanır.
 */
export const konuHaritasiKilitAlmaKosulu = () => ({
    $or: [
        { durum: { $ne: "olusturuluyor" } },
        {
            durum: "olusturuluyor",
            $expr: {
                $lt: [
                    {
                        $ifNull: [
                            "$kilitSonYenilemeTarihi",
                            "$updatedAt"
                        ]
                    },
                    {
                        $subtract: [
                            "$$NOW",
                            KONU_HARITASI_KILIT_ZAMAN_ASIMI_MS
                        ]
                    }
                ]
            }
        }
    ]
});

export const konuHaritasiKilidiniYenile = async ({
    dersId,
    kullaniciId,
    islemToken
}) => {
    const sonuc = await KonuHaritasi.updateOne(
        {
            dersId,
            kullaniciId,
            durum: "olusturuluyor",
            aktifIslemToken: islemToken,
            degisikliklereKilitli: { $ne: true }
        },
        { $currentDate: { kilitSonYenilemeTarihi: true } }
    );

    if (sonuc.matchedCount !== 1) {
        throw new KonuHaritasiKilitKaybiHatasi();
    }

    return true;
};

/**
 * Uzun Gemini çağrısı boyunca lease'i yeniler. Yenileme başarısız olursa
 * bekleyen çağrı güvenli şekilde reddedilir ve sonuç kaydetme akışı durur.
 */
export const konuHaritasiHeartbeatBaslat = async ({
    dersId,
    kullaniciId,
    islemToken,
    aralikMs = KONU_HARITASI_HEARTBEAT_ARALIGI_MS
}) => {
    let zamanlayici = null;
    let durduruldu = false;
    let kilitKaybiHatasi = null;
    let yenilemePromise = null;
    let kilitKaybiniReddet;

    const kilitKaybiPromise = new Promise((_, reject) => {
        kilitKaybiniReddet = reject;
    });
    void kilitKaybiPromise.catch(() => {});

    const kilidiKaybet = (hata) => {
        if (kilitKaybiHatasi || durduruldu) {
            return;
        }

        kilitKaybiHatasi = hata instanceof KonuHaritasiKilitKaybiHatasi
            ? hata
            : new KonuHaritasiKilitKaybiHatasi(
                `Konu haritası işlem kilidi yenilenemedi: ${hata.message}`
            );
        kilitKaybiniReddet(kilitKaybiHatasi);

        if (zamanlayici) {
            clearInterval(zamanlayici);
        }
    };

    const yenile = async () => {
        if (kilitKaybiHatasi) {
            throw kilitKaybiHatasi;
        }

        if (!yenilemePromise) {
            yenilemePromise = konuHaritasiKilidiniYenile({
                dersId,
                kullaniciId,
                islemToken
            }).catch((hata) => {
                kilidiKaybet(hata);
                throw kilitKaybiHatasi;
            }).finally(() => {
                yenilemePromise = null;
            });
        }

        return yenilemePromise;
    };

    await yenile();

    zamanlayici = setInterval(() => {
        void yenile().catch(() => {});
    }, aralikMs);
    zamanlayici.unref?.();

    return {
        async bekle(islemPromise) {
            if (kilitKaybiHatasi) {
                throw kilitKaybiHatasi;
            }

            return Promise.race([
                Promise.resolve(islemPromise),
                kilitKaybiPromise
            ]);
        },
        kilidiDogrula: yenile,
        durdur() {
            durduruldu = true;
            if (zamanlayici) {
                clearInterval(zamanlayici);
            }
        }
    };
};

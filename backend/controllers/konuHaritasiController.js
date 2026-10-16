
import mongoose from "mongoose";

import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import KonuHaritasi from "../models/KonuHaritasi.js";

import {
    konuHaritasiUretVeKaydet,
    konuHaritasiGuncellikKontrolu,
} from "../services/konuHaritasiService.js";

import {
    geminiBaglantisiniDogrula,
    VARSAYILAN_GEMINI_MODELI,
} from "../services/geminiService.js";

/**
 * GET /dersler/:id/konu-haritasi
 *
 * Dersin kayıtlı konu haritasını getirir.
 * Onaylanmış derslerin haritası yeniden üretilmez.
 */
export const konuHaritasiniGetir = async (
    req,
    res
) => {
    try {
        const dersId = req.params.id;
        const kullaniciId = req.user._id;

        if (!mongoose.isValidObjectId(dersId)) {
            return res.status(400).json({
                hata: "Geçersiz ders kimliği.",
            });
        }

        const ders = await Ders.findOne({
            _id: dersId,
            kullaniciId,
        });

        if (!ders) {
            return res.status(404).json({
                hata:
                    "Ders bulunamadı veya yetkiniz yok.",
            });
        }

        const materyalDurumlari =
            await Materyal.aggregate([
                {
                    $match: {
                        dersId:
                            new mongoose.Types.ObjectId(
                                dersId
                            ),
                        kullaniciId:
                            new mongoose.Types.ObjectId(
                                String(kullaniciId)
                            ),
                    },
                },
                {
                    $group: {
                        _id: "$durum",
                        sayi: { $sum: 1 },
                    },
                },
            ]);

        const durumSayilari =
            Object.fromEntries(
                materyalDurumlari.map(
                    (item) => [
                        item._id,
                        item.sayi,
                    ]
                )
            );

        const toplamMateryalSayisi =
            materyalDurumlari.reduce(
                (toplam, item) =>
                    toplam + item.sayi,
                0
            );

        const islenenMateryalSayisi =
            (durumSayilari.yuklendi || 0) +
            (durumSayilari.isleniyor || 0) +
            (durumSayilari.siliniyor || 0);

        const hataliMateryalSayisi =
            durumSayilari.hata || 0;

        const hazirMateryalSayisi =
            await Materyal.countDocuments({
                dersId,
                kullaniciId,
                durum: "hazir",
                aktifIslemeId: {
                    $ne: null,
                },
            });

        const konuHaritasi =
            await KonuHaritasi.findOne({
                dersId,
                kullaniciId,
            });

        const kilitliDers =
            ders.materyallerKilitli === true;

        // Onaylanan dersin haritası sabittir.
        // Eski derslerde mevcut güncellik kontrolü korunur.
        const guncelMi = kilitliDers
            ? konuHaritasi?.durum === "hazir"
            : konuHaritasi
                ? await konuHaritasiGuncellikKontrolu(
                    konuHaritasi,
                    dersId,
                    kullaniciId
                )
                : false;

        const haritaHazirMi =
            konuHaritasi?.durum === "hazir" &&
            guncelMi;

        const islemDevamEdiyor =
            islenenMateryalSayisi > 0 ||
            konuHaritasi?.durum ===
                "olusturuluyor";

        const devamEdilebilirMi =
            toplamMateryalSayisi > 0 &&
            !islemDevamEdiyor &&
            hataliMateryalSayisi === 0 &&
            haritaHazirMi;

        return res.status(200).json({
            durum:
                konuHaritasi?.durum || "yok",
            harita:
                konuHaritasi || null,
            toplamMateryalSayisi,
            hazirMateryalSayisi,
            islenenMateryalSayisi,
            hataliMateryalSayisi,
            guncelMi,
            islemDevamEdiyor,
            devamEdilebilirMi,
            dahaSonraEklenebilirMi:
                !kilitliDers &&
                toplamMateryalSayisi === 0,
            materyallerKilitli: kilitliDers,
            yenidenOlusturulabilirMi:
                !kilitliDers,
            olusturmaHatasi:
                konuHaritasi?.olusturmaHatasi || "",
        });
    } catch (hata) {
        console.error(
            "Konu haritası getirme hatası:",
            hata
        );

        return res.status(500).json({
            hata:
                "Konu haritası alınırken bir sunucu hatası oluştu.",
        });
    }
};

/**
 * POST /dersler/:id/konu-haritasi
 *
 * Onaylanan derslerde yeniden üretim yasaktır.
 * Eski derslerde mevcut üretim davranışı korunur.
 */
export const konuHaritasiOlustur = async (
    req,
    res
) => {
    try {
        const dersId = req.params.id;
        const kullaniciId = req.user._id;

        if (!mongoose.isValidObjectId(dersId)) {
            return res.status(400).json({
                hata: "Geçersiz ders kimliği.",
            });
        }

        const ders = await Ders.findOne({
            _id: dersId,
            kullaniciId,
        });

        if (!ders) {
            return res.status(404).json({
                hata:
                    "Ders bulunamadı veya yetkiniz yok.",
            });
        }

        // Yeni sistemle oluşturulan dersler:
        // Gemini analizi onaydan önce tamamlanmıştır.
        if (ders.materyallerKilitli === true) {
            return res.status(403).json({
                basarili: false,
                hata:
                    "Bu dersin konu haritası onaylanmıştır. " +
                    "Yeniden oluşturulamaz.",
            });
        }

        // Eski dersler için hazır materyal kontrolü.
        const hazirMateryalSayisi =
            await Materyal.countDocuments({
                dersId,
                kullaniciId,
                durum: "hazir",
                aktifIslemeId: {
                    $ne: null,
                },
            });

        if (hazirMateryalSayisi === 0) {
            return res.status(400).json({
                hata:
                    "Konu haritası oluşturmak için " +
                    "en az bir hazır materyal gereklidir.",
            });
        }

        const yeniIslemToken =
            new mongoose.Types.ObjectId();

        let harita =
            await KonuHaritasi.findOne({
                dersId,
                kullaniciId,
            });

        const KILIT_ZAMAN_ASIMI_MS =
            5 * 60 * 1000;

        if (
            harita?.durum === "olusturuluyor"
        ) {
            const sonGuncelleme =
                harita.updatedAt
                    ? new Date(
                        harita.updatedAt
                    ).getTime()
                    : 0;

            if (
                Date.now() - sonGuncelleme <
                KILIT_ZAMAN_ASIMI_MS
            ) {
                return res.status(409).json({
                    hata:
                        "Bu ders için konu haritası " +
                        "zaten oluşturuluyor.",
                });
            }
        }

        if (!harita) {
            try {
                harita =
                    await KonuHaritasi.create({
                        dersId,
                        kullaniciId,
                        durum: "olusturuluyor",
                        olusturmaHatasi: "",
                        aktifIslemToken:
                            yeniIslemToken,
                    });
            } catch (hata) {
                if (hata.code === 11000) {
                    return res.status(409).json({
                        hata:
                            "Konu haritası oluşturma " +
                            "işlemi zaten başlatılmış.",
                    });
                }

                throw hata;
            }
        } else {
            harita =
                await KonuHaritasi.findOneAndUpdate(
                    {
                        _id: harita._id,
                        $or: [
                            {
                                durum: {
                                    $ne:
                                        "olusturuluyor",
                                },
                            },
                            {
                                updatedAt: {
                                    $lt: new Date(
                                        Date.now() -
                                        KILIT_ZAMAN_ASIMI_MS
                                    ),
                                },
                            },
                        ],
                    },
                    {
                        $set: {
                            durum:
                                "olusturuluyor",
                            olusturmaHatasi: "",
                            aktifIslemToken:
                                yeniIslemToken,
                        },
                    },
                    { new: true }
                );

            if (!harita) {
                return res.status(409).json({
                    hata:
                        "Konu haritası zaten oluşturuluyor.",
                });
            }
        }

        try {
            const tamamlananHarita =
                await konuHaritasiUretVeKaydet(
                    ders,
                    kullaniciId,
                    yeniIslemToken
                );

            if (!tamamlananHarita) {
                const guncel =
                    await KonuHaritasi.findOne({
                        dersId,
                        kullaniciId,
                    });

                return res.status(409).json({
                    hata:
                        guncel?.olusturmaHatasi ||
                        "Analiz tamamlanamadı.",
                    durum:
                        guncel?.durum || "hata",
                    harita: guncel,
                });
            }

            return res.status(200).json({
                mesaj:
                    "Konu haritası başarıyla oluşturuldu.",
                durum: "hazir",
                harita: tamamlananHarita,
            });
        } catch (hata) {
            let hataMesaji =
                hata.message ||
                "Konu haritası üretilemedi.";

            if (
                hata.kod === "EKSİK_API_KEY" ||
                hataMesaji.includes(
                    "GEMINI_API_KEY"
                )
            ) {
                hataMesaji =
                    "Gemini API anahtarı yapılandırılmamış.";
            } else if (
                hataMesaji.includes("429") ||
                hataMesaji
                    .toLowerCase()
                    .includes("quota")
            ) {
                hataMesaji =
                    "Gemini API kotası aşıldı.";
            } else if (
                hataMesaji.includes("503")
            ) {
                hataMesaji =
                    "Gemini servisi geçici olarak kullanılamıyor.";
            } else if (
                hataMesaji
                    .toLowerCase()
                    .includes("timeout")
            ) {
                hataMesaji =
                    "Gemini isteği zaman aşımına uğradı.";
            }

            const guncelHarita =
                await KonuHaritasi.findOne({
                    dersId,
                    kullaniciId,
                });

            return res.status(400).json({
                hata: hataMesaji,
                durum:
                    guncelHarita?.durum || "hata",
                harita: guncelHarita,
            });
        }
    } catch (hata) {
        console.error(
            "Konu haritası oluşturma hatası:",
            hata
        );

        return res.status(500).json({
            hata:
                "Konu haritası isteği işlenemedi.",
        });
    }
};

/**
 * GET /dersler/gemini-durum
 *
 * Gemini API bağlantısını kontrol eder.
 */
export const geminiDurumuGetir = async (
    req,
    res
) => {
    try {
        const sonuc =
            await geminiBaglantisiniDogrula(
                VARSAYILAN_GEMINI_MODELI
            );

        return res.status(
            sonuc.basarili ? 200 : 503
        ).json(sonuc);
    } catch (hata) {
        return res.status(500).json({
            basarili: false,
            model:
                VARSAYILAN_GEMINI_MODELI,
            mesaj:
                "Gemini sağlık kontrolü sırasında hata: " +
                hata.message,
        });
    }
};

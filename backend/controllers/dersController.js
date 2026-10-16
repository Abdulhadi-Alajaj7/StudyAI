
import mongoose from "mongoose";

import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import DersTaslagi from "../models/DersTaslagi.js";

import { guvenliDosyaSil } from "../utils/dosyaIslemleri.js";

/* =========================
   Ders Oluştur
========================= */

// Yeni dersler yalnızca taslak onayıyla oluşturulur.
export const dersOlustur = async (req, res) => {
    return res.status(403).json({
        basarili: false,
        hata:
            "Ders doğrudan oluşturulamaz. " +
            "Önce ders taslağı oluşturun, materyalleri ekleyin " +
            "ve Gemini analizinden sonra onaylayın.",
        yonlendirme: "/ders-taslaklari",
    });
};

/* =========================
   Dersleri Getir
========================= */

export const dersleriGetir = async (req, res) => {
    try {
        const kullaniciId = req.user._id;

        // Eski dersler de görünmeye devam eder.
        // Yalnızca hazırlanmakta olan dersler gizlenir.
        const dersler = await Ders.find({
            kullaniciId,
            durum: { $ne: "hazirlaniyor" },
        })
            .sort({ createdAt: -1 })
            .lean();

        const dersIds = dersler.map(
            (ders) => ders._id
        );

        const materyalCounts =
            dersIds.length > 0
                ? await Materyal.aggregate([
                    {
                        $match: {
                            kullaniciId:
                                new mongoose.Types.ObjectId(
                                    String(kullaniciId)
                                ),
                            dersId: { $in: dersIds },
                        },
                    },
                    {
                        $group: {
                            _id: "$dersId",
                            count: { $sum: 1 },
                        },
                    },
                ])
                : [];

        const sayilar = new Map(
            materyalCounts.map((item) => [
                String(item._id),
                item.count,
            ])
        );

        const derslerWithCount = dersler.map(
            (ders) => ({
                ...ders,
                materyalSayisi:
                    sayilar.get(String(ders._id)) || 0,
            })
        );

        return res.status(200).json({
            basarili: true,
            dersSayisi: derslerWithCount.length,
            dersler: derslerWithCount,
        });
    } catch (hata) {
        console.error(
            "Dersleri getirme hatası:",
            hata
        );

        return res.status(500).json({
            hata: "Dersler getirilemedi.",
        });
    }
};

/* =========================
   Tek Ders Getir
========================= */

export const dersGetir = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                hata: "Geçersiz ders ID.",
            });
        }

        const ders = await Ders.findOne({
            _id: req.params.id,
            kullaniciId: req.user._id,
            durum: { $ne: "hazirlaniyor" },
        });

        if (!ders) {
            return res.status(404).json({
                hata: "Ders bulunamadı.",
            });
        }

        return res.status(200).json({
            basarili: true,
            ders,
        });
    } catch (hata) {
        return res.status(500).json({
            hata: hata.message,
        });
    }
};

/* =========================
   Ders Güncelle
========================= */

export const dersGuncelle = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                hata: "Geçersiz ders ID.",
            });
        }

        const izinliAlanlar = [
            "dersAdi",
            "aciklama",
            "donem",
            "dersKodu",
            "renk",
            "simge",
        ];

        const guncellemeler = {};

        for (const alan of izinliAlanlar) {
            if (
                Object.prototype.hasOwnProperty.call(
                    req.body,
                    alan
                )
            ) {
                if (typeof req.body[alan] !== "string") {
                    return res.status(400).json({
                        hata:
                            `${alan} metin olmalıdır.`,
                    });
                }

                guncellemeler[alan] =
                    req.body[alan].trim();
            }
        }

        if (
            Object.prototype.hasOwnProperty.call(
                guncellemeler,
                "dersAdi"
            ) &&
            !guncellemeler.dersAdi
        ) {
            return res.status(400).json({
                hata: "Ders adı boş olamaz.",
            });
        }

        const ders = await Ders.findOneAndUpdate(
            {
                _id: req.params.id,
                kullaniciId: req.user._id,
                durum: { $ne: "hazirlaniyor" },
            },
            {
                $set: guncellemeler,
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!ders) {
            return res.status(404).json({
                hata: "Ders bulunamadı.",
            });
        }

        return res.status(200).json({
            basarili: true,
            mesaj: "Ders başarıyla güncellendi.",
            ders,
        });
    } catch (hata) {
        return res.status(500).json({
            hata: hata.message,
        });
    }
};

/* =========================
   Ders Sil
========================= */

export const dersSil = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                hata: "Geçersiz ders ID.",
            });
        }

        const ders = await Ders.findOne({
            _id: req.params.id,
            kullaniciId: req.user._id,
        });

        if (!ders) {
            return res.status(404).json({
                hata: "Ders bulunamadı.",
            });
        }

        // Devam eden materyal işlemlerini durdur.
        await Materyal.updateMany(
            {
                dersId: ders._id,
                kullaniciId: req.user._id,
            },
            {
                $set: {
                    durum: "siliniyor",
                },
            }
        );

        // Metin parçalarını temizle.
        await MetinParcasi.deleteMany({
            dersId: ders._id,
            kullaniciId: req.user._id,
        });

        // Fiziksel dosyaları ve materyal kayıtlarını sil.
        const materyaller = await Materyal.find({
            dersId: ders._id,
            kullaniciId: req.user._id,
        });

        for (const materyal of materyaller) {
            guvenliDosyaSil(
                materyal.dosyaYolu
            );

            await Materyal.deleteOne({
                _id: materyal._id,
                kullaniciId: req.user._id,
            });
        }

        // Eşzamanlı işlemlerden kalabilecek parçaları temizle.
        await MetinParcasi.deleteMany({
            dersId: ders._id,
            kullaniciId: req.user._id,
        });

        // Konu haritasını sil.
        await KonuHaritasi.deleteMany({
            dersId: ders._id,
            kullaniciId: req.user._id,
        });

        // Tamamlanmış taslağın silinen derse
        // işaret etmesini önle.
        await DersTaslagi.deleteMany({
            olusturulanDersId: ders._id,
            kullaniciId: req.user._id,
            durum: "tamamlandi",
        });

        // Resmi dersi sil.
        await Ders.deleteOne({
            _id: ders._id,
            kullaniciId: req.user._id,
        });

        return res.status(200).json({
            basarili: true,
            mesaj: "Ders başarıyla silindi.",
        });
    } catch (hata) {
        console.error(
            "Ders silme hatası:",
            hata
        );

        return res.status(500).json({
            hata:
                "Ders silinirken bir hata oluştu.",
        });
    }
};

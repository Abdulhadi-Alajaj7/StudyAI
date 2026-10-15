import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import {
    konuHaritasiUretVeKaydet,
    konuHaritasiGuncellikKontrolu
} from "../services/konuHaritasiService.js";
import { geminiBaglantisiniDogrula, VARSAYILAN_GEMINI_MODELI } from "../services/geminiService.js";

/**
 * GET /dersler/:id/konu-haritasi
 * Dersin kayıtlı konu haritasını, durumunu ve güncellik bilgisini getirir.
 */

export const konuHaritasiniGetir = async (req, res) => {
    try {
        const dersId = req.params.id;
        const kullaniciId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(dersId)) {
            return res.status(400).json({
                hata: "Geçersiz ders kimliği."
            });
        }

        const ders = await Ders.findOne({ _id: dersId, kullaniciId });

        if (!ders) {
            return res.status(404).json({
                hata: "Ders bulunamadı veya yetkiniz yok."
            });
        }

        // Materyallerin gerçek işleme durumlarını kontrol et.
        const materyalDurumlari = await Materyal.aggregate([
            {
                $match: {
                    dersId: new mongoose.Types.ObjectId(dersId),
                    kullaniciId: new mongoose.Types.ObjectId(
                        kullaniciId.toString()
                    )
                }
            },
            {
                $group: {
                    _id: "$durum",
                    sayi: { $sum: 1 }
                }
            }
        ]);

        const durumSayilari = Object.fromEntries(
            materyalDurumlari.map(item => [item._id, item.sayi])
        );

        const toplamMateryalSayisi = materyalDurumlari.reduce(
            (toplam, item) => toplam + item.sayi,
            0
        );

        const islenenMateryalSayisi =
            (durumSayilari.yuklendi || 0) +
            (durumSayilari.isleniyor || 0) +
            (durumSayilari.siliniyor || 0);

        const hataliMateryalSayisi = durumSayilari.hata || 0;

        const hazirMateryalSayisi = await Materyal.countDocuments({
            dersId,
            kullaniciId,
            durum: "hazir",
            aktifIslemeId: { $ne: null }
        });

        const konuHaritasi = await KonuHaritasi.findOne({
            dersId,
            kullaniciId
        });

        const guncelMi = konuHaritasi
            ? await konuHaritasiGuncellikKontrolu(
                konuHaritasi,
                dersId,
                kullaniciId
            )
            : false;

        const haritaHazirMi =
            konuHaritasi?.durum === "hazir" && guncelMi;

        const islemDevamEdiyor =
            islenenMateryalSayisi > 0 ||
            konuHaritasi?.durum === "olusturuluyor";

        const devamEdilebilirMi =
            toplamMateryalSayisi > 0 &&
            !islemDevamEdiyor &&
            hataliMateryalSayisi === 0 &&
            haritaHazirMi;

        const dahaSonraEklenebilirMi =
            toplamMateryalSayisi === 0;

        return res.status(200).json({
            durum: konuHaritasi?.durum || "yok",
            harita: konuHaritasi || null,
            toplamMateryalSayisi,
            hazirMateryalSayisi,
            islenenMateryalSayisi,
            hataliMateryalSayisi,
            guncelMi,
            islemDevamEdiyor,
            devamEdilebilirMi,
            dahaSonraEklenebilirMi,
            olusturmaHatasi: konuHaritasi?.olusturmaHatasi || ""
        });

    } catch (error) {
        console.error("Konu haritası getirme hatası:", error);

        return res.status(500).json({
            hata: "Konu haritası alınırken bir sunucu hatası oluştu."
        });
    }
};


/**
 * POST /dersler/:id/konu-haritasi
 * Konu haritası üretimini başlatır veya var olan haritayı yeniden üretir.
 */
export const konuHaritasiOlustur = async (req, res) => {
    try {
        const dersId = req.params.id;
        const kullaniciId = req.user._id;

        if (!mongoose.Types.ObjectId.isValid(dersId)) {
            return res.status(400).json({ hata: "Geçersiz ders kimliği." });
        }

        // 1. Ders varlığı ve yetki kontrolü
        const ders = await Ders.findOne({ _id: dersId, kullaniciId });
        if (!ders) {
            return res.status(404).json({ hata: "Ders bulunamadı veya yetkiniz yok." });
        }

        // 2. Hazır materyal kontrolü
        const hazirMateryalSayisi = await Materyal.countDocuments({
            dersId,
            kullaniciId,
            durum: "hazir",
            aktifIslemeId: { $ne: null }
        });

        if (hazirMateryalSayisi === 0) {
            return res.status(400).json({
                hata: "Konu haritası oluşturmak için işlenmiş en az bir hazır materyal gereklidir."
            });
        }

        // 3. Eşzamanlı istek kontrolü ve kilit tokenı
        const yeniIslemToken = new mongoose.Types.ObjectId();

        // Atomik upsert / lock
        let harita = await KonuHaritasi.findOne({ dersId, kullaniciId });

        if (harita && harita.durum === "olusturuluyor") {
            const KILIT_ZAMAN_ASIMI_MS = 5 * 60 * 1000;
            const sonGuncelleme = harita.updatedAt ? new Date(harita.updatedAt).getTime() : 0;
            if (Date.now() - sonGuncelleme < KILIT_ZAMAN_ASIMI_MS) {
                return res.status(409).json({
                    hata: "Bu ders için şu anda zaten bir konu haritası oluşturuluyor. Lütfen işlemin tamamlanmasını bekleyin."
                });
            }
        }

        if (!harita) {
            try {
                harita = await KonuHaritasi.create({
                    dersId,
                    kullaniciId,
                    durum: "olusturuluyor",
                    olusturmaHatasi: "",
                    aktifIslemToken: yeniIslemToken
                });
            } catch (error) {
                // Aynı ders için iki eşzamanlı ilk oluşturma isteği
                // geldiğinde unique index yalnızca bir kayda izin verir.
                if (error.code === 11000) {
                    return res.status(409).json({
                        hata: "Bu ders için konu haritası oluşturma işlemi zaten başlatılmış. Lütfen mevcut işlemin tamamlanmasını bekleyin."
                    });
                }

                throw error;
            }
        } else {
            // Var olan harita üzerinde kilidi al (durum: olusturuluyor yap ama eski anaKonulari henüz silme!)
            harita = await KonuHaritasi.findOneAndUpdate(
                {
                    _id: harita._id,
                    $or: [
                        { durum: { $ne: "olusturuluyor" } },
                        { updatedAt: { $lt: new Date(Date.now() - 5 * 60 * 1000) } }
                    ]
                },
                {
                    $set: {
                        durum: "olusturuluyor",
                        olusturmaHatasi: "",
                        aktifIslemToken: yeniIslemToken
                    }
                },
                { new: true }
            );

            if (!harita) {
                return res.status(409).json({ hata: "Konu haritası şu anda zaten oluşturuluyor." });
            }
        }

        // 4. Gemini ile analiz ve harita üretimi
        try {
            const tamamlananHarita = await konuHaritasiUretVeKaydet(ders, kullaniciId, yeniIslemToken);
            if (!tamamlananHarita) {
                // Analiz sırasında materyal değişti veya işlem iptal edildi
                const guncel = await KonuHaritasi.findOne({ dersId, kullaniciId });
                return res.status(409).json({
                    hata: guncel?.olusturmaHatasi || "Materyaller işlem sırasında değiştiği için analiz tamamlanamadı.",
                    durum: guncel?.durum || "hata",
                    harita: guncel
                });
            }

            return res.status(200).json({
                mesaj: "Konu haritası başarıyla oluşturuldu.",
                durum: "hazir",
                harita: tamamlananHarita
            });
        } catch (uretmeHatasi) {
            // Hata detayını güvenli ve hassas bilgi içermeyen Türkçe hata mesajı olarak dön
            let hataMesaji = uretmeHatasi.message || "Konu haritası üretilemedi.";
            if (uretmeHatasi.kod === "EKSİK_API_KEY" || hataMesaji.includes("GEMINI_API_KEY")) {
                hataMesaji = "Sistemde Gemini API anahtarı yapılandırılmamış. Lütfen yöneticiye başvurun.";
            } else if (hataMesaji.includes("429") || hataMesaji.toLowerCase().includes("quota")) {
                hataMesaji = "Gemini API istek kotası aşıldı. Lütfen birkaç dakika sonra tekrar deneyin.";
            } else if (hataMesaji.includes("503") || hataMesaji.toLowerCase().includes("unavailable")) {
                hataMesaji = "Gemini servisi şu anda geçici olarak kullanılamıyor. Lütfen daha sonra tekrar deneyin.";
            } else if (hataMesaji.toLowerCase().includes("timeout")) {
                hataMesaji = "Gemini analiz isteği zaman aşımına uğradı. Lütfen tekrar deneyin.";
            }

            // Mevcut harita durumunu sorgula (varsa önceki başarılı konuları da dönebilmek için)
            const guncelHarita = await KonuHaritasi.findOne({ dersId, kullaniciId });

            return res.status(400).json({
                hata: hataMesaji,
                durum: guncelHarita?.durum || "hata",
                harita: guncelHarita
            });
        }

    } catch (error) {
        console.error("Konu haritası oluşturma endpoint hatası:", error);
        return res.status(500).json({ hata: "Konu haritası isteği işlenirken sunucu hatası oluştu: " + error.message });
    }
};

/**
 * GET /dersler/gemini-durum
 * Gemini model erişimini ve bağlantı sağlığını canlı test eder.
 */
export const geminiDurumuGetir = async (req, res) => {
    try {
        const sonuc = await geminiBaglantisiniDogrula(VARSAYILAN_GEMINI_MODELI);
        return res.status(sonuc.basarili ? 200 : 503).json(sonuc);
    } catch (error) {
        return res.status(500).json({
            basarili: false,
            model: VARSAYILAN_GEMINI_MODELI,
            mesaj: "Gemini sağlık kontrolü sırasında hata: " + error.message
        });
    }
};

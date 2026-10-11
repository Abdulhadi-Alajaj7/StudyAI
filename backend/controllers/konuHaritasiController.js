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
            return res.status(400).json({ hata: "Geçersiz ders kimliği." });
        }

        // 1. Ders varlığı ve kullanıcı sahipliği
        const ders = await Ders.findOne({ _id: dersId, kullaniciId });
        if (!ders) {
            return res.status(404).json({ hata: "Ders bulunamadı veya yetkiniz yok." });
        }

        // 2. Dersteki hazır materyal sayısı
        const hazirMateryalSayisi = await Materyal.countDocuments({
            dersId,
            kullaniciId,
            durum: "hazir",
            aktifIslemeId: { $ne: null }
        });

        // 3. Konu haritasını bul
        const konuHaritasi = await KonuHaritasi.findOne({ dersId, kullaniciId });

        if (!konuHaritasi) {
            return res.status(200).json({
                durum: "yok",
                harita: null,
                hazirMateryalSayisi,
                guncelMi: false,
                mesaj: hazirMateryalSayisi > 0 
                    ? "Konu haritası henüz oluşturulmadı. Hazır materyallerinizden harita oluşturabilirsiniz." 
                    : "Konu haritası oluşturmak için önce en az bir materyal yükleyip işlenmesini beklemelisiniz."
            });
        }

        // 4. Güncellik kontrolü
        const guncelMi = await konuHaritasiGuncellikKontrolu(konuHaritasi, dersId, kullaniciId);

        return res.status(200).json({
            durum: konuHaritasi.durum,
            harita: konuHaritasi,
            hazirMateryalSayisi,
            guncelMi,
            olusturmaHatasi: konuHaritasi.olusturmaHatasi || ""
        });
    } catch (error) {
        console.error("Konu haritası getirme hatası:", error);
        return res.status(500).json({ hata: "Konu haritası alınırken bir sunucu hatası oluştu: " + error.message });
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
            return res.status(409).json({ 
                hata: "Bu ders için şu anda zaten bir konu haritası oluşturuluyor. Lütfen işlemin tamamlanmasını bekleyin." 
            });
        }

        if (!harita) {
            harita = await KonuHaritasi.create({
                dersId,
                kullaniciId,
                durum: "olusturuluyor",
                olusturmaHatasi: "",
                aktifIslemToken: yeniIslemToken
            });
        } else {
            // Var olan harita üzerinde kilidi al (durum: olusturuluyor yap ama eski anaKonulari henüz silme!)
            harita = await KonuHaritasi.findOneAndUpdate(
                { _id: harita._id, durum: { $ne: "olusturuluyor" } },
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
            return res.status(200).json({
                mesaj: "Konu haritası başarıyla oluşturuldu.",
                durum: "hazir",
                harita: tamamlananHarita
            });
        } catch (uretmeHatasi) {
            // Hata detayını güvenli Türkçe hata mesajı olarak dön
            let hataMesaji = uretmeHatasi.message || "Konu haritası üretilemedi.";
            if (uretmeHatasi.kod === "EKSİK_API_KEY") {
                hataMesaji = "Sistemde Gemini API anahtarı yapılandırılmamış. Lütfen yöneticiye başvurun.";
            }
            return res.status(400).json({
                hata: hataMesaji,
                durum: "hata"
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

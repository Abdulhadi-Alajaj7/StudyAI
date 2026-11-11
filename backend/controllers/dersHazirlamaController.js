import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import { hazirlamayiBaslat, dersiHazirla, yarimKalanHazirlamayiKurtar } from "../services/dersHazirlamaService.js";

export const dersHazirlamayiBaslat = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ hata: "Geçersiz ders kimliği." });
    try {
        const sonuc = await hazirlamayiBaslat(req.params.id, req.user._id);
        if (sonuc.yeni) {
            void dersiHazirla(sonuc.ders, req.user._id, sonuc.token).catch(() => {
                console.error("[DersHazirlama] Durum kaydı başarısız; süreli kilit üzerinden kurtarılacak.");
            });
        }
        return res.status(sonuc.ders.materyallerOnaylandi ? 200 : 202).json({ basarili: true, ders: sonuc.ders });
    } catch (hata) {
        return res.status(hata.status || 500).json({ hata: hata.status ? hata.message : "Hazırlama başlatılamadı. Lütfen tekrar deneyin." });
    }
};

export const dersHazirlamaDurumu = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ hata: "Geçersiz ders kimliği." });
    try {
        await yarimKalanHazirlamayiKurtar(req.params.id, req.user._id);
        const ders = await Ders.findOne({ _id: req.params.id, kullaniciId: req.user._id, temizleniyor: { $ne: true } });
        if (!ders) return res.status(404).json({ hata: "Ders bulunamadı." });
        return res.json({ ders });
    } catch {
        return res.status(500).json({ hata: "Hazırlama durumu alınamadı. Lütfen tekrar deneyin." });
    }
};

// Eski istemciler son onayı atlayarak Gemini üretimi başlatamaz.
export const haritaIcinOnayGerekli = async (req, res) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) return res.status(400).json({ hata: "Geçersiz ders kimliği." });
    return res.status(409).json({ hata: "Konu haritası yalnızca materyal onayından sonraki ders hazırlama işlemi içinde oluşturulabilir. Onaylı derslerin haritası değiştirilemez." });
};

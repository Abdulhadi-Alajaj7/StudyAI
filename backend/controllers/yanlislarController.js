import mongoose from "mongoose";
import { TEKRAR_SORU_SINIRI, YANLIS_DURUMLARI, tekrarTestiOlustur, yanlislariGetir } from "../services/yanlislarService.js";

const gecerliId = deger => typeof deger === "string" && mongoose.isObjectIdOrHexString(deger);

export const yanlislariListele = async (req, res) => {
    const { dersId, konuId, durum } = req.query;
    if ((dersId !== undefined && !gecerliId(dersId)) ||
        (konuId !== undefined && (typeof konuId !== "string" || konuId.length > 200)) ||
        (durum !== undefined && !YANLIS_DURUMLARI.includes(durum))) {
        return res.status(400).json({ hata: "Geçersiz ders, konu veya durum filtresi." });
    }
    try {
        const sorular = await yanlislariGetir(req.user._id, { dersId, konuId, durum });
        return res.json({ sorular });
    } catch {
        return res.status(500).json({ hata: "Yanlışlarım listesi yüklenemedi." });
    }
};

export const tekrarTestiHazirla = async (req, res) => {
    const { dersId, soruIds } = req.body || {};
    if (!gecerliId(dersId) || !Array.isArray(soruIds) || soruIds.length < 1 ||
        soruIds.length > TEKRAR_SORU_SINIRI || !soruIds.every(gecerliId)) {
        return res.status(400).json({ hata: "Tekrar testi için bir dersten 1–20 soru seçin." });
    }
    const kimlikler = soruIds.map(id => id.toLowerCase());
    if (new Set(kimlikler).size !== kimlikler.length) {
        return res.status(400).json({ hata: "Aynı soruyu birden fazla kez seçemezsiniz." });
    }
    try {
        const test = await tekrarTestiOlustur(req.user._id, dersId, kimlikler);
        if (!test) return res.status(404).json({ hata: "Seçilen sorular bu dersin Yanlışlarım listesinde bulunamadı." });
        return res.status(201).json(test);
    } catch {
        return res.status(500).json({ hata: "Tekrar testi oluşturulamadı." });
    }
};

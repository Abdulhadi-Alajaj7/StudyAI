import mongoose from "mongoose";
import { dersGenelBakisiniGetir } from "../services/dersGenelBakisService.js";

export const dersGenelBakisiGetir = async (req, res) => {
    const dersId = req.params.id;
    if (!mongoose.Types.ObjectId.isValid(dersId)) return res.status(400).json({ hata: "Geçersiz ders kimliği." });
    try {
        const veri = await dersGenelBakisiniGetir({ dersId, kullaniciId: req.user._id }, {
            sadeceHakimiyet: req.query.ozet === "hakimiyet"
        });
        if (!veri) return res.status(404).json({ hata: "Ders bulunamadı veya yetkiniz yok." });
        return res.json(veri);
    } catch {
        return res.status(500).json({ hata: "Ders performansı yüklenemedi." });
    }
};

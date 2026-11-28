import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import { konuHakimiyetiniGetir } from "../services/konuHakimiyetService.js";

export const dersKonuHakimiyetiniGetir = async (req, res) => {
    const dersId = req.params.id;
    const kullaniciId = req.user._id;
    if (!mongoose.Types.ObjectId.isValid(dersId)) {
        return res.status(400).json({ hata: "Geçersiz ders kimliği." });
    }

    try {
        if (!await Ders.exists({ _id: dersId, kullaniciId })) {
            return res.status(404).json({ hata: "Ders bulunamadı veya yetkiniz yok." });
        }
        const altKonular = await konuHakimiyetiniGetir(dersId, kullaniciId);
        return res.status(200).json({ altKonular });
    } catch {
        return res.status(500).json({ hata: "Konu hâkimiyeti analizi yüklenemedi." });
    }
};

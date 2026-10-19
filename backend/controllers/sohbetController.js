import mongoose from "mongoose";
import {
    SohbetHatasi,
    sohbetBasliginiDegistir,
    sohbetGetir,
    sohbetMesajlariniGetir,
    sohbetOlustur,
    sohbetSil,
    sohbetleriListele,
} from "../services/sohbetService.js";

const ILK_MESAJ_MAKSIMUM_UZUNLUK = 4_000;
const BASLIK_MAKSIMUM_UZUNLUK = 100;
const ISTEK_ID_DESENI = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const hataYaniti = (res, hata) => {
    if (hata instanceof SohbetHatasi) {
        return res.status(hata.status).json({ hata: hata.message, kod: hata.kod });
    }
    if (hata?.name === "ValidationError" || hata?.name === "CastError") {
        return res.status(400).json({
            hata: "Gönderilen sohbet bilgileri geçersiz.",
            kod: "GECERSIZ_SOHBET_VERISI",
        });
    }
    if (hata?.code === 11000) {
        return res.status(409).json({
            hata: "Bu istek daha önce işlendi. Sohbet listesini yenileyip tekrar deneyin.",
            kod: "TEKRAR_ISTEK",
        });
    }

    console.error("Sohbet işlemi hatası:", hata);
    return res.status(500).json({
        hata: "Sohbet işlemi sırasında bir sunucu hatası oluştu.",
        kod: "SOHBET_SUNUCU_HATASI",
    });
};

const kimlikleriDogrula = ({ dersId, sohbetId = null, cursor = null }) => {
    if (!mongoose.Types.ObjectId.isValid(dersId)) {
        return { hata: "Geçersiz ders kimliği.", kod: "GECERSIZ_DERS_ID" };
    }
    if (sohbetId && !mongoose.Types.ObjectId.isValid(sohbetId)) {
        return { hata: "Geçersiz sohbet kimliği.", kod: "GECERSIZ_SOHBET_ID" };
    }
    if (cursor && !mongoose.Types.ObjectId.isValid(cursor)) {
        return { hata: "Geçersiz sayfalama bilgisi.", kod: "GECERSIZ_CURSOR" };
    }
    return null;
};

const limitGetir = (deger, varsayilan, enFazla) => {
    if (deger === undefined) return varsayilan;
    const metin = String(deger);
    if (!/^\d+$/.test(metin)) return null;
    const sayi = Number.parseInt(metin, 10);
    if (!Number.isInteger(sayi) || sayi < 1) return null;
    return Math.min(sayi, enFazla);
};

export const sohbetOlusturmaGirdisiniDogrula = (govde = {}) => {
    const ilkMesaj = typeof govde.ilkMesaj === "string" ? govde.ilkMesaj.trim() : "";
    if (!ilkMesaj || ilkMesaj.length > ILK_MESAJ_MAKSIMUM_UZUNLUK) {
        return {
            hata: `İlk mesaj 1-${ILK_MESAJ_MAKSIMUM_UZUNLUK} karakter arasında olmalıdır.`,
            kod: "GECERSIZ_ILK_MESAJ",
        };
    }

    const istemciIstekId = typeof govde.istemciIstekId === "string"
        ? govde.istemciIstekId.trim()
        : "";
    if (!ISTEK_ID_DESENI.test(istemciIstekId)) {
        return {
            hata: "Geçerli bir istemci istek kimliği gönderilmelidir.",
            kod: "GECERSIZ_ISTEK_ID",
        };
    }

    return { ilkMesaj, istemciIstekId };
};

export const sohbetBasligiGirdisiniDogrula = (govde = {}) => {
    const baslik = typeof govde.baslik === "string" ? govde.baslik.trim() : "";
    if (!baslik || baslik.length > BASLIK_MAKSIMUM_UZUNLUK) {
        return {
            hata: `Sohbet başlığı 1-${BASLIK_MAKSIMUM_UZUNLUK} karakter arasında olmalıdır.`,
            kod: "GECERSIZ_SOHBET_BASLIGI",
        };
    }
    return { baslik };
};

export const sohbetleriGetir = async (req, res) => {
    const dogrulamaHatasi = kimlikleriDogrula({
        dersId: req.params.dersId,
        cursor: req.query.cursor,
    });
    if (dogrulamaHatasi) return res.status(400).json(dogrulamaHatasi);

    const limit = limitGetir(req.query.limit, 20, 50);
    if (limit == null) {
        return res.status(400).json({
            hata: "Sohbet listeleme limiti pozitif bir tam sayı olmalıdır.",
            kod: "GECERSIZ_LIMIT",
        });
    }

    try {
        const sonuc = await sohbetleriListele({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            limit,
            cursor: req.query.cursor || null,
        });
        return res.status(200).json(sonuc);
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const yeniSohbetOlustur = async (req, res) => {
    const dogrulamaHatasi = kimlikleriDogrula({ dersId: req.params.dersId });
    if (dogrulamaHatasi) return res.status(400).json(dogrulamaHatasi);

    const girdi = sohbetOlusturmaGirdisiniDogrula(req.body);
    if (girdi.hata) return res.status(400).json(girdi);

    try {
        const sonuc = await sohbetOlustur({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            ilkMesaj: girdi.ilkMesaj,
            istemciIstekId: girdi.istemciIstekId,
        });
        return res.status(sonuc.tekrar ? 200 : 201).json(sonuc);
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const tekSohbetGetir = async (req, res) => {
    const dogrulamaHatasi = kimlikleriDogrula(req.params);
    if (dogrulamaHatasi) return res.status(400).json(dogrulamaHatasi);

    try {
        const sohbet = await sohbetGetir({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            sohbetId: req.params.sohbetId,
        });
        return res.status(200).json({ sohbet });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const sohbetMesajlariniListele = async (req, res) => {
    const dogrulamaHatasi = kimlikleriDogrula({
        ...req.params,
        cursor: req.query.cursor,
    });
    if (dogrulamaHatasi) return res.status(400).json(dogrulamaHatasi);

    const limit = limitGetir(req.query.limit, 50, 100);
    if (limit == null) {
        return res.status(400).json({
            hata: "Mesaj listeleme limiti pozitif bir tam sayı olmalıdır.",
            kod: "GECERSIZ_LIMIT",
        });
    }

    try {
        const sonuc = await sohbetMesajlariniGetir({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            sohbetId: req.params.sohbetId,
            limit,
            cursor: req.query.cursor || null,
        });
        return res.status(200).json(sonuc);
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const sohbetBasliginiGuncelle = async (req, res) => {
    const dogrulamaHatasi = kimlikleriDogrula(req.params);
    if (dogrulamaHatasi) return res.status(400).json(dogrulamaHatasi);

    const girdi = sohbetBasligiGirdisiniDogrula(req.body);
    if (girdi.hata) return res.status(400).json(girdi);

    try {
        const sohbet = await sohbetBasliginiDegistir({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            sohbetId: req.params.sohbetId,
            baslik: girdi.baslik,
        });
        return res.status(200).json({
            mesaj: "Sohbet başlığı güncellendi.",
            sohbet,
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const sohbetiSil = async (req, res) => {
    const dogrulamaHatasi = kimlikleriDogrula(req.params);
    if (dogrulamaHatasi) return res.status(400).json(dogrulamaHatasi);

    try {
        await sohbetSil({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            sohbetId: req.params.sohbetId,
        });
        return res.status(200).json({ mesaj: "Sohbet başarıyla silindi." });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

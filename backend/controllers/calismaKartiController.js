import mongoose from "mongoose";
import { haritaTabanliKartlariOlustur } from "../services/haritaTabanliKartService.js";
import {
    calismaKartlariDurumunuGetir,
    calismaKartiDurumuGuncelle,
} from "../services/calismaKartiService.js";

const gecerliId = (id) => mongoose.Types.ObjectId.isValid(id);

const hataYaniti = (res, hata) => {
    const status = Number.isInteger(hata?.status) && hata.status >= 400 ? hata.status : 500;
    const kod = typeof hata?.kod === "string" ? hata.kod : "KART_SUNUCU_HATASI";
    const kotaTuru = ["gunluk", "rpm", "tpm"].includes(hata?.tanilama?.kotaTuru)
        ? hata.tanilama.kotaTuru : "bilinmiyor";
    const retryAfterMs = status === 429
        ? Math.min(120_000, Math.max(0, Number(hata?.retryAfterMs) || 60_000))
        : null;
    // Kullanıcı verisi, prompt, API anahtarı veya sağlayıcının ham hata gövdesi loglanmaz.
    console.warn("[CalismaKartlari] Üretim hatası:", { status, kod, kotaTuru, retryAfterMs });
    if (status === 429) res.setHeader("Retry-After", String(Math.ceil(retryAfterMs / 1000)));
    return res.status(status).json({
        hata: status === 500
            ? "Çalışma kartları işlemi tamamlanamadı."
            : (hata.message || "Çalışma kartları işlemi tamamlanamadı."),
        kod,
        ...(status === 429 ? { kotaTuru, retryAfterMs } : {}),
    });
};

export const kartlariGetir = async (req, res) => {
    if (!gecerliId(req.params.dersId)) {
        return res.status(400).json({ hata: "Geçersiz ders kimliği." });
    }
    try {
        const sonuc = await calismaKartlariDurumunuGetir({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
        });
        return res.json(sonuc);
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const kartlariOlustur = async (req, res) => {
    if (!gecerliId(req.params.dersId)) {
        return res.status(400).json({ hata: "Geçersiz ders kimliği." });
    }
    try {
        // Tüm oluşturma istekleri artık konu haritası + dersin bütün metinleriyle
        // çalışır. Eski kelime-eşleştirmeli konu başına parça seçimi kullanılmaz.
        const sonuc = await haritaTabanliKartlariOlustur({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
        });
        return res.status(sonuc.tamamlandi ? 201 : 202).json(sonuc);
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const kartDurumunuGuncelle = async (req, res) => {
    if (!gecerliId(req.params.dersId) || !gecerliId(req.params.kartId)) {
        return res.status(400).json({ hata: "Geçersiz kimlik." });
    }
    const girdi = req.body;
    if (!girdi || (typeof girdi.goruldu !== "boolean" &&
        typeof girdi.yildizli !== "boolean" &&
        !["zor", "orta", "kolay"].includes(girdi.zorluk))) {
        return res.status(400).json({ hata: "Geçersiz kart durumu." });
    }
    try {
        const kart = await calismaKartiDurumuGuncelle({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            kartId: req.params.kartId,
            goruldu: girdi.goruldu,
            yildizli: girdi.yildizli,
            zorluk: girdi.zorluk,
        });
        return res.json({ kart });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

import mongoose from "mongoose";
import { GeminiSohbetHatasi } from "../services/geminiService.js";
import {
    CalismaKartiHatasi, calismaKartlariniGetir, calismaKartlariniOlustur,
    kartDurumunuGuncelle, kartiDegerlendir,
} from "../services/calismaKartlariService.js";

export const kartGirdisiniDogrula = (req, tur) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.dersId) ||
        (tur !== "getir" && tur !== "olustur" && !mongoose.Types.ObjectId.isValid(req.params.kartId))) {
        throw new CalismaKartiHatasi("Geçersiz ders veya kart kimliği.", "KART_GECERSIZ_GIRDI", 400);
    }
    const body = req.body || {};
    if (tur === "olustur" && Object.keys(body).length) throw new CalismaKartiHatasi("Kartlar ders konularına göre otomatik planlanır; ek seçim gönderilmemeli.", "KART_GECERSIZ_GIRDI", 400);
    if (tur === "durum" && (Object.keys(body).some(k => !["goruldu", "yildizli"].includes(k)) ||
        (!Object.hasOwn(body, "goruldu") && !Object.hasOwn(body, "yildizli")) ||
        (Object.hasOwn(body, "goruldu") && body.goruldu !== true) ||
        (Object.hasOwn(body, "yildizli") && typeof body.yildizli !== "boolean"))) {
        throw new CalismaKartiHatasi("Geçersiz kart durumu.", "KART_GECERSIZ_GIRDI", 400);
    }
    if (tur === "degerlendirme" && (Object.keys(body).some(k => !["degerlendirme", "istemciIstekId"].includes(k)) ||
        !["tekrar", "zor", "orta", "kolay"].includes(body.degerlendirme) || typeof body.istemciIstekId !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(body.istemciIstekId))) {
        throw new CalismaKartiHatasi("Geçersiz kart değerlendirmesi.", "KART_GECERSIZ_GIRDI", 400);
    }
    return { kullaniciId: req.user._id, dersId: req.params.dersId, kartId: req.params.kartId,
        ...(tur === "durum" || tur === "degerlendirme" ? body : {}) };
};

const yanitla = (tur, islem) => async (req, res) => {
    try {
        const girdi = kartGirdisiniDogrula(req, tur);
        const sonuc = await islem(girdi);
        const kod = tur === "olustur" && sonuc.durum === "olusturuluyor" ? 202 : 200;
        return res.status(kod).json({ basarili: true, ...(tur === "durum" ? { durum: sonuc } : tur === "degerlendirme" ? { degerlendirme: sonuc } : sonuc) });
    } catch (hata) {
        if (hata instanceof CalismaKartiHatasi || hata instanceof GeminiSohbetHatasi) return res.status(hata.status).json({ hata: hata.message, kod: hata.kod });
        console.error("Çalışma kartları işlemi tamamlanamadı.", { kod: "KART_SUNUCU_HATASI" });
        return res.status(500).json({ hata: "Çalışma kartları işlemi tamamlanamadı. Lütfen yeniden deneyin.", kod: "KART_SUNUCU_HATASI" });
    }
};
export const kartlariGetir = yanitla("getir", calismaKartlariniGetir);
export const kartlariOlustur = yanitla("olustur", calismaKartlariniOlustur);
export const kartDurumunuKaydet = yanitla("durum", kartDurumunuGuncelle);
export const kartDegerlendirmesiniKaydet = yanitla("degerlendirme", kartiDegerlendir);

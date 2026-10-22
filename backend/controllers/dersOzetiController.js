import mongoose from "mongoose";
import {
    DersOzetiHatasi,
    dersOzetiOlustur as dersOzetiOlusturService,
    kayitliDersOzetiniGetir,
} from "../services/dersOzetiService.js";

const OZET_TURLERI = new Set(["tum_ders", "materyal", "konu"]);
const OZET_UZUNLUKLARI = new Set(["kisa", "orta", "uzun"]);

export const dersOzetiGirdisiniDogrula = (dersId, girdi = {}) => {
    if (!mongoose.Types.ObjectId.isValid(dersId)) {
        return { hata: "Geçersiz ders kimliği.", kod: "GECERSIZ_DERS_ID" };
    }

    const tur = typeof girdi.tur === "string" ? girdi.tur.trim() : "";
    if (!OZET_TURLERI.has(tur)) {
        return {
            hata: "Özet türü tum_ders, materyal veya konu olmalıdır.",
            kod: "GECERSIZ_OZET_TURU",
        };
    }

    const uzunluk = typeof girdi.uzunluk === "string"
        ? girdi.uzunluk.trim()
        : "";
    if (!OZET_UZUNLUKLARI.has(uzunluk)) {
        return {
            hata: "Özet uzunluğu kisa, orta veya uzun olmalıdır.",
            kod: "GECERSIZ_OZET_UZUNLUGU",
        };
    }

    const materyalId = typeof girdi.materyalId === "string"
        ? girdi.materyalId.trim()
        : "";
    const konuId = typeof girdi.konuId === "string" ? girdi.konuId.trim() : "";

    if (tur === "materyal") {
        if (!mongoose.Types.ObjectId.isValid(materyalId)) {
            return {
                hata: "Materyal özeti için geçerli bir materyal kimliği gereklidir.",
                kod: "GECERSIZ_MATERYAL_ID",
            };
        }
        if (konuId) {
            return {
                hata: "Materyal özeti isteğinde konu kimliği gönderilemez.",
                kod: "GECERSIZ_OZET_HEDEFI",
            };
        }
    } else if (tur === "konu") {
        if (!konuId || konuId.length > 200) {
            return {
                hata: "Konu özeti için geçerli bir konu kimliği gereklidir.",
                kod: "GECERSIZ_KONU_ID",
            };
        }
        if (materyalId) {
            return {
                hata: "Konu özeti isteğinde materyal kimliği gönderilemez.",
                kod: "GECERSIZ_OZET_HEDEFI",
            };
        }
    } else if (materyalId || konuId) {
        return {
            hata: "Tüm ders özeti isteğinde materyal veya konu hedefi gönderilemez.",
            kod: "GECERSIZ_OZET_HEDEFI",
        };
    }

    return {
        tur,
        uzunluk,
        materyalId: tur === "materyal" ? materyalId : null,
        konuId: tur === "konu" ? konuId : "",
    };
};

const ozetiSunumaHazirla = (ozet) => {
    const nesne = ozet?.toObject ? ozet.toObject() : { ...ozet };
    delete nesne.aktifIslemToken;
    delete nesne.kilitSonYenilemeTarihi;
    delete nesne.hedefAnahtari;
    delete nesne.__v;
    return nesne;
};

const hataYaniti = (res, hata) => {
    if (hata instanceof DersOzetiHatasi) {
        return res.status(hata.status).json({ hata: hata.message, kod: hata.kod });
    }
    if (Number.isInteger(hata?.status) && typeof hata?.kod === "string") {
        return res.status(hata.status).json({ hata: hata.message, kod: hata.kod });
    }
    if (hata?.name === "ValidationError" || hata?.name === "CastError") {
        return res.status(400).json({
            hata: "Gönderilen ders özeti bilgileri geçersiz.",
            kod: "GECERSIZ_OZET_VERISI",
        });
    }
    if (hata?.code === 11000) {
        return res.status(409).json({
            hata: "Bu özet için başka bir oluşturma isteği zaten işlendi.",
            kod: "OZET_OLUSTURULUYOR",
        });
    }

    // Hata mesajı dışında nesneyi loglamayarak sağlayıcı yanıtı veya hassas
    // yapılandırmanın loglara taşınmasını engelle.
    console.error("Ders özeti işlemi hatası:", hata?.message || "Bilinmeyen hata");
    return res.status(500).json({
        hata: "Ders özeti işlemi sırasında bir sunucu hatası oluştu.",
        kod: "DERS_OZETI_SUNUCU_HATASI",
    });
};

const dogrulanmisGirdiyiGetir = (req, res, kaynak) => {
    const girdi = dersOzetiGirdisiniDogrula(req.params.dersId, kaynak);
    if (girdi.hata) {
        res.status(400).json(girdi);
        return null;
    }
    return girdi;
};

export const dersOzetiOlustur = async (req, res) => {
    const girdi = dogrulanmisGirdiyiGetir(req, res, req.body);
    if (!girdi) return;

    try {
        const sonuc = await dersOzetiOlusturService({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            ...girdi,
        });
        return res.status(sonuc.onbellekten ? 200 : 201).json({
            basarili: true,
            onbellekten: sonuc.onbellekten,
            ozet: ozetiSunumaHazirla(sonuc.ozet),
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const dersOzetiGetir = async (req, res) => {
    const girdi = dogrulanmisGirdiyiGetir(req, res, req.query);
    if (!girdi) return;

    try {
        const ozet = await kayitliDersOzetiniGetir({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            ...girdi,
        });
        return res.status(200).json({
            basarili: true,
            ozet: ozetiSunumaHazirla(ozet),
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const dersOzetiYenidenOlustur = async (req, res) => {
    const girdi = dogrulanmisGirdiyiGetir(req, res, req.body);
    if (!girdi) return;

    try {
        const sonuc = await dersOzetiOlusturService({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            ...girdi,
            yenidenOlustur: true,
        });
        return res.status(200).json({
            basarili: true,
            yenidenOlusturuldu: true,
            ozet: ozetiSunumaHazirla(sonuc.ozet),
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

import AuthIstekSiniri from "../models/AuthIstekSiniri.js";
import { tokenHashle } from "../utils/authGuvenligi.js";

export const authIstekSiniri = ({ kapsam, maksimum, pencereMs = 15 * 60_000, email = false,
    Model = AuthIstekSiniri, simdi = Date.now }) => async (req, res, next) => {
    const zaman = simdi(), pencere = Math.floor(zaman / pencereMs);
    const anahtarlar = [`ip:${req.ip || req.socket?.remoteAddress || "bilinmiyor"}`];
    if (email && typeof req.body?.email === "string") anahtarlar.push(`email:${req.body.email.trim().toLowerCase()}`);
    try {
        for (const anahtar of anahtarlar) await Model.findOneAndUpdate({
            _id: tokenHashle(`${kapsam}:${pencere}:${anahtar}`), sayac: { $lt: maksimum },
        }, { $inc: { sayac: 1 }, $setOnInsert: { sonTarih: new Date((pencere + 2) * pencereMs) } }, { upsert: true, setDefaultsOnInsert: false });
        next();
    } catch (hata) {
        if (hata?.code === 11000) {
            res.set("Retry-After", String(Math.ceil(((pencere + 1) * pencereMs - zaman) / 1000)));
            return res.status(429).json({ kod: "AUTH_ISTEK_SINIRI", hata: "Çok fazla istek gönderdiniz. Lütfen daha sonra tekrar deneyin." });
        }
        return res.status(503).json({ kod: "AUTH_GECICI_HATA", hata: "İşlem şu anda tamamlanamıyor. Lütfen daha sonra tekrar deneyin." });
    }
};

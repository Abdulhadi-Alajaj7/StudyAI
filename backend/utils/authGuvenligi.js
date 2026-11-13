import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";

export const tokenHashle = token => createHash("sha256").update(token).digest("hex");
export const sifirlamaTokeniGecerliMi = token => typeof token === "string" && /^[a-f0-9]{64}$/.test(token);
export const sifreGecerliMi = sifre => typeof sifre === "string" && sifre.length >= 6 && Buffer.byteLength(sifre, "utf8") <= 72;
export const oturumSurumuFiltresi = surum => surum === 0
    ? { $or: [{ oturumSurumu: 0 }, { oturumSurumu: { $exists: false } }] } : { oturumSurumu: surum };
export const oturumCookieAyarlari = (env = process.env) => ({
    httpOnly: true, secure: env.NODE_ENV === "production",
    sameSite: env.NODE_ENV === "production" ? "none" : "lax", path: "/",
});
export const oturumTokeniOlustur = kullanici => jwt.sign({ id: String(kullanici._id),
    oturumSurumu: kullanici.oturumSurumu ?? 0 }, process.env.JWT_SECRET, { algorithm: "HS256", expiresIn: "7d" });
export const oturumCookieGonder = (res, token) => res.cookie("token", token, {
    ...oturumCookieAyarlari(), maxAge: 7 * 24 * 60 * 60 * 1000,
});
export const kullaniciyiSun = k => ({ id: k.id || String(k._id), _id: String(k._id), kullaniciAdi: k.kullaniciAdi, email: k.email,
    bekleyenEmail: new Date(k.emailDegisimSonTarih).getTime() > Date.now() ? k.bekleyenEmail : undefined });

// Tarayıcı cookie'si ile yapılan auth yazımlarında CORS tek başına CSRF koruması değildir.
export const authOriginKontrolu = (req, res, next) => {
    const origin = req.get("origin");
    const izinli = (process.env.FRONTEND_URL || "http://localhost:5173").replace(/\/+$/, "");
    if ((origin && origin !== izinli) || (!origin && req.cookies?.token && !req.get("authorization"))) {
        return res.status(403).json({ kod: "AUTH_ORIGIN_GECERSIZ", hata: "İstek kaynağı doğrulanamadı." });
    }
    next();
};

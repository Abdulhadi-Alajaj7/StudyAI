import jwt from "jsonwebtoken";
import Kullanici from "../models/Kullanici.js";

const kimlikDogrula = async (req, res, next) => {
    let token = req.cookies?.token;

    // Cookie içinde token yoksa Authorization header'ını kontrol et
    if (
        !token &&
        req.headers.authorization &&
        req.headers.authorization.startsWith("Bearer")
    ) {
        token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
        return res.status(401).json({
            hata: "Yetkilendirme başarısız, token bulunamadı",
        });
    }

    try {
        const cozulmusToken = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ["HS256"] });

        const kullanici = await Kullanici.findById(cozulmusToken.id).select(
            "-sifre +oturumSurumu +bekleyenEmail +emailDegisimSonTarih"
        );

        if (!kullanici) {
            return res.status(401).json({
                hata: "Yetkilendirme başarısız, kullanıcı bulunamadı",
            });
        }

        const surum = cozulmusToken.oturumSurumu ?? 0;
        if (!Number.isSafeInteger(surum) || surum < 0 || surum !== (kullanici.oturumSurumu ?? 0)) {
            return res.status(401).json({ hata: "Oturumunuz sonlandırıldı. Yeniden giriş yapın." });
        }
        req.user = kullanici;
        req.authTime = cozulmusToken.iat;

        next();
    } catch (hata) {
        // Ham JWT veya hata içeriği loglanmaz.

        return res.status(401).json({
            hata: "Yetkilendirme başarısız, geçersiz token",
        });
    }
};

export default kimlikDogrula;

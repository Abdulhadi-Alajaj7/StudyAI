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
        const cozulmusToken = jwt.verify(token, process.env.JWT_SECRET);

        const kullanici = await Kullanici.findById(cozulmusToken.id).select(
            "-sifre"
        );

        if (!kullanici) {
            return res.status(401).json({
                hata: "Yetkilendirme başarısız, kullanıcı bulunamadı",
            });
        }

        req.user = kullanici;

        next();
    } catch (hata) {
        console.error("Kimlik doğrulama hatası:", hata.message);

        return res.status(401).json({
            hata: "Yetkilendirme başarısız, geçersiz token",
        });
    }
};

export default kimlikDogrula;
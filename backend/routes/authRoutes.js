import express from "express";
import { body, param, validationResult } from "express-validator";
import { authOriginKontrolu, sifreGecerliMi } from "../utils/authGuvenligi.js";
import { authIstekSiniri } from "../middleware/authIstekSiniri.js";

import {
    kayitOl,
    girisYap,
    profilGetir,
    profilGuncelle,
    sifreDegistir,
    cikisYap, sifremiUnuttum, sifreSifirla
} from "../controllers/authControllers.js";

import kimlikDogrula from "../middleware/auth.js";

const router = express.Router();
router.use((req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
const girdiyiKontrolEt = (req, res, next) => {
    const hata = validationResult(req);
    if (!hata.isEmpty()) return res.status(400).json({ kod: "AUTH_GECERSIZ_GIRDI", hata: hata.array()[0].msg });
    next();
};
const emailDogrula = () => body("email").isString().withMessage("E-posta adresini metin olarak giriniz.").bail()
    .isLength({ max: 254 }).withMessage("E-posta adresi çok uzun.").bail()
    .isEmail().withMessage("Geçerli bir e-posta adresi giriniz").normalizeEmail();
const yeniSifreDogrula = alan => body(alan).custom(sifreGecerliMi)
    .withMessage("Şifre en az 6 karakter ve en fazla 72 UTF-8 bayt olmalıdır.");
const tekrarDogrula = body("yeniSifreTekrar").optional().custom((s, { req }) => s === req.body.yeniSifre)
    .withMessage("Yeni şifreler eşleşmiyor.");

/* =========================
   Doğrulama Kuralları
========================= */

const kayitDogrulama = [
    body("kullaniciAdi")
        .isString().withMessage("Kullanıcı adını metin olarak giriniz.").bail()
        .trim()
        .isLength({ min: 3, max: 100 })
        .withMessage("Kullanıcı adı 3–100 karakter olmalıdır"),

    emailDogrula(), yeniSifreDogrula("sifre"),
];

const girisDogrulama = [
    emailDogrula(),

    body("sifre")
        .isString().withMessage("Şifrenizi giriniz.").bail().isLength({ max: 1024 }).withMessage("Şifre çok uzun.").bail()
        .notEmpty()
        .withMessage("Şifre zorunludur"),
];

/* =========================
   Herkese Açık Rotalar
========================= */

router.post("/kayit", authOriginKontrolu, authIstekSiniri({ kapsam: "kayit", maksimum: 20 }), kayitDogrulama, girdiyiKontrolEt, kayitOl);

router.post("/giris", authOriginKontrolu, authIstekSiniri({ kapsam: "giris", maksimum: 30 }), girisDogrulama, girdiyiKontrolEt, girisYap);

router.post("/cikis", authOriginKontrolu, cikisYap);
router.post("/forgot-password", authOriginKontrolu,
    authIstekSiniri({ kapsam: "sifirlama-ip", maksimum: 10 }), emailDogrula(), girdiyiKontrolEt,
    authIstekSiniri({ kapsam: "sifirlama-email", maksimum: 5, email: true }), sifremiUnuttum);
router.post("/reset-password/:token", authOriginKontrolu,
    authIstekSiniri({ kapsam: "sifirlama-tuketim", maksimum: 20 }),
    param("token").isString().withMessage("Bağlantı geçersiz.").bail().matches(/^[a-f0-9]{64}$/).withMessage("Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı isteyin."),
    yeniSifreDogrula("yeniSifre"), tekrarDogrula, girdiyiKontrolEt, sifreSifirla);

/* =========================
   Korumalı Rotalar
========================= */

router.get("/profil", kimlikDogrula, profilGetir);

router.put("/profil", authOriginKontrolu, kimlikDogrula,
    body("kullaniciAdi").optional().isString().withMessage("Kullanıcı adını metin olarak giriniz.").bail().trim().isLength({ min: 3, max: 100 }).withMessage("Kullanıcı adı 3–100 karakter olmalıdır."),
    body("email").optional().isString().withMessage("E-posta adresini metin olarak giriniz.").bail().isEmail().withMessage("Geçerli bir e-posta adresi giriniz"),
    girdiyiKontrolEt, profilGuncelle);

router.post("/sifre-degistir", authOriginKontrolu, kimlikDogrula,
    authIstekSiniri({ kapsam: "sifre-degistir", maksimum: 10 }),
    body("mevcutSifre").isString().withMessage("Mevcut şifrenizi giriniz.").bail().notEmpty().withMessage("Mevcut şifrenizi giriniz.").bail().isLength({ max: 1024 }).withMessage("Şifre çok uzun."),
    yeniSifreDogrula("yeniSifre"), tekrarDogrula, girdiyiKontrolEt, sifreDegistir);

export default router;

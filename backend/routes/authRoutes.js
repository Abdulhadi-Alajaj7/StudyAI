import express from "express";
import { body } from "express-validator";

import {
    kayitOl,
    girisYap,
    profilGetir,
    profilGuncelle,
    sifreDegistir,
} from "../controllers/authControllers.js";

import kimlikDogrula from "../middleware/auth.js";

const router = express.Router();

/* =========================
   Doğrulama Kuralları
========================= */

const kayitDogrulama = [
    body("kullaniciAdi")
        .trim()
        .isLength({ min: 3 })
        .withMessage("Kullanıcı adı en az 3 karakter olmalıdır"),

    body("email")
        .isEmail()
        .normalizeEmail()
        .withMessage("Geçerli bir e-posta adresi giriniz"),

    body("sifre")
        .isLength({ min: 6 })
        .withMessage("Şifre en az 6 karakter olmalıdır"),
];

const girisDogrulama = [
    body("email")
        .isEmail()
        .normalizeEmail()
        .withMessage("Geçerli bir e-posta adresi giriniz"),

    body("sifre")
        .notEmpty()
        .withMessage("Şifre zorunludur"),
];

/* =========================
   Herkese Açık Rotalar
========================= */

router.post("/kayit", kayitDogrulama, kayitOl);

router.post("/giris", girisDogrulama, girisYap);

/* =========================
   Korumalı Rotalar
========================= */

router.get("/profil", kimlikDogrula, profilGetir);

router.put("/profil", kimlikDogrula, profilGuncelle);

router.post("/sifre-degistir", kimlikDogrula, sifreDegistir);

export default router;
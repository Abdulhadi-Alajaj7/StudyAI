
import express from "express";
import kimlikDogrula from "../middleware/auth.js";
import upload from "../config/multer.js";

import {
    materyalYukle,
    taslakMateryalYukle,
    materyalleriGetir,
    taslakMateryalleriGetir,
    materyalGetir,
    materyalSil,
    materyalMetinCikar,
} from "../controllers/materyalController.js";

const router = express.Router();

// Tüm materyal işlemleri giriş yapmış kullanıcı gerektirir.
router.use(kimlikDogrula);

// Dosya yükleme hatalarını yakalayan ortak middleware.
const dosyaYukleme = (req, res, next) => {
    upload.array("dosyalar", 10)(
        req,
        res,
        (hata) => {
            if (hata) {
                return res.status(400).json({
                    basarili: false,
                    hata: hata.message,
                });
            }

            next();
        }
    );
};

// =============================================
// TASLAK MATERYAL İŞLEMLERİ
// =============================================

// Ders henüz oluşturulmadan materyal yükle.
router.post(
    "/taslak/:taslakId",
    dosyaYukleme,
    taslakMateryalYukle
);

// Taslağa eklenen materyalleri getir.
router.get(
    "/taslak/:taslakId",
    taslakMateryalleriGetir
);

// =============================================
// RESMİ DERS MATERYAL İŞLEMLERİ
// =============================================

// Resmi derse materyal yükle.
// Kilitli derslerde controller işlemi reddeder.
router.post(
    "/ders/:dersId",
    dosyaYukleme,
    materyalYukle
);

// Resmi dersin materyallerini getir.
router.get(
    "/ders/:dersId",
    materyalleriGetir
);

// =============================================
// ORTAK MATERYAL İŞLEMLERİ
// =============================================

// Tek materyali getir.
router.get(
    "/:id",
    materyalGetir
);

// Materyali sil.
router.delete(
    "/:id",
    materyalSil
);

// Başarısız metin çıkarma işlemini yeniden dene.
router.post(
    "/:id/metin-cikar",
    materyalMetinCikar
);

export default router;

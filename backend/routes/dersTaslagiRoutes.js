
import express from "express";

import kimlikDogrula from "../middleware/auth.js";

import {
    taslakOlustur,
    taslakGetir,
    taslakGuncelle,
    taslakDurumGetir,
    taslakAnalizEt,
    taslakOnayla,
} from "../controllers/dersTaslagiController.js";

const router = express.Router();

// Tüm ders taslağı işlemleri kimlik doğrulaması gerektirir.
router.use(kimlikDogrula);

// =============================================
// DERS TASLAĞI İŞLEMLERİ
// =============================================

// Yeni ders taslağı oluştur.
router.post("/", taslakOlustur);

// Ders taslağının bilgilerini ve materyallerini getir.
router.get("/:id", taslakGetir);

// Ders taslağı bilgilerini güncelle.
router.put("/:id", taslakGuncelle);

// Materyal ve analiz durumunu getir.
router.get("/:id/durum", taslakDurumGetir);

// =============================================
// GEMINI ANALİZ VE ONAY İŞLEMLERİ
// =============================================

// Tüm materyaller hazırsa Gemini analizi başlat.
router.post("/:id/analiz", taslakAnalizEt);

// Gemini analizi tamamlanan taslağı resmi derse dönüştür.
router.post("/:id/onayla", taslakOnayla);

export default router;

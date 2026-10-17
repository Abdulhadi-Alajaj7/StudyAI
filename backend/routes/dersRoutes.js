import express from "express";

import {
  dersOlustur,
  dersleriGetir,
  dersGetir,
  dersGuncelle,
  dersSil,
  materyalleriOnayla,
} from "../controllers/dersController.js";

import {
  konuHaritasiniGetir,
  konuHaritasiOlustur,
  geminiDurumuGetir
} from "../controllers/konuHaritasiController.js";

import kimlikDogrula from "../middleware/auth.js";

const router = express.Router();

router.get("/gemini-durum", kimlikDogrula, geminiDurumuGetir);

router.post("/", kimlikDogrula, dersOlustur);

router.get("/", kimlikDogrula, dersleriGetir);

router.get("/:id", kimlikDogrula, dersGetir);

router.put("/:id", kimlikDogrula, dersGuncelle);

router.delete("/:id", kimlikDogrula, dersSil);

// Materyal Onay Endpoint'i
router.post("/:id/materyaller/onayla", kimlikDogrula, materyalleriOnayla);

// Konu Haritası Endpoint'leri
router.get("/:id/konu-haritasi", kimlikDogrula, konuHaritasiniGetir);
router.post("/:id/konu-haritasi", kimlikDogrula, konuHaritasiOlustur);

export default router;
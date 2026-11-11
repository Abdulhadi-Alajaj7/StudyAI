import express from "express";

import {
  dersOlustur,
  dersleriGetir,
  dersGetir,
  dersGuncelle,
  dersSil,
} from "../controllers/dersController.js";

import {
  konuHaritasiniGetir,
  geminiDurumuGetir
} from "../controllers/konuHaritasiController.js";

import kimlikDogrula from "../middleware/auth.js";
import { dersHazirlamayiBaslat, dersHazirlamaDurumu, haritaIcinOnayGerekli } from "../controllers/dersHazirlamaController.js";
import { semantikArama } from "../controllers/semanticAramaController.js";

const router = express.Router();

router.get("/gemini-durum", kimlikDogrula, geminiDurumuGetir);

router.post("/", kimlikDogrula, dersOlustur);

router.get("/", kimlikDogrula, dersleriGetir);

router.get("/:id", kimlikDogrula, dersGetir);

router.put("/:id", kimlikDogrula, dersGuncelle);

router.delete("/:id", kimlikDogrula, dersSil);

// Materyal Onay Endpoint'i
router.post("/:id/materyaller/onayla", kimlikDogrula, dersHazirlamayiBaslat);
router.get("/:id/hazirlama", kimlikDogrula, dersHazirlamaDurumu);

// Konu Haritası Endpoint'leri
router.get("/:id/konu-haritasi", kimlikDogrula, konuHaritasiniGetir);
router.post("/:id/konu-haritasi", kimlikDogrula, haritaIcinOnayGerekli);

// Yalnızca kullanıcının kendi dersindeki aktif materyal sürümlerinde arama yapar.
router.post("/:id/semantic-arama", kimlikDogrula, semantikArama);

export default router;

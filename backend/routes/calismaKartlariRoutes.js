import express from "express";
import kimlikDogrula from "../middleware/auth.js";
import { kartlariGetir, kartlariOlustur, kartDurumunuKaydet, kartDegerlendirmesiniKaydet } from "../controllers/calismaKartlariController.js";

const router = express.Router();
router.use(kimlikDogrula);
router.get("/:dersId/calisma-kartlari", kartlariGetir);
router.post("/:dersId/calisma-kartlari/olustur", kartlariOlustur);
router.patch("/:dersId/calisma-kartlari/:kartId/durum", kartDurumunuKaydet);
router.post("/:dersId/calisma-kartlari/:kartId/degerlendirmeler", kartDegerlendirmesiniKaydet);
export default router;

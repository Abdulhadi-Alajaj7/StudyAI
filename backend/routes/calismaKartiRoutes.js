import express from "express";
import kimlikDogrula from "../middleware/auth.js";
import {kartlariGetir,kartlariOlustur,kartDurumunuGuncelle} from "../controllers/calismaKartiController.js";
const router=express.Router();
router.use(kimlikDogrula);
router.get("/:dersId/calisma-kartlari",kartlariGetir);
router.post("/:dersId/calisma-kartlari",kartlariOlustur);
router.patch("/:dersId/calisma-kartlari/:kartId",kartDurumunuGuncelle);
export default router;

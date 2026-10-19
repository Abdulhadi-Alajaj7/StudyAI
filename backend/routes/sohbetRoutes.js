import express from "express";
import kimlikDogrula from "../middleware/auth.js";
import {
    sohbetBasliginiGuncelle,
    sohbetMesajlariniListele,
    sohbetiSil,
    sohbetleriGetir,
    tekSohbetGetir,
    yeniSohbetOlustur,
} from "../controllers/sohbetController.js";

const router = express.Router();

router.use(kimlikDogrula);

router.get("/:dersId/sohbetler", sohbetleriGetir);
router.post("/:dersId/sohbetler", yeniSohbetOlustur);
router.get("/:dersId/sohbetler/:sohbetId/mesajlar", sohbetMesajlariniListele);
router.get("/:dersId/sohbetler/:sohbetId", tekSohbetGetir);
router.patch("/:dersId/sohbetler/:sohbetId", sohbetBasliginiGuncelle);
router.delete("/:dersId/sohbetler/:sohbetId", sohbetiSil);

export default router;

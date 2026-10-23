import express from "express";
import kimlikDogrula from "../middleware/auth.js";
import {
    cevabiKaydet,
    devamEdenTestleriListele,
    sonGoruntulenenSoruyuGuncelle,
    soruIsaretiniGuncelle,
    tamamlananTestleriListele,
    testDetayiniGetir,
    testOlustur,
    testSonucunuGetir,
    testiBaslat,
    testiTamamla,
} from "../controllers/testController.js";

const router = express.Router();

router.use(kimlikDogrula);

router.post("/:dersId/testler", testOlustur);
router.get("/:dersId/testler/devam-eden", devamEdenTestleriListele);
router.get("/:dersId/testler/tamamlanan", tamamlananTestleriListele);
router.get("/:dersId/testler/:testId/sonuc", testSonucunuGetir);
router.get("/:dersId/testler/:testId", testDetayiniGetir);
router.post("/:dersId/testler/:testId/baslat", testiBaslat);
router.patch("/:dersId/testler/:testId/sorular/:soruId/cevap", cevabiKaydet);
router.patch("/:dersId/testler/:testId/sorular/:soruId/isaret", soruIsaretiniGuncelle);
router.patch("/:dersId/testler/:testId/son-soru", sonGoruntulenenSoruyuGuncelle);
router.post("/:dersId/testler/:testId/tamamla", testiTamamla);

export default router;

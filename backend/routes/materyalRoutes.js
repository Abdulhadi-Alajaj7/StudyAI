import express from "express";
import kimlikDogrula from "../middleware/auth.js";
import upload, {
    MAKSIMUM_DOSYA_BOYUTU,
    MAKSIMUM_DOSYA_SAYISI
} from "../config/multer.js";
import { yuklemeHatasiniYanitaCevir } from "../utils/yuklemeHatasi.js";
import {
    materyalYukle,
    materyalleriGetir,
    materyalGetir,
    materyalSil,
    materyalMetinCikar
} from "../controllers/materyalController.js";
import { materyalEmbeddingleriniYenile } from "../controllers/semanticAramaController.js";

const router = express.Router();

router.use(kimlikDogrula);

// Dosya boyutunu veya hata yakalamayı multer upload ile kontrol etmek icin
router.post("/ders/:dersId", (req, res, next) => {
    upload.array("dosyalar", MAKSIMUM_DOSYA_SAYISI)(req, res, function(err) {
        if (err) {
            const yanit = yuklemeHatasiniYanitaCevir(err, {
                maksimumDosyaSayisi: MAKSIMUM_DOSYA_SAYISI,
                maksimumDosyaBoyutu: MAKSIMUM_DOSYA_BOYUTU
            });
            return res.status(400).json({ hata: yanit.mesaj, kod: yanit.kod });
        }
        next();
    });
}, materyalYukle);

router.get("/ders/:dersId", materyalleriGetir);
router.get("/:id", materyalGetir);
router.delete("/:id", materyalSil);
router.post("/:id/metin-cikar", materyalMetinCikar);
router.post("/:id/embedding-yenile", materyalEmbeddingleriniYenile);

export default router;

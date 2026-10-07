import express from "express";
import kimlikDogrula from "../middleware/auth.js";
import upload from "../config/multer.js";
import {
    materyalYukle,
    materyalleriGetir,
    materyalGetir,
    materyalSil,
    materyalMetinCikar
} from "../controllers/materyalController.js";

const router = express.Router();

router.use(kimlikDogrula);

// Dosya boyutunu veya hata yakalamayı multer upload ile kontrol etmek icin
router.post("/ders/:dersId", (req, res, next) => {
    upload.array("dosyalar", 10)(req, res, function(err) {
        if (err) {
            return res.status(400).json({ hata: err.message });
        }
        next();
    });
}, materyalYukle);

router.get("/ders/:dersId", materyalleriGetir);
router.get("/:id", materyalGetir);
router.delete("/:id", materyalSil);
router.post("/:id/metin-cikar", materyalMetinCikar);

export default router;

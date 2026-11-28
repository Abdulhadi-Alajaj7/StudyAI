import express from "express";
import kimlikDogrula from "../middleware/auth.js";
import { tekrarTestiHazirla, yanlislariListele } from "../controllers/yanlislarController.js";

const router = express.Router();
router.use(kimlikDogrula);
router.get("/", yanlislariListele);
router.post("/tekrar-testleri", tekrarTestiHazirla);

export default router;

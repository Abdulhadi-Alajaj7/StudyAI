import express from "express";
import kimlikDogrula from "../middleware/auth.js";
import {
    dersOzetiGetir,
    dersOzetiOlustur,
    dersOzetiYenidenOlustur,
} from "../controllers/dersOzetiController.js";

const router = express.Router();

router.use(kimlikDogrula);

router.get("/:dersId/ozetler", dersOzetiGetir);
router.post("/:dersId/ozetler", dersOzetiOlustur);
router.post("/:dersId/ozetler/yeniden-olustur", dersOzetiYenidenOlustur);

export default router;

import express from "express";

import {
  dersOlustur,
  dersleriGetir,
  dersGetir,
  dersGuncelle,
  dersSil,
} from "../controllers/dersController.js";

import kimlikDogrula from "../middleware/auth.js";

const router = express.Router();

router.post("/", kimlikDogrula, dersOlustur);

router.get("/", kimlikDogrula, dersleriGetir);

router.get("/:id", kimlikDogrula, dersGetir);

router.put("/:id", kimlikDogrula, dersGuncelle);

router.delete("/:id", kimlikDogrula, dersSil);

export default router;
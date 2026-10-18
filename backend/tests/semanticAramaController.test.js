import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { semanticAramaGirdisiniDogrula } from "../controllers/semanticAramaController.js";

const dersId = new mongoose.Types.ObjectId().toString();

test("boş, çok kısa ve çok uzun arama sorgularını Türkçe hata ile reddeder", () => {
    for (const sorgu of ["", " ", "a", "x".repeat(501), null]) {
        const sonuc = semanticAramaGirdisiniDogrula(dersId, { sorgu });
        assert.equal(sonuc.kod, "GECERSIZ_SORGU");
        assert.match(sonuc.hata, /2-500 karakter/);
    }
});

test("geçersiz ders kimliğini reddeder ve geçerli sorguyu temizler", () => {
    assert.equal(
        semanticAramaGirdisiniDogrula("gecersiz", { sorgu: "arama" }).kod,
        "GECERSIZ_DERS_ID"
    );
    assert.deepEqual(
        semanticAramaGirdisiniDogrula(dersId, { sorgu: "  Türkçe anlamsal arama  " }),
        { sorgu: "Türkçe anlamsal arama" }
    );
});


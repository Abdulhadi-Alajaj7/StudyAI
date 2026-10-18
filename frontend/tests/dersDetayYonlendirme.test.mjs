import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
    dersDetayTablari,
    dersDetayYolu,
} from "../src/utils/dersDetayYollari.mjs";

const kaynakOku = (goreliYol) => readFile(new URL(goreliYol, import.meta.url), "utf8");

test("ders detay sekmeleri istenen altı Türkçe sekmeden oluşur ve Materyaller içermez", () => {
    assert.deepEqual(
        dersDetayTablari.map((tab) => tab.etiket),
        ["Genel Bakış", "Konular", "Özet", "Sohbet", "Testler", "Çalışma Kartları"]
    );
    assert.equal(dersDetayTablari.some((tab) => tab.etiket === "Materyaller"), false);
});

test("ders kimliği bütün detay yollarında korunur", () => {
    const dersId = "507f1f77bcf86cd799439011";
    assert.deepEqual(
        dersDetayTablari.map((tab) => dersDetayYolu(dersId, tab.segment)),
        [
            `/dersler/${dersId}`,
            `/dersler/${dersId}/konular`,
            `/dersler/${dersId}/ozet`,
            `/dersler/${dersId}/sohbet`,
            `/dersler/${dersId}/testler`,
            `/dersler/${dersId}/calisma-kartlari`,
        ]
    );
});

test("router altı sayfayı ortak ders detay yerleşimi altında tanımlar", async () => {
    const appKaynagi = await kaynakOku("../src/App.jsx");

    assert.match(appKaynagi, /path="\/dersler\/:dersId" element={<DersDetayLayout \/>}/);
    for (const segment of ["konular", "ozet", "sohbet", "testler", "calisma-kartlari"]) {
        assert.match(appKaynagi, new RegExp(`path="${segment}"`));
    }
    assert.match(appKaynagi, /<Route index element={<DersGenelBakis \/>} \/>/);
});

test("Ders Hazır ve Derslerim gerçek ders kimliğiyle detay yoluna gider", async () => {
    const [dersHazir, derslerim] = await Promise.all([
        kaynakOku("../src/pages/DersHazir.jsx"),
        kaynakOku("../src/pages/Derslerim.jsx"),
    ]);

    assert.match(dersHazir, /navigate\(dersDetayYolu\(dersId\)\)/);
    assert.match(derslerim, /navigate\(dersDetayYolu\(ders\._id\)\)/);
});

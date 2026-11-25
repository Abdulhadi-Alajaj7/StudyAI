import test from "node:test";
import assert from "node:assert/strict";
import { semaDogrulaVeNormalizeEt } from "../services/geminiService.js";

test("kaynaklı konu haritası normalizasyonu ana ve alt parça kodlarını korur", () => {
    const veri = [{ baslik: "Modelleme", parcaKodlari: ["P1"], altKonular: [
        { baslik: "Veri Bölme", parcaKodlari: ["P2", "P3"] },
    ] }];
    const sonuc = semaDogrulaVeNormalizeEt(veri, { kaynakKodlariniKoru: true });
    assert.deepEqual(sonuc[0].parcaKodlari, ["P1"]);
    assert.deepEqual(sonuc[0].altKonular[0].parcaKodlari, ["P2", "P3"]);
    const eski = semaDogrulaVeNormalizeEt(veri);
    assert.equal("parcaKodlari" in eski[0], false);
    assert.equal("parcaKodlari" in eski[0].altKonular[0], false);
});

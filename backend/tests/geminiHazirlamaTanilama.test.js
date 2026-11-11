import { test } from "node:test";
import assert from "node:assert/strict";
import { geminiHazirlamaHatasiniSiniflandir as sinif, geminiRetryBeklemesiniGetir } from "../utils/geminiHazirlamaHatasi.js";
import { haritaSinirlayiciOlustur, haritaIstekAyarlari } from "../utils/geminiHaritaSiniri.js";

test("SDK JSON hata gövdesindeki gerçek HTTP kodu, kota türü ve RetryInfo okunur", () => {
    const hata = sinif(new Error(JSON.stringify({ error: { code: 429, status: "RESOURCE_EXHAUSTED", details: [
        { violations: [{ quotaId: "GenerateContentInputTokensPerModelPerMinute" }] },
        { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "12s" },
    ] } })));
    assert.equal(hata.status, 429);
    assert.equal(hata.tanilama.orijinalHttpDurumu, 429);
    assert.equal(hata.tanilama.saglayiciHataKodu, "RESOURCE_EXHAUSTED");
    assert.equal(hata.tanilama.kotaTuru, "tpm");
    assert.equal(geminiRetryBeklemesiniGetir(hata, 1), 12000);
});

test("Retry-After HTTP tarihi gözetilir; uzun bekleme manuel denemeye bırakılır", () => {
    const saat = Date.parse("2026-11-11T10:00:00Z");
    const hata = sinif({ status: 429, headers: new Headers({ "Retry-After": "Wed, 11 Nov 2026 10:01:00 GMT" }) }, saat);
    assert.equal(hata.retryAfterMs, 60000);
    assert.equal(geminiRetryBeklemesiniGetir(hata, 1), null);
});

test("503 mesajında quota sözcüğü geçmesi gerçek HTTP kodunu 429'a çevirmez", () => {
    const hata = sinif({ status: 503, message: "quota service unavailable" });
    assert.equal(hata.kod, "GEMINI_503");
    assert.equal(hata.tanilama.kotaTuru, null);
});

test("yerel RPM, TPM ve günlük koruma gerçek API çağrısı olmadan çalışır", () => {
    const sinir = haritaSinirlayiciOlustur();
    const ayarlar = { ...haritaIstekAyarlari(), rpm: 1, tpm: 10, rpd: 2 };
    const saat = Date.parse("2026-11-11T10:00:00Z");
    sinir.kontrolEt("model", 5, ayarlar, saat);
    assert.throws(() => sinir.kontrolEt("model", 5, ayarlar, saat), { status: 429 });
    sinir.kontrolEt("model", 5, ayarlar, saat + 60001);
    assert.throws(() => sinir.kontrolEt("model", 5, ayarlar, saat + 120002), { kod: "GEMINI_GUNLUK_KOTA" });
    assert.throws(() => sinir.kontrolEt("diger-model", 11, ayarlar, saat), { status: 413 });
    sinir.kontrolEt("model", 5, ayarlar, saat + 24 * 60 * 60 * 1000);
});

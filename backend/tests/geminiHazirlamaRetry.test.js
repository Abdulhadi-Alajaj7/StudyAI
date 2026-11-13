import { test } from "node:test";
import assert from "node:assert/strict";
import { callGeminiStructuredJson } from "../services/geminiService.js";
import { haritaIstekAyarlari, haritaSinirlayiciOlustur } from "../utils/geminiHaritaSiniri.js";

const ortam = (uret, ayarlar = {}) => {
    const istekler = [], beklemeler = [], loglar = [];
    let saat = Date.parse("2026-11-11T10:00:00Z");
    const ai = { models: { async generateContent(istek) { istekler.push(istek); return uret(istekler.length, istek); } } };
    const bagimliliklar = { ayarlar: { ...haritaIstekAyarlari(), ...ayarlar }, sinir: haritaSinirlayiciOlustur(),
        rastgele: () => 0, simdi: () => saat, beklet: async ms => { beklemeler.push(ms); saat += ms; }, logger: { info(...args) { loglar.push(args); } } };
    return { istekler, beklemeler, loglar, calistir: () => callGeminiStructuredJson(ai, "mock-model", "Özel materyal", "Talimat", bagimliliklar) };
};
const hata = (status, extra = {}) => Object.assign(new Error("Gizli sağlayıcı ayrıntısı"), { status, ...extra });

test("429 Retry-After dikkate alınır ve deneme sayısı sınırlıdır", async () => {
    const t = ortam(() => { throw hata(429, { headers: { "retry-after": "2" } }); });
    await assert.rejects(t.calistir(), { status: 429, kod: "GEMINI_429" });
    assert.equal(t.istekler.length, 2);
    assert.deepEqual(t.beklemeler, [2000]);
});

test("bilinmeyen dakika kotasında hızlı otomatik veya manuel çağrı yapılmaz", async () => {
    const t = ortam(() => { throw hata(429); });
    await assert.rejects(t.calistir(), { status: 429 });
    await assert.rejects(t.calistir(), { status: 429 });
    assert.equal(t.istekler.length, 1);
    assert.deepEqual(t.beklemeler, []);
});

test("günlük sağlayıcı kotası otomatik retry ve yeni hızlı manuel API çağrısını engeller", async () => {
    const t = ortam(() => { throw hata(429, { error: { status: "RESOURCE_EXHAUSTED", details: [
        { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier" }] },
    ] } }); });
    await assert.rejects(t.calistir(), { kod: "GEMINI_GUNLUK_KOTA" });
    await assert.rejects(t.calistir(), { kod: "GEMINI_GUNLUK_KOTA" });
    assert.equal(t.istekler.length, 1);
    assert.equal(t.beklemeler.length, 0);
});

test("503 sınırlı backoff ile denenir; gerçek sağlayıcı kodu logda korunur", async () => {
    const t = ortam(() => { throw hata(503, { error: { status: "UNAVAILABLE" } }); });
    await assert.rejects(t.calistir(), { kod: "GEMINI_503", status: 503 });
    assert.equal(t.istekler.length, 2);
    assert.deepEqual(t.beklemeler, [1000]);
    assert.equal(t.loglar[0][1].httpDurumu, 503);
    assert.equal(t.loglar[0][1].saglayiciHataKodu, "UNAVAILABLE");
    assert.doesNotMatch(JSON.stringify(t.loglar), /Gizli sağlayıcı|Özel materyal|Talimat/);
});

for (const [yanit, kod] of [
    [{ text: '{"yanit": 429' }, "GEMINI_GECERSIZ_JSON"],
    [{ text: "[]" }, "GEMINI_GECERSIZ_SEMA"],
    [{ text: "" }, "GEMINI_BOS_YANIT"],
    [{ text: "[", candidates: [{ finishReason: "MAX_TOKENS" }] }, "GEMINI_CIKTI_SINIRI"],
]) {
    test(`${kod} kota/503 olarak sunulmaz ve otomatik yeniden üretilmez`, async () => {
        const t = ortam(() => yanit);
        await assert.rejects(t.calistir(), { kod, status: 502 });
        assert.equal(t.istekler.length, 1);
        assert.equal(t.beklemeler.length, 0);
    });
}

for (const status of [400, 401, 403, 404, 413]) {
    test(`HTTP ${status} korunur ve yeniden denenmez`, async () => {
        const t = ortam(() => { throw hata(status); });
        await assert.rejects(t.calistir(), { status });
        assert.equal(t.istekler.length, 1);
    });
}

test("timeout ağ/503 ile karışmaz; bekleyen istek iptal edilir", async () => {
    let sinyal;
    const t = ortam((_n, istek) => { sinyal = istek.config.abortSignal; return new Promise(() => {}); }, { timeoutMs: 5, maksDeneme: 1 });
    await assert.rejects(t.calistir(), { kod: "GEMINI_ZAMAN_ASIMI", status: 504 });
    assert.equal(sinyal.aborted, true);
});

test("ağ hatası ayrı kodla sunulur", async () => {
    const t = ortam(() => { throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } }); });
    await assert.rejects(t.calistir(), { kod: "GEMINI_AG_HATASI", status: 502 });
    assert.equal(t.istekler.length, 2);
});

test("başarılı yanıt yalnız güvenli token metadatasını loglar", async () => {
    const t = ortam(() => ({ text: '[{"baslik":"Ağaçlar","altKonular":[]}]', usageMetadata: {
        promptTokenCount: 10, candidatesTokenCount: 15, totalTokenCount: 25, secret: "API-KEY-SECRET",
    } }));
    const sonuc = await t.calistir();
    assert.equal(sonuc[0].baslik, "Ağaçlar");
    assert.equal(t.loglar[0][1].totalTokenCount, 25);
    assert.doesNotMatch(JSON.stringify(t.loglar), /API-KEY-SECRET|Özel materyal/);
});

test("eksik API yapılandırması HTTP 503'e çevrilmez; model ve aşama güvenle kaydedilir", async () => {
    const onceki = process.env.GEMINI_API_KEY;
    delete process.env.GEMINI_API_KEY;
    const loglar = [];
    try {
        await assert.rejects(callGeminiStructuredJson(null, "configured-model", "gizli içerik", "talimat", {
            logger: { info(...args) { loglar.push(args); } },
        }), { kod: "GEMINI_YAPILANDIRMA", status: 500 });
        assert.equal(loglar[0][1].model, "configured-model");
        assert.equal(loglar[0][1].httpDurumu, null);
        assert.equal(loglar[0][1].asama, "konu_haritasi");
        assert.doesNotMatch(JSON.stringify(loglar), /gizli içerik|talimat/);
    } finally {
        if (onceki !== undefined) process.env.GEMINI_API_KEY = onceki;
    }
});

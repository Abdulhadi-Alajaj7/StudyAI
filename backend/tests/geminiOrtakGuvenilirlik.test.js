import test from "node:test";
import assert from "node:assert/strict";
import { GoogleGenAI } from "@google/genai";
import { geminiIleDersOzetiUret, geminiIleSohbetYanitiUret } from "../services/geminiService.js";
import { geminiOrtakIstekYonetimiOlustur, sinirliGeminiDenemesi } from "../utils/geminiOrtakIstekYonetimi.js";

const yanit = { text: JSON.stringify({ yanit: "Yanıt", genelBakis: "Özet" }) };
const cagir = (generateContent, ayarlar = {}) => geminiIleDersOzetiUret({ kaynakMetni: "Sentetik kaynak", tur: "tum_ders" }, {
    istemci: { models: { generateContent } }, bekle: async () => {}, rastgele: () => 0, ...ayarlar,
});
const saglayiciHatasi = (status, ek = {}) => Object.assign(new Error(JSON.stringify({
    error: { code: status, status: status === 503 ? "UNAVAILABLE" : "RESOURCE_EXHAUSTED", ...ek },
})), { name: "ApiError", status });

test("özet varsayılan üç SDK denemesinde 503'ten kurtulur; başarıyı tekrar çağırmaz", async () => {
    let sayi = 0;
    const beklemeler = [];
    const sonuc = await cagir(async () => {
        if (++sayi < 3) throw saglayiciHatasi(503);
        return yanit;
    }, { bekle: async ms => beklemeler.push(ms), rastgele: () => 1 });
    assert.equal(sonuc.icerik.genelBakis, "Özet");
    assert.equal(sayi, 3);
    assert.deepEqual(beklemeler, [1250, 2250]);
});

test("sürekli 503 üç denemeyle sınırlanır ve provider/HTTP/süre bilgisi korunur", async () => {
    let sayi = 0;
    const beklemeler = [];
    await assert.rejects(cagir(async () => { sayi++; throw saglayiciHatasi(503); }, {
        bekle: async ms => beklemeler.push(ms),
    }), hata => {
        assert.equal(hata.status, 503);
        assert.equal(hata.kod, "GEMINI_GECICI_HATA");
        assert.equal(hata.tanilama.saglayiciHataKodu, "UNAVAILABLE");
        assert.equal(hata.tanilama.gercekDenemeSayisi, 3);
        assert.ok(hata.tanilama.toplamIslemSureMs >= 0);
        return true;
    });
    assert.equal(sayi, 3);
    assert.deepEqual(beklemeler, [1000, 2000]);
});

test("günlük kota RetryInfo olsa bile otomatik tekrar edilmez", async () => {
    let sayi = 0;
    await assert.rejects(cagir(async () => {
        sayi++;
        throw saglayiciHatasi(429, { details: [
            { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "RequestsPerDay" }] },
            { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "1s" },
        ] });
    }, { bekle: async () => assert.fail("Günlük kota beklenip tekrarlanmamalı") }), hata => (
        hata.kod === "GEMINI_GUNLUK_KOTA" && hata.tanilama.kotaTuru === "gunluk"
    ));
    assert.equal(sayi, 1);
});

test("dakikalık kota Retry-After ve RetryInfo sürelerinden önce tekrar edilmez", async () => {
    for (const header of [true, false]) {
        let sayi = 0;
        const beklemeler = [];
        await cagir(async () => {
            if (++sayi === 1) {
                const hata = saglayiciHatasi(429, { details: [
                    { "@type": "type.googleapis.com/google.rpc.QuotaFailure", violations: [{ quotaId: "RequestsPerMinute" }] },
                    { "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2s" },
                ] });
                if (header) hata.headers = { "retry-after": "3" };
                throw hata;
            }
            return yanit;
        }, { bekle: async ms => beklemeler.push(ms) });
        assert.deepEqual(beklemeler, [header ? 3000 : 2000]);
        assert.equal(sayi, 2);
    }
});

test("uzun veya bilinmeyen kota beklemesinde hızlı retry yok; 503 kota kelimesiyle karışmaz", async () => {
    for (const status of [429, 503]) {
        let sayi = 0;
        await assert.rejects(cagir(async () => {
            sayi++;
            const hata = saglayiciHatasi(status, { message: "quota timeout" });
            hata.headers = { "retry-after": "60" };
            throw hata;
        }, { bekle: async () => assert.fail("60 saniyelik kuyruğa girilmemeli") }), hata => hata.status === status);
        assert.equal(sayi, 1);
    }
});

test("bilinmeyen hatalar 500; anahtar eksikliği yapılandırma hatası ve sıfır SDK denemesi", async () => {
    let sayi = 0;
    await assert.rejects(cagir(async () => { sayi++; throw new Error("bilinmeyen"); }), hata => (
        hata.status === 500 && hata.kod === "GEMINI_SERVIS_HATASI"
    ));
    assert.equal(sayi, 1);
    const onceki = process.env.GEMINI_API_KEY;
    try {
        delete process.env.GEMINI_API_KEY;
        await assert.rejects(geminiIleSohbetYanitiUret({ soru: "Sentetik soru" }), hata => (
            hata.kod === "GEMINI_YAPILANDIRMA" && hata.tanilama.gercekDenemeSayisi === 0
        ));
    } finally {
        if (onceki === undefined) delete process.env.GEMINI_API_KEY;
        else process.env.GEMINI_API_KEY = onceki;
    }
});

test("süreç içi sınır bekleme kuyruğu ve sahte SDK sayacı oluşturmaz; bitince yer bırakır", async () => {
    const istekYonetimi = geminiOrtakIstekYonetimiOlustur({ maksimum: 1 });
    let bitir, baslat;
    const basladi = new Promise(resolve => { baslat = resolve; });
    const bekliyor = new Promise(resolve => { bitir = resolve; });
    const ilk = cagir(async () => { baslat(); await bekliyor; return yanit; }, { istekYonetimi });
    await basladi;
    try {
        await assert.rejects(cagir(async () => assert.fail("SDK çağrılmamalı"), { istekYonetimi }), hata => (
            hata.kod === "GEMINI_ISTEK_YOGUNLUGU" && hata.tanilama.gercekDenemeSayisi === 0 &&
            hata.tanilama.orijinalHttpDurumu === null
        ));
    } finally { bitir(); await ilk; }
    await cagir(async () => yanit, { istekYonetimi });
    assert.equal(sinirliGeminiDenemesi(999), 5);
    assert.equal(sinirliGeminiDenemesi("bozuk"), 3);
});

test("kurulu gerçek SDK timeout AbortSignal'ini fetch'e iletir ve HTTP isteğini iptal eder", async () => {
    // Sadece transport mock: gerçek istemci dönüşümleri kullanılır, hiçbir ağ erişimi olmaz.
    const oncekiFetch = globalThis.fetch;
    let fetchSayisi = 0, httpSignal;
    globalThis.fetch = async (_url, ayarlar) => {
        fetchSayisi++;
        httpSignal = ayarlar.signal;
        return new Promise((_, reject) => {
            if (httpSignal.aborted) reject(new DOMException("İptal", "AbortError"));
            else httpSignal.addEventListener("abort", () => reject(new DOMException("İptal", "AbortError")), { once: true });
        });
    };
    try {
        await assert.rejects(cagir(null, {
            istemci: new GoogleGenAI({ apiKey: "yalnizca-test-anahtari" }),
            timeoutMs: 150, maxDeneme: 1,
        }), hata => hata.kod === "GEMINI_ZAMAN_ASIMI");
        assert.equal(fetchSayisi, 1, "SDK gizli HTTP retry yapmamalı");
        assert.equal(httpSignal?.aborted, true, "Gerçek HTTP sinyali iptal edilmeli");
    } finally { globalThis.fetch = oncekiFetch; }
});

test("kurulu SDK RetryInfo gövdesini korur fakat Retry-After başlığını ApiError'a taşımaz", async () => {
    const oncekiFetch = globalThis.fetch;
    let sayi = 0;
    globalThis.fetch = async () => {
        sayi++;
        return new Response(JSON.stringify({ error: {
            code: 429, status: "RESOURCE_EXHAUSTED",
            details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "2s" }],
        } }), { status: 429, headers: { "content-type": "application/json", "retry-after": "60" } });
    };
    try {
        const ai = new GoogleGenAI({ apiKey: "yalnizca-test-anahtari" });
        await assert.rejects(ai.models.generateContent({ model: "sentetik-model", contents: "sentetik" }), hata => {
            assert.equal(hata.status, 429);
            assert.equal(JSON.parse(hata.message).error.details[0].retryDelay, "2s");
            assert.equal(hata.headers, undefined);
            assert.equal(hata.response, undefined);
            return true;
        });
        assert.equal(sayi, 1, "SDK kendi başına tekrar çağırmamalı");
    } finally { globalThis.fetch = oncekiFetch; }
});

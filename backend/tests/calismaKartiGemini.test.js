import test from "node:test";
import assert from "node:assert/strict";
import { geminiIleDersKartlariUret } from "../services/geminiService.js";
import { haritaIstekAyarlari, haritaSinirlayiciOlustur } from "../utils/geminiHaritaSiniri.js";

const girdi = {
    dersBilgisi: { dersAdi: "Veri Bilimi", aciklama: "Üniversite dersi" }, modelAdi: "mock-model",
    grup: {
        metin: "[PARCA P1] DOSYA: Hafta01.pdf | KONU ID: sub-1\nVeri bilimi veriden bilgi üretir.\n" +
            "[PARCA P2] DOSYA: Hafta02.pdf | KONU ID: sub-2\nMedyan aykırı değerlere dayanıklıdır.",
        kaynaklar: [{ kod: "P1", konuIds: ["sub-1"] }, { kod: "P2", konuIds: ["sub-2"] }],
        konular: [{ konuId: "top-1", baslik: "Veri Bilimi" },
            { konuId: "sub-1", anaKonuId: "top-1", baslik: "Veri" },
            { konuId: "sub-2", anaKonuId: "top-1", baslik: "Medyan" }],
    },
};
const yanit = { text: JSON.stringify({ kartlar: [
    { soru: "Veri bilimi ne yapar?", cevap: "Veriden bilgi üretir.", konuId: "sub-1", kaynakKodlari: ["P1"] },
] }) };
const hata = (status, ek = {}) => Object.assign(new Error("Sağlayıcı hatası"), { status, ...ek });
const ortam = (uret = () => yanit, ayar = {}) => {
    const cagrilar = [], beklemeler = [];
    let saat = Date.now();
    const deps = { istemci: { models: { async generateContent(istek) {
        cagrilar.push(istek); return uret(cagrilar.length, istek);
    } } }, ayarlar: { ...haritaIstekAyarlari(), ...ayar },
        sinir: haritaSinirlayiciOlustur(), simdi: () => saat,
        beklet: async (ms) => { beklemeler.push(ms); saat += ms; }, logger: { info() {} } };
    return { cagrilar, beklemeler, calistir: () => geminiIleDersKartlariUret(girdi, deps) };
};

test("normal üretim bütün ders/konu/kaynak bilgileriyle tek JSON isteğidir", async () => {
    const t = ortam();
    const sonuc = await t.calistir();
    assert.equal(t.cagrilar.length, 1);
    assert.deepEqual(t.beklemeler, []);
    assert.deepEqual(sonuc.kartlar, JSON.parse(yanit.text).kartlar);
    const istek = t.cagrilar[0];
    assert.match(istek.contents, /Üniversite dersi/);
    assert.match(istek.contents, /Hafta01.pdf/);
    assert.match(istek.contents, /Hafta02.pdf/);
    for (const id of ["top-1", "sub-1", "sub-2"]) assert.ok(istek.contents.includes(id));
    assert.match(istek.config.systemInstruction, /üniversite düzeyinde uzman bir öğretmen/);
    assert.match(istek.config.systemInstruction, /sabit sayı, minimum, maksimum veya konu başına kota yoktur/);
    assert.equal(istek.config.responseMimeType, "application/json");
    assert.equal(istek.config.maxOutputTokens, haritaIstekAyarlari().maxOutputTokens || undefined);
});

test("503'ten üçüncü denemede kurtulur; aynı modelle başarıdan hemen sonra durur", async () => {
    const t = ortam((n) => { if (n < 3) throw hata(503); return yanit; });
    await t.calistir();
    assert.equal(t.cagrilar.length, 3);
    assert.deepEqual(t.beklemeler, [2500, 5000]);
    assert.ok(t.cagrilar.every((c) => c.model === "mock-model"));
});

test("sürekli 503 en fazla üç çağrı yapar, yedek model kullanmaz", async () => {
    const t = ortam(() => { throw hata(503); });
    await assert.rejects(t.calistir(), { kod: "GEMINI_503" });
    assert.equal(t.cagrilar.length, 3);
    assert.deepEqual(t.beklemeler, [2500, 5000]);
});

test("timeout ilk isteği iptal eder ve ikinci başarılı istekte durur", async () => {
    const t = ortam((n) => n === 1 ? new Promise(() => {}) : yanit, { timeoutMs: 10 });
    await t.calistir();
    assert.equal(t.cagrilar.length, 2);
    assert.equal(t.cagrilar[0].config.abortSignal.aborted, true);
    assert.deepEqual(t.beklemeler, [1000]);
});

test("geçici bağlantı hatası iki denemeyle sınırlıdır", async () => {
    for (const kurtar of [true, false]) {
        const t = ortam((n) => {
            if (n === 1 || !kurtar) throw Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } });
            return yanit;
        });
        if (kurtar) await t.calistir();
        else await assert.rejects(t.calistir(), { kod: "GEMINI_AG_HATASI" });
        assert.equal(t.cagrilar.length, 2);
        assert.deepEqual(t.beklemeler, [1000]);
    }
});

for (const status of [400, 401, 403, 404, 413]) {
    test("kalıcı HTTP " + status + " yalnız bir kez çağrılır", async () => {
        const t = ortam(() => { throw hata(status); });
        await assert.rejects(t.calistir(), { status });
        assert.equal(t.cagrilar.length, 1);
        assert.deepEqual(t.beklemeler, []);
    });
}

for (const cevap of [
    { text: "" }, { text: "{" }, { text: '{"kartlar":null}' },
    { ...yanit, candidates: [{ finishReason: "MAX_TOKENS" }] },
]) {
    test("boş/bozuk/kesilmiş JSON yeniden üretilmez: " + JSON.stringify(cevap), async () => {
        const t = ortam(() => cevap);
        await assert.rejects(t.calistir(), { kod: "GEMINI_GECERSIZ_YANIT" });
        assert.equal(t.cagrilar.length, 1);
        assert.deepEqual(t.beklemeler, []);
    });
}

test("boş kart listesi ek üretim veya kalite çağrısı olmadan kabul edilir", async () => {
    const t = ortam(() => ({ text: '{"kartlar":[]}' }));
    assert.deepEqual((await t.calistir()).kartlar, []);
    assert.equal(t.cagrilar.length, 1);
});

test("Retry-After beklenir; bilinmeyen ve günlük kota hızlı yeniden çağrılmaz", async () => {
    const t = ortam((n) => { if (n === 1) throw hata(429, { headers: { "retry-after": "2" } }); return yanit; });
    await t.calistir();
    assert.deepEqual(t.beklemeler, [2000]);
    assert.equal(t.cagrilar.length, 2);
    for (const ek of [{}, { error: { details: [{ quotaId: "RequestsPerDay" }] } }]) {
        const kota = ortam(() => { throw hata(429, ek); });
        await assert.rejects(kota.calistir(), { status: 429 });
        await assert.rejects(kota.calistir(), { status: 429 });
        assert.equal(kota.cagrilar.length, 1);
        assert.deepEqual(kota.beklemeler, []);
    }
});

test("mevcut yerel kota doluyken Gemini'ye hiç istek gönderilmez", async () => {
    const t = ortam(() => yanit, { tpm: 1 });
    await assert.rejects(t.calistir(), { kod: "GEMINI_ISTEK_BOYUTU" });
    assert.equal(t.cagrilar.length, 0);
    assert.deepEqual(t.beklemeler, []);
});

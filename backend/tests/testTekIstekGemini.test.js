import test from "node:test";
import assert from "node:assert/strict";
import { GoogleGenAI } from "@google/genai";
import { geminiIleTestSorulariUret } from "../services/geminiService.js";
import { ornekPaket, geminiTaklidi } from "./helpers/testUretimOrnekleri.js";

for (const dagilim of [[2, 2, 2, 2, 2], [4, 4, 4, 4, 4], [3, 3, 3, 3], [2, 2, 1, 1, 1], [3, 1, 1, 1, 1], [5]]) {
    test(`${dagilim.length} konu / ${dagilim.reduce((a, b) => a + b)} soru: ${dagilim} dağılımı tek çağrıda korunur`, async () => {
        const { girdi, sorular } = ornekPaket(dagilim);
        const mock = geminiTaklidi([{ sorular }]);
        const sonuc = await geminiIleTestSorulariUret(girdi, mock.bagimliliklar);
        assert.equal(sonuc.sorular.length, girdi.soruSayisi);
        assert.deepEqual(girdi.izinliKonuIds.map((k) => sonuc.sorular.filter((s) => s.konuId === k.konuId).length), dagilim);
        assert.equal(mock.istekler.length, 1);
        assert.equal(sonuc.apiCagriSayisi, 1);
        assert.equal(mock.istekler[0].config.responseMimeType, "application/json");
        assert.equal(mock.istekler[0].config.responseJsonSchema.properties.sorular.type, "array");
        assert.equal("responseSchema" in mock.istekler[0].config, false);
        assert.match(mock.istekler[0].contents, new RegExp("Tam " + girdi.soruSayisi + " soru"));
        assert.match(mock.istekler[0].config.systemInstruction, /"kaynakReferanslari":/);
        assert.match(mock.istekler[0].config.systemInstruction, /Farklı öğrenme hedefleri/);
        assert.ok(mock.istekler[0].config.maxOutputTokens >= girdi.soruSayisi * 1200);
    });
}

test("alıntı veya öğrenme hedefi olmadan ve tekrar içeren yanıt ek çağrısız kabul edilir", async () => {
    const { girdi, sorular } = ornekPaket();
    const ham = sorular.map(({ kaynakKanitlari, ogrenmeHedefi, ...s }) => s);
    ham[1] = { ...ham[0] };
    const mock = geminiTaklidi([{ sorular: ham }]);
    const sonuc = await geminiIleTestSorulariUret(girdi, mock.bagimliliklar);
    assert.equal(sonuc.sorular.length, 10);
    assert.equal(sonuc.sorular[0].metin, sonuc.sorular[1].metin);
    assert.equal(mock.istekler.length, 1);
});

test("eksik sayı hatasında kalite onarımı veya yeni çağrı yapılmaz", async () => {
    const { girdi, sorular } = ornekPaket();
    const mock = geminiTaklidi([{ sorular: sorular.slice(0, 8) }]);
    await assert.rejects(geminiIleTestSorulariUret(girdi, mock.bagimliliklar), (h) => h.tanilama.dogrulamaAltKodu === "SORU_SAYISI");
    assert.equal(mock.istekler.length, 1);
});

for (const status of [400, 401, 403, 404, 429]) {
    test(`${status} API hatası tekrar denenmez ve kısmi başarıya dönüşmez`, async () => {
        const { girdi } = ornekPaket();
        const mock = geminiTaklidi([Object.assign(new Error("provider failure"), { status })]);
        await assert.rejects(geminiIleTestSorulariUret(girdi, mock.bagimliliklar), (h) => h.status === status);
        assert.equal(mock.istekler.length, 1);
    });
}

const gecici503 = () => Object.assign(new Error("provider unavailable"), { status: 503 });

test("ilk 503 sonrası aynı istek bir kez tekrarlanır ve tam test döner", async () => {
    const { girdi, sorular } = ornekPaket();
    const mock = geminiTaklidi([gecici503(), { sorular }]);
    const beklemeler = [], izleme = [];
    const sonuc = await geminiIleTestSorulariUret(girdi, {
        ...mock.bagimliliklar, bekle: async (ms) => { beklemeler.push(ms); },
        uretimIzleyicisi: { sdkCagrisiBasladi: (veri) => izleme.push(veri) },
    });
    assert.equal(sonuc.sorular.length, 10);
    assert.equal(sonuc.apiCagriSayisi, 2);
    assert.equal(mock.istekler[0].contents, mock.istekler[1].contents);
    assert.equal(beklemeler.length, 1);
    assert.ok(beklemeler[0] >= 2500);
    assert.deepEqual(izleme.map((x) => x.sdkDenemesi), [1, 2]);
});

test("iki ardışık 503 sonrasında üçüncü üretim çağrısı yapılmaz", async () => {
    const { girdi } = ornekPaket();
    const mock = geminiTaklidi([gecici503(), gecici503()]);
    await assert.rejects(geminiIleTestSorulariUret(girdi, { ...mock.bagimliliklar, bekle: async () => {} }), { status: 503 });
    assert.equal(mock.istekler.length, 2);
});

test("503 retry sonrası eksik yanıt ek çağrı oluşturmaz", async () => {
    const { girdi, sorular } = ornekPaket();
    const mock = geminiTaklidi([gecici503(), { sorular: sorular.slice(0, 8) }]);
    await assert.rejects(geminiIleTestSorulariUret(girdi, { ...mock.bagimliliklar, bekle: async () => {} }), { kod: "TEST_HEDEFI_KARSILANAMADI" });
    assert.equal(mock.istekler.length, 2);
});

test("503 beklemesi toplam süreye sığmıyorsa tekrar çağrılmaz", async () => {
    const { girdi } = ornekPaket();
    const mock = geminiTaklidi([gecici503()]);
    await assert.rejects(geminiIleTestSorulariUret(girdi, { ...mock.bagimliliklar, timeoutMs: 1000, bekle: async () => {} }), { status: 503 });
    assert.equal(mock.istekler.length, 1);
});

test("konu sayısından az soru veya kaynaksız alt konu API çağrısından önce reddedilir", async () => {
    const { girdi } = ornekPaket();
    const mock = geminiTaklidi([]);
    await assert.rejects(geminiIleTestSorulariUret({ ...girdi, soruSayisi: 4, zorlukDagilimi: { orta: 4 } }, mock.bagimliliklar), { kod: "ALT_KONU_SORU_SAYISI_YETERSIZ" });
    await assert.rejects(geminiIleTestSorulariUret({ ...girdi, kaynaklar: girdi.kaynaklar.slice(0, 4) }, mock.bagimliliklar), (h) => h.tanilama.dogrulamaAltKodu === "KONU_KAYNAGI_YOK");
    assert.equal(mock.istekler.length, 0);
});

test("zaman aşımı çağrıyı iptal eder ve yeni istek başlatmaz", async () => {
    const { girdi } = ornekPaket();
    let signal;
    const mock = geminiTaklidi([(istek) => { signal = istek.config.abortSignal; return new Promise(() => {}); }]);
    await assert.rejects(geminiIleTestSorulariUret(girdi, { ...mock.bagimliliklar, timeoutMs: 25 }), { kod: "GEMINI_ZAMAN_ASIMI" });
    assert.equal(signal.aborted, true);
    assert.equal(mock.istekler.length, 1);
});

test("kurulu Gemini SDK 7 konu, 15 soru ve 42 kaynak için basit şemalı JSON isteği gönderir; ağ taklit edilir", async (t) => {
    const { girdi, sorular } = ornekPaket([3, 3, 3, 2, 2]);
    const ekler = [
        { baslik: "AVL Ağacı", metin: "AVL ağacında denge faktörü nasıl hesaplanır?", cevap: "Yükseklik farkı", kanit: "AVL ağacında denge faktörü sol ve sağ alt ağaçların yükseklik farkı olarak hesaplanır." },
        { baslik: "Dijkstra Algoritması", metin: "Dijkstra algoritması hangi tür kenar ağırlıklarını gerektirir?", cevap: "Negatif olmayan ağırlıklar", kanit: "Dijkstra algoritması negatif olmayan kenar ağırlıkları gerektirir." },
    ];
    for (const [index, ek] of ekler.entries()) {
        const konuId = "sub-" + (index + 5);
        const anahtar = "K" + (index + 6);
        const konu = { konuId, baslik: ek.baslik, konuTuru: "alt" };
        girdi.izinliKonuIds.push(konu);
        girdi.konuDagilimi.push({ ...konu, adet: 1 });
        girdi.kaynaklar.push({ anahtar, materyalId: "m" + (index + 6), parcaIndex: 0, konuIds: [konuId], icerik: ek.kanit });
        sorular.push({ metin: ek.metin, aciklama: ek.kanit, ogrenmeHedefi: ek.kanit, dogruCevap: "A",
            secenekler: [ek.cevap, "Rastgele seçim", "Veri kopyalama", "Bütün elemanları silme"].map((metin, i) => ({ anahtar: "ABCD"[i], metin })),
            konuId, kaynakReferanslari: [anahtar], kaynakKanitlari: [{ kaynakReferansi: anahtar, alinti: ek.kanit }] });
    }
    const ilkKaynaklar = [...girdi.kaynaklar];
    for (let i = 7; i < 42; i++) {
        const kaynak = ilkKaynaklar[i % ilkKaynaklar.length];
        girdi.kaynaklar.push({ ...kaynak, anahtar: "K" + (i + 1), parcaIndex: i });
    }
    girdi.soruSayisi = 15;
    girdi.zorlukDagilimi = { kolay: 5, orta: 5, zor: 5 };
    girdi.konuDagilimi = girdi.konuDagilimi.map((konu) => ({ ...konu, adet: 1 }));
    sorular.forEach((soru, i) => { soru.zorluk = ["kolay", "orta", "zor"][i % 3]; });
    const govdeler = [];
    t.mock.method(globalThis, "fetch", async (_url, ayarlar) => {
        govdeler.push(JSON.parse(ayarlar.body));
        return new Response(JSON.stringify({ candidates: [{ finishReason: "STOP", content: {
            role: "model", parts: [{ text: JSON.stringify({ durum: "tamamlandi", sorular }) }],
        } }] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    const sonuc = await geminiIleTestSorulariUret(girdi, {
        istemci: new GoogleGenAI({ apiKey: "yalnizca-test-anahtari" }),
        istekYonetimi: { yerAyir: () => () => {} },
    });
    assert.equal(sonuc.sorular.length, 15);
    assert.equal(govdeler.length, 1);
    assert.equal(govdeler[0].generationConfig.responseJsonSchema.properties.sorular.type, "array");
    assert.equal("responseSchema" in govdeler[0].generationConfig, false);
    assert.equal(govdeler[0].generationConfig.responseMimeType, "application/json");
    assert.equal(girdi.izinliKonuIds.length, 7);
    assert.equal(girdi.kaynaklar.length, 42);
    assert.match(JSON.stringify(govdeler[0].contents), /KAYNAK K42/);
    assert.deepEqual(girdi.izinliKonuIds.map((konu) => sonuc.sorular.filter((soru) => soru.konuId === konu.konuId).length), [3, 3, 3, 2, 2, 1, 1]);
});

for (const [ad, hata] of [
    ["503", gecici503()],
    ["504", Object.assign(new Error("provider timeout"), { status: 504 })],
    ["JSON_PARSE", () => ({ text: '{"sorular":[', candidates: [{ finishReason: "STOP" }] })],
]) {
    test(`${ad} sonrası tek yedek model çağrısı yapılır`, async () => {
        const { girdi, sorular } = ornekPaket();
        const mock = geminiTaklidi([hata, { sorular }]);
        const sonuc = await geminiIleTestSorulariUret({ ...girdi, modelAdi: "gemini-3.1-flash-lite" }, {
            ...mock.bagimliliklar, bekle: async () => {},
        });
        assert.deepEqual(mock.istekler.map((i) => i.model), ["gemini-3.1-flash-lite", "gemini-3.5-flash-lite"]);
        assert.equal(sonuc.model, "gemini-3.5-flash-lite");
        assert.equal(sonuc.apiCagriSayisi, 2);
        assert.equal(sonuc.sorular.length, 10);
    });
}

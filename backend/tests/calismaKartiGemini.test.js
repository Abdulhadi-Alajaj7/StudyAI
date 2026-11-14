import test from "node:test";
import assert from "node:assert/strict";
import { geminiIleCalismaKartiPartisiUret } from "../services/geminiService.js";

const konular = [
    { konuId: "konu-a", baslik: "Veri Türleri", adet: 2,
        kaynaklar: [{ kod: "K1", dosyaAdi: "hafta1.pdf", parcaIndex: 0, icerik: "Veri türleri sayısal ve kategoriktir." }] },
    { konuId: "konu-b", baslik: "Ön İşleme", adet: 2,
        kaynaklar: [{ kod: "K2", dosyaAdi: "hafta2.pdf", parcaIndex: 3, icerik: "Eksik veriler işlenmelidir." }] },
];
const istekYonetimi = { yerAyir() { return () => {}; } };

test("Birden çok konu tek Gemini isteğine sığdırılır", async () => {
    const cagri = [];
    const istemci = { models: { async generateContent(girdi) {
        cagri.push(girdi);
        return { text: JSON.stringify({ kartlar: [
            { konuId: "konu-a", soru: "Veri türleri nelerdir?", cevap: "Sayısal ve kategorik.", kaynakKodlari: ["K1"] },
            { konuId: "konu-b", soru: "Eksik veri ne yapılır?", cevap: "İşlenir.", kaynakKodlari: ["K2"] },
        ] }) };
    } } };
    const sonuc = await geminiIleCalismaKartiPartisiUret(
        { dersAdi: "Uygulamalı Veri Bilimi", konular },
        { istemci, istekYonetimi }
    );
    assert.equal(cagri.length, 1);
    assert.equal(sonuc.kartlar.length, 2);
    assert.match(cagri[0].contents, /konu-a/);
    assert.match(cagri[0].contents, /konu-b/);
    assert.equal(cagri[0].config.responseMimeType, "application/json");
});

test("429 hatası tek istek içinde uzun süre bekletilmez, retry bilgisi korunur", async () => {
    let sayi = 0;
    const hata = new Error(JSON.stringify({ error: {
        code: 429, status: "RESOURCE_EXHAUSTED", message: "Requests per minute exceeded",
        details: [{ "@type": "type.googleapis.com/google.rpc.RetryInfo", retryDelay: "60s" }],
    } }));
    hata.status = 429;
    const istemci = { models: { async generateContent() {
        sayi += 1;
        throw hata;
    } } };
    await assert.rejects(
        geminiIleCalismaKartiPartisiUret(
            { dersAdi: "Uygulamalı Veri Bilimi", konular },
            { istemci, istekYonetimi }
        ),
        (e) => e.status === 429 &&
            e.kod === "GEMINI_KOTA_ASIMI" &&
            e.tanilama.kotaTuru === "rpm" &&
            e.retryAfterMs === 60000
    );
    assert.equal(sayi, 1);
});

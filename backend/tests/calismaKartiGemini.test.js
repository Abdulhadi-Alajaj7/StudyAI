import test from "node:test";
import assert from "node:assert/strict";
import { geminiIleDersKartlariUret } from "../services/geminiService.js";

const grup = {
    metin: "[K1] DOSYA: Hafta01.pdf | KONU ID: sub-1\nVeri bilimi veriden bilgi üretir.\n" +
        "[K2] DOSYA: Hafta02.pdf | KONU ID: sub-2\nMedyan aykırı değerlere dayanıklıdır.",
    konular: [{konuId:"sub-1",baslik:"Veri"},{konuId:"sub-2",baslik:"Medyan"}],
    kaynaklar: [
        { kod: "K1", dosyaAdi: "Hafta01.pdf", parcaIndex: 0 },
        { kod: "K2", dosyaAdi: "Hafta02.pdf", parcaIndex: 1 },
    ],
};
const istekYonetimi = { yerAyir() { return () => {}; } };
test("Gemini bütün ders metninden konuId ile kartlar üretir", async () => {
    const cagrilar = [];
    const istemci = { models: { async generateContent(args) {
        cagrilar.push(args);
        return { text: JSON.stringify({ kartlar: [
            { soru: "Veri bilimi ne yapar?", cevap: "Veriden bilgi üretir.", konuId: "sub-1" },
            { soru: "Medyanın avantajı nedir?", cevap: "Aykırı değerlere dayanıklıdır.", konuId: "sub-2" },
        ] }) };
    } } };
    const sonuc = await geminiIleDersKartlariUret({
        dersAdi: "Veri Bilimi", grup,
    }, { istemci, istekYonetimi });
    assert.equal(sonuc.kartlar.length, 2);
    assert.equal(cagrilar.length, 1);
    assert.match(cagrilar[0].contents, /Hafta01\.pdf/);
    assert.match(cagrilar[0].contents, /Hafta02\.pdf/);
    assert.match(cagrilar[0].contents, /KONU ID: sub-1/);
    assert.match(cagrilar[0].contents, /KONU ID: sub-2/);
    assert.deepEqual(sonuc.kartlar.map(k=>k.konuId),["sub-1","sub-2"]);
    assert.match(cagrilar[0].config.systemInstruction, /Sabit veya üst bir kart sayısı YOKTUR/);
    assert.match(cagrilar[0].config.systemInstruction, /gerçek konuId/);
    assert.doesNotMatch(cagrilar[0].config.systemInstruction, /kaynakKodlari/);
    assert.equal(cagrilar[0].config.maxOutputTokens,12288);
    assert.equal(cagrilar[0].config.responseMimeType, "application/json");
});

test("Gemini daha önce sorulan soruyu prompta alır, ama konu kotası kullanmaz", async () => {
    let gelen;
    const istemci = { models: { async generateContent(args) {
        gelen = args;
        return { text: '{"kartlar":[]}' };
    } } };
    await geminiIleDersKartlariUret({
        dersAdi: "Veri Bilimi", grup,
        oncekiSorular: [{ soru: "Veri bilimi ne yapar?", cevap: "Veriden bilgi üretir." }],
    }, { istemci, istekYonetimi });
    assert.match(gelen.contents, /Veri bilimi ne yapar\?/);
    assert.doesNotMatch(gelen.contents, /KART HEDEFİ|ÜST SINIR/);
});

test("429 Gemini kota hatasında uydurma kart üretmez", async () => {
    const hata = new Error(JSON.stringify({ error: {
        code: 429, status: "RESOURCE_EXHAUSTED",
        message: "Requests per minute exceeded",
    } }));
    hata.status = 429;
    const istemci = { models: { async generateContent() { throw hata; } } };
    await assert.rejects(geminiIleDersKartlariUret({
        dersAdi: "Veri Bilimi", grup,
    }, { istemci, istekYonetimi }), (e) => Number(e.status) === 429);
});

test("ckart çağrısı geçici 503 hatasında tek grup denemesi yapar, yeniden denemeyi mevcut zamanlayıcı üstlenir",async()=>{
    let cagrilar=0;
    const istemci={models:{generateContent:async()=>{cagrilar++;throw Object.assign(Error("Unavailable"),{status:503})}}};
    await assert.rejects(geminiIleDersKartlariUret({dersAdi:"Veri",grup},{istemci,istekYonetimi}),{status:503});
    assert.equal(cagrilar,1);
});

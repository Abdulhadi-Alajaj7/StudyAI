import test from "node:test";
import assert from "node:assert/strict";
import { geminiIleTestSorulariTekIstekleUret } from "../services/geminiService.js";

const icerik = "Yığın veri yapısı son giren ilk çıkar (LIFO) prensibine göre çalışır. Yığın yapısında ekleme ve çıkarma en üstten yapılır.";
const alinti = "Yığın veri yapısı son giren ilk çıkar (LIFO) prensibine göre çalışır.";
const kaynaklar = [{
    anahtar: "K1", materyalId: "m1", parcaIndex: 0, konuId: "sub-yigin",
    konuIds: ["sub-yigin"], icerik,
}];
const izinliKonuIds = [{ konuId: "sub-yigin", baslik: "Yığın",
    aciklama: "LIFO ile ekleme çıkarma", konuTuru: "alt" }];
const soru = {
    metin: "Yığın veri yapısındaki LIFO prensibi hangi işlem sırasını belirtir?",
    secenekler: [
        { anahtar: "A", metin: "Son giren ilk çıkar (LIFO)" },
        { anahtar: "B", metin: "İlk giren ilk çıkar (FIFO)" },
        { anahtar: "C", metin: "Tüm veriler aynı anda çıkar" },
        { anahtar: "D", metin: "Rastgele bir veri çıkar" },
    ],
    dogruCevap: "A",
    aciklama: "Yığın veri yapısında son giren ilk çıkar (LIFO) kuralı geçerlidir.",
    zorluk: "orta", konuId: "sub-yigin",
    kaynakReferanslari: ["K1"],
    kaynakKanitlari: [{ kaynakReferansi: "K1", alinti }],
};

const girdiler = {
    dersBilgisi: { dersAdi: "Veri Yapıları" },
    kapsamTuru: "konu", hedefBasligi: "Yığın",
    soruSayisi: 3, zorlukDagilimi: { orta: 3 },
    konuDagilimi: [{ konuId: "sub-yigin", adet: 3 }],
    kaynaklar, izinliKonuIds, modelAdi: "mock-model",
};
const yonetim = { yerAyir: () => () => {} };

test("tek istek modunda eksik ve tekrar soru için yeni API çağrısı yapmaz", async () => {
    let istekSayisi = 0;
    const istemci = { models: { generateContent: async () => {
        istekSayisi += 1;
        return {
            text: JSON.stringify({ sorular: [soru, { ...soru }] }),
            candidates: [{ finishReason: "STOP" }],
            usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 250, totalTokenCount: 350 },
        };
    } } };
    const sonuc = await geminiIleTestSorulariTekIstekleUret(girdiler, {
        istemci, istekYonetimi: yonetim,
    });
    assert.equal(istekSayisi, 1);
    assert.equal(sonuc.sorular.length, 1);
    assert.equal(sonuc.sorular[0].konuId, "sub-yigin");
    assert.equal(sonuc.kismiUretimNedeni, "KALITE_KONTROLU");
    assert.equal(sonuc.apiCagriSayisi, 1);
});

test("429 kota hatası yeniden API çağrısı tetiklemez", async () => {
    let istekSayisi = 0;
    const istemci = { models: { generateContent: async () => {
        istekSayisi += 1;
        throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
    } } };
    await assert.rejects(geminiIleTestSorulariTekIstekleUret(girdiler, {
        istemci, istekYonetimi: yonetim,
    }));
    assert.equal(istekSayisi, 1);
});

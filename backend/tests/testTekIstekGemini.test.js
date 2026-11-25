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
        assert.equal("responseJsonSchema" in mock.istekler[0].config, false);
        assert.equal("responseSchema" in mock.istekler[0].config, false);
        assert.match(mock.istekler[0].contents, new RegExp("tam " + girdi.soruSayisi + " yeni soru"));
        assert.match(mock.istekler[0].config.systemInstruction, /"kaynakKanitlari":/);
        assert.match(mock.istekler[0].config.systemInstruction, /farklı öğrenme hedefi/);
        assert.ok(mock.istekler[0].config.maxOutputTokens >= girdi.soruSayisi * 1200);
    });
}

test("eksik iki soru tek ek çağrıda tamamlanır ve önceki sorular aynen korunur", async () => {
    const { girdi, sorular } = ornekPaket();
    const mock = geminiTaklidi([{ sorular: sorular.slice(0, 8) }, { sorular: sorular.slice(8) }]);
    const sonuc = await geminiIleTestSorulariUret(girdi, mock.bagimliliklar);
    assert.equal(mock.istekler.length, 2);
    assert.equal(sonuc.sorular.length, 10);
    assert.deepEqual(sonuc.sorular.slice(0, 8).map((s) => s.metin), sorular.slice(0, 8).map((s) => s.metin));
    assert.match(mock.istekler[1].contents, /tam 2 yeni soru/);
    assert.match(mock.istekler[1].contents, /"konuId":"sub-4","adet":2/);
    assert.ok(mock.istekler[1].contents.includes(sorular[0].ogrenmeHedefi));
    assert.deepEqual(sonuc.tokenKullanimi, { girdi: 20, cikti: 40, toplam: 60 });
});

test("yanlış eşit dağılımda yalnızca eksik konuların soruları tamamlanır", async () => {
    const { girdi, sorular, soru } = ornekPaket();
    const mock = geminiTaklidi([{ sorular: [...sorular.slice(0, 8), soru(0, 2), soru(0, 3)] }, { sorular: sorular.slice(8) }]);
    const sonuc = await geminiIleTestSorulariUret(girdi, mock.bagimliliklar);
    assert.equal(sonuc.sorular.length, 10);
    assert.equal(mock.istekler.length, 2);
    assert.equal(sonuc.sorular.filter((s) => s.konuId === "sub-0").length, 2);
});

test("tam ve farklı ifadeli tekrarlar eksik sayılır; yeni öğrenme hedefi istenir", async () => {
    const { girdi, sorular } = ornekPaket([3]);
    const tekrar = { ...sorular[0], metin: "Yığındaki çıkarma sırası nasıl belirlenir?" };
    const mock = geminiTaklidi([{ sorular: [sorular[0], { ...sorular[0] }, tekrar] }, { sorular: sorular.slice(1) }]);
    const sonuc = await geminiIleTestSorulariUret(girdi, mock.bagimliliklar);
    assert.equal(sonuc.sorular.length, 3);
    assert.match(mock.istekler[1].contents, /tam 2 yeni soru/);
});

for (const [alan, degistir] of Object.entries({
    secenek: (s) => ({ ...s, secenekler: [] }),
    konu: (s) => ({ ...s, konuId: "bilinmeyen" }),
    kaynak: (s) => ({ ...s, kaynakReferanslari: ["K99"] }),
    aciklama: (s) => ({ ...s, aciklama: "" }),
    cevap: (s) => ({ ...s, dogruCevap: "AB" }),
})) {
    test(`geçersiz ${alan} alanı geçerli soruları kaybetmeden bir kez tamamlanır`, async () => {
        const { girdi, sorular } = ornekPaket([2]);
        const mock = geminiTaklidi([{ sorular: [sorular[0], degistir(sorular[1])] }, { sorular: [sorular[1]] }]);
        const sonuc = await geminiIleTestSorulariUret(girdi, mock.bagimliliklar);
        assert.equal(sonuc.sorular.length, 2);
        assert.match(mock.istekler[1].contents, /tam 1 yeni soru/);
    });
}

test("tamamlama da eksik/tekrar ise üçüncü çağrı ve kısmi başarı yoktur", async () => {
    const { girdi, sorular } = ornekPaket([3]);
    const mock = geminiTaklidi([{ sorular: [sorular[0]] }, { sorular: [sorular[0]] }]);
    await assert.rejects(geminiIleTestSorulariUret(girdi, mock.bagimliliklar), (h) => h.status === 422 && /Eksik test kaydedilmedi/.test(h.message));
    assert.equal(mock.istekler.length, 2);
});

test("kaynak yetersizliği açıkça bildirilirse yeni çağrı yapılmaz", async () => {
    const { girdi, sorular } = ornekPaket([5]);
    const mock = geminiTaklidi([{ durum: "yetersiz_kaynak", sorular: sorular.slice(0, 1) }]);
    await assert.rejects(geminiIleTestSorulariUret(girdi, mock.bagimliliklar), { kod: "TEST_HEDEFI_KARSILANAMADI" });
    assert.equal(mock.istekler.length, 1);
});

test("sayı tam olsa bile modelin kaynak yetersizliği bildirimi başarıya çevrilmez", async () => {
    const { girdi, sorular } = ornekPaket([5]);
    const mock = geminiTaklidi([{ durum: "yetersiz_kaynak", sorular }]);
    await assert.rejects(geminiIleTestSorulariUret(girdi, mock.bagimliliklar), (h) => h.tanilama.dogrulamaAltKodu === "YETERSIZ_KAYNAK");
    assert.equal(mock.istekler.length, 1);
});

for (const status of [429, 503]) {
    test(`${status} API hatası tekrar denenmez ve kısmi başarıya dönüşmez`, async () => {
        const { girdi } = ornekPaket();
        const mock = geminiTaklidi([Object.assign(new Error("provider failure"), { status })]);
        await assert.rejects(geminiIleTestSorulariUret(girdi, mock.bagimliliklar), (h) => h.status === status);
        assert.equal(mock.istekler.length, 1);
    });
}

test("tamamlama API hatası önceki soruları başarılı sonuç olarak döndürmez", async () => {
    const { girdi, sorular } = ornekPaket();
    const mock = geminiTaklidi([{ sorular: sorular.slice(0, 8) }, Object.assign(new Error("provider"), { status: 503 })]);
    await assert.rejects(geminiIleTestSorulariUret(girdi, mock.bagimliliklar), { status: 503 });
    assert.equal(mock.istekler.length, 2);
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

test("kurulu Gemini SDK 7 konu, 15 soru ve 42 kaynak için şemasız JSON isteği gönderir; ağ taklit edilir", async (t) => {
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
    assert.equal("responseJsonSchema" in govdeler[0].generationConfig, false);
    assert.equal("responseSchema" in govdeler[0].generationConfig, false);
    assert.equal(govdeler[0].generationConfig.responseMimeType, "application/json");
    assert.equal(girdi.izinliKonuIds.length, 7);
    assert.equal(girdi.kaynaklar.length, 42);
    assert.match(JSON.stringify(govdeler[0].contents), /KAYNAK K42/);
    assert.deepEqual(girdi.izinliKonuIds.map((konu) => sonuc.sorular.filter((soru) => soru.konuId === konu.konuId).length), [3, 3, 3, 2, 2, 1, 1]);
});

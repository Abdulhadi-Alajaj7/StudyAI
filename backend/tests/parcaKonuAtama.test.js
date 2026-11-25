import test from "node:test";
import assert from "node:assert/strict";
import {
    geminiIleParcalariKonularaAta,
    parcaAtamalariniDogrula,
    eksikParcaAtamalariniTamamla,
    atamaYanitiniIncele,
} from "../services/parcaKonuAtamaService.js";

const parcalar = [
    { materyalId: "m1", islemeId: "v1", parcaIndex: 0, icerik: "Eğitim ve test verisi" },
    { materyalId: "m1", islemeId: "v1", parcaIndex: 1, icerik: "Veri sızıntısı" },
];
const anaKonular = [{
    konuId: "top-1", baslik: "Modelleme", altKonular: [
        { konuId: "sub-1", baslik: "Bölme" },
        { konuId: "sub-2", baslik: "Sızıntı" },
    ],
}];
test("Gemini bütün aktif chunkları mevcut alt konu kimlikleriyle sınıflandırır", async () => {
    const istemci = { models: { generateContent: async () => ({
        text: JSON.stringify({ atamalar: [
            { index: 0, konuIds: ["sub-1"] },
            { index: 1, konuIds: ["sub-2"] },
        ] }),
    }) } };
    const sonuc = await geminiIleParcalariKonularaAta({
        parcalar, anaKonular, istemci, modelAdi: "mock",
    });
    assert.equal(sonuc.length, 2);
    assert.deepEqual(sonuc.map((x) => x.konuIds[0]), ["sub-1", "sub-2"]);
    assert.deepEqual(sonuc.map((x) => x.anaKonuId), ["top-1", "top-1"]);
});
test("Gemini bir chunkı atladığında veya bilinmeyen ID verdiğinde harita reddedilir", () => {
    const base = [
        { ...parcalar[0], konuIds: ["sub-1"] },
        { ...parcalar[1], konuIds: ["sub-2"] },
    ];
    assert.throws(() => parcaAtamalariniDogrula(parcalar, base.slice(0, 1), anaKonular));
    assert.throws(() => parcaAtamalariniDogrula(parcalar,
        [{ ...base[0], konuIds: ["sub-unknown"] }, base[1]], anaKonular));
    assert.throws(() => parcaAtamalariniDogrula(parcalar,
        [base[0], base[0]], anaKonular));
});

test("chunk sınıflandırması ortak kota sayacını kullanır ve 503'ü kontrollü tekrar dener", async () => {
    let apiCagriSayisi = 0;
    const beklemeler = [];
    const loglar = [];
    const istemci = { models: { generateContent: async () => {
        apiCagriSayisi++;
        if (apiCagriSayisi === 1) {
            throw Object.assign(new Error("Service Unavailable"), { status: 503 });
        }
        return { text: JSON.stringify({ atamalar: [
            { index: 0, konuIds: ["sub-1"] },
            { index: 1, konuIds: ["sub-2"] },
        ] }) };
    } } };
    const sonuc = await geminiIleParcalariKonularaAta({
        parcalar, anaKonular, istemci, modelAdi: "mock",
        ayarlar: { maksDeneme: 2, timeoutMs: 60000, maksBeklemeMs: 30000 },
        beklet: async (ms) => { beklemeler.push(ms); },
        logger: { info: (...args) => loglar.push(args), error: (...args) => loglar.push(args) },
    });
    assert.equal(sonuc.length, 2);
    assert.equal(apiCagriSayisi, 2);
    assert.equal(beklemeler.length,1);
    assert.ok(beklemeler[0]>=2500);
    assert.ok(loglar.some(([etiket, veri]) =>
        etiket === "[ParcaAtama] Batch tamamlandı" && veri.toplamApiCagrisi===2));
});

test("429 günlük kota hatasında tekrar deneme yapmaz ve terminalde batch'i bildirir", async () => {
    let apiCagriSayisi = 0;
    const loglar = [];
    const istemci = { models: { generateContent: async () => {
        apiCagriSayisi++;
        throw Object.assign(new Error("daily quota exceeded"), { status: 429 });
    } } };
    await assert.rejects(geminiIleParcalariKonularaAta({
        parcalar, anaKonular, istemci, modelAdi: "mock",
        sinir: { kontrolEt: () => {}, hataKaydet: () => {} },
        ayarlar: { maksDeneme: 3, timeoutMs: 60000, maksBeklemeMs: 30000 },
        beklet: async () => { throw new Error("Günlük kota için bekleme olmamalı"); },
        logger: { info: () => {}, error: (...args) => loglar.push(args) },
    }), (hata) => hata.kod === "GEMINI_GUNLUK_KOTA");
    assert.equal(apiCagriSayisi, 1);
    assert.ok(loglar.some(([etiket, veri]) =>
        etiket === "[ParcaAtama] İşlem durduruldu" && veri.kod === "GEMINI_GUNLUK_KOTA"));
});

test("şema tanısı eksik, tekrar eden ve bilinmeyen konu indexlerini ayırır", () => {
    const ids = new Set(["sub-1", "sub-2"]);
    assert.equal(atamaYanitiniIncele([{ index: 0, konuIds: ["sub-1"] }], 2, ids).neden, "MISSING_INDEX");
    assert.equal(atamaYanitiniIncele([
        { index: 0, konuIds: ["sub-1"] }, { index: 0, konuIds: ["sub-1"] },
    ], 2, ids).neden, "DUPLICATE_INDEX");
    assert.equal(atamaYanitiniIncele([
        { index: 0, konuIds: ["sub-1"] }, { index: 1, konuIds: ["unknown"] },
    ], 2, ids).neden, "UNKNOWN_TOPIC_ID");
});

test("503 ve eksik index sonrası aynı batch yedek modelle kurtarılır", async () => {
    let cagrilar = 0;
    const loglar = [];
    const istemci = { models: { generateContent: async () => {
        cagrilar++;
        if (cagrilar === 1) throw Object.assign(new Error("unavailable"), { status: 503 });
        if (cagrilar === 2) return { text: JSON.stringify({ atamalar: [{ index: 0, konuIds: ["sub-1"] }] }) };
        return { text: JSON.stringify({ atamalar: [
            { index: 0, konuIds: ["sub-1"] }, { index: 1, konuIds: ["sub-2"] },
        ] }) };
    } } };
    const sonuc = await geminiIleParcalariKonularaAta({
        parcalar, anaKonular, istemci, modelAdi: "mock", yedekModelAdi:"mock-backup",
        sinir: { kontrolEt: () => {}, hataKaydet: () => {} },
        ayarlar: { maksDeneme: 2, timeoutMs: 60000, maksBeklemeMs: 30000 },
        beklet: async () => {},
        logger: { info: () => {}, error: (...args) => loglar.push(args) },
    });
    assert.equal(sonuc.length, 2);
    assert.equal(cagrilar, 3);
    assert.ok(loglar.some(([etiket, veri]) => etiket === "[ParcaAtama] Şema ayrıntısı" && veri.neden === "MISSING_INDEX"));
});

test("yalnız eksik parçalar sınıflandırılır, geçerli bağlantı korunur", async () => {
    const sonuc = await eksikParcaAtamalariniTamamla({
        parcalar, anaKonular, mevcutAtamalar: [{ ...parcalar[0], konuIds: ["sub-1"] }],
        siniflandir: async eksikler => {
            assert.deepEqual(eksikler, [parcalar[1]]);
            return [{ ...eksikler[0], konuIds: ["sub-2"] }];
        },
    });
    assert.deepEqual(sonuc.map(x => x.konuIds), [["sub-1"], ["sub-2"]]);
});
test("eski sürüm ve silinen konu bağlantıları kullanılmaz", async () => {
    const sonuc = await eksikParcaAtamalariniTamamla({
        parcalar, anaKonular, mevcutAtamalar: [
            { ...parcalar[0], islemeId: "eski", konuIds: ["sub-1"] },
            { ...parcalar[1], konuIds: ["silinmis"] },
        ],
        siniflandir: async eksikler => {
            assert.deepEqual(eksikler, parcalar);
            return eksikler.map(p => ({ ...p, konuIds: ["sub-2"] }));
        },
    });
    assert.equal(sonuc.length, 2);
});
test("bütün bağlantılar geçerliyse Gemini çağrılmaz", async () => {
    const sonuc = await eksikParcaAtamalariniTamamla({
        parcalar, anaKonular, mevcutAtamalar: parcalar.map(p => ({ ...p, konuIds: ["sub-1"] })),
        siniflandir: async () => { throw Error("Gemini çağrılmamalı"); },
    });
    assert.equal(sonuc.length, 2);
});

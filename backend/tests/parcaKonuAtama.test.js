import test from "node:test";
import assert from "node:assert/strict";
import {
    geminiIleParcalariKonularaAta,
    parcaAtamalariniDogrula,
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

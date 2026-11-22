import test from "node:test";
import assert from "node:assert/strict";
import {
    dersKonulariniDogrulamaIcinGetir,
    testKonuDogrulayicisiOlustur,
} from "../services/testKonuDogrulamaService.js";

const konular = [
    { konuId: "di", baslik: "Veri, Enformasyon, Bilgi ve Bilgelik", aciklama: "Veriden enformasyona geçiş" },
    { konuId: "kalite", baslik: "Veri Kalitesi", aciklama: "Kesinlik, tamamlık, tutarlılık" },
];

const soru = (konuId, metin, cevap) => ({
    konuId, metin, dogruCevap: "B",
    secenekler: [{ anahtar: "B", metin: cevap }],
});

const sayacliEmbedding = () => {
    const cagrilar = [];
    const uret = async (metinler, { tur }) => {
        cagrilar.push({ tur, adet: metinler.length });
        return metinler.map((metin) => {
            const yazı = metin.toLocaleLowerCase("tr");
            if (yazı.includes("kalitesi") || yazı.includes("kesinlik")) return [1, 0];
            if (yazı.includes("enformasyon") || yazı.includes("bilgelik")) return [0, 1];
            return [0.6, 0.8];
        });
    };
    return { uret, cagrilar };
};

test("ders haritasındaki bütün yaprak konular karşılaştırılır, ana konu tekrar edilmez", () => {
    const liste = dersKonulariniDogrulamaIcinGetir({
        anaKonular: [
            { konuId: "ana", baslik: "Veri Bilimine Giriş", altKonular: [konular[0]] },
            { konuId: "baska", baslik: "Veri Hazırlığı", altKonular: [konular[1]] },
            { konuId: "tek", baslik: "Bağımsız konu", altKonular: [] },
        ],
    });
    assert.deepEqual(liste.map((konu) => konu.konuId), ["di", "kalite", "tek"]);
});

test("farklı alt konuya ait soru, kaynak etiketi doğru yazılsa bile reddedilir", async () => {
    const { uret } = sayacliEmbedding();
    const denetle = testKonuDogrulayicisiOlustur({ konular, embeddingUret: uret });
    const sonuc = await denetle({ sorular: [
        soru("di", "Veri kalitesi bakımından kesinlik neyi ölçer?", "Kesinlik"),
    ] });
    assert.equal(sonuc[0].gecerli, false);
    assert.equal(sonuc[0].neden, "BASKA_KONU_BELIRGIN_USTUN");
    assert.equal(sonuc[0].rakipKonuId, "kalite");
    assert.equal(sonuc[0].hedefSkor, 0);
    assert.equal(sonuc[0].rakipSkor, 1);
});

test("doğru konu sorusu kabul edilir; yakın puanlar kesin hata sayılmaz", async () => {
    const { uret } = sayacliEmbedding();
    const denetle = testKonuDogrulayicisiOlustur({ konular, embeddingUret: uret });
    const sonuc = await denetle({ sorular: [
        soru("di", "Enformasyon kavramı nedir?", "Enformasyon"),
        soru("kalite", "Veri kalitesi açısından kesinlik nedir?", "Kesinlik"),
    ] });
    assert.ok(sonuc.every((kayit) => kayit.gecerli));
});

test("aynı testi onarırken konu vektörleri ve önceki sorular tekrar embed edilmez", async () => {
    const { uret, cagrilar } = sayacliEmbedding();
    const denetle = testKonuDogrulayicisiOlustur({ konular, embeddingUret: uret });
    const sorular = [soru("di", "Enformasyon kavramı nedir?", "Enformasyon")];
    await denetle({ sorular });
    await denetle({ sorular });
    await denetle({ sorular: [soru("di", "Bilgelik nedir?", "Bilgelik")] });
    assert.deepEqual(cagrilar, [
        { tur: "dokuman", adet: 2 },
        { tur: "sorgu", adet: 1 },
        { tur: "sorgu", adet: 1 },
    ]);
});

test("karşılaştırma konusu bulunmazsa yanlış güvenle kabul edilmez", async () => {
    const { uret } = sayacliEmbedding();
    const denetle = testKonuDogrulayicisiOlustur({ konular, embeddingUret: uret });
    const sonuc = await denetle({
        sorular: [soru("olmayan", "Kesinlik nedir?", "Kesinlik")],
    });
    assert.equal(sonuc[0].gecerli, false);
    assert.equal(sonuc[0].neden, "HEDEF_BENZERLIK_DUSUK");
});

test("farklı cümlelerle aynı cevabı ölçen iki soru aynı alt konuda reddedilir", async () => {
    const denetle = testKonuDogrulayicisiOlustur({
        konular: [{ konuId: "olcum", baslik: "Ölçüm Düzeyleri" },
            { konuId: "diger", baslik: "Diğer Konular" }],
        embeddingUret: async (metinler, { tur }) => tur === "dokuman"
            ? [[1, 0], [0, 1]]
            : metinler.map(() => [0.99, 0.10]),
    });
    const sorular = [
        soru("olcum", "Hangi düzeyde mutlak sıfır bulunur?", "Ratio"),
        soru("olcum", "Mutlak sıfır noktası olan ölçüm düzeyi hangisidir?", "Ratio"),
    ];
    const sonuc = await denetle({ sorular });
    assert.equal(sonuc[0].gecerli, true);
    assert.equal(sonuc[1].gecerli, false);
    assert.equal(sonuc[1].neden, "AYNI_KAVRAM_TEKRARI");
    assert.equal(sonuc[1].tekrarEdenSoruIndeksi, 0);
});

test("önceki partide üretilen aynı kavram da yeni partide reddedilir", async () => {
    const denetle = testKonuDogrulayicisiOlustur({
        konular: [{ konuId: "olcum", baslik: "Ölçüm Düzeyleri" }],
        embeddingUret: async (metinler, { tur }) => tur === "dokuman"
            ? [[1, 0]]
            : metinler.map(() => [0.995, 0.09]),
    });
    const oncekiSorular = [soru("olcum", "Ölçüm düzeyi nedir?", "Ratio")];
    const sonuc = await denetle({
        sorular: [soru("olcum", "Aynı ölçüm kavramının başka tanımı nedir?", "Ratio")],
        oncekiSorular,
    });
    assert.equal(sonuc[0].gecerli, false);
    assert.equal(sonuc[0].neden, "AYNI_KAVRAM_TEKRARI");
});

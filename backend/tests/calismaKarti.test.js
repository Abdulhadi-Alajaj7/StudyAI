import test from "node:test";
import assert from "node:assert/strict";
import {
    konuListesiOlustur,
    makulKartSayisiniBelirle,
    konuKotalariniBelirle,
    partiKaynaklariniOlustur,
    kartAdaylariniDogrula,
} from "../services/kartUretimPlanlama.mjs";

test("Alt konu kimlikleri korunur", () => {
    const harita = { anaKonular: [
        { konuId: "a", baslik: "A", altKonular: [{ konuId: "a1", baslik: "A1" }] },
        { konuId: "b", baslik: "B" },
    ] };
    assert.deepEqual(konuListesiOlustur(harita).map(k => k.konuId), ["a1", "b"]);
});

test("Ders genelinde 60 kart sınırı yoktur; konu başına 8 sınırı korunur", () => {
    assert.equal(makulKartSayisiniBelirle({ konuSayisi: 500, karakterSayisi: 1000000 }), 910);
    assert.equal(makulKartSayisiniBelirle({ konuSayisi: 1, karakterSayisi: 50 }), 0);
    const konular = Array.from({ length: 20 }, (_, i) => ({
        konuId: "konu-" + i, parcalar: [{}], karakterSayisi: 100000,
    }));
    const plan = konuKotalariniBelirle(konular, 160);
    assert.equal(plan.reduce((toplam, k) => toplam + k.adet, 0), 160);
    assert.ok(plan.every(k => k.adet <= 8));
});

test("Bir partide kaynak kodları tüm konular arasında benzersizdir", () => {
    const gruplar = [
        { konuId: "a", baslik: "Birinci", adet: 4, parcalar: [{ materyalId: "m1", parcaIndex: 0, icerik: "A".repeat(120) }] },
        { konuId: "b", baslik: "İkinci", adet: 4, parcalar: [{ materyalId: "m2", parcaIndex: 1, icerik: "B".repeat(120) }] },
    ];
    const sonuc = partiKaynaklariniOlustur(gruplar, new Map([["m1", "ilk.pdf"], ["m2", "son.pdf"]]), p => p);
    assert.equal(sonuc.length, 2);
    assert.equal(sonuc[0].kaynaklar[0].kod, "K1");
    assert.equal(sonuc[1].kaynaklar[0].kod, "K2");
});

test("Yabancı konu ve başka konuya ait kanıtlar reddedilir", () => {
    const konular = [
        { konuId: "a", baslik: "Birinci", adet: 2, kaynaklar: [{ kod: "K1", materyalId: "m1", dosyaAdi: "ilk.pdf", parcaIndex: 0 }] },
        { konuId: "b", baslik: "İkinci", adet: 2, kaynaklar: [{ kod: "K2", materyalId: "m2", dosyaAdi: "son.pdf", parcaIndex: 0 }] },
    ];
    const sonuc = kartAdaylariniDogrula({
        konular,
        cevap: { kartlar: [
            { konuId: "a", soru: "A nedir?", cevap: "Tanım A", kaynakKodlari: ["K1"] },
            { konuId: "a", soru: "A nedir?", cevap: "Tekrar", kaynakKodlari: ["K1"] },
            { konuId: "a", soru: "Yanlış kaynak?", cevap: "Yanlış", kaynakKodlari: ["K2"] },
            { konuId: "uydurma", soru: "Yabancı?", cevap: "Olmaz", kaynakKodlari: ["K1"] },
            { konuId: "b", soru: "B nedir?", cevap: "Tanım B", kaynakKodlari: ["K2"] },
        ] },
    });
    assert.deepEqual(sonuc.map(k => k.soru), ["A nedir?", "B nedir?"]);
    assert.equal(sonuc[0].kaynaklar[0].dosyaAdi, "ilk.pdf");
});

test("Yanıtla istenen sayı aşılsa bile konu sınırı korunur", () => {
    const konular = [{ konuId: "a", baslik: "A", adet: 2,
        kaynaklar: [{ kod: "K1", materyalId: "m1", dosyaAdi: "m.pdf", parcaIndex: 1 }] }];
    const cevap = { kartlar: Array.from({ length: 12 }, (_, i) => ({
        konuId: "a", soru: "Soru " + i, cevap: "Cevap " + i, kaynakKodlari: ["K1"],
    })) };
    assert.equal(kartAdaylariniDogrula({ konular, cevap }).length, 2);
});

import test from "node:test";
import assert from "node:assert/strict";

import { metniParcalaraAyir } from "../services/metinParcalamaService.js";

test("kısa metni tek parça ve dış boşlukları temizlenmiş döndürür", () => {
    assert.deepEqual(
        metniParcalaraAyir("  Kısa bir ders metni.  ", 100, 20),
        ["Kısa bir ders metni."]
    );
});

test("boş ve yalnızca boşluk içeren girdiler parça üretmez", () => {
    assert.deepEqual(metniParcalaraAyir(""), []);
    assert.deepEqual(metniParcalaraAyir(" \n\t "), []);
    assert.deepEqual(metniParcalaraAyir(null), []);
});

test("uzun boşluksuz metinde overlap korunur, kayıp olmaz ve döngü sonlanır", () => {
    const metin = Array.from(
        { length: 120 },
        (_, index) => String.fromCharCode(0x0100 + index)
    ).join("");
    const maxLength = 25;
    const overlap = 6;

    const parcalar = metniParcalaraAyir(metin, maxLength, overlap);
    const konumlar = parcalar.map((parca) => metin.indexOf(parca));

    assert.ok(parcalar.length > 1);
    assert.equal(konumlar[0], 0);
    assert.equal(
        konumlar.at(-1) + parcalar.at(-1).length,
        metin.length
    );

    for (let index = 0; index < parcalar.length; index++) {
        assert.ok(parcalar[index].length > 0);
        assert.ok(parcalar[index].length <= maxLength);

        if (index > 0) {
            assert.equal(
                konumlar[index],
                konumlar[index - 1] + parcalar[index - 1].length - overlap
            );
            assert.equal(
                parcalar[index - 1].slice(-overlap),
                parcalar[index].slice(0, overlap)
            );
        }
    }
});

test("çok uzun metni sınırlı boyutlu parçalara ayırır", () => {
    const metin = "x".repeat(50_000);
    const parcalar = metniParcalaraAyir(metin, 1000, 200);

    assert.equal(parcalar.length, 63);
    assert.ok(parcalar.every((parca) => parca.length <= 1000));
    assert.equal(parcalar.at(-1).length, 400);
});

test("tekrarlanan gerçek metin parçalarını kayıp oluşturacak şekilde tekilleştirmez", () => {
    const metin = "tekrar ".repeat(80).trim();
    const parcalar = metniParcalaraAyir(metin, 35, 7);

    assert.ok(parcalar.length > 2);
    assert.ok(new Set(parcalar).size < parcalar.length);
    assert.ok(parcalar.every((parca) => metin.includes(parca)));
});

test("kelime ve cümle sınırlarında sıralamayı korur ve metin kaybetmez", () => {
    const kelimeler = Array.from(
        { length: 60 },
        (_, index) => `benzersiz${String(index).padStart(2, "0")}`
    );
    const metin = `${kelimeler.slice(0, 30).join(" ")}.\n\n${kelimeler.slice(30).join(" ")}?`;
    const parcalar = metniParcalaraAyir(metin, 90, 18);

    for (const kelime of kelimeler) {
        assert.ok(
            parcalar.some((parca) => parca.includes(kelime)),
            `${kelime} en az bir parçada korunmalı`
        );
    }

    const ilkGorunumler = kelimeler.map((kelime) =>
        parcalar.findIndex((parca) => parca.includes(kelime))
    );
    assert.deepEqual(ilkGorunumler, [...ilkGorunumler].sort((a, b) => a - b));
});

test("özel karakterleri korur ve en küçük parça boyutunda ilerler", () => {
    assert.deepEqual(
        metniParcalaraAyir("  ç, ğ, ı, İ, ö, ş, ü — © ✓  ", 100, 20),
        ["ç, ğ, ı, İ, ö, ş, ü — © ✓"]
    );
    assert.deepEqual(
        metniParcalaraAyir("abcdef", 1, 0),
        ["a", "b", "c", "d", "e", "f"]
    );
});

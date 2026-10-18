import test from "node:test";
import assert from "node:assert/strict";
import {
    materyalDosyalariniDogrula,
    MAKSIMUM_DOSYA_BOYUTU
} from "../src/utils/materyalDosyalari.mjs";

const dosya = (name, size = 100, lastModified = 1) => ({ name, size, lastModified });

test("tekli ve çoklu desteklenen materyaller doğrulamadan geçer", () => {
    const sonuc = materyalDosyalariniDogrula([
        dosya("notlar.pdf"),
        dosya("sunum.pptx"),
        dosya("özet.txt")
    ]);

    assert.equal(sonuc.gecerliDosyalar.length, 3);
    assert.deepEqual(sonuc.hatalar, []);
});

test("desteklenmeyen, büyük ve aynı seçimde yinelenen dosyalar ayrı bildirilir", () => {
    const ayni = dosya("ders.docx", 500, 42);
    const sonuc = materyalDosyalariniDogrula([
        ayni,
        { ...ayni },
        dosya("video.mp4"),
        dosya("buyuk.pdf", MAKSIMUM_DOSYA_BOYUTU + 1)
    ]);

    assert.equal(sonuc.gecerliDosyalar.length, 1);
    assert.equal(sonuc.hatalar.length, 3);
    assert.match(sonuc.hatalar.join(" "), /birden fazla kez/);
    assert.match(sonuc.hatalar.join(" "), /desteklenmiyor/);
    assert.match(sonuc.hatalar.join(" "), /50 MB/);
});

test("mevcut dosya sayısı sınırı değiştirilmeden korunur", () => {
    const sonuc = materyalDosyalariniDogrula(
        Array.from({ length: 11 }, (_, index) => dosya(`${index}.pdf`))
    );

    assert.equal(sonuc.gecerliDosyalar.length, 0);
    assert.match(sonuc.hatalar[0], /en fazla 10 dosya/);
});

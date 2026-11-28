import test from "node:test";
import assert from "node:assert/strict";
import {
    materyalDosyalariniDogrula
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

test("desteklenmeyen ve aynı seçimde yinelenen dosyalar ayrı bildirilir", () => {
    const ayni = dosya("ders.docx", 500, 42);
    const sonuc = materyalDosyalariniDogrula([ayni, { ...ayni }, dosya("video.mp4")]);

    assert.equal(sonuc.gecerliDosyalar.length, 1);
    assert.equal(sonuc.hatalar.length, 2);
    assert.match(sonuc.hatalar.join(" "), /birden fazla kez/);
    assert.match(sonuc.hatalar.join(" "), /desteklenmiyor/);
});

test("dört dosyalık seçim reddedilir", () => {
    const sonuc = materyalDosyalariniDogrula(
        Array.from({ length: 4 }, (_, index) => dosya(`${index}.pdf`))
    );

    assert.equal(sonuc.gecerliDosyalar.length, 0);
    assert.match(sonuc.hatalar[0], /en fazla 3 materyal/);
});

test("çoklu seçim mevcut materyalleri hesaba katar ve silme sonrası seçim yeniden kabul edilir", () => {
    const secim = [dosya("notlar.pdf"), dosya("sunum.pptx")];
    const asim = materyalDosyalariniDogrula(secim, 2);
    assert.deepEqual(asim.gecerliDosyalar, []);
    assert.match(asim.hatalar[0], /En fazla 1 dosya daha/);
    for (const mevcutSayi of [3, 4]) {
        const dolu = materyalDosyalariniDogrula(secim.slice(0, 1), mevcutSayi);
        assert.deepEqual(dolu.gecerliDosyalar, []);
        assert.match(dolu.hatalar[0], /mevcut bir materyali silin/);
    }
    assert.deepEqual(materyalDosyalariniDogrula(secim, 1).gecerliDosyalar, secim);
});

for (const [uzanti, bayt, etiket] of [
    ["PDF", 2097152, "2 MB"],
    ["PPTX", 2097152, "2 MB"],
    ["DOCX", 1048576, "1 MB"],
    ["TXT", 51200, "50 KB"]
]) {
    test(`${uzanti} tam boyut sınırında geçer ve bir bayt üzerinde reddedilir`, () => {
        const uygun = dosya(`uygun.${uzanti}`, bayt);
        const buyuk = dosya(`buyuk.${uzanti}`, bayt + 1);
        const sonuc = materyalDosyalariniDogrula([uygun, buyuk]);
        assert.deepEqual(sonuc.gecerliDosyalar, [uygun]);
        assert.match(sonuc.hatalar[0], new RegExp(etiket));
    });
}

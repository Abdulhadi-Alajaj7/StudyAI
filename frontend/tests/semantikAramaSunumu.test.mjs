import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const kaynak = fs.readFileSync(
    new URL("../src/components/SemantikAramaBolumu.jsx", import.meta.url),
    "utf8"
);

test("kosinüs skoru doğruluk yüzdesi gibi değil, benzerlik skoru olarak sunulur", () => {
    assert.match(kaynak, /Benzerlik skoru:/);
    assert.doesNotMatch(kaynak, /%\{.*sonuc\.skor.*eşleşme/s);
    assert.match(kaynak, /doğruluk oranı değildir/);
});

test("aday sınırı uygulandığında dengeli örnekleme kullanıcıya açıklanır", () => {
    assert.match(kaynak, /meta\?\.adaylarSinirlandi/);
    assert.match(kaynak, /tüm materyallere dengeli dağıtılmış/);
});


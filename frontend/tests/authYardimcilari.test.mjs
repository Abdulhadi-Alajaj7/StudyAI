import test from "node:test";
import assert from "node:assert/strict";
import { basHarfler, guvenliDonusYolu, yeniSifreHatasi } from "../src/utils/authYardimcilari.mjs";

test("gerçek adın Türkçe baş harfleri ve boş ad güvenli hesaplanır", () => {
    assert.equal(basHarfler("  Ahmet  Yılmaz "), "AY"); assert.equal(basHarfler("İpek"), "İ"); assert.equal(basHarfler(""), "K");
});
test("şifre eşleşmesi, uzunluk ve bcrypt UTF-8 sınırı doğrulanır", () => {
    assert.match(yeniSifreHatasi("abc123", "baska"), /eşleşmiyor/);
    assert.ok(yeniSifreHatasi("abc", "abc")); assert.ok(yeniSifreHatasi("ü".repeat(37), "ü".repeat(37)));
    assert.equal(yeniSifreHatasi("Yeni123!", "Yeni123!"), "");
});
test("giriş sonrası dönüş yalnız uygulama içi doğrulama sayfasıdır", () => {
    const yol = `/eposta-dogrula/${"a".repeat(64)}`; assert.equal(guvenliDonusYolu(yol), yol);
    for (const s of ["https://evil.test", "//evil.test", "/panel?token=x", undefined]) assert.equal(guvenliDonusYolu(s), "/panel");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { dersDurumunuGetir, hazirlamaAdimlariniGetir } from "../src/utils/dersHazirlamaSunumu.mjs";

const durumlar = ders => hazirlamaAdimlariniGetir(ders).map(a => a.durum);

test("her gerçek hazırlama aşaması yalnız önceki adımları tamamlanmış gösterir", () => {
    assert.deepEqual(durumlar({ hazirlamaDurumu: "isleniyor", hazirlamaAsamasi: "metinler" }),
        ["isleniyor", "bekliyor", "bekliyor", "bekliyor"]);
    assert.deepEqual(durumlar({ hazirlamaDurumu: "isleniyor", hazirlamaAsamasi: "embedding" }),
        ["tamamlandi", "isleniyor", "bekliyor", "bekliyor"]);
    assert.deepEqual(durumlar({ hazirlamaDurumu: "isleniyor", hazirlamaAsamasi: "harita" }),
        ["tamamlandi", "tamamlandi", "isleniyor", "bekliyor"]);
});

test("hata hangi aşamada oluştuysa orada gösterilir; başarılı önceki aşamalar korunur", () => {
    for (const [asama, beklenen] of [
        ["metinler", ["hata", "bekliyor", "bekliyor", "bekliyor"]],
        ["embedding", ["tamamlandi", "hata", "bekliyor", "bekliyor"]],
        ["harita", ["tamamlandi", "tamamlandi", "hata", "bekliyor"]],
    ]) {
        const ders = { hazirlamaDurumu: "hata", hazirlamaAsamasi: asama };
        assert.deepEqual(durumlar(ders), beklenen);
    }
});

test("eksik, bilinmeyen veya onaysız tamamlandı bilgisi başarıya dönüştürülmez", () => {
    for (const ders of [null, {}, { hazirlamaDurumu: "bekliyor", hazirlamaAsamasi: "harita" },
        { hazirlamaDurumu: "isleniyor", hazirlamaAsamasi: "bilinmiyor" },
        { hazirlamaDurumu: "hata" }, { hazirlamaDurumu: "tamamlandi", materyallerOnaylandi: false },
        { hazirlamaDurumu: "isleniyor", hazirlamaAsamasi: "tamamlandi" }]) {
        assert.deepEqual(durumlar(ders), ["bekliyor", "bekliyor", "bekliyor", "bekliyor"]);
    }
});

test("yeniden deneme isteği beklerken eski hata veya başarı yeni işlem için kullanılmaz", () => {
    const ders = { hazirlamaDurumu: "hata", hazirlamaAsamasi: "harita" };
    assert.deepEqual(hazirlamaAdimlariniGetir(ders, true).map(a => a.durum), ["bekliyor", "bekliyor", "bekliyor", "bekliyor"]);
});

test("yalnız sunucunun kalıcı onayı son adımı başarılı gösterir", () => {
    assert.deepEqual(durumlar({ materyallerOnaylandi: true }), ["tamamlandi", "tamamlandi", "tamamlandi", "tamamlandi"]);
});

test("yenilenen sayfa aynı sunucu verisiyle aynı adımları gösterir", () => {
    const sunucu = { hazirlamaDurumu: "hata", hazirlamaAsamasi: "harita" };
    assert.deepEqual(hazirlamaAdimlariniGetir(sunucu), hazirlamaAdimlariniGetir(JSON.parse(JSON.stringify(sunucu))));
});

test("ders kartı onay, hazırlama, hata ve bekleme bilgilerini doğru durumla eşler", () => {
    assert.equal(dersDurumunuGetir({ materyallerOnaylandi: true }).durum, "hazir");
    assert.equal(dersDurumunuGetir({ hazirlamaDurumu: "isleniyor" }).durum, "isleniyor");
    const hatali = dersDurumunuGetir({ hazirlamaDurumu: "hata", hazirlamaHatasi: "Kota dolu." });
    assert.equal(hatali.durum, "hata");
    assert.equal(hatali.aciklama, "Kota dolu.");
    assert.equal(dersDurumunuGetir(null).durum, "bekliyor");
    assert.equal(dersDurumunuGetir({ materyallerOnaylandi: false }, { durum: "hazir" }).durum, "bekliyor");
});

test("eski onaylı dersler ve harita yükleme sırası yanlış bekleme veya hata üretmez", () => {
    const onayli = { materyallerOnaylandi: true };
    assert.equal(dersDurumunuGetir(onayli, null).durum, "hazir");
    assert.equal(dersDurumunuGetir(onayli, { durum: "hata" }).durum, "hazir");
    assert.equal(dersDurumunuGetir({}, { durum: "olusturuluyor" }).durum, "isleniyor");
    assert.equal(dersDurumunuGetir({}, { durum: "hata" }).durum, "hata");
});

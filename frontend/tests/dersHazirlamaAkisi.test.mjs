import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const kaynak = await readFile(new URL("../src/pages/MateryalEkle.jsx", import.meta.url), "utf8");
const hazirlamaEkrani = await readFile(new URL("../src/components/DersHazirlamaEkrani.jsx", import.meta.url), "utf8");
const hazirlamaSunumu = await readFile(new URL("../src/utils/dersHazirlamaSunumu.mjs", import.meta.url), "utf8");

test("Devam yalnız son onay modalını açar; onay isteği göndermez", () => {
    const devam = kaynak.slice(kaynak.indexOf("const handleNext ="), kaynak.indexOf("const handleOnayla ="));
    assert.match(devam, /setOnayModalAcik\(true\)/);
    assert.doesNotMatch(devam, /api\.|navigate\(/);
    assert.match(kaynak, /Onayla ve Dersi Hazırla/);
    assert.match(kaynak, /Geri Dön ve Kontrol Et/);
});

test("son onay hazırlamayı başlatır; yanıt kaybında sunucu durumu yeniden okunur", () => {
    const onay = kaynak.slice(kaynak.indexOf("const handleOnayla ="), kaynak.indexOf("const hazirlamaModalAcik ="));
    assert.match(onay, /materyaller\/onayla/);
    assert.match(onay, /onayIstekRef\.current = true/);
    assert.match(onay, /catch[\s\S]*await dersGetir\(\)/);
    assert.doesNotMatch(onay, /navigate\(/);
});

test("sayfa açılışı ve polling hazırlamayı okumakla yetinir; yalnız kalıcı onay hazır sayfasına yönlendirir", () => {
    const yukle = kaynak.slice(kaynak.indexOf("const dersGetir ="), kaynak.indexOf("const handleDosyaSec"));
    assert.match(yukle, /\/hazirlama/);
    assert.match(yukle, /guncelDers\.materyallerOnaylandi === true/);
    assert.match(yukle, /\/hazir/);
    assert.match(yukle, /setTimeout\(yenile, 3000\)/);
    assert.doesNotMatch(yukle, /api\.post/);
});

test("hazırlama ekranı gerçek aşamaları, hata ve yeniden denemeyi gösterir; sahte yüzde yoktur", () => {
    for (const metin of ["Dersiniz Hazırlanıyor", "Metinler kontrol ediliyor", "Anlamsal arama hazırlanıyor",
        "Konu haritası oluşturuluyor", "Dersiniz hazır", "Materyalleri Kontrol Et", "Yeniden Dene"]) {
        assert.ok((hazirlamaEkrani + hazirlamaSunumu).includes(metin), metin);
    }
    assert.match(hazirlamaSunumu, /ders\?\.hazirlamaAsamasi/);
    assert.match(kaynak, /yenidenDene=\{handleOnayla\}/);
    assert.match(kaynak, /materyalleriKontrolEt=\{\(\) => setMateryalKontrol\(true\)\}/);
    assert.doesNotMatch(kaynak + hazirlamaEkrani + hazirlamaSunumu, /Math\.random|--%|setProgress|setYuzde/);
});

test("hazır sayfası doğrudan açılırsa onay sunucudan doğrulanır; taslak materyal ekranına döner", async () => {
    const hazir = await readFile(new URL("../src/pages/DersHazir.jsx", import.meta.url), "utf8");
    assert.match(hazir, /res\.data\.ders\.materyallerOnaylandi !== true/);
    assert.match(hazir, /\/materyal`, \{ replace: true \}/);
    assert.match(hazir, /if \(onaylananDersId !== dersId\)/);
    assert.ok(hazir.indexOf("if (onaylananDersId !== dersId)") < hazir.indexOf("Dersin oluşturuldu"));
});

test("hazırlama modalı materyal sayfasının üzerinde açılır; arka plan etkileşimi ve ikinci onay modalı engellenir", () => {
    assert.match(kaynak, /const hazirlamaModalAcik = hazirlaniyor \|\| \(ders\?\.hazirlamaDurumu === "hata" && !materyalKontrol\)/);
    assert.match(kaynak, /inert=\{hazirlamaModalAcik \|\| undefined\}/);
    assert.match(kaynak, /onayModalAcik && !hazirlamaModalAcik/);
    assert.ok(kaynak.indexOf("Ders Materyallerini Ekle") < kaynak.indexOf("{hazirlamaModalAcik && <DersHazirlamaEkrani"));
    assert.doesNotMatch(kaynak, /if \(hazirlaniyor[^}]*return <DersHazirlamaEkrani/);
});

test("hazır sayfası yan kartında ek durum alanı yoktur; mevcut butonun yerleşimi ve eylemi korunur", async () => {
    const hazir = await readFile(new URL("../src/pages/DersHazir.jsx", import.meta.url), "utf8");
    const kart = hazir.slice(hazir.indexOf("{/* Önizleme Kartı */}"), hazir.indexOf("{/* Sonraki Adım */}"));
    assert.doesNotMatch(kart, /DersDurumRozeti|aria-label="Ders durumu"/);
    assert.match(kart, /w-full py-2\.5 rounded-xl text-\[13px\]/);
    assert.match(kart, /onClick=\{\(\) => navigate\(dersDetayYolu\(dersId\)/);
    assert.match(kart, /Derse Git <ArrowRightIcon/);
    assert.match(kart, /bg-\[#4F46E5\] text-white/);
    assert.match(kart, /hover:bg-\[#4338CA\]/);
});

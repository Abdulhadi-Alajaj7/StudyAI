import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const sayfaKaynagi = await readFile(
    new URL("../src/pages/DersTestler.jsx", import.meta.url),
    "utf8"
);
const routerKaynagi = await readFile(
    new URL("../src/App.jsx", import.meta.url),
    "utf8"
);
const cozumKaynagi = await readFile(
    new URL("../src/pages/TestCoz.jsx", import.meta.url),
    "utf8"
);
const sonucKaynagi = await readFile(
    new URL("../src/pages/TestSonucu.jsx", import.meta.url),
    "utf8"
);

test("test formu hedef seçimini kapsama göre açar ve geçersiz girdide oluşturmayı kapatır", () => {
    assert.match(sayfaKaynagi, /kapsamTuru === "materyal" \|\| kapsamTuru === "konu"/);
    assert.match(sayfaKaynagi, /kapsamTuru === "materyal" \? \(/);
    assert.match(sayfaKaynagi, /disabled=\{sayfaYukleniyor \|\| olusturuluyor \|\| !olusturmaGirdisi\}/);
});

test("çift oluşturma ve eski ders yanıtları senkron kilit ve ders kimliğiyle engellenir", () => {
    assert.match(sayfaKaynagi, /olusturuluyorRef\.current/);
    assert.match(sayfaKaynagi, /Promise\.allSettled/);
    assert.match(sayfaKaynagi, /aktifDersRef\.current !== istekDersId/);
    assert.match(sayfaKaynagi, /controller\.abort\(\)/);
});

test("çözme ve sonuç yolları gerçek ekranlara bağlanır", () => {
    assert.match(routerKaynagi, /path="testler\/:testId\/coz"/);
    assert.match(routerKaynagi, /path="testler\/:testId\/sonuc"/);
    assert.match(routerKaynagi, /element=\{<TestCoz \/>\}/);
    assert.match(routerKaynagi, /element=\{<TestSonucu \/>\}/);
    assert.doesNotMatch(routerKaynagi, /TestAsamaBekliyor/);
});

test("çözme ekranı detay yükleme, serbest gezinme, otomatik kayıt ve bitirme onayı içerir", () => {
    assert.match(cozumKaynagi, /testDetayiniGetir/);
    assert.match(cozumKaynagi, /yuklenenTest\.durum === "hazirlandi"/);
    assert.match(cozumKaynagi, /yuklenenTest\.durum === "tamamlandi"/);
    assert.match(cozumKaynagi, /cevabiKaydet/);
    assert.match(cozumKaynagi, /soruIsaretiniGuncelle/);
    assert.match(cozumKaynagi, /sonSoruyuKaydet/);
    assert.match(cozumKaynagi, /sonGoruntulenenSoru/);
    assert.match(cozumKaynagi, /role="dialog"/);
    assert.match(cozumKaynagi, /kayitlariGuvenleTamamla/);
    assert.match(cozumKaynagi, /testiTamamla/);
    assert.match(cozumKaynagi, /beforeunload/);
    assert.match(cozumKaynagi, /document\.addEventListener\("click"/);
});

test("sonuç ekranı backend sonucunu ve bütün soruları salt okunur gösterir", () => {
    assert.match(sonucKaynagi, /testSonucunuGetir/);
    assert.match(sonucKaynagi, /test\.sonuc\.dogruSayisi/);
    assert.match(sonucKaynagi, /test\.sonuc\.yanlisSayisi/);
    assert.match(sonucKaynagi, /test\.sonuc\.bosSayisi/);
    assert.match(sonucKaynagi, /test\.sorular\.map/);
    assert.match(sonucKaynagi, /soru\.dogruCevap/);
    assert.match(sonucKaynagi, /soru\.aciklama/);
    assert.doesNotMatch(sonucKaynagi, /cevabiKaydet|soruIsaretiniGuncelle|testOlustur/);
});

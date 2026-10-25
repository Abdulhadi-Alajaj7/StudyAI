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

test("yeni test formunda yalnız Konu kapsamı görünür ve varsayılan seçilidir", () => {
    const kapsamBlogu = sayfaKaynagi.match(/const kapsamlar = \[([\s\S]*?)\];/)?.[1] || "";
    const aktifKapsamSatirlari = kapsamBlogu
        .split("\n")
        .filter((satir) => !satir.trim().startsWith("//"))
        .join("\n");

    assert.doesNotMatch(aktifKapsamSatirlari, /tum_ders|materyal/);
    assert.match(aktifKapsamSatirlari, /deger: "konu"/);
    assert.match(kapsamBlogu, /\/\/.*deger: "tum_ders"/);
    assert.match(kapsamBlogu, /\/\/.*deger: "materyal"/);
    assert.match(sayfaKaynagi, /useState\("konu"\)/);
});

test("Konu Seçimi ilk satırın solunda yer alır ve kapsam seçici görünümden kaldırılır", () => {
    assert.match(
        sayfaKaynagi,
        /<fieldset className="min-w-0 xl:col-span-4">[\s\S]*?Konu Seçimi[\s\S]*?id="test-konu"/
    );
    assert.match(
        sayfaKaynagi,
        /gizliKapsamArayuzuGorunur && \(\s*<fieldset className="xl:col-span-4">/
    );

    const konuSecimiKonumu = sayfaKaynagi.indexOf("Konu Seçimi");
    const soruSayisiKonumu = sayfaKaynagi.indexOf("Soru Sayısı");
    const zorlukKonumu = sayfaKaynagi.indexOf("Zorluk Seviyesi");
    assert.ok(konuSecimiKonumu < soruSayisiKonumu);
    assert.ok(soruSayisiKonumu < zorlukKonumu);
});

test("test formu hedef seçimini kapsama göre açar ve geçersiz girdide oluşturmayı kapatır", () => {
    assert.match(sayfaKaynagi, /kapsamTuru === "materyal" \|\| kapsamTuru === "konu"/);
    assert.match(sayfaKaynagi, /kapsamTuru === "materyal" \? \(/);
    assert.match(sayfaKaynagi, /testOlusturmaButonuDevreDisiMi/);
    assert.match(sayfaKaynagi, /disabled=\{olusturmaDevreDisi\}/);
});

test("çift oluşturma ve eski ders yanıtları senkron kilit ve ders kimliğiyle engellenir", () => {
    assert.match(sayfaKaynagi, /olusturuluyorRef\.current/);
    assert.match(sayfaKaynagi, /Promise\.allSettled/);
    assert.match(sayfaKaynagi, /testlerIstegiGuncelMi/);
    assert.match(sayfaKaynagi, /aktifDersId: aktifDersRef\.current/);
    assert.match(sayfaKaynagi, /controller\.abort\(\)/);
});

test("StrictMode tekrar kurulumu kalıcı monte bayrağına bağlı değildir ve yükleme finally ile kapanır", () => {
    assert.doesNotMatch(sayfaKaynagi, /monteRef/);
    assert.match(sayfaKaynagi, /sayfaControllerRef\.current = controller/);
    assert.match(sayfaKaynagi, /finally \{\s*if \(istekGuncelMi\(\)\) setSayfaYukleniyor\(false\);/);
});

test("liste hataları skeleton yerine yeniden deneme eylemiyle gösterilir", () => {
    assert.match(sayfaKaynagi, /listeHatalari\.devam \? \(/);
    assert.match(sayfaKaynagi, /listeHatalari\.tamamlanan \? \(/);
    assert.match(sayfaKaynagi, /onRetry=\{\(\) => setYenilemeAnahtari/);
    assert.match(sayfaKaynagi, /Devam eden test bulunmuyor/);
    assert.match(sayfaKaynagi, /Henüz tamamlanmış test yok/);
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

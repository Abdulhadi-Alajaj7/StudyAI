import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const sayfa = fs.readFileSync(new URL("../src/pages/DersSohbet.jsx", import.meta.url), "utf8");
const liste = fs.readFileSync(new URL("../src/components/SohbetListesi.jsx", import.meta.url), "utf8");
const mesaj = fs.readFileSync(new URL("../src/components/SohbetMesaji.jsx", import.meta.url), "utf8");
const markdown = fs.readFileSync(new URL("../src/components/GuvenliMarkdown.jsx", import.meta.url), "utf8");
const stiller = fs.readFileSync(new URL("../src/index.css", import.meta.url), "utf8");

test("yeni sohbet görünümü veritabanı çağrısı yapmadan temizlenir ve ilk POST mesajla yapılır", () => {
    assert.match(sayfa, /const yeniSohbetGorunumu/);
    assert.doesNotMatch(sayfa.match(/const yeniSohbetGorunumu[\s\S]*?const mesajGonder/)?.[0] || "", /sohbetApi\./);
    assert.match(sayfa, /sohbetApi\.sohbetOlustur\(dersId, \{ ilkMesaj: temizIcerik, istemciIstekId \}\)/);
});

test("mevcut sohbet, geçmiş, yeniden adlandırma ve silme gerçek API ile bağlıdır", () => {
    assert.match(sayfa, /sohbetApi\.mesajlariGetir/);
    assert.match(sayfa, /sohbetApi\.mesajGonder/);
    assert.match(sayfa, /sohbetApi\.baslikGuncelle/);
    assert.match(sayfa, /sohbetApi\.sohbetSil/);
    assert.match(liste, /Yeniden Adlandır/);
    assert.match(liste, /> Sil/);
});

test("çift gönderim senkron kilitle engellenir ve aynı istek kimliğiyle yeniden deneme vardır", () => {
    assert.match(sayfa, /gonderiliyorRef\.current = true/);
    assert.match(sayfa, /if \(!temizIcerik \|\| gonderiliyorRef\.current/);
    assert.match(sayfa, /Aynı istekle yeniden dene/);
    assert.match(sayfa, /yenidenDenenecek.*istemciIstekId/s);
});

test("Enter gönderir, Shift+Enter satır ekler ve dosya ekleme kontrolü yoktur", () => {
    assert.match(sayfa, /event\.key === "Enter" && !event\.shiftKey/);
    const tumKaynak = `${sayfa}\n${liste}`;
    assert.doesNotMatch(tumKaynak, /PaperClip|type=["']file["']|drag-and-drop|onDrop=/i);
});

test("mobil sohbet geçmişi erişilebilir drawer olarak açılıp kapanır", () => {
    assert.match(sayfa, /aria-controls="mobil-sohbet-listesi"/);
    assert.match(sayfa, /aria-expanded=\{mobilListeAcik\}/);
    assert.match(sayfa, /aria-haspopup="dialog"/);
    assert.match(sayfa, /drawerOncekiOdakRef/);
    assert.match(sayfa, /document\.body\.style\.overflow = "hidden"/);
    assert.match(sayfa, /inert=\{mobilListeAcik/);
    assert.match(liste, /role=\{mobil \? "dialog"/);
    assert.match(liste, /aria-modal=\{mobil \? "true"/);
    assert.match(liste, /event\.key === "Escape"/);
    assert.match(liste, /Sohbet geçmişini kapat/);
});

test("sohbet yüksekliği görsel viewport'a uyar ve yalnızca iç listeler kaydırılır", () => {
    assert.match(sayfa, /window\.visualViewport/);
    assert.match(sayfa, /getBoundingClientRect\(\)\.top/);
    assert.match(sayfa, /className="grid h-full min-h-0/);
    assert.doesNotMatch(sayfa, /h-\[min\(780px|min-h-\[570px/);
    assert.match(sayfa, /Mesaj geçmişi/);
    assert.match(sayfa, /overflow-x-hidden overflow-y-auto overscroll-contain/);
    assert.match(liste, /overflow-x-hidden overflow-y-auto overscroll-contain/);
    assert.match(sayfa, /const altBosluk = window\.innerWidth < 640 \? 4 : 8/);
});

test("masaüstü sohbet listesi daraltılır ve mesaj okuma alanı genişletilir", () => {
    assert.match(sayfa, /lg:grid-cols-\[260px_minmax\(0,1fr\)\]/);
    assert.match(sayfa, /max-w-5xl/);
    assert.match(mesaj, /sm:max-w-\[92%\]/);
    assert.match(sayfa, /min-h-0 flex-1 overflow-x-hidden overflow-y-auto/);
});

test("mesaj geçmişi scrollbar'ı görünür, ince ve iki temayla uyumludur", () => {
    assert.match(sayfa, /sohbet-mesaj-scrollbar/);
    assert.match(stiller, /\.sohbet-mesaj-scrollbar\s*\{/);
    assert.match(stiller, /scrollbar-width:\s*thin/);
    assert.match(stiller, /\.sohbet-mesaj-scrollbar--light/);
    assert.match(stiller, /\.sohbet-mesaj-scrollbar--dark/);
    assert.match(stiller, /\.sohbet-mesaj-scrollbar::-webkit-scrollbar/);
    assert.doesNotMatch(stiller, /(?:^|\n)\s*\*::?-webkit-scrollbar|(?:^|\n)\s*html::?-webkit-scrollbar|(?:^|\n)\s*body::?-webkit-scrollbar/);
});

test("kaynak rozetleri yalnızca materyal adını gösterir, konum metadata'sını kullanmaz", () => {
    assert.match(mesaj, /kaynakMateryalAdlari\(mesaj\.kaynaklar\)/);
    assert.doesNotMatch(mesaj, /parcaIndex|konum|sayfa|slayt|bolum/);
});

test("asistan içeriği ve kopyalama işlemi temizlenmiş dahili atıf metnini kullanır", () => {
    assert.match(mesaj, /dahiliKaynakAtiflariniTemizle\(mesaj\.icerik\)/);
    assert.match(mesaj, /clipboard\.writeText\(gosterilecekIcerik\)/);
    assert.match(mesaj, /<GuvenliMarkdown icerik=\{gosterilecekIcerik\}/);
});

test("asistan Markdown'ı raw HTML çalıştırmadan güvenli React düğümleriyle gösterir", () => {
    assert.match(mesaj, /<GuvenliMarkdown icerik=\{gosterilecekIcerik\}/);
    assert.doesNotMatch(markdown, /dangerouslySetInnerHTML/);
    assert.match(markdown, /\["http:", "https:"\]/);
});

test("sohbet listesi tarih grupları veya gereksiz ayırıcılar içermez", () => {
    assert.doesNotMatch(liste, /BUGÜN|DÜN|GEÇEN HAFTA/i);
    assert.doesNotMatch(liste, /divide-y/);
});

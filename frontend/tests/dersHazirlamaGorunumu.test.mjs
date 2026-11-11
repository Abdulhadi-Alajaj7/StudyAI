import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

let vite, Ekran, Rozet;
before(async () => {
    vite = await createServer({ server: { middlewareMode: true }, appType: "custom" });
    Ekran = (await vite.ssrLoadModule("/src/components/DersHazirlamaEkrani.jsx")).default;
    Rozet = (await vite.ssrLoadModule("/src/components/DersDurumRozeti.jsx")).default;
});
after(async () => { await vite?.close(); });

const ekran = props => renderToStaticMarkup(React.createElement(Ekran, {
    ders: { dersAdi: "Veri Yapıları", hazirlamaDurumu: "isleniyor", hazirlamaAsamasi: "harita" },
    yenidenDene() {}, materyalleriKontrolEt() {}, ...props,
}));

for (const isDark of [false, true]) {
    test(`${isDark ? "koyu" : "açık"} tema: hazırlama adımları yeşil tik, aktif işlem ve nötr beklemeyle çizilir`, () => {
        const html = ekran({ isDark });
        assert.match(html, /Dersiniz Hazırlanıyor/);
        assert.match(html, /Materyalleriniz işleniyor ve dersiniz öğrenmeye hazır hâle getiriliyor\./);
        assert.equal((html.match(/data-durum="tamamlandi"/g) || []).length, 2);
        assert.equal((html.match(/data-durum="isleniyor"/g) || []).length, 1);
        assert.equal((html.match(/data-durum="bekliyor"/g) || []).length, 1);
        assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
        assert.match(html, /bg-emerald-500 text-white/);
        assert.match(html, /motion-safe:animate-spin/);
        assert.match(html, /sm:p-6/);
        assert.doesNotMatch(html, /Yeniden Dene|aria-label="Kapat"|<progress/);
        assert.doesNotMatch(html.replace(/<[^>]*>/g, ""), /\d+%/);
    });

    test(`${isDark ? "koyu" : "açık"} tema: hata adımı kırmızıdır; backend mesajı ve iki eylem korunur`, () => {
        const html = ekran({ isDark, ders: { hazirlamaDurumu: "hata", hazirlamaAsamasi: "harita", hazirlamaHatasi: "Gemini istek kotası dolu." } });
        assert.match(html, /Ders hazırlanamadı/);
        assert.match(html, /Gemini istek kotası dolu\./);
        assert.equal((html.match(/data-durum="tamamlandi"/g) || []).length, 2);
        assert.equal((html.match(/data-durum="hata"/g) || []).length, 1);
        assert.match(html, /bg-red-500 text-white/);
        assert.match(html, /Yeniden Dene/);
        assert.match(html, /Materyalleri Kontrol Et/);
        assert.doesNotMatch(html, /motion-safe:animate-spin/);
    });

    test(`${isDark ? "koyu" : "açık"} tema: durum kartının ikon, kenarlık ve metin renkleri aynı durumu izler`, () => {
        for (const [durum, renk] of [["hazir", "emerald"], ["isleniyor", "indigo"], ["hata", "red"]]) {
            const html = renderToStaticMarkup(React.createElement(Rozet, { durum, isDark, baslik: "Durum", detay: "Açıklama" }));
            assert.match(html, new RegExp(`border-${renk}-`));
            assert.match(html, new RegExp(`bg-${renk}-`));
            assert.match(html, new RegExp(`text-${renk}-`));
            assert.match(html, /<svg/);
            assert.match(html, /Açıklama/);
        }
        const bekliyor = renderToStaticMarkup(React.createElement(Rozet, { durum: "bekliyor", isDark, baslik: "Hazırlama bekleniyor" }));
        assert.match(bekliyor, isDark ? /text-\[#A7B0C2\]/ : /text-slate-600/);
    });
}

test("istek beklerken eski hata ekranı yerine başlatılıyor görünümü çizilir", () => {
    const html = ekran({ baslatiliyor: true, ders: { hazirlamaDurumu: "hata", hazirlamaAsamasi: "harita" } });
    assert.match(html, /Hazırlama başlatılıyor/);
    assert.equal((html.match(/data-durum="bekliyor"/g) || []).length, 4);
    assert.doesNotMatch(html, /data-durum="tamamlandi"|data-durum="hata"|Yeniden Dene/);
});

test("hazırlama görünümü merkezlenmiş, kendi içinde kaydırılan ve kapatma eylemi olmayan bir modaldır", () => {
    const html = ekran({});
    assert.match(html, /fixed inset-0 z-\[100\]/);
    assert.match(html, /items-center justify-center/);
    assert.match(html, /bg-black\/60 p-4 backdrop-blur-sm/);
    assert.match(html, /role="dialog" aria-modal="true"/);
    assert.match(html, /aria-labelledby="ders-hazirlama-baslik"/);
    assert.match(html, /max-h-\[calc\(100dvh-2rem\)\]/);
    assert.match(html, /max-w-xl overflow-y-auto overscroll-contain/);
    assert.doesNotMatch(html, /aria-label="Kapat"|min-h-\[calc\(100dvh/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { sifreSifirlamaEpostasi } from "../services/epostaSablonlari.js";
import { epostaServisiOlustur } from "../services/epostaService.js";
import { sifreSifirlamaServisiOlustur } from "../services/sifreSifirlamaService.js";
import { tokenHashle } from "../utils/authGuvenligi.js";

const token = "a".repeat(64), link = `https://studyai.example.test/reset-password/${token}`;

test("Türkçe marka, süre, güvenlik açıklaması ve aynı hedefe giden buton/alternatif bağlantı vardır", () => {
    const { html, text } = sifreSifirlamaEpostasi(link);
    for (const metin of ["StudyAI", "Akıllı Öğrenme Platformu", "Şifrenizi Sıfırlayın", "Şifremi Sıfırla", "15 dakika", "dikkate almayabilirsiniz", "Buton çalışmazsa"])
        assert.ok(html.includes(metin) && text.includes(metin), metin);
    assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]), [link, link]);
    assert.equal(text.split(link).length - 1, 2);
    assert.match(html, /<html lang="tr" dir="ltr">/); assert.match(html, /name="viewport"/);
    assert.match(html, /max-width:640px/); assert.match(html, /role="presentation"/);
    for (const renk of ["#101C3D", "#FFFFFF", "#6348FA"]) assert.ok(html.includes(renk));
    assert.doesNotMatch(html, /<img|<script|<iframe|<link\s|@import|url\(/i);
    assert.doesNotMatch(text, /<\/?(?:table|p|a|html)\b/);
});

test("dinamik bağlantı HTML özniteliğinden çıkamaz; plain text bağlantıyı değiştirmez", () => {
    const adres = `${link}?x="'><test>&y=1`;
    const { html, text } = sifreSifirlamaEpostasi(adres);
    assert.doesNotMatch(html, /<test>/); assert.ok(html.includes("&quot;&#39;&gt;&lt;test&gt;&amp;y=1"));
    assert.ok(text.includes(adres));
    for (const url of ["javascript:alert(1)", "data:text/html,test", `${link}\r\nX-Header: test`]) assert.throws(() => sifreSifirlamaEpostasi(url));
});

test("gönderim akışı aynı token/15 dakika/göndereni kullanır; SMTP yalnız mock transport'tur", async () => {
    const simdi = Date.parse("2026-11-13T10:00:00Z"); let guncelleme, mesaj, gonderilen;
    const eposta = epostaServisiOlustur({ env: { EMAIL_USER: "mock@example.test", EMAIL_PASS: "yalniz-test", CLIENT_URL: "https://studyai.example.test" },
        transportOlustur: () => ({ sendMail: async m => { gonderilen = m; } }) });
    const servis = sifreSifirlamaServisiOlustur({ simdi: () => simdi, tokenUret: () => token,
        Model: { findOne: () => ({ select: async () => ({ _id: "u", email: "ogrenci@example.test" }) }),
            updateOne: async (_f, u) => { guncelleme = u; return { matchedCount: 1 }; } },
        eposta: { ayarlariGetir: eposta.ayarlariGetir, sirayaAl: m => { mesaj = m; return true; } } });
    await servis.iste("ogrenci@example.test");
    assert.equal(guncelleme.$set.sifirlamaTokenHash, tokenHashle(token));
    assert.equal(guncelleme.$set.sifirlamaSonTarih.getTime(), simdi + 900_000);
    assert.equal(mesaj.subject, "StudyAI — Şifre Sıfırlama");
    assert.ok(mesaj.html.includes(link) && mesaj.text.includes(link));
    await eposta.gonder(mesaj);
    assert.equal(gonderilen.from, '"StudyAI" <mock@example.test>');
    assert.equal(gonderilen.to, "ogrenci@example.test");
    assert.equal(gonderilen.html, mesaj.html); assert.equal(gonderilen.text, mesaj.text);
});

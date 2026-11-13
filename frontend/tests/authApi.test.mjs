import test from "node:test";
import assert from "node:assert/strict";
import { authApiOlustur } from "../src/services/authApi.mjs";
import { kullaniciHataMesaji } from "../src/utils/kullaniciHatasi.mjs";

test("auth API endpoint, doğrulama token'ı, cookie ve iptal sinyallerini doğru taşır", async () => {
    const cagrilar = [], client = {};
    for (const m of ["get", "put", "post"]) client[m] = async (...args) => { cagrilar.push([m, ...args]); return { data: {} }; };
    const a = authApiOlustur(client), signal = new AbortController().signal;
    await a.profil(signal); await a.profilKaydet({ kullaniciAdi: "Ahmet" }, signal);
    await a.sifreDegistir({ mevcutSifre: "Eski123!", yeniSifre: "Yeni123!", yeniSifreTekrar: "Yeni123!" }, signal);
    await a.sifremiUnuttum("a@b.test", signal); await a.sifreSifirla("a/b", { yeniSifre: "Yeni123!" }, signal);
    await a.emailDogrula("token", signal); await a.cikis();
    assert.deepEqual(cagrilar.map(c => c[1]), ["/auth/profil", "/auth/profil", "/auth/sifre-degistir", "/auth/forgot-password", "/auth/reset-password/a%2Fb", "/auth/email-change/verify", "/auth/cikis"]);
    assert.ok(cagrilar.every(c => c.at(-1).withCredentials)); assert.ok(cagrilar.slice(0, -1).every(c => c.at(-1).signal === signal));
    assert.deepEqual(cagrilar[5][2], { token: "token" });
});
test("yanlış mevcut şifre, süresi dolmuş link ve SMTP ayarı için doğru Türkçe durum verilir", () => {
    const m = (kod, status) => kullaniciHataMesaji({ response: { status, data: { kod, hata: "gizli" } } });
    assert.match(m("MEVCUT_SIFRE_HATALI", 401), /Mevcut şifreniz hatalı/);
    assert.match(m("EMAIL_BAGLANTISI_GECERSIZ", 400), /süresi dolmuş/);
    assert.match(m("SIFIRLAMA_BAGLANTISI_GECERSIZ", 400), /süresi dolmuş/);
    assert.match(m("EPOSTA_YAPILANDIRMA", 503), /E-posta servisi/);
});

test("hesap doğrulaması ve yeniden gönderim oturum gerektirmeyen ayrı endpoint'leri kullanır", async () => {
    const cagrilar = []; const client = { post: async (...a) => { cagrilar.push(a); return { data: {} }; } };
    const a = authApiOlustur(client), signal = new AbortController().signal;
    await a.kayitDogrula("token", signal); await a.kayitYenidenGonder("a@b.test", signal);
    assert.equal(cagrilar[0][0], "/auth/verify-email"); assert.deepEqual(cagrilar[0][1], { token: "token" });
    assert.equal(cagrilar[1][0], "/auth/resend-verification"); assert.deepEqual(cagrilar[1][1], { email: "a@b.test" });
    assert.ok(cagrilar.every(c => c[2].signal === signal));
});

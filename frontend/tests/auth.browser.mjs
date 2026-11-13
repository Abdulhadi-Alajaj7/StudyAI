// Gerçek React arayüzü; bütün uygulama API'leri mock, gerçek backend/SMTP erişimi yok.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep, basename } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";
import { sifreSifirlamaEpostasi } from "../../backend/services/epostaSablonlari.js";

const root = resolve(process.cwd()), alan = await mkdtemp(join(root, ".auth-browser-"));
let browser, vite, ws, kapali = false, oturum = true, sifreSayisi = 0, resetSayisi = 0, forgotSayisi = 0, emailSayisi = 0;
const kullanici = { id: "111111111111111111111111", kullaniciAdi: "Ahmet Yılmaz", email: "ahmet@example.test" };
const hatalar = [], gecik = ms => new Promise(r => setTimeout(r, ms));
try {
    let chrome;
    for (const p of [process.env.STUDYAI_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium"].filter(Boolean)) {
        try { await access(p); chrome = p; break; } catch { /* Kurulu sonraki tarayıcı. */ }
    }
    assert.ok(chrome, "Kurulu Chromium bulunamadı.");
    await writeFile(join(alan, "fixture.html"), `<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import App from '/src/App.jsx';import '/src/index.css';
const q=new URLSearchParams(location.search);localStorage.setItem('studyai-theme',q.get('theme')||'dark');history.replaceState(null,'',q.get('path')||'/panel/profil');createRoot(document.getElementById('root')).render(React.createElement(App));
</script></html>`);
    await writeFile(join(alan, "email.html"), sifreSifirlamaEpostasi(`https://studyai.example.test/reset-password/${"a".repeat(64)}`).html);
    vite = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false, watch: null }, logLevel: "error" }); await vite.listen();
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = spawn(chrome, ["--headless=new", "--disable-gpu", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--no-first-run", "--no-default-browser-check", "--remote-debugging-port=0", `--user-data-dir=${join(alan, "profil")}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    const url = await new Promise((ok, fail) => { const timer = setTimeout(() => fail(new Error("Chromium başlatılamadı")), 20000);
        browser.once("error", fail); browser.stderr.on("data", d => { const m = String(d).match(/DevTools listening on (ws:\/\/[^\s]+)/); if (m) { clearTimeout(timer); ok(m[1]); } }); });
    ws = new WebSocket(url); await new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; });
    let sayac = 0; const bekleyen = new Map();
    const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
        const id = ++sayac, timer = setTimeout(() => { bekleyen.delete(id); fail(new Error(`DevTools zaman aşımı: ${method}`)); }, 15000);
        bekleyen.set(id, { ok: x => { clearTimeout(timer); ok(x); }, fail: x => { clearTimeout(timer); fail(x); } });
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    ws.onmessage = async e => {
        const m = JSON.parse(String(e.data));
        if (m.id) { const p = bekleyen.get(m.id); if (p) { bekleyen.delete(m.id); m.error ? p.fail(new Error(JSON.stringify(m.error))) : p.ok(m.result); } return; }
        if (m.method === "Runtime.exceptionThrown") hatalar.push(m.params.exceptionDetails.text);
        if (m.method !== "Fetch.requestPaused" || kapali) return;
        const { request, requestId } = m.params;
        try {
            const u = new URL(request.url);
            if (u.origin === origin) return await send("Fetch.continueRequest", { requestId }, m.sessionId);
            if (!u.pathname.startsWith("/auth/")) return await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, m.sessionId);
            let data = {}, status = 200;
            const body = request.postData ? JSON.parse(request.postData) : {};
            if (request.method === "OPTIONS") data = {};
            else if (u.pathname === "/auth/profil" && request.method === "GET") {
                if (!oturum) { status = 401; data = { hata: "Oturum gerekli" }; } else data = { kullanici };
            } else if (u.pathname === "/auth/profil") {
                kullanici.kullaniciAdi = body.kullaniciAdi;
                if (body.email !== kullanici.email) kullanici.bekleyenEmail = body.email;
                data = { kullanici, mesaj: kullanici.bekleyenEmail ? "Doğrulama bağlantısı alındı. Mevcut adresiniz korunacak." : "Kişisel bilgileriniz güncellendi." };
            } else if (u.pathname === "/auth/sifre-degistir") {
                sifreSayisi++; if (body.mevcutSifre === "Yanlis123!") { status = 401; data = { kod: "MEVCUT_SIFRE_HATALI" }; }
                else { assert.equal(body.yeniSifre, body.yeniSifreTekrar); data = { mesaj: "Şifre güncellendi. Diğer oturumlar kapatıldı." }; }
            } else if (u.pathname === "/auth/forgot-password") { forgotSayisi++; await gecik(200); data = { mesaj: "E-posta adresi kayıtlıysa şifre sıfırlama bağlantısı gönderilecektir." }; }
            else if (u.pathname.startsWith("/auth/reset-password/")) {
                resetSayisi++; if (u.pathname.endsWith("b".repeat(64))) { status = 400; data = { kod: "SIFIRLAMA_BAGLANTISI_GECERSIZ" }; }
                else { assert.equal(body.yeniSifre, body.yeniSifreTekrar); data = { basarili: true }; }
            } else if (u.pathname === "/auth/email-change/verify") {
                emailSayisi++; if (body.token === "b".repeat(64)) { status = 400; data = { kod: "EMAIL_BAGLANTISI_GECERSIZ" }; }
                else { kullanici.email = kullanici.bekleyenEmail || "yeni@example.test"; delete kullanici.bekleyenEmail; data = { kullanici }; }
            } else if (u.pathname === "/auth/giris") { oturum = true; data = { kullanici }; }
            else if (u.pathname === "/auth/cikis") { oturum = false; data = { basarili: true }; }
            else throw new Error(`Beklenmeyen auth rotası: ${u.pathname}`);
            await send("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [
                { name: "content-type", value: "application/json" }, { name: "access-control-allow-origin", value: origin },
                { name: "access-control-allow-credentials", value: "true" }, { name: "access-control-allow-methods", value: "GET,POST,PUT,OPTIONS" }, { name: "access-control-allow-headers", value: "content-type" }], body: Buffer.from(JSON.stringify(data)).toString("base64") }, m.sessionId);
        } catch (err) { if (!kapali && !/Invalid InterceptionId/.test(err.message)) hatalar.push(err.message); }
    };
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const cdp = (method, params) => send(method, params, sessionId);
    await cdp("Network.enable"); await cdp("Network.setBlockedURLs", { urls: ["https://*"] });
    await cdp("Fetch.enable", { patterns: [{ urlPattern: "*" }] }); await cdp("Runtime.enable");
    const evaluate = async expression => { const r = await cdp("Runtime.evaluate", { expression, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value; };
    const bekle = async ifade => { for (let i = 0; i < 120; i++) { if (await evaluate(`Boolean(${ifade})`)) return; await gecik(100); } throw new Error(`Arayüz bekleme sınırı: ${ifade}`); };
    const ac = (path, theme = "dark") => cdp("Page.navigate", { url: `${origin}/${basename(alan)}/fixture.html?path=${encodeURIComponent(path)}&theme=${theme}` });
    const doldur = (id, value) => evaluate(`(()=>{const e=document.getElementById(${JSON.stringify(id)});Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);
    const tikla = text => evaluate(`(()=>{const b=[...document.querySelectorAll('button,a')].find(b=>b.textContent.trim()===${JSON.stringify(text)});if(!b||b.disabled)throw Error('Buton yok: '+${JSON.stringify(text)});b.click();return true})()`);
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1365, height: 1400, deviceScaleFactor: 1, mobile: false });
    await ac("/panel/profil"); await bekle("document.getElementById('kullaniciAdi')?.value==='Ahmet Yılmaz'");
    await doldur("kullaniciAdi", "İptal Edilen"); await tikla("İptal"); assert.equal(await evaluate("document.getElementById('kullaniciAdi').value"), "Ahmet Yılmaz");
    await doldur("kullaniciAdi", "İpek Demir"); await tikla("Değişiklikleri Kaydet"); await bekle("document.body.innerText.includes('Kişisel bilgileriniz güncellendi')");
    assert.ok(await evaluate("[...document.querySelectorAll('p,span')].filter(e=>e.textContent==='İpek Demir').length>=2"), "Navbar güncellenmeli");
    const masaustu = join(tmpdir(), "studyai-profil-dark.png"); await writeFile(masaustu, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await doldur("mevcutSifre", "Yanlis123!"); await doldur("yeniSifre", "Yeni123!"); await doldur("yeniSifreTekrar", "Farkli123!"); await tikla("Şifreyi Güncelle");
    await bekle("document.body.innerText.includes('Yeni şifreler eşleşmiyor')"); assert.equal(sifreSayisi, 0);
    await doldur("yeniSifreTekrar", "Yeni123!"); await tikla("Şifreyi Güncelle"); await bekle("document.body.innerText.includes('Mevcut şifreniz hatalı')");
    await doldur("mevcutSifre", "Eski123!"); await tikla("Şifreyi Güncelle"); await bekle("document.body.innerText.includes('Diğer oturumlar kapatıldı')");
    assert.equal(await evaluate("document.getElementById('yeniSifre').value"), "");
    await doldur("email", "yeni@example.test"); await tikla("Değişiklikleri Kaydet"); await bekle("document.body.innerText.includes('doğrulama bekleniyor')"); assert.equal(kullanici.email, "ahmet@example.test");
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await ac("/panel/profil", "light"); await bekle("document.getElementById('email')?.value==='yeni@example.test'");
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
    const mobil = join(tmpdir(), "studyai-profil-mobil.png"); await writeFile(mobil, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    oturum = false; await ac(`/eposta-dogrula/${"a".repeat(64)}`); await bekle("document.body.innerText.includes('Giriş Yap ve Devam Et')"); assert.equal(emailSayisi, 0);
    await tikla("Giriş Yap ve Devam Et"); await bekle("document.getElementById('sifre')"); await doldur("email", "ahmet@example.test"); await doldur("sifre", "Eski123!"); await tikla("Giriş Yap");
    await bekle("document.body.innerText.includes('Onayladığınızda')"); assert.equal(emailSayisi, 0, "GET token tüketmez"); await tikla("E-posta Adresini Doğrula"); await bekle("document.body.innerText.includes('doğrulandı ve güncellendi')"); assert.equal(emailSayisi, 1);
    await ac("/panel/profil"); await bekle("document.getElementById('email')?.value==='yeni@example.test'"); await tikla("Çıkış Yap"); await bekle("document.getElementById('sifre')"); assert.equal(oturum, false);
    await ac("/sifremi-unuttum"); await bekle("document.getElementById('email')");
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
    assert.equal(await evaluate("getComputedStyle(document.querySelector('main>section')).display"), "none");
    const forgotMobil = join(tmpdir(), "studyai-forgot-mobile.png");
    await writeFile(forgotMobil, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1365, height: 1100, deviceScaleFactor: 1, mobile: false });
    await bekle("getComputedStyle(document.querySelector('main>section')).display==='flex'");
    const boyutlar = await evaluate("[...document.querySelectorAll('main>section')].map(e=>e.getBoundingClientRect().width)");
    assert.ok(Math.abs(boyutlar[0] - boyutlar[1]) <= 2, "Masaüstünde eşit iki sütun olmalı");
    assert.ok(await evaluate("document.body.innerText.includes('Daha akıllı çalış.')"));
    const forgotDesktop = join(tmpdir(), "studyai-forgot-desktop.png");
    await writeFile(forgotDesktop, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await doldur("email", "yok@example.test"); await tikla("Sıfırlama Bağlantısı Gönder"); await bekle("document.body.innerText.includes('kayıtlıysa')"); assert.equal(forgotSayisi, 1);
    await ac(`/reset-password/${"a".repeat(64)}`); await bekle("document.getElementById('yeniSifre')");
    await doldur("yeniSifre", "Yeni123!"); await doldur("yeniSifreTekrar", "Farkli123!"); await tikla("Şifreyi Sıfırla");
    await bekle("document.body.innerText.includes('eşleşmiyor')"); assert.equal(resetSayisi, 0);
    await evaluate("document.querySelector('[aria-label=\"Yeni Şifre: şifreyi göster\"]').click()");
    assert.equal(await evaluate("document.getElementById('yeniSifre').type"), "text");
    await evaluate("document.querySelector('[aria-label=\"Yeni Şifre: şifreyi gizle\"]').click()");
    const resetDesktop = join(tmpdir(), "studyai-reset-desktop.png");
    await writeFile(resetDesktop, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await doldur("yeniSifreTekrar", "Yeni123!"); await tikla("Şifreyi Sıfırla"); await bekle("document.body.innerText.includes('Şifreniz sıfırlandı')");
    await ac(`/reset-password/${"b".repeat(64)}`); await bekle("document.getElementById('yeniSifre')"); await doldur("yeniSifre", "Yeni123!"); await doldur("yeniSifreTekrar", "Yeni123!"); await tikla("Şifreyi Sıfırla"); await bekle("document.body.innerText.includes('Yeni bağlantı iste')");
    assert.equal(resetSayisi, 2);
    await cdp("Emulation.setDeviceMetricsOverride", { width: 360, height: 844, deviceScaleFactor: 1, mobile: true });
    await ac(`/reset-password/${"a".repeat(64)}`); await bekle("document.getElementById('yeniSifre')");
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"));
    await cdp("Page.navigate", { url: `${origin}/${basename(alan)}/email.html` }); await bekle("document.querySelector('a')?.textContent==='Şifremi Sıfırla'");
    assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"), "Mobil e-posta taşmamalı");
    const emailMobil = join(tmpdir(), "studyai-reset-email-mobile.png");
    await writeFile(emailMobil, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1060, height: 1000, deviceScaleFactor: 1, mobile: false });
    const emailDesktop = join(tmpdir(), "studyai-reset-email-desktop.png");
    await writeFile(emailDesktop, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    assert.deepEqual(hatalar, []);
    console.log(JSON.stringify({ sonuc: "başarılı", sifreSayisi, resetSayisi, forgotSayisi, emailSayisi, masaustu, mobil, forgotMobil, forgotDesktop, resetDesktop, emailMobil, emailDesktop }));
} finally {
    kapali = true;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    if (browser && browser.exitCode === null) { const bitti = new Promise(r => browser.once("exit", r)); browser.kill(); await Promise.race([bitti, gecik(3000)]); }
    ws?.close(); vite?.httpServer?.closeAllConnections(); await vite?.close();
    assert.ok(resolve(alan).startsWith(root + sep)); await rm(alan, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

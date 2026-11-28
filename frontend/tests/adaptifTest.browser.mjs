// Gerçek React arayüzü, taklit API ile çalıştırılır.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep, basename } from "node:path";
import { createServer } from "vite";

const root = resolve(process.cwd()), alan = await mkdtemp(join(root, ".adaptif-browser-"));
let browser, vite, ws, kapali = false, senaryo = "tanilayici", adaptifIstekleri = 0, baslatildi = false;
const dersId = "111111111111111111111111", testId = "333333333333333333333333", sonucId = "444444444444444444444444";
const dersYolu = `/dersler/${dersId}`, testlerYolu = dersYolu + "/testler";
const kullanici = { id: dersId, kullaniciAdi: "Ahmet Yılmaz", email: "ahmet@example.test" };
const harita = { durum: "hazir", anaKonular: [{ konuId: "ana", baslik: "İstatistik", altKonular: [{ konuId: "eda", baslik: "EDA" }] }] };
const soru = { _id: "1", metin: "Adaptif testin örnek sorusu", konuId: "eda",
    secenekler: ["A", "B", "C", "D"].map(anahtar => ({ anahtar, metin: `Seçenek ${anahtar}` })) };
const ornekTest = { _id: testId, dersId, kaynak: "adaptif", durum: "hazirlandi", kapsamTuru: "konu", konuId: "eda",
    konuBasligi: "EDA", soruSayisi: 1, zorluk: "orta", sorular: [soru] };
const tanilayici = { konuId: "eda", konuBasligi: "EDA", zorluk: "orta", soruSayisi: 5, tanilayici: true,
    hakimiyet: { durum: "yeterli_veri_yok", yuzde: null, soruSayisi: 0 } };
const oneri = { konuId: "korelasyon", konuBasligi: "Korelasyon", zorluk: "kolay", soruSayisi: 10, tanilayici: false,
    hakimiyet: { durum: "zayif", yuzde: 30, soruSayisi: 10 } };
const hatalar = [], gecik = ms => new Promise(r => setTimeout(r, ms));
try {
    let chrome;
    for (const p of [process.env.STUDYAI_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium"].filter(Boolean)) {
        try { await access(p); chrome = p; break; } catch { /* Kurulu sonraki tarayıcı. */ }
    }
    assert.ok(chrome, "Kurulu Chromium bulunamadı.");
    await writeFile(join(alan, "fixture.html"), `<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import App from '/src/App.jsx';import '/src/index.css';
const q=new URLSearchParams(location.search);localStorage.setItem('studyai-theme',q.get('theme')||'dark');history.replaceState(null,'',q.get('path')||'/dersler/111111111111111111111111/konular');createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(App)));
</script></html>`);
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
            let data = {}, status = 200;
            if (request.method !== "OPTIONS") {
                const { pathname } = u;
                if (pathname === "/auth/profil") data = { kullanici };
                else if (pathname === dersYolu) data = { ders: { _id: dersId, dersAdi: "İstatistik", materyallerOnaylandi: true } };
                else if (pathname === dersYolu + "/konu-haritasi") data = { harita };
                else if (pathname === dersYolu + "/konu-hakimiyeti") data = { altKonular: [] };
                else if (pathname === dersYolu + "/calisma-kartlari") data = { kartlar: [] };
                else if (pathname === `/materyaller/ders/${dersId}`) data = { materyaller: [] };
                else if (pathname === dersYolu + "/adaptif-test/oneri") {
                    assert.equal(request.method, "GET");
                    if (senaryo === "oneri-hata") { status = 503; data = { hata: "Öneri alınamadı." }; }
                    else if (senaryo === "bos") data = { oneri: null };
                    else data = { oneri: senaryo === "tanilayici" ? tanilayici : oneri };
                } else if (pathname === dersYolu + "/adaptif-test/baslat") {
                    assert.equal(request.method, "POST");
                    assert.deepEqual(JSON.parse(request.postData), {});
                    adaptifIstekleri++;
                    if (senaryo === "kaynak-hata") { status = 422; data = { hata: "Yeterli işlenmiş içerik bulunamadı." }; }
                    else { await gecik(120); status = 201; data = { testId }; }
                } else if (pathname === testlerYolu + "/devam-eden") data = { testler: [ornekTest] };
                else if (pathname === testlerYolu + "/tamamlanan") data = { testler: [
                    { ...ornekTest, _id: sonucId, kaynak: "tekrar", durum: "tamamlandi" },
                    { ...ornekTest, _id: "555555555555555555555555", kaynak: undefined, durum: "tamamlandi" },
                ] };
                else if (pathname === `${testlerYolu}/${testId}`) data = { test: ornekTest };
                else if (pathname === `${testlerYolu}/${testId}/baslat`) {
                    assert.equal(request.method, "POST");
                    baslatildi = true;
                    data = { test: { ...ornekTest, durum: "devam_ediyor" } };
                } else if (pathname === `${testlerYolu}/${sonucId}/sonuc`) data = { test: {
                    ...ornekTest, _id: sonucId, durum: "tamamlandi", kaynak: "tekrar",
                    sonuc: { dogruSayisi: 1, yanlisSayisi: 0, bosSayisi: 0, basariOrani: 100 },
                    sorular: [{ ...soru, dogruCevap: "A", ogrenciCevabi: "A", aciklama: "Sonuç inceleme açıklaması." }]
                } };
                else throw new Error(`Beklenmeyen API isteği: ${pathname}`);
            }
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
    const kart = "document.querySelector('#adaptif-test')";
    const kartMetni = metin => `${kart}?.innerText.includes(${JSON.stringify(metin)})`;
    const baslat = () => evaluate(`${kart}.querySelector('button').click()`);
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
    await ac(dersYolu + "/konular");
    await bekle("document.querySelector('.konu-sayfa-baslik a')");
    const baglanti = "document.querySelector('.konu-sayfa-baslik a')";
    assert.equal(await evaluate(`${baglanti}.getAttribute('href')`), testlerYolu + "#adaptif-test");
    await evaluate(`${baglanti}.click()`);
    await bekle(kartMetni("5 soru"));
    assert.equal(await evaluate("location.hash"), "#adaptif-test");
    assert.equal(adaptifIstekleri, 0);
    assert.ok(await evaluate(`${kart}.previousElementSibling.innerText.includes('Yeni Test Oluştur') && ${kart}.nextElementSibling.innerText.includes('Devam Eden Testler')`));
    assert.ok(await evaluate(`${kartMetni("Yeterli Veri Yok")} && ${kartMetni("tanılayıcı test")} && !${kartMetni("%")}`));
    await bekle("document.body.innerText.includes('Tekrar Testi') && document.body.innerText.includes('Normal Test')");

    senaryo = "oneri-hata"; await ac(testlerYolu);
    await bekle(`${kart}?.querySelector('[role=alert]')`);
    await bekle("document.body.innerText.includes('Tekrar Testi')");
    assert.ok(await evaluate("document.body.innerText.includes('Yeni Test Oluştur') && document.body.innerText.includes('Devam Eden Testler')"));
    assert.equal(await evaluate(`${kart}.querySelector('button')===null`), true);
    senaryo = "bos"; await ac(testlerYolu);
    await bekle(kartMetni("uygun bir alt konu bulunamadı"));

    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    senaryo = "kaynak-hata"; await ac(testlerYolu, "light");
    await bekle(kartMetni("10 soru"));
    assert.ok(await evaluate(`${kartMetni("Korelasyon")} && ${kartMetni("Zayıf · %30")} && ${kartMetni("Kolay")}`));
    assert.equal(await evaluate(`getComputedStyle(${kart}).backgroundColor`), "rgb(255, 255, 255)");
    await bekle("document.documentElement.scrollWidth<=innerWidth");
    await baslat();
    await bekle(kartMetni("Yeterli işlenmiş içerik bulunamadı."));
    assert.equal(adaptifIstekleri, 1);
    senaryo = "normal";
    await evaluate(`(()=>{const b=${kart}.querySelector('button');b.click();b.click()})()`);
    await bekle("document.body.innerText.includes('Adaptif testin örnek sorusu')");
    assert.equal(await evaluate("location.pathname"), `${testlerYolu}/${testId}/coz`);
    assert.equal(baslatildi, true);
    assert.equal(adaptifIstekleri, 2);
    await ac(testlerYolu, "light");
    await bekle("document.body.innerText.includes('Tekrar Testi') && [...document.querySelectorAll('button')].some(e=>e.innerText.includes('İncele'))");
    await evaluate("[...document.querySelectorAll('button')].find(e=>e.innerText.includes('İncele')).click()");
    await bekle(`location.pathname===${JSON.stringify(`${testlerYolu}/${sonucId}/sonuc`)} && document.body.innerText.includes('Adaptif testin örnek sorusu')`);
    assert.deepEqual(hatalar, []);
    console.log("Adaptif Test Chromium senaryoları başarılı.");
} finally {
    kapali = true;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    if (browser && browser.exitCode === null) { const bitti = new Promise(r => browser.once("exit", r)); browser.kill(); await Promise.race([bitti, gecik(3000)]); }
    ws?.close(); vite?.httpServer?.closeAllConnections(); await vite?.close();
    assert.ok(resolve(alan).startsWith(root + sep)); await rm(alan, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

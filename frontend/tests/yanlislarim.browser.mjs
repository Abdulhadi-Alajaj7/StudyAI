// Gerçek React arayüzü, yerel taklit API ile çalıştırılır.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep, basename } from "node:path";
import { createServer } from "vite";

const root = resolve(process.cwd()), alan = await mkdtemp(join(root, ".yanlislarim-browser-"));
let browser, vite, ws, kapali = false, senaryo = "bos", gonderilen, baslatildi = false;
const dersId = "111111111111111111111111", digerId = "222222222222222222222222", testId = "333333333333333333333333";
const testApiYolu = `/dersler/${dersId}/testler/${testId}`;
const kullanici = { id: dersId, kullaniciAdi: "Ahmet Yılmaz", email: "ahmet@example.test" };
const soru = (soruId, durum, konuId, ders = dersId) => ({
    soruId, durum, dersId: ders, konuId, dersAdi: ders === dersId ? "Algoritmalar" : "İstatistik",
    konuBasligi: konuId === "graf" ? "Graf" : "Arama", metin: `Örnek soru ${soruId}`,
    secenekler: ["A", "B", "C", "D"].map(anahtar => ({ anahtar, metin: `Seçenek ${anahtar}` })),
    ogrenciCevabi: durum === "bos" ? null : "B", dogruCevap: "A",
    aciklama: "Kaynaklı açıklama", kaynakAdlari: ["ders.pdf"], zorluk: "orta", tarih: "2026-11-28T12:00:00Z"
});
const sorular = [soru("1", "yanlis", "graf"), soru("2", "bos", "arama"),
    soru("3", "duzeltildi", "graf"), soru("4", "yanlis", "graf", digerId)];
const cokSoru = Array.from({ length: 21 }, (_, i) => soru(String(i + 1), "yanlis", "graf"));
const hatalar = [], gecik = ms => new Promise(r => setTimeout(r, ms));
try {
    let chrome;
    for (const p of [process.env.STUDYAI_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium"].filter(Boolean)) {
        try { await access(p); chrome = p; break; } catch { /* Kurulu sonraki tarayıcı. */ }
    }
    assert.ok(chrome, "Kurulu Chromium bulunamadı.");
    await writeFile(join(alan, "fixture.html"), `<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import App from '/src/App.jsx';import '/src/index.css';
const q=new URLSearchParams(location.search);localStorage.setItem('studyai-theme',q.get('theme')||'dark');history.replaceState(null,'',q.get('path')||'/panel/yanlislarim');createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(App)));
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
                else if (pathname === "/yanlislarim") data = { sorular: senaryo === "bos" ? [] : senaryo === "sinir" ? cokSoru : sorular };
                else if (pathname === "/yanlislarim/tekrar-testleri") {
                    assert.equal(request.method, "POST");
                    gonderilen = JSON.parse(request.postData);
                    data = { dersId, testId };
                    status = 201;
                } else if (pathname === `/dersler/${dersId}`) data = { ders: { _id: dersId, dersAdi: "Algoritmalar", materyallerOnaylandi: true } };
                else if (pathname === testApiYolu || pathname === testApiYolu + "/baslat") {
                    const baslatma = pathname.endsWith("/baslat");
                    assert.equal(request.method, baslatma ? "POST" : "GET");
                    baslatildi ||= baslatma;
                    data = { test: { _id: testId, dersId, kaynak: "tekrar", durum: baslatildi ? "devam_ediyor" : "hazirlandi",
                        soruSayisi: 2, sorular: sorular.slice(0, 2).map(({ metin, secenekler }, i) => ({ _id: String(i), metin, secenekler })) } };
                } else throw new Error(`Beklenmeyen API isteği: ${pathname}`);
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
    const sayfa = "/panel/yanlislarim";
    const kok = "document.querySelector('[aria-labelledby=yanlislarim-baslik]')";
    const kayitSayisi = n => bekle(`${kok}?.querySelectorAll('article').length===${n}`);
    const filtre = (i, value) => evaluate(`(()=>{const e=${kok}.querySelectorAll('select')[${i}];e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}))})()`);
    const sekme = ad => evaluate(`[...${kok}.querySelectorAll('[aria-label="Soru durumu"] button')].find(e=>e.textContent.trim()===${JSON.stringify(ad)}).click()`);
    const kartSec = i => evaluate(`${kok}.querySelectorAll('article input')[${i}].click()`);
    const tumunuSec = () => evaluate(`${kok}.querySelector('label input[type=checkbox]').click()`);
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });
    await ac(sayfa);
    await bekle(`${kok}?.innerText.includes('Yanlış veya boş bırakılmış sorun yok.')`);
    assert.ok(await evaluate(`${kok}.querySelector('footer button').disabled`));

    senaryo = "normal"; await ac(sayfa); await kayitSayisi(4);
    assert.deepEqual(await evaluate(`[...${kok}.querySelectorAll('.tabular-nums')].map(e=>e.textContent)`), ["1", "1", "2"]);
    await evaluate(`${kok}.querySelector('summary').click()`);
    for (const metin of ["Seçenek A", "Seçenek D", "Doğru cevap A", "Cevabın B", "Kaynaklı açıklama", "ders.pdf"]) {
        assert.ok(await evaluate(`${kok}.querySelector('details[open]').innerText.includes(${JSON.stringify(metin)})`), metin);
    }
    assert.ok(await evaluate(`${kok}.querySelector('label input[type=checkbox]').disabled`));
    await kartSec(0);
    assert.ok(await evaluate(`${kok}.querySelectorAll('article input')[3].disabled`));
    await filtre(1, dersId); await kayitSayisi(3);
    await filtre(0, `${dersId}:graf`); await kayitSayisi(2);
    await sekme("Düzeltilen"); await kayitSayisi(1);
    assert.deepEqual(await evaluate(`[...${kok}.querySelectorAll('.tabular-nums')].map(e=>e.textContent)`), ["1", "0", "0"]);
    await sekme("Yanlış"); await kayitSayisi(1);
    await sekme("Boş"); await kayitSayisi(0);
    await filtre(0, ""); await kayitSayisi(1);
    await sekme("Tümü"); await kayitSayisi(3);

    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await ac(sayfa, "light"); await kayitSayisi(4);
    await bekle(`document.documentElement.scrollWidth<=innerWidth`);
    assert.equal(await evaluate(`getComputedStyle(${kok}.querySelector('article')).backgroundColor`), "rgb(255, 255, 255)");

    senaryo = "sinir"; await ac(sayfa); await kayitSayisi(21);
    await tumunuSec();
    assert.equal(await evaluate(`${kok}.querySelectorAll('article input:checked').length`), 20);
    assert.ok(await evaluate(`${kok}.querySelectorAll('article input')[20].disabled`));

    senaryo = "normal"; await ac(sayfa); await kayitSayisi(4);
    await kartSec(0); await kartSec(1);
    await evaluate(`${kok}.querySelector('footer button').click()`);
    await bekle(`location.pathname===${JSON.stringify(testApiYolu + "/coz")} && !${kok} && [...document.querySelectorAll('h2')].some(e=>e.textContent.trim()==='Örnek soru 1')`);
    assert.deepEqual(gonderilen, { dersId, soruIds: ["1", "2"] });
    assert.equal(baslatildi, true);
    assert.deepEqual(hatalar, []);
    console.log("Yanlışlarım Chromium senaryoları başarılı.");
} finally {
    kapali = true;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    if (browser && browser.exitCode === null) { const bitti = new Promise(r => browser.once("exit", r)); browser.kill(); await Promise.race([bitti, gecik(3000)]); }
    ws?.close(); vite?.httpServer?.closeAllConnections(); await vite?.close();
    assert.ok(resolve(alan).startsWith(root + sep)); await rm(alan, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

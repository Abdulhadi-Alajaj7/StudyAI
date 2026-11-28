// Gerçek React, Recharts ve ders rotaları, taklit API ile doğrulanır.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep, basename } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";

const root = resolve(process.cwd()), alan = await mkdtemp(join(root, ".genel-bakis-browser-"));
let browser, vite, ws, kapali = false, sunucuHatasi = false, tekTest = false, raporIstekleri = 0;
const dersId = "111111111111111111111111", digerId = "222222222222222222222222";
const dersYolu = `/dersler/${dersId}`, digerYol = `/dersler/${digerId}`;
const kullanici = { id: dersId, kullaniciAdi: "Ahmet Yılmaz", email: "ahmet@example.test" };
const testler = [37, 50, 44, 64, 59, 72, 67, 84].map((basari, i) => ({
    _id: String(i+1).padStart(24, "0"), kapsamTuru: "konu", basari, kaynak: i%2 ? "adaptif" : undefined,
    konuBasligi: i === 7 ? "Korelasyon" : `Veri Analizi ${i+1}`,
    tamamlanmaTarihi: `2026-11-${String(i+12)}T12:00:00Z`
}));
const konular = [
    { konuId: "1", baslik: "Korelasyon", durum: "zayif", yuzde: 34 },
    { konuId: "2", baslik: "Keşifsel Veri Analizi", durum: "zayif", yuzde: 45 },
    { konuId: "3", baslik: "Betimsel İstatistik", durum: "gelistirilmeli", yuzde: 66 },
    { konuId: "4", baslik: "Python Ekosistemi", durum: "iyi", yuzde: 92 },
    { konuId: "5", baslik: "Veri Yapıları", durum: "yeterli_veri_yok", yuzde: null }
];
const bos = {
    genelHakimiyet: { yuzde: null, durum: "yeterli_veri_yok", degerlendirilen: 0, toplam: 0 },
    testBasarisi: null, tamamlananTestSayisi: 0, soruAnalizi: { dogru: 0, yanlis: 0, bos: 0, toplam: 0 },
    basariGelisimi: [], sonTestler: [], konuDurumlari: { iyi: 0, gelistirilmeli: 0, zayif: 0, yeterli_veri_yok: 0 },
    oncelikliKonular: [], kartlar: { toplam: 0, gorulen: 0, gorulmeyen: 0, yildizli: 0, gorulmeYuzdesi: null, bekleyenTekrar: 0 },
    testHedefleri: { konular: [], materyaller: [] }, adaptifOneri: null
};
const dolu = { ...bos,
    genelHakimiyet: { yuzde: 59.25, durum: "gelistirilmeli", degerlendirilen: 4, toplam: 5 },
    testBasarisi: 64.25, tamamlananTestSayisi: 13, soruAnalizi: { dogru: 257, yanlis: 125, bos: 18, toplam: 400 },
    basariGelisimi: testler,
    sonTestler: [{ ...testler[7], _id: "999999999999999999999999", konuBasligi: "Zayıf sorular", kaynak: "tekrar" }, ...testler.slice(-4).reverse()],
    konuDurumlari: { iyi: 1, gelistirilmeli: 1, zayif: 2, yeterli_veri_yok: 1 }, oncelikliKonular: konular,
    kartlar: { toplam: 120, gorulen: 80, gorulmeyen: 40, yildizli: 12, gorulmeYuzdesi: 200 / 3, bekleyenTekrar: 8 },
    adaptifOneri: { konuBasligi: "Veri Yapıları", tanilayici: true, hakimiyet: konular[4] }
};
const tek = { ...bos, testBasarisi: 0, tamamlananTestSayisi: 1,
    soruAnalizi: { dogru: 0, yanlis: 5, bos: 0, toplam: 5 },
    basariGelisimi: [{ ...testler[0], basari: 0 }], sonTestler: [{ ...testler[0], basari: 0 }] };
const hatalar = [], gecik = ms => new Promise(r => setTimeout(r, ms));
try {
    let chrome;
    for (const p of [process.env.STUDYAI_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium"].filter(Boolean)) {
        try { await access(p); chrome = p; break; } catch { /* Kurulu sonraki tarayıcı. */ }
    }
    assert.ok(chrome, "Kurulu Chromium bulunamadı.");
    await writeFile(join(alan, "fixture.html"), `<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import App from '/src/App.jsx';import '/src/index.css';
const q=new URLSearchParams(location.search);localStorage.setItem('studyai-theme',q.get('theme')||'dark');history.replaceState(null,'',q.get('path')||'/dersler/111111111111111111111111');createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(App)));
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
                assert.equal(request.method, "GET", "Genel Bakış veri oluşturmamalı");
                const { pathname } = u;
                if (pathname === "/auth/profil") data = { kullanici };
                else if (pathname === dersYolu || pathname === digerYol) {
                    data = { ders: { _id: pathname.split("/").at(-1),
                        dersAdi: pathname === dersYolu ? "Uygulamalı Veri Bilimi" : "Yeni Ders", materyallerOnaylandi: true } };
                } else if (pathname === dersYolu + "/genel-bakis" || pathname === digerYol + "/genel-bakis") {
                    raporIstekleri++;
                    if (sunucuHatasi) { status = 503; data = { hata: "Ders performansı yüklenemedi." }; }
                    else if (pathname.startsWith(digerYol)) { await gecik(450); data = bos; }
                    else if (tekTest) data = tek;
                    else data = dolu;
                } else throw new Error(`Beklenmeyen API isteği: ${pathname}`);
            }
            await send("Fetch.fulfillRequest", { requestId, responseCode: status, responseHeaders: [
                { name: "content-type", value: "application/json" }, { name: "access-control-allow-origin", value: origin },
                { name: "access-control-allow-credentials", value: "true" }, { name: "access-control-allow-methods", value: "GET,PATCH,OPTIONS" }, { name: "access-control-allow-headers", value: "content-type" }], body: Buffer.from(JSON.stringify(data)).toString("base64") }, m.sessionId);
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
    const sayfa = "document.querySelector('[aria-labelledby=ders-performansi]')";
    const metin = yazi => `${sayfa}?.innerText.includes(${JSON.stringify(yazi)})`;
    const metniBekle = yazi => bekle(metin(yazi));
    const ekran = (width, height) => cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: width < 600 });
    const goruntuAl = async (ad) => {
        const { cssContentSize } = await cdp("Page.getLayoutMetrics");
        const cikti = join(tmpdir(), ad);
        const { data } = await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
            clip: { x: 0, y: 0, width: Math.ceil(cssContentSize.width), height: Math.ceil(cssContentSize.height), scale: 1 } });
        await writeFile(cikti, Buffer.from(data, "base64"));
        return cikti;
    };
    const sigiyor = () => bekle("document.documentElement.scrollWidth<=innerWidth");
    await ekran(1440, 1000);
    await ac(dersYolu);
    await metniBekle("%64,25");
    await bekle("document.querySelectorAll('.recharts-area-dot').length===8 && document.querySelectorAll('.recharts-pie-sector').length===3");
    assert.ok(await evaluate("document.body.innerText.includes('Genel Hâkimiyet: %59,25')"));
    assert.ok(await evaluate(metin("tanılayıcı test")));
    assert.equal(await evaluate(`${sayfa}.querySelectorAll('tbody tr').length`), 5);
    for (const tur of ["Normal Test", "Adaptif Test", "Tekrar Testi"]) assert.ok(await evaluate(metin(tur)));
    for (const [etiket, son] of [["Tüm Konular", "/konular"], ["Adaptif Test Başlat", "/testler#adaptif-test"],
        ["Kartları İncele", "/calisma-kartlari"], ["Bugünkü Tekrarlar", "/tekrarlar"], ["Tüm Testler", "/testler"]]) {
        assert.equal(await evaluate(`[...${sayfa}.querySelectorAll('a')].find(e=>e.textContent.trim()===${JSON.stringify(etiket)}).getAttribute('href')`), dersYolu + son);
    }
    assert.equal(await evaluate(`${sayfa}.querySelector('tbody a').getAttribute('href')`), dersYolu + "/testler/999999999999999999999999/sonuc");
    assert.ok(await evaluate("(()=>{const a=document.querySelector('[aria-labelledby=basari-gelisimi]').getBoundingClientRect(),b=document.querySelector('[aria-labelledby=soru-analizi]').getBoundingClientRect();return Math.abs(a.top-b.top)<2&&a.width/b.width>1.85})()"));
    const nokta = await evaluate("(()=>{const e=[...document.querySelectorAll('.recharts-area-dot')].at(-1);e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...nokta });
    await bekle("document.querySelector('.recharts-tooltip-wrapper')?.innerText.includes('Adaptif Test')");
    assert.ok(await evaluate("document.querySelector('.recharts-tooltip-wrapper').innerText.includes('%84')"));
    const dilim = await evaluate("(()=>{const e=document.querySelector('[aria-labelledby=soru-analizi] svg.recharts-surface');e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return {x:r.x+r.width/2+Math.min(r.width,r.height)*.41,y:r.y+r.height/2}})()");
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", ...dilim });
    await bekle("document.querySelector('[aria-labelledby=soru-analizi] .recharts-tooltip-wrapper')?.innerText.includes('257 soru')");
    await cdp("Input.dispatchMouseEvent", { type: "mouseMoved", x: 1, y: 1 });
    await evaluate("scrollTo(0,0)");
    const masaustu = await goruntuAl("studyai-genel-bakis-desktop.png");

    await ekran(820, 950); await sigiyor();
    await bekle("document.querySelector('[aria-labelledby=soru-analizi]').getBoundingClientRect().top > document.querySelector('[aria-labelledby=basari-gelisimi]').getBoundingClientRect().top");
    await ekran(390, 860);
    await ac(dersYolu, "light"); await metniBekle("%64,25"); await sigiyor();
    await bekle("document.querySelectorAll('.recharts-area-dot').length===8");
    assert.equal(await evaluate("getComputedStyle(document.querySelector('[aria-labelledby=basari-gelisimi]')).backgroundColor"), "rgb(255, 255, 255)");
    const mobil = await goruntuAl("studyai-genel-bakis-mobile.png");

    await evaluate(`history.pushState({}, "", ${JSON.stringify(digerYol)}); window.dispatchEvent(new PopStateEvent('popstate'))`);
    await bekle("document.body.innerText.includes('Yeni Ders') && document.querySelector('[aria-label=\"Ders performansı yükleniyor\"]')");
    assert.equal(await evaluate(metin("%64,25")), false);
    await metniBekle("Bu derste henüz tamamlanmış test yok.");
    assert.ok(await evaluate(metin("Yeterli Veri Yok")));
    assert.equal(await evaluate("document.querySelectorAll('.recharts-area-dot').length"), 0);

    sunucuHatasi = true; await ac(dersYolu); await bekle(`${sayfa}?.querySelector('[role=alert]')`);
    const once = raporIstekleri; sunucuHatasi = false; tekTest = true;
    await evaluate(`${sayfa}.querySelector('[role=alert] button').click()`);
    await bekle("document.querySelectorAll('.recharts-area-dot').length===1");
    assert.ok(await evaluate(metin("%0")));
    assert.ok(raporIstekleri > once);
    assert.deepEqual(hatalar, []);
    console.log(JSON.stringify({ sonuc: "Genel Bakış Chromium senaryoları başarılı.", masaustu, mobil }));
} finally {
    kapali = true;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    if (browser && browser.exitCode === null) { const bitti = new Promise(r => browser.once("exit", r)); browser.kill(); await Promise.race([bitti, gecik(3000)]); }
    ws?.close(); vite?.httpServer?.closeAllConnections(); await vite?.close();
    assert.ok(resolve(alan).startsWith(root + sep)); await rm(alan, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

// Mevcut kart çevirme akışı ve yeni tekrar ekranı, taklit API ile çalıştırılır.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep, basename } from "node:path";
import { createServer } from "vite";

const root = resolve(process.cwd()), alan = await mkdtemp(join(root, ".tekrar-browser-"));
let browser, vite, ws, kapali = false, hataSonraki = false;
const dersId = "111111111111111111111111";
const dersYolu = `/dersler/${dersId}`, kartYolu = dersYolu + "/calisma-kartlari", tekrarYolu = dersYolu + "/tekrarlar";
const kullanici = { id: dersId, kullaniciAdi: "Ahmet Yılmaz", email: "ahmet@example.test" };
const kartlar = [1, 2, 3].map(n => ({
    bekliyor: n < 3, tamamlandi: false, kart: {
        _id: String(n), soru: `Soru yüzü ${n}`, cevap: `Cevap yüzü ${n}`, goruldu: false, yildizli: n === 2,
        ardisikKolaySayisi: n === 2 ? 1 : 0, tekrarSureleri: { zor: 1, orta: 2, kolay: n === 2 ? null : 3 }
    }
}));
const yazmalar = [], hatalar = [], gecik = ms => new Promise(r => setTimeout(r, ms));
try {
    let chrome;
    for (const p of [process.env.STUDYAI_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium"].filter(Boolean)) {
        try { await access(p); chrome = p; break; } catch { /* Kurulu sonraki tarayıcı. */ }
    }
    assert.ok(chrome, "Kurulu Chromium bulunamadı.");
    await writeFile(join(alan, "fixture.html"), `<!doctype html><html lang="tr"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><div id="root"></div><script type="module">
import React from 'react';import {createRoot} from 'react-dom/client';import App from '/src/App.jsx';import '/src/index.css';
const q=new URLSearchParams(location.search);localStorage.setItem('studyai-theme',q.get('theme')||'dark');history.replaceState(null,'',q.get('path')||'/dersler/111111111111111111111111/calisma-kartlari');createRoot(document.getElementById('root')).render(React.createElement(React.StrictMode,null,React.createElement(App)));
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
                else if (pathname.endsWith("/genel-bakis")) data = { genelHakimiyet: { yuzde: null } };
                else if (pathname === dersYolu) data = { ders: { _id: dersId, dersAdi: "İstatistik", materyallerOnaylandi: true } };
                else if (pathname === kartYolu) data = { kartlar: kartlar.map(x => x.kart), dersKartTamamlandi: true };
                else if (pathname === kartYolu + "/tekrarlar") {
                    const bekleyenler = kartlar.filter(x => x.bekliyor).map(x => x.kart);
                    const tamamlanan = kartlar.filter(x => x.tamamlandi).length;
                    data = { kartlar: bekleyenler, bekleyen: bekleyenler.length, tamamlanan, toplam: bekleyenler.length + tamamlanan };
                } else if (pathname.startsWith(kartYolu + "/") && request.method === "PATCH") {
                    const [id, islem] = pathname.slice(kartYolu.length + 1).split("/");
                    const x = kartlar.find(x => x.kart._id === id);
                    const body = JSON.parse(request.postData);
                    yazmalar.push({ id, islem, body });
                    if (islem || body.zorluk) {
                        assert.equal(body.surum, x.kart.__v ?? 0);
                        if (hataSonraki) { hataSonraki = false; status = 503; }
                        else {
                            const cikarildi = islem || (body.zorluk === "kolay" && x.kart.ardisikKolaySayisi === 1);
                            x.bekliyor = false;
                            x.tamamlandi = !cikarildi;
                            x.kart.__v = body.surum + 1;
                            x.kart.zorluk = cikarildi ? null : body.zorluk;
                            x.kart.ardisikKolaySayisi = x.kart.zorluk === "kolay" ? 1 : 0;
                            x.kart.tekrarSureleri.kolay = x.kart.ardisikKolaySayisi ? null : 3;
                        }
                    } else Object.assign(x.kart, body);
                    data = { kart: x.kart };
                } else throw new Error(`Beklenmeyen API isteği: ${request.method} ${pathname}`);
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
    const sayfa = "document.querySelector('[aria-labelledby=tekrarlar-baslik]')";
    const metin = yazi => `${sayfa}?.innerText.includes(${JSON.stringify(yazi)})`;
    const ilerleme = yazi => `${sayfa}?.querySelector('[aria-labelledby=tekrar-ilerlemesi]').previousElementSibling.textContent.includes(${JSON.stringify(yazi)})`;
    const tikla = yazi => evaluate(`[...document.querySelectorAll('button')].find(e=>!e.closest('[inert]') && (e.textContent.trim().startsWith(${JSON.stringify(yazi)}) || e.getAttribute('aria-label')===${JSON.stringify(yazi)})).click()`);
    const gorunurYuz = yazi => `[...document.querySelectorAll('button')].some(e=>!e.closest('[inert]')&&e.innerText.includes(${JSON.stringify(yazi)}))`;
    const cevir = () => tikla("Cevabı görmek için kartı çevir");
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
    await ac(kartYolu);
    await bekle("document.body.innerText.includes('2 kart tekrar edilmeyi bekliyor.')");
    await evaluate("[...document.querySelectorAll('a')].find(e=>e.innerText.includes('Bugünkü Tekrarlar')).click()");
    await bekle(ilerleme("0 / 2"));
    assert.equal(await evaluate("location.pathname"), tekrarYolu);
    assert.equal(await evaluate(`${sayfa}.querySelector('a').getAttribute('href')`), kartYolu);
    assert.ok(await evaluate(gorunurYuz("Soru yüzü 1")));
    assert.equal(await evaluate(gorunurYuz("Cevap yüzü 1")), false);
    assert.equal(await evaluate(`!!${sayfa}.querySelector('[aria-label="Tekrar değerlendirmesi"]')`), false);
    assert.equal(await evaluate(`getComputedStyle(${sayfa}.querySelector('[aria-hidden="false"][style*="backface"]')).backgroundColor`), "rgb(17, 29, 49)");

    await cevir(); await bekle(gorunurYuz("Cevap yüzü 1"));
    assert.equal(await evaluate(gorunurYuz("Soru yüzü 1")), false);
    assert.ok(await evaluate(`${sayfa}.querySelector('[aria-hidden="true"][style*="backface"]').parentElement.style.transform === 'rotateY(180deg)'`));
    assert.deepEqual(await evaluate(`[...${sayfa}.querySelectorAll('[aria-label="Tekrar değerlendirmesi"] button')].map(e=>e.lastElementChild.textContent)`), ["1 gün", "2 gün", "3 gün"]);
    await tikla("Sonraki Kart"); await bekle(gorunurYuz("Soru yüzü 2"));
    assert.ok(await evaluate(ilerleme("0 / 2")));
    assert.deepEqual(yazmalar, [{ id: "1", islem: undefined, body: { goruldu: true } }]);
    await tikla("Sonraki Kart"); await bekle(gorunurYuz("Soru yüzü 1"));
    await cevir(); await bekle(gorunurYuz("Cevap yüzü 1"));
    hataSonraki = true;
    await tikla("Kolay"); await bekle(`${sayfa}.querySelector('[role=alert]') && !${sayfa}.querySelector('[aria-label="Tekrar değerlendirmesi"] button').disabled`);
    assert.ok(await evaluate(ilerleme("0 / 2")));
    await evaluate(`(()=>{const b=${sayfa}.querySelector('[aria-label="Tekrar değerlendirmesi"] button:last-child');b.click();b.click()})()`);
    await bekle(ilerleme("1 / 2"));
    assert.equal(yazmalar.filter(x => x.body.zorluk).length, 2); // Bir hata, bir başarılı tekrar.
    await bekle(gorunurYuz("Soru yüzü 2"));
    assert.ok(await evaluate(`[...${sayfa}.querySelectorAll('button')].some(e=>e.innerText.includes('Tekrar Listesinden Çıkar'))`));
    await cevir(); await bekle(metin("Listeden çıkar"));
    await tikla("Kolay");
    await bekle(`${ilerleme("1 / 1")} && ${metin("Bugünkü tekrarlarını tamamladın.")}`);
    assert.ok(await evaluate(metin("Bu kartı art arda iki kez kolay olarak değerlendirdiğin için tekrar listesinden çıkarıldı.")));

    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await ac(tekrarYolu, "light"); await bekle(ilerleme("1 / 1"));
    assert.equal(await evaluate(`getComputedStyle(${sayfa}.querySelector('dl > div')).backgroundColor`), "rgb(255, 255, 255)");
    await bekle("document.documentElement.scrollWidth<=innerWidth");
    await evaluate(`${sayfa}.querySelector('a').click()`);
    await bekle("document.body.innerText.includes('Bugün tekrar edilecek kartın yok.')");
    await tikla("Yıldızlı Kartlar"); await bekle(gorunurYuz("Soru yüzü 2"));
    await cevir(); await bekle(gorunurYuz("Cevap yüzü 2"));
    await tikla("Orta");
    await bekle(gorunurYuz("Soru yüzü 2"));
    assert.ok(yazmalar.some(x => x.id === "2" && x.body.zorluk === "orta" && x.body.surum === 1));
    assert.deepEqual(hatalar, []);
    console.log("Aralıklı Tekrar Chromium senaryoları başarılı.");
} finally {
    kapali = true;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    if (browser && browser.exitCode === null) { const bitti = new Promise(r => browser.once("exit", r)); browser.kill(); await Promise.race([bitti, gecik(3000)]); }
    ws?.close(); vite?.httpServer?.closeAllConnections(); await vite?.close();
    assert.ok(resolve(alan).startsWith(root + sep)); await rm(alan, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

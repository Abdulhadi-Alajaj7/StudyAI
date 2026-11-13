// Gerçek React arayüzü; bütün uygulama API'leri mock, gerçek backend/SMTP erişimi yok.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { access, mkdtemp, writeFile, rm } from "node:fs/promises";
import { resolve, join, sep, basename } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";

const root = resolve(process.cwd()), alan = await mkdtemp(join(root, ".konu-browser-"));
let browser, vite, ws, kapali = false, senaryo = "normal";
const istekler = [];
const dersId = "111111111111111111111111", digerId = "666666666666666666666666";
const ders = { _id: dersId, dersAdi: "Algoritma Çözümleme", dersKodu: "ALG 204", donem: "Güz", renk: "mor", simge: "kitap", materyallerOnaylandi: true };
// Eski özet alanı yanlış olsa bile sayaçlar görünen konu dizisinden hesaplanmalı.
const harita = { durum: "hazir", toplamAltKonuSayisi: 999, anaKonular: [
    { konuId: "buyume", baslik: "Büyüme Analizi", aciklama: "Girdi büyüklüğü ile kaynak tüketimi arasındaki ilişkiler.", altKonular: [
        { konuId: "asimptotik", baslik: "Asimptotik sınırlar", aciklama: "Algoritmaların büyüme hızlarını karşılaştırma." },
        { konuId: "karmasiklik", baslik: "Zaman ve alan karmaşıklığı" }] },
    { konuId: "graf", baslik: "Graf Modelleri", altKonular: [
        { konuId: "dugum", baslik: "Düğümler ve kenarlar" }, { konuId: "dolasim", baslik: "Graf üzerinde dolaşım" }] },
    { konuId: "ozet", baslik: "Konu özeti", altKonular: [] }
] };
const materyaller = ["pdf", "doc", "docx", "ppt", "pptx", "txt"].map((uzanti, i) => ({
    _id: String(i), orijinalDosyaAdi: `Algoritma notları ${i + 1}.${uzanti}`, dosyaAdi: `sunucu-${i}.${uzanti}`,
    dosyaTuru: uzanti, durum: "hazir", ...(i === 1 ? {} : { dosyaBoyutu: 1024 * (i + 1) })
}));
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
                istekler.push({ method: request.method, path: u.pathname });
                assert.equal(request.method, "GET", "Bu sayfa veri değiştirmemeli");
                if (u.pathname === "/auth/profil") data = { kullanici };
                else if (u.pathname === `/dersler/${dersId}` || u.pathname === `/dersler/${digerId}`) {
                    data = { ders: u.pathname.includes(digerId) ? { ...ders, _id: digerId, dersAdi: "Sayısal Yöntemler" } : ders };
                } else if (u.pathname === `/dersler/${dersId}/konu-haritasi` || u.pathname === `/dersler/${digerId}/konu-haritasi`) {
                    if (senaryo === "harita-hatasi") { status = 503; data = { hata: "Konu haritası yüklenemedi." }; }
                    else if (senaryo === "bos") data = { harita: null };
                    else if (u.pathname.includes(digerId)) data = { harita: { durum: "hazir", anaKonular: [{ konuId: "kok", baslik: "Kök bulma", altKonular: [] }] } };
                    else if (senaryo === "uzun") data = { harita: { durum: "hazir", anaKonular: Array.from({ length: 15 }, (_, i) => ({
                        konuId: `ana-${i}`, baslik: `Uzun ana konu ${i} ` + "KonuBaşlığı".repeat(18),
                        altKonular: Array.from({ length: 8 }, (_, j) => ({ konuId: `alt-${i}-${j}`, baslik: "AltBaşlık".repeat(18) }))
                    })) } };
                    else data = { harita, guncelMi: true };
                } else if (u.pathname === `/materyaller/ders/${dersId}` || u.pathname === `/materyaller/ders/${digerId}`) {
                    if (senaryo === "materyal-hatasi") { status = 503; data = { hata: "Materyaller yüklenemedi." }; }
                    else data = { materyaller: senaryo === "bos" || u.pathname.includes(digerId) ? [] : senaryo === "uzun" ? [{ ...materyaller[0], orijinalDosyaAdi: "UzunDosyaAdı".repeat(24) + ".pdf" }] : materyaller };
                } else throw new Error(`Beklenmeyen API isteği: ${u.pathname}`);
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
    const sayfa = `/dersler/${dersId}/konular`;
    const hazir = () => bekle("document.querySelectorAll('.konu-dali').length===3 && document.querySelectorAll('.konu-materyal').length===6");
    const sayilariDogrula = async (ana, alt) => assert.deepEqual(await evaluate("[...document.querySelectorAll('.konu-sayilari dd')].map(e=>Number(e.textContent))"), [ana, alt]);
    // Mevcut sidebar'ın 300 ms margin geçişi bitmeden dar ara kareyi ölçme.
    const yerlesti = () => bekle("document.querySelector('.ders-konu-sayfasi')?.getBoundingClientRect().width>innerWidth-(innerWidth>=1024?341:innerWidth>=640?49:33)");
    const tasmiyor = async () => assert.ok(await evaluate("document.documentElement.scrollWidth<=innerWidth"), "Sayfa yatay taşmamalı");
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1440, height: 1350, deviceScaleFactor: 1, mobile: false });
    await ac(sayfa); await hazir();
    await sayilariDogrula(3, 4);
    const konuStili = await evaluate("(()=>{const e=document.querySelector('.konu-ana');return {zemin:getComputedStyle(e).backgroundColor,kenar:getComputedStyle(e).borderColor,baslik:getComputedStyle(document.querySelector('.konu-ana-baslik')).fontSize}})()");
    assert.equal(await evaluate("document.querySelector('.konu-ders-koku h3').textContent"), ders.dersAdi);
    assert.deepEqual(await evaluate("[...document.querySelectorAll('.konu-dosya-adi')].map(e=>e.textContent)"), materyaller.map(m => m.orijinalDosyaAdi));
    assert.equal(await evaluate("document.querySelectorAll('.konu-materyal-paneli button,.konu-materyal-paneli a,.konu-materyal-paneli input').length"), 0, "Materyal paneli tamamen salt okunur");
    assert.equal(await evaluate("document.querySelectorAll('.ders-konu-sayfasi input,.ders-konu-sayfasi select').length"), 0);
    assert.equal(await evaluate("document.querySelectorAll('.konu-dosya-boyutu').length"), 5, "Eksik boyut uydurulmamalı");
    assert.ok(await evaluate("(()=>{const a=document.querySelector('.konu-harita-karti').getBoundingClientRect(),b=document.querySelector('.konu-materyal-paneli').getBoundingClientRect();return b.left>a.right&&Math.abs(a.top-b.top)<2})()"), "Masaüstünde iki panel yan yana");
    await evaluate("document.querySelector('.konu-alt').click()");
    await bekle("document.querySelector('.konu-alt[aria-pressed=true]')");
    assert.equal(await evaluate("document.querySelectorAll('[aria-pressed=true]').length"), 1);
    await evaluate("document.querySelector('.konu-ana-sec').click()");
    await bekle("document.querySelector('.konu-ana-sec[aria-pressed=true]')");
    assert.equal(await evaluate("document.querySelectorAll('[aria-pressed=true]').length"), 1);
    await evaluate("document.querySelector('.konu-dal-ac').click()");
    await bekle("document.querySelector('.konu-dal-ac').getAttribute('aria-expanded')==='false'");
    assert.ok(await evaluate("document.querySelector('.konu-altlar').hidden"));
    await sayilariDogrula(3, 4); // Kapalı dallar toplamdan düşmemeli.
    // Native butonun klavye davranışı da çalışmalı.
    await evaluate("document.querySelector('.konu-dal-ac').focus()");
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", windowsVirtualKeyCode: 13 });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13 });
    await bekle("document.querySelector('.konu-dal-ac').getAttribute('aria-expanded')==='true'");
    await tasmiyor();
    await evaluate("document.activeElement.blur()");
    const masaustu = join(tmpdir(), "studyai-konu-desktop.png");
    await writeFile(masaustu, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
    await yerlesti();
    await tasmiyor();
    assert.ok(await evaluate("document.querySelector('.konu-materyal-paneli').getBoundingClientRect().top>document.querySelector('.konu-harita-karti').getBoundingClientRect().bottom"), "Mobilde paneller alt alta");
    const mobil = join(tmpdir(), "studyai-konu-mobile.png");
    const { cssContentSize } = await cdp("Page.getLayoutMetrics");
    await writeFile(mobil, Buffer.from((await cdp("Page.captureScreenshot", { format: "png", captureBeyondViewport: true, clip: { x: 0, y: 0, width: 390, height: Math.ceil(cssContentSize.height), scale: 1 } })).data, "base64"));
    await ac(sayfa, "light"); await hazir(); await tasmiyor();
    assert.equal(await evaluate("document.querySelector('.ders-konu-sayfasi').dataset.tema"), "acik");
    senaryo = "uzun"; await ac(sayfa); await bekle("document.querySelectorAll('.konu-alt').length===120"); await tasmiyor();
    await sayilariDogrula(15, 120);
    assert.ok(await evaluate("[...document.querySelectorAll('.konu-alt,.konu-ana-sec,.konu-materyal')].every(e=>e.scrollWidth<=e.clientWidth+1)"), "Uzun başlıklar ve dosya adları kendi kartında kırılmalı");
    await cdp("Emulation.setDeviceMetricsOverride", { width: 360, height: 844, deviceScaleFactor: 1, mobile: true }); await yerlesti(); await tasmiyor();
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1280, height: 1000, deviceScaleFactor: 1, mobile: false }); await yerlesti(); await tasmiyor();
    senaryo = "bos"; await ac(sayfa); await bekle("document.querySelector('.konu-materyal-bos')");
    await sayilariDogrula(0, 0);
    assert.ok(await evaluate("document.querySelector('.konu-harita-karti').textContent.includes('henüz bir konu haritası bulunmuyor')"));
    senaryo = "harita-hatasi"; await ac(sayfa); await bekle("document.querySelector('.konu-harita-karti [role=alert]')");
    assert.equal(await evaluate("document.querySelector('.konu-sayilari')"), null, "API hatasında sahte sıfırlar gösterilmemeli");
    assert.equal(await evaluate("document.querySelectorAll('.konu-materyal').length"), 6, "Harita hatası materyalleri engellememeli");
    senaryo = "materyal-hatasi"; await ac(sayfa); await bekle("document.querySelector('.konu-materyal-paneli [role=alert]')");
    assert.equal(await evaluate("document.querySelectorAll('.konu-dali').length"), 3);
    assert.equal(await evaluate("document.querySelector('.konu-materyal-bos')"), null, "API hatası boş liste gibi gösterilmemeli");
    senaryo = "normal"; await ac(`/dersler/${digerId}/konular`); await bekle("document.querySelector('.konu-ana-baslik')?.textContent==='Kök bulma'");
    assert.equal(await evaluate("document.querySelector('.konu-ders-koku h3').textContent"), "Sayısal Yöntemler");
    assert.equal(await evaluate("document.querySelectorAll('.konu-alt,.konu-materyal,[aria-pressed=true]').length"), 0, "Önceki dersin verisi veya seçimi kalmamalı");
    await sayilariDogrula(1, 0);
    // Hazır sayfasının yalnızca harita listesi yenilenmeli; diğer bölümler ve gezinme korunmalı.
    await ac(`/panel/dersler/${dersId}/hazir`);
    await bekle("document.querySelectorAll('.konu-dali').length===3");
    assert.deepEqual(await evaluate("(()=>{const e=document.querySelector('.konu-ana');return {zemin:getComputedStyle(e).backgroundColor,kenar:getComputedStyle(e).borderColor,baslik:getComputedStyle(document.querySelector('.konu-ana-baslik')).fontSize}})()"), konuStili, "İki sayfanın kart stili aynı olmalı");
    assert.equal(await evaluate("document.querySelectorAll('.konu-alt').length"), 4);
    assert.ok(await evaluate("document.querySelector('.ders-konu-sayfasi').textContent.includes('3 Ana Konu, 4 Alt Konu')"));
    for (const metin of ["Dersin Hazır!", "Ders Kurulum Özeti", "Artık Neler Yapabilirsin?", "Sonraki Adım"]) {
        assert.ok(await evaluate(`document.body.innerText.toLocaleLowerCase('tr-TR').includes(${JSON.stringify(metin)}.toLocaleLowerCase('tr-TR'))`), metin);
    }
    assert.ok(await evaluate("[...document.querySelectorAll('button')].some(e=>e.textContent.includes('Derse Git')&&!e.disabled)"));
    assert.equal(await evaluate("document.querySelectorAll('.ders-konu-sayfasi button:not(.konu-ana-sec):not(.konu-alt):not(.konu-dal-ac)').length"), 0, "Salt okunur haritada üretim işlemi olmamalı");
    await evaluate("document.querySelector('.konu-dal-ac').click()");
    await bekle("document.querySelector('.konu-altlar').hidden");
    await evaluate("document.querySelector('.konu-dal-ac').click()");
    await bekle("!document.querySelector('.konu-altlar').hidden");
    await tasmiyor();
    await evaluate("window.scrollTo(0,document.querySelector('.ders-konu-sayfasi').getBoundingClientRect().top+scrollY-100)");
    const hazirMasaustu = join(tmpdir(), "studyai-hazir-harita-desktop.png");
    await writeFile(hazirMasaustu, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 900, deviceScaleFactor: 1, mobile: true });
    await yerlesti(); await tasmiyor();
    assert.ok(await evaluate("[...document.querySelectorAll('.konu-ana,.konu-alt')].every(e=>e.scrollWidth<=e.clientWidth+1)"));
    senaryo = "uzun"; await ac(`/panel/dersler/${dersId}/hazir`, "light");
    await bekle("document.querySelectorAll('.konu-alt').length===120"); await tasmiyor();
    assert.ok(await evaluate("[...document.querySelectorAll('.konu-ana,.konu-alt')].every(e=>e.scrollWidth<=e.clientWidth+1)"));
    assert.equal(await evaluate("document.querySelector('.ders-konu-sayfasi').dataset.tema"), "acik");
    assert.ok(istekler.some(i => i.path === `/dersler/${dersId}/konu-haritasi`));
    assert.ok(istekler.some(i => i.path === `/materyaller/ders/${dersId}`));
    assert.ok(istekler.every(i => i.method === "GET"));
    assert.deepEqual(hatalar, []);
    console.log(JSON.stringify({ sonuc: "başarılı", senaryolar: ["gerçek API şeması", "salt okunur materyaller", "konu seçimi", "aç-kapat ve klavye", "masaüstü/mobil/açık tema", "uzun başlık ve 120 alt konu", "boş durum", "bağımsız API hataları", "ders değişimi", "dinamik konu sayaçları", "Hazır sayfasında ortak kartlar ve korunan bölümler", "Hazır sayfasında mobil ve uzun konu listesi"], istekSayisi: istekler.length, masaustu, mobil, hazirMasaustu }));
} finally {
    kapali = true;
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    if (browser && browser.exitCode === null) { const bitti = new Promise(r => browser.once("exit", r)); browser.kill(); await Promise.race([bitti, gecik(3000)]); }
    ws?.close(); vite?.httpServer?.closeAllConnections(); await vite?.close();
    assert.ok(resolve(alan).startsWith(root + sep)); await rm(alan, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

// Kurulu Chromium ile gerçek React etkileşimleri; tüm API çağrıları sentetik yanıtlanır.
// Çalıştırma: node tests/calismaKartlari.browser.mjs (yeni bağımlılık gerekmez).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm, access } from "node:fs/promises";
import { join, resolve, sep, basename } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "vite";

const dersId = "111111111111111111111111";
const kartlar = [
    { _id: "222222222222222222222222", konuId: "yigin", soru: "Boşluğu tamamlayın: Yığın […] ilkesini kullanır.", cevap: "LIFO", goruldu: false, yildizli: false, kaynak: { dosyaAdi: "Veri Yapıları.pdf", parcaIndex: 0 } },
    { _id: "333333333333333333333333", konuId: "kuyruk", soru: "Boşluğu tamamlayın: Kuyruk […] ilkesini kullanır.", cevap: "FIFO", goruldu: false, yildizli: false, kaynak: { dosyaAdi: "Veri Yapıları.pdf", parcaIndex: 1 } },
];
let durum = "yok", getSayisi = 0, uretimSayisi = 0, degerlendirmeler = [], kaynakGuncel = true, kavramsiz = false;
let ozetGetSayisi = 0, otomatikBekleme = false, toplamSinir = false;
const kayitlar = new Map();
const govde = () => {
    const kayitli = kavramsiz ? [] : durum === "hazir" ? kartlar : (durum === "kismi" || otomatikBekleme) ? kartlar.slice(0, 1) : [];
    return {
        durum, olusturulabilir: kaynakGuncel && !toplamSinir, kaynakGuncel, engelMesaji: kaynakGuncel ? "" : "Kaynaklar değişti; bu deste salt okunurdur.", hataKodu: toplamSinir ? "KART_TOPLAM_CAGRI_SINIRI" : durum === "kismi" ? "KART_ISLEM_CAGRI_SINIRI" : "", kartlar: kayitli,
        uretimIsi: otomatikBekleme ? { durum: "bekliyor", sonrakiDeneme: "2026-11-14T09:00:00Z", beklemeNedeni: "GEMINI_YEREL_RPM" } : null,
        ilerleme: { tamamlananKonu: kayitli.length, toplamKonu: durum === "yok" ? 0 : 2 },
        istatistikler: { toplam: kayitli.length, gorulen: kayitli.filter(k => k.goruldu).length,
            gorulmeyen: kayitli.filter(k => !k.goruldu).length, yildizli: kayitli.filter(k => k.yildizli).length },
        konular: [{ konuId: "yigin", anaKonuId: "veri", baslik: "Yığın", anaBaslik: "Veri Yapıları", kartSayisi: kayitli.length ? 1 : 0 },
            { konuId: "kuyruk", anaKonuId: "veri", baslik: "Kuyruk", anaBaslik: "Veri Yapıları", kartSayisi: kayitli.length === 2 ? 1 : 0 }],
    };
};
const kok = resolve(process.cwd());
const alan = await mkdtemp(join(kok, ".kart-browser-"));
let browser, vite, ws, kapaniyor = false;
const gecik = ms => new Promise(r => setTimeout(r, ms));
const sinirli = (islem, ms, mesaj) => Promise.race([islem, new Promise((_, reject) => {
    const timer = setTimeout(() => reject(new Error(mesaj)), ms); timer.unref?.();
})]);
try {
    // Kesilen bir testin yalnızca açıkça belirtilen, bu sürücüye ait alanını temizler.
    const eskiAd = process.argv.find(a => a.startsWith("--cleanup-stale="))?.split("=")[1];
    if (eskiAd) {
        assert.match(eskiAd, /^\.kart-browser-[a-zA-Z0-9]+$/);
        const eski = resolve(kok, eskiAd);
        assert.ok(eski.startsWith(kok + sep));
        const html = await readFile(join(eski, "fixture.html"), "utf8");
        assert.ok(html.includes("/src/pages/DersCalismaKartlari.jsx") && html.includes(dersId));
        let eskiWs;
        try {
            const [port, yol] = (await readFile(join(eski, "profil/DevToolsActivePort"), "utf8")).trim().split(/\r?\n/);
            assert.match(port, /^\d+$/); assert.match(yol, /^\/devtools\/browser\/[a-zA-Z0-9-]+$/);
            eskiWs = new WebSocket(`ws://127.0.0.1:${port}${yol}`);
            await sinirli(new Promise((ok, fail) => { eskiWs.onopen = ok; eskiWs.onerror = fail; }), 3000, "Eski test tarayıcısı yanıt vermiyor");
            const kapandi = new Promise(ok => { eskiWs.onclose = ok; });
            eskiWs.send(JSON.stringify({ id: 1, method: "Browser.close" }));
            await sinirli(kapandi, 3000, "Eski test tarayıcısı kapanmadı");
        } catch { /* Zaten kapanmış tarayıcıya ait test alanı da temizlenebilir. */ }
        finally { eskiWs?.close(); }
        await rm(eski, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
    }
    const adaylar = [process.env.STUDYAI_TEST_BROWSER, "C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", "/usr/bin/chromium", "/usr/bin/google-chrome"].filter(Boolean);
    let tarayici;
    for (const aday of adaylar) { try { await access(aday); tarayici = aday; break; } catch { /* Sonraki kurulu tarayıcı. */ } }
    assert.ok(tarayici, "Kurulu Chromium bulunamadı; STUDYAI_TEST_BROWSER yolunu belirtin.");
    await writeFile(join(alan, "fixture.html"), `<!doctype html><html lang="tr"><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">
import React from 'react'; import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, Outlet } from 'react-router-dom';
import Sayfa from '/src/pages/DersCalismaKartlari.jsx';
import DersOzet from '/src/pages/DersOzet.jsx';
import DersDetayLayout from '/src/components/DersDetayLayout.jsx'; import '/src/index.css';
const isDark = !location.search.includes('light');
document.body.style.background = isDark ? '#0b1424' : '#f7f9fc';
const Kabuk = () => React.createElement('main', {style:{maxWidth:1200,margin:'auto',padding:'24px'}}, React.createElement(Outlet, {context:{isDark}}));
const yol = location.search.includes('ozet') ? 'ozet' : 'calisma-kartlari';
createRoot(document.getElementById('root')).render(React.createElement(MemoryRouter,{initialEntries:['/dersler/${dersId}/'+yol]},React.createElement(Routes,null,React.createElement(Route,{element:React.createElement(Kabuk)},React.createElement(Route,{path:'/dersler/:dersId',element:React.createElement(DersDetayLayout)},React.createElement(Route,{path:'calisma-kartlari',element:React.createElement(Sayfa)}),React.createElement(Route,{path:'ozet',element:React.createElement(DersOzet)}))))));
</script></body></html>`, "utf8");
    vite = await createServer({ server: { host: "127.0.0.1", port: 0, hmr: false, watch: null }, logLevel: "error" });
    await vite.listen();
    console.log("Tarayıcı testi: yerel Vite hazır");
    const origin = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = spawn(tarayici, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-sync", "--disable-extensions", "--remote-debugging-port=0", `--user-data-dir=${join(alan, 'profil')}`, "about:blank"], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });
    const wsUrl = await new Promise((ok, fail) => {
        const timer = setTimeout(() => fail(new Error("Chromium başlatılamadı")), 20000);
        browser.on("error", fail);
        browser.stderr.on("data", chunk => {
            const eslesme = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/);
            if (eslesme) { clearTimeout(timer); ok(eslesme[1]); }
        });
    });
    ws = new WebSocket(wsUrl);
    console.log("Tarayıcı testi: Chromium başladı");
    await sinirli(new Promise((ok, fail) => { ws.onopen = ok; ws.onerror = fail; }), 8000, "DevTools bağlantısı kurulamadı");
    let sayac = 0, navigasyonSurumu = 0, iptalEdilenEskiIstek = 0;
    const bekleyen = new Map(), hatalar = [], iptalEdilenAgIstekleri = new Set(), gecersizIstekler = [];
    const send = (method, params = {}, sessionId) => new Promise((ok, fail) => {
        const id = ++sayac;
        const timer = setTimeout(() => { bekleyen.delete(id); fail(new Error(`DevTools zaman aşımı: ${method}`)); }, 8000);
        bekleyen.set(id, { ok: v => { clearTimeout(timer); ok(v); }, fail: e => { clearTimeout(timer); fail(e); } });
        ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    ws.onmessage = async olay => {
        const m = JSON.parse(String(olay.data));
        if (m.id) { const p = bekleyen.get(m.id); if (p) { bekleyen.delete(m.id); m.error ? p.fail(new Error(JSON.stringify(m.error))) : p.ok(m.result); } return; }
        if (m.method === "Runtime.exceptionThrown") hatalar.push(m.params.exceptionDetails.text);
        if (m.method === "Network.loadingFailed" && (m.params.canceled || m.params.errorText === "net::ERR_ABORTED")) {
            iptalEdilenAgIstekleri.add(m.params.requestId);
        }
        if (m.method !== "Fetch.requestPaused" || kapaniyor) return;
        const { request, requestId, networkId } = m.params;
        const istekNavigasyonu = navigasyonSurumu;
        try {
            const url = new URL(request.url);
            if (url.origin === origin) return await send("Fetch.continueRequest", { requestId }, m.sessionId);
            if (url.origin !== "http://localhost:5000") return await send("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }, m.sessionId);
            let data, responseCode = 200;
            const body = request.postData ? JSON.parse(request.postData) : {};
            if (request.method === "OPTIONS") data = {};
            else if (url.pathname === `/dersler/${dersId}`) data = { ders: { _id: dersId, dersAdi: "Sentetik Ders", materyallerOnaylandi: true } };
            else if (url.pathname.endsWith("/ozetler")) {
                assert.equal(request.method, "GET", "Özet kontrolü üretim yapmamalı");
                ozetGetSayisi++; responseCode = 404;
                data = { kod: "OZET_BULUNAMADI", hata: "Bu seçim için kaydedilmiş başarılı bir özet bulunamadı." };
            } else if (url.pathname.startsWith("/materyaller/ders/")) {
                await gecik(150);
                data = { materyaller: [{ _id: "444444444444444444444444", aktifIslemeId: "555555555555555555555555", durum: "hazir", dosyaAdi: "Sentetik.pdf" }] };
            } else if (url.pathname.endsWith("/konu-haritasi")) {
                await gecik(300);
                data = { harita: { anaKonular: [{ konuId: "veri", baslik: "Veri Yapıları", altKonular: [{ konuId: "yigin", baslik: "Yığın" }] }] } };
            }
            else if (url.pathname.endsWith("/olustur")) { uretimSayisi++; durum = "olusturuluyor"; data = govde(); }
            else if (url.pathname.endsWith("/durum")) {
                const kart = kartlar.find(k => url.pathname.includes(k._id));
                assert.ok(kart, "Kart bulunmalı");
                if (body.goruldu) kart.goruldu = true;
                if (typeof body.yildizli === "boolean") kart.yildizli = body.yildizli;
                kayitlar.set(kart._id, { gorulduTarihi: kart.goruldu ? "2026-11-12T09:00:00Z" : null, yildizli: kart.yildizli });
                data = { durum: kayitlar.get(kart._id) };
            } else if (url.pathname.endsWith("/degerlendirmeler")) { degerlendirmeler.push(body); data = { basarili: true }; }
            else if (url.pathname.endsWith("/calisma-kartlari")) { if (!otomatikBekleme && durum === "olusturuluyor" && ++getSayisi >= 2) durum = "hazir"; data = govde(); }
            else throw new Error("Beklenmeyen API isteği");
            await send("Fetch.fulfillRequest", { requestId, responseCode,
                responseHeaders: [{ name: "content-type", value: "application/json" }, { name: "access-control-allow-origin", value: origin }, { name: "access-control-allow-credentials", value: "true" }, { name: "access-control-allow-methods", value: "GET,POST,PATCH,OPTIONS" }, { name: "access-control-allow-headers", value: "content-type" }],
                body: Buffer.from(JSON.stringify(data)).toString("base64") }, m.sessionId);
        } catch (e) {
            if (kapaniyor) return;
            // Navigasyon veya React cleanup AbortController'ı bekleyen isteği
            // iptal edebilir. Yalnız CDP'nin doğruladığı iptali göz ardı et.
            if (/Invalid InterceptionId/.test(e.message)) {
                // loadingFailed olayı komutun hata yanıtından sonra da gelebilir.
                gecersizIstekler.push({ networkId, navigasyonIptali: istekNavigasyonu !== navigasyonSurumu, url: request.url, hata: e.message });
                return;
            }
            hatalar.push(e.message);
            // Navigasyon/kapanış sırasında hedef zaten kalkmış olabilir.
            await send("Fetch.failRequest", { requestId, errorReason: "Failed" }, m.sessionId).catch(() => {});
        }
    };
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
    const cdp = (method, params) => { if (method === "Page.navigate") navigasyonSurumu++; return send(method, params, sessionId); };
    await cdp("Network.enable");
    await cdp("Network.setBlockedURLs", { urls: ["https://*"] });
    await cdp("Fetch.enable", { patterns: [{ urlPattern: "*" }] }); await cdp("Runtime.enable");
    console.log("Tarayıcı testi: API mock hazır");
    const evaluate = async expression => {
        const r = await cdp("Runtime.evaluate", { expression, returnByValue: true });
        if (r.exceptionDetails) throw new Error(r.exceptionDetails.text); return r.result.value;
    };
    const bekle = async expression => { for (let i = 0; i < 120; i++) { if (await evaluate(`Boolean(${expression})`)) return; await gecik(100); } throw new Error(`UI bekleme sınırı: ${expression}`); };
    const tikla = async etiket => { await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.trim()===${JSON.stringify(etiket)});if(!b||b.disabled)throw Error('Buton kullanılamıyor: '+${JSON.stringify(etiket)});b.click();return true})()`); };
    const ac = async light => { await cdp("Page.navigate", { url: `${origin}/${basename(alan)}/fixture.html${light ? '?light' : ''}` }); };
    await cdp("Emulation.setDeviceMetricsOverride", { width: 1365, height: 1000, deviceScaleFactor: 1, mobile: false });
    await ac(false); await bekle("document.body.innerText.includes('Kartları Oluştur')");
    assert.equal(uretimSayisi, 0);
    await tikla("Kartları Oluştur"); await bekle("document.body.innerText.includes('oluşturuluyor...')");
    await bekle("document.body.innerText.includes('Çalışma kartlarınız hazır!')"); await tikla("Kartları Görüntüle");
    await bekle("document.querySelector('[aria-label^=\"Cevabı göster\"]')");
    await evaluate("document.querySelector('[aria-label^=\"Cevabı göster\"]').click()");
    await bekle("[...document.querySelectorAll('button')].some(b=>b.textContent==='Kolay'&&!b.disabled)");
    await tikla("Kolay"); await bekle("document.body.innerText.includes('Değerlendirmeniz kaydedildi.')");
    assert.equal(degerlendirmeler.length, 1);
    await evaluate("document.querySelector('[aria-label=\"Yıldız ekle\"]').click()"); await bekle("document.querySelector('[aria-label=\"Yıldızı kaldır\"]:not(:disabled)')");
    await tikla("Sonraki"); await bekle("document.querySelector('[aria-label^=\"Cevabı göster\"]')?.textContent.includes('Kuyruk')");
    assert.equal(await evaluate("document.querySelector('.calisma-karti-donen').classList.contains('cevrili')"), false);
    await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Yıldızlı Kartlar')).click()");
    await bekle("document.querySelector('[aria-label^=\"Cevabı göster\"]')?.textContent.includes('Yığın')");
    await gecik(500);
    const masaustu = join(tmpdir(), "studyai-kartlar-masaustu.png");
    await writeFile(masaustu, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    await cdp("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
    await ac(true); await bekle("document.querySelector('[aria-label^=\"Cevabı göster\"]')");
    assert.equal(uretimSayisi, 1, "Yenilemede ikinci üretim olmamalı");
    assert.equal(kartlar[0].goruldu, true); assert.equal(kartlar[0].yildizli, true);
    await gecik(500);
    assert.ok(await evaluate("document.documentElement.scrollWidth <= innerWidth"), "Mobil görünüm yatay taşmamalı");
    await tikla("Konuları seç"); await bekle("document.querySelector('[aria-label=\"Kart konuları\"] button[aria-expanded=\"true\"]')");
    await tikla("Kapat");
    const mobil = join(tmpdir(), "studyai-kartlar-mobil.png");
    await writeFile(mobil, Buffer.from((await cdp("Page.captureScreenshot", { format: "png" })).data, "base64"));
    assert.equal(ozetGetSayisi, 0, "Gerçek ders layout'u ve kart polling'i özet isteği başlatmamalı");
    await cdp("Page.navigate", { url: `${origin}/${basename(alan)}/fixture.html?ozet` });
    await bekle("document.body.innerText.includes('Özet Oluştur')");
    await gecik(1200);
    assert.equal(ozetGetSayisi, 1, "Seçenekler yüklenirken aynı tüm ders özeti tekrar sorgulanmamalı");
    assert.equal(await evaluate("document.querySelector('[role=alert]')?.textContent || ''"), "", "Beklenen özet 404'ü hata olarak gösterilmemeli");
    await gecik(1200);
    assert.equal(ozetGetSayisi, 1, "404 otomatik polling veya yeniden deneme başlatmamalı");
    await evaluate("[...document.querySelectorAll('a')].find(a=>a.getAttribute('href').endsWith('/calisma-kartlari')).click()");
    await bekle("document.querySelector('[aria-label^=\"Cevabı göster\"]')");
    await gecik(500);
    assert.equal(ozetGetSayisi, 1, "Kart sayfasına dönüşte özet isteği sürmemeli");
    assert.equal(uretimSayisi, 1, "Sekme değişimi kart üretimini tekrarlamamalı");
    durum = "kismi"; getSayisi = 0;
    await ac(false); await bekle("document.body.innerText.includes('Eksik Konuları Tamamla')");
    assert.equal(uretimSayisi, 1, "Kısmi durum kendiliğinden üretim başlatmamalı");
    assert.ok(await evaluate("document.body.innerText.includes('güvenli çağrı sınırına')"));
    await tikla("Kartları Görüntüle"); await bekle("document.querySelector('[aria-label^=\"Cevabı göster\"]')");
    assert.equal(await evaluate("document.body.innerText.includes('Kart 1 / 1')"), true);
    assert.ok(await evaluate("Boolean(document.querySelector('[aria-label=\"Yıldızı kaldır\"]'))"), "Kısmi yenilemede yıldız korunmalı");
    await tikla("Eksik Konuları Tamamla"); await bekle("document.body.innerText.includes('Kart 1 / 2')");
    assert.equal(uretimSayisi, 2, "Eksik konular için yalnızca bir ek POST olmalı");
    assert.equal(kartlar[0]._id, "222222222222222222222222");
    assert.equal(kartlar[0].goruldu, true); assert.equal(kartlar[0].yildizli, true);
    assert.equal(degerlendirmeler.length, 1, "Devam eski değerlendirmeyi değiştirmemeli");
    // Backend işi beklerken tarayıcı kapanıp açılır; yeni POST olmadan ilerler.
    durum = "olusturuluyor"; otomatikBekleme = true;
    await ac(false); await bekle("document.body.innerText.includes('Kart üretimi otomatik devam edecek')");
    await tikla("Kartları Görüntüle"); await bekle("document.body.innerText.includes('Kart 1 / 1')");
    await ac(false); await bekle("document.body.innerText.includes('Kart üretimi otomatik devam edecek')");
    assert.equal(uretimSayisi, 2, "Bekleme ve yeniden açma üretim POST'u göndermemeli");
    otomatikBekleme = false; durum = "hazir";
    await bekle("document.body.innerText.includes('Kart 1 / 2')");
    assert.equal(uretimSayisi, 2); assert.equal(kartlar[0].yildizli, true);
    toplamSinir = true; durum = "kismi";
    await ac(false); await bekle("document.body.innerText.includes('toplam kullanım sınırına')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Eksik Konuları Tamamla')).disabled"), true);
    toplamSinir = false; durum = "hazir";
    // Doğal soru-cevap eski kayıtlarla aynı bileşende, gerçek klavye etkileşimiyle çalışır.
    kartlar[0].soru = "Yığın nedir?"; kartlar[0].cevap = "Son giren elemanın ilk çıkarıldığı veri yapısıdır."; kartlar[0].tur = "soru_cevap";
    await ac(false); await bekle("document.querySelector('[aria-label^=\"Cevabı göster\"]')?.textContent.includes('Yığın nedir?')");
    await cdp("Page.bringToFront");
    await cdp("Emulation.setFocusEmulationEnabled", { enabled: true });
    await evaluate("document.querySelector('[aria-label^=\"Cevabı göster\"]').focus()");
    assert.equal(await evaluate("document.activeElement === document.querySelector('[aria-label^=\"Cevabı göster\"]')"), true);
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: "Enter", code: "Enter", text: "\r", unmodifiedText: "\r", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: "Enter", code: "Enter", windowsVirtualKeyCode: 13, nativeVirtualKeyCode: 13 });
    await bekle("document.querySelector('.calisma-karti-donen').classList.contains('cevrili')");
    await cdp("Input.dispatchKeyEvent", { type: "keyDown", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await cdp("Input.dispatchKeyEvent", { type: "keyUp", key: " ", code: "Space", windowsVirtualKeyCode: 32, nativeVirtualKeyCode: 32 });
    await bekle("!document.querySelector('.calisma-karti-donen').classList.contains('cevrili')");
    kaynakGuncel = false;
    await ac(false); await bekle("document.body.innerText.includes('salt okunurdur')");
    assert.equal(await evaluate("document.querySelector('[aria-label=\"Yıldızı kaldır\"]').disabled"), true);
    await evaluate("document.querySelector('[aria-label^=\"Cevabı göster\"]').click()");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent==='Kolay')"), false);
    kavramsiz = true; kaynakGuncel = true;
    await ac(false); await bekle("document.body.innerText.includes('ayrı kart gerektiren')");
    assert.equal(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Kartları Oluştur'))"), false);
    assert.equal(uretimSayisi, 2);
    await gecik(400);
    for (const istek of gecersizIstekler) {
        if (istek.navigasyonIptali || iptalEdilenAgIstekleri.has(istek.networkId)) iptalEdilenEskiIstek++;
        else hatalar.push(JSON.stringify(istek));
    }
    assert.deepEqual(hatalar, []);
    console.log(JSON.stringify({ sonuc: "başarılı", uretimSayisi, ozetGetSayisi, degerlendirmeSayisi: degerlendirmeler.length, iptalEdilenEskiIstek, masaustu, mobil }));
} finally {
    kapaniyor = true;
    console.log("Tarayıcı testi: kaynaklar kapatılıyor");
    if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ id: 999999, method: "Browser.close" }));
    if (browser && browser.exitCode == null) { const bitti = new Promise(r => browser.once("exit", r)); browser.kill(); await Promise.race([bitti, gecik(3000)]); }
    ws?.close();
    vite?.httpServer?.closeAllConnections();
    await sinirli(vite?.close(), 8000, "Vite kapanış sınırı aşıldı").catch(e => console.error(e.message));
    if (!resolve(alan).startsWith(kok + sep)) throw new Error("Geçici test dizini çalışma alanı dışında");
    await rm(alan, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 });
}

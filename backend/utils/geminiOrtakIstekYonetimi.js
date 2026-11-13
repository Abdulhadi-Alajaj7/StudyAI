import { geminiHazirlamaHatasiniSiniflandir, geminiRetryBeklemesiniGetir, geminiTanilamasiniLogla } from "./geminiHazirlamaHatasi.js";
import { geminiModelRotasiniGetir, modelKimliginiNormallestir, modelKotalariniGetir } from "./geminiModelYonlendirme.js";
export const sinirliGeminiDenemesi = (deger, varsayilan = 3) => {
    const sayi = Number(deger);
    return Number.isInteger(sayi) && sayi > 0 ? Math.min(5, sayi) : varsayilan;
};

const pozitif = (v, d) => Number.isSafeInteger(Number(v)) && Number(v) > 0 ? Number(v) : d;
export const tahminiGirdiTokeni = (...metinler) => Math.max(1, Math.ceil(metinler.reduce((n, m) => n + String(m || "").length, 0) / 3));
const gun = simdi => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(simdi);
export const geminiGunSonunaKalanMs = (simdi = Date.now()) => {
    const bugun = gun(simdi); let alt = simdi, ust = simdi + 26 * 60 * 60_000;
    // DST dahil sonraki Pacific gününü bul; yerel 24 saat varsayma.
    while (ust - alt > 1000) { const orta = Math.floor((alt + ust) / 2); if (gun(orta) === bugun) alt = orta; else ust = orta; }
    return ust - simdi;
};
const yerelHata = (kod, kotaTuru = null, retryAfterMs = null) => Object.assign(new Error(kod), {
    kod, status: 429, yerelSinir: true, kotaTuru, retryAfterMs,
});

// Bütün özellikler aynı model defterini paylaşır. API key kotayı bölmez.
// Çoklu instance ve yeniden başlatma için kalıcı kota garantisi vermez.
export const geminiOrtakIstekYonetimiOlustur = ({ maksimum = null, simdi = Date.now, kotalar = null } = {}) => {
    const kayitlar = new Map();
    const al = model => {
        model = modelKimliginiNormallestir(model);
        const zaman = simdi(), bugun = gun(zaman);
        if (!kayitlar.has(model)) kayitlar.set(model, { gun: bugun, adet: 0, aktif: 0, dakika: [], engelli: 0, gunlukDolu: false });
        const k = kayitlar.get(model);
        if (k.gun !== bugun) Object.assign(k, { gun: bugun, adet: 0, gunlukDolu: false });
        k.dakika = k.dakika.filter(r => zaman - r.zaman < 60_000);
        return k;
    };
    return {
        yerAyir(model, { tahminiToken = 1, sinirlar = null } = {}) {
            const k = al(model), zaman = simdi();
            const profil = kotalar?.[modelKimliginiNormallestir(model)] || modelKotalariniGetir(model);
            const varsayilan = String(model).includes("embedding") ? { rpm: 60, tpm: 20_000, rpd: 700 } : { rpm: 10, tpm: 175_000, rpd: 400 };
            const limit = profil || varsayilan;
            const kota = Object.fromEntries(["rpm", "tpm", "rpd"].map(a => [a, Math.min(limit[a], sinirlar?.[a] ?? Infinity)]));
            if ([kota.rpm, kota.tpm, kota.rpd].some(v => v === 0)) throw yerelHata("GEMINI_MODEL_KAPALI");
            if (k.gunlukDolu) throw yerelHata("GEMINI_GUNLUK_KOTA", "gunluk", geminiGunSonunaKalanMs(zaman));
            if (k.adet >= kota.rpd) throw yerelHata("GEMINI_YEREL_RPD", "gunluk", geminiGunSonunaKalanMs(zaman));
            if (k.engelli > zaman) throw yerelHata("GEMINI_YEREL_KOTA", k.kotaTuru, k.engelli - zaman);
            const bekleme = Math.max(1, (k.dakika[0]?.zaman ?? zaman) + 60_000 - zaman);
            if (k.dakika.length >= kota.rpm) throw yerelHata("GEMINI_YEREL_RPM", "rpm", bekleme);
            const token = Math.max(1, Math.ceil(tahminiToken));
            // Tek istek pencere boşken de sığmıyorsa beklemek sorunu çözmez.
            if (!Number.isFinite(token) || token > kota.tpm) throw yerelHata("GEMINI_ISTEK_BOYUTU", "tpm");
            if (k.dakika.reduce((n, r) => n + r.token, 0) + token > kota.tpm) throw yerelHata("GEMINI_YEREL_TPM", "tpm", bekleme);
            if (k.aktif >= Math.min(20, pozitif(maksimum ?? process.env.GEMINI_ORTAK_MAKS_ESZAMANLI_ISTEK, 2))) throw yerelHata("GEMINI_ISTEK_YOGUNLUGU");
            const kayit = { zaman, token, tahminiToken: token, gercekToken: null };
            k.dakika.push(kayit); k.adet++; k.aktif++;
            let birakildi = false;
            const birak = () => { if (!birakildi) { birakildi = true; k.aktif--; } };
            // TPM girdidir; çıktı/toplam ayrı teknik tanılamada tutulur.
            birak.mutabakat = usage => {
                if (Number.isFinite(usage?.promptTokenCount) && usage.promptTokenCount >= 0) {
                    kayit.token = usage.promptTokenCount; kayit.gercekToken = usage.promptTokenCount;
                }
            };
            return birak;
        },
        hataKaydet(model, hata) {
            if (hata.yerelSinir || hata.status !== 429) return;
            const k = al(model);
            if (hata.kod === "GEMINI_GUNLUK_KOTA") k.gunlukDolu = true;
            else { k.engelli = Math.max(k.engelli, simdi() + (hata.retryAfterMs ?? 60_000)); k.kotaTuru = hata.tanilama?.kotaTuru; }
        },
        durum(model) { const k = al(model); return { gun: k.gun, rpd: k.adet, rpm: k.dakika.length, tpm: k.dakika.reduce((n, r) => n + r.token, 0), aktif: k.aktif,
            tahminiIstek: k.dakika.filter(r => r.gercekToken == null).length }; },
    };
};

export const ortakGeminiIstekYonetimi = geminiOrtakIstekYonetimiOlustur();

export const zamanSinirliGeminiIslemi = async (islem, timeoutMs, signal) => {
    signal?.throwIfAborted();
    const controller = new AbortController();
    let timer, iptal;
    const kesilme = new Promise((_, reject) => {
        iptal = () => { controller.abort(); reject(Object.assign(new Error("İşlem iptal edildi."), { kod: "GEMINI_IPTAL", status: 409 })); };
        signal?.addEventListener("abort", iptal, { once: true });
        timer = setTimeout(() => { controller.abort(); reject(Object.assign(new Error("İşlem süresi doldu."), { kod: "GEMINI_ZAMAN_ASIMI" })); }, timeoutMs);
    });
    try { return await Promise.race([Promise.resolve().then(() => islem(controller.signal)), kesilme]); }
    finally { clearTimeout(timer); signal?.removeEventListener("abort", iptal); }
};

// JSON/kaynak doğrulaması döngünün dışındadır; çıktı hataları retry/fallback doğurmaz.
export const geminiIsteginiYurut = async ({ modelAdi, gorev, islem, maxDeneme = 3, timeoutMs = 60_000,
    toplamSureMs = pozitif(process.env.GEMINI_ISLEM_TIMEOUT_MS, 120_000), maksBeklemeMs = 10_000,
    apiCagriButcesi = null, tahminiToken = 1, sinirlar = null, signal, sahipligiDogrula,
    bekle = ms => new Promise(r => setTimeout(r, ms)), rastgele = Math.random, simdi = Date.now,
    istekYonetimi = ortakGeminiIstekYonetimi, env = process.env, logger = console,
}) => {
    const rota = geminiModelRotasiniGetir(gorev, modelAdi, env);
    const primarySiniri = Math.min(sinirliGeminiDenemesi(maxDeneme), pozitif(env.GEMINI_PRIMARY_MAKS_DENEME, 3), 3);
    const toplamSinir = Math.min(pozitif(env.GEMINI_TOPLAM_MAKS_DENEME, 4), 4,
        apiCagriButcesi ? apiCagriButcesi.maksimum - apiCagriButcesi.kullanilan : Infinity);
    const baslangic = simdi();
    let sonHata, deneme = 0, model = rota.primary, fallback = false, fallbackDenendi = false;
    const sahiplikKontrolu = async () => {
        try { await sahipligiDogrula?.(); }
        catch (hata) { throw Object.assign(new Error("İşlem sahipliği doğrulanamadı.", { cause: hata }), {
            kod: hata?.kod || "GEMINI_SAHIPLIK_KONTROLU", status: hata?.status || 409, sahiplikHatasi: true,
        }); }
    };
    const tani = () => ({ model, ozellik: gorev, gercekDenemeSayisi: deneme, retrySayisi: Math.max(0, deneme - 1 - Number(fallbackDenendi)),
        retryEdildiMi: deneme - Number(fallbackDenendi) > 1, maksimumDenemeSayisi: primarySiniri,
        fallbackKullanildi: fallbackDenendi, tahminiGirdiTokeni: tahminiToken, toplamIslemSureMs: Math.max(0, simdi() - baslangic) });
    while (deneme < toplamSinir) {
        try {
            if (signal?.aborted) throw Object.assign(new Error("İşlem iptal edildi."), { kod: "GEMINI_IPTAL", status: 409 });
            await sahiplikKontrolu();
            const kalan = toplamSureMs - (simdi() - baslangic);
            if (kalan <= 0) throw Object.assign(new Error("İşlem süresi doldu."), { kod: "GEMINI_ISLEM_SURESI", status: 504 });
            if (apiCagriButcesi && apiCagriButcesi.kullanilan >= apiCagriButcesi.maksimum) break;
            const birak = istekYonetimi.yerAyir(model, { tahminiToken, sinirlar });
            let yanit;
            try {
                deneme++;
                fallbackDenendi ||= fallback;
                if (apiCagriButcesi) apiCagriButcesi.kullanilan++;
                yanit = await zamanSinirliGeminiIslemi(abortSignal => islem({ model, abortSignal, deneme, fallback }), Math.min(timeoutMs, kalan), signal);
                birak.mutabakat?.(yanit?.usageMetadata);
            } finally { birak(); }
            await sahiplikKontrolu();
            geminiTanilamasiniLogla({ asama: gorev, model, deneme, sureMs: simdi() - baslangic, yanit, logger, tanilama: tani() });
            return { yanit, tanilama: { ...tani(), tokenOlcumu: Number.isFinite(yanit?.usageMetadata?.promptTokenCount) ? "saglayici" : "tahmini" } };
        } catch (hata) {
            if (hata?.sahiplikHatasi || (hata?.kod && /KILIT|SAHIP|IPTAL|ISLEM_SURESI/.test(hata.kod))) throw hata;
            sonHata = geminiHazirlamaHatasiniSiniflandir(hata, simdi());
            sonHata.tanilama = { ...sonHata.tanilama, ...tani() };
            geminiTanilamasiniLogla({ asama: gorev, model, deneme, sureMs: simdi() - baslangic, hata: sonHata, logger, tanilama: tani() });
            const bekleme = geminiRetryBeklemesiniGetir(sonHata, Math.max(1, deneme), maksBeklemeMs, rastgele);
            sonHata.tanilama.retryUygunMu = bekleme != null;
            const retry = !fallback && deneme < primarySiniri && bekleme != null;
            const fallbackUygun = !fallback && rota.fallback && sonHata.kod === "GEMINI_503" && deneme >= primarySiniri && bekleme != null;
            if (deneme >= toplamSinir || (!retry && !fallbackUygun) || simdi() - baslangic + (bekleme || 0) >= toplamSureMs) {
                istekYonetimi.hataKaydet?.(model, sonHata); break;
            }
            await zamanSinirliGeminiIslemi(() => bekle(bekleme), Math.max(1, toplamSureMs - (simdi() - baslangic)), signal);
            if (fallbackUygun) { model = rota.fallback; fallback = true; }
        }
    }
    throw sonHata || Object.assign(new Error("Gemini çağrı bütçesi tükendi."), { kod: "GEMINI_CAGRI_BUTCESI_ASILDI", status: 503, tanilama: tani() });
};

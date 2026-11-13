const guvenliKod = value => typeof value === "string" && /^[A-Z][A-Z0-9_]{0,79}$/.test(value) && !/KEY|SECRET|TOKEN/.test(value) ? value : null;
const httpKodu = value => Number.isInteger(Number(value)) && Number(value) >= 100 && Number(value) <= 599 ? Number(value) : null;
const mesajlar = {
    GEMINI_YEREL_RPM: "Bu modelin dakikalık istek bütçesi doldu. Biraz sonra devam edebilirsiniz.",
    GEMINI_YEREL_TPM: "Bu modelin dakikalık token bütçesi doldu. Biraz sonra devam edebilirsiniz.",
    GEMINI_YEREL_RPD: "Bu modelin günlük uygulama bütçesi doldu. Kota yenilendiğinde devam edebilirsiniz.",
    GEMINI_YEREL_KOTA: "Bu model için kota bekleme süresi devam ediyor. Daha sonra yeniden deneyin.",
    GEMINI_MODEL_KAPALI: "Bu modelin kullanım bütçesi kapalı. Yönetici model ayarlarını kontrol etmeli.",
    GEMINI_ISTEK_YOGUNLUGU: "Yapay zekâ işlemleri şu anda yoğun. Biraz sonra yeniden deneyin.",
    GEMINI_429: "Gemini istek sınırına ulaşıldı. Bir süre sonra yeniden deneyin.",
    GEMINI_GUNLUK_KOTA: "Gemini günlük kullanım kotası doldu. Kota yenilendikten sonra yeniden deneyin.",
    GEMINI_503: "Gemini geçici olarak kullanılamıyor. Bir süre sonra yeniden deneyebilirsiniz.",
    GEMINI_SUNUCU_HATASI: "Gemini hizmeti isteği tamamlayamadı. Daha sonra yeniden deneyin.",
    GEMINI_ZAMAN_ASIMI: "Gemini yanıtı zamanında alınamadı. Yeniden deneyebilirsiniz.",
    GEMINI_AG_HATASI: "Gemini ile ağ bağlantısı kurulamadı. Bağlantıyı kontrol edip yeniden deneyin.",
    GEMINI_GECERSIZ_JSON: "Gemini geçerli bir JSON yanıtı döndürmedi. Yeniden deneyebilirsiniz.",
    GEMINI_GECERSIZ_SEMA: "Gemini yanıtındaki konu haritası doğrulanamadı. Yeniden deneyebilirsiniz.",
    GEMINI_BOS_YANIT: "Gemini boş yanıt döndürdü. Yeniden deneyebilirsiniz.",
    GEMINI_CIKTI_SINIRI: "Konu haritası yanıtı çıktı sınırında kesildi. Modelin çıktı sınırı ayarını kontrol edin.",
    GEMINI_ISTEK_BOYUTU: "Konu haritası isteği izin verilen boyutu aşıyor. İstek boyutu veya kota ayarını kontrol edin.",
    GEMINI_YAPILANDIRMA: "Gemini erişim ayarları doğrulanamadı. Yönetici API anahtarı ve erişim izinlerini kontrol etmeli.",
    GEMINI_MODEL_BULUNAMADI: "Yapılandırılan Gemini modeli bulunamadı. Yönetici model adını ve erişimini kontrol etmeli.",
    GEMINI_GECERSIZ_ISTEK: "Gemini isteği kabul edilmedi. Yönetici model ve istek ayarlarını kontrol etmeli.",
    HAZIRLAMA_HATASI: "Ders hazırlanamadı. Materyalleri kontrol edip yeniden deneyin.",
};

const hataGovdesi = hata => {
    if (hata?.error && typeof hata.error === "object") return hata.error;
    if (hata?.response?.data?.error) return hata.response.data.error;
    try { return JSON.parse(String(hata?.message || ""))?.error || {}; } catch { return {}; }
};

export const geminiHazirlamaHatasiniSiniflandir = (hata, simdi = Date.now()) => {
    if (hata?.guvenliHazirlamaHatasi) return hata;
    const govde = hataGovdesi(hata);
    const httpDurumu = httpKodu(hata?.status) || httpKodu(hata?.statusCode) || httpKodu(hata?.response?.status) || httpKodu(hata?.code) || httpKodu(govde.code);
    const metin = String(hata?.message || "");
    const ayrintilar = Array.isArray(govde.details) ? govde.details : [];
    const kotaMetni = JSON.stringify(ayrintilar) + metin;
    const kotaTuru = hata?.kotaTuru || (/per.?day|daily|\brpd\b|günlük/i.test(kotaMetni) ? "gunluk"
        : /token.*per.?minute|\btpm\b/i.test(kotaMetni) ? "tpm"
        : /per.?minute|\brpm\b/i.test(kotaMetni) ? "rpm" : "bilinmiyor");
    const headers = hata?.response?.headers || hata?.headers;
    const retryHeader = headers?.get?.("retry-after") ?? headers?.["retry-after"] ?? headers?.["Retry-After"];
    const retryInfo = ayrintilar.find(d => String(d?.["@type"] || "").endsWith("google.rpc.RetryInfo"));
    const gecikme = retryInfo?.retryDelay;
    let retryAfterMs = Number.isFinite(hata?.retryAfterMs) ? hata.retryAfterMs : null;
    if (retryHeader != null) {
        const saniye = Number(retryHeader);
        retryAfterMs = Number.isFinite(saniye) ? saniye * 1000 : Date.parse(retryHeader) - simdi;
    } else if (typeof gecikme === "string" && /^\d+(\.\d+)?s$/.test(gecikme)) {
        retryAfterMs = Number(gecikme.slice(0, -1)) * 1000;
    } else if (gecikme && Number.isFinite(Number(gecikme.seconds))) {
        retryAfterMs = Number(gecikme.seconds) * 1000 + Number(gecikme.nanos || 0) / 1e6;
    }
    if (!Number.isFinite(retryAfterMs) || retryAfterMs < 0) retryAfterMs = null;

    let kod = "HAZIRLAMA_HATASI", status = httpDurumu || 500, gecici = false;
    if (mesajlar[hata?.kod]) {
        kod = hata.kod;
        status = httpDurumu || (kod === "GEMINI_ZAMAN_ASIMI" ? 504 : kod === "GEMINI_AG_HATASI" ? 502 : 502);
        gecici = ["GEMINI_ZAMAN_ASIMI", "GEMINI_AG_HATASI", "GEMINI_429", "GEMINI_503", "GEMINI_SUNUCU_HATASI"].includes(kod);
    } else if (httpDurumu === 429 || hata?.kod === "EMBEDDING_GUNLUK_LIMIT" || (!httpDurumu && /\b429\b|quota|rate limit/i.test(metin))) {
        kod = kotaTuru === "gunluk" || hata?.kod === "EMBEDDING_GUNLUK_LIMIT" ? "GEMINI_GUNLUK_KOTA" : "GEMINI_429";
        status = 429;
        gecici = kod === "GEMINI_429";
    } else if ([401, 403].includes(httpDurumu) || hata?.kod === "EKSİK_API_KEY") {
        kod = "GEMINI_YAPILANDIRMA";
    } else if (httpDurumu === 404) {
        kod = "GEMINI_MODEL_BULUNAMADI";
    } else if (httpDurumu === 413 || (httpDurumu === 400 && /too large|input.*(limit|exceed)|token.*exceed/i.test(metin))) {
        kod = "GEMINI_ISTEK_BOYUTU";
    } else if (httpDurumu === 400) {
        kod = "GEMINI_GECERSIZ_ISTEK";
    } else if (httpDurumu === 503) {
        kod = "GEMINI_503"; gecici = true;
    } else if (httpDurumu === 504 || (!httpDurumu && (/timeout|timed.?out|zaman aşımı/i.test(metin) || ["AbortError", "TimeoutError"].includes(hata?.name)))) {
        kod = "GEMINI_ZAMAN_ASIMI"; status = httpDurumu || 504; gecici = true;
    } else if (httpDurumu >= 500) {
        kod = "GEMINI_SUNUCU_HATASI"; gecici = true;
    } else if (!httpDurumu && (/econn|enotfound|fetch failed|network|sending request/i.test(metin) || /^(ECONN|ENOTFOUND|EAI_)/.test(hata?.cause?.code || hata?.code || ""))) {
        kod = "GEMINI_AG_HATASI"; status = 502; gecici = true;
    } else if (hata instanceof SyntaxError) {
        kod = "GEMINI_GECERSIZ_JSON"; status = 502;
    }
    const sonuc = new Error(mesajlar[kod], { cause: hata });
    Object.assign(sonuc, {
        guvenliHazirlamaHatasi: true, kod, status, gecici: !hata?.yerelSinir && gecici, retryAfterMs, yerelSinir: Boolean(hata?.yerelSinir),
        tanilama: {
            orijinalHttpDurumu: hata?.yerelSinir ? null : httpDurumu,
            saglayiciHataKodu: guvenliKod(govde.status),
            kotaTuru: status === 429 ? (kod === "GEMINI_GUNLUK_KOTA" ? "gunluk" : kotaTuru) : null,
            retryAfterMs,
            agHataKodu: guvenliKod(hata?.cause?.code) || (!httpDurumu ? guvenliKod(hata?.code) : null),
        },
    });
    return sonuc;
};

export const geminiRetryBeklemesiniGetir = (hata, deneme, maksBeklemeMs = 30000, rastgele = () => 0) => {
    if (!hata.gecici || hata.yerelSinir || hata.kod === "GEMINI_GUNLUK_KOTA") return null;
    const sure = Math.max(hata.retryAfterMs ?? (hata.status === 429 ? 60000 : 0), Math.min(8000, 1000 * 2 ** (deneme - 1)))
        + Math.floor(Math.max(0, Math.min(1, Number(rastgele()) || 0)) * 250);
    return sure <= maksBeklemeMs ? sure : null;
};

export const geminiTanilamasiniLogla = ({ asama, model, deneme, sureMs, hata, yanit, logger = console, tanilama }) => {
    const tokenlar = yanit?.usageMetadata || {};
    const veri = {
        asama, model: typeof model === "string" && /^[a-zA-Z0-9/_.-]{1,120}$/.test(model) && !/^(AIza|sk-)/.test(model) && model !== process.env.GEMINI_API_KEY ? model : "gecersiz_model_adi",
        deneme, sureMs: Math.round(sureMs), kod: hata?.hazirlamaKodu || hata?.kod || null,
        httpDurumu: hata?.tanilama?.orijinalHttpDurumu ?? null,
        saglayiciHataKodu: hata?.tanilama?.saglayiciHataKodu ?? null,
        kotaTuru: hata?.tanilama?.kotaTuru ?? null, retryAfterMs: hata?.retryAfterMs ?? null,
    };
    for (const alan of ["promptTokenCount", "candidatesTokenCount", "totalTokenCount"]) {
        if (Number.isFinite(tokenlar[alan]) && tokenlar[alan] >= 0) veri[alan] = tokenlar[alan];
    }
    if (tanilama) {
        for (const alan of ["gercekDenemeSayisi", "retrySayisi", "tahminiGirdiTokeni", "toplamIslemSureMs"]) {
            if (Number.isFinite(tanilama[alan]) && tanilama[alan] >= 0) veri[alan] = tanilama[alan];
        }
        veri.fallbackKullanildi = tanilama.fallbackKullanildi === true;
        veri.tokenOlcumu = Number.isFinite(tokenlar.promptTokenCount) ? "saglayici" : "tahmini";
    }
    if (hata?.tanilama) Object.assign(hata.tanilama, {
        asama: veri.asama, model: veri.model, deneme: veri.deneme, sureMs: veri.sureMs,
    });
    try { logger.info("[GeminiHazirlama]", veri); } catch { /* Tanılama başarılı SDK sonucunu yeniden üretemez. */ }
};

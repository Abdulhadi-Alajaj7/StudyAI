const sayi = (v, d, max) => Number.isInteger(Number(v)) && Number(v) > 0 ? Math.min(Number(v), max) : d;
export const haritaIstekAyarlari = () => ({
    rpm: sayi(process.env.GEMINI_HARITA_RPM, 12, 10000),
    tpm: sayi(process.env.GEMINI_HARITA_TPM, 200000, 10000000),
    rpd: sayi(process.env.GEMINI_HARITA_RPD, 450, 1000000),
    maksDeneme: sayi(process.env.GEMINI_HARITA_MAKS_DENEME, 2, 3),
    timeoutMs: sayi(process.env.GEMINI_HARITA_TIMEOUT_MS, 60000, 180000),
    maksBeklemeMs: sayi(process.env.GEMINI_HARITA_MAKS_BEKLEME_MS, 30000, 60000),
    maxOutputTokens: sayi(process.env.GEMINI_HARITA_MAKS_CIKTI_TOKEN, null, 65536),
});

const gun = tarih => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(tarih);

// Yalnız bu süreçteki konu haritası çağrıları için hafif kota koruması.
// Projenin diğer sunucuları/AI Studio kullanımı sağlayıcının 429 yanıtıyla yönetilir.
export const haritaSinirlayiciOlustur = () => {
    const kayitlar = new Map();
    const kayitAl = (model, simdi) => {
        if (!kayitlar.has(model)) kayitlar.set(model, { gun: gun(simdi), adet: 0, dakika: [], engelli: 0 });
        const kayit = kayitlar.get(model);
        if (kayit.gun !== gun(simdi)) Object.assign(kayit, { gun: gun(simdi), adet: 0, gunlukDolu: false });
        kayit.dakika = kayit.dakika.filter(k => simdi - k.zaman < 60000);
        return kayit;
    };
    return {
        kontrolEt(model, token, ayarlar, simdi = Date.now()) {
            const kayit = kayitAl(model, simdi);
            const hata = (kod, status, retryAfterMs) => Object.assign(new Error(kod), { kod, status, retryAfterMs, yerelSinir: true });
            if (kayit.gunlukDolu || kayit.adet >= ayarlar.rpd) throw hata("GEMINI_GUNLUK_KOTA", 429, null);
            if (token > ayarlar.tpm) throw hata("GEMINI_ISTEK_BOYUTU", 413, null);
            if (kayit.engelli > simdi) throw hata("GEMINI_429", 429, kayit.engelli - simdi);
            const toplam = kayit.dakika.reduce((n, k) => n + k.token, 0);
            if (kayit.dakika.length >= ayarlar.rpm || toplam + token > ayarlar.tpm) {
                throw hata("GEMINI_429", 429, Math.max(1, kayit.dakika[0].zaman + 60000 - simdi));
            }
            kayit.dakika.push({ zaman: simdi, token });
            kayit.adet++;
        },
        hataKaydet(model, hata, simdi = Date.now()) {
            const kayit = kayitAl(model, simdi);
            if (hata.kod === "GEMINI_GUNLUK_KOTA") kayit.gunlukDolu = true;
            else if (hata.status === 429) kayit.engelli = Math.max(kayit.engelli, simdi + (hata.retryAfterMs ?? 60000));
        },
    };
};

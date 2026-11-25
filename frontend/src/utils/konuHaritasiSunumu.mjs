const uzantilar = new Set(["pdf", "doc", "docx", "ppt", "pptx", "txt"]);
const mimeUzantilari = {
    "application/pdf": "pdf", "application/msword": "doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    "application/vnd.ms-powerpoint": "ppt", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
    "text/plain": "txt",
};
export const materyalSunumu = materyal => {
    const ad = materyal.orijinalDosyaAdi || materyal.dosyaAdi || "Dosya adı belirtilmemiş";
    const adUzantisi = ad.split(".").pop().toLowerCase();
    const tur = String(materyal.dosyaTuru || "").toLowerCase().replace(/^\./, "");
    const uzanti = uzantilar.has(adUzantisi) ? adUzantisi : uzantilar.has(tur) ? tur : mimeUzantilari[materyal.mimeTuru] || "";
    const grup = uzanti.startsWith("doc") ? "doc" : uzanti.startsWith("ppt") ? "ppt" : uzanti || "diger";
    return { ad, uzanti: uzanti.toUpperCase(), grup, boyut: dosyaBoyutuMetni(materyal.dosyaBoyutu) };
};
export const dosyaBoyutuMetni = bayt => {
    if (typeof bayt !== "number" || !Number.isFinite(bayt) || bayt < 0) return "";
    const sira = bayt >= 1024 ** 3 ? 3 : bayt >= 1024 ** 2 ? 2 : bayt >= 1024 ? 1 : 0;
    return `${new Intl.NumberFormat("tr-TR", { maximumFractionDigits: sira ? 1 : 0 }).format(bayt / 1024 ** sira)} ${["B", "KB", "MB", "GB"][sira]}`;
};

// Yalnız tamamlanan ve öğrenciye sunulan kartlar, gerçek konuId ile sayılır.
export const konuKartSayilariniHesapla = (durum) => {
    if (!durum || durum.uretimSuruyor || durum.uretimHatasi || durum.yeniKonuKartlariGerekli ||
        !Array.isArray(durum.kartlar)) return null;
    const sayilar = Object.create(null);
    for (const kart of durum.kartlar) {
        if (typeof kart?.konuId !== "string" || !kart.konuId.trim()) continue;
        sayilar[kart.konuId] = (sayilar[kart.konuId] || 0) + 1;
    }
    return sayilar;
};

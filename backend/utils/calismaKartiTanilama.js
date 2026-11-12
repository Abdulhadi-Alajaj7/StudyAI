// Yalnızca sabit kodlar ve sayısal ölçüler kaydedilir; yanıt/metin/ham hata alınmaz.
export const KART_HATA_ASAMALARI = ["KAYNAK_SECIMI", "GEMINI_ISTEGI", "JSON_AYRISTIRMA", "KART_DOGRULAMA", "VERITABANI_KAYDI"];
export const KART_DOGRULAMA_ALT_KODLARI = [
    "KART_SAYISI", "KONU_KIMLIGI", "KART_ALANLARI", "KAYNAK_REFERANSI",
    "SORU_UZUNLUGU", "CEVAP_UZUNLUGU", "ALINTI_UZUNLUGU", "ALINTI_KAYNAKTA_YOK",
    "CEVAP_ALINTIDA_YOK", "SORU_KAYNAK_ILISKISI", "TEKRAR_KART", "CIKTI_TOKEN_SINIRI", "BOS_YANIT", "JSON_PARSE",
];
export const kartHataTanilamasiniOlustur = (hata, { asama, konuId } = {}) => {
    const tani = hata?.tanilama || {};
    const sonuc = { asama: KART_HATA_ASAMALARI.includes(tani.asama) ? tani.asama
        : KART_HATA_ASAMALARI.includes(asama) ? asama : "GEMINI_ISTEGI" };
    if (typeof konuId === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(konuId)) sonuc.konuId = konuId;
    if (KART_DOGRULAMA_ALT_KODLARI.includes(tani.dogrulamaAltKodu)) sonuc.dogrulamaAltKodu = tani.dogrulamaAltKodu;
    for (const alan of ["kartIndex", "beklenenKartSayisi", "uretilenKartSayisi", "gercekDenemeSayisi", "orijinalHttpDurumu"]) {
        if (Number.isSafeInteger(tani[alan]) && tani[alan] >= 0 && tani[alan] <= 1_000_000) sonuc[alan] = tani[alan];
    }
    if (["STOP", "MAX_TOKENS", "MAX_OUTPUT_TOKENS", "SAFETY", "RECITATION", "OTHER"].includes(tani.finishReason)) sonuc.finishReason = tani.finishReason;
    return sonuc;
};

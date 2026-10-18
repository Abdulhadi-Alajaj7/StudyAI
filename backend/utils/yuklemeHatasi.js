export const yuklemeHatasiniYanitaCevir = (
    hata,
    { maksimumDosyaSayisi, maksimumDosyaBoyutu, beklenenAlan = "dosyalar" }
) => {
    const kod = hata?.code || "DOSYA_YUKLEME_HATASI";
    const maksimumMB = Math.round(maksimumDosyaBoyutu / (1024 * 1024));

    if (kod === "LIMIT_FILE_SIZE") {
        return {
            kod,
            mesaj: `Dosya izin verilen ${maksimumMB} MB boyut sınırını aşıyor.`
        };
    }

    if (kod === "LIMIT_FILE_COUNT") {
        return {
            kod,
            mesaj: `Tek seferde en fazla ${maksimumDosyaSayisi} dosya yükleyebilirsiniz.`
        };
    }

    if (kod === "LIMIT_UNEXPECTED_FILE") {
        return hata?.field === beklenenAlan
            ? {
                kod: "DOSYA_SAYISI_ASILDI",
                mesaj: `Tek seferde en fazla ${maksimumDosyaSayisi} dosya yükleyebilirsiniz.`
            }
            : {
                kod,
                mesaj: "Dosya yükleme alanı geçersiz. Lütfen sayfayı yenileyip tekrar deneyin."
            };
    }

    if (kod === "DESTEKLENMEYEN_DOSYA_TURU") {
        return {
            kod,
            mesaj: "Bu dosya türü desteklenmiyor. Lütfen PDF, DOCX, PPTX veya TXT dosyası seçin."
        };
    }

    return {
        kod,
        mesaj: "Dosya yüklenemedi. Lütfen dosyayı kontrol edip tekrar deneyin."
    };
};

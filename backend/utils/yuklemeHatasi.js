import { DOSYA_BOYUT_SINIRLARI, MAKSIMUM_DOSYA_SAYISI } from "../config/materyalYuklemeSinirlari.js";

export const yuklemeHatasiniYanitaCevir = (hata) => {
    const kod = hata?.code || "DOSYA_YUKLEME_HATASI";

    if (kod === "LIMIT_FILE_SIZE") {
        const sinirlar = Object.entries(DOSYA_BOYUT_SINIRLARI)
            .map(([tur, sinir]) => `${tur.toUpperCase()} ${sinir.etiket}`).join(", ");
        return {
            kod,
            mesaj: `Dosya izin verilen boyut sınırını aşıyor. Dosya türüne göre sınırlar: ${sinirlar}.`
        };
    }

    if (kod === "LIMIT_FILE_COUNT") {
        return {
            kod,
            mesaj: `Ders başına en fazla ${MAKSIMUM_DOSYA_SAYISI} materyal yükleyebilirsiniz.`
        };
    }

    if (kod === "LIMIT_UNEXPECTED_FILE") {
        return hata?.field === "dosyalar"
            ? {
                kod: "DOSYA_SAYISI_ASILDI",
                mesaj: `Ders başına en fazla ${MAKSIMUM_DOSYA_SAYISI} materyal yükleyebilirsiniz.`
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

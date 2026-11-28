export const MAKSIMUM_DOSYA_SAYISI = 3;
export const DOSYA_BOYUT_SINIRLARI = {
    pdf: { bayt: 2 * 1024 * 1024, etiket: "2 MB" },
    pptx: { bayt: 2 * 1024 * 1024, etiket: "2 MB" },
    docx: { bayt: 1024 * 1024, etiket: "1 MB" },
    txt: { bayt: 50 * 1024, etiket: "50 KB" }
};
export const MAKSIMUM_DOSYA_BOYUTU = DOSYA_BOYUT_SINIRLARI.pdf.bayt;

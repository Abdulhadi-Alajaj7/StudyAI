// Yalnızca teknik aşama ve süre kaydedilir; içerik, dosya adı ve hata gövdesi yoktur.
export const sureOlc = async (asama, islem) => {
    const baslangic = performance.now();
    try {
        return await islem();
    } finally {
        console.info("[DersHazirlama]", { asama, sureMs: Math.round(performance.now() - baslangic) });
    }
};

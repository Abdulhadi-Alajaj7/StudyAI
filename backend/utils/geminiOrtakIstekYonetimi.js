// Test, özet ve sohbet için süreç içi ani yük koruması; bekleme kuyruğu tutmaz.
export const sinirliGeminiDenemesi = (deger, varsayilan = 3) => {
    const sayi = Number(deger);
    return Number.isInteger(sayi) && sayi > 0 ? Math.min(5, sayi) : varsayilan;
};

export const geminiOrtakIstekYonetimiOlustur = ({ maksimum = null } = {}) => {
    const aktif = new Map();
    return {
        yerAyir(model) {
            const ayar = Number(maksimum ?? process.env.GEMINI_ORTAK_MAKS_ESZAMANLI_ISTEK ?? 2);
            const sinir = Number.isInteger(ayar) && ayar > 0 ? Math.min(20, ayar) : 2;
            if ((aktif.get(model) || 0) >= sinir) {
                throw Object.assign(new Error("Yapay zekâ işlemleri şu anda yoğun. Biraz sonra yeniden deneyin."), {
                    status: 429, kod: "GEMINI_ISTEK_YOGUNLUGU", yerelSinir: true,
                });
            }
            aktif.set(model, (aktif.get(model) || 0) + 1);
            let birakildi = false;
            return () => {
                if (birakildi) return;
                birakildi = true;
                const kalan = (aktif.get(model) || 1) - 1;
                if (kalan) aktif.set(model, kalan);
                else aktif.delete(model);
            };
        },
    };
};

export const ortakGeminiIstekYonetimi = geminiOrtakIstekYonetimiOlustur();

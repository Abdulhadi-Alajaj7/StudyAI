const durumBilgisiOlustur = ({ bekleyen, basarisiz }) => ({
    durum: bekleyen > 0 ? "kaydediliyor" : basarisiz.size > 0 ? "hata" : "kaydedildi",
    bekleyen,
    basarisizAnahtarlar: [...basarisiz.keys()],
    sonHata: [...basarisiz.values()].at(-1) || null,
});

export const testKayitKuyruguOlustur = ({ onDurumDegisti } = {}) => {
    const kuyruklar = new Map();
    const sonGorevler = new Map();
    const basarisiz = new Map();
    let bekleyen = 0;
    let dinleyici = onDurumDegisti;

    const bildir = () => {
        dinleyici?.(durumBilgisiOlustur({ bekleyen, basarisiz }));
    };

    const ekle = (anahtar, gorev) => {
        if (!anahtar || typeof gorev !== "function") {
            throw new TypeError("Kayıt kuyruğu için anahtar ve görev gereklidir.");
        }
        sonGorevler.set(anahtar, gorev);
        const onceki = kuyruklar.get(anahtar) || Promise.resolve();
        bekleyen += 1;
        bildir();

        const islem = onceki
            .then(() => gorev())
            .then(
                (deger) => {
                    basarisiz.delete(anahtar);
                    return { basarili: true, deger };
                },
                (hata) => {
                    basarisiz.set(anahtar, hata);
                    return { basarili: false, hata };
                }
            )
            .finally(() => {
                bekleyen -= 1;
                if (kuyruklar.get(anahtar) === islem) kuyruklar.delete(anahtar);
                bildir();
            });

        kuyruklar.set(anahtar, islem);
        return islem;
    };

    const bekle = async () => {
        while (kuyruklar.size > 0) {
            await Promise.all([...kuyruklar.values()]);
        }
        return durumBilgisiOlustur({ bekleyen, basarisiz });
    };

    const yenidenDene = async () => {
        const anahtarlar = [...basarisiz.keys()];
        if (anahtarlar.length === 0) return bekle();
        for (const anahtar of anahtarlar) {
            const gorev = sonGorevler.get(anahtar);
            if (gorev) ekle(anahtar, gorev);
        }
        return bekle();
    };

    return {
        ekle,
        bekle,
        yenidenDene,
        durum() {
            return durumBilgisiOlustur({ bekleyen, basarisiz });
        },
        bildirimiKapat() {
            dinleyici = null;
        },
    };
};

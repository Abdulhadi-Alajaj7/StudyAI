export const MAKSIMUM_DOSYA_SAYISI = 3;
export const DOSYA_BOYUT_SINIRLARI = {
    pdf: { bayt: 2 * 1024 * 1024, etiket: "2 MB" },
    pptx: { bayt: 2 * 1024 * 1024, etiket: "2 MB" },
    docx: { bayt: 1024 * 1024, etiket: "1 MB" },
    txt: { bayt: 50 * 1024, etiket: "50 KB" }
};
const DESTEKLENEN_UZANTILAR = new Set(Object.keys(DOSYA_BOYUT_SINIRLARI));

const dosyaAnahtari = (dosya) => (
    `${dosya.name.toLocaleLowerCase("tr-TR")}::${dosya.size}::${dosya.lastModified || 0}`
);

export const materyalDosyalariniDogrula = (dosyaListesi, mevcutSayi = 0) => {
    const dosyalar = Array.from(dosyaListesi || []);
    const kalan = Math.max(0, MAKSIMUM_DOSYA_SAYISI - mevcutSayi);
    if (dosyalar.length > kalan) {
        return {
            gecerliDosyalar: [],
            hatalar: [kalan === 0
                ? `Ders başına en fazla ${MAKSIMUM_DOSYA_SAYISI} materyal yükleyebilirsiniz. Yeni dosya yüklemek için mevcut bir materyali silin.`
                : `Ders başına en fazla ${MAKSIMUM_DOSYA_SAYISI} materyal yükleyebilirsiniz. En fazla ${kalan} dosya daha yükleyebilirsiniz.`]
        };
    }

    const gorulenler = new Set();
    const gecerliDosyalar = [];
    const hatalar = [];

    for (const dosya of dosyalar) {
        const uzanti = dosya.name.split(".").pop()?.toLowerCase() || "";
        const anahtar = dosyaAnahtari(dosya);

        if (gorulenler.has(anahtar)) {
            hatalar.push(`${dosya.name}: Aynı dosya seçimde birden fazla kez bulundu.`);
            continue;
        }
        gorulenler.add(anahtar);

        if (!DESTEKLENEN_UZANTILAR.has(uzanti)) {
            hatalar.push(`${dosya.name}: Bu dosya türü desteklenmiyor.`);
            continue;
        }
        const sinir = DOSYA_BOYUT_SINIRLARI[uzanti];
        if (dosya.size > sinir.bayt) {
            hatalar.push(`${dosya.name}: ${uzanti.toUpperCase()} dosyaları en fazla ${sinir.etiket} olabilir.`);
            continue;
        }

        gecerliDosyalar.push(dosya);
    }

    return { gecerliDosyalar, hatalar };
};

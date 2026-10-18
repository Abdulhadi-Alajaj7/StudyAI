export const MAKSIMUM_DOSYA_SAYISI = 10;
export const MAKSIMUM_DOSYA_BOYUTU = 50 * 1024 * 1024;
export const DESTEKLENEN_UZANTILAR = new Set(["pdf", "docx", "pptx", "txt"]);

const dosyaAnahtari = (dosya) => (
    `${dosya.name.toLocaleLowerCase("tr-TR")}::${dosya.size}::${dosya.lastModified || 0}`
);

export const materyalDosyalariniDogrula = (dosyaListesi) => {
    const dosyalar = Array.from(dosyaListesi || []);
    if (dosyalar.length > MAKSIMUM_DOSYA_SAYISI) {
        return {
            gecerliDosyalar: [],
            hatalar: [`Tek seferde en fazla ${MAKSIMUM_DOSYA_SAYISI} dosya yükleyebilirsiniz.`]
        };
    }

    const gorulenler = new Set();
    const gecerliDosyalar = [];
    const hatalar = [];

    for (const dosya of dosyalar) {
        const uzanti = dosya.name.split(".").pop()?.toLocaleLowerCase("tr-TR") || "";
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
        if (dosya.size > MAKSIMUM_DOSYA_BOYUTU) {
            hatalar.push(`${dosya.name}: Dosya izin verilen 50 MB boyut sınırını aşıyor.`);
            continue;
        }

        gecerliDosyalar.push(dosya);
    }

    return { gecerliDosyalar, hatalar };
};

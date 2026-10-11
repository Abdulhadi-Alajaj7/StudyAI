
/**
 * Konu başlıklarını karşılaştırma için normalize eder.
 * Veritabanındaki gerçek başlıkları değiştirmez.
 */
export const konuBasliginiNormalizeEt = (baslik = "") => {
    return String(baslik)
        .normalize("NFKC")
        .toLocaleLowerCase("tr-TR")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
};

/**
 * Eski ve yeni konular arasında güvenli kimlik eşleştirmesi.
 *
 * Aynı başlığa sahip konular eski kimliklerini korur.
 * Belirsiz eşleşmeler otomatik olarak kabul edilmez.
 */
export const eskiKonuKimliginiBul = (
    yeniKonu,
    eskiKonular = [],
    kullanilanKimlikler = new Set()
) => {
    const yeniBaslik = konuBasliginiNormalizeEt(
        yeniKonu?.baslik
    );

    if (!yeniBaslik) {
        return null;
    }

    const eslesenler = eskiKonular.filter((eskiKonu) => {
        if (!eskiKonu?.konuId) {
            return false;
        }

        if (kullanilanKimlikler.has(eskiKonu.konuId)) {
            return false;
        }

        return (
            konuBasliginiNormalizeEt(eskiKonu.baslik) ===
            yeniBaslik
        );
    });

    // Birden fazla eşleşme varsa yanlış ID atama.
    if (eslesenler.length !== 1) {
        return null;
    }

    return eslesenler[0].konuId;
};

/**
 * Konu başına sayı hedefi yerine ders metninde kartlarla henüz kapsanmamış,
 * gerçekten önemli kavramları seçer. Gemini aday üretir; Backend yalnızca
 * doğrulanabilir konu ve kaynak kodlarını kabul eder.
 */
const normalize = (value) => String(value ?? "").toLocaleLowerCase("tr-TR")
    .normalize("NFKC").replace(/\s+/g, " ").trim();

export const eksikOnemliNoktalariDogrula = ({
    adaylar, konular, kaynaklar, kartlar = [], ustSinir = 8, azami = 6,
}) => {
    if (!Array.isArray(adaylar)) return [];
    const konularMap = new Set(konular.map((konu) => String(konu.konuId)));
    const kaynakMap = new Set(kaynaklar.map((kaynak) => String(kaynak.kod)));
    const sayilar = new Map();
    for (const kart of kartlar) {
        const id = String(kart.konuId);
        sayilar.set(id, (sayilar.get(id) || 0) + 1);
    }
    const gorulen = new Set();
    const sonuc = [];
    for (const aday of adaylar) {
        const konuId = String(aday?.konuId || "");
        const bilgi = typeof aday?.bilgi === "string" ? aday.bilgi.trim().slice(0, 280) : "";
        const onem = Number(aday?.onem);
        const kaynakKodlari = Array.isArray(aday?.kaynakKodlari)
            ? [...new Set(aday.kaynakKodlari.map((k) => String(k)))] : [];
        // Yalnızca 4-5 düzeyindeki önemli, gerçek kaynaklara bağlanmış eksikler.
        // Konunun kart sayısı 1-2 veya 3-7 olabilir; sayı eşik olarak kullanılmaz.
        if (!konularMap.has(konuId) || bilgi.length < 12 ||
            !Number.isInteger(onem) || onem < 4 || onem > 5 ||
            !kaynakKodlari.length || kaynakKodlari.some((kod) => !kaynakMap.has(kod)) ||
            (sayilar.get(konuId) || 0) >= ustSinir) continue;
        const anahtar = konuId + ":" + normalize(bilgi);
        if (gorulen.has(anahtar)) continue;
        gorulen.add(anahtar);
        sonuc.push({ konuId, bilgi, kaynakKodlari, onem });
        if (sonuc.length >= azami) break;
    }
    return sonuc;
};

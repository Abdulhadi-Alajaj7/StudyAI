export const kartMetniniNormalizeEt = metin => String(metin || "").normalize("NFKC")
    .toLocaleLowerCase("tr-TR").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const kisaTerimler = new Set(["ip", "ai", "ml", "os", "db", "go", "js", "c", "r", "io"]);
const duraklar = new Set("nedir neden nasil nasıl hangi hangisi bir bu şu için ile olan olarak ve veya ne hangi göre temel açıklayınız açıklayın boşluğu tamamlayın".split(" "));
export const kartKelimeleri = metin => new Set(kartMetniniNormalizeEt(metin).split(" ")
    .filter(k => (k.length > 2 || kisaTerimler.has(k)) && !duraklar.has(k)));
const ortusme = (sol, sag) => [...sol].filter(k => [...sag].some(s => s === k || (Math.min(s.length, k.length) >= 5 && (s.startsWith(k) || k.startsWith(s))))).length;

export const kartlarBenzerMi = (sol, sag) => {
    if (kartMetniniNormalizeEt(sol.soru) === kartMetniniNormalizeEt(sag.soru)) return true;
    // Ortak cevap, farklı konulardaki ayrı öğrenme hedeflerini tek başına
    // birleştiremez. Tam soru ve özgün kanıt tekrarları ayrıca denetlenir.
    if (sol.konuId && sag.konuId && sol.konuId !== sag.konuId) return false;
    // Ortak soru kalıbı farklı kavramları tek başına tekrar yapmaz (LIFO/FIFO).
    // Aynı soru yine reddedilir; yaklaşık soru eşleşmesi aynı cevabı da gerektirir.
    if (kartMetniniNormalizeEt(sol.cevap) !== kartMetniniNormalizeEt(sag.cevap)) return false;
    const a = kartKelimeleri(sol.soru), b = kartKelimeleri(sag.soru);
    if (a.size && b.size && ortusme(a, b) / Math.max(a.size, b.size) >= 0.8) return true;
    const tumA = kartKelimeleri(`${sol.soru} ${sol.cevap}`), tumB = kartKelimeleri(`${sag.soru} ${sag.cevap}`);
    return tumA.size >= 3 && tumB.size >= 3 && ortusme(tumA, tumB) / Math.max(tumA.size, tumB.size) >= 0.85;
};

export const kartYanitiniDogrula = (veri, { konuId, kartSayisi, kaynaklar, oncekiKartlar = [] }) => {
    const hata = (dogrulamaAltKodu, kartIndex = null) => Object.assign(new Error("Üretilen çalışma kartları kaynaklarıyla doğrulanamadı. Eksik konuları yeniden deneyebilirsiniz."), {
        status: 502, kod: "KART_GECERSIZ_YANIT",
        tanilama: { asama: "KART_DOGRULAMA", dogrulamaAltKodu, kartIndex,
            beklenenKartSayisi: kartSayisi, uretilenKartSayisi: Array.isArray(veri?.kartlar) ? veri.kartlar.length : 0 },
    });
    if (!Array.isArray(veri?.kartlar) || veri.kartlar.length !== kartSayisi) throw hata("KART_SAYISI");
    const dogrulanan = [];
    for (const [index, kart] of veri.kartlar.entries()) {
        if (kart?.konuId !== konuId) throw hata("KONU_KIMLIGI", index);
        if (!["soru", "cevap", "alinti", "kaynakReferansi"].every(k => typeof kart[k] === "string" && kart[k].trim())) throw hata("KART_ALANLARI", index);
        const kaynak = kaynaklar.find(k => k.anahtar === kart.kaynakReferansi);
        const alinti = kartMetniniNormalizeEt(kart.alinti), cevap = kartMetniniNormalizeEt(kart.cevap);
        // Cevap kaynak alıntısından alınır; modelin desteksiz ek bilgi yazmasına izin verilmez.
        if (!kaynak) throw hata("KAYNAK_REFERANSI", index);
        if (kart.soru.length > 400) throw hata("SORU_UZUNLUGU", index);
        if (kart.cevap.length > 800) throw hata("CEVAP_UZUNLUGU", index);
        if (kart.alinti.length > 1600) throw hata("ALINTI_UZUNLUGU", index);
        if (!alinti || !(` ${kartMetniniNormalizeEt(kaynak.icerik)} `).includes(` ${alinti} `)) throw hata("ALINTI_KAYNAKTA_YOK", index);
        if (!cevap || !(` ${alinti} `).includes(` ${cevap} `)) throw hata("CEVAP_ALINTIDA_YOK", index);
        if (!ortusme(kartKelimeleri(kart.soru), kartKelimeleri(alinti))) throw hata("SORU_KAYNAK_ILISKISI", index);
        if ([...oncekiKartlar, ...dogrulanan].some(onceki => kartlarBenzerMi(onceki, kart))) throw hata("TEKRAR_KART", index);
        dogrulanan.push({ konuId, soru: kart.soru.trim(), cevap: kart.cevap.trim(), kaynak: {
            materyalId: kaynak.materyalId, islemeId: kaynak.islemeId, parcaIndex: kaynak.parcaIndex,
            dosyaAdi: kaynak.dosyaAdi, alinti: kart.alinti.trim(),
        } });
    }
    return dogrulanan;
};

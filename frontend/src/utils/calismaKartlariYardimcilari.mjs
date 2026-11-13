export const kartGorunumleri = [
    { deger: "tum", etiket: "Tüm Kartlar", alan: "toplam" },
    { deger: "gorulmeyen", etiket: "Görülmeyen Kartlar", alan: "gorulmeyen" },
    { deger: "gorulen", etiket: "Görülen Kartlar", alan: "gorulen" },
    { deger: "yildizli", etiket: "Yıldızlı Kartlar", alan: "yildizli" },
];
export const kartlariFiltrele = (kartlar, secim, konular = []) => {
    const izinli = secim.anaKonuId ? new Set(konular.filter(k => k.anaKonuId === secim.anaKonuId).map(k => k.konuId)) : null;
    return kartlar.filter(k => (!secim.konuId || k.konuId === secim.konuId) && (!izinli || izinli.has(k.konuId)) &&
        (secim.gorunum === "gorulen" ? k.goruldu : secim.gorunum === "gorulmeyen" ? !k.goruldu : secim.gorunum === "yildizli" ? k.yildizli : true));
};
export const kartIstatistikleriniHesapla = kartlar => ({
    toplam: kartlar.length, gorulen: kartlar.filter(k => k.goruldu).length,
    gorulmeyen: kartlar.filter(k => !k.goruldu).length, yildizli: kartlar.filter(k => k.yildizli).length,
});
export const kartDurumunuUygula = (veri, kartId, durum) => {
    const kartlar = veri.kartlar.map(k => k._id === kartId ? { ...k, goruldu: Boolean(durum.gorulduTarihi), yildizli: Boolean(durum.yildizli) } : k);
    return { ...veri, kartlar, istatistikler: kartIstatistikleriniHesapla(kartlar) };
};
export const kartKonulariniGrupla = konular => {
    const gruplar = new Map();
    for (const konu of konular) {
        if (!gruplar.has(konu.anaKonuId)) gruplar.set(konu.anaKonuId, { konuId: konu.anaKonuId, baslik: konu.anaBaslik, kartSayisi: 0, altKonular: [] });
        const grup = gruplar.get(konu.anaKonuId);
        grup.kartSayisi += konu.kartSayisi; grup.altKonular.push(konu);
    }
    return [...gruplar.values()];
};
// Filtreye artık uymasa bile açık kart, kullanıcı ilerleyene kadar ekranda kalır.
export const acikKartiKoru = (liste, aktifKart) => aktifKart && !liste.some(k => k._id === aktifKart._id) ? [aktifKart, ...liste] : liste;

export const kartKonuDurumMesaji = konu => {
    if (konu.tamamlandi && !konu.kartSayisi) return konu.sifirKartNedeni === "kavramlar_zaten_kapsandi"
        ? "Bu konunun kavramları mevcut kartlarda yer alıyor." : "Kaynaklarda ayrı kart gerektiren bir öğrenme ifadesi belirlenmedi.";
    if (konu.sifirKartNedeni === "kaynak_yok") return "Konuya uygun kaynak bulunamadı.";
    if (konu.sifirKartNedeni === "kanit_yetersiz") return "Kaynakta doğrulanabilir kısa kanıt bulunamadı.";
    if (konu.sifirKartNedeni === "uretim_basarisiz") return "Üretim tamamlanamadı; yeniden denenebilir.";
    if (konu.sifirKartNedeni === "dogrulama_basarisiz") return "Üretilen kartların kaynak doğrulaması başarısız oldu.";
    if (konu.tamamlandi) return `${konu.kartSayisi} kart hazır.`;
    return `${konu.kartSayisi || 0} kart hazır${konu.eksikKartSayisi ? `; ${konu.eksikKartSayisi} kavram bekliyor` : "; konu işlenmeyi bekliyor"}.`;
};

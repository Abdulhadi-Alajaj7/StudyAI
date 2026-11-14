/**
 * Çalışma kartı planı: tek konuda en çok 8 kart, ders genelinde sabit sınır yok.
 * Bu modül veritabanından ve Gemini istemcisinden bağımsızdır.
 */
export const konuListesiOlustur = (harita) => (harita?.anaKonular || []).flatMap((ana) => {
    const altKonular = ana.altKonular || [];
    return (altKonular.length ? altKonular : [ana]).map((konu) => ({
        konuId: konu.konuId,
        baslik: konu.baslik,
        sorgu: [ana.baslik, ana.aciklama, konu.baslik, konu.aciklama].filter(Boolean).join(" "),
        kaynakMateryalIds: konu.kaynakMateryalIds?.length
            ? konu.kaynakMateryalIds
            : (ana.kaynakMateryalIds || []),
    }));
});

export const makulKartSayisiniBelirle = ({ konuSayisi, karakterSayisi }) => {
    if (!konuSayisi || karakterSayisi < 80) return 0;
    return Math.max(1, Math.min(konuSayisi * 8, Math.ceil(karakterSayisi / 1100)));
};

export const konuKotalariniBelirle = (konular, hedef) => {
    const uygun = konular.filter((konu) => konu.parcalar.length && konu.karakterSayisi >= 80);
    const adetler = new Map(uygun.map((konu) => [konu.konuId, 0]));
    const azami = Math.min(hedef, uygun.length * 8);
    for (let i = 0; i < azami; i += 1) {
        const adaylar = uygun.filter((konu) => adetler.get(konu.konuId) < 8)
            .sort((a, b) => (
                adetler.get(a.konuId) / a.karakterSayisi -
                adetler.get(b.konuId) / b.karakterSayisi ||
                String(a.konuId).localeCompare(String(b.konuId))
            ));
        if (!adaylar.length) break;
        adetler.set(adaylar[0].konuId, adetler.get(adaylar[0].konuId) + 1);
    }
    return uygun.map((konu) => ({ ...konu, adet: adetler.get(konu.konuId) }))
        .filter((konu) => konu.adet > 0);
};

/**
 * Aynı kaynağı birden fazla konuya gönderirken konuya ait benzersiz K kodları
 * tanımlar. İçeriği konu başına dengeli ve küçük tutmak TPM tüketimini azaltır.
 */
export const partiKaynaklariniOlustur = (konular, materyalAdlari, parcalariSec, karakterButcesi = 4500) => {
    let kaynakNo = 0;
    return konular.map((konu) => {
        // Eşleşme puanına göre ilk iki parça mutlaka değerlendirilir;
        // kalan boşluk farklı materyal bölümlerinden dengeli tamamlanır.
        const sirali = [...konu.parcalar.slice(0, 2), ...parcalariSec(konu.parcalar, karakterButcesi)];
        const gorulen = new Set();
        let kalan = karakterButcesi;
        const kaynaklar = [];
        for (const parca of sirali) {
            if (kaynaklar.length >= 8 || kalan < 90) break;
            const anahtar = String(parca.materyalId) + ":" + String(parca.parcaIndex);
            if (gorulen.has(anahtar)) continue;
            gorulen.add(anahtar);
            const icerik = String(parca.icerik || "").trim().slice(0, Math.min(2400, kalan));
            if (icerik.length < 70) continue;
            kalan -= icerik.length;
            kaynaklar.push({
                kod: "K" + (++kaynakNo),
                materyalId: parca.materyalId,
                parcaIndex: parca.parcaIndex,
                dosyaAdi: materyalAdlari.get(String(parca.materyalId)) || "Materyal",
                icerik,
            });
        }
        return { konuId: konu.konuId, baslik: konu.baslik, adet: konu.adet, kaynaklar };
    }).filter((konu) => konu.kaynaklar.length > 0);
};

export const kartAdaylariniDogrula = ({ cevap, konular, mevcutSorular = new Set() }) => {
    const konuHaritasi = new Map(konular.map((konu) => [String(konu.konuId), {
        konu, kodlar: new Map(konu.kaynaklar.map((kaynak) => [kaynak.kod, kaynak])), sayi: 0,
    }]));
    const kaynakSahipleri = new Map();
    for (const konu of konular) {
        for (const kaynak of konu.kaynaklar) {
            kaynakSahipleri.set(String(kaynak.kod), String(konu.konuId));
        }
    }
    const sonuc = [];
    for (const kart of Array.isArray(cevap?.kartlar) ? cevap.kartlar : []) {
        if (!kart || typeof kart !== "object") continue;
        const kodlar = Array.isArray(kart.kaynakKodlari) ? [...new Set(kart.kaynakKodlari)] : [];
        const kodSahipleri = [...new Set(kodlar.map((kod) => kaynakSahipleri.get(String(kod))).filter(Boolean))];
        let konuId = String(kart.konuId || "");
        // Kaynak tek konuya işaret ediyorsa unutulan konu kimliğini güvenle çıkar.
        if (!konuHaritasi.has(konuId) && kodSahipleri.length === 1) konuId = kodSahipleri[0];
        if (kodSahipleri.length > 1 || (kodSahipleri.length && kodSahipleri[0] !== konuId)) continue;
        const kayit = konuHaritasi.get(konuId);
        if (!kayit || kayit.sayi >= Math.min(8, kayit.konu.adet)) continue;
        const soru = typeof kart.soru === "string" ? kart.soru.trim().slice(0, 1000) : "";
        const cevapMetni = typeof kart.cevap === "string" ? kart.cevap.trim().slice(0, 2000) : "";
        const referanslar = kodlar.map((kod) => kayit.kodlar.get(String(kod))).filter(Boolean);
        if (!soru || !cevapMetni || !referanslar.length) continue;
        const anahtar = konuId + ":" + soru.toLocaleLowerCase("tr-TR");
        if (mevcutSorular.has(anahtar)) continue;
        mevcutSorular.add(anahtar);
        kayit.sayi += 1;
        sonuc.push({
            konuId, konuBasligi: kayit.konu.baslik, soru, cevap: cevapMetni,
            uretimYontemi: "gemini",
            kaynaklar: referanslar.map((kaynak) => ({
                materyalId: kaynak.materyalId,
                dosyaAdi: kaynak.dosyaAdi,
                parcaIndex: kaynak.parcaIndex,
            })),
        });
    }
    return sonuc;
};

const kaynakKelimeleri = (metin) => String(metin || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9çğıöşü\s]/gi, " ")
    .split(/\s+/).filter((kelime) => kelime.length >= 4);
const genelKelimeler = new Set(["konusu", "hakkında", "dersi", "genel", "giriş", "temel", "hangi", "nedir", "olarak", "olan", "göre", "veri"]);

/**
 * Geçersiz Gemini yanıtından sonra yerel, kaynak cümlesiyle kanıtlanan tek kart.
 * Metinde konuya ilişkin tam cümle yoksa null; asla hayalî yanıt üretme.
 */
export const kaynakMetnindenYedekKartOlustur = (konu, mevcutSorular = new Set()) => {
    const kelimeler = [...new Set(kaynakKelimeleri(konu.baslik))].filter((x) => !genelKelimeler.has(x));
    const terimler = kelimeler.length ? kelimeler : [...new Set(kaynakKelimeleri(konu.baslik))];
    if (!terimler.length) return null;
    const adaylar = [];
    for (const kaynak of konu.kaynaklar || []) {
        const cumleler = String(kaynak.icerik || "").replace(/\s+/g, " ").split(/(?<=[.!?])\s+/u);
        for (const ham of cumleler) {
            const cumle = ham.trim();
            if (cumle.length < 45 || cumle.length > 310) continue;
            if (/konya teknik|bilgisayar mühendisliği|doç\.?\s*dr\.?|https?:\/\//i.test(cumle)) continue;
            if (!/[.!?]$/.test(cumle) || !/[a-zçğıöşü]{3,}/i.test(cumle)) continue;
            const sozcukler = new Set(kaynakKelimeleri(cumle));
            const eslesenler = terimler.filter((kelime) =>
                [...sozcukler].some((aday) =>
                    aday.startsWith(kelime.slice(0, Math.min(5, kelime.length)))));
            if (!eslesenler.length) continue;
            const skor = eslesenler.length * 10 + (cumle.length >= 70 ? 2 : 0) - Math.max(0, cumle.length - 210) / 30;
            adaylar.push({ cumle, kaynak, skor });
        }
    }
    adaylar.sort((a, b) => b.skor - a.skor);
    const soru = String(konu.baslik) + " konusunda kaynakta verilen temel açıklama nedir?";
    const anahtar = String(konu.konuId) + ":" + soru.toLocaleLowerCase("tr-TR");
    if (mevcutSorular.has(anahtar) || !adaylar.length) return null;
    const secilen = adaylar[0];
    mevcutSorular.add(anahtar);
    return {
        konuId: konu.konuId, konuBasligi: konu.baslik,
        soru, cevap: secilen.cumle, uretimYontemi: "kaynak",
        kaynaklar: [{
            materyalId: secilen.kaynak.materyalId,
            dosyaAdi: secilen.kaynak.dosyaAdi,
            parcaIndex: secilen.kaynak.parcaIndex,
        }],
    };
};

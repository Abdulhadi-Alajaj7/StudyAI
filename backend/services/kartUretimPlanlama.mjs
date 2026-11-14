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
export const partiKaynaklariniOlustur = (konular, materyalAdlari, parcalariSec, karakterButcesi = 7000) => {
    let kaynakNo = 0;
    return konular.map((konu) => {
        const secilenler = parcalariSec(konu.parcalar, karakterButcesi).slice(0, 12);
        const kaynaklar = secilenler.map((parca) => ({
            kod: "K" + (++kaynakNo),
            materyalId: parca.materyalId,
            parcaIndex: parca.parcaIndex,
            dosyaAdi: materyalAdlari.get(String(parca.materyalId)) || "Materyal",
            icerik: String(parca.icerik || "").slice(0, 4500),
        }));
        return {
            konuId: konu.konuId,
            baslik: konu.baslik,
            adet: konu.adet,
            kaynaklar,
        };
    }).filter((konu) => konu.kaynaklar.length > 0);
};

export const kartAdaylariniDogrula = ({ cevap, konular, mevcutSorular = new Set() }) => {
    const konularMap = new Map(konular.map((konu) => [String(konu.konuId), {
        konu,
        kodlar: new Map(konu.kaynaklar.map((kaynak) => [kaynak.kod, kaynak])),
        sayi: 0,
    }]));
    const sonuc = [];
    for (const kart of Array.isArray(cevap?.kartlar) ? cevap.kartlar : []) {
        const kayit = konularMap.get(String(kart?.konuId || ""));
        if (!kayit || kayit.sayi >= Math.min(8, kayit.konu.adet)) continue;
        const soru = typeof kart?.soru === "string" ? kart.soru.trim().slice(0, 1000) : "";
        const yanit = typeof kart?.cevap === "string" ? kart.cevap.trim().slice(0, 2000) : "";
        const referanslar = Array.isArray(kart?.kaynakKodlari)
            ? [...new Set(kart.kaynakKodlari)].map((kod) => kayit.kodlar.get(kod)).filter(Boolean)
            : [];
        if (!soru || !yanit || !referanslar.length) continue;
        const soruAnahtari = String(kayit.konu.konuId) + ":" + soru.toLocaleLowerCase("tr-TR");
        if (mevcutSorular.has(soruAnahtari)) continue;
        mevcutSorular.add(soruAnahtari);
        kayit.sayi += 1;
        sonuc.push({
            konuId: kayit.konu.konuId,
            konuBasligi: kayit.konu.baslik,
            soru,
            cevap: yanit,
            kaynaklar: referanslar.map((kaynak) => ({
                materyalId: kaynak.materyalId,
                dosyaAdi: kaynak.dosyaAdi,
                parcaIndex: kaynak.parcaIndex,
            })),
        });
    }
    return sonuc;
};

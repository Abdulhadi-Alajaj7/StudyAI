export const OZET_TURLERI = ["tum_ders", "materyal", "konu"];
export const OZET_UZUNLUKLARI = ["kisa", "orta", "uzun"];

export const ozetGirdisiOlustur = ({
    tur,
    uzunluk,
    materyalId = "",
    konuId = "",
}) => {
    if (!OZET_TURLERI.includes(tur) || !OZET_UZUNLUKLARI.includes(uzunluk)) {
        return null;
    }
    if (tur === "materyal") {
        return materyalId ? { tur, uzunluk, materyalId: String(materyalId) } : null;
    }
    if (tur === "konu") {
        return konuId ? { tur, uzunluk, konuId: String(konuId) } : null;
    }
    return { tur, uzunluk };
};

export const ozetSecimAnahtari = (dersId, girdi) => (
    girdi
        ? [
            String(dersId),
            girdi.tur,
            girdi.materyalId || girdi.konuId || "ders",
            girdi.uzunluk,
        ].join(":")
        : ""
);

export const kullanilabilirMateryalleriSec = (materyaller = []) => (
    materyaller.filter((materyal) => (
        materyal?.durum === "hazir" && materyal?.aktifIslemeId
    ))
);

export const konuSecenekleriniOlustur = (konuHaritasi) => {
    const secenekler = [];
    for (const anaKonu of konuHaritasi?.anaKonular || []) {
        if (anaKonu?.konuId && anaKonu?.baslik) {
            secenekler.push({
                konuId: String(anaKonu.konuId),
                baslik: anaKonu.baslik,
                etiket: anaKonu.baslik,
                tur: "ana_konu",
            });
        }
        for (const altKonu of anaKonu?.altKonular || []) {
            if (!altKonu?.konuId || !altKonu?.baslik) continue;
            secenekler.push({
                konuId: String(altKonu.konuId),
                baslik: altKonu.baslik,
                etiket: `${anaKonu.baslik} — ${altKonu.baslik}`,
                tur: "alt_konu",
            });
        }
    }
    return secenekler;
};

export const kaynakAdlariniGetir = (kaynaklar = []) => {
    const gorulen = new Set();
    const adlar = [];
    for (const kaynak of kaynaklar) {
        const dosyaAdi = typeof kaynak?.dosyaAdi === "string"
            ? kaynak.dosyaAdi.trim()
            : "";
        if (!dosyaAdi || gorulen.has(dosyaAdi)) continue;
        gorulen.add(dosyaAdi);
        adlar.push(dosyaAdi);
    }
    return adlar;
};

export const ozetSonucDurumunuBelirle = ({
    ozet,
    olusturuluyor = false,
    kayitliOzetYukleniyor = false,
}) => {
    if (ozet) return "icerik";
    if (olusturuluyor) return "olusturuluyor";
    if (kayitliOzetYukleniyor) return "kayitli_yukleniyor";
    return "bos";
};

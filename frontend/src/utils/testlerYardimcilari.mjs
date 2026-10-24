export const TEST_KAPSAMLARI = ["tum_ders", "materyal", "konu"];
export const TEST_SORU_SAYILARI = [5, 10, 15, 20];
export const TEST_ZORLUKLARI = ["kolay", "orta", "zor", "karisik"];

const kapsamEtiketleri = {
    tum_ders: "Tüm Ders",
    materyal: "Materyal",
    konu: "Konu",
};

const zorlukEtiketleri = {
    kolay: "Kolay",
    orta: "Orta",
    zor: "Zor",
    karisik: "Karışık",
};

const sinirla = (deger, alt, ust) => Math.min(Math.max(deger, alt), ust);

export const testOlusturmaGirdisiOlustur = ({
    kapsamTuru,
    soruSayisi,
    zorluk,
    materyalId = "",
    konuId = "",
}) => {
    const sayi = Number(soruSayisi);
    if (
        !TEST_KAPSAMLARI.includes(kapsamTuru) ||
        !TEST_SORU_SAYILARI.includes(sayi) ||
        !TEST_ZORLUKLARI.includes(zorluk)
    ) {
        return null;
    }

    if (kapsamTuru === "materyal") {
        return materyalId
            ? { kapsamTuru, soruSayisi: sayi, zorluk, materyalId: String(materyalId) }
            : null;
    }
    if (kapsamTuru === "konu") {
        return konuId
            ? { kapsamTuru, soruSayisi: sayi, zorluk, konuId: String(konuId) }
            : null;
    }
    return { kapsamTuru, soruSayisi: sayi, zorluk };
};

export const testOlusturmaButonuDevreDisiMi = ({
    sayfaYukleniyor,
    olusturuluyor,
    olusturmaGirdisi,
}) => Boolean(sayfaYukleniyor || olusturuluyor || !olusturmaGirdisi);

export const testKapsamEtiketi = (kapsamTuru) => (
    kapsamEtiketleri[kapsamTuru] || "Test"
);

export const testZorlukEtiketi = (zorluk) => (
    zorlukEtiketleri[zorluk] || "Belirtilmedi"
);

export const testHedefBilgisi = (
    test,
    { materyaller = [], konular = [], dersAdi = "" } = {}
) => {
    const kapsamTuru = test?.kapsamTuru;
    if (kapsamTuru === "materyal") {
        const materyal = materyaller.find(
            (oge) => String(oge?._id) === String(test?.materyalId || "")
        );
        const kaynakAdi = test?.sorular
            ?.flatMap((soru) => soru?.kaynaklar || [])
            .find((kaynak) => kaynak?.dosyaAdi)
            ?.dosyaAdi;
        const ad = materyal?.orijinalDosyaAdi || materyal?.dosyaAdi || kaynakAdi || "Materyal Testi";
        return { baslik: ad, kapsam: "Materyal" };
    }
    if (kapsamTuru === "konu") {
        const konu = konular.find(
            (oge) => String(oge?.konuId) === String(test?.konuId || "")
        );
        return {
            baslik: test?.konuBasligi || konu?.baslik || "Konu Testi",
            kapsam: "Konu",
        };
    }
    return {
        baslik: dersAdi ? `${dersAdi} — Genel Test` : "Tüm Ders Testi",
        kapsam: "Tüm Ders",
    };
};

export const testIlerlemeBilgisi = (test) => {
    const toplam = Number(test?.soruSayisi);
    if (!Number.isFinite(toplam) || toplam <= 0) return null;

    let cevaplanan = null;
    if (Number.isFinite(Number(test?.cevaplananSoruSayisi))) {
        cevaplanan = Number(test.cevaplananSoruSayisi);
    } else if (Number.isFinite(Number(test?.ilerleme?.cevaplananSoruSayisi))) {
        cevaplanan = Number(test.ilerleme.cevaplananSoruSayisi);
    } else if (test?.durum === "hazirlandi") {
        cevaplanan = 0;
    }

    if (cevaplanan === null) {
        return { toplam, cevaplanan: null, yuzde: null, biliniyor: false };
    }
    const guvenliCevaplanan = sinirla(Math.trunc(cevaplanan), 0, toplam);
    return {
        toplam,
        cevaplanan: guvenliCevaplanan,
        yuzde: Math.round((guvenliCevaplanan / toplam) * 100),
        biliniyor: true,
    };
};

export const basariOraniniGetir = (test) => {
    const oran = Number(test?.sonuc?.basariOrani);
    return Number.isFinite(oran) ? sinirla(oran, 0, 100) : null;
};

export const soruIndeksiniSinirla = (indeks, soruSayisi) => {
    const toplam = Number(soruSayisi);
    if (!Number.isInteger(toplam) || toplam <= 0) return 0;
    const deger = Number.isInteger(Number(indeks)) ? Number(indeks) : 0;
    return sinirla(deger, 0, toplam - 1);
};

export const testCozumOzetiniGetir = (test) => {
    const sorular = Array.isArray(test?.sorular) ? test.sorular : [];
    const cevaplanan = sorular.filter((soru) => soru?.ogrenciCevabi != null).length;
    const isaretli = sorular.filter((soru) => soru?.isaretli === true).length;
    return {
        toplam: sorular.length,
        cevaplanan,
        bos: sorular.length - cevaplanan,
        isaretli,
        yuzde: sorular.length > 0 ? Math.round((cevaplanan / sorular.length) * 100) : 0,
    };
};

export const soruSonucDurumunuGetir = (soru) => {
    if (soru?.ogrenciCevabi == null) return "bos";
    return soru.ogrenciCevabi === soru.dogruCevap ? "dogru" : "yanlis";
};

export const soruKaynakAdlariniGetir = (soru) => [...new Set(
    (soru?.kaynaklar || [])
        .map((kaynak) => typeof kaynak?.dosyaAdi === "string" ? kaynak.dosyaAdi.trim() : "")
        .filter(Boolean)
)];

export const tarihiBicimlendir = (tarih) => {
    if (!tarih) return "Tarih bilgisi yok";
    const deger = new Date(tarih);
    if (Number.isNaN(deger.getTime())) return "Tarih bilgisi yok";
    return new Intl.DateTimeFormat("tr-TR", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    }).format(deger);
};

const yolKimligi = (deger) => encodeURIComponent(String(deger));

export const testCozmeYolu = (dersId, testId) => (
    `/dersler/${yolKimligi(dersId)}/testler/${yolKimligi(testId)}/coz`
);

export const testSonucYolu = (dersId, testId) => (
    `/dersler/${yolKimligi(dersId)}/testler/${yolKimligi(testId)}/sonuc`
);

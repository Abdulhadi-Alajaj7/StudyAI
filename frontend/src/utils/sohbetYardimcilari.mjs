const kimlikMetni = (deger) => String(deger ?? "");

const DAHILI_REFERANS_TANIMI_DESENI = /^[ \t]*\[K[1-9]\d*(?:[ \t]*,[ \t]*K[1-9]\d*)*[ \t]*\][ \t]*:[^\r\n]*(?:\r?\n|$)/gm;
const DAHILI_ATIF_DESENI = /[ \t]*\[K[1-9]\d*(?:[ \t]*,[ \t]*K[1-9]\d*)*[ \t]*\](?:[ \t]*\([^\r\n)]*\))?[ \t]*/g;

const duzMetindekiAtiflariTemizle = (metin) => String(metin)
    .replace(DAHILI_REFERANS_TANIMI_DESENI, "")
    .replace(DAHILI_ATIF_DESENI, (eslesme, konum, tumMetin) => {
        const onceki = tumMetin[konum - 1] || "";
        const sonraki = tumMetin[konum + eslesme.length] || "";
        const ikiKelimeArasinda = /[\p{L}\p{N}\])]/u.test(onceki) && /[\p{L}\p{N}\[(]/u.test(sonraki);
        return ikiKelimeArasinda ? " " : "";
    });

export const dahiliKaynakAtiflariniTemizle = (icerik) =>
    duzMetindekiAtiflariTemizle(String(icerik || ""));

export const istemciIstekIdOlustur = (cryptoKaynak = globalThis.crypto) => {
    if (typeof cryptoKaynak?.randomUUID === "function") {
        return cryptoKaynak.randomUUID();
    }
    const rastgele = Math.random().toString(36).slice(2);
    return `sohbet-${Date.now().toString(36)}-${rastgele.padEnd(10, "0")}`;
};

export const mesajlariBirlestir = (mevcut = [], gelen = [], { basaEkle = false } = {}) => {
    const sirali = basaEkle ? [...gelen, ...mevcut] : [...mevcut, ...gelen];
    const harita = new Map();
    for (const mesaj of sirali) {
        if (!mesaj?._id) continue;
        harita.set(kimlikMetni(mesaj._id), mesaj);
    }
    return [...harita.values()].sort((sol, sag) => {
        const tarihFarki = new Date(sol.createdAt || 0) - new Date(sag.createdAt || 0);
        return tarihFarki || kimlikMetni(sol._id).localeCompare(kimlikMetni(sag._id));
    });
};

export const geciciMesajiSunucuMesajiylaDegistir = (mesajlar, istemciIstekId, sunucuMesaji) => {
    const geciciKimlik = `gecici-${istemciIstekId}`;
    const temiz = mesajlar.filter((mesaj) => kimlikMetni(mesaj._id) !== geciciKimlik);
    return mesajlariBirlestir(temiz, sunucuMesaji ? [sunucuMesaji] : []);
};

export const sohbetleriBirlestir = (mevcut = [], gelen = []) => {
    const harita = new Map(mevcut.filter(Boolean).map((sohbet) => [kimlikMetni(sohbet._id), sohbet]));
    for (const sohbet of gelen) {
        if (!sohbet?._id) continue;
        const anahtar = kimlikMetni(sohbet._id);
        harita.set(anahtar, { ...harita.get(anahtar), ...sohbet });
    }
    return [...harita.values()].sort((sol, sag) => (
        new Date(sag.sonMesajTarihi || sag.updatedAt || 0) -
        new Date(sol.sonMesajTarihi || sol.updatedAt || 0)
    ));
};

export const kaynakMateryalAdlari = (kaynaklar = []) => {
    const adlar = [];
    const gorulen = new Set();
    for (const kaynak of kaynaklar) {
        const ad = typeof kaynak?.materyalAdi === "string" ? kaynak.materyalAdi.trim() : "";
        if (!ad || gorulen.has(ad)) continue;
        gorulen.add(ad);
        adlar.push(ad);
    }
    return adlar;
};

export const mesajSaati = (tarih, locale = "tr-TR") => {
    const deger = new Date(tarih);
    if (Number.isNaN(deger.getTime())) return "";
    return new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(deger);
};

export const kullaniciDostuSohbetHatasi = (hata) => (
    hata?.kullaniciMesaji ||
    hata?.response?.data?.hata ||
    "İşlem tamamlanamadı. Bağlantınızı kontrol edip yeniden deneyin."
);

export const kaydirmaSondaMi = (eleman, esik = 96) => {
    if (!eleman) return true;
    return eleman.scrollHeight - eleman.scrollTop - eleman.clientHeight <= esik;
};

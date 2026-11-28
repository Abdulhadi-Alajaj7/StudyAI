const GUNLER = { zor: 1, orta: 2, kolay: 3 };
const TAKVIM = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Istanbul", year: "numeric", month: "numeric", day: "numeric",
});
const SAAT_FARKI = new Intl.DateTimeFormat("en", {
    timeZone: "Europe/Istanbul", timeZoneName: "longOffset",
});

const gunBaslangici = (tarih, eklenecekGun = 0) => {
    const { year, month, day } = Object.fromEntries(TAKVIM.formatToParts(tarih).map(({ type, value }) => [type, Number(value)]));
    const geceYarisi = Date.UTC(year, month - 1, day + eklenecekGun);
    const saatFarki = SAAT_FARKI.formatToParts(geceYarisi).find(parca => parca.type === "timeZoneName").value;
    const [, isaret, saat, dakika] = saatFarki.match(/^GMT([+-])(\d{2}):(\d{2})$/) || [];
    const dakikaFarki = saat ? (Number(saat) * 60 + Number(dakika)) * (isaret === "-" ? -1 : 1) : 0;
    return new Date(geceYarisi - dakikaFarki * 60_000);
};

const listedenCikarilacakMi = (ardisikKolaySayisi, zorluk) => zorluk === "kolay" && ardisikKolaySayisi === 1;

export const tekrarPlaniOlustur = (ardisikKolaySayisi, zorluk, simdi) => {
    if (listedenCikarilacakMi(ardisikKolaySayisi, zorluk)) return tekrarPlaniSifirla();
    return {
        zorluk, ardisikKolaySayisi: zorluk === "kolay" ? 1 : 0, sonTekrarTarihi: simdi,
        sonrakiTekrarTarihi: gunBaslangici(simdi, GUNLER[zorluk])
    };
};

export const tekrarPlaniSifirla = () => ({
    zorluk: null, ardisikKolaySayisi: 0, sonTekrarTarihi: null, sonrakiTekrarTarihi: null
});

export const tekrarSecenekleriyleKart = (kart) => ({
    ...kart,
    ardisikKolaySayisi: kart.ardisikKolaySayisi ?? 0,
    tekrarSureleri: { ...GUNLER, kolay: listedenCikarilacakMi(kart.ardisikKolaySayisi, "kolay") ? null : GUNLER.kolay }
});

const tekrarVadesiGeldiMi = (kart, yarin) => kart.sonrakiTekrarTarihi != null && kart.sonrakiTekrarTarihi < yarin;

export const bekleyenTekrarSayisiniHesapla = (kartlar, simdi) => {
    const yarin = gunBaslangici(simdi, 1);
    return kartlar.filter(kart => tekrarVadesiGeldiMi(kart, yarin)).length;
};

export const gunlukTekrarlariGetir = async (KartModel, filtre, simdi) => {
    const bugun = gunBaslangici(simdi);
    const yarin = gunBaslangici(simdi, 1);
    const kayitlar = await KartModel.find({
        ...filtre,
        sonrakiTekrarTarihi: { $ne: null },
        $or: [
            { sonrakiTekrarTarihi: { $lt: yarin } },
            { sonTekrarTarihi: { $gte: bugun, $lt: yarin } }
        ]
    }).sort({ sonrakiTekrarTarihi: 1, _id: 1 }).lean();

    const kartlar = kayitlar.filter(kart => tekrarVadesiGeldiMi(kart, yarin))
        .map(tekrarSecenekleriyleKart);
    const tamamlanan = kayitlar.filter(kart => kart.sonTekrarTarihi >= bugun && kart.sonTekrarTarihi < yarin).length;
    return { kartlar, bekleyen: kartlar.length, tamamlanan, toplam: kartlar.length + tamamlanan };
};

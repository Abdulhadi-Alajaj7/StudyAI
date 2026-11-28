const GUNLER = [1, 3, 7, 14];
const ZORLUKLAR = ["zor", "orta", "kolay"];
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

const plan = (seviye, zorluk) => {
    const mevcut = GUNLER[seviye - 1] ? seviye : 1;
    const yeni = zorluk === "zor" ? 1 : zorluk === "kolay" ? Math.min(mevcut + 1, GUNLER.length) : mevcut;
    return { seviye: yeni, gun: GUNLER[yeni - 1] };
};

export const tekrarPlaniOlustur = (seviye, zorluk, simdi) => {
    const sonuc = plan(seviye, zorluk);
    return {
        zorluk, tekrarSeviyesi: sonuc.seviye, sonTekrarTarihi: simdi,
        sonrakiTekrarTarihi: gunBaslangici(simdi, sonuc.gun)
    };
};

export const tekrarPlaniSifirla = () => ({
    zorluk: null, tekrarSeviyesi: 1, sonTekrarTarihi: null, sonrakiTekrarTarihi: null
});

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

    const kartlar = kayitlar.filter(kart => kart.sonrakiTekrarTarihi && kart.sonrakiTekrarTarihi < yarin)
        .map(kart => ({
            ...kart,
            tekrarSureleri: Object.fromEntries(ZORLUKLAR.map(zorluk => [zorluk, plan(kart.tekrarSeviyesi, zorluk).gun]))
        }));
    const tamamlanan = kayitlar.filter(kart => kart.sonTekrarTarihi >= bugun && kart.sonTekrarTarihi < yarin).length;
    return { kartlar, bekleyen: kartlar.length, tamamlanan, toplam: kartlar.length + tamamlanan };
};

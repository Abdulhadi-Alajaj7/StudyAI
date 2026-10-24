export const testlerIstegiGuncelMi = ({
    controller,
    aktifController,
    istekDersId,
    aktifDersId,
}) => Boolean(
    controller &&
    !controller.signal.aborted &&
    controller === aktifController &&
    istekDersId === aktifDersId
);

const reddedilmeMesaji = (
    sonuc,
    varsayilanMesaj,
    { istekIptalEdildiMi, hataMesajiOlustur }
) => {
    if (sonuc.status !== "rejected" || istekIptalEdildiMi(sonuc.reason)) return "";
    return hataMesajiOlustur(sonuc.reason, varsayilanMesaj);
};

export const testlerYuklemeSonucunuOlustur = (
    sonuclar,
    { istekIptalEdildiMi, hataMesajiOlustur }
) => {
    const [materyalSonucu, konuSonucu, devamSonucu, tamamlananSonucu] = sonuclar;

    return {
        materyaller: materyalSonucu.status === "fulfilled"
            ? materyalSonucu.value.data?.materyaller || []
            : [],
        konuHaritasi: konuSonucu.status === "fulfilled"
            ? konuSonucu.value.data?.harita || null
            : null,
        devamEdenTestler: devamSonucu.status === "fulfilled"
            ? devamSonucu.value.data?.testler || []
            : [],
        tamamlananTestler: tamamlananSonucu.status === "fulfilled"
            ? tamamlananSonucu.value.data?.testler || []
            : [],
        secenekHatalari: {
            materyal: reddedilmeMesaji(
                materyalSonucu,
                "Materyaller yüklenemedi.",
                { istekIptalEdildiMi, hataMesajiOlustur }
            ),
            konu: reddedilmeMesaji(
                konuSonucu,
                "Konular yüklenemedi.",
                { istekIptalEdildiMi, hataMesajiOlustur }
            ),
        },
        listeHatalari: {
            devam: reddedilmeMesaji(
                devamSonucu,
                "Devam eden testler yüklenemedi.",
                { istekIptalEdildiMi, hataMesajiOlustur }
            ),
            tamamlanan: reddedilmeMesaji(
                tamamlananSonucu,
                "Geçmiş testler yüklenemedi.",
                { istekIptalEdildiMi, hataMesajiOlustur }
            ),
        },
    };
};

import { embeddingleriUret, kosinusBenzerligi } from "./embeddingService.js";

const sayiyiSinirla = (deger, varsayilan) => {
    const sayi = Number(deger);
    return Number.isFinite(sayi) ? Math.max(0, Math.min(1, sayi)) : varsayilan;
};

const ayarlarGetir = () => ({
    minimumSkor: sayiyiSinirla(process.env.TEST_SORU_KONU_MIN_SKOR, 0.43),
    rakipFarki: sayiyiSinirla(process.env.TEST_SORU_KONU_RAKIP_FARKI, 0.06),
    rakipMinimumSkor: sayiyiSinirla(process.env.TEST_SORU_KONU_RAKIP_MIN_SKOR, 0.55),
});

const kimlik = (deger) => String(deger || "").trim();

const konuMetniOlustur = (konu) => [
    `Öğrenme konusu: ${konu.baslik || ""}.`,
    konu.aciklama ? `Öğrenme hedefi ve kapsamı: ${konu.aciklama}.` : "",
].filter(Boolean).join(" ");

const soruMetniOlustur = (soru) => {
    const dogruSecenek = (soru.secenekler || []).find(
        (secenek) => secenek.anahtar === soru.dogruCevap
    );
    return [
        `Soru: ${String(soru.metin || "").slice(0, 1_500)}`,
        `Ölçülen cevap: ${String(dogruSecenek?.metin || "").slice(0, 400)}`,
    ].join("\n");
};

export const dersKonulariniDogrulamaIcinGetir = (harita) => (
    (harita?.anaKonular || []).flatMap((anaKonu) => (
        Array.isArray(anaKonu.altKonular) && anaKonu.altKonular.length > 0
            ? anaKonu.altKonular
            : [anaKonu]
    ))
        .filter((konu) => kimlik(konu.konuId) && String(konu.baslik || "").trim())
        .map((konu) => ({
            konuId: kimlik(konu.konuId),
            baslik: String(konu.baslik || "").trim().slice(0, 250),
            aciklama: String(konu.aciklama || "").trim().slice(0, 500),
        }))
);

/**
 * Bağımsız konu denetimi: sorunun gerçekten ölçtüğü bilgiyle konuları
 * karşılaştırır. Kaynakların konu etiketleri veya modelin konuId beyanı,
 * doğrulama puanını belirlemek için kullanılmaz.
 *
 * Belirgin başka konu üstünlüğünde ya da çok düşük hedef benzerliğinde
 * soruyu reddederiz. Yakın puanlar belirsizdir ve yanlış pozitif üretmemek
 * için yalnızca teşhis edilir; semantik puan tek başına kesin kanıt değildir.
 */
export const testKonuDogrulayicisiOlustur = ({
    konular,
    embeddingUret = embeddingleriUret,
    benzerlikHesapla = kosinusBenzerligi,
    ayarlar = ayarlarGetir(),
} = {}) => {
    const benzersizKonular = [...new Map((konular || [])
        .filter((konu) => kimlik(konu.konuId))
        .map((konu) => [kimlik(konu.konuId), {
            konuId: kimlik(konu.konuId),
            baslik: String(konu.baslik || ""),
            aciklama: String(konu.aciklama || ""),
        }])
    ).values()];
    let konuVektorleriSozu = null;
    const soruVektorOnbellegi = new Map();

    const konuVektorleriniGetir = async () => {
        if (!konuVektorleriSozu) {
            konuVektorleriSozu = embeddingUret(
                benzersizKonular.map(konuMetniOlustur),
                { tur: "dokuman" }
            );
        }
        const vektorler = await konuVektorleriSozu;
        if (!Array.isArray(vektorler) || vektorler.length !== benzersizKonular.length) {
            throw new Error("Konu doğrulama embedding yanıtı eksik.");
        }
        return vektorler;
    };

    return async ({ sorular = [] } = {}) => {
        if (!sorular.length) return [];
        const vektorler = await konuVektorleriniGetir();
        const metinler = sorular.map(soruMetniOlustur);
        const yeniMetinler = [...new Set(metinler.filter((metin) => !soruVektorOnbellegi.has(metin)))];
        if (yeniMetinler.length) {
            const yeniVektorler = await embeddingUret(yeniMetinler, { tur: "sorgu" });
            if (!Array.isArray(yeniVektorler) || yeniVektorler.length !== yeniMetinler.length) {
                throw new Error("Soru doğrulama embedding yanıtı eksik.");
            }
            yeniMetinler.forEach((metin, index) => {
                soruVektorOnbellegi.set(metin, yeniVektorler[index]);
            });
        }

        return sorular.map((soru, index) => {
            const soruVektoru = soruVektorOnbellegi.get(metinler[index]);
            const sonuclar = benzersizKonular.map((konu, sira) => ({
                ...konu,
                skor: benzerlikHesapla(soruVektoru, vektorler[sira]),
            })).filter((konu) => Number.isFinite(konu.skor))
                .sort((sol, sag) => sag.skor - sol.skor);
            const hedefKonuId = kimlik(soru.konuId);
            const hedef = sonuclar.find((konu) => konu.konuId === hedefKonuId);
            const rakip = sonuclar.find((konu) => konu.konuId !== hedefKonuId);
            const hedefSkor = hedef?.skor ?? null;
            const rakipSkor = rakip?.skor ?? null;
            const yetersiz = hedefSkor == null || hedefSkor < ayarlar.minimumSkor;
            const belirginRakip = rakipSkor != null &&
                rakipSkor >= ayarlar.rakipMinimumSkor &&
                hedefSkor != null &&
                rakipSkor - hedefSkor >= ayarlar.rakipFarki;
            return {
                soruIndeksi: index,
                konuId: hedefKonuId,
                gecerli: !yetersiz && !belirginRakip,
                neden: belirginRakip ? "BASKA_KONU_BELIRGIN_USTUN"
                    : (yetersiz ? "HEDEF_BENZERLIK_DUSUK" : "UYGUN"),
                hedefSkor: hedefSkor == null ? null : Number(hedefSkor.toFixed(4)),
                rakipSkor: rakipSkor == null ? null : Number(rakipSkor.toFixed(4)),
                rakipKonuId: rakip?.konuId || "",
                rakipKonuBasligi: rakip?.baslik || "",
            };
        });
    };
};

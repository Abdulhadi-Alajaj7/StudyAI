import Ders from "../models/Ders.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { konuHakimiyetiniGetir } from "./konuHakimiyetService.js";
import { TestSistemiHatasi, testOlustur } from "./testService.js";

const kurallar = {
    yeterli_veri_yok: { zorluk: "orta", soruSayisi: 5, tanilayici: true },
    zayif: { zorluk: "kolay", soruSayisi: 10, tanilayici: false },
    gelistirilmeli: { zorluk: "orta", soruSayisi: 10, tanilayici: false },
    iyi: { zorluk: "zor", soruSayisi: 10, tanilayici: false },
};

export const adaptifTestOnerisiniGetir = async ({ dersId, kullaniciId }) => {
    if (!await Ders.exists({ _id: dersId, kullaniciId, temizleniyor: { $ne: true } })) {
        throw new TestSistemiHatasi("Ders bulunamadı veya bu ders için yetkiniz yok.", {
            status: 404, kod: "DERS_BULUNAMADI"
        });
    }
    const harita = await KonuHaritasi.findOne({ dersId, kullaniciId, durum: "hazir" })
        .select("anaKonular.altKonular.konuId anaKonular.altKonular.baslik").lean();
    const altKonular = (harita?.anaKonular || []).flatMap(ana => ana.altKonular || [])
        .filter(({ konuId }) => typeof konuId === "string" && konuId.length > 0 &&
            konuId.length <= 200 && konuId === konuId.trim());
    if (!altKonular.length) return null;

    const analiz = await konuHakimiyetiniGetir(dersId, kullaniciId);
    const hakimiyetler = new Map(analiz.map(konu => [konu.konuId, konu]));
    const adaylar = altKonular.map(({ konuId, baslik }) => {
        const hakimiyet = hakimiyetler.get(konuId);
        return hakimiyet && { konuId, konuBasligi: baslik, hakimiyet };
    }).filter(Boolean);
    // Kararlı sıralama, eşitlikte konu haritasının görüntülenme sırasını korur.
    adaylar.sort((a, b) => (a.hakimiyet.yuzde ?? -1) - (b.hakimiyet.yuzde ?? -1) ||
        a.hakimiyet.soruSayisi - b.hakimiyet.soruSayisi);
    const secilen = adaylar[0];
    return secilen ? { ...secilen, ...kurallar[secilen.hakimiyet.durum] } : null;
};

export const adaptifTestOlustur = async ({ dersId, kullaniciId }) => {
    const oneri = await adaptifTestOnerisiniGetir({ dersId, kullaniciId });
    if (!oneri) {
        throw new TestSistemiHatasi("Adaptif test için hazır konu haritasında uygun bir alt konu bulunamadı.", {
            status: 422, kod: "ADAPTIF_TEST_KONU_YOK"
        });
    }
    const { konuId, zorluk, soruSayisi } = oneri;
    return testOlustur({ dersId, kullaniciId, kapsamTuru: "konu", konuId, zorluk, soruSayisi, kaynak: "adaptif" });
};

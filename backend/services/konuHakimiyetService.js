import Test from "../models/Test.js";
import KonuHaritasi from "../models/KonuHaritasi.js";

const SON_SORU_SINIRI = 20;
const EN_AZ_SORU = 5;
const CEVAP_SECENEKLERI = new Set(["A", "B", "C", "D"]);

// Tekrar testleri eklendiğinde kaynak bilgisi burada kontrol edilerek
// tekrar denemeleri pencereyi ve sayımları etkilemeden dışlanabilir.
const hakimiyetSorusuMu = (soru) => (
    CEVAP_SECENEKLERI.has(soru.dogruCevap) &&
    (soru.ogrenciCevabi == null || CEVAP_SECENEKLERI.has(soru.ogrenciCevabi))
);

export const konuHakimiyetiniGetir = async (dersId, kullaniciId) => {
    const filtre = { dersId, kullaniciId };
    const harita = await KonuHaritasi.findOne(filtre).select("anaKonular.altKonular.konuId").lean();
    const sayimlar = new Map();
    for (const ana of harita?.anaKonular || []) {
        for (const { konuId } of ana.altKonular || []) {
            if (typeof konuId === "string" && konuId.trim() && !sayimlar.has(konuId)) {
                sayimlar.set(konuId, { konuId, soruSayisi: 0, dogruSayisi: 0, yanlisSayisi: 0, bosSayisi: 0 });
            }
        }
    }
    if (!sayimlar.size) return [];

    const testler = Test.find({
        ...filtre,
        durum: "tamamlandi",
        kaynak: { $ne: "tekrar" },
        "sorular.konuId": { $in: [...sayimlar.keys()] }
    })
        .select("sorular._id sorular.konuId sorular.dogruCevap sorular.ogrenciCevabi")
        .sort({ tamamlanmaTarihi: -1, _id: -1 })
        .lean()
        .cursor();

    const sayilanSorular = new Set();
    let bekleyenKonuSayisi = sayimlar.size;
    try {
        for await (const test of testler) {
            // Aynı testteki sorular kayıtlı sıra ile değerlendirilir.
            for (const soru of test.sorular || []) {
                const sayim = sayimlar.get(soru?.konuId);
                if (!sayim || sayim.soruSayisi === SON_SORU_SINIRI || !hakimiyetSorusuMu(soru)) continue;
                const soruId = soru._id == null ? null : String(soru._id);
                if (soruId != null) {
                    if (sayilanSorular.has(soruId)) continue;
                    sayilanSorular.add(soruId);
                }

                if (soru.ogrenciCevabi == null) sayim.bosSayisi++;
                else if (soru.ogrenciCevabi === soru.dogruCevap) sayim.dogruSayisi++;
                else sayim.yanlisSayisi++;
                if (++sayim.soruSayisi === SON_SORU_SINIRI) bekleyenKonuSayisi--;
            }
            if (bekleyenKonuSayisi === 0) break;
        }
    } finally {
        await testler.close();
    }

    return [...sayimlar.values()].map((sayim) => {
        const { soruSayisi, dogruSayisi } = sayim;
        const yuzde = soruSayisi < EN_AZ_SORU ? null : dogruSayisi * 100 / soruSayisi;
        const durum = yuzde === null ? "yeterli_veri_yok"
            : yuzde < 50 ? "zayif"
                : yuzde < 80 ? "gelistirilmeli" : "iyi";
        return { ...sayim, yuzde, durum };
    });
};

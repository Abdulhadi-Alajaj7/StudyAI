import test from "node:test";
import assert from "node:assert/strict";
import {
    geminiIleTestKalitesiniDenetle,
    geminiIleTestSorulariUret,
    testKalitesiDenetimIstemiOlustur,
} from "../services/geminiService.js";

const kanit = "Grafik oluşturmak yeterli değildir; dağılım ve ilişki problem bağlamında açıklanmalıdır.";
const soru = (metin = "Grafik hazırlarken hangi yaklaşım daha doğrudur?") => ({
    metin,
    secenekler: [
        { anahtar: "A", metin: "Yalnızca ortalamaya bakmak" },
        { anahtar: "B", metin: "Dağılımı ve ilişkiyi problem bağlamında yorumlamak" },
        { anahtar: "C", metin: "Korelasyonu nedensellik sanmak" },
        { anahtar: "D", metin: "Aykırı değerleri yok saymak" },
    ],
    dogruCevap: "B",
    aciklama: kanit,
    zorluk: "orta",
    konuId: "gorsellestirme",
    kaynakReferanslari: ["K1"],
    kaynakKanitlari: [{ kaynakReferansi: "K1", alinti: kanit }],
});

test("kalite denetçisi tüm seçenekleri, özgün kaynağı, doğru cevap anahtarını ve eski soruları görür", () => {
    const istem = testKalitesiDenetimIstemiOlustur({
        sorular: [soru("Grafik üretiminde yapılan hata hangisidir?")],
        oncekiSorular: [soru("Grafik veriyi nasıl açıklar?")],
        izinliKonuIds: [{
            konuId: "gorsellestirme",
            baslik: "Görselleştirme ile Veri Keşfi",
            aciklama: "Grafik yorumlama",
        }],
    });
    assert.match(istem, /Grafik üretiminde yapılan hata hangisidir/);
    assert.match(istem, /Grafik veriyi nasıl açıklar/);
    assert.match(istem, /Görselleştirme ile Veri Keşfi/);
    assert.match(istem, /BIRDEN_FAZLA_DOGRU/);
    assert.match(istem, /Yalnızca ortalamaya bakmak/);
    assert.match(istem, /Grafik oluşturmak yeterli değildir/);
});

test("ikinci Gemini denetimi yüksek güvenli çoklu cevabı ve kavram tekrarını reddeder", async () => {
    const istemler = [];
    const istemci = {
        models: { async generateContent({ contents }) {
            istemler.push(contents);
            return {
                text: JSON.stringify({ denetimler: [
                    { sira: 1, durum: "BIRDEN_FAZLA_DOGRU", guven: 0.97, gerekce: "B, C ve D seçenekleri hatadır." },
                    { sira: 2, durum: "KAVRAM_TEKRARI", guven: 0.96, gerekce: "Önceki soruyla aynı tanım." },
                    { sira: 3, durum: "BELIRSIZ", guven: 0.61, gerekce: "Kaynak dar." },
                ] }),
                candidates: [{ finishReason: "STOP" }],
            };
        } },
    };
    const denetim = await geminiIleTestKalitesiniDenetle({
        sorular: [soru("Grafik hatası hangisi?"), soru("IQR tanımı nedir?"), soru("Korelasyon neyi belirtir?")],
        izinliKonuIds: [{ konuId: "gorsellestirme", baslik: "Grafikler" }],
    }, { istemci });
    assert.equal(istemler.length, 1);
    assert.deepEqual(denetim.map((x) => x.gecerli), [false, false, true]);
    assert.deepEqual(denetim.map((x) => x.neden), [
        "BIRDEN_FAZLA_DOGRU", "KAVRAM_TEKRARI", "UYGUN",
    ]);
});

test("belirsiz veya düşük güvenli işaret, yanlış pozitif üretmeden not edilir", async () => {
    const istemci = { models: { async generateContent() {
        return { text: JSON.stringify({ denetimler: [
            { sira: 1, durum: "BIRDEN_FAZLA_DOGRU", guven: 0.73, gerekce: "Olası" },
        ] }) };
    } } };
    const sonuc = await geminiIleTestKalitesiniDenetle({ sorular: [soru()] }, { istemci });
    assert.equal(sonuc[0].gecerli, true);
});

test("ikinci denetimde reddedilen soru aynı partide tek soruluk onarımla değiştirilir", async () => {
    let uretimSayisi = 0;
    let kontrolSayisi = 0;
    const istemci = { models: { async generateContent({ contents }) {
        uretimSayisi += 1;
        const onarim = contents.includes("Geçersiz sorunun yerine tek yeni soru üret");
        return {
            text: JSON.stringify({ sorular: [soru(onarim
                ? "Grafikleri yorumlamanın doğru yolu nedir?"
                : "Grafik üretiminde yapılan hatalardan hangisidir?")] }),
            candidates: [{ finishReason: "STOP" }],
        };
    } } };
    const sonuc = await geminiIleTestSorulariUret({
        dersBilgisi: { dersAdi: "Uygulamalı Veri Bilimi" },
        kapsamTuru: "konu", hedefBasligi: "Keşifsel Veri Analizi",
        soruSayisi: 1, zorlukDagilimi: { orta: 1 },
        konuDagilimi: [{ konuId: "gorsellestirme", baslik: "Görselleştirme", adet: 1 }],
        kaynaklar: [{ anahtar: "K1", materyalId: "materyal1", parcaIndex: 0,
            dosyaAdi: "Hafta 2.pdf", konuIds: ["gorsellestirme"], icerik: kanit }],
        izinliKonuIds: [{ konuId: "gorsellestirme", baslik: "Görselleştirme ile Veri Keşfi" }],
        soruKalitesiDogrula: async ({ sorular }) => {
            kontrolSayisi += 1;
            return [{ soruIndeksi: 0, gecerli: sorular[0].metin.startsWith("Grafikleri"),
                neden: "BIRDEN_FAZLA_DOGRU" }];
        },
    }, {
        istemci, maxDeneme: 1, maksimumOnarimDenemesi: 2,
        maksimumKucultmeDerinligi: 0, timeoutMs: 5_000,
        bekle: async () => {},
    });
    assert.equal(uretimSayisi, 2);
    assert.equal(kontrolSayisi, 2);
    assert.match(sonuc.sorular[0].metin, /Grafikleri yorumlamanın/);
    assert.equal(sonuc.sorular[0].konuId, "gorsellestirme");
});

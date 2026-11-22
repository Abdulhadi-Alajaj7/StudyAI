import test from "node:test";
import assert from "node:assert/strict";
import { geminiIleTestSorulariUret } from "../services/geminiService.js";

const kaynakAlintisi = "Yığın veri yapısı LIFO ilkesiyle çalışır ve son giren eleman ilk çıkar.";

const soruYap = (onarimMi) => ({
    metin: onarimMi
        ? "Yığın veri yapısında son giren eleman hangi ilkeyle ilk çıkar?"
        : "Yığın veri yapısı elemanları hangi çalışma ilkesine göre işler?",
    secenekler: [
        { anahtar: "A", metin: "LIFO" },
        { anahtar: "B", metin: "FIFO" },
        { anahtar: "C", metin: "Rastgele erişim" },
        { anahtar: "D", metin: "Öncelikli sıralama" },
    ],
    dogruCevap: "A",
    aciklama: kaynakAlintisi,
    zorluk: "kolay",
    konuId: "yigin",
    kaynakReferanslari: ["K1"],
    kaynakKanitlari: [{ kaynakReferansi: "K1", alinti: kaynakAlintisi }],
});

test("bağımsız semantik konu kontrolü yalnızca uyumsuz sorunun onarımını tetikler", async () => {
    const istekler = [];
    const semantikDenetimler = [];
    const istemci = {
        models: {
            async generateContent({ contents }) {
                istekler.push(contents);
                const onarimMi = contents.includes("Geçersiz sorunun yerine tek yeni soru üret");
                return {
                    text: JSON.stringify({ sorular: [soruYap(onarimMi)] }),
                    candidates: [{ finishReason: "STOP" }],
                    usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 100, totalTokenCount: 200 },
                };
            },
        },
    };
    const sonuc = await geminiIleTestSorulariUret({
        dersBilgisi: { dersAdi: "Veri Yapıları" },
        kapsamTuru: "konu", hedefBasligi: "Yığın",
        soruSayisi: 1,
        zorlukDagilimi: { kolay: 1 },
        konuDagilimi: [{ konuId: "yigin", baslik: "Yığın", adet: 1 }],
        kaynaklar: [{
            anahtar: "K1", materyalId: "materyal1", parcaIndex: 0,
            dosyaAdi: "ders.pdf", konuIds: ["yigin"],
            icerik: kaynakAlintisi,
        }],
        izinliKonuIds: [{ konuId: "yigin", baslik: "Yığın", aciklama: "LIFO", konuTuru: "alt" }],
        soruKonuDogrula: async ({ sorular }) => {
            semantikDenetimler.push(sorular[0].metin);
            const gecerli = sorular[0].metin.includes("son giren");
            return [{
                soruIndeksi: 0, gecerli, konuId: "yigin",
                neden: gecerli ? "UYGUN" : "BASKA_KONU_BELIRGIN_USTUN",
                hedefSkor: gecerli ? 0.84 : 0.41,
                rakipSkor: gecerli ? 0.52 : 0.77,
                rakipKonuBasligi: "Kuyruk",
            }];
        },
    }, {
        istemci, maxDeneme: 1, maksimumOnarimDenemesi: 2,
        maksimumKucultmeDerinligi: 0, timeoutMs: 5_000,
        bekle: async () => {},
    });

    assert.equal(istekler.length, 2, "İlk üretim + yalnızca hatalı tek sorunun onarımı");
    assert.equal(semantikDenetimler.length, 2);
    assert.equal(sonuc.sorular.length, 1);
    assert.match(sonuc.sorular[0].metin, /son giren/);
    assert.deepEqual(sonuc.sorular[0].konuDogrulama, {
        hedefSkor: 0.84, rakipSkor: 0.52, rakipKonuBasligi: "Kuyruk",
    });
});

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

test("bir sorunun kalite onarımı başarısız olursa tamamlanan iki konu sorusu kısmi sunulur", async () => {
    const yiginAlinti = "Yığın veri yapısı LIFO ilkesiyle çalışır ve son giren eleman ilk çıkar.";
    const kuyrukAlinti = "Kuyruk veri yapısı FIFO ilkesiyle çalışır ve ilk giren eleman ilk çıkar.";
    const kaynaklar = [
        { anahtar: "K1", materyalId: "materyal1", parcaIndex: 0,
            dosyaAdi: "yigin.pdf", konuIds: ["yigin"], icerik: yiginAlinti },
        { anahtar: "K2", materyalId: "materyal2", parcaIndex: 0,
            dosyaAdi: "kuyruk.pdf", konuIds: ["kuyruk"], icerik: kuyrukAlinti },
    ];
    const soru = (tur) => ({
        metin: tur === "kuyruk"
            ? "Kuyruk veri yapısı hangi sırayla eleman çıkarır?"
            : "Yığın veri yapısında elemanlar hangi sırayla çıkarılır?",
        secenekler: [
            { anahtar: "A", metin: "LIFO" },
            { anahtar: "B", metin: "FIFO" },
            { anahtar: "C", metin: "Rastgele" },
            { anahtar: "D", metin: "Öncelikli" },
        ],
        dogruCevap: tur === "kuyruk" ? "B" : "A",
        aciklama: tur === "kuyruk" ? kuyrukAlinti : yiginAlinti,
        zorluk: "kolay",
        konuId: tur,
        kaynakReferanslari: [tur === "kuyruk" ? "K2" : "K1"],
        kaynakKanitlari: [{
            kaynakReferansi: tur === "kuyruk" ? "K2" : "K1",
            alinti: tur === "kuyruk" ? kuyrukAlinti : yiginAlinti,
        }],
    });
    let istekSayisi = 0;
    const istemci = { models: { async generateContent() {
        istekSayisi += 1;
        return { text: JSON.stringify({ sorular: [
            soru(istekSayisi === 2 ? "kuyruk" : "yigin"),
        ] }), candidates: [{ finishReason: "STOP" }] };
    } } };
    const sonuc = await geminiIleTestSorulariUret({
        dersBilgisi: { dersAdi: "Veri Yapıları" },
        kapsamTuru: "konu", hedefBasligi: "Veri Yapıları",
        soruSayisi: 3, zorlukDagilimi: { kolay: 3 },
        konuDagilimi: [
            { konuId: "yigin", baslik: "Yığın", adet: 2 },
            { konuId: "kuyruk", baslik: "Kuyruk", adet: 1 },
        ],
        kaynaklar,
        izinliKonuIds: [
            { konuId: "yigin", baslik: "Yığın", konuTuru: "alt" },
            { konuId: "kuyruk", baslik: "Kuyruk", konuTuru: "alt" },
        ],
        kismiSonucKabul: true,
        soruKalitesiDogrula: async () => [{
            soruIndeksi: 0,
            gecerli: istekSayisi !== 3,
            neden: istekSayisi === 3 ? "BIRDEN_FAZLA_DOGRU" : "UYGUN",
        }],
    }, {
        istemci, partiBoyutu: 1, maxDeneme: 1,
        maksimumOnarimDenemesi: 0, maksimumKucultmeDerinligi: 0,
        timeoutMs: 5_000, bekle: async () => {},
    });
    assert.equal(sonuc.sorular.length, 2);
    assert.equal(sonuc.kismiUretimNedeni, "KALITE_KONTROLU");
    assert.deepEqual(sonuc.sorular.map((oge) => oge.konuId), ["yigin", "kuyruk"]);
});

test("kısmi üretimde bir alt konu tamamen eksik kalırsa test reddedilir", async () => {
    const istemci = { models: { async generateContent() {
        return {
            text: JSON.stringify({ sorular: [soruYap(false)] }),
            candidates: [{ finishReason: "STOP" }],
        };
    } } };
    await assert.rejects(geminiIleTestSorulariUret({
        dersBilgisi: { dersAdi: "Veri Yapıları" },
        kapsamTuru: "konu", hedefBasligi: "Veri Yapıları",
        soruSayisi: 1, zorlukDagilimi: { kolay: 1 },
        konuDagilimi: [{ konuId: "yigin", baslik: "Yığın", adet: 1 }],
        kaynaklar: [{ anahtar: "K1", materyalId: "materyal1", parcaIndex: 0,
            dosyaAdi: "ders.pdf", konuIds: ["yigin"], icerik: kaynakAlintisi }],
        izinliKonuIds: [{ konuId: "yigin", baslik: "Yığın" }],
        kismiSonucKabul: true,
        soruKalitesiDogrula: async () => [{
            soruIndeksi: 0, gecerli: false, neden: "BIRDEN_FAZLA_DOGRU",
        }],
    }, {
        istemci, partiBoyutu: 1, maxDeneme: 1,
        maksimumOnarimDenemesi: 0, maksimumKucultmeDerinligi: 0,
        timeoutMs: 5_000, bekle: async () => {},
    }), (hata) => hata.kod === "YETERSIZ_TEST_ICERIGI");
});

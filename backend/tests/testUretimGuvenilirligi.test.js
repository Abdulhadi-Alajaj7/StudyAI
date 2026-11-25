import test from "node:test";
import assert from "node:assert/strict";
import { testSorulariniDogrula, gecerliTestSorulariniSec } from "../services/testDogrulamaService.js";
import { ornekPaket, geminiTaklidi } from "./helpers/testUretimOrnekleri.js";
import { geminiIleTestSorulariUret } from "../services/geminiService.js";
import { zorlukDagiliminiOlustur } from "../services/testService.js";

for (const [alan, boz] of Object.entries({
    metin: (s) => ({ ...s, metin: {} }),
    aciklama: (s) => ({ ...s, aciklama: " " }),
    hedef: (s) => ({ ...s, ogrenmeHedefi: "" }),
    secenekSayisi: (s) => ({ ...s, secenekler: s.secenekler.slice(0, 3) }),
    ayniSecenek: (s) => ({ ...s, secenekler: s.secenekler.map((o) => ({ ...o, metin: "Aynı seçenek" })) }),
    secenekAnahtari: (s) => ({ ...s, secenekler: s.secenekler.map((o) => ({ ...o, anahtar: "A" })) }),
    cevap: (s) => ({ ...s, dogruCevap: "A veya B" }),
    yanlisCevap: (s) => ({ ...s, dogruCevap: "B" }),
    aciklamaAnahtari: (s) => ({ ...s, aciklama: s.aciklama + " Doğru cevap B." }),
    zorluk: (s) => ({ ...s, zorluk: "zor" }),
    konu: (s) => ({ ...s, konuId: "sub-olmayan" }),
    bosKonu: (s) => ({ ...s, konuId: "" }),
    kaynak: (s) => ({ ...s, kaynakReferanslari: ["K99"] }),
    bosKaynak: (s) => ({ ...s, kaynakReferanslari: [] }),
    kanit: (s) => ({ ...s, kaynakKanitlari: [{ kaynakReferansi: "K1", alinti: "Kaynakta olmayan bir alıntı." }] }),
    bosKanit: (s) => ({ ...s, kaynakKanitlari: [] }),
})) {
    test(`${alan} hatası kayıt öncesi doğrulamada reddedilir`, () => {
        const { girdi, sorular } = ornekPaket([1]);
        assert.throws(() => testSorulariniDogrula({ sorular: [boz(sorular[0])] }, girdi), { kod: "TEST_HEDEFI_KARSILANAMADI" });
    });
}

test("konu ID doğru olsa bile başka konuya ait kaynak kullanılamaz", () => {
    const { girdi, sorular } = ornekPaket([1, 1]);
    const bozuk = { ...sorular[1], konuId: "sub-0" };
    assert.throws(() => testSorulariniDogrula({ sorular: [sorular[0], bozuk] }, girdi), (h) => h.tanilama.dogrulamaAltKodu === "KAYNAK_KONU_UYUSMAZLIGI");
});

test("soru sırası ve seçenek sırası cevap anahtarını değiştirmez", () => {
    const { girdi, sorular } = ornekPaket([2]);
    const sonuc = testSorulariniDogrula({ sorular: sorular.map((s) => ({ ...s, secenekler: [...s.secenekler].reverse() })) }, girdi);
    assert.equal(sonuc[0].secenekler[0].anahtar, "A");
    assert.equal(sonuc[0].secenekler[0].metin, sorular[0].secenekler[0].metin);
});

test("farklı teknik semboller seçenekleri yanlışlıkla aynı yapmaz", () => {
    const { girdi, sorular } = ornekPaket([1]);
    sorular[0].secenekler[1].metin = "C++";
    sorular[0].secenekler[2].metin = "C#";
    assert.equal(testSorulariniDogrula({ sorular }, girdi).length, 1);
});

test("aynı hedefi farklı sözcüklerle soran soru tekrar sayılır", () => {
    const { girdi, sorular } = ornekPaket([2]);
    const tekrar = { ...sorular[0], metin: "Yığın yapısının çıkarma sırasını belirleyen kural nedir?", ogrenmeHedefi: "Son giren ilk çıkar sırasıyla yığın çalışır." };
    assert.throws(() => testSorulariniDogrula({ sorular: [sorular[0], tekrar] }, girdi), (h) => h.tanilama.dogrulamaAltKodu === "TEKRARLAYAN_SORU");
});

test("kanıt alıntısındaki matematiksel işlem işareti değiştirilemez", () => {
    const { girdi, sorular } = ornekPaket([1]);
    girdi.kaynaklar[0].icerik += " Hesap sonucu 8 + 2 = 10 olur.";
    sorular[0].kaynakKanitlari = [{ kaynakReferansi: "K1", alinti: "Hesap sonucu 8 - 2 = 10 olur." }];
    assert.throws(() => testSorulariniDogrula({ sorular }, girdi), (h) => h.tanilama.dogrulamaAltKodu === "KAYNAK_KANITI");
});

test("karışık zorluk ve konu kotaları birlikte eşleşir; ilk seçim gereksiz tamamlama yaratmaz", () => {
    const { girdi, soru } = ornekPaket([1, 1]);
    const ayarlar = { ...girdi, zorlukDagilimi: { kolay: 1, zor: 1 } };
    // İlk konunun kolay sorusu yerine zor sorusu seçilmeli.
    const secim = gecerliTestSorulariniSec([soru(0, 0, "kolay"), soru(0, 1, "zor"), soru(1, 0, "kolay")], ayarlar);
    assert.equal(secim.sorular.length, 2);
    assert.equal(secim.sorular.find((s) => s.konuId === "sub-0").zorluk, "zor");
});

for (const kapsamTuru of ["konu", "materyal", "tum_ders"]) {
    for (const zorluk of ["kolay", "orta", "zor", "karisik"]) {
        test(`${kapsamTuru} / ${zorluk}: kesin sayı ve zorluk dağılımı`, async () => {
            const { girdi, sorular } = ornekPaket();
            const zorlukDagilimi = zorlukDagiliminiOlustur(zorluk, 10);
            const zorluklar = Object.entries(zorlukDagilimi).flatMap(([z, n]) => Array(n).fill(z));
            const yeniSorular = sorular.map((s, i) => ({ ...s, zorluk: zorluklar[i] }));
            const mock = geminiTaklidi([{ sorular: yeniSorular }]);
            const sonuc = await geminiIleTestSorulariUret({ ...girdi, kapsamTuru, zorlukDagilimi }, mock.bagimliliklar);
            assert.equal(sonuc.sorular.length, 10);
            assert.equal(mock.istekler.length, 1);
        });
    }
}

test("boş kaynak ve bütçeye sığmayan konu kaynakları API çağrısından önce reddedilir", async () => {
    const { girdi } = ornekPaket();
    const mock = geminiTaklidi([]);
    await assert.rejects(geminiIleTestSorulariUret({ ...girdi, kaynaklar: [] }, mock.bagimliliklar));
    await assert.rejects(geminiIleTestSorulariUret({ ...girdi, kaynaklar: girdi.kaynaklar.map((k) => ({ ...k, icerik: "a".repeat(120000) })) }, mock.bagimliliklar), (h) => h.tanilama.dogrulamaAltKodu === "KAYNAK_BUTCESI");
    assert.equal(mock.istekler.length, 0);
});

test("aynı fiziksel kaynak konu etiketleri birleştirilerek bir kez gönderilir", async () => {
    const { girdi, sorular } = ornekPaket([1, 1]);
    const icerik = girdi.kaynaklar.map((k) => k.icerik).join(" ");
    const kaynaklar = girdi.kaynaklar.map((k) => ({ ...k, materyalId: "m1", parcaIndex: 0, icerik }));
    const mock = geminiTaklidi([{ sorular: sorular.map((s) => ({ ...s, kaynakReferanslari: ["K1"], kaynakKanitlari: s.kaynakKanitlari.map((k) => ({ ...k, kaynakReferansi: "K1" })) })) }]);
    await geminiIleTestSorulariUret({ ...girdi, kaynaklar }, mock.bagimliliklar);
    assert.equal((mock.istekler[0].contents.match(/\[KAYNAK /g) || []).length, 1);
});

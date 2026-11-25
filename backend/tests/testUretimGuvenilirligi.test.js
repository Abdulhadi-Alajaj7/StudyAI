import test from "node:test";
import assert from "node:assert/strict";
import { testSorulariniDogrula } from "../services/testDogrulamaService.js";
import { ornekPaket, geminiTaklidi } from "./helpers/testUretimOrnekleri.js";
import { geminiIleTestSorulariUret } from "../services/geminiService.js";
import { zorlukDagiliminiOlustur } from "../services/testService.js";

for (const [alan, boz] of Object.entries({
    metin: (s) => ({ ...s, metin: {} }),
    aciklama: (s) => ({ ...s, aciklama: " " }),
    secenekSayisi: (s) => ({ ...s, secenekler: s.secenekler.slice(0, 3) }),
    secenekAnahtari: (s) => ({ ...s, secenekler: s.secenekler.map((o) => ({ ...o, anahtar: "A" })) }),
    cevap: (s) => ({ ...s, dogruCevap: "A veya B" }),
    zorluk: (s) => ({ ...s, zorluk: "bilinmeyen" }),
})) {
    test(`${alan} biçim hatası kaydı önler`, () => {
        const { girdi, sorular } = ornekPaket([1]);
        assert.throws(() => testSorulariniDogrula({ sorular: [boz(sorular[0])] }, girdi), { kod: "TEST_HEDEFI_KARSILANAMADI" });
    });
}

test("kalite kuralları prompta bırakılır; alıntı, konu dağılımı ve tekrar nedeniyle soru elenmez", () => {
    const { girdi, sorular } = ornekPaket([1, 1]);
    const ham = { ...sorular[0], kaynakKanitlari: undefined, ogrenmeHedefi: undefined, zorluk: "zor" };
    const sonuc = testSorulariniDogrula({ sorular: [ham, ham] }, girdi);
    assert.equal(sonuc.length, 2);
    assert.equal(sonuc[0].metin, sonuc[1].metin);
    assert.equal(sonuc[0].zorluk, "zor");
});

test("bilinmeyen kaynak ve konu kimlikleri kullanıcı verisine bağlanmaz", () => {
    const { girdi, sorular } = ornekPaket([1]);
    const [s] = testSorulariniDogrula({ sorular: [{ ...sorular[0], konuId: "uydurma", kaynakReferanslari: ["K1", "K999"] }] }, girdi);
    assert.equal(s.konuId, "");
    assert.deepEqual(s.kaynakReferanslari, ["K1"]);
    assert.equal(s.kaynaklar.length, 1);
});

test("seçenek sırası cevap anahtarını değiştirmez", () => {
    const { girdi, sorular } = ornekPaket([2]);
    const sonuc = testSorulariniDogrula({ sorular: sorular.map((s) => ({ ...s, secenekler: [...s.secenekler].reverse() })) }, girdi);
    assert.equal(sonuc[0].secenekler[0].anahtar, "A");
    assert.equal(sonuc[0].secenekler[0].metin, sorular[0].secenekler[0].metin);
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

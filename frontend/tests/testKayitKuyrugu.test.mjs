import test from "node:test";
import assert from "node:assert/strict";

import { testKayitKuyruguOlustur } from "../src/utils/testKayitKuyrugu.mjs";

const ertelenmis = () => {
    let tamamla;
    const promise = new Promise((resolve) => { tamamla = resolve; });
    return { promise, tamamla };
};

test("aynı sorunun hızlı cevap değişiklikleri gönderim sırasını korur", async () => {
    const ilk = ertelenmis();
    const olaylar = [];
    const kuyruk = testKayitKuyruguOlustur();

    const ilkKayit = kuyruk.ekle("cevap:s1", async () => {
        olaylar.push("ilk-basladi");
        await ilk.promise;
        olaylar.push("ilk-bitti");
    });
    const ikinciKayit = kuyruk.ekle("cevap:s1", async () => {
        olaylar.push("ikinci-basladi");
        olaylar.push("ikinci-bitti");
    });

    await Promise.resolve();
    assert.deepEqual(olaylar, ["ilk-basladi"]);
    ilk.tamamla();
    await Promise.all([ilkKayit, ikinciKayit]);
    assert.deepEqual(olaylar, ["ilk-basladi", "ilk-bitti", "ikinci-basladi", "ikinci-bitti"]);
    assert.equal(kuyruk.durum().durum, "kaydedildi");
});

test("başarısız kayıt başarı gibi gösterilmez ve yeniden denenebilir", async () => {
    let deneme = 0;
    const durumlar = [];
    const kuyruk = testKayitKuyruguOlustur({
        onDurumDegisti: (durum) => durumlar.push(durum.durum),
    });

    await kuyruk.ekle("isaret:s1", async () => {
        deneme += 1;
        if (deneme === 1) throw new Error("ağ hatası");
    });
    assert.equal(kuyruk.durum().durum, "hata");
    assert.deepEqual(kuyruk.durum().basarisizAnahtarlar, ["isaret:s1"]);

    const tekrar = await kuyruk.yenidenDene();
    assert.equal(tekrar.durum, "kaydedildi");
    assert.equal(deneme, 2);
    assert.ok(durumlar.includes("kaydediliyor"));
    assert.ok(durumlar.includes("hata"));
});

test("tamamlama öncesi bekleme bütün bağımsız kayıtların bitmesini bekler", async () => {
    const cevap = ertelenmis();
    const isaret = ertelenmis();
    const kuyruk = testKayitKuyruguOlustur();
    kuyruk.ekle("cevap:s1", () => cevap.promise);
    kuyruk.ekle("isaret:s2", () => isaret.promise);

    let bitti = false;
    const bekleme = kuyruk.bekle().then(() => { bitti = true; });
    await Promise.resolve();
    cevap.tamamla();
    await Promise.resolve();
    assert.equal(bitti, false);
    isaret.tamamla();
    await bekleme;
    assert.equal(bitti, true);
});

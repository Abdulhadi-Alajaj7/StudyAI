import test from "node:test";
import assert from "node:assert/strict";

import { testlerApiOlustur } from "../src/services/testlerApi.mjs";

const sahteIstemci = () => {
    const cagrilar = [];
    const istemci = {};
    for (const metot of ["get", "post", "patch"]) {
        istemci[metot] = async (...argumanlar) => {
            cagrilar.push({ metot, argumanlar });
            return { data: {} };
        };
    }
    return { istemci, cagrilar };
};

test("testler API istemcisi gerçek listeleme, oluşturma ve başlatma uçlarını kullanır", async () => {
    const { istemci, cagrilar } = sahteIstemci();
    const servis = testlerApiOlustur(istemci);
    const girdi = { kapsamTuru: "konu", soruSayisi: 10, zorluk: "orta", konuId: "konu/1" };

    await servis.devamEdenTestleriGetir("ders 1");
    await servis.tamamlananTestleriGetir("ders 1");
    await servis.testOlustur("ders 1", girdi);
    await servis.testiBaslat("ders 1", "test/1");

    assert.equal(cagrilar[0].argumanlar[0], "/dersler/ders%201/testler/devam-eden");
    assert.equal(cagrilar[1].argumanlar[0], "/dersler/ders%201/testler/tamamlanan");
    assert.deepEqual(cagrilar[2].argumanlar.slice(0, 2), [
        "/dersler/ders%201/testler",
        girdi,
    ]);
    assert.equal(cagrilar[3].argumanlar[0], "/dersler/ders%201/testler/test%2F1/baslat");
    assert.deepEqual(cagrilar[3].argumanlar[1], {});
    assert.ok(cagrilar.every((cagri) => cagri.argumanlar.at(-1).withCredentials === true));
});

test("test kapsam seçenekleri mevcut materyal ve konu endpointlerinden alınır", async () => {
    const { istemci, cagrilar } = sahteIstemci();
    const servis = testlerApiOlustur(istemci);

    await servis.materyalleriGetir("ders/1");
    await servis.konuHaritasiniGetir("ders/1");

    assert.equal(cagrilar[0].argumanlar[0], "/materyaller/ders/ders%2F1");
    assert.equal(cagrilar[1].argumanlar[0], "/dersler/ders%2F1/konu-haritasi");
});

test("test çözme ve sonuç akışı gerçek detay, kayıt, tamamlama ve sonuç uçlarını kullanır", async () => {
    const { istemci, cagrilar } = sahteIstemci();
    const servis = testlerApiOlustur(istemci);

    await servis.testDetayiniGetir("ders 1", "test/1");
    await servis.cevabiKaydet("ders 1", "test/1", "soru 1", "B");
    await servis.soruIsaretiniGuncelle("ders 1", "test/1", "soru 1", true);
    await servis.sonSoruyuKaydet("ders 1", "test/1", 3);
    await servis.testiTamamla("ders 1", "test/1");
    await servis.testSonucunuGetir("ders 1", "test/1");

    assert.equal(cagrilar[0].argumanlar[0], "/dersler/ders%201/testler/test%2F1");
    assert.deepEqual(cagrilar[1].argumanlar.slice(0, 2), [
        "/dersler/ders%201/testler/test%2F1/sorular/soru%201/cevap",
        { cevap: "B" },
    ]);
    assert.deepEqual(cagrilar[2].argumanlar.slice(0, 2), [
        "/dersler/ders%201/testler/test%2F1/sorular/soru%201/isaret",
        { isaretli: true },
    ]);
    assert.deepEqual(cagrilar[3].argumanlar.slice(0, 2), [
        "/dersler/ders%201/testler/test%2F1/son-soru",
        { soruIndex: 3 },
    ]);
    assert.equal(cagrilar[4].argumanlar[0], "/dersler/ders%201/testler/test%2F1/tamamla");
    assert.equal(cagrilar[5].argumanlar[0], "/dersler/ders%201/testler/test%2F1/sonuc");
    assert.ok(cagrilar.every((cagri) => cagri.argumanlar.at(-1).withCredentials === true));
});

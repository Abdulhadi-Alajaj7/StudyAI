import test from "node:test";
import assert from "node:assert/strict";

import { dersOzetiApiOlustur } from "../src/services/dersOzetiApi.mjs";

const sahteIstemci = () => {
    const cagrilar = [];
    const istemci = {};
    for (const metot of ["get", "post"]) {
        istemci[metot] = async (...argumanlar) => {
            cagrilar.push({ metot, argumanlar });
            return { data: {} };
        };
    }
    return { istemci, cagrilar };
};

test("ders özeti API istemcisi backend uçlarını ve cookie kimlik doğrulamasını kullanır", async () => {
    const { istemci, cagrilar } = sahteIstemci();
    const servis = dersOzetiApiOlustur(istemci);
    const girdi = { tur: "konu", uzunluk: "orta", konuId: "sub/yigin" };

    await servis.kayitliOzetiGetir("ders 1", girdi);
    await servis.ozetOlustur("ders 1", girdi);
    await servis.ozetYenidenOlustur("ders 1", girdi);

    assert.equal(cagrilar[0].argumanlar[0], "/dersler/ders%201/ozetler");
    assert.deepEqual(cagrilar[0].argumanlar[1].params, girdi);
    assert.deepEqual(cagrilar[1].argumanlar.slice(0, 2), [
        "/dersler/ders%201/ozetler",
        girdi,
    ]);
    assert.deepEqual(cagrilar[2].argumanlar.slice(0, 2), [
        "/dersler/ders%201/ozetler/yeniden-olustur",
        girdi,
    ]);
    assert.ok(cagrilar.every((cagri) => cagri.argumanlar.at(-1).withCredentials === true));
});

test("materyal ve konu seçenekleri gerçek yardımcı endpointlerden alınır", async () => {
    const { istemci, cagrilar } = sahteIstemci();
    const servis = dersOzetiApiOlustur(istemci);

    await servis.materyalleriGetir("ders/1");
    await servis.konuHaritasiniGetir("ders/1");

    assert.equal(cagrilar[0].argumanlar[0], "/materyaller/ders/ders%2F1");
    assert.equal(cagrilar[1].argumanlar[0], "/dersler/ders%2F1/konu-haritasi");
});

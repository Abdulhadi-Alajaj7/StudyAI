import test from "node:test";
import assert from "node:assert/strict";

import { sohbetApiOlustur } from "../src/services/sohbetApi.mjs";

const sahteIstemci = () => {
    const cagrilar = [];
    const istemci = {};
    for (const metot of ["get", "post", "patch", "delete"]) {
        istemci[metot] = async (...argumanlar) => {
            cagrilar.push({ metot, argumanlar });
            return { data: {} };
        };
    }
    return { istemci, cagrilar };
};

test("sohbet API istemcisi backend uçlarını ve cursor parametrelerini aynen kullanır", async () => {
    const { istemci, cagrilar } = sahteIstemci();
    const servis = sohbetApiOlustur(istemci);

    await servis.sohbetleriListele("ders 1", { cursor: "cursor-1", limit: 20 });
    await servis.sohbetGetir("ders 1", "sohbet/1");
    await servis.mesajlariGetir("ders 1", "sohbet/1", { cursor: "cursor-2", limit: 50 });

    assert.equal(cagrilar[0].argumanlar[0], "/dersler/ders%201/sohbetler");
    assert.deepEqual(cagrilar[0].argumanlar[1].params, { limit: 20, cursor: "cursor-1" });
    assert.equal(cagrilar[1].argumanlar[0], "/dersler/ders%201/sohbetler/sohbet%2F1");
    assert.equal(cagrilar[2].argumanlar[0], "/dersler/ders%201/sohbetler/sohbet%2F1/mesajlar");
    assert.deepEqual(cagrilar[2].argumanlar[1].params, { limit: 50, cursor: "cursor-2" });
    assert.ok(cagrilar.every((cagri) => cagri.argumanlar.at(-1).withCredentials === true));
});

test("ilk mesaj ve mevcut sohbet mesajı farklı sözleşmelerle tek AI isteği olarak gönderilir", async () => {
    const { istemci, cagrilar } = sahteIstemci();
    const servis = sohbetApiOlustur(istemci);

    await servis.sohbetOlustur("ders1", { ilkMesaj: "Sanal bellek nedir?", istemciIstekId: "istek-0001" });
    await servis.mesajGonder("ders1", "sohbet1", { icerik: "Peki avantajları?", istemciIstekId: "istek-0002" });

    assert.deepEqual(cagrilar[0].argumanlar.slice(0, 2), [
        "/dersler/ders1/sohbetler",
        { ilkMesaj: "Sanal bellek nedir?", istemciIstekId: "istek-0001" },
    ]);
    assert.deepEqual(cagrilar[1].argumanlar.slice(0, 2), [
        "/dersler/ders1/sohbetler/sohbet1/mesajlar",
        { icerik: "Peki avantajları?", istemciIstekId: "istek-0002" },
    ]);
    assert.equal(cagrilar.filter((cagri) => cagri.metot === "post").length, 2);
});

test("yeniden adlandırma ve silme doğru sahiplik URL'sine gönderilir", async () => {
    const { istemci, cagrilar } = sahteIstemci();
    const servis = sohbetApiOlustur(istemci);

    await servis.baslikGuncelle("ders1", "sohbet1", "Yeni Başlık");
    await servis.sohbetSil("ders1", "sohbet1");

    assert.equal(cagrilar[0].metot, "patch");
    assert.deepEqual(cagrilar[0].argumanlar.slice(0, 2), [
        "/dersler/ders1/sohbetler/sohbet1",
        { baslik: "Yeni Başlık" },
    ]);
    assert.equal(cagrilar[1].metot, "delete");
    assert.equal(cagrilar[1].argumanlar[0], "/dersler/ders1/sohbetler/sohbet1");
});

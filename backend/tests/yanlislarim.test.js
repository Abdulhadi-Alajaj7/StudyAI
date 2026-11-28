import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Kullanici from "../models/Kullanici.js";
import Test from "../models/Test.js";
import testRoutes from "../routes/testRoutes.js";
import yanlislarRoutes from "../routes/yanlislarRoutes.js";

const id = sayi => sayi.toString(16).padStart(24, "0");
const kullaniciId = id(1), digerKullaniciId = id(2);
const dersId = id(11), ikinciDersId = id(12), yabanciDersId = id(13);
const dersler = [
    { _id: dersId, dersAdi: "Algoritmalar", kullaniciId },
    { _id: ikinciDersId, dersAdi: "İstatistik", kullaniciId },
    { _id: yabanciDersId, dersAdi: "Yabancı ders", kullaniciId: digerKullaniciId }
];
const soru = (sayi, ogrenciCevabi, konuId = "alt") => ({
    _id: id(sayi), metin: `Soru ${sayi}`, ogrenciCevabi, konuId, konuBasligi: "Alt konu",
    secenekler: ["A", "B", "C", "D"].map(anahtar => ({ anahtar, metin: `Seçenek ${anahtar}` })),
    dogruCevap: "A", aciklama: "Doğru seçeneğin açıklaması", zorluk: "orta",
    kaynaklar: [{ materyalId: id(31), dosyaAdi: "ders.pdf", parcaIndeksleri: [0] }]
});
const eslesir = (nesne, filtre) => Object.entries(filtre).every(([alan, deger]) => {
    if (alan === "$or") return deger.some(kosul => eslesir(nesne, kosul));
    if (alan.startsWith("sorular.")) {
        return nesne.sorular.some(soru => eslesir(soru, { [alan.slice(8)]: deger }));
    }
    if (deger?.$in) return deger.$in.includes(nesne[alan]);
    return nesne[alan] === deger;
});
const zincir = deger => ({
    select() { return this; },
    sort() {
        deger.sort((a, b) => String(b.tamamlanmaTarihi).localeCompare(String(a.tamamlanmaTarihi)) ||
            b._id.localeCompare(a._id));
        return this;
    },
    async lean() { return deger; }
});

test("Yanlışlarım gerçek HTTP rotası, kapsam filtreleri ve tekrar testinin mevcut çözme akışı", async t => {
    const testler = [];
    const testEkle = (numara, sorular, alanlar = {}) => testler.push({
        _id: id(numara), kullaniciId, dersId, durum: "tamamlandi",
        tamamlanmaTarihi: "2026-01-01T00:00:00.000Z", sorular, ...alanlar
    });
    t.mock.method(Ders, "find", filtre => zincir(dersler.filter(kayit => eslesir(kayit, filtre))));
    t.mock.method(Ders, "findOne", filtre => zincir(dersler.find(kayit => eslesir(kayit, filtre))));
    t.mock.method(Kullanici, "findById", _id => ({
        async select() { return { _id, emailDogrulandi: true, oturumSurumu: 0 }; }
    }));
    t.mock.method(Test, "find", filtre => zincir(testler.filter(kayit => eslesir(kayit, filtre))));
    t.mock.method(Test, "findOne", filtre => zincir(testler.find(kayit => eslesir(kayit, filtre))));
    t.mock.method(Test, "findOneAndUpdate", (filtre, { $set }) => {
        const test = testler.find(kayit => eslesir(kayit, filtre));
        if (!test) return zincir(null);
        for (const [alan, deger] of Object.entries($set)) {
            if (alan === "sorular.$.ogrenciCevabi") {
                test.sorular.find(soru => soru._id === filtre["sorular._id"]).ogrenciCevabi = deger;
            } else {
                test[alan] = deger instanceof Date ? deger.toISOString() : deger;
            }
        }
        return zincir(structuredClone(test));
    });
    t.mock.method(Test, "create", async alanlar => {
        const test = new Test(alanlar);
        await test.validate();
        const kayit = JSON.parse(JSON.stringify(test));
        testler.push(kayit);
        return kayit;
    });
    const gercekFetch = globalThis.fetch;
    t.mock.method(globalThis, "fetch", (url, opts) => {
        assert.equal(new URL(url).hostname, "127.0.0.1", "Yalnız yerel test sunucusuna istek gönderilebilir");
        return gercekFetch(url, opts);
    });
    const eskiSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "sentetik-yanlislarim-testi";
    t.after(() => {
        if (eskiSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = eskiSecret;
    });

    const app = express();
    app.use(express.json());
    app.use("/yanlislarim", yanlislarRoutes);
    app.use("/dersler", testRoutes);
    const sunucu = app.listen(0, "127.0.0.1");
    await once(sunucu, "listening");
    t.after(() => new Promise(resolve => sunucu.close(resolve)));
    const istek = async (yol, { method = "GET", body, kimlik = kullaniciId } = {}) => {
        const headers = kimlik ? { Authorization: `Bearer ${jwt.sign({ id: kimlik }, process.env.JWT_SECRET)}` } : {};
        if (body) headers["Content-Type"] = "application/json";
        const yanit = await fetch(`http://127.0.0.1:${sunucu.address().port}${yol}`, { method, headers, body: JSON.stringify(body) });
        return { status: yanit.status, veri: await yanit.json() };
    };
    const listele = async (query = "") => {
        const yanit = await istek(`/yanlislarim${query}`);
        assert.equal(yanit.status, 200);
        return yanit.veri.sorular;
    };
    const olustur = (soruIds, ders = dersId, kimlik = kullaniciId) => istek("/yanlislarim/tekrar-testleri", {
        method: "POST", body: { dersId: ders, soruIds }, kimlik
    });
    assert.equal((await istek("/yanlislarim", { kimlik: "" })).status, 401);
    assert.deepEqual(await listele(), []);

    testEkle(21, [soru(101, "B"), soru(102, null), soru(103, "A"), soru(104, "C", "diger")]);
    testEkle(22, [soru(201, "B")], { dersId: ikinciDersId });
    testEkle(23, [soru(301, null)], { durum: "devam_ediyor" });
    testEkle(24, [soru(401, "B")], { dersId: yabanciDersId, kullaniciId: digerKullaniciId });
    testEkle(25, [soru(402, "B")], { dersId: yabanciDersId });
    testEkle(26, [soru(403, "B")], { kullaniciId: digerKullaniciId });
    const ilk = await listele();
    assert.deepEqual(ilk.map(s => [s.soruId, s.durum]), [
        [id(201), "yanlis"], [id(104), "yanlis"], [id(102), "bos"], [id(101), "yanlis"]
    ]);
    assert.deepEqual((await listele(`?dersId=${dersId}&konuId=alt&durum=bos`)).map(s => s.soruId), [id(102)]);
    assert.deepEqual(await listele(`?dersId=${yabanciDersId}`), []);
    assert.equal((await istek("/yanlislarim?dersId[\$ne]=x")).status, 400);
    assert.deepEqual((await istek("/yanlislarim", { kimlik: digerKullaniciId })).veri.sorular.map(s => s.soruId), [id(401)]);
    assert.deepEqual(ilk.at(-1).kaynakAdlari, ["ders.pdf"]);
    assert.equal(ilk.at(-1).aciklama, soru(101, "B").aciklama);
    assert.equal(ilk.at(-1).secenekler.length, 4);

    assert.equal((await olustur([id(101), id(201)])).status, 404);
    assert.equal((await olustur([id(103)])).status, 404);
    assert.equal((await olustur([id(101)], dersId, digerKullaniciId)).status, 404);
    assert.equal((await olustur([id(101), id(101)])).status, 400);
    assert.equal((await olustur(Array.from({ length: 21 }, (_, i) => id(500 + i)))).status, 400);

    const coz = async (kimlikler, cevaplar) => {
        const yanit = await olustur(kimlikler);
        assert.equal(yanit.status, 201);
        const tekrar = testler.find(test => test._id === yanit.veri.testId);
        assert.equal(tekrar.kaynak, "tekrar");
        assert.equal(tekrar.durum, "hazirlandi");
        assert.deepEqual(tekrar.sorular.map(s => s.tekrarSoruId), kimlikler);
        assert.ok(tekrar.sorular.every(s => s._id !== s.tekrarSoruId && s.ogrenciCevabi === null && !s.isaretli));
        assert.deepEqual(tekrar.sorular.map(s => s.metin), kimlikler.map(id => ilk.find(s => s.soruId === id).metin));
        const yol = `/dersler/${dersId}/testler/${tekrar._id}`;
        const baslat = await istek(`${yol}/baslat`, { method: "POST" });
        assert.equal(baslat.status, 200);
        assert.ok(baslat.veri.test.sorular.every(s => s.dogruCevap === undefined && s.aciklama === undefined));
        for (const [index, cevap] of cevaplar.entries()) {
            if (cevap === null) continue;
            const kayit = await istek(`${yol}/sorular/${tekrar.sorular[index]._id}/cevap`, { method: "PATCH", body: { cevap } });
            assert.equal(kayit.status, 200);
        }
        const sonuc = await istek(`${yol}/tamamla`, { method: "POST" });
        assert.equal(sonuc.status, 200);
    };

    await coz([id(101), id(102)], ["A", "A"]);
    assert.deepEqual((await listele("?durum=duzeltildi")).map(s => s.soruId).sort(), [id(101), id(102)]);
    await coz([id(101), id(102)], ["B", null]);
    const guncel = await listele(`?dersId=${dersId}&konuId=alt`);
    assert.deepEqual(guncel.map(s => [s.soruId, s.durum, s.ogrenciCevabi]).sort(), [
        [id(101), "yanlis", "B"], [id(102), "bos", null]
    ]);
    assert.equal(testler[0].sorular[0].ogrenciCevabi, "B");

    await assert.rejects(new Test({ ...testler.at(-1), kaynak: undefined }).validate(), {
        name: mongoose.Error.ValidationError.name
    });
});

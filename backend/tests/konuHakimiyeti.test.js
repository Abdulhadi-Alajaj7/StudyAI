import assert from "node:assert/strict";
import { once } from "node:events";
import { beforeEach, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import Ders from "../models/Ders.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Kullanici from "../models/Kullanici.js";
import Test from "../models/Test.js";
import dersRoutes from "../routes/dersRoutes.js";
import { konuHakimiyetiniGetir } from "../services/konuHakimiyetService.js";

const dersId = "100000000000000000000001";
const digerDersId = "100000000000000000000002";
const kullaniciId = "200000000000000000000001";
const digerKullaniciId = "200000000000000000000002";
const eslesir = (kayit, filtre) => Object.entries(filtre).every(([alan, deger]) =>
    deger?.$ne !== undefined ? kayit[alan] !== deger.$ne : kayit[alan] === deger);
let haritalar, testler, soruId, testId, okunanTestler, kapananCursorlar;

const harita = {
    dersId, kullaniciId,
    anaKonular: [{ konuId: "ana", altKonular: [{ konuId: "alt", baslik: "Ortak başlık" }] }],
    gecmisKonular: [{ altKonular: [{ konuId: "arsiv", baslik: "Ortak başlık" }] }]
};
const sorular = (cevaplar, konuId = "alt") => cevaplar.map(ogrenciCevabi => ({
    _id: String(++soruId), konuId, dogruCevap: "A", ogrenciCevabi
}));
const testEkle = (tarih, sorular, alanlar = {}) => testler.push({
    _id: ++testId, dersId, kullaniciId, durum: "tamamlandi", tamamlanmaTarihi: new Date(tarih), sorular, ...alanlar
});
const analiz = async () => (await konuHakimiyetiniGetir(dersId, kullaniciId))[0];
const beklenen = (dogruSayisi, yanlisSayisi, bosSayisi, yuzde, durum, konuId = "alt") => ({
    konuId, soruSayisi: dogruSayisi + yanlisSayisi + bosSayisi, dogruSayisi, yanlisSayisi, bosSayisi, yuzde, durum
});

beforeEach(() => {
    haritalar = [structuredClone(harita)];
    testler = [];
    soruId = testId = okunanTestler = kapananCursorlar = 0;
});

mock.method(KonuHaritasi, "findOne", (filtre) => ({
    select(alanlar) {
        assert.equal(alanlar, "anaKonular.altKonular.konuId");
        return { lean: async () => haritalar.find(kayit => eslesir(kayit, filtre)) };
    }
}));
mock.method(Test, "find", ({ "sorular.konuId": konuFiltre, ...filtre }) => {
    assert.equal(filtre.durum, "tamamlandi");
    const kayitlar = testler.filter(kayit => eslesir(kayit, filtre) &&
        kayit.sorular.some(soru => konuFiltre.$in.includes(soru.konuId)));
    return {
        select() { return this; },
        sort(siralama) {
            assert.deepEqual(Object.entries(siralama), [["tamamlanmaTarihi", -1], ["_id", -1]]);
            kayitlar.sort((a, b) => b.tamamlanmaTarihi - a.tamamlanmaTarihi || b._id - a._id);
            return this;
        },
        lean() { return this; },
        cursor() {
            return {
                async *[Symbol.asyncIterator]() {
                    for (const kayit of kayitlar) {
                        okunanTestler++;
                        yield kayit;
                    }
                },
                async close() { kapananCursorlar++; }
            };
        }
    };
});

test("test yokken ve dört soru varken yüzde verilmez", async () => {
    assert.deepEqual(await analiz(), beklenen(0, 0, 0, null, "yeterli_veri_yok"));
    testEkle("2026-01-01", sorular(["A", "A", "A", "A"]));
    assert.deepEqual(await analiz(), beklenen(4, 0, 0, null, "yeterli_veri_yok"));
});

test("beş soruda yüzde hesaplanır, boşlar toplamda ve ayrı sayılır", async () => {
    testEkle("2026-01-01", sorular(["A", "A", "B", null, undefined]));
    assert.deepEqual(await analiz(), beklenen(2, 1, 2, 40, "zayif"));
});

test("tekrar testleri özgün konu kimliğini taşısa da son 20 soru penceresine girmez", async () => {
    testEkle("2026-01-01", sorular(["A", "A", "B", null, "A"]));
    const once = await analiz();
    testEkle("2026-01-02", sorular(Array(20).fill("A")), { kaynak: "tekrar" });
    assert.deepEqual(await analiz(), once);
    assert.equal(once.yuzde, 60);
});

test("yüzde 50 ve 80 dahil, alt konular birbirinden bağımsız sınıflandırılır", async () => {
    haritalar[0].anaKonular[0].altKonular.push({ konuId: "diger" });
    testEkle("2026-01-01", [
        ...sorular(["A", "A", "A", "B", "B", "B"]),
        ...sorular(["A", "A", "A", "A", "B"], "diger")
    ]);
    assert.deepEqual(await konuHakimiyetiniGetir(dersId, kullaniciId), [
        beklenen(3, 3, 0, 50, "gelistirilmeli"),
        beklenen(4, 1, 0, 80, "iyi", "diger")
    ]);
});

test("son 20 soru yeni yanlışlar ve doğrular geldikçe kayar", async () => {
    testEkle("2026-01-02", sorular([...Array(12).fill("A"), "B", "B", "B"]));
    testEkle("2026-01-01", sorular(Array(5).fill("A")));
    assert.deepEqual(await analiz(), beklenen(17, 3, 0, 85, "iyi"));
    testEkle("2026-01-03", sorular(Array(5).fill("B")));
    assert.deepEqual(await analiz(), beklenen(12, 8, 0, 60, "gelistirilmeli"));
    assert.equal(okunanTestler, 4, "pencere dolduğunda daha eski testler okunmaz");
    assert.equal(kapananCursorlar, 2);
    testEkle("2026-01-04", sorular(Array(5).fill("A")));
    assert.deepEqual(await analiz(), beklenen(15, 5, 0, 75, "gelistirilmeli"));
});

test("eşit tarihlerde test kimliği ve kayıtlı soru sırası belirleyicidir", async () => {
    const tarih = "2026-01-01";
    testEkle(tarih, sorular(["B", "B", "B", "B", "B", "A"]));
    testEkle(tarih, sorular(Array(15).fill("A")));
    assert.deepEqual(await analiz(), beklenen(15, 5, 0, 75, "gelistirilmeli"));
});

test("arşiv, ana konu, geçersiz kimlikler, geçersiz cevaplar ve tekrar kayıtlar dışlanır", async () => {
    const gecerli = sorular(["A", "B", null, "A", "A"]);
    const kimliksiz = { ...gecerli[0], _id: "kimliksiz", konuId: undefined };
    testEkle("2026-01-01", [...gecerli, kimliksiz, { ...gecerli[0] },
        ...["arsiv", "ana", "bilinmeyen", "", " "].flatMap(konuId => sorular(["A", "A"], konuId)),
        ...sorular(["geçersiz"]),
        { ...sorular(["A"])[0], dogruCevap: null }
    ]);
    testEkle("2026-01-02", [gecerli[0]]);
    assert.deepEqual(await konuHakimiyetiniGetir(dersId, kullaniciId), [beklenen(3, 1, 1, 60, "gelistirilmeli")]);
});

test("kimlik doğrulamalı GET yalnız ders sahibinin tamamlanmış testlerini okur", async (t) => {
    const eskiSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "konu-hakimiyet-testi-sentetik-anahtar";
    t.after(() => {
        if (eskiSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = eskiSecret;
    });
    t.mock.method(Kullanici, "findById", (_id) => ({
        select: async () => ({ _id, emailDogrulandi: true, oturumSurumu: 0 })
    }));
    t.mock.method(Ders, "exists", async (filtre) => eslesir({ _id: dersId, kullaniciId }, filtre));
    testEkle("2026-01-01", sorular(["A", "A", "A", "B", "B"]));
    for (const alanlar of [{ durum: "devam_ediyor" }, { durum: "hazirlandi" }, { kullaniciId: digerKullaniciId }, { dersId: digerDersId }]) {
        testEkle("2026-01-02", sorular(Array(20).fill("A")), alanlar);
    }

    const app = express();
    app.use("/dersler", dersRoutes);
    const sunucu = app.listen(0, "127.0.0.1");
    await once(sunucu, "listening");
    t.after(() => new Promise(resolve => sunucu.close(resolve)));
    const oku = (id, kullanici) => fetch(`http://127.0.0.1:${sunucu.address().port}/dersler/${id}/konu-hakimiyeti`, {
        headers: kullanici ? { Authorization: `Bearer ${jwt.sign({ id: kullanici }, process.env.JWT_SECRET)}` } : {}
    });
    assert.equal((await oku(dersId)).status, 401);
    assert.equal((await oku(dersId, digerKullaniciId)).status, 404);
    assert.equal((await oku("gecersiz-id", kullaniciId)).status, 400);
    assert.equal(okunanTestler, 0);
    const yanit = await oku(dersId, kullaniciId);
    assert.equal(yanit.status, 200);
    assert.deepEqual(await yanit.json(), { altKonular: [beklenen(3, 2, 0, 60, "gelistirilmeli")] });
    assert.equal(okunanTestler, 1);
});

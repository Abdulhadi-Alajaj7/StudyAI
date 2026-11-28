import assert from "node:assert/strict";
import { once } from "node:events";
import { beforeEach, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import Ders from "../models/Ders.js";
import Kullanici from "../models/Kullanici.js";
import CalismaKarti from "../models/CalismaKarti.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Materyal from "../models/Materyal.js";
import Test from "../models/Test.js";
import dersRoutes from "../routes/dersRoutes.js";
import { dersGenelBakisiniGetir } from "../services/dersGenelBakisService.js";
import { calismaKartiTekrarlariniGetir, calismaKartlariniListele } from "../services/calismaKartiService.js";

const id = n => n.toString(16).padStart(24, "0");
const dersId = id(1), kullaniciId = id(2), digerDers = id(3), digerKullanici = id(4);
const filtre = { dersId, kullaniciId };
const sahipOlmayan = { dersId, kullaniciId: digerKullanici };
const eslesir = (kayit, kosullar) => Object.entries(kosullar).every(([alan, deger]) => {
    if (alan === "$or") return deger.some(kosul => eslesir(kayit, kosul));
    if (alan === "sorular.konuId") return kayit.sorular.some(soru => deger.$in.includes(soru.konuId));
    if (deger?.$in) return deger.$in.includes(kayit[alan]);
    if (Object.hasOwn(deger || {}, "$ne")) return deger.$ne === null ? kayit[alan] != null : kayit[alan] !== deger.$ne;
    if (deger?.$lt) return kayit[alan] < deger.$lt && (!deger.$gte || kayit[alan] >= deger.$gte);
    return kayit[alan] === deger;
});

let ders, harita, testler, kartlar, materyaller, aramalar;
const zincir = sonuc => ({
    select(alanlar) { aramalar.push(alanlar); return this; },
    sort(sira) {
        if (sira.tamamlanmaTarihi) sonuc.sort((a, b) => b.tamamlanmaTarihi - a.tamamlanmaTarihi || b._id.localeCompare(a._id));
        return this;
    },
    cursor() {
        return { async *[Symbol.asyncIterator]() { yield* sonuc; }, async close() {} };
    },
    lean() { return this; },
    then(ok, hata) { return Promise.resolve(sonuc).then(ok, hata); }
});
beforeEach(() => {
    ders = { _id: dersId, kullaniciId };
    harita = { ...filtre, durum: "hazir", anaKonular: [] };
    testler = []; kartlar = []; materyaller = []; aramalar = [];
});
mock.method(Ders, "findOne", f => zincir(eslesir(ders, f) ? ders : null));
mock.method(KonuHaritasi, "findOne", f => zincir(eslesir(harita, f) ? harita : null));
for (const [model, kayitlar] of [[Test, () => testler], [CalismaKarti, () => kartlar], [Materyal, () => materyaller]]) {
    mock.method(model, "find", f => zincir(kayitlar().filter(kayit => eslesir(kayit, f))));
}
const testEkle = (n, dogru, yanlis, bos, alanlar = {}) => testler.push({
    ...filtre, _id: id(n), durum: "tamamlandi", kapsamTuru: "konu", konuBasligi: `Test ${n}`,
    tamamlanmaTarihi: new Date(Date.UTC(2026, 10, n)), sorular: [],
    sonuc: { dogruSayisi: dogru, yanlisSayisi: yanlis, bosSayisi: bos }, ...alanlar
});
const rapor = () => dersGenelBakisiniGetir(filtre);

test("yeni derste verisizlik ve gerçek sıfır başarı ayrı kalır", async () => {
    const yeni = await rapor();
    assert.equal(yeni.testBasarisi, null);
    assert.deepEqual(yeni.soruAnalizi, { dogru: 0, yanlis: 0, bos: 0, toplam: 0 });
    assert.deepEqual(yeni.genelHakimiyet, { yuzde: null, durum: "yeterli_veri_yok", degerlendirilen: 0, toplam: 0 });
    assert.deepEqual([yeni.basariGelisimi, yeni.sonTestler, yeni.oncelikliKonular, yeni.adaptifOneri], [[], [], [], null]);
    testEkle(1, 0, 3, 2);
    const veri = await rapor();
    assert.equal(veri.testBasarisi, 0);
    assert.equal(veri.basariGelisimi[0].basari, 0);
    assert.equal(veri.kartlar.gorulmeYuzdesi, null);
});

test("başarı soru ağırlıklıdır ve tekrarlar yalnız sonuç geçmişine girer", async () => {
    testEkle(1, 9, 1, 0);
    testEkle(2, 10, 8, 2, { kaynak: "adaptif" });
    testEkle(3, 4, 0, 1, { kaynak: "normal" });
    testEkle(4, 5, 0, 0, { kaynak: "tekrar" });
    testEkle(5, 5, 0, 0, { durum: "devam_ediyor" });
    testEkle(6, 5, 0, 0, { dersId: digerDers });
    testEkle(7, 5, 0, 0, { kullaniciId: digerKullanici });
    testEkle(8, -5, 3, 2);
    const veri = await rapor();
    assert.equal(veri.testBasarisi, 23 * 100 / 35);
    assert.deepEqual(veri.soruAnalizi, { dogru: 23, yanlis: 9, bos: 3, toplam: 35 });
    assert.equal(veri.tamamlananTestSayisi, 3);
    assert.deepEqual(veri.basariGelisimi.map(k => k._id), [1, 2, 3].map(id));
    assert.deepEqual(veri.sonTestler.map(k => k._id), [8, 4, 3, 2, 1].map(id));
    assert.equal(veri.sonTestler[0].basari, null);
    assert.ok(veri.sonTestler.every(k => !("sonuc" in k) && !("sorular" in k)));
});

test("son sekiz ve son beş pencereleri tamamlanma ve kimlik sırasına göre seçilir", async () => {
    for (let n = 1; n <= 11; n++) testEkle(n, 3, 2, 0);
    testEkle(12, 3, 2, 0, { kaynak: "tekrar", tamamlanmaTarihi: testler.at(-1).tamamlanmaTarihi });
    const veri = await rapor();
    assert.deepEqual(veri.basariGelisimi.map(k => k._id), [4, 5, 6, 7, 8, 9, 10, 11].map(id));
    assert.deepEqual(veri.sonTestler.map(k => k._id), [12, 11, 10, 9, 8].map(id));
});

test("genel hâkimiyet alt konulara eşit ağırlık verir ve hafif özet aynı sayıyı kullanır", async () => {
    const altKonular = ["bir", "iki", "uc", "dort", "bes", "alti"].map(konuId => ({ konuId, baslik: konuId }));
    harita.anaKonular = [{ konuId: "ana", baslik: "Ana konu", altKonular }];
    for (const [i, [konuId, dogru]] of [["bir", 9], ["iki", 7], ["uc", 3], ["dort", 5], ["alti", 3]].entries()) {
        testEkle(i + 1, dogru, 10 - dogru, 0, { sorular: Array.from({ length: 10 }, (_, s) => ({
            _id: id(100 + i * 10 + s), konuId, dogruCevap: "A", ogrenciCevabi: s < dogru ? "A" : "B"
        })) });
    }
    testEkle(9, 5, 0, 0, { kaynak: "tekrar", sorular: Array.from({ length: 5 }, (_, i) => ({
        _id: id(200 + i), konuId: "bes", dogruCevap: "A", ogrenciCevabi: "A"
    })) });
    const veri = await rapor();
    assert.deepEqual(veri.genelHakimiyet, { yuzde: 54, durum: "gelistirilmeli", degerlendirilen: 5, toplam: 6 });
    assert.deepEqual(veri.konuDurumlari, { iyi: 1, gelistirilmeli: 2, zayif: 2, yeterli_veri_yok: 1 });
    assert.deepEqual(veri.oncelikliKonular.map(k => k.konuId), ["uc", "alti", "dort", "iki", "bir"]);
    assert.equal(veri.adaptifOneri.konuId, "bes");
    assert.equal(veri.adaptifOneri.tanilayici, true);
    assert.equal(veri.adaptifOneri.hakimiyet.yuzde, null);
    aramalar = [];
    assert.deepEqual(await dersGenelBakisiniGetir(filtre, { sadeceHakimiyet: true }), { genelHakimiyet: veri.genelHakimiyet });
    assert.ok(aramalar.every(s => !s.includes("sonuc") && !s.includes("goruldu")));
});

test("kart ve vade sayaçları mevcut servislerle ve ders kapsamıyla uyumludur", async () => {
    kartlar.push(
        { ...filtre, goruldu: true, yildizli: true, sonrakiTekrarTarihi: new Date(0) },
        { ...filtre, goruldu: false, sonrakiTekrarTarihi: new Date("2099-01-01") },
        { ...filtre, goruldu: true, dersId: digerDers, sonrakiTekrarTarihi: new Date(0) },
        { ...filtre, kullaniciId: digerKullanici, sonrakiTekrarTarihi: new Date(0) }
    );
    const { kartlar: ozet } = await rapor();
    assert.deepEqual(ozet, { toplam: 2, gorulen: 1, gorulmeyen: 1, yildizli: 1, gorulmeYuzdesi: 50, bekleyenTekrar: 1 });
    assert.equal(ozet.toplam, (await calismaKartlariniListele(filtre)).length);
    assert.equal(ozet.bekleyenTekrar, (await calismaKartiTekrarlariniGetir(filtre)).bekleyen);
    ders.kartDersOtomatikAktif = true;
    assert.equal((await rapor()).kartlar.toplam, (await calismaKartlariniListele(filtre)).length);
    assert.equal((await rapor()).kartlar.bekleyenTekrar, 1);
});

test("Genel Bakış rotası yalnız ders sahibini kabul eder ve kayıt oluşturmaz", async t => {
    const eski = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "sentetik-genel-bakis-anahtari";
    t.after(() => {
        if (eski === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = eski;
    });
    t.mock.method(Kullanici, "findById", _id => ({ async select() { return { _id, emailDogrulandi: true }; } }));
    t.mock.method(Test, "create", () => assert.fail("GET test oluşturmamalı"));
    t.mock.method(CalismaKarti, "create", () => assert.fail("GET kart oluşturmamalı"));
    const app = express();
    app.use("/dersler", dersRoutes);
    const sunucu = app.listen(0, "127.0.0.1");
    await once(sunucu, "listening");
    t.after(() => new Promise(resolve => sunucu.close(resolve)));
    const getir = (kullanici, id = dersId) => fetch(`http://127.0.0.1:${sunucu.address().port}/dersler/${id}/genel-bakis`, {
        headers: kullanici ? { Authorization: `Bearer ${jwt.sign({ id: kullanici }, process.env.JWT_SECRET)}` } : {}
    });
    assert.equal((await getir(null)).status, 401);
    assert.equal((await getir(sahipOlmayan.kullaniciId)).status, 404);
    assert.equal((await getir(kullaniciId, digerDers)).status, 404);
    assert.equal((await getir(kullaniciId, "gecersiz")).status, 400);
    assert.equal((await getir(kullaniciId)).status, 200);
});

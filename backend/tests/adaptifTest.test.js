import assert from "node:assert/strict";
import { once } from "node:events";
import { beforeEach, mock, test } from "node:test";
import express from "express";
import jwt from "jsonwebtoken";
import Ders from "../models/Ders.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Kullanici from "../models/Kullanici.js";
import Test from "../models/Test.js";

const dersId = "100000000000000000000001";
const ogrenci = "200000000000000000000001";
const ikinci = "200000000000000000000002";
const yabanci = "200000000000000000000003";
const harita = {
    durum: "hazir",
    anaKonular: [{ konuId: "ana", altKonular: [
        { konuId: "eda", baslik: "EDA" }, { konuId: "korelasyon", baslik: "Korelasyon" },
        { konuId: "", baslik: "Geçersiz" }, { konuId: " hatali ", baslik: "Geçersiz" }
    ] }],
    gecmisKonular: [{ altKonular: [{ konuId: "arsiv", baslik: "Arşiv" }] }]
};
let denemeler, uretimler, haritaVerisi, kaynakHatasi, seri;
beforeEach(() => {
    denemeler = []; uretimler = []; haritaVerisi = harita; kaynakHatasi = false; seri = 0;
});
const cevapEkle = (konuId, cevaplar, { kaynak, kullaniciId = ogrenci, durum = "tamamlandi" } = {}) =>
    denemeler.unshift({ dersId, kullaniciId, kaynak, durum, sorular: cevaplar.map(dogru => ({
        _id: String(++seri), konuId, dogruCevap: "A", ogrenciCevabi: dogru ? "A" : "B"
    })) });
const cevapSayilari = (konuId, dogru, toplam, secenekler) => cevapEkle(konuId,
    [...Array(dogru).fill(true), ...Array(toplam - dogru).fill(false)], secenekler);

const servis = await import("../services/testService.js");
mock.module("../services/testService.js", { namedExports: {
    ...servis,
    async testOlustur(girdi) {
        uretimler.push(girdi);
        if (kaynakHatasi) throw new servis.TestSistemiHatasi("Yeterli işlenmiş içerik bulunamadı.", {
            status: 422, kod: "YETERSIZ_TEST_ICERIGI"
        });
        return { _id: "300000000000000000000001" };
    }
} });
const { adaptifTestOnerisiniGetir } = await import("../services/adaptifTestService.js");
const { default: testRoutes } = await import("../routes/testRoutes.js");

const yetkili = filtre => filtre.dersId === dersId && [ogrenci, ikinci].includes(filtre.kullaniciId);
mock.method(Ders, "exists", async ({ _id, ...filtre }) => yetkili({ ...filtre, dersId: _id }));
mock.method(KonuHaritasi, "findOne", filtre => ({
    select() { return this; },
    async lean() { return yetkili(filtre) && (!filtre.durum || filtre.durum === haritaVerisi?.durum) ? haritaVerisi : null; }
}));
mock.method(Test, "find", filtre => ({
    select() { return this; },
    sort() { return this; },
    lean() { return this; },
    cursor() {
        return {
            async *[Symbol.asyncIterator]() {
                for (const test of denemeler) {
                    if (test.dersId === filtre.dersId && test.kullaniciId === filtre.kullaniciId &&
                        test.durum === filtre.durum && test.kaynak !== filtre.kaynak?.$ne &&
                        test.sorular.some(soru => filtre["sorular.konuId"].$in.includes(soru.konuId))) yield test;
                }
            },
            async close() {}
        };
    }
}));

const oner = (kullaniciId = ogrenci) => adaptifTestOnerisiniGetir({ dersId, kullaniciId });
const ozet = ({ konuId, hakimiyet, zorluk, soruSayisi, tanilayici }) => [
    konuId, hakimiyet.yuzde, hakimiyet.soruSayisi, zorluk, soruSayisi, tanilayici
];

test("veri yoksa harita sırası, yetersiz konularda en az soru kullanılır", async () => {
    assert.deepEqual(ozet(await oner()), ["eda", null, 0, "orta", 5, true]);
    cevapSayilari("eda", 1, 3);
    cevapSayilari("korelasyon", 0, 1);
    assert.deepEqual(ozet(await oner()), ["korelasyon", null, 1, "orta", 5, true]);
    cevapSayilari("korelasyon", 0, 4);
    assert.equal((await oner()).konuId, "eda", "0% bile yetersiz veriden sonra gelir");
});

test("eşit yüzdelerde soru sayısı, ardından harita sırası seçimi belirler", async () => {
    cevapSayilari("eda", 5, 10);
    cevapSayilari("korelasyon", 3, 6);
    assert.deepEqual(ozet(await oner()), ["korelasyon", 50, 6, "orta", 10, false]);
    cevapSayilari("korelasyon", 2, 4);
    assert.equal((await oner()).konuId, "eda");
});

test("en düşük yüzde seçilir, 80% zor seviyeye girer ve kullanıcılar ayrı değerlendirilir", async () => {
    cevapSayilari("eda", 9, 10);
    cevapSayilari("korelasyon", 8, 10);
    cevapSayilari("eda", 3, 10, { kullaniciId: ikinci });
    cevapSayilari("korelasyon", 6, 10, { kullaniciId: ikinci });
    assert.deepEqual(ozet(await oner()), ["korelasyon", 80, 10, "zor", 10, false]);
    assert.deepEqual(ozet(await oner(ikinci)), ["eda", 30, 10, "kolay", 10, false]);
    await assert.rejects(oner(yabanci), { status: 404 });
});

test("adaptif sonuç öneriyi günceller, tekrar ve tamamlanmamış testler puanı etkilemez", async () => {
    cevapSayilari("korelasyon", 3, 10);
    cevapSayilari("arsiv", 0, 10);
    cevapSayilari("ana", 0, 10);
    cevapSayilari(" hatali ", 0, 10);
    cevapSayilari("eda", 0, 20, { kaynak: "tekrar" });
    cevapSayilari("eda", 0, 20, { durum: "devam_ediyor" });
    assert.deepEqual(ozet(await oner()), ["eda", null, 0, "orta", 5, true]);
    cevapSayilari("eda", 4, 5, { kaynak: "adaptif" });
    assert.deepEqual(ozet(await oner()), ["korelasyon", 30, 10, "kolay", 10, false]);
    assert.deepEqual(await import("../services/konuHakimiyetService.js").then(m => m.konuHakimiyetiniGetir(dersId, ogrenci))
        .then(konular => konular.find(k => k.konuId === "eda")?.yuzde), 80);
});

test("kimlik doğrulamalı GET salt okunurdur; POST güncel kararı kullanır ve Türkçe hatayı iletir", async t => {
    const eski = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "sentetik-adaptif-test-anahtari";
    t.after(() => {
        if (eski === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = eski;
    });
    t.mock.method(Kullanici, "findById", _id => ({ async select() {
        return { _id, emailDogrulandi: true, oturumSurumu: 0 };
    } }));
    t.mock.method(Test, "create", () => assert.fail("Öneri test kaydı oluşturmamalı"));
    const app = express();
    app.use(express.json());
    app.use("/dersler", testRoutes);
    const sunucu = app.listen(0, "127.0.0.1");
    await once(sunucu, "listening");
    t.after(() => new Promise(resolve => sunucu.close(resolve)));
    const istek = async (yol, kullaniciId = ogrenci, body) => {
        const headers = { "Content-Type": "application/json" };
        if (kullaniciId) headers.Authorization = `Bearer ${jwt.sign({ id: kullaniciId }, process.env.JWT_SECRET)}`;
        const res = await fetch(`http://127.0.0.1:${sunucu.address().port}/dersler/${dersId}/adaptif-test/${yol}`, {
            headers, method: body ? "POST" : "GET", body: JSON.stringify(body)
        });
        return { status: res.status, veri: await res.json() };
    };
    assert.equal((await istek("oneri", "")).status, 401);
    assert.equal((await istek("baslat", yabanci, {})).status, 404);
    cevapSayilari("korelasyon", 3, 10);
    assert.equal((await istek("oneri")).veri.oneri.soruSayisi, 5);
    assert.deepEqual(uretimler, []);
    cevapSayilari("eda", 4, 5, { kaynak: "adaptif" });
    const baslatma = await istek("baslat", ogrenci, { konuId: "arsiv", zorluk: "zor", soruSayisi: 20 });
    assert.equal(baslatma.status, 201);
    assert.ok(baslatma.veri.testId);
    assert.deepEqual(uretimler[0], {
        dersId, kullaniciId: ogrenci, kapsamTuru: "konu", konuId: "korelasyon", zorluk: "kolay", soruSayisi: 10, kaynak: "adaptif"
    });
    kaynakHatasi = true;
    const kaynak = await istek("baslat", ogrenci, {});
    assert.equal(kaynak.status, 422);
    assert.match(kaynak.veri.hata, /içerik bulunamadı/);
    haritaVerisi = null;
    assert.equal((await istek("oneri")).veri.oneri, null);
    assert.equal((await istek("baslat", ogrenci, {})).veri.kod, "ADAPTIF_TEST_KONU_YOK");
});

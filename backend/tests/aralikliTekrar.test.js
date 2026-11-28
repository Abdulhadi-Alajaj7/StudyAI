import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import express from "express";
import jwt from "jsonwebtoken";
import CalismaKarti from "../models/CalismaKarti.js";
import Ders from "../models/Ders.js";
import Kullanici from "../models/Kullanici.js";
import calismaKartiRoutes from "../routes/calismaKartiRoutes.js";
import { tekrarPlaniOlustur } from "../services/aralikliTekrarService.js";
import {
    calismaKartiDurumuGuncelle, calismaKartiTekrariniSifirla,
    calismaKartiTekrarlariniGetir, calismaKartlariniListele,
} from "../services/calismaKartiService.js";

const kimlik = n => String(n).padStart(24, "0");
const kullaniciId = kimlik(1), dersId = kimlik(2), digerKullanici = kimlik(3), digerDers = kimlik(4);
const args = { kullaniciId, dersId };
const tarih = deger => new Date(deger);
const eslesir = (kayit, filtre) => Object.entries(filtre).every(([alan, deger]) => {
    if (alan === "$or") return deger.some(f => eslesir(kayit, f));
    if (deger && typeof deger === "object") {
        return Object.entries(deger).every(([islem, deger]) => {
            const alanDegeri = kayit[alan];
            if (islem === "$exists") return Object.hasOwn(kayit, alan) === deger;
            if (islem === "$ne") return deger === null ? alanDegeri != null : alanDegeri !== deger;
            if (islem === "$lt") return alanDegeri < deger;
            if (islem === "$gte") return alanDegeri >= deger;
            return assert.fail(islem);
        });
    }
    return kayit[alan] === deger;
});
const zincir = deger => ({
    sort(sira) {
        if (sira.sonrakiTekrarTarihi) deger.sort((a, b) =>
            a.sonrakiTekrarTarihi - b.sonrakiTekrarTarihi || a._id.localeCompare(b._id));
        return this;
    },
    async lean() { return structuredClone(deger); }
});
const kart = (n, alanlar) => ({
    ...args, _id: kimlik(n), soru: "Soru", cevap: "Cevap", goruldu: true, yildizli: true,
    kaynaklar: [{ dosyaAdi: "ders.pdf" }], ...alanlar
});
const ortam = (kartlar = [], simdi = () => tarih("2026-11-28T12:00:00Z")) => {
    const dersler = [{ _id: dersId, kullaniciId }, { _id: digerDers, kullaniciId: digerKullanici }];
    return {
        simdi,
        DersModel: { findOne: f => zincir(dersler.find(ders => eslesir(ders, f))) },
        KartModel: {
            find: f => zincir(kartlar.filter(k => eslesir(k, f))),
            findOne: f => zincir(kartlar.find(k => eslesir(k, f))),
            findOneAndUpdate(f, u) {
                const guncel = kartlar.find(k => eslesir(k, f));
                if (!guncel) return zincir(null);
                Object.assign(guncel, u.$set);
                if (u.$inc?.__v) guncel.__v = (guncel.__v ?? 0) + u.$inc.__v;
                return zincir(guncel);
            }
        }
    };
};

test("Leitner tablosu, eski kayıt ve İstanbul gün değişimi", () => {
    const donusler = [[1, 1, 2], [1, 2, 3], [1, 3, 4], [1, 4, 4]];
    const sureler = [1, 3, 7, 14];
    const simdi = tarih("2026-12-31T21:01:00Z"); // İstanbul'da 1 Ocak.
    for (const seviye of [undefined, 1, 2, 3, 4]) {
        for (const [i, zorluk] of ["zor", "orta", "kolay"].entries()) {
            const plan = tekrarPlaniOlustur(seviye, zorluk, simdi);
            const sonuc = donusler[(seviye || 1) - 1][i];
            assert.equal(plan.tekrarSeviyesi, sonuc);
            assert.equal(plan.sonTekrarTarihi, simdi);
            assert.equal(plan.sonrakiTekrarTarihi.toISOString(), new Date(Date.UTC(2027, 0, sureler[sonuc - 1], 21)).toISOString());
        }
    }
    assert.equal(tekrarPlaniOlustur(1, "zor", tarih("2026-12-31T20:59:00Z")).sonrakiTekrarTarihi.toISOString(), "2026-12-31T21:00:00.000Z");
    const eski = new CalismaKarti({ ...args, zorluk: "kolay" });
    assert.equal(eski.tekrarSeviyesi, 1);
    assert.equal(eski.sonTekrarTarihi, null);
    assert.equal(eski.sonrakiTekrarTarihi, null);
});

test("günlük liste tarih sırasını, vade ve tamamlanan sınırlarını ve sahipliği korur", async () => {
    let simdi = tarih("2026-11-27T21:00:00Z");
    const deps = ortam([
        kart(14, { sonrakiTekrarTarihi: tarih("2026-11-28T19:00:00Z"), tekrarSeviyesi: 2 }),
        kart(13, { sonrakiTekrarTarihi: tarih("2026-11-27T21:00:00Z") }),
        kart(12, { sonrakiTekrarTarihi: tarih("2026-11-26T21:00:00Z") }),
        kart(11, { sonrakiTekrarTarihi: tarih("2026-11-26T21:00:00Z") }),
        kart(15, { sonrakiTekrarTarihi: tarih("2026-11-28T21:00:00Z") }),
        kart(16, { zorluk: "kolay" }),
        kart(17, { sonrakiTekrarTarihi: null }),
        kart(18, { kullaniciId: digerKullanici, sonrakiTekrarTarihi: tarih("2026-11-20") }),
        kart(19, { dersId: digerDers, sonrakiTekrarTarihi: tarih("2026-11-20") }),
        kart(20, { sonTekrarTarihi: tarih("2026-11-27T21:00:00Z"), sonrakiTekrarTarihi: tarih("2026-12-02T21:00:00Z") }),
        kart(21, { sonTekrarTarihi: tarih("2026-11-27T20:59:59Z"), sonrakiTekrarTarihi: tarih("2026-12-02T21:00:00Z") })
    ], () => simdi);
    const { kartlar, bekleyen, toplam, tamamlanan } = await calismaKartiTekrarlariniGetir(args, deps);
    assert.deepEqual(kartlar.map(k => k._id), [11, 12, 13, 14].map(kimlik));
    assert.equal(kartlar[0].konuId, undefined);
    assert.deepEqual(kartlar.at(-1).tekrarSureleri, { zor: 1, orta: 3, kolay: 7 });
    assert.deepEqual([bekleyen, tamamlanan, toplam], [4, 1, 5]);
    await assert.rejects(calismaKartiTekrarlariniGetir({ ...args, kullaniciId: digerKullanici }, deps), { status: 404 });
    simdi = tarih("2026-11-28T21:00:00Z");
    const ertesi = await calismaKartiTekrarlariniGetir(args, deps);
    assert.deepEqual([ertesi.bekleyen, ertesi.tamamlanan], [5, 0]);
});

test("değerlendirme, atlama, sıfırlama ve yeniden değerlendirme kalıcı kart alanlarını korur", async () => {
    const kayitlar = [kart(10, { goruldu: false }), kart(11, { tekrarSeviyesi: 2, sonrakiTekrarTarihi: tarih("2026-11-27") })];
    const deps = ortam(kayitlar);
    const durum = (kartId, alanlar) => calismaKartiDurumuGuncelle({ ...args, kartId: kimlik(kartId), ...alanlar }, deps);
    const yeni = await durum(10, { goruldu: true });
    assert.equal(yeni.sonrakiTekrarTarihi, undefined);
    assert.equal(yeni.tekrarSeviyesi, undefined);
    const atlanan = await durum(11, { goruldu: true });
    assert.equal(atlanan.sonrakiTekrarTarihi.toISOString(), "2026-11-27T00:00:00.000Z");
    assert.equal(atlanan.tekrarSeviyesi, 2);
    assert.equal((await calismaKartiTekrarlariniGetir(args, deps)).bekleyen, 1);

    await calismaKartiTekrariniSifirla({ ...args, kartId: kimlik(11), surum: 0 }, deps);
    const normalListe = await calismaKartlariniListele(args, deps);
    const silinmeyen = normalListe.find(k => k._id === kimlik(11));
    assert.deepEqual([silinmeyen.tekrarSeviyesi, silinmeyen.zorluk, silinmeyen.sonTekrarTarihi, silinmeyen.sonrakiTekrarTarihi],
        [1, null, null, null]);
    assert.deepEqual([silinmeyen.goruldu, silinmeyen.yildizli, silinmeyen.soru, silinmeyen.cevap, silinmeyen.kaynaklar],
        [true, true, "Soru", "Cevap", [{ dosyaAdi: "ders.pdf" }]]);
    assert.deepEqual(await calismaKartiTekrarlariniGetir(args, deps), { kartlar: [], bekleyen: 0, tamamlanan: 0, toplam: 0 });
    const planlanan = await durum(11, { zorluk: "kolay", surum: 1 });
    assert.equal(planlanan.tekrarSeviyesi, 2);
    assert.equal(planlanan.sonrakiTekrarTarihi.toISOString(), "2026-11-30T21:00:00.000Z");
    // Yeni bir servis çağrısı sadece depodaki alanlardan aynı sayıyı yeniden kurar.
    assert.deepEqual(await calismaKartiTekrarlariniGetir(args, ortam(structuredClone(kayitlar))),
        { kartlar: [], bekleyen: 0, tamamlanan: 1, toplam: 1 });
});

test("aynı sürümle çift değerlendirme veya sıfırlama yarışında tek yazma kabul edilir", async () => {
    const kayitlar = [kart(10, { tekrarSeviyesi: 2 }), kart(11, { tekrarSeviyesi: 2 })];
    const deps = ortam(kayitlar);
    const degerlendir = (n, surum) => calismaKartiDurumuGuncelle({ ...args, kartId: kimlik(n), zorluk: "kolay", surum }, deps);
    const sifirla = n => calismaKartiTekrariniSifirla({ ...args, kartId: kimlik(n), surum: 0 }, deps);
    const yariyiDogrula = async (a, b) => {
        const sonuclar = await Promise.allSettled([a, b]);
        assert.equal(sonuclar.filter(x => x.status === "fulfilled").length, 1);
        assert.equal(sonuclar.find(x => x.status === "rejected").reason.status, 409);
    };
    await yariyiDogrula(degerlendir(10, 0), degerlendir(10, 0));
    assert.equal(kayitlar[0].tekrarSeviyesi, 3);
    assert.equal(kayitlar[0].__v, 1);
    await assert.rejects(degerlendir(10, 0), { status: 409 });
    await yariyiDogrula(degerlendir(11, 0), sifirla(11));
    assert.equal(kayitlar[1].__v, 1);
    assert.equal(kayitlar[1].tekrarSeviyesi, 1);
    assert.equal(kayitlar[1].sonrakiTekrarTarihi, null);
    assert.equal(kayitlar[1].sonTekrarTarihi, null);
    await assert.rejects(degerlendir(11, 0), { status: 409 });
});

test("kimlik doğrulamalı tekrar rotaları, mevcut PATCH ve istemci tarihi", async t => {
    const deps = ortam([kart(11, { sonrakiTekrarTarihi: tarih("2000-01-01") })]);
    t.mock.method(Ders, "findOne", deps.DersModel.findOne);
    for (const metot of ["find", "findOne", "findOneAndUpdate"]) t.mock.method(CalismaKarti, metot, deps.KartModel[metot]);
    t.mock.method(Kullanici, "findById", _id => ({ async select() {
        return { _id, emailDogrulandi: true, oturumSurumu: 0 };
    } }));
    const eskiSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = "sentetik-aralikli-tekrar";
    t.after(() => {
        if (eskiSecret === undefined) delete process.env.JWT_SECRET;
        else process.env.JWT_SECRET = eskiSecret;
    });
    const app = express();
    app.use(express.json());
    app.use("/dersler", calismaKartiRoutes);
    const sunucu = app.listen(0, "127.0.0.1");
    await once(sunucu, "listening");
    t.after(() => new Promise(resolve => sunucu.close(resolve)));
    const istek = async (yol, kullanici = kullaniciId, body) => {
        const headers = { "Content-Type": "application/json" };
        if (kullanici) headers.Authorization = `Bearer ${jwt.sign({ id: kullanici }, process.env.JWT_SECRET)}`;
        const res = await fetch(`http://127.0.0.1:${sunucu.address().port}/dersler/${dersId}/calisma-kartlari/${yol}`, {
            headers, method: body ? "PATCH" : "GET", body: JSON.stringify(body)
        });
        return { status: res.status, veri: await res.json() };
    };
    assert.equal((await istek("tekrarlar", "")).status, 401);
    assert.equal((await istek("tekrarlar", digerKullanici)).status, 404);
    assert.equal((await istek("tekrarlar")).veri.bekleyen, 1);
    assert.equal((await istek(kimlik(11), kullaniciId, { zorluk: "kolay" })).status, 400);
    const sonuc = await istek(kimlik(11), kullaniciId, {
        zorluk: "kolay", surum: 0, tekrarSeviyesi: 4, sonrakiTekrarTarihi: "2000-01-01"
    });
    assert.equal(sonuc.status, 200);
    assert.equal(sonuc.veri.kart.tekrarSeviyesi, 2);
    assert.notEqual(sonuc.veri.kart.sonrakiTekrarTarihi, "2000-01-01");
    assert.equal((await istek(`${kimlik(11)}/tekrar/sifirla`, kullaniciId, { surum: 0 })).status, 409);
    assert.equal((await istek(`${kimlik(11)}/tekrar/sifirla`, kullaniciId, { surum: 1 })).status, 200);
    assert.deepEqual((await istek("tekrarlar")).veri, { kartlar: [], bekleyen: 0, tamamlanan: 0, toplam: 0 });
});

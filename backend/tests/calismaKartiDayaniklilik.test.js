import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import mongoose from "mongoose";
import { calismaKartlariniOlustur, calismaKartlariDurumunuGetir } from "../services/calismaKartiService.js";

const sorgu = (deger) => ({
    select() { return this; },
    sort() { return this; },
    lean() { return Promise.resolve(typeof deger === "function" ? deger() : deger); },
});
const veriOlustur = ({ konular = ["Eksik Veri", "Veri Kalitesi"], uret, oncekiKartlar = [] } = {}) => {
    const kullaniciId = new mongoose.Types.ObjectId();
    const dersId = new mongoose.Types.ObjectId();
    const materyalId = new mongoose.Types.ObjectId();
    const islemeId = new mongoose.Types.ObjectId();
    const ders = {
        _id: dersId, kullaniciId, dersAdi: "Uygulamalı Veri Bilimi", materyallerOnaylandi: true,
        kartUretimHedefKonuIds: [], kartTamamlananKonuIds: [],
        kartAtlananKonuIds: [], kartKaynakSurumImzasi: "", kartUretimToken: null,
    };
    const materyaller = [{ _id: materyalId, aktifIslemeId: islemeId, dosyaAdi: "hafta.pdf" }];
    const metinler = konular.map((baslik, i) => ({
        _id: new mongoose.Types.ObjectId(),
        konuId: "k" + i, materyalId, islemeId, parcaIndex: i,
        icerik: (
            baslik + ", üniversitedeki veri analizinde önemli bir kavramdır. " +
            baslik + " analizin güvenilirliğini değerlendirmede kullanılır. "
        ).repeat(12),
    }));
    const harita = { anaKonular: konular.map((baslik, i) => ({ konuId: "k" + i, baslik, altKonular: [] })) };
    const kartlar = [...oncekiKartlar];
    const DersModel = {
        findOne(filtre) {
            const uygun = !filtre.kartUretimToken ||
                String(filtre.kartUretimToken) === String(ders.kartUretimToken);
            return sorgu(uygun ? ders : null);
        },
        async findOneAndUpdate(filtre, degisiklik) {
            if (ders.kartUretimToken != null) return null;
            Object.assign(ders, degisiklik.$set || {});
            return { ...ders };
        },
        async updateOne(filtre, guncelleme) {
            if (String(filtre.kartUretimToken) !== String(ders.kartUretimToken)) return { matchedCount: 0 };
            Object.assign(ders, guncelleme.$set || {});
            for (const [alan, deger] of Object.entries(guncelleme.$addToSet || {})) {
                ders[alan] = [...new Set([...(ders[alan] || []), ...deger.$each])];
            }
            return { matchedCount: 1 };
        },
    };
    const KartModel = {
        find() { return sorgu(() => [...kartlar]); },
        async bulkWrite(islemler) {
            for (const islem of islemler) {
                const k = islem.updateOne.update.$setOnInsert;
                if (!kartlar.some((x) => x.soruKimligi === k.soruKimligi && x.konuId === k.konuId)) {
                    kartlar.push({ _id: new mongoose.Types.ObjectId(), ...k });
                }
            }
        },
    };
    const MateryalModel = { find() { return sorgu(materyaller); } };
    const ParcaModel = { find() { return sorgu(metinler); } };
    const HaritaModel = { findOne() { return sorgu(harita); } };
    return {
        args: { kullaniciId, dersId },
        ders, kartlar,
        deps: { DersModel, KartModel, MateryalModel, ParcaModel, HaritaModel,
            eslestir: (_, konu) => metinler.filter((p) => p.konuId === konu.konuId),
            uret: uret || (async () => ({ kartlar: [] })),
        },
    };
};

test("Gemini boş cevap verse de her konu kaynak metninden tamamlanır", async () => {
    const v = veriOlustur();
    const sonuc = await calismaKartlariniOlustur(v.args, v.deps);
    assert.equal(sonuc.tamamlandi, true);
    assert.equal(sonuc.tamamlananKonuSayisi, 2);
    assert.equal(sonuc.atlananKonuSayisi, 0);
    assert.equal(sonuc.kartlar.length, 2);
    assert.ok(sonuc.kartlar.every((k) => k.uretimYontemi === "kaynak"));
    assert.ok(sonuc.kartlar.every((k) => k.cevap.includes(k.konuBasligi)));
    const tekrar = await calismaKartlariniOlustur(v.args, v.deps);
    assert.equal(tekrar.kartlar.length, 2);
});

test("Gemini 502 dönerse yeniden deneme döngüsüne girmeden güvenli kart üretilir", async () => {
    let cagrilar = 0;
    const v = veriOlustur({ uret: async () => {
        cagrilar += 1;
        throw Object.assign(new Error("Invalid JSON"), { status: 502, kod: "GEMINI_GECERSIZ_YANIT" });
    } });
    const sonuc = await calismaKartlariniOlustur(v.args, v.deps);
    assert.equal(cagrilar, 1);
    assert.equal(sonuc.tamamlandi, true);
    assert.equal(sonuc.kartlar.length, 2);
});

test("Gemini 429 kalıcı olarak saklanmaz; önceki kartlar korunur, yerel modla devam edilir", async () => {
    let cagrilar = 0;
    const v = veriOlustur({ uret: async () => {
        cagrilar += 1;
        throw Object.assign(new Error("Quota exhausted"), { status: 429, kod: "GEMINI_KOTA_ASIMI" });
    } });
    await assert.rejects(calismaKartlariniOlustur(v.args, v.deps), (hata) => hata.status === 429);
    assert.equal(v.kartlar.length, 0);
    const sonuc = await calismaKartlariniOlustur({ ...v.args, yalnizcaKaynak: true }, v.deps);
    assert.equal(sonuc.tamamlandi, true);
    assert.equal(sonuc.kartlar.length, 2);
    assert.equal(cagrilar, 1);
});

test("Kanıt içermeyen konu atlanır, diğer konuların kartları korunur", async () => {
    const v = veriOlustur({ konular: ["Eksik Veri", "Veri Kalitesi"] });
    v.deps.eslestir = (parcalar, konu) => parcalar.filter((p) => p.konuId === konu.konuId);
    // İkinci konunun kaynağında konuya ilişkin terim yok, yalnızca tekrar eden metin var.
    const original = v.deps.uret;
    v.deps.uret = original;
    const model = v.deps.ParcaModel;
    const parcaBul = model.find.bind(model);
    // Metni değiştirirken MongoDB kesitlerinin tek kaynağı mock olarak aynı kalır.
    const gecersiz = { materyalId: new mongoose.Types.ObjectId(), parcaIndex: 9,
        icerik: "Bambaşka ve ilgisiz bilgiler analiz raporunda aktarılmaktadır. ".repeat(30) };
    v.deps.eslestir = (p, konu) => konu.konuId === "k1" ? [gecersiz] : p.filter((x) => x.konuId === konu.konuId);
    const sonuc = await calismaKartlariniOlustur(v.args, v.deps);
    assert.equal(sonuc.tamamlandi, true);
    assert.equal(sonuc.atlananKonuSayisi, 1);
    assert.equal(sonuc.kartlar.length, 1);
    assert.equal((await calismaKartlariDurumunuGetir(v.args, v.deps)).atlananKonuSayisi, 1);
});

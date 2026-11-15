import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import CalismaKarti from "../models/CalismaKarti.js";
import {
    dersKartGruplariniOlustur, dersKartlariniDogrula,
    kartDersKaynakImzasi,
} from "../services/dersKartPlanlama.mjs";

const materyaller = [{ _id: "m1", aktifIslemeId: "v1", dosyaAdi: "Hafta1.pdf" },
    { _id: "m2", aktifIslemeId: "v2", dosyaAdi: "Hafta2.pdf" }];
test("Her ders metni hiçbir konu haritasına bakılmadan Gemini gruplarına alınır", () => {
    const parcalar = [
        { materyalId: "m1", islemeId: "v1", parcaIndex: 0,
            icerik: "İlk bölüm " + "Veri türleri sayısal ve kategoriktir. ".repeat(75) },
        { materyalId: "m2", islemeId: "v2", parcaIndex: 0,
            icerik: "İkinci bölüm " + "Bayes teoremi koşullu olasılığı açıklar. ".repeat(88) },
    ];
    const gruplar = dersKartGruplariniOlustur(parcalar, materyaller, {
        grupKarakterLimiti: 1200, parcaKarakterLimiti: 700,
    });
    assert.ok(gruplar.length > 2);
    assert.equal(gruplar.flatMap((g) => g.kaynaklar).filter((k) => k.materyalId === "m1")
        .map((k) => k.icerik).join(""), parcalar[0].icerik);
    assert.equal(gruplar.flatMap((g) => g.kaynaklar).filter((k) => k.materyalId === "m2")
        .map((k) => k.icerik).join(""), parcalar[1].icerik);
    assert.ok(gruplar.every((g) => g.kaynaklar.length > 0 &&
        g.kaynaklar.every((k) => !("konuId" in k))));
    assert.ok(gruplar.some((g) => g.metin.includes("Hafta1.pdf")));
    assert.ok(gruplar.some((g) => g.metin.includes("Hafta2.pdf")));
});

test("Gemini 20 farklı öğretici soru yazarsa 8 kart kotası nedeniyle kesilmez", () => {
    const kaynaklar = [{ kod: "K1", materyalId: "m1", dosyaAdi: "Hafta.pdf", parcaIndex: 0 }];
    const hamKartlar = Array.from({ length: 20 }, (_, i) => ({
        soru: "Dersin " + i + ". kavramı neyi açıklar?",
        cevap: "Bilgi " + i + ".",
        kaynakKodlari: ["K1"], konuId: "uydurulmus-konu",
    }));
    const { kartlar, gecersiz } = dersKartlariniDogrula({ hamKartlar, kaynaklar });
    assert.equal(gecersiz, 0);
    assert.equal(kartlar.length, 20);
    assert.ok(kartlar.every((k) => !("konuId" in k) && !("konuBasligi" in k)));
});

test("İlave kartlar kaynakları doğrular, önceki soruları tekrar etmez", () => {
    const kaynaklar = [{ kod: "K2", materyalId: "m1", dosyaAdi: "Kaynak.pdf", parcaIndex: 4 }];
    const { kartlar, gecersiz, tekrar } = dersKartlariniDogrula({
        kaynaklar,
        mevcutKartlar: [{ konuId: "eski", soru: "CRISP-DM nedir?" }],
        hamKartlar: [
            { soru: "CRISP-DM nedir?", cevap: "Ders projesidir.", kaynakKodlari: ["K2"] },
            { soru: "CRISP-DM hangi amaçla kullanılır?", cevap: "Proje yönetir.", kaynakKodlari: ["K999"] },
            { soru: "KDD aşamaları neyi içerir?", cevap: "Veri ön işlemeden keşfe kadar süreci.", kaynakKodlari: ["K2"] },
        ],
    });
    assert.equal(kartlar.length, 1);
    assert.equal(gecersiz, 1);
    assert.equal(tekrar, 1);
    assert.equal(kartlar[0].kaynaklar[0].parcaIndex, 4);
});

test("Materyal değişince kurs sürümü değişir; konu haritasından bağımsızdır", () => {
    const parcalar = [{ materyalId: "m1", islemeId: "v1", parcaIndex: 0, icerik: "MCAR açıklama" }];
    const ilk = kartDersKaynakImzasi(materyaller, parcalar);
    assert.notEqual(ilk, kartDersKaynakImzasi(materyaller, [
        { ...parcalar[0], icerik: "MAR açıklama" },
    ]));
    assert.notEqual(ilk, kartDersKaynakImzasi([
        { ...materyaller[0], aktifIslemeId: "v3" }, materyaller[1],
    ], parcalar));
});

test("Yeni kart modelinde konuId zorunlu değildir, kaynak ve öğrenci durumu korunur", async () => {
    const kart = new CalismaKarti({
        kullaniciId: new mongoose.Types.ObjectId(),
        dersId: new mongoose.Types.ObjectId(),
        soru: "Aykırı değer nasıl tespit edilir?",
        cevap: "IQR ile incelenebilir.",
        kaynaklar: [{
            materyalId: new mongoose.Types.ObjectId(),
            dosyaAdi: "Hafta3.pdf", parcaIndex: 8,
        }],
    });
    await kart.validate();
    assert.equal(kart.konuId, undefined);
    assert.equal(kart.goruldu, false);
    await assert.rejects(new CalismaKarti({
        kullaniciId: new mongoose.Types.ObjectId(),
        dersId: new mongoose.Types.ObjectId(),
        soru: "Kaynağı olmayan soru?", cevap: "Yanıt", kaynaklar: [],
    }).validate());
});

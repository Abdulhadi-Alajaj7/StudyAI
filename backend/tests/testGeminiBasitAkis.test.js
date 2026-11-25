import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import TestModel from "../models/Test.js";
import { testOlustur } from "../services/testService.js";

const zincir = (veri) => ({
    select() { return this; },
    sort() { return this; },
    async lean() { return veri; },
});

test("hazır harita atamaları embedding olmadan iletilir; eksik konu kapsamı kaydedilmez", async () => {
    const kullaniciId = new mongoose.Types.ObjectId();
    const dersId = new mongoose.Types.ObjectId();
    const materyalId = new mongoose.Types.ObjectId();
    const islemeId = new mongoose.Types.ObjectId();
    const metin = (ad) => (ad + " öğrenme içeriği. ").repeat(50);
    const harita = {
        parcaAtamaSurumu: 1,
        anaKonular: [{
            konuId: "top-temel", baslik: "Temel", aciklama: "Temel konular",
            kaynakMateryalIds: [materyalId],
            altKonular: [
                { konuId: "sub-a", baslik: "A konusu", kaynakMateryalIds: [materyalId] },
                { konuId: "sub-b", baslik: "B konusu", kaynakMateryalIds: [materyalId] },
            ],
        }],
        parcaKonuAtamalari: [
            { materyalId, islemeId, parcaIndex: 0, konuIds: ["sub-a"] },
            { materyalId, islemeId, parcaIndex: 1, konuIds: ["sub-b"] },
        ],
    };
    const materyal = {
        _id: materyalId, durum: "hazir", aktifIslemeId: islemeId,
        dosyaAdi: "ders.pdf", orijinalDosyaAdi: "ders.pdf",
    };
    const parcalar = [
        { materyalId, islemeId, parcaIndex: 0, icerik: metin("A") },
        { materyalId, islemeId, parcaIndex: 1, icerik: metin("B") },
    ];
    let secilenHaritaAlanlari = "";
    let geminiGirdisi;
    let embeddingCagrildi = false;
    const bagimliliklar = {
        DersModel: { findOne: () => zincir({
            _id: dersId, dersAdi: "Deneme Dersi", aciklama: "",
        }) },
        KonuHaritasiModel: { findOne: () => ({
            select(alanlar) { secilenHaritaAlanlari = alanlar; return this; },
            async lean() { return harita; },
        }) },
        MateryalModel: { find: () => zincir([materyal]) },
        MetinParcasiModel: { find: () => zincir(parcalar) },
        TestModel: { async create(veri) {
            const belge = new TestModel(veri);
            assert.equal(belge.validateSync(), undefined);
            return belge;
        } },
        semanticArama: async () => { embeddingCagrildi = true; throw Error("Embedding çağrılmamalı"); },
        geminiTestUret: async (girdi) => {
            geminiGirdisi = girdi;
            return {
                model: "mock-model",
                sorular: [{
                    metin: "A ile ilgili soru nedir?",
                    secenekler: ["A", "B", "C", "D"].map((anahtar) => ({
                        anahtar, metin: anahtar + " seçeneği",
                    })),
                    dogruCevap: "A",
                    aciklama: "Kaynak içeriğine dayanır.",
                    zorluk: "orta", konuId: "sub-a", konuBasligi: "A konusu",
                    kaynaklar: [], ogrenciCevabi: null, isaretli: false,
                }],
                kismiUretimNedeni: "KAYNAK_KAPASITESI",
            };
        },
        testTanilamaYaz: () => {},
        kaynakButcesi: 40_000,
    };
    await assert.rejects(testOlustur({
        kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "top-temel", soruSayisi: 10, zorluk: "orta",
    }, bagimliliklar), { kod: "TEST_HEDEFI_KARSILANAMADI" });
    assert.equal(embeddingCagrildi, false);
    assert.match(secilenHaritaAlanlari, /parcaKonuAtamalari/);
    assert.equal(geminiGirdisi.konuEslesmeleriZorunlu, true);
    assert.equal(geminiGirdisi.kaynaklar.length, 2);
    assert.deepEqual(
        new Set(geminiGirdisi.kaynaklar.map((kaynak) => kaynak.konuIds[0])),
        new Set(["sub-a", "sub-b"])
    );
    assert.equal(geminiGirdisi.konuDagilimi[0].adet, 5);
    assert.equal(geminiGirdisi.konuDagilimi[1].adet, 5);
});

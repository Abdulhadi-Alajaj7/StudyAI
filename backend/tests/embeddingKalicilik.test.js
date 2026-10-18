import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const kullaniciId = new mongoose.Types.ObjectId();
const dersId = new mongoose.Types.ObjectId();
const materyalId = new mongoose.Types.ObjectId();
const islemeId = new mongoose.Types.ObjectId();

let parcalar;
let onbellek;
let yazmaIslemleri;

const zincir = (deger) => ({
    select() { return this; },
    sort() { return this; },
    async lean() { return deger; },
});

mock.module("../models/MetinParcasi.js", {
    defaultExport: {
        find(filtre) {
            return zincir(filtre.materyalId ? parcalar : onbellek);
        },
        async bulkWrite(islemler) {
            yazmaIslemleri = islemler;
        },
        async updateMany() {}
    }
});

const { materyalEmbeddingleriniOlustur } = await import("../services/embeddingService.js");

const ayarlar = {
    model: "gemini-embedding-001",
    boyut: 3,
    batchBoyutu: 20,
    rpm: 90,
    tpm: 27_000,
    rpd: 900,
    maksDeneme: 1,
};

const materyal = {
    _id: materyalId,
    kullaniciId,
    dersId,
    orijinalDosyaAdi: "ders.pdf",
};

beforeEach(() => {
    parcalar = [
        { _id: new mongoose.Types.ObjectId(), icerik: "aynı bölüm", parcaIndex: 0 },
        { _id: new mongoose.Types.ObjectId(), icerik: "aynı bölüm", parcaIndex: 1 },
    ];
    onbellek = [];
    yazmaIslemleri = [];
});

test("aynı içerikli parçayı bir kez üretir ve embedding'i tüm staging kayıtlarına kalıcı yazar", async () => {
    let apiCagrisi = 0;
    const istemci = {
        models: {
            async embedContent() {
                apiCagrisi += 1;
                return { embeddings: [{ values: [3, 4, 0] }] };
            }
        }
    };

    const sonuc = await materyalEmbeddingleriniOlustur(materyal, islemeId, {
        ayarlar,
        istemci,
        limitUygula: false,
    });

    assert.equal(apiCagrisi, 1);
    assert.equal(sonuc.apiIleOlusturulan, 1);
    assert.equal(yazmaIslemleri.length, 2);
    for (const islem of yazmaIslemleri) {
        const alanlar = islem.updateOne.update.$set;
        assert.deepEqual(alanlar.embedding, [0.6, 0.8, 0]);
        assert.equal(alanlar.embeddingDurumu, "hazir");
        assert.equal(alanlar.embeddingModel, ayarlar.model);
        assert.equal(alanlar.embeddingBoyutu, ayarlar.boyut);
    }
});

test("aynı kullanıcıdaki aynı model/boyut/girdi hash'ini API çağrısı yapmadan yeniden kullanır", async () => {
    const ilkIstemci = {
        models: {
            async embedContent() {
                return { embeddings: [{ values: [1, 0, 0] }] };
            }
        }
    };
    await materyalEmbeddingleriniOlustur(materyal, islemeId, {
        ayarlar,
        istemci: ilkIstemci,
        limitUygula: false,
    });

    const ilkAlanlar = yazmaIslemleri[0].updateOne.update.$set;
    onbellek = [{
        embeddingGirdiHash: ilkAlanlar.embeddingGirdiHash,
        embedding: ilkAlanlar.embedding,
    }];
    yazmaIslemleri = [];

    const kullanilmamasiGerekenIstemci = {
        models: {
            async embedContent() {
                throw new Error("API çağrılmamalı");
            }
        }
    };
    const sonuc = await materyalEmbeddingleriniOlustur(materyal, islemeId, {
        ayarlar,
        istemci: kullanilmamasiGerekenIstemci,
        limitUygula: false,
    });

    assert.equal(sonuc.apiIleOlusturulan, 0);
    assert.equal(sonuc.onbellektenKullanilan, 2);
    assert.equal(yazmaIslemleri.length, 2);
});


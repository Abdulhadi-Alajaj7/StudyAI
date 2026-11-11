import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import crypto from "node:crypto";

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
            return zincir(filtre.materyalId ? parcalar : [...onbellek, ...parcalar.filter(p => p.embeddingDurumu === "hazir")]);
        },
        async bulkWrite(islemler) {
            yazmaIslemleri = islemler;
            for (const islem of islemler) {
                const parca = parcalar.find(p => String(p._id) === String(islem.updateOne.filter._id));
                if (parca) Object.assign(parca, islem.updateOne.update.$set);
            }
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

test("sunucu yeniden başlamış olsa da MongoDB'deki embedding'i API çağrısı yapmadan yeniden kullanır", async () => {
    const embeddingGirdiHash = crypto
        .createHash("sha256")
        .update(`${ayarlar.model}\0${ayarlar.boyut}\0${materyal.orijinalDosyaAdi}\0${parcalar[0].icerik}`)
        .digest("hex");
    onbellek = [{
        embeddingGirdiHash,
        embedding: [1, 0, 0],
    }];

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

test("sonraki embedding partisi hata verse de önceki parti saklanır ve retry onu tekrar üretmez", async () => {
    parcalar[1].icerik = "farklı bölüm";
    let cagrilar = 0;
    const istemci = { models: { async embedContent() {
        cagrilar++;
        if (cagrilar === 2) throw Object.assign(new Error("quota"), { status: 429 });
        return { embeddings: [{ values: [1, 0, 0] }] };
    } } };
    const secenekler = { ayarlar: { ...ayarlar, batchBoyutu: 1 }, istemci, limitUygula: false };
    await assert.rejects(materyalEmbeddingleriniOlustur(materyal, islemeId, secenekler), { status: 429 });
    assert.deepEqual(parcalar[0].embedding, [1, 0, 0]);
    assert.equal(parcalar[0].embeddingDurumu, "hazir");
    const sonuc = await materyalEmbeddingleriniOlustur(materyal, islemeId, secenekler);
    assert.equal(cagrilar, 3);
    assert.equal(sonuc.onbellektenKullanilan, 1);
    assert.equal(sonuc.apiIleOlusturulan, 1);
});

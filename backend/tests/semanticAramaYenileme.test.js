import { test, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const materyalId = new mongoose.Types.ObjectId();
const kullaniciId = new mongoose.Types.ObjectId();
const aktifIslemeId = new mongoose.Types.ObjectId();

mock.module("../models/Materyal.js", {
    defaultExport: {
        async findOneAndUpdate() {
            return { _id: materyalId, kullaniciId, aktifIslemeId, durum: "hazir" };
        },
        async updateOne() {
            return { matchedCount: 0, modifiedCount: 0 };
        }
    }
});

mock.module("../services/semanticAramaService.js", {
    namedExports: { async semanticAramaYap() { return { sonuclar: [], meta: {} }; } }
});

mock.module("../services/embeddingService.js", {
    namedExports: {
        embeddingAyarlariGetir() { return { model: "gemini-embedding-001", boyut: 768 }; },
        embeddingKullaniciHatasi() { return "Semantik arama dizini oluşturulamadı."; },
        async materyalEmbeddingleriniOlustur() {
            return { model: "gemini-embedding-001", boyut: 768 };
        }
    }
});

const { materyalEmbeddingleriniYenile } = await import("../controllers/semanticAramaController.js");

const responseMock = () => ({
    statusCode: 200,
    body: null,
    status(kod) { this.statusCode = kod; return this; },
    json(govde) { this.body = govde; return this; },
});

test("embedding yenilenirken aktif sürüm değişirse eski sürüm için başarı yanıtı vermez", async () => {
    const res = responseMock();
    await materyalEmbeddingleriniYenile(
        { params: { id: materyalId.toString() }, user: { _id: kullaniciId } },
        res
    );

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.kod, "EMBEDDING_SURUM_DEGISTI");
    assert.match(res.body.hata, /değişti/);
});


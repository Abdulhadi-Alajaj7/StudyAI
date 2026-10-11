
import { test, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const dersId = new mongoose.Types.ObjectId();
const kullaniciId = new mongoose.Types.ObjectId();

let createError = null;
let createCalls = 0;
let geminiCalls = 0;

mock.module("../models/Ders.js", {
    namedExports: {},
    defaultExport: {
        findOne: async () => ({ _id: dersId, kullaniciId })
    }
});

mock.module("../models/Materyal.js", {
    namedExports: {},
    defaultExport: {
        countDocuments: async () => 1
    }
});

mock.module("../models/KonuHaritasi.js", {
    namedExports: {},
    defaultExport: {
        findOne: async () => null,
        create: async () => {
            createCalls++;

            if (createError) {
                throw createError;
            }

            return {
                _id: new mongoose.Types.ObjectId(),
                dersId,
                kullaniciId,
                durum: "olusturuluyor"
            };
        }
    }
});

mock.module("../services/konuHaritasiService.js", {
    namedExports: {
        konuHaritasiUretVeKaydet: async () => {
            geminiCalls++;
            return { durum: "hazir" };
        },
        konuHaritasiGuncellikKontrolu: async () => true
    }
});

mock.module("../services/geminiService.js", {
    namedExports: {
        geminiBaglantisiniDogrula: async () => ({
            basarili: true
        }),
        VARSAYILAN_GEMINI_MODELI: "test-model"
    }
});

const { konuHaritasiOlustur } = await import(
    "../controllers/konuHaritasiController.js"
);

function responseMock() {
    return {
        statusCode: 200,
        body: null,
        status(code) {
            this.statusCode = code;
            return this;
        },
        json(data) {
            this.body = data;
            return this;
        }
    };
}

test("E11000 hatası HTTP 409 döndürür", async () => {
    createError = Object.assign(
        new Error("E11000 duplicate key"),
        { code: 11000 }
    );

    createCalls = 0;
    geminiCalls = 0;

    const req = {
        params: { id: dersId.toString() },
        user: { _id: kullaniciId }
    };

    const res = responseMock();

    await konuHaritasiOlustur(req, res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.hata, /zaten başlatılmış/);
    assert.equal(createCalls, 1);
    assert.equal(geminiCalls, 0);
});

test("Normal oluşturma HTTP 200 döndürür", async () => {
    createError = null;
    createCalls = 0;
    geminiCalls = 0;

    const req = {
        params: { id: dersId.toString() },
        user: { _id: kullaniciId }
    };

    const res = responseMock();

    await konuHaritasiOlustur(req, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.durum, "hazir");
    assert.equal(createCalls, 1);
    assert.equal(geminiCalls, 1);
});

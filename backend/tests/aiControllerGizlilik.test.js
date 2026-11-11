import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Test from "../models/Test.js";
import { sohbetleriGetir } from "../controllers/sohbetController.js";
import { dersOzetiGetir } from "../controllers/dersOzetiController.js";
import { testDetayiniGetir } from "../controllers/testController.js";

test("AI controller beklenmeyen hataları ham mesaj/anahtar/materyal loglamadan döndürür", async t => {
    const loglar = [];
    const hata = new Error("sentetik-gizli-anahtar / sentetik-ham-materyal / sentetik-kullanici-mesaji");
    t.mock.method(console, "error", (...args) => loglar.push(args));
    t.mock.method(Ders, "findOne", () => { throw hata; });
    t.mock.method(Test, "findOne", () => { throw hata; });
    const kimlik = () => String(new mongoose.Types.ObjectId());
    for (const controller of [sohbetleriGetir, dersOzetiGetir, testDetayiniGetir]) {
        const req = {
            user: { _id: kimlik() }, params: { dersId: kimlik(), testId: kimlik() },
            query: { tur: "tum_ders", uzunluk: "orta" },
        };
        const res = {
            status(kod) { this.kod = kod; return this; },
            json(veri) { this.veri = veri; return this; },
        };
        await controller(req, res);
        assert.equal(res.kod, 500);
        assert.doesNotMatch(JSON.stringify(res.veri), /sentetik-/);
    }
    assert.equal(loglar.length, 3);
    assert.doesNotMatch(JSON.stringify(loglar), /sentetik-/);
    assert.ok(loglar.every(s => s[1].kod === "BEKLENMEYEN_SUNUCU_HATASI"));
});

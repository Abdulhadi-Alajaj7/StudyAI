import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const dersId = new mongoose.Types.ObjectId();
const kullaniciId = new mongoose.Types.ObjectId();

let ders;
let harita;
let hazirMateryalSayisi;
let sayimBeklemesi;
let sayimiSurdur;
let uretimCagrisi;
let uretimBeklemesi;

const ayniId = (sol, sag) => String(sol) === String(sag);

const filtreEslesiyor = (belge, filtre) => {
    if (!belge) return false;
    for (const [alan, beklenen] of Object.entries(filtre)) {
        const gercek = belge[alan];
        if (beklenen && typeof beklenen === "object") {
            if (Object.hasOwn(beklenen, "$ne")) {
                if (gercek === beklenen.$ne) return false;
                continue;
            }
            if (Object.hasOwn(beklenen, "$gt")) {
                if (!(gercek > beklenen.$gt)) return false;
                continue;
            }
        }
        if (!ayniId(gercek, beklenen)) return false;
    }
    return true;
};

const DersMock = {
    async findOneAndUpdate(filtre, guncelleme) {
        if (!filtreEslesiyor(ders, filtre)) return null;
        if (guncelleme.$inc) {
            for (const [alan, miktar] of Object.entries(guncelleme.$inc)) {
                ders[alan] = (ders[alan] || 0) + miktar;
            }
        }
        if (guncelleme.$set) Object.assign(ders, guncelleme.$set);
        return { ...ders };
    },
    async findOne(filtre) {
        return filtreEslesiyor(ders, filtre) ? { ...ders } : null;
    }
};

mock.module("../models/Ders.js", { defaultExport: DersMock });
mock.module("../models/Materyal.js", {
    defaultExport: {
        async countDocuments() {
            if (sayimBeklemesi) await sayimBeklemesi;
            return hazirMateryalSayisi;
        }
    }
});
mock.module("../models/KonuHaritasi.js", {
    defaultExport: {
        async findOne() { return harita ? { ...harita } : null; },
        async create(veri) {
            harita = { _id: new mongoose.Types.ObjectId(), ...veri };
            return { ...harita };
        },
        async findOneAndUpdate(_filtre, guncelleme) {
            if (!harita) return null;
            Object.assign(harita, guncelleme.$set || {});
            return { ...harita };
        }
    }
});
mock.module("../services/konuHaritasiService.js", {
    namedExports: {
        async konuHaritasiUretVeKaydet() {
            uretimCagrisi++;
            if (uretimBeklemesi) await uretimBeklemesi;
            harita = { ...harita, durum: "hazir", aktifIslemToken: null };
            return { ...harita };
        },
        async konuHaritasiGuncellikKontrolu() { return true; }
    }
});
mock.module("../services/geminiService.js", {
    namedExports: {
        async geminiBaglantisiniDogrula() { return { basarili: true }; },
        VARSAYILAN_GEMINI_MODELI: "test-model"
    }
});

const { konuHaritasiOlustur } = await import("../controllers/konuHaritasiController.js");

const responseMock = () => ({
    statusCode: 200,
    body: null,
    status(kod) { this.statusCode = kod; return this; },
    json(govde) { this.body = govde; return this; }
});

const istek = () => ({
    params: { id: dersId.toString() },
    user: { _id: kullaniciId }
});

beforeEach(() => {
    ders = {
        _id: dersId,
        kullaniciId,
        materyallerOnaylandi: false,
        temizleniyor: false,
        aktifMateryalIslemSayisi: 0
    };
    harita = null;
    hazirMateryalSayisi = 1;
    sayimBeklemesi = null;
    sayimiSurdur = null;
    uretimCagrisi = 0;
    uretimBeklemesi = null;
});

test("temizleniyor durumundaki ders için manuel konu haritası işlemi başlamaz ve sayaç değişmez", async () => {
    ders.temizleniyor = true;
    const res = responseMock();

    await konuHaritasiOlustur(istek(), res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.hata, /temizlendiği/);
    assert.equal(ders.aktifMateryalIslemSayisi, 0);
    assert.equal(uretimCagrisi, 0);
    assert.equal(harita, null);
});

test("onaylanmış ders için konu haritası yeniden oluşturulamaz", async () => {
    ders.materyallerOnaylandi = true;
    const res = responseMock();

    await konuHaritasiOlustur(istek(), res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.hata, /onaylandığı/);
    assert.equal(ders.aktifMateryalIslemSayisi, 0);
    assert.equal(uretimCagrisi, 0);
    assert.equal(harita, null);
});

test("temizlik kilidi önce kazanırsa eşzamanlı konu haritası başlangıcı reddedilir", async () => {
    const temizlikKilidi = await DersMock.findOneAndUpdate(
        {
            _id: dersId,
            temizleniyor: { $ne: true },
            aktifMateryalIslemSayisi: 0
        },
        { $set: { temizleniyor: true } }
    );
    assert.ok(temizlikKilidi);

    const res = responseMock();
    await konuHaritasiOlustur(istek(), res);

    assert.equal(res.statusCode, 409);
    assert.equal(ders.aktifMateryalIslemSayisi, 0);
    assert.equal(uretimCagrisi, 0);
});

test("konu haritası sayacı önce artırılırsa eşzamanlı temizlik kilidi alınamaz", async () => {
    sayimBeklemesi = new Promise((resolve) => { sayimiSurdur = resolve; });
    const res = responseMock();
    const islem = konuHaritasiOlustur(istek(), res);

    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(ders.aktifMateryalIslemSayisi, 1);

    const temizlikKilidi = await DersMock.findOneAndUpdate(
        {
            _id: dersId,
            temizleniyor: { $ne: true },
            aktifMateryalIslemSayisi: 0
        },
        { $set: { temizleniyor: true } }
    );
    assert.equal(temizlikKilidi, null);

    sayimiSurdur();
    await islem;
    assert.equal(res.statusCode, 200);
    assert.equal(ders.aktifMateryalIslemSayisi, 0);
});

test("normal ders için konu haritası tamamlanır ve sayaç bir kez azaltılır", async () => {
    const res = responseMock();

    await konuHaritasiOlustur(istek(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(uretimCagrisi, 1);
    assert.equal(ders.aktifMateryalIslemSayisi, 0);
    assert.equal(harita.durum, "hazir");
});

test("güncel heartbeat bulunan uzun işlem eski updatedAt nedeniyle devralınmaz", async () => {
    harita = {
        _id: new mongoose.Types.ObjectId(),
        dersId,
        kullaniciId,
        durum: "olusturuluyor",
        aktifIslemToken: new mongoose.Types.ObjectId(),
        updatedAt: new Date(Date.now() - 10 * 60 * 1000),
        kilitSonYenilemeTarihi: new Date()
    };
    const res = responseMock();

    await konuHaritasiOlustur(istek(), res);

    assert.equal(res.statusCode, 409);
    assert.equal(uretimCagrisi, 0);
    assert.equal(ders.aktifMateryalIslemSayisi, 0);
});

test("zaman aşımına uğramış lease atomik olarak devralınabilir", async () => {
    harita = {
        _id: new mongoose.Types.ObjectId(),
        dersId,
        kullaniciId,
        durum: "olusturuluyor",
        aktifIslemToken: new mongoose.Types.ObjectId(),
        updatedAt: new Date(),
        kilitSonYenilemeTarihi: new Date(Date.now() - 10 * 60 * 1000)
    };
    const eskiToken = String(harita.aktifIslemToken);
    const res = responseMock();

    await konuHaritasiOlustur(istek(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(uretimCagrisi, 1);
    assert.notEqual(String(harita.aktifIslemToken), eskiToken);
    assert.equal(ders.aktifMateryalIslemSayisi, 0);
});

test("eşzamanlı iki oluşturma isteği yalnızca bir Gemini analizi başlatır", async () => {
    let ilkIslemiSurdur;
    uretimBeklemesi = new Promise((resolve) => {
        ilkIslemiSurdur = resolve;
    });
    const ilkRes = responseMock();
    const ikinciRes = responseMock();

    const ilkIslem = konuHaritasiOlustur(istek(), ilkRes);
    await new Promise((resolve) => setImmediate(resolve));

    await konuHaritasiOlustur(istek(), ikinciRes);
    assert.equal(ikinciRes.statusCode, 409);
    assert.equal(uretimCagrisi, 1);

    ilkIslemiSurdur();
    await ilkIslem;

    assert.equal(ilkRes.statusCode, 200);
    assert.equal(uretimCagrisi, 1);
    assert.equal(ders.aktifMateryalIslemSayisi, 0);
});

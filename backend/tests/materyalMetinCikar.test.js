import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const materyalId = new mongoose.Types.ObjectId();
const dersId = new mongoose.Types.ObjectId();
const kullaniciId = new mongoose.Types.ObjectId();
const eskiIslemeId = new mongoose.Types.ObjectId();

let materyal;
let parcalar;
let metinCikarmaHatasi;
let parcalamaHatasi;
let incrementalHata;
let metinCikarmaHook;
let eskiParcaTemizlemeHook;
let dersIslemSayisi;
let dersOnaylandi;

const ayniId = (sol, sag) => String(sol) === String(sag);

const materyalFiltreyeUyuyor = (filtre) => {
    if (!materyal) return false;
    if (filtre._id && !ayniId(filtre._id, materyal._id)) return false;
    if (filtre.kullaniciId && !ayniId(filtre.kullaniciId, materyal.kullaniciId)) return false;
    if (filtre.dersId && !ayniId(filtre.dersId, materyal.dersId)) return false;
    if (filtre.islemeId && !ayniId(filtre.islemeId, materyal.islemeId)) return false;
    if (typeof filtre.durum === "string" && filtre.durum !== materyal.durum) return false;
    if (filtre.durum?.$nin?.includes(materyal.durum)) return false;
    return true;
};

mock.module("../models/Ders.js", {
    defaultExport: {
        async findOneAndUpdate(filtre) {
            if (
                filtre.materyallerOnaylandi?.$ne === true &&
                dersOnaylandi
            ) {
                return null;
            }
            dersIslemSayisi++;
            return { _id: dersId, materyallerOnaylandi: dersOnaylandi };
        },
        async findOne(filtre) {
            if (filtre._id && !ayniId(filtre._id, dersId)) return null;
            return {
                _id: dersId,
                kullaniciId,
                materyallerOnaylandi: dersOnaylandi
            };
        },
        async updateOne() {
            dersIslemSayisi--;
        }
    }
});

mock.module("../models/Materyal.js", {
    defaultExport: {
        async findOne(filtre) {
            return materyalFiltreyeUyuyor(filtre) ? { ...materyal } : null;
        },
        async findOneAndUpdate(filtre, guncelleme) {
            if (!materyalFiltreyeUyuyor(filtre)) return null;
            Object.assign(materyal, guncelleme.$set || {});
            return { ...materyal };
        }
    }
});

mock.module("../models/MetinParcasi.js", {
    defaultExport: {
        async deleteMany(filtre) {
            if (
                eskiParcaTemizlemeHook &&
                (
                    filtre.islemeId?.$ne !== undefined ||
                    ayniId(filtre.islemeId, eskiIslemeId)
                )
            ) {
                eskiParcaTemizlemeHook();
            }
            parcalar = parcalar.filter((parca) => {
                if (!ayniId(parca.materyalId, filtre.materyalId)) return true;
                if (filtre.islemeId?.$ne !== undefined) {
                    return ayniId(parca.islemeId, filtre.islemeId.$ne);
                }
                if (filtre.islemeId !== undefined) {
                    return !ayniId(parca.islemeId, filtre.islemeId);
                }
                return false;
            });
        }
    }
});

mock.module("../services/metinCikarmaService.js", {
    namedExports: {
        async metinCikar() {
            if (metinCikarmaHook) metinCikarmaHook();
            if (metinCikarmaHatasi) throw metinCikarmaHatasi;
            return "çıkarılan yeni metin";
        }
    }
});

mock.module("../services/metinParcalamaService.js", {
    namedExports: {
        async metinParcalaVeKaydet(_metin, aktifMateryal, islemeId) {
            parcalar.push({ materyalId: aktifMateryal._id, islemeId, icerik: "yeni parça" });
            if (parcalamaHatasi) throw parcalamaHatasi;
        }
    }
});

mock.module("../services/konuHaritasiService.js", {
    namedExports: {
        async materyalEklendigindeIncrementalGuncelle() {
            if (incrementalHata) throw incrementalHata;
        },
        async materyalSilindigindeGuncelle() {}
    }
});

mock.module("../utils/dosyaIslemleri.js", {
    namedExports: { guvenliDosyaSil() {} }
});

const {
    materyalMetinCikar,
    materyalSil,
    materyalYukle
} = await import("../controllers/materyalController.js");

const responseMock = () => ({
    statusCode: 200,
    body: null,
    status(kod) {
        this.statusCode = kod;
        return this;
    },
    json(govde) {
        this.body = govde;
        return this;
    }
});

const istek = () => ({
    params: { id: materyalId.toString() },
    user: { _id: kullaniciId }
});

const eskiBasariliSurumuKur = () => {
    materyal.aktifIslemeId = eskiIslemeId;
    materyal.cikarilanMetin = "eski başarılı metin";
    parcalar.push({ materyalId, islemeId: eskiIslemeId, icerik: "eski parça" });
};

beforeEach(() => {
    materyal = {
        _id: materyalId,
        kullaniciId,
        dersId,
        dosyaYolu: "materyal.pdf",
        mimeTuru: "application/pdf",
        durum: "yuklendi",
        islemeId: null,
        aktifIslemeId: null,
        cikarilanMetin: "",
        islemeHatasi: ""
    };
    parcalar = [];
    metinCikarmaHatasi = null;
    parcalamaHatasi = null;
    incrementalHata = null;
    metinCikarmaHook = null;
    eskiParcaTemizlemeHook = null;
    dersIslemSayisi = 0;
    dersOnaylandi = false;
});

test("metin çıkarma başarılı ve konu haritası güncellemesi başarısızsa aktif parçalar korunur", async () => {
    incrementalHata = new Error("Gemini geçici hatası");
    const res = responseMock();

    await materyalMetinCikar(istek(), res);

    assert.equal(res.statusCode, 200);
    assert.equal(materyal.durum, "hazir");
    assert.ok(materyal.aktifIslemeId);
    assert.equal(parcalar.length, 1);
    assert.equal(String(parcalar[0].islemeId), String(materyal.aktifIslemeId));
    assert.equal(dersIslemSayisi, 0);
});

test("ilk metin çıkarma başarısızsa yarım kalan işlem temizlenir ve materyal hata durumuna geçer", async () => {
    metinCikarmaHatasi = new Error("PDF okunamadı");
    const res = responseMock();

    await materyalMetinCikar(istek(), res);

    assert.equal(res.statusCode, 400);
    assert.equal(materyal.durum, "hata");
    assert.equal(materyal.aktifIslemeId, null);
    assert.equal(parcalar.length, 0);
});

test("yeniden işleme başarılıysa yalnızca yeni aktif sürümün parçaları kalır", async () => {
    eskiBasariliSurumuKur();
    materyal.durum = "hazir";
    const res = responseMock();

    await materyalMetinCikar(istek(), res);

    assert.equal(res.statusCode, 200);
    assert.notEqual(String(materyal.aktifIslemeId), String(eskiIslemeId));
    assert.equal(parcalar.length, 1);
    assert.equal(String(parcalar[0].islemeId), String(materyal.aktifIslemeId));
});

test("eski parçalar temizlenirken başlayan yeni işlemin staging parçaları korunur", async () => {
    eskiBasariliSurumuKur();
    materyal.durum = "hazir";
    const ikinciIslemeId = new mongoose.Types.ObjectId();
    eskiParcaTemizlemeHook = () => {
        materyal.durum = "isleniyor";
        materyal.islemeId = ikinciIslemeId;
        parcalar.push({ materyalId, islemeId: ikinciIslemeId, icerik: "ikinci staging parça" });
        eskiParcaTemizlemeHook = null;
    };
    const res = responseMock();

    await materyalMetinCikar(istek(), res);

    assert.equal(res.statusCode, 200);
    assert.ok(
        parcalar.some((parca) => ayniId(parca.islemeId, ikinciIslemeId)),
        "Yeni işlemin staging parçası eski sürüm temizliği tarafından silinmemeli"
    );
});

test("yeniden işleme başarısızsa yeni staging parçaları silinir ve önceki başarılı sürüm korunur", async () => {
    eskiBasariliSurumuKur();
    materyal.durum = "hazir";
    parcalamaHatasi = new Error("parçalama hatası");
    const res = responseMock();

    await materyalMetinCikar(istek(), res);

    assert.equal(res.statusCode, 400);
    assert.equal(materyal.durum, "hazir");
    assert.equal(String(materyal.aktifIslemeId), String(eskiIslemeId));
    assert.equal(materyal.cikarilanMetin, "eski başarılı metin");
    assert.equal(parcalar.length, 1);
    assert.equal(String(parcalar[0].islemeId), String(eskiIslemeId));
});

test("eşzamanlı silme yeniden işleme commitini engeller ve önceki aktif veriyi bozmaz", async () => {
    eskiBasariliSurumuKur();
    materyal.durum = "hazir";
    metinCikarmaHook = () => { materyal.durum = "siliniyor"; };
    const res = responseMock();

    await materyalMetinCikar(istek(), res);

    assert.equal(res.statusCode, 409);
    assert.equal(materyal.durum, "siliniyor");
    assert.equal(String(materyal.aktifIslemeId), String(eskiIslemeId));
    assert.equal(parcalar.length, 1);
    assert.equal(String(parcalar[0].islemeId), String(eskiIslemeId));
});

test("onaylanmış derse yeni materyal yüklenemez", async () => {
    dersOnaylandi = true;
    const res = responseMock();

    await materyalYukle({
        params: { dersId: dersId.toString() },
        user: { _id: kullaniciId },
        files: [{ path: "gecici.pdf", originalname: "gecici.pdf" }]
    }, res);

    assert.equal(res.statusCode, 409);
    assert.equal(dersIslemSayisi, 0);
});

test("onaylanmış dersin materyali silinemez", async () => {
    eskiBasariliSurumuKur();
    materyal.durum = "hazir";
    dersOnaylandi = true;
    const onceki = { ...materyal };
    const res = responseMock();

    await materyalSil(istek(), res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(materyal, onceki);
    assert.equal(parcalar.length, 1);
    assert.equal(dersIslemSayisi, 0);
});

test("onaylanmış dersin materyal metni yeniden işlenemez", async () => {
    eskiBasariliSurumuKur();
    materyal.durum = "hazir";
    dersOnaylandi = true;
    const onceki = { ...materyal };
    const res = responseMock();

    await materyalMetinCikar(istek(), res);

    assert.equal(res.statusCode, 409);
    assert.deepEqual(materyal, onceki);
    assert.equal(parcalar.length, 1);
    assert.equal(dersIslemSayisi, 0);
});

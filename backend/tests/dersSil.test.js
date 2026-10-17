import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const dersId = new mongoose.Types.ObjectId();
const kullaniciId = new mongoose.Types.ObjectId();
const digerKullaniciId = new mongoose.Types.ObjectId();

let ders;
let materyaller;
let materyalBulmaHatasi;
let dosyaSilmeHatasi;
let materyalBulmaBeklet;
let materyalBulmaDevam;
let silinenMetinParcasi;
let silinenKonuHaritasi;

const ayniId = (sol, sag) => String(sol) === String(sag);

const dersFiltreyeUyuyor = (filtre) => {
  if (!ders) return false;
  if (filtre._id && !ayniId(filtre._id, ders._id)) return false;
  if (filtre.kullaniciId && !ayniId(filtre.kullaniciId, ders.kullaniciId)) return false;
  if (filtre.temizleniyor?.$ne === true && ders.temizleniyor === true) return false;
  if (filtre.temizleniyor === true && ders.temizleniyor !== true) return false;
  if (
    filtre.aktifMateryalIslemSayisi !== undefined &&
    filtre.aktifMateryalIslemSayisi !== ders.aktifMateryalIslemSayisi
  ) return false;
  return true;
};

const DersMock = {
  async findOneAndUpdate(filtre, guncelleme) {
    if (!dersFiltreyeUyuyor(filtre)) return null;
    if (guncelleme.$set) Object.assign(ders, guncelleme.$set);
    if (guncelleme.$inc) {
      for (const [alan, miktar] of Object.entries(guncelleme.$inc)) {
        ders[alan] += miktar;
      }
    }
    return { ...ders };
  },
  findOne(filtre) {
    return {
      async select() {
        return dersFiltreyeUyuyor(filtre) ? { ...ders } : null;
      }
    };
  },
  async updateOne(filtre, guncelleme) {
    if (!dersFiltreyeUyuyor(filtre)) return { modifiedCount: 0 };
    Object.assign(ders, guncelleme.$set || {});
    return { modifiedCount: 1 };
  },
  async deleteOne(filtre) {
    if (!dersFiltreyeUyuyor(filtre)) return { deletedCount: 0 };
    ders = null;
    return { deletedCount: 1 };
  }
};

mock.module("../models/Ders.js", { defaultExport: DersMock });
mock.module("../models/Materyal.js", {
  defaultExport: {
    find() {
      return {
        async select() {
          if (materyalBulmaHatasi) throw materyalBulmaHatasi;
          if (materyalBulmaBeklet) await materyalBulmaBeklet;
          return materyaller.map((materyal) => ({ ...materyal }));
        }
      };
    },
    async updateMany() {
      materyaller.forEach((materyal) => { materyal.durum = "siliniyor"; });
    },
    async deleteMany() {
      materyaller = [];
    }
  }
});
mock.module("../models/MetinParcasi.js", {
  defaultExport: {
    async deleteMany() { silinenMetinParcasi = true; }
  }
});
mock.module("../models/KonuHaritasi.js", {
  defaultExport: {
    async deleteMany() { silinenKonuHaritasi = true; }
  }
});
mock.module("../utils/dosyaIslemleri.js", {
  namedExports: {
    guvenliDosyaSil() {
      if (dosyaSilmeHatasi) throw dosyaSilmeHatasi;
    }
  }
});

const { dersSil } = await import("../controllers/dersController.js");

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

const istek = (userId = kullaniciId) => ({
  params: { id: dersId.toString() },
  user: { _id: userId }
});

beforeEach(() => {
  ders = {
    _id: dersId,
    kullaniciId,
    temizleniyor: false,
    aktifMateryalIslemSayisi: 0
  };
  materyaller = [{ _id: new mongoose.Types.ObjectId(), dosyaYolu: "test.pdf", durum: "hazir" }];
  materyalBulmaHatasi = null;
  dosyaSilmeHatasi = null;
  materyalBulmaBeklet = null;
  materyalBulmaDevam = null;
  silinenMetinParcasi = false;
  silinenKonuHaritasi = false;
});

test("aktif materyal işlemi varken ders silme 409 ile reddedilir", async () => {
  ders.aktifMateryalIslemSayisi = 1;
  const res = responseMock();

  await dersSil(istek(), res);

  assert.equal(res.statusCode, 409);
  assert.match(res.body.hata, /Aktif materyal işlemleri/);
  assert.equal(ders.temizleniyor, false);
  assert.equal(materyaller.length, 1);
});

test("aktif işlem yokken ders ve ilişkili kayıtlar silinir", async () => {
  const res = responseMock();

  await dersSil(istek(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.basarili, true);
  assert.equal(ders, null);
  assert.equal(materyaller.length, 0);
  assert.equal(silinenMetinParcasi, true);
  assert.equal(silinenKonuHaritasi, true);
});

test("silme kilidi alındıktan sonra yeni materyal işlemi başlatılamaz", async () => {
  materyalBulmaBeklet = new Promise((resolve) => { materyalBulmaDevam = resolve; });
  const res = responseMock();
  const silme = dersSil(istek(), res);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(ders.temizleniyor, true);

  const yeniIslem = await DersMock.findOneAndUpdate(
    {
      _id: dersId,
      kullaniciId,
      temizleniyor: { $ne: true },
      aktifMateryalIslemSayisi: 0
    },
    { $inc: { aktifMateryalIslemSayisi: 1 } }
  );
  assert.equal(yeniIslem, null);

  materyalBulmaDevam();
  await silme;
  assert.equal(res.statusCode, 200);
});

test("eşzamanlı iki silme isteğinden yalnızca biri kilidi alır", async () => {
  materyalBulmaBeklet = new Promise((resolve) => { materyalBulmaDevam = resolve; });
  const ilkRes = responseMock();
  const ikinciRes = responseMock();
  const ilkSilme = dersSil(istek(), ilkRes);

  await new Promise((resolve) => setImmediate(resolve));
  await dersSil(istek(), ikinciRes);

  assert.equal(ikinciRes.statusCode, 409);
  assert.match(ikinciRes.body.hata, /zaten devam ediyor/);

  materyalBulmaDevam();
  await ilkSilme;
  assert.equal(ilkRes.statusCode, 200);
});

test("dosya silme hatasında kayıtlar korunur ve temizleme kilidi kurtarma servisine bırakılır", async () => {
  dosyaSilmeHatasi = new Error("disk hatası");
  const res = responseMock();

  await dersSil(istek(), res);

  assert.equal(res.statusCode, 500);
  assert.equal(ders.temizleniyor, true);
  assert.equal(materyaller.length, 1);
  assert.equal(materyaller[0].durum, "siliniyor");
  assert.equal(silinenMetinParcasi, false);
});

test("yıkıcı temizlik başlamadan oluşan veritabanı hatasında kilit geri alınır", async () => {
  materyalBulmaHatasi = new Error("veritabanı hatası");
  const res = responseMock();

  await dersSil(istek(), res);

  assert.equal(res.statusCode, 500);
  assert.equal(ders.temizleniyor, false);
  assert.equal(materyaller.length, 1);
});

test("başka kullanıcıya ait ders silinemez", async () => {
  const res = responseMock();

  await dersSil(istek(digerKullaniciId), res);

  assert.equal(res.statusCode, 404);
  assert.equal(ders.temizleniyor, false);
  assert.equal(materyaller.length, 1);
});

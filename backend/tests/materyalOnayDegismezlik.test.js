import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const dersId = new mongoose.Types.ObjectId();
const kullaniciId = new mongoose.Types.ObjectId();
const materyalId = new mongoose.Types.ObjectId();
const islemeId = new mongoose.Types.ObjectId();

let ders;
let materyaller;
let harita;
let haritaYazmaSayisi;

const ayni = (sol, sag) => String(sol) === String(sag);
const kopyala = (deger) => {
  if (deger == null || typeof deger !== "object") return deger;
  if (deger instanceof mongoose.Types.ObjectId) return deger;
  if (deger instanceof Date) return new Date(deger);
  if (Array.isArray(deger)) return deger.map(kopyala);
  return Object.fromEntries(
    Object.entries(deger).map(([anahtar, icerik]) => [anahtar, kopyala(icerik)])
  );
};

const filtreEslesiyor = (belge, filtre) => {
  if (!belge) return false;

  for (const [alan, beklenen] of Object.entries(filtre)) {
    const gercek = belge[alan];
    if (beklenen && typeof beklenen === "object" && !(beklenen instanceof Date)) {
      if (Object.hasOwn(beklenen, "$ne")) {
        if (ayni(gercek, beklenen.$ne)) return false;
        continue;
      }
    }
    if (beklenen instanceof Date) {
      if (!(gercek instanceof Date) || gercek.getTime() !== beklenen.getTime()) return false;
      continue;
    }
    if (!ayni(gercek, beklenen)) return false;
  }

  return true;
};

const oturumlu = (uret) => ({
  session() { return Promise.resolve(uret()); }
});

const sayacSorgusu = (uret) => ({
  session() { return Promise.resolve(uret()); }
});

const materyalSorgusu = (uret) => ({
  select() { return this; },
  session() { return this; },
  lean() { return Promise.resolve(uret()); }
});

const session = {
  async withTransaction(islem) {
    const oncekiDers = kopyala(ders);
    const oncekiHarita = kopyala(harita);
    try {
      await islem();
    } catch (hata) {
      ders = oncekiDers;
      harita = oncekiHarita;
      throw hata;
    }
  },
  async endSession() {}
};

mock.module("mongoose", {
  defaultExport: {
    Types: mongoose.Types,
    startSession: async () => session
  }
});

const DersMock = {
  findOne(filtre) {
    return oturumlu(() => filtreEslesiyor(ders, filtre) ? kopyala(ders) : null);
  },
  async findOneAndUpdate(filtre, guncelleme) {
    if (!filtreEslesiyor(ders, filtre)) return null;
    Object.assign(ders, kopyala(guncelleme.$set || {}));
    return kopyala(ders);
  }
};

const MateryalMock = {
  countDocuments(filtre) {
    return sayacSorgusu(() => materyaller.filter((materyal) =>
      filtreEslesiyor(materyal, filtre)
    ).length);
  },
  find(filtre) {
    return materyalSorgusu(() => materyaller
      .filter((materyal) => filtreEslesiyor(materyal, filtre))
      .map(({ _id, aktifIslemeId }) => ({ _id, aktifIslemeId })));
  }
};

const KonuHaritasiMock = {
  findOne(filtre) {
    return oturumlu(() => filtreEslesiyor(harita, filtre) ? kopyala(harita) : null);
  },
  async findOneAndUpdate(filtre, guncelleme) {
    if (!filtreEslesiyor(harita, filtre)) return null;
    Object.assign(harita, kopyala(guncelleme.$set || {}));
    haritaYazmaSayisi++;
    return kopyala(harita);
  }
};

mock.module("../models/Ders.js", { defaultExport: DersMock });
mock.module("../models/Materyal.js", { defaultExport: MateryalMock });
mock.module("../models/MetinParcasi.js", { defaultExport: {} });
mock.module("../models/KonuHaritasi.js", { defaultExport: KonuHaritasiMock });
mock.module("../models/Sohbet.js", { defaultExport: {} });
mock.module("../models/Mesaj.js", { defaultExport: {} });
mock.module("../models/DersOzeti.js", { defaultExport: {} });
mock.module("../models/Test.js", { defaultExport: {} });
mock.module("../utils/dosyaIslemleri.js", {
  namedExports: { guvenliDosyaSil() {} }
});

const { materyalleriOnayla } = await import("../controllers/dersController.js");

const yanit = () => ({
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
  materyaller = [{
    _id: materyalId,
    dersId,
    kullaniciId,
    durum: "hazir",
    aktifIslemeId: islemeId
  }];
  harita = {
    _id: new mongoose.Types.ObjectId(),
    dersId,
    kullaniciId,
    durum: "hazir",
    aktifIslemToken: null,
    degisikliklereKilitli: false,
    kaynakMateryaller: [{ materyalId, aktifIslemeId: islemeId }],
    anaKonular: [{ konuId: "konu-1", baslik: "Sabit Konu" }],
    updatedAt: new Date("2026-10-17T10:00:00.000Z")
  };
  haritaYazmaSayisi = 0;
});

test("konu haritası hazır değilken onay reddedilir", async () => {
  harita.durum = "olusturuluyor";
  harita.aktifIslemToken = new mongoose.Types.ObjectId();
  const res = yanit();

  await materyalleriOnayla(istek(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(ders.materyallerOnaylandi, false);
  assert.equal(harita.degisikliklereKilitli, false);
});

test("aktif materyal işlemi varken onay erken tamamlanmaz", async () => {
  ders.aktifMateryalIslemSayisi = 1;
  const res = yanit();

  await materyalleriOnayla(istek(), res);

  assert.equal(res.statusCode, 409);
  assert.equal(ders.materyallerOnaylandi, false);
  assert.equal(haritaYazmaSayisi, 0);
});

test("hazır materyaller ve güncel harita aynı transaction içinde onaylanıp kilitlenir", async () => {
  const res = yanit();

  await materyalleriOnayla(istek(), res);

  assert.equal(res.statusCode, 200);
  assert.equal(ders.materyallerOnaylandi, true);
  assert.equal(harita.degisikliklereKilitli, true);
  assert.equal(haritaYazmaSayisi, 1);
});

test("onay sonrası gecikmiş harita yazımı reddedilir ve içerik sabit kalır", async () => {
  const res = yanit();
  await materyalleriOnayla(istek(), res);
  const oncekiKonular = kopyala(harita.anaKonular);

  const gecikmisSonuc = await KonuHaritasiMock.findOneAndUpdate(
    {
      _id: harita._id,
      degisikliklereKilitli: { $ne: true }
    },
    { $set: { anaKonular: [{ konuId: "gecikmis", baslik: "Değişmemeli" }] } }
  );

  assert.equal(gecikmisSonuc, null);
  assert.deepEqual(harita.anaKonular, oncekiKonular);
});

test("tekrarlanan onay isteği onaylanmış verileri yeniden değiştirmez", async () => {
  const ilkRes = yanit();
  await materyalleriOnayla(istek(), ilkRes);
  const onayliHarita = kopyala(harita);

  const ikinciRes = yanit();
  await materyalleriOnayla(istek(), ikinciRes);

  assert.equal(ikinciRes.statusCode, 200);
  assert.match(ikinciRes.body.mesaj, /zaten onaylanmış/);
  assert.deepEqual(harita, onayliHarita);
  assert.equal(haritaYazmaSayisi, 1);
});

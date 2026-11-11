import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const kullaniciId = new mongoose.Types.ObjectId();
const dersId = new mongoose.Types.ObjectId();
let dersler, materyaller, parcalar, haritalar, embeddingCagrilari, haritaCagrilari;
let embeddingHatasi, haritaHatasi, bekleyenEmbedding, silinenDosyalar;
const ayni = (a, b) => String(a ?? "") === String(b ?? "");
const kopya = v => {
    if (!v || typeof v !== "object" || v instanceof mongoose.Types.ObjectId) return v;
    if (v instanceof Date) return new Date(v);
    if (Array.isArray(v)) return v.map(kopya);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, kopya(x)]));
};
const ifade = (v, doc) => {
    if (v === "$$NOW") return Date.now();
    if (typeof v === "string" && v.startsWith("$")) return doc[v.slice(1)];
    if (v?.$subtract) return Number(ifade(v.$subtract[0], doc)) - Number(ifade(v.$subtract[1], doc));
    if (v?.$ifNull) return ifade(v.$ifNull[0], doc) ?? ifade(v.$ifNull[1], doc);
    return v;
};
const esles = (doc, filtre) => !!doc && Object.entries(filtre).every(([k, v]) => {
    if (k === "$or") return v.some(x => esles(doc, x));
    if (k === "$expr") {
        const [op, args] = Object.entries(v)[0];
        const [a, b] = args.map(x => ifade(x, doc));
        if (op === "$gt") return a > b;
        if (op === "$lt") return a < b;
        if (op === "$lte") return a <= b;
        throw new Error(`Desteklenmeyen ifade: ${op}`);
    }
    if (v && typeof v === "object" && !(v instanceof mongoose.Types.ObjectId) && !(v instanceof Date)) {
        return Object.entries(v).every(([op, arg]) => {
            if (op === "$ne") return !ayni(doc[k], arg);
            if (op === "$gt") return doc[k] > arg;
            if (op === "$in") return arg.some(x => ayni(doc[k], x));
            if (op === "$nin") return !arg.some(x => ayni(doc[k], x));
            throw new Error(`Desteklenmeyen filtre: ${op}`);
        });
    }
    return ayni(doc[k], v);
});
const yaz = (doc, g) => {
    Object.assign(doc, kopya(g.$set || {}));
    for (const [k, v] of Object.entries(g.$inc || {})) doc[k] = (doc[k] || 0) + v;
    for (const k of Object.keys(g.$currentDate || {})) doc[k] = new Date();
};
const sorgu = fn => ({
    select() { return this; }, session() { return this; }, sort() { return this; }, lean() { return this; },
    then(a, b) { return Promise.resolve().then(fn).then(a, b); },
});
const model = liste => ({
    find: f => sorgu(() => kopya(liste().filter(x => esles(x, f)))),
    findOne: f => sorgu(() => kopya(liste().find(x => esles(x, f)) || null)),
    countDocuments: f => sorgu(() => liste().filter(x => esles(x, f)).length),
    findOneAndUpdate: (f, g, opts = {}) => sorgu(() => {
        const doc = liste().find(x => esles(x, f));
        if (!doc) return null;
        const eski = kopya(doc);
        yaz(doc, g);
        return opts.new ? kopya(doc) : eski;
    }),
    updateOne: (f, g) => sorgu(() => {
        const doc = liste().find(x => esles(x, f));
        if (doc) yaz(doc, g);
        return { matchedCount: doc ? 1 : 0 };
    }),
    async create(doc) {
        const yeni = { _id: new mongoose.Types.ObjectId(), ...kopya(doc) };
        liste().push(yeni);
        return kopya(yeni);
    },
    async deleteMany(f) {
        for (let i = liste().length - 1; i >= 0; i--) if (esles(liste()[i], f)) liste().splice(i, 1);
    },
    async deleteOne(f) { return this.deleteMany(f); },
    aggregate: () => sorgu(() => []),
});

let tx = Promise.resolve();
mock.module("mongoose", { defaultExport: {
    Types: mongoose.Types,
    startSession: async () => ({
        withTransaction(fn) {
            const islem = tx.then(async () => {
                const yedek = kopya([dersler, materyaller, parcalar, haritalar]);
                try { return await fn(); }
                catch (hata) { [dersler, materyaller, parcalar, haritalar] = yedek; throw hata; }
            });
            tx = islem.catch(() => {});
            return islem;
        },
        async endSession() {},
    }),
} });
mock.module("../models/Ders.js", { defaultExport: model(() => dersler) });
mock.module("../models/Materyal.js", { defaultExport: model(() => materyaller) });
mock.module("../models/MetinParcasi.js", { defaultExport: model(() => parcalar) });
mock.module("../models/KonuHaritasi.js", { defaultExport: model(() => haritalar) });
for (const isim of ["Sohbet", "Mesaj", "DersOzeti", "Test"]) {
    mock.module(`../models/${isim}.js`, { defaultExport: model(() => []) });
}
mock.module("../utils/dosyaIslemleri.js", { namedExports: { guvenliDosyaSil: p => silinenDosyalar.push(p) } });
mock.module("../services/metinCikarmaService.js", { namedExports: { metinCikar: async () => "Hazırlanacak örnek ders metni." } });
mock.module("../services/metinParcalamaService.js", { namedExports: {
    async metinParcalaVeKaydet(icerik, m, islemeId) {
        parcalar.push({ _id: new mongoose.Types.ObjectId(), dersId, kullaniciId, materyalId: m._id, islemeId, icerik });
    },
} });
mock.module("../services/embeddingService.js", { namedExports: {
    async materyalEmbeddingleriniOlustur(m, islemeId) {
        const p = parcalar.find(p => ayni(p.materyalId, m._id) && ayni(p.islemeId, islemeId));
        if (!p.embedding) {
            embeddingCagrilari.push(String(m._id));
            if (bekleyenEmbedding) await bekleyenEmbedding;
            if (embeddingHatasi && embeddingCagrilari.length === 2) throw embeddingHatasi;
            p.embedding = [1, 0, 0];
            p.embeddingDurumu = "hazir";
        }
        return { toplam: 1, model: "mock", boyut: 3 };
    },
} });
const guncel = h => h?.durum === "hazir" && h.kaynakMateryaller?.length === materyaller.length &&
    materyaller.every(m => h.kaynakMateryaller.some(k => ayni(k.materyalId, m._id) && ayni(k.aktifIslemeId, m.aktifIslemeId)));
mock.module("../services/konuHaritasiService.js", { namedExports: {
    konuHaritasiGuncellikKontrolu: async h => guncel(h),
    async konuHaritasiUretVeKaydet(d, u, token) {
        haritaCagrilari++;
        const h = haritalar.find(h => ayni(h.aktifIslemToken, token));
        if (haritaHatasi) {
            Object.assign(h, { durum: "hata", aktifIslemToken: null });
            throw haritaHatasi;
        }
        Object.assign(h, { durum: "hazir", aktifIslemToken: null, degisikliklereKilitli: false,
            anaKonular: [{ konuId: "sabit-konu" }],
            kaynakMateryaller: materyaller.map(m => ({ materyalId: m._id, aktifIslemeId: m.aktifIslemeId })),
        });
        return kopya(h);
    },
} });

const { hazirlamayiBaslat, dersiHazirla, yarimKalanHazirlamayiKurtar } = await import("../services/dersHazirlamaService.js");
const { dersHazirlamaDurumu, haritaIcinOnayGerekli } = await import("../controllers/dersHazirlamaController.js");
const { materyalYukle, materyalSil, materyalMetinCikar } = await import("../controllers/materyalController.js");
const { dersleriGetir } = await import("../controllers/dersController.js");
const req = () => ({ params: { id: String(dersId), dersId: String(dersId) }, user: { _id: kullaniciId } });
const res = () => ({ statusCode: 200, status(s) { this.statusCode = s; return this; }, json(body) { this.body = body; return this; } });
const calistir = async () => {
    const islem = await hazirlamayiBaslat(dersId, kullaniciId);
    if (islem.yeni) await dersiHazirla(islem.ders, kullaniciId, islem.token);
    return islem;
};
const materyalEkle = () => {
    const m = { _id: new mongoose.Types.ObjectId(), dersId, kullaniciId, durum: "hazir",
        aktifIslemeId: new mongoose.Types.ObjectId(), dosyaYolu: "korunacak.txt", embeddingDurumu: "bekliyor" };
    materyaller.push(m);
    parcalar.push({ _id: new mongoose.Types.ObjectId(), dersId, kullaniciId, materyalId: m._id, islemeId: m.aktifIslemeId, icerik: "Metin" });
    return m;
};
beforeEach(() => {
    dersler = [{ _id: dersId, kullaniciId, dersAdi: "Ders", materyallerOnaylandi: false, aktifMateryalIslemSayisi: 0, hazirlamaDurumu: "bekliyor" }];
    materyaller = []; parcalar = []; haritalar = []; embeddingCagrilari = []; haritaCagrilari = 0;
    embeddingHatasi = null; haritaHatasi = null; bekleyenEmbedding = null; silinenDosyalar = [];
});

test("beş dosya yüklenip ikisi silinir: onaysız sıfır Gemini; onayda yalnız kalan üç kaynak işlenir", async () => {
    const dizin = await mkdtemp(path.join(os.tmpdir(), "studyai-hazirlama-"));
    try {
        const files = [];
        for (let i = 0; i < 5; i++) {
            const dosya = path.join(dizin, `${i}.txt`);
            await writeFile(dosya, `Ders materyali ${i}`);
            files.push({ path: dosya, originalname: `${i}.txt`, filename: `${i}.txt`, mimetype: "text/plain", size: 20 });
        }
        const yanit = res();
        await materyalYukle({ ...req(), files }, yanit);
        assert.equal(yanit.statusCode, 201);
        for (let i = 0; dersler[0].aktifMateryalIslemSayisi && i < 100; i++) await new Promise(r => setTimeout(r, 1));
        assert.equal(dersler[0].aktifMateryalIslemSayisi, 0);
        assert.equal(materyaller.length, 5);
        for (const m of materyaller.slice(0, 2)) {
            const silRes = res();
            await materyalSil({ ...req(), params: { id: String(m._id) } }, silRes);
            assert.equal(silRes.statusCode, 200);
        }
        assert.equal(embeddingCagrilari.length, 0);
        assert.equal(haritaCagrilari, 0);
        const kalan = materyaller.map(m => String(m._id));
        const once = res(); await dersleriGetir(req(), once);
        assert.equal(once.body.dersler.length, 0);
        await calistir();
        assert.deepEqual(embeddingCagrilari, kalan);
        assert.equal(haritaCagrilari, 1);
        assert.equal(haritalar[0].kaynakMateryaller.length, 3);
        assert.equal(dersler[0].materyallerOnaylandi, true);
        assert.equal(haritalar[0].degisikliklereKilitli, true);
        const sonra = res(); await dersleriGetir(req(), sonra);
        assert.equal(sonra.body.dersler.length, 1);
    } finally { await rm(dizin, { recursive: true, force: true }); }
});

test("eşzamanlı iki onay yalnız bir iş alır; yenileme mevcut aşamayı okur ve Gemini başlatmaz", async () => {
    materyalEkle();
    const [a, b] = await Promise.all([hazirlamayiBaslat(dersId, kullaniciId), hazirlamayiBaslat(dersId, kullaniciId)]);
    assert.equal([a, b].filter(x => x.yeni).length, 1);
    const islem = a.yeni ? a : b;
    let devam;
    bekleyenEmbedding = new Promise(r => { devam = r; });
    const calisan = dersiHazirla(islem.ders, kullaniciId, islem.token);
    for (let i = 0; !embeddingCagrilari.length && i < 100; i++) await new Promise(r => setTimeout(r, 1));
    const durum = res(); await dersHazirlamaDurumu(req(), durum);
    assert.equal(durum.body.ders.hazirlamaAsamasi, "embedding");
    assert.equal(durum.body.ders.materyallerOnaylandi, false);
    assert.equal((await hazirlamayiBaslat(dersId, kullaniciId)).yeni, false);
    assert.equal(embeddingCagrilari.length, 1);
    devam(); await calisan;
    const bitti = res(); await dersHazirlamaDurumu(req(), bitti);
    assert.equal(bitti.body.ders.hazirlamaDurumu, "tamamlandi");
    assert.equal(bitti.body.ders.materyallerOnaylandi, true);
});

for (const status of [429, 503]) {
    test(`Gemini ${status}: taslak ve başarılı embedding korunur; retry yalnız eksikleri işler`, async () => {
        materyalEkle(); materyalEkle(); materyalEkle();
        embeddingHatasi = Object.assign(new Error("Gemini"), { status });
        await calistir();
        assert.equal(dersler[0].hazirlamaHataKodu, `GEMINI_${status}`);
        assert.equal(dersler[0].materyallerOnaylandi, false);
        assert.equal(haritaCagrilari, 0);
        assert.equal(materyaller.length, 3);
        assert.equal(parcalar.length, 3);
        assert.deepEqual(parcalar[0].embedding, [1, 0, 0]);
        assert.equal(silinenDosyalar.length, 0);
        const ilk = String(materyaller[0]._id);
        embeddingHatasi = null;
        await calistir();
        assert.equal(embeddingCagrilari.filter(id => id === ilk).length, 1);
        assert.equal(dersler[0].materyallerOnaylandi, true);
    });
}

test("harita hatasında metin ve embedding korunur; tekrar denemede aynı sürümler kullanılır", async () => {
    const m = materyalEkle();
    const surum = String(m.aktifIslemeId);
    haritaHatasi = Object.assign(new Error("Gemini"), { status: 503 });
    await calistir();
    assert.equal(dersler[0].materyallerOnaylandi, false);
    assert.equal(m.embeddingDurumu, "hazir");
    haritaHatasi = null;
    await calistir();
    assert.equal(embeddingCagrilari.length, 1);
    assert.equal(String(materyaller[0].aktifIslemeId), surum);
    assert.equal(dersler[0].materyallerOnaylandi, true);
});

test("sunucu kesintisinden kalan lease kurtarılır; eski token onaylayamaz ve yeni üretim otomatik başlamaz", async () => {
    materyalEkle();
    const islem = await hazirlamayiBaslat(dersId, kullaniciId);
    haritalar.push({ dersId, kullaniciId, aktifIslemToken: islem.token, durum: "olusturuluyor" });
    await yarimKalanHazirlamayiKurtar(dersId, kullaniciId);
    assert.equal(dersler[0].hazirlamaDurumu, "isleniyor");
    dersler[0].hazirlamaSonYenileme = new Date(0);
    const durum = res(); await dersHazirlamaDurumu(req(), durum);
    assert.equal(durum.body.ders.hazirlamaHataKodu, "HAZIRLAMA_KESILDI");
    assert.equal(haritalar[0].aktifIslemToken, null);
    await dersiHazirla(islem.ders, kullaniciId, islem.token);
    assert.equal(embeddingCagrilari.length, 0);
    assert.equal(haritaCagrilari, 0);
    assert.equal(dersler[0].materyallerOnaylandi, false);
    await calistir();
    assert.equal(dersler[0].materyallerOnaylandi, true);
});

test("hazırlama ve kalıcı onay materyal ekleme, silme, yeniden işleme ve doğrudan harita üretimini engeller", async () => {
    const m = materyalEkle();
    const islem = await hazirlamayiBaslat(dersId, kullaniciId);
    for (const tamamlandi of [false, true]) {
        if (tamamlandi) await dersiHazirla(islem.ders, kullaniciId, islem.token);
        for (const fn of [materyalSil, materyalMetinCikar]) {
            const yanit = res(); await fn({ ...req(), params: { id: String(m._id) } }, yanit);
            assert.equal(yanit.statusCode, 409);
        }
        const yukle = res(); await materyalYukle({ ...req(), files: [{ path: "yeni.txt" }] }, yukle);
        assert.equal(yukle.statusCode, 409);
        const harita = res(); await haritaIcinOnayGerekli(req(), harita);
        assert.equal(harita.statusCode, 409);
    }
    assert.equal(haritaCagrilari, 1);
    assert.equal((await hazirlamayiBaslat(dersId, kullaniciId)).yeni, false);
});

test("aktif yükleme, eksik metin veya eksik parça ile Gemini başlatılmaz", async () => {
    const m = materyalEkle();
    dersler[0].aktifMateryalIslemSayisi = 1;
    await assert.rejects(hazirlamayiBaslat(dersId, kullaniciId), /devam ediyor/);
    dersler[0].aktifMateryalIslemSayisi = 0;
    m.durum = "hata";
    await calistir();
    assert.equal(dersler[0].hazirlamaDurumu, "hata");
    m.durum = "hazir"; parcalar = [];
    await calistir();
    assert.equal(dersler[0].materyallerOnaylandi, false);
    assert.equal(embeddingCagrilari.length, 0);
    assert.equal(haritaCagrilari, 0);
});

test("başka kullanıcı hazırlama başlatamaz veya durum okuyamaz", async () => {
    const digeri = new mongoose.Types.ObjectId();
    await assert.rejects(hazirlamayiBaslat(dersId, digeri), { status: 404 });
    const yanit = res(); await dersHazirlamaDurumu({ ...req(), user: { _id: digeri } }, yanit);
    assert.equal(yanit.statusCode, 404);
    assert.equal(dersler[0].hazirlamaDurumu, "bekliyor");
});

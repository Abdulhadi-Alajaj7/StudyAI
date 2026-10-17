import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const dersId = new mongoose.Types.ObjectId();
const kullaniciId = new mongoose.Types.ObjectId();
const materyalId = new mongoose.Types.ObjectId();
const islemeId = new mongoose.Types.ObjectId();

let ders;
let harita;
let geminiDavranisi;
let haritaYazmaSayisi;

const ayniId = (sol, sag) => String(sol) === String(sag);
const kopyala = (deger) => {
    if (deger == null || typeof deger !== "object") return deger;
    if (deger instanceof mongoose.Types.ObjectId) return deger;
    if (deger instanceof Date) return new Date(deger);
    if (Array.isArray(deger)) return deger.map(kopyala);
    return Object.fromEntries(
        Object.entries(deger).map(([anahtar, icerik]) => [anahtar, kopyala(icerik)])
    );
};
const konuOzeti = (konular = []) => konular.map((konu) => ({
    konuId: konu.konuId,
    baslik: konu.baslik,
    altKonular: (konu.altKonular || []).map((alt) => ({
        konuId: alt.konuId,
        baslik: alt.baslik
    }))
}));

const sorgu = (uret) => ({
    select() { return Promise.resolve(uret()); },
    sort() { return Promise.resolve(uret()); },
    then(resolve, reject) { return Promise.resolve(uret()).then(resolve, reject); }
});

const filtreEslesiyor = (belge, filtre) => {
    if (!belge) return false;
    for (const [alan, beklenen] of Object.entries(filtre)) {
        if (alan === "$or") {
            if (!beklenen.some((altFiltre) => filtreEslesiyor(belge, altFiltre))) {
                return false;
            }
            continue;
        }
        if (alan === "$and") {
            if (!beklenen.every((altFiltre) => filtreEslesiyor(belge, altFiltre))) {
                return false;
            }
            continue;
        }
        const gercek = belge[alan];
        if (beklenen && typeof beklenen === "object" && !Array.isArray(beklenen)) {
            if (Object.hasOwn(beklenen, "$ne")) {
                if (ayniId(gercek, beklenen.$ne)) return false;
                continue;
            }
            if (Object.hasOwn(beklenen, "$gt")) {
                if (!(gercek > beklenen.$gt)) return false;
                continue;
            }
            if (Object.hasOwn(beklenen, "$lt")) {
                if (!(gercek < beklenen.$lt)) return false;
                continue;
            }
        }
        if (!ayniId(gercek, beklenen)) return false;
    }
    return true;
};

mock.module("../models/Materyal.js", {
    defaultExport: {
        find() {
            return sorgu(() => [{
                _id: materyalId,
                dersId,
                kullaniciId,
                durum: "hazir",
                aktifIslemeId: islemeId,
                dosyaAdi: "ders.txt",
                orijinalDosyaAdi: "ders.txt"
            }]);
        },
        findOne(filtre) {
            return sorgu(() => {
                if (!ayniId(filtre._id, materyalId)) return null;
                if (
                    filtre.aktifIslemeId &&
                    !Object.hasOwn(filtre.aktifIslemeId, "$ne") &&
                    !ayniId(filtre.aktifIslemeId, islemeId)
                ) return null;
                return {
                    _id: materyalId,
                    dersId,
                    kullaniciId,
                    durum: "hazir",
                    aktifIslemeId: islemeId,
                    dosyaAdi: "ders.txt",
                    orijinalDosyaAdi: "ders.txt"
                };
            });
        },
        async countDocuments() { return 1; }
    }
});

mock.module("../models/MetinParcasi.js", {
    defaultExport: {
        find() {
            return sorgu(() => [{
                materyalId,
                dersId,
                kullaniciId,
                islemeId,
                parcaIndex: 0,
                icerik: "Diziler ve bağlı listeler"
            }]);
        }
    }
});

mock.module("../models/Ders.js", {
    defaultExport: {
        findOne(filtre) {
            return sorgu(() => filtreEslesiyor(ders, filtre) ? kopyala(ders) : null);
        },
        async findOneAndUpdate(filtre, guncelleme) {
            if (!filtreEslesiyor(ders, filtre)) return null;
            if (guncelleme.$inc) {
                for (const [alan, miktar] of Object.entries(guncelleme.$inc)) {
                    ders[alan] = (ders[alan] || 0) + miktar;
                }
            }
            return kopyala(ders);
        }
    }
});

mock.module("../models/KonuHaritasi.js", {
    defaultExport: {
        findOne(filtre) {
            return sorgu(() => filtreEslesiyor(harita, filtre) ? kopyala(harita) : null);
        },
        async updateOne(filtre, guncelleme) {
            if (!filtreEslesiyor(harita, filtre)) return { matchedCount: 0 };
            Object.assign(harita, kopyala(guncelleme.$set || {}));
            harita.updatedAt = new Date();
            return { matchedCount: 1 };
        },
        async findOneAndUpdate(filtre, guncelleme) {
            if (!filtreEslesiyor(harita, filtre)) return null;
            haritaYazmaSayisi++;
            Object.assign(harita, kopyala(guncelleme.$set || {}));
            harita.updatedAt = new Date(Date.now() + haritaYazmaSayisi * 1000);
            return kopyala(harita);
        },
        async create(veri) {
            if (harita) throw Object.assign(new Error("duplicate"), { code: 11000 });
            harita = { _id: new mongoose.Types.ObjectId(), ...kopyala(veri), updatedAt: new Date() };
            haritaYazmaSayisi++;
            return kopyala(harita);
        }
    }
});

mock.module("../services/geminiService.js", {
    namedExports: {
        VARSAYILAN_GEMINI_MODELI: "test-model",
        geminiIleKonuHaritasiUret: (...args) => geminiDavranisi(...args),
        geminiIleKonulariBirlestir: async (konular) => konular
    }
});

const {
    konuHaritasiUretVeKaydet,
    materyalEklendigindeIncrementalGuncelle,
    materyalSilindigindeGuncelle,
    arkaPlandaKonuHaritasiGuncelle
} = await import("../services/konuHaritasiService.js");

const geminiCiktisi = (baslik = "Diziler") => [{
    baslik,
    aciklama: `${baslik} açıklaması`,
    sira: 1,
    altKonular: [{ baslik: `${baslik} Alt Konu`, aciklama: "Alt açıklama", sira: 1 }]
}];

const fullDers = () => ({
    _id: dersId,
    kullaniciId,
    dersAdi: "Veri Yapıları",
    aciklama: "",
    donem: "2026",
    materyallerOnaylandi: false,
    temizleniyor: false,
    aktifMateryalIslemSayisi: 1
});

const basariliHarita = () => ({
    _id: new mongoose.Types.ObjectId(),
    dersId,
    kullaniciId,
    durum: "hazir",
    olusturmaHatasi: "",
    aktifIslemToken: null,
    degisikliklereKilitli: false,
    anaKonular: [{
        konuId: "top-mevcut",
        baslik: "Mevcut Başarılı Konu",
        aciklama: "",
        sira: 1,
        kaynakMateryalIds: [materyalId],
        altKonular: []
    }],
    gecmisKonular: [],
    kaynakMateryaller: [],
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
});

beforeEach(() => {
    ders = fullDers();
    harita = basariliHarita();
    geminiDavranisi = async () => geminiCiktisi();
    haritaYazmaSayisi = 0;
});

test("eski full işlem hata aldığında yeni işlemin tokenı ve başarılı verisi korunur", async () => {
    const eskiToken = new mongoose.Types.ObjectId();
    const yeniToken = new mongoose.Types.ObjectId();
    harita.durum = "olusturuluyor";
    harita.aktifIslemToken = eskiToken;
    const oncekiKonular = konuOzeti(harita.anaKonular);
    geminiDavranisi = async () => {
        harita.aktifIslemToken = yeniToken;
        throw new Error("eski işlem hatası");
    };

    await assert.rejects(
        konuHaritasiUretVeKaydet(ders, kullaniciId, eskiToken),
        /eski işlem hatası/
    );

    assert.equal(String(harita.aktifIslemToken), String(yeniToken));
    assert.equal(harita.durum, "olusturuluyor");
    assert.deepEqual(konuOzeti(harita.anaKonular), oncekiKonular);
    assert.equal(haritaYazmaSayisi, 0);
});

test("incremental güncelleme aktif full üretimin verilerini ve tokenını değiştirmez", async () => {
    const fullToken = new mongoose.Types.ObjectId();
    harita.durum = "olusturuluyor";
    harita.aktifIslemToken = fullToken;
    const oncekiKonular = konuOzeti(harita.anaKonular);
    const oncekiToken = String(harita.aktifIslemToken);

    const sonuc = await materyalEklendigindeIncrementalGuncelle(
        materyalId,
        dersId,
        kullaniciId
    );

    assert.equal(sonuc, null);
    assert.deepEqual(konuOzeti(harita.anaKonular), oncekiKonular);
    assert.equal(String(harita.aktifIslemToken), oncekiToken);
    assert.equal(harita.durum, "olusturuluyor");
    assert.equal(haritaYazmaSayisi, 0);
});

test("değişikliklere kilitlenen harita incremental güncelleme ve materyal silme sonucuyla değişmez", async () => {
    harita.degisikliklereKilitli = true;
    const oncekiHarita = kopyala(harita);

    const incrementalSonuc = await materyalEklendigindeIncrementalGuncelle(
        materyalId,
        dersId,
        kullaniciId
    );
    const silmeSonucu = await materyalSilindigindeGuncelle(
        materyalId,
        dersId,
        kullaniciId
    );

    assert.equal(incrementalSonuc, null);
    assert.equal(silmeSonucu, null);
    assert.deepEqual(harita, oncekiHarita);
    assert.equal(haritaYazmaSayisi, 0);
});

test("kilitlendikten sonra geciken full analiz haritaya yazamaz", async () => {
    const token = new mongoose.Types.ObjectId();
    harita.durum = "olusturuluyor";
    harita.aktifIslemToken = token;
    const oncekiKonular = konuOzeti(harita.anaKonular);
    geminiDavranisi = async () => {
        harita.degisikliklereKilitli = true;
        return geminiCiktisi("Gecikmiş Sonuç");
    };

    await assert.rejects(
        konuHaritasiUretVeKaydet(ders, kullaniciId, token),
        /Konu haritası işlem kilidi kaybedildi/
    );

    assert.deepEqual(konuOzeti(harita.anaKonular), oncekiKonular);
    assert.equal(haritaYazmaSayisi, 0);
});

test("temizleniyor durumundaki ders için arka plan güncellemesi başlamaz ve sayaç değişmez", async () => {
    ders.temizleniyor = true;
    ders.aktifMateryalIslemSayisi = 0;
    const onceki = konuOzeti(harita.anaKonular);

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(ders.aktifMateryalIslemSayisi, 0);
    assert.deepEqual(konuOzeti(harita.anaKonular), onceki);
    assert.equal(haritaYazmaSayisi, 0);
});

test("normal ders için arka plan güncellemesi tamamlanır ve sayaç serbest bırakılır", async () => {
    ders.aktifMateryalIslemSayisi = 0;
    harita.kaynakMateryaller = [];

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(ders.aktifMateryalIslemSayisi, 0);
    assert.equal(harita.durum, "hazir");
    assert.equal(harita.aktifIslemToken, null);
    assert.ok(harita.kaynakMateryaller.length > 0);
});

test("iki eşzamanlı full işlemden eski olan yeni sonucu değiştiremez", async () => {
    const eskiToken = new mongoose.Types.ObjectId();
    const yeniToken = new mongoose.Types.ObjectId();
    harita.durum = "olusturuluyor";
    harita.aktifIslemToken = eskiToken;

    let eskiyiBirak;
    let eskiBasladi;
    const eskiBaslama = new Promise((resolve) => { eskiBasladi = resolve; });
    const eskiBekleme = new Promise((resolve) => { eskiyiBirak = resolve; });
    let cagri = 0;
    geminiDavranisi = async () => {
        cagri++;
        if (cagri === 1) {
            eskiBasladi();
            await eskiBekleme;
            return geminiCiktisi("Eski Sonuç");
        }
        return geminiCiktisi("Yeni Sonuç");
    };

    const eskiIslem = konuHaritasiUretVeKaydet(ders, kullaniciId, eskiToken);
    await eskiBaslama;
    harita.aktifIslemToken = yeniToken;

    const yeniSonuc = await konuHaritasiUretVeKaydet(ders, kullaniciId, yeniToken);
    assert.ok(yeniSonuc);
    eskiyiBirak();
    await assert.rejects(
        eskiIslem,
        /Konu haritası işlem kilidi kaybedildi/
    );

    assert.equal(harita.durum, "hazir");
    assert.equal(harita.aktifIslemToken, null);
    assert.equal(harita.anaKonular[0].baslik, "Yeni Sonuç");
});

test("geçerli tokena sahip full işlem başarıyla tamamlanır", async () => {
    const token = new mongoose.Types.ObjectId();
    harita.durum = "olusturuluyor";
    harita.aktifIslemToken = token;

    const sonuc = await konuHaritasiUretVeKaydet(ders, kullaniciId, token);

    assert.ok(sonuc);
    assert.equal(harita.durum, "hazir");
    assert.equal(harita.aktifIslemToken, null);
    assert.equal(harita.anaKonular[0].baslik, "Diziler");
});

for (const [durum, hazirla] of [
    ["onaylandıktan", () => { ders.materyallerOnaylandi = true; }],
    ["silinmeye başladıktan", () => { ders.temizleniyor = true; }]
]) {
    test(`ders ${durum} sonra eski full analiz sonucu kaydedilmez`, async () => {
        const token = new mongoose.Types.ObjectId();
        harita.durum = "olusturuluyor";
        harita.aktifIslemToken = token;
        const oncekiKonular = konuOzeti(harita.anaKonular);
        geminiDavranisi = async () => {
            hazirla();
            return geminiCiktisi("Kaydedilmemeli");
        };

        const sonuc = await konuHaritasiUretVeKaydet(ders, kullaniciId, token);

        assert.equal(sonuc, null);
        assert.deepEqual(konuOzeti(harita.anaKonular), oncekiKonular);
        assert.equal(harita.durum, "hazir");
        assert.equal(harita.aktifIslemToken, null);
    });
}

test("full üretim hatasında mevcut başarılı konu ve geçmiş verileri kaybolmaz", async () => {
    const token = new mongoose.Types.ObjectId();
    harita.durum = "olusturuluyor";
    harita.aktifIslemToken = token;
    harita.gecmisKonular = [{ konuId: "arsiv-1", baslik: "Arşiv" }];
    const oncekiKonular = konuOzeti(harita.anaKonular);
    const oncekiGecmis = konuOzeti(harita.gecmisKonular);
    geminiDavranisi = async () => { throw new Error("Gemini 503"); };

    await assert.rejects(
        konuHaritasiUretVeKaydet(ders, kullaniciId, token),
        /Gemini 503/
    );

    assert.equal(harita.durum, "hazir");
    assert.equal(harita.aktifIslemToken, null);
    assert.deepEqual(konuOzeti(harita.anaKonular), oncekiKonular);
    assert.deepEqual(konuOzeti(harita.gecmisKonular), oncekiGecmis);
});

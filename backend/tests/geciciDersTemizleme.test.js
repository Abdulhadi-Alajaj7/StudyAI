import { beforeEach, mock, test } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

const kullaniciId = new mongoose.Types.ObjectId();
const temelZaman = new Date("2026-10-17T12:00:00.000Z");

let dersler;
let materyaller;
let metinParcalari;
let konuHaritalari;
let veritabaniSaati;
let dosyaSilmeHatasi;
let dosyaSilmeBeklemesi;
let dosyaSilmeHook;
let dosyaSilmeCagrilari;

const ayni = (sol, sag) => String(sol) === String(sag);

const ifadeDegeri = (ifade, belge) => {
    if (ifade === "$$NOW") return new Date(veritabaniSaati);
    if (typeof ifade === "string" && ifade.startsWith("$")) {
        return belge[ifade.slice(1)];
    }
    if (ifade?.$ifNull) {
        const [birincil, yedek] = ifade.$ifNull;
        return ifadeDegeri(birincil, belge) ?? ifadeDegeri(yedek, belge);
    }
    if (ifade?.$subtract) {
        const [sol, sag] = ifade.$subtract;
        return new Date(ifadeDegeri(sol, belge).getTime() - ifadeDegeri(sag, belge));
    }
    return ifade;
};

const kosulEslesiyor = (belge, kosul) => {
    if (!belge) return false;

    for (const [alan, beklenen] of Object.entries(kosul)) {
        if (alan === "$expr") {
            const [sol, sag] = beklenen.$lt;
            if (!(ifadeDegeri(sol, belge) < ifadeDegeri(sag, belge))) return false;
            continue;
        }
        if (alan === "$or") {
            if (!beklenen.some((alt) => kosulEslesiyor(belge, alt))) return false;
            continue;
        }
        if (alan === "$and") {
            if (!beklenen.every((alt) => kosulEslesiyor(belge, alt))) return false;
            continue;
        }

        const gercek = belge[alan];
        const operatorMu = beklenen &&
            typeof beklenen === "object" &&
            !(beklenen instanceof Date) &&
            !(beklenen instanceof mongoose.Types.ObjectId);

        if (operatorMu) {
            if (Object.hasOwn(beklenen, "$ne")) {
                if (ayni(gercek, beklenen.$ne)) return false;
                continue;
            }
            if (Object.hasOwn(beklenen, "$lt")) {
                if (gercek == null || !(new Date(gercek) < beklenen.$lt)) return false;
                continue;
            }
            if (Object.hasOwn(beklenen, "$exists")) {
                if ((gercek !== undefined) !== beklenen.$exists) return false;
                continue;
            }
        }

        if (beklenen === null) {
            if (gercek != null) return false;
            continue;
        }
        if (beklenen instanceof Date) {
            if (!(gercek instanceof Date) || gercek.getTime() !== beklenen.getTime()) {
                return false;
            }
            continue;
        }
        if (!ayni(gercek, beklenen)) return false;
    }

    return true;
};

const guncelle = (belge, degisiklik, timestamps = true) => {
    Object.assign(belge, degisiklik.$set || {});
    for (const alan of Object.keys(degisiklik.$currentDate || {})) {
        belge[alan] = new Date(veritabaniSaati);
    }
    if (timestamps) belge.updatedAt = new Date(veritabaniSaati);
};

const DersMock = {
    async findOneAndUpdate(filtre, degisiklik, secenekler = {}) {
        const adaylar = dersler
            .filter((ders) => kosulEslesiyor(ders, filtre))
            .sort((sol, sag) => sol.updatedAt - sag.updatedAt);
        const ders = adaylar[0];
        if (!ders) return null;
        guncelle(ders, degisiklik, secenekler.timestamps !== false);
        return { ...ders };
    },
    async updateOne(filtre, degisiklik, secenekler = {}) {
        const ders = dersler.find((aday) => kosulEslesiyor(aday, filtre));
        if (!ders) return { matchedCount: 0, modifiedCount: 0 };
        guncelle(ders, degisiklik, secenekler.timestamps !== false);
        return { matchedCount: 1, modifiedCount: 1 };
    },
    async deleteOne(filtre) {
        const index = dersler.findIndex((ders) => kosulEslesiyor(ders, filtre));
        if (index < 0) return { deletedCount: 0 };
        dersler.splice(index, 1);
        return { deletedCount: 1 };
    }
};

const MateryalMock = {
    find(filtre) {
        return {
            select() { return this; },
            lean() {
                return Promise.resolve(
                    materyaller
                        .filter((materyal) => kosulEslesiyor(materyal, filtre))
                        .map((materyal) => ({ ...materyal }))
                );
            }
        };
    },
    async updateMany(filtre, degisiklik) {
        for (const materyal of materyaller.filter((aday) => kosulEslesiyor(aday, filtre))) {
            Object.assign(materyal, degisiklik.$set || {});
        }
    },
    async deleteMany(filtre) {
        materyaller = materyaller.filter((materyal) => !kosulEslesiyor(materyal, filtre));
    }
};

mock.module("../models/Ders.js", { defaultExport: DersMock });
mock.module("../models/Materyal.js", { defaultExport: MateryalMock });
mock.module("../models/MetinParcasi.js", {
    defaultExport: {
        async deleteMany(filtre) {
            metinParcalari = metinParcalari.filter((kayit) => !kosulEslesiyor(kayit, filtre));
        }
    }
});
mock.module("../models/KonuHaritasi.js", {
    defaultExport: {
        async deleteMany(filtre) {
            konuHaritalari = konuHaritalari.filter((kayit) => !kosulEslesiyor(kayit, filtre));
        }
    }
});
mock.module("../utils/dosyaIslemleri.js", {
    namedExports: {
        async guvenliDosyaSil(dosyaYolu) {
            dosyaSilmeCagrilari.push(dosyaYolu);
            if (dosyaSilmeBeklemesi) await dosyaSilmeBeklemesi;
            if (dosyaSilmeHatasi) throw dosyaSilmeHatasi;
            if (dosyaSilmeHook) dosyaSilmeHook();
        }
    }
});

const { geciciDersTemizlemeTuruCalistir } = await import(
    "../services/geciciDersTemizlemeService.js"
);

const sessizLogger = { log() {}, error() {} };

const dersEkle = ({
    yasDakika = 120,
    onaylandi = false,
    aktifIslem = 0,
    temizleniyor = false,
    token,
    leaseTarihi
} = {}) => {
    const ders = {
        _id: new mongoose.Types.ObjectId(),
        kullaniciId,
        materyallerOnaylandi: onaylandi,
        aktifMateryalIslemSayisi: aktifIslem,
        temizleniyor,
        updatedAt: new Date(temelZaman.getTime() - yasDakika * 60 * 1000)
    };
    if (token !== undefined) ders.temizlikIslemToken = token;
    if (leaseTarihi !== undefined) {
        ders.temizlikKilitSonYenilemeTarihi = leaseTarihi;
    }
    dersler.push(ders);
    materyaller.push({
        _id: new mongoose.Types.ObjectId(),
        dersId: ders._id,
        dosyaYolu: `${ders._id}.pdf`,
        durum: "hazir"
    });
    metinParcalari.push({ dersId: ders._id });
    konuHaritalari.push({ dersId: ders._id });
    return ders;
};

const temizlikCalistir = (simdi = temelZaman) => {
    veritabaniSaati = new Date(simdi);
    return geciciDersTemizlemeTuruCalistir({
        logger: sessizLogger,
        heartbeatAraligi: 60 * 60 * 1000
    });
};

beforeEach(() => {
    dersler = [];
    materyaller = [];
    metinParcalari = [];
    konuHaritalari = [];
    veritabaniSaati = new Date(temelZaman);
    dosyaSilmeHatasi = null;
    dosyaSilmeBeklemesi = null;
    dosyaSilmeHook = null;
    dosyaSilmeCagrilari = [];
});

test("bir saatten kısa süredir aktif olan ders silinmez", async () => {
    dersEkle({ yasDakika: 59 });

    const sonuc = await temizlikCalistir();

    assert.equal(sonuc.temizlenenDersSayisi, 0);
    assert.equal(dersler.length, 1);
    assert.equal(dosyaSilmeCagrilari.length, 0);
});

test("süresi dolmuş onaylanmamış ve işlemi olmayan ders temizlenir", async () => {
    dersEkle();

    const sonuc = await temizlikCalistir();

    assert.equal(sonuc.temizlenenDersSayisi, 1);
    assert.equal(dersler.length, 0);
    assert.equal(materyaller.length, 0);
    assert.equal(metinParcalari.length, 0);
    assert.equal(konuHaritalari.length, 0);
    assert.equal(dosyaSilmeCagrilari.length, 1);
});

test("aktif materyal veya harita işlem sayacı bulunan ders silinmez", async () => {
    dersEkle({ aktifIslem: 1 });

    const sonuc = await temizlikCalistir();

    assert.equal(sonuc.temizlenenDersSayisi, 0);
    assert.equal(dersler.length, 1);
});

test("onaylanmış ders otomatik temizlenmez", async () => {
    dersEkle({ onaylandi: true });

    const sonuc = await temizlikCalistir();

    assert.equal(sonuc.temizlenenDersSayisi, 0);
    assert.equal(dersler.length, 1);
});

test("iki temizlik çalışanından yalnızca biri aynı dersin lease'ini alır", async () => {
    dersEkle();
    let dosyaSilmeDevam;
    dosyaSilmeBeklemesi = new Promise((resolve) => {
        dosyaSilmeDevam = resolve;
    });

    const ilkCalisan = temizlikCalistir();
    await new Promise((resolve) => setImmediate(resolve));
    const ikinciCalisan = temizlikCalistir();
    await new Promise((resolve) => setImmediate(resolve));

    assert.equal(dosyaSilmeCagrilari.length, 1);
    dosyaSilmeDevam();

    const [ilkSonuc, ikinciSonuc] = await Promise.all([
        ilkCalisan,
        ikinciCalisan
    ]);
    assert.equal(
        ilkSonuc.temizlenenDersSayisi + ikinciSonuc.temizlenenDersSayisi,
        1
    );
    assert.equal(dersler.length, 0);
});

test("aktif lease devralınmaz, süresi dolan yarım temizlik güvenle sürdürülür", async () => {
    const ders = dersEkle();
    dosyaSilmeHatasi = new Error("disk geçici hatası");

    await temizlikCalistir();
    assert.equal(dersler.length, 1);
    assert.equal(ders.temizleniyor, true);
    const ilkToken = String(ders.temizlikIslemToken);

    dosyaSilmeHatasi = null;
    const erkenSonuc = await temizlikCalistir(
        new Date(temelZaman.getTime() + 4 * 60 * 1000)
    );
    assert.equal(erkenSonuc.temizlenenDersSayisi, 0);
    assert.equal(String(ders.temizlikIslemToken), ilkToken);

    const kurtarmaSonucu = await temizlikCalistir(
        new Date(temelZaman.getTime() + 6 * 60 * 1000)
    );
    assert.equal(kurtarmaSonucu.temizlenenDersSayisi, 1);
    assert.equal(dersler.length, 0);
});

test("tokensız eski yarım temizlik yalnızca bekleme süresi dolunca devralınır", async () => {
    dersEkle({ temizleniyor: true, yasDakika: 4 });

    const erkenSonuc = await temizlikCalistir();
    assert.equal(erkenSonuc.temizlenenDersSayisi, 0);
    assert.equal(dersler.length, 1);

    const kurtarmaSonucu = await temizlikCalistir(
        new Date(temelZaman.getTime() + 2 * 60 * 1000)
    );
    assert.equal(kurtarmaSonucu.temizlenenDersSayisi, 1);
    assert.equal(dersler.length, 0);
});

test("dosya silme hatasında veritabanı kayıtları korunur ve tekrar güvenlidir", async () => {
    dersEkle();
    dosyaSilmeHatasi = new Error("disk erişim hatası");

    const ilkSonuc = await temizlikCalistir();
    assert.equal(ilkSonuc.temizlenenDersSayisi, 0);
    assert.equal(dersler.length, 1);
    assert.equal(materyaller.length, 1);
    assert.equal(metinParcalari.length, 1);
    assert.equal(konuHaritalari.length, 1);

    dosyaSilmeHatasi = null;
    const tekrarSonucu = await temizlikCalistir(
        new Date(temelZaman.getTime() + 6 * 60 * 1000)
    );
    assert.equal(tekrarSonucu.temizlenenDersSayisi, 1);
    assert.equal(dersler.length, 0);

    const ucuncuSonuc = await temizlikCalistir(
        new Date(temelZaman.getTime() + 12 * 60 * 1000)
    );
    assert.equal(ucuncuSonuc.temizlenenDersSayisi, 0);
});

test("lease'i kaybeden eski çalışan veritabanı kayıtlarını silemez", async () => {
    const ders = dersEkle();
    dosyaSilmeHook = () => {
        ders.temizlikIslemToken = new mongoose.Types.ObjectId();
        ders.temizlikKilitSonYenilemeTarihi = new Date(veritabaniSaati);
    };

    const sonuc = await temizlikCalistir();

    assert.equal(sonuc.temizlenenDersSayisi, 0);
    assert.equal(dersler.length, 1);
    assert.equal(materyaller.length, 1);
    assert.equal(metinParcalari.length, 1);
    assert.equal(konuHaritalari.length, 1);
});

import { beforeEach, test, mock } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import AdmZip from "adm-zip";
import express from "express";
import mongoose from "mongoose";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDizini = path.resolve(__dirname, "../uploads/materyaller");
const dersId = new mongoose.Types.ObjectId();
const kullaniciId = new mongoose.Types.ObjectId();
let kayitlar = [];
let aktifIslemSayisi = 0;
let olusturmaCagrisi = 0;
let islemler = Promise.resolve();
let aktifOturum;

beforeEach(() => {
    kayitlar = [];
    aktifIslemSayisi = 0;
    olusturmaCagrisi = 0;
});

mock.method(mongoose, "startSession", async () => ({
    withTransaction(islem) {
        const sonuc = islemler.then(async () => {
            const oncekiKayitlar = [...kayitlar];
            const oncekiIslemSayisi = aktifIslemSayisi;
            aktifOturum = this;
            try {
                return await islem();
            } catch (hata) {
                kayitlar = oncekiKayitlar;
                aktifIslemSayisi = oncekiIslemSayisi;
                throw hata;
            } finally {
                aktifOturum = null;
            }
        });
        islemler = sonuc.catch(() => {});
        return sonuc;
    },
    async endSession() {}
}));

mock.module("../models/Ders.js", {
    defaultExport: {
        async findOneAndUpdate(_filtre, _guncelleme, { session }) {
            assert.equal(session, aktifOturum);
            aktifIslemSayisi++;
            return { _id: dersId, kullaniciId };
        },
        async findOne() {
            return { _id: dersId, kullaniciId };
        },
        async updateOne() {
            aktifIslemSayisi--;
        }
    }
});

mock.module("../models/Materyal.js", {
    defaultExport: {
        async create([veri], { session }) {
            assert.equal(session, aktifOturum);
            olusturmaCagrisi++;
            const kayit = { ...veri, _id: new mongoose.Types.ObjectId() };
            kayitlar.push(kayit);
            return [kayit];
        },
        async countDocuments(_filtre, { session }) {
            assert.equal(session, aktifOturum);
            return kayitlar.length;
        },
        async deleteMany(filtre) {
            const ids = (filtre._id?.$in || []).map(String);
            kayitlar = kayitlar.filter((kayit) => !ids.includes(String(kayit._id)));
        },
        async findOne({ dosyaHash }, _alanlar, { session }) {
            assert.equal(session, aktifOturum);
            return kayitlar.find(kayit => kayit.dosyaHash === dosyaHash) || null;
        },
        async findOneAndUpdate() { return null; }
    }
});

mock.module("../models/MetinParcasi.js", {
    defaultExport: { async deleteMany() {} }
});

mock.module("../services/metinCikarmaService.js", {
    namedExports: { async metinCikar() { return "metin"; } }
});

mock.module("../services/metinParcalamaService.js", {
    namedExports: { async metinParcalaVeKaydet() {} }
});

mock.module("../services/konuHaritasiService.js", {
    namedExports: {
        async materyalEklendigindeIncrementalGuncelle() {},
        async materyalSilindigindeGuncelle() {}
    }
});

const { materyalYukle } = await import("../controllers/materyalController.js");
mock.module("../middleware/auth.js", {
    defaultExport: (req, _res, next) => { req.user = { _id: kullaniciId }; next(); }
});
mock.module("../controllers/semanticAramaController.js", {
    namedExports: { materyalEmbeddingleriniYenile() {} }
});
const { default: materyalRoutes } = await import("../routes/materyalRoutes.js");

const yuklemeSunucusu = async (t) => {
    const app = express();
    app.use("/materyaller", materyalRoutes);
    const sunucu = app.listen(0, "127.0.0.1");
    await once(sunucu, "listening");
    t.after(async () => {
        await new Promise(resolve => sunucu.close(resolve));
        await Promise.all(kayitlar.map(kayit => fs.rm(kayit.dosyaYolu, { force: true })));
    });
    return async (dosyalar) => {
        const govde = new FormData();
        for (const [ad, icerik, type = "text/plain"] of dosyalar) {
            govde.append("dosyalar", new Blob([icerik], { type }), ad);
        }
        const yanit = await fetch(`http://127.0.0.1:${sunucu.address().port}/materyaller/ders/${dersId}`, {
            method: "POST", body: govde
        });
        return { durum: yanit.status, veri: await yanit.json() };
    };
};

const responseMock = () => ({
    statusCode: 200,
    body: null,
    status(kod) { this.statusCode = kod; return this; },
    json(govde) { this.body = govde; return this; }
});

test("çoklu yüklemede geçersiz dosya kalıcı kayıt oluşturmadan tüm geçici dosyaları temizler", async (t) => {
    await fs.mkdir(uploadDizini, { recursive: true });
    const ek = `${process.pid}-${Date.now()}`;
    const gecerliYol = path.join(uploadDizini, `dogrulama-gecerli-${ek}.pdf`);
    const gecersizYol = path.join(uploadDizini, `dogrulama-gecersiz-${ek}.pdf`);
    t.after(async () => {
        await Promise.all([
            fs.rm(gecerliYol, { force: true }),
            fs.rm(gecersizYol, { force: true })
        ]);
    });
    await fs.writeFile(gecerliYol, "%PDF-1.7\n%%EOF");
    await fs.writeFile(gecersizYol, "sahte pdf");

    const res = responseMock();
    await materyalYukle({
        params: { dersId: dersId.toString() },
        user: { _id: kullaniciId },
        files: [
            {
                path: gecerliYol,
                filename: path.basename(gecerliYol),
                originalname: "gecerli.pdf",
                mimetype: "application/pdf",
                size: 18
            },
            {
                path: gecersizYol,
                filename: path.basename(gecersizYol),
                originalname: "sahte.pdf",
                mimetype: "application/pdf",
                size: 9
            }
        ]
    }, res);

    assert.equal(res.statusCode, 400);
    assert.match(res.body.hata, /geçerli bir PDF değil/);
    assert.equal(olusturmaCagrisi, 0);
    assert.equal(kayitlar.length, 0);
    assert.equal(aktifIslemSayisi, 0);
    await assert.rejects(fs.access(gecerliYol), { code: "ENOENT" });
    await assert.rejects(fs.access(gecersizYol), { code: "ENOENT" });
});

test("HTTP yüklemesi mevcut kayıtları sayar ve eşzamanlı isteklerden yalnız biri son yeri alır", async (t) => {
    const yukle = await yuklemeSunucusu(t);
    const ilkDosyalar = [["a.txt", "Ders notu A"], ["b.txt", "Ders notu B"]];
    assert.equal((await yukle([...ilkDosyalar, ["c.txt", "Ders notu C"], ["d.txt", "Ders notu D"]])).durum, 400);
    assert.equal((await yukle(ilkDosyalar)).durum, 201);
    const topluAsim = await yukle([["c.txt", "Ders notu C"], ["d.txt", "Ders notu D"]]);
    assert.equal(topluAsim.durum, 400);
    assert.match(topluAsim.veri.hata, /En fazla 1 dosya daha/);
    assert.equal(kayitlar.length, 2);

    const sonuclar = await Promise.all([
        yukle([["c.txt", "Ders notu C"]]),
        yukle([["d.txt", "Ders notu D"]])
    ]);
    assert.deepEqual(sonuclar.map(sonuc => sonuc.durum).sort(), [201, 400]);
    assert.match(sonuclar.find(sonuc => sonuc.durum === 400).veri.hata, /mevcut bir materyali silin/);
    assert.equal(kayitlar.length, 3);
    assert.equal(olusturmaCagrisi, 3);
});

test("HTTP toplu yüklemede mevcut ve tekrarlanan içerik yalnız bir kez kaydedilir", async (t) => {
    const yukle = await yuklemeSunucusu(t);
    assert.equal((await yukle([["ilk.txt", "Birinci içerik"]])).durum, 201);
    const sonuc = await yukle([["tekrar.txt", "Birinci içerik"], ["yeni.txt", "İkinci içerik"]]);
    assert.equal(sonuc.durum, 201);
    assert.deepEqual(sonuc.veri.tekrarEdenDosyalar, ["tekrar.txt"]);
    assert.equal(kayitlar.length, 2);
});

const sinirdaOfficeDosyasi = (ornek, boyut) => {
    const zip = new AdmZip(path.join(__dirname, "dersler", ornek));
    const ekDosya = "test-padding.bin";
    const dolguEkle = (uzunluk) => {
        zip.addFile(ekDosya, Buffer.alloc(uzunluk));
        zip.getEntry(ekDosya).header.method = 0; // Sıkıştırmasız ZIP girdisi
        return zip.toBuffer();
    };
    const ilkBoyut = dolguEkle(1).length;
    return dolguEkle(boyut - ilkBoyut + 1);
};

for (const [uzanti, boyut, etiket, mime, ornek] of [
    ["txt", 51200, "50 KB", "text/plain"],
    ["pdf", 2097152, "2 MB", "application/pdf"],
    ["docx", 1048576, "1 MB", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "01_Veri_Yapilarina_Giris.docx"],
    ["pptx", 2097152, "2 MB", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "07_Siralama_Algoritmalari.pptx"]
]) {
    test(`HTTP ${uzanti} yüklemesi tam sınırda kabul edilir ve bir bayt üzerinde reddedilir`, async (t) => {
        const yukle = await yuklemeSunucusu(t);
        const icerik = (uzunluk) => {
            if (ornek) return sinirdaOfficeDosyasi(ornek, uzunluk);
            const veri = Buffer.alloc(uzunluk, "a");
            if (uzanti === "pdf") veri.write("%PDF-1.7\n");
            return veri;
        };
        const buyuk = icerik(boyut + 1);
        const uygun = icerik(boyut);
        assert.equal(buyuk.length, boyut + 1);
        assert.equal(uygun.length, boyut);
        const red = await yukle([[`buyuk.${uzanti}`, buyuk, mime]]);
        assert.equal(red.durum, 400);
        assert.equal(red.veri.kod, "LIMIT_FILE_SIZE");
        assert.match(red.veri.hata, new RegExp(etiket));
        assert.equal(kayitlar.length, 0);
        assert.equal((await yukle([[`uygun.${uzanti}`, uygun, mime]])).durum, 201);
        assert.equal(kayitlar.length, 1);
    });
}

import { test, mock } from "node:test";
import assert from "node:assert/strict";
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

mock.module("../models/Ders.js", {
    defaultExport: {
        async findOneAndUpdate() {
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
        async create(veri) {
            olusturmaCagrisi++;
            const kayit = { ...veri, _id: new mongoose.Types.ObjectId() };
            kayitlar.push(kayit);
            return kayit;
        },
        async deleteMany(filtre) {
            const ids = (filtre._id?.$in || []).map(String);
            kayitlar = kayitlar.filter((kayit) => !ids.includes(String(kayit._id)));
        },
        async findOne() { return null; },
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

    kayitlar = [];
    aktifIslemSayisi = 0;
    olusturmaCagrisi = 0;
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

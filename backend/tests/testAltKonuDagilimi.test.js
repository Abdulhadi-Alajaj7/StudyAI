import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import TestModel from "../models/Test.js";
import { testOlustur } from "../services/testService.js";
import { geminiIleTestSorulariUret } from "../services/geminiService.js";
import { testOlusturmaGirdisiniDogrula, testiSunumaHazirla } from "../controllers/testController.js";
import { ornekPaket, geminiTaklidi } from "./helpers/testUretimOrnekleri.js";

const zincir = (deger) => ({ select() { return this; }, sort() { return this; }, async lean() { return deger; } });
const ortamOlustur = (dagilim, yanitOlustur) => {
    const paket = ornekPaket(dagilim);
    const kullaniciId = new mongoose.Types.ObjectId();
    const dersId = new mongoose.Types.ObjectId();
    const materyaller = paket.girdi.kaynaklar.map((k) => ({ _id: new mongoose.Types.ObjectId(),
        aktifIslemeId: new mongoose.Types.ObjectId(), dosyaAdi: k.dosyaAdi, durum: "hazir" }));
    const harita = { parcaAtamaSurumu: 1, anaKonular: [{ konuId: "top-veri", baslik: "Veri Yapıları",
        kaynakMateryalIds: materyaller.map((m) => m._id),
        altKonular: paket.girdi.izinliKonuIds.map((konu, index) => ({ ...konu, kaynakMateryalIds: [materyaller[index]._id] })) }],
        parcaKonuAtamalari: materyaller.map((m, i) => ({ materyalId: m._id, islemeId: m.aktifIslemeId, parcaIndex: 0, konuIds: [`sub-${i}`] })),
    };
    const parcalar = paket.girdi.kaynaklar.map((k, i) => ({ ...k,
        materyalId: materyaller[i]._id, islemeId: materyaller[i].aktifIslemeId }));
    const mock = geminiTaklidi(yanitOlustur ? yanitOlustur(paket) : [{ sorular: paket.sorular }]);
    let kayit;
    const bagimliliklar = {
        DersModel: { findOne: () => zincir({ _id: dersId, dersAdi: "Veri Yapıları" }) },
        KonuHaritasiModel: { findOne: () => zincir(harita) },
        MateryalModel: { find: (filtre) => zincir(materyaller.filter((m) => !filtre._id?.$in || filtre._id.$in.some((id) => String(id) === String(m._id)))) },
        MetinParcasiModel: { find: () => zincir(parcalar) },
        TestModel: { async create(veri) {
            const belge = new TestModel(veri);
            assert.equal(belge.validateSync(), undefined);
            kayit = belge.toObject();
            return belge;
        } },
        geminiTestUret: (girdi, deps) => geminiIleTestSorulariUret(girdi, { ...deps, ...mock.bagimliliklar }),
        testTanilamaYaz: () => {},
    };
    return { paket, harita, parcalar, materyaller, mock, bagimliliklar, kaydiGetir: () => kayit,
        istek: { kullaniciId, dersId, kapsamTuru: "konu", konuId: dagilim.length === 1 ? "sub-0" : "top-veri",
            soruSayisi: paket.girdi.soruSayisi, zorluk: "orta" } };
};

for (const dagilim of [[2, 2, 2, 2, 2], [4, 4, 4, 4, 4], [3, 3, 3, 3], [2, 2, 1, 1, 1], [3, 1, 1, 1, 1], [5]]) {
    test(`servis → Gemini taklidi → MongoDB şeması: ${dagilim} dağılımı eksiksiz kaydedilir`, async () => {
        const ortam = ortamOlustur(dagilim);
        const belge = await testOlustur(ortam.istek, ortam.bagimliliklar);
        assert.equal(belge.soruSayisi, ortam.istek.soruSayisi);
        assert.equal(belge.istenenSoruSayisi, belge.sorular.length);
        assert.equal(belge.eksikSoruNedeni, "");
        assert.deepEqual(dagilim.map((_, i) => belge.sorular.filter((s) => s.konuId === `sub-${i}`).length), dagilim);
        assert.equal(ortam.mock.istekler.length, 1);
        const sunum = testiSunumaHazirla(belge);
        for (const soru of sunum.sorular) {
            for (const alan of ["dogruCevap", "aciklama", "ogrenmeHedefi", "kaynakKanitlari", "kaynakReferanslari"]) assert.equal(soru[alan], undefined);
        }
    });
}

test("eksik sayı için yeni üretim yapılmaz ve MongoDB create çağrılmaz", async () => {
    const ortam = ortamOlustur([2, 2, 2, 2, 2], ({ sorular }) => [{ sorular: sorular.slice(0, 8) }]);
    await assert.rejects(testOlustur(ortam.istek, ortam.bagimliliklar), { kod: "TEST_HEDEFI_KARSILANAMADI" });
    assert.equal(ortam.mock.istekler.length, 1);
    assert.equal(ortam.kaydiGetir(), undefined);
});

test("dağılım prompta bırakılır ve biçimi geçerli yanıt kaydedilir", async () => {
    const ortam = ortamOlustur([2, 2, 2, 2, 2]);
    ortam.bagimliliklar.geminiTestUret = async () => ({ sorular: [...ortam.paket.sorular.slice(0, 8), ortam.paket.soru(0, 2), ortam.paket.soru(0, 3)] });
    await testOlustur(ortam.istek, ortam.bagimliliklar);
    assert.equal(ortam.kaydiGetir().soruSayisi, 10);
});

test("üretim sırasında kaynak sürümü değişirse geçerli test de kaydedilmez", async () => {
    const ortam = ortamOlustur([2, 2, 2, 2, 2]);
    const uret = ortam.bagimliliklar.geminiTestUret;
    ortam.bagimliliklar.geminiTestUret = async (...args) => {
        const sonuc = await uret(...args);
        ortam.materyaller[0].aktifIslemeId = new mongoose.Types.ObjectId();
        return sonuc;
    };
    await assert.rejects(testOlustur(ortam.istek, ortam.bagimliliklar), { kod: "KAYNAK_SURUMU_DEGISTI" });
    assert.equal(ortam.kaydiGetir(), undefined);
});

test("beş alt konuya dört soru isteği API çağrısı ve kayıt olmadan uyarılır", async () => {
    const ortam = ortamOlustur([1, 1, 1, 1, 1]);
    await assert.rejects(testOlustur({ ...ortam.istek, soruSayisi: 4 }, ortam.bagimliliklar), { kod: "ALT_KONU_SORU_SAYISI_YETERSIZ" });
    assert.equal(ortam.mock.istekler.length, 0);
    assert.equal(ortam.kaydiGetir(), undefined);
});

test("API yalnız mevcut ana ve alt konu seçeneklerini kabul eder", () => {
    const dersId = String(new mongoose.Types.ObjectId());
    for (const [konuId, izinli] of [["sub-ornek", [5, 10]], ["top-veri", [10, 15, 20]]]) {
        for (const soruSayisi of [0, 1, 5, 7, 10, 12, 15, 20, 21, 1.5, true, "yanlış"]) {
            const sonuc = testOlusturmaGirdisiniDogrula(dersId, { kapsamTuru: "konu", konuId, soruSayisi });
            if (izinli.includes(soruSayisi)) assert.equal(sonuc.soruSayisi, soruSayisi);
            else assert.equal(sonuc.kod, "GECERSIZ_SORU_SAYISI");
        }
    }
});

test("geçici JSON denetim alanları sunumdan kaldırılır, soru ve konu ilişkisi korunur", () => {
    const soru = { konuId: "sub-ornek", konuBasligi: "Alt konu", metin: "Soru", dogruCevap: "A", aciklama: "Açıklama",
        konuDogrulama: { hedefSkor: 1 }, kaliteDogrulama: { guven: 1 },
        kaynaklar: [{ dosyaAdi: "ders.pdf", parcaIndeksleri: [3], parcaSkorlari: [{ parcaIndex: 3, skor: 1 }] }] };
    const sunum = testiSunumaHazirla({ sorular: [soru] });
    assert.equal(sunum.sorular[0].konuId, "sub-ornek");
    assert.deepEqual(sunum.sorular[0].kaynaklar, [{ dosyaAdi: "ders.pdf", parcaIndeksleri: [3] }]);
    assert.equal(sunum.sorular[0].konuDogrulama, undefined);
    assert.equal(sunum.sorular[0].kaliteDogrulama, undefined);
    assert.equal(sunum.sorular[0].dogruCevap, undefined);
    assert.equal(testiSunumaHazirla({ sorular: [soru] }, { inceleme: true }).sorular[0].dogruCevap, "A");
});

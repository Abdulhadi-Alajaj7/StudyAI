import test from "node:test";
import assert from "node:assert/strict";

import {
    kaynakAdlariniGetir,
    konuSecenekleriniOlustur,
    kullanilabilirMateryalleriSec,
    ozetGirdisiOlustur,
    ozetSecimAnahtari,
    ozetSonucDurumunuBelirle,
} from "../src/utils/dersOzetiYardimcilari.mjs";

test("özet girdisi yalnızca seçilen türün backend alanlarını taşır", () => {
    assert.deepEqual(
        ozetGirdisiOlustur({ tur: "tum_ders", uzunluk: "orta", materyalId: "m1", konuId: "k1" }),
        { tur: "tum_ders", uzunluk: "orta" }
    );
    assert.deepEqual(
        ozetGirdisiOlustur({ tur: "materyal", uzunluk: "kisa", materyalId: "m1", konuId: "k1" }),
        { tur: "materyal", uzunluk: "kisa", materyalId: "m1" }
    );
    assert.deepEqual(
        ozetGirdisiOlustur({ tur: "konu", uzunluk: "uzun", materyalId: "m1", konuId: "k1" }),
        { tur: "konu", uzunluk: "uzun", konuId: "k1" }
    );
    assert.equal(ozetGirdisiOlustur({ tur: "materyal", uzunluk: "orta" }), null);
    assert.notEqual(
        ozetSecimAnahtari("d1", { tur: "konu", uzunluk: "orta", konuId: "k1" }),
        ozetSecimAnahtari("d1", { tur: "konu", uzunluk: "orta", konuId: "k2" })
    );
});

test("yalnızca hazır ve aktif sürümü olan materyaller seçilebilir", () => {
    const sonuc = kullanilabilirMateryalleriSec([
        { _id: "m1", durum: "hazir", aktifIslemeId: "i1" },
        { _id: "m2", durum: "hazir", aktifIslemeId: null },
        { _id: "m3", durum: "isleniyor", aktifIslemeId: "i3" },
    ]);
    assert.deepEqual(sonuc.map((materyal) => materyal._id), ["m1"]);
});

test("konu haritası ana ve alt konu kimliklerini hiyerarşik etiketlerle sunar", () => {
    const sonuc = konuSecenekleriniOlustur({
        anaKonular: [{
            konuId: "top-1",
            baslik: "Veri Yapıları",
            altKonular: [{ konuId: "sub-1", baslik: "Yığın" }],
        }],
    });
    assert.deepEqual(sonuc, [
        { konuId: "top-1", baslik: "Veri Yapıları", etiket: "Veri Yapıları", tur: "ana_konu" },
        { konuId: "sub-1", baslik: "Yığın", etiket: "Veri Yapıları — Yığın", tur: "alt_konu" },
    ]);
});

test("kaynak sunumu yalnızca gerçek dosya adlarını tekilleştirir ve parça indekslerini göstermez", () => {
    const sonuc = kaynakAdlariniGetir([
        { dosyaAdi: "Hafta 1.pdf", parcaIndeksleri: [0, 4] },
        { dosyaAdi: "Hafta 1.pdf", parcaIndeksleri: [8] },
        { dosyaAdi: "Ders Notu.docx", parcaIndeksleri: [2] },
        { dosyaAdi: " " },
    ]);
    assert.deepEqual(sonuc, ["Hafta 1.pdf", "Ders Notu.docx"]);
    assert.ok(sonuc.every((ad) => !ad.includes("0") && !ad.includes("4")));
});

test("özet üretilirken boş durum yerine loading gösterilir ve mevcut özet korunur", () => {
    assert.equal(
        ozetSonucDurumunuBelirle({ olusturuluyor: true, ozet: null }),
        "olusturuluyor"
    );
    assert.equal(
        ozetSonucDurumunuBelirle({ olusturuluyor: true, ozet: { _id: "o1" } }),
        "icerik"
    );
    assert.equal(
        ozetSonucDurumunuBelirle({ kayitliOzetYukleniyor: true, ozet: null }),
        "kayitli_yukleniyor"
    );
    assert.equal(ozetSonucDurumunuBelirle({}), "bos");
});

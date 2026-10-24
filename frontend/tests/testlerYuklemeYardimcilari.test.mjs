import test from "node:test";
import assert from "node:assert/strict";

import {
    testlerIstegiGuncelMi,
    testlerYuklemeSonucunuOlustur,
} from "../src/utils/testlerYuklemeYardimcilari.mjs";

const istekIptalEdildiMi = (hata) => hata?.name === "AbortError";
const hataMesajiOlustur = (_hata, varsayilanMesaj) => varsayilanMesaj;

test("StrictMode cleanup/setup döngüsünde yalnızca ikinci sayfa isteği güncel kalır", () => {
    const ilkController = new AbortController();
    let aktifController = ilkController;

    assert.equal(testlerIstegiGuncelMi({
        controller: ilkController,
        aktifController,
        istekDersId: "ders-1",
        aktifDersId: "ders-1",
    }), true);

    ilkController.abort();
    const ikinciController = new AbortController();
    aktifController = ikinciController;

    assert.equal(testlerIstegiGuncelMi({
        controller: ilkController,
        aktifController,
        istekDersId: "ders-1",
        aktifDersId: "ders-1",
    }), false);
    assert.equal(testlerIstegiGuncelMi({
        controller: ikinciController,
        aktifController,
        istekDersId: "ders-1",
        aktifDersId: "ders-1",
    }), true);
});

test("iptal edilen veya eski derse ait istek state güncellemesi yapamaz", () => {
    const controller = new AbortController();
    controller.abort();

    assert.equal(testlerIstegiGuncelMi({
        controller,
        aktifController: controller,
        istekDersId: "ders-1",
        aktifDersId: "ders-1",
    }), false);

    const eskiDersController = new AbortController();
    assert.equal(testlerIstegiGuncelMi({
        controller: eskiDersController,
        aktifController: eskiDersController,
        istekDersId: "ders-1",
        aktifDersId: "ders-2",
    }), false);
});

test("boş başarılı API yanıtları hata üretmeden boş listelere dönüşür", () => {
    const sonuc = testlerYuklemeSonucunuOlustur([
        { status: "fulfilled", value: { data: { materyaller: [] } } },
        { status: "fulfilled", value: { data: { harita: null } } },
        { status: "fulfilled", value: { data: { testler: [] } } },
        { status: "fulfilled", value: { data: { testler: [] } } },
    ], { istekIptalEdildiMi, hataMesajiOlustur });

    assert.deepEqual(sonuc.devamEdenTestler, []);
    assert.deepEqual(sonuc.tamamlananTestler, []);
    assert.deepEqual(sonuc.listeHatalari, { devam: "", tamamlanan: "" });
});

test("başarısız API yanıtları görünür bölüm hatalarına dönüşür", () => {
    const hata = new Error("sunucu kullanılamıyor");
    const sonuc = testlerYuklemeSonucunuOlustur([
        { status: "rejected", reason: hata },
        { status: "rejected", reason: hata },
        { status: "rejected", reason: hata },
        { status: "rejected", reason: hata },
    ], { istekIptalEdildiMi, hataMesajiOlustur });

    assert.deepEqual(sonuc.secenekHatalari, {
        materyal: "Materyaller yüklenemedi.",
        konu: "Konular yüklenemedi.",
    });
    assert.deepEqual(sonuc.listeHatalari, {
        devam: "Devam eden testler yüklenemedi.",
        tamamlanan: "Geçmiş testler yüklenemedi.",
    });
});

test("iptal hataları kullanıcıya API hatası olarak gösterilmez", () => {
    const iptalHatasi = Object.assign(new Error("iptal"), { name: "AbortError" });
    const sonuc = testlerYuklemeSonucunuOlustur([
        { status: "rejected", reason: iptalHatasi },
        { status: "rejected", reason: iptalHatasi },
        { status: "rejected", reason: iptalHatasi },
        { status: "rejected", reason: iptalHatasi },
    ], { istekIptalEdildiMi, hataMesajiOlustur });

    assert.deepEqual(sonuc.secenekHatalari, { materyal: "", konu: "" });
    assert.deepEqual(sonuc.listeHatalari, { devam: "", tamamlanan: "" });
});

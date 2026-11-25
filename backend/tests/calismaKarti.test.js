import test, { mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import CalismaKarti from "../models/CalismaKarti.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import { aktifMateryalMetinleriniTopla } from "../services/konuHaritasiService.js";
import {
    konuBaglantiliKartGruplariniOlustur, dersKartlariniDogrula, kartDersKaynakImzasi,
} from "../services/dersKartPlanlama.mjs";

const materyaller = [{ _id: "m1", aktifIslemeId: "v1", dosyaAdi: "Hafta1.pdf" },
    { _id: "m2", aktifIslemeId: "v2", dosyaAdi: "Hafta2.pdf" }];
const parcalar = [
    { materyalId: "m1", islemeId: "v1", parcaIndex: 0, icerik: "Tanım ve formül. ".repeat(1800) },
    { materyalId: "m2", islemeId: "v2", parcaIndex: 0, icerik: "Örnek ve yöntem. ".repeat(1800) },
];
const harita = {
    anaKonular: [{ konuId: "top-1", baslik: "Ana", aciklama: "Ders kapsamı", altKonular: [
        { konuId: "sub-1", baslik: "Veri" }, { konuId: "sub-2", baslik: "Model" },
    ] }],
    parcaKonuAtamalari: parcalar.map((p, i) => ({ ...p, konuIds: ["sub-" + (i + 1)] })),
};
const gruplariAl = () => konuBaglantiliKartGruplariniOlustur(parcalar, materyaller, harita);
const dogrula = (hamKartlar) => dersKartlariniDogrula({ ...gruplariAl()[0], hamKartlar });
const kart = { soru: "Tanım?", cevap: "Kaynak yanıtı.", konuId: "sub-1", kaynakKodlari: ["P1"] };

test("80.000 karaktere sığan tüm aktif metinler kesilmeden tek isteğe alınır", () => {
    const gruplar = gruplariAl();
    assert.equal(gruplar.length, 1);
    assert.deepEqual(gruplar[0].kaynaklar.map((k) => k.icerik), parcalar.map((p) => p.icerik));
    assert.deepEqual(gruplar[0].kaynaklar.map((k) => k.kod), ["P1", "P2"]);
    assert.deepEqual(gruplar[0].kaynaklar.map((k) => k.konuIds), [["sub-1"], ["sub-2"]]);
    assert.deepEqual(gruplar[0].konular.map((k) => k.konuId), ["top-1", "sub-1", "sub-2"]);
    assert.equal(gruplar[0].konular[1].anaKonuId, "top-1");
    assert.match(gruplar[0].metin, /Hafta1.pdf/);
    assert.match(gruplar[0].metin, /Hafta2.pdf/);
});

test("büyük ders yalnız 80.000 sınırında gruplanır; P kodları ve tüm konular korunur", () => {
    const uzun = parcalar.map((p) => ({ ...p, icerik: p.icerik.repeat(2) }));
    const gruplar = konuBaglantiliKartGruplariniOlustur(uzun, materyaller, harita);
    assert.equal(gruplar.length, 2);
    assert.deepEqual(gruplar.flatMap((g) => g.kaynaklar.map((k) => k.icerik)), uzun.map((p) => p.icerik));
    assert.deepEqual(gruplar.flatMap((g) => g.kaynaklar.map((k) => k.kod)), ["P1", "P2"]);
    assert.ok(gruplar.every((g) => g.konular.length === 3));
});

test("kart ve mevcut konu haritası toplayıcısı aynı sınırda aynı parçaları gruplar", async () => {
    for (const uzunluk of [39_970, 40_000, 80_500]) {
        const metinler = parcalar.map((p) => ({ ...p, icerik: "x".repeat(uzunluk) }));
        const materyalMock = mock.method(Materyal, "find", () => ({ select: async () => materyaller }));
        const parcaMock = mock.method(MetinParcasi, "find", () => ({ sort: async () => metinler }));
        try {
            const referans = await aktifMateryalMetinleriniTopla("ders", "kullanici");
            const kartGruplari = konuBaglantiliKartGruplariniOlustur(metinler, materyaller, harita);
            assert.deepEqual(kartGruplari.map((g) => g.kaynaklar.map((k) => k.kod)),
                referans.metinGruplari.map((g) => [...g.matchAll(/\[PARCA (P\d+)\]/g)].map((m) => m[1])));
            assert.deepEqual(kartGruplari.flatMap((g) => g.kaynaklar.map((k) => k.icerik)),
                metinler.map((p) => p.icerik));
        } finally {
            materyalMock.mock.restore();
            parcaMock.mock.restore();
        }
    }
});

test("pasif sürüm gönderilmez; eksik veya uydurma konu bağlantısı yeniden sınıflandırılmaz", () => {
    const gruplar = konuBaglantiliKartGruplariniOlustur([
        ...parcalar, { ...parcalar[0], islemeId: "eski", icerik: "PASİF" },
    ], materyaller, harita);
    assert.doesNotMatch(gruplar[0].metin, /PASİF/);
    for (const atamalar of [[], [{ ...parcalar[0], konuIds: ["uydurma"] }]]) {
        assert.throws(() => konuBaglantiliKartGruplariniOlustur(parcalar, materyaller,
            { ...harita, parcaKonuAtamalari: atamalar }), { kod: "KART_KONU_KAYNAGI_EKSIK" });
    }
    assert.throws(() => konuBaglantiliKartGruplariniOlustur(parcalar, materyaller, null),
        { kod: "KART_KONU_HARITASI_YOK" });
});

test("Gemini'nin kart sayısı ve içeriği korunur, tekrar/kalite analizi yapılmaz", () => {
    const sonuc = dogrula(Array.from({ length: 40 }, () => ({ ...kart })));
    assert.equal(sonuc.length, 40);
    assert.equal(sonuc[0].soru, kart.soru);
    assert.equal(sonuc[0].konuId, "sub-1");
    assert.equal(sonuc[0].kaynaklar[0].kod, "P1");
    assert.equal(sonuc[0].kaynaklar[0].islemeId, "v1");
    assert.deepEqual(dogrula([]), []);
});

test("eksik alanlar ve uydurma kimlikler tüm yanıtı reddeder; kartlar sessizce düşürülmez", () => {
    for (const degisiklik of [
        { soru: "" }, { cevap: "" }, { konuId: "uydurma" }, { kaynakKodlari: [] },
        { kaynakKodlari: ["P1", "P999"] }, { kaynakKodlari: [1] }, { cevap: "a".repeat(2001) },
    ]) {
        assert.throws(() => dogrula([kart, { ...kart, ...degisiklik }]), { status: 502 });
    }
    assert.throws(() => dogrula(null), { kod: "KART_GECERSIZ_YANIT" });
});

test("kaynak, işleme sürümü ve konu bağlantısı değişiklikleri grup imzasına yansır", () => {
    const ilk = gruplariAl()[0].imza;
    const farkli = parcalar.map((p) => ({ ...p, icerik: p.icerik + " yeni bilgi" }));
    assert.notEqual(ilk, konuBaglantiliKartGruplariniOlustur(farkli, materyaller, harita)[0].imza);
    assert.notEqual(kartDersKaynakImzasi(materyaller, parcalar), kartDersKaynakImzasi(materyaller, farkli));
    const yeniParcalar = parcalar.map((p) => ({ ...p, islemeId: "yeni" }));
    const yeniMateryaller = materyaller.map((m) => ({ ...m, aktifIslemeId: "yeni" }));
    const yeniHarita = { ...harita, parcaKonuAtamalari: harita.parcaKonuAtamalari.map((a) => ({ ...a, islemeId: "yeni" })) };
    assert.notEqual(ilk, konuBaglantiliKartGruplariniOlustur(yeniParcalar, yeniMateryaller, yeniHarita)[0].imza);
    assert.notEqual(ilk, konuBaglantiliKartGruplariniOlustur(parcalar, materyaller,
        { ...harita, parcaKonuAtamalari: harita.parcaKonuAtamalari.map((a) => ({ ...a, konuIds: ["top-1"] })) })[0].imza);
});

test("MongoDB modeli kaynak kodunu ve sürümü saklar, eski kartlar geçerli kalır", async () => {
    const temel = { kullaniciId: new mongoose.Types.ObjectId(), dersId: new mongoose.Types.ObjectId(),
        soru: "Soru?", cevap: "Yanıt", goruldu: true, yildizli: true, zorluk: "zor",
        kaynaklar: [{ materyalId: new mongoose.Types.ObjectId(), dosyaAdi: "Hafta.pdf", parcaIndex: 0 }] };
    const eski = new CalismaKarti(temel);
    await eski.validate();
    assert.equal(eski.konuId, undefined);
    assert.equal(eski.goruldu, true);
    const islemeId = new mongoose.Types.ObjectId();
    const yeni = new CalismaKarti({ ...temel, konuId: "sub-1",
        kaynaklar: [{ ...temel.kaynaklar[0], kod: "P1", islemeId }] });
    await yeni.validate();
    assert.equal(yeni.kaynaklar[0].kod, "P1");
    assert.equal(String(yeni.kaynaklar[0].islemeId), String(islemeId));
});

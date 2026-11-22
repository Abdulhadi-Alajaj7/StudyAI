import test from "node:test";
import assert from "node:assert/strict";

import {
    DISLAMA_NEDENLERI,
    konuPerformansVerileriniDogrula,
} from "../services/konuPerformansVerisiService.js";

const kullaniciId = "ogrenci-1";
const dersId = "ders-1";

const haritaOlustur = (degisiklikler = {}) => ({
    kullaniciId,
    dersId,
    anaKonular: [
        {
            konuId: "ana-veri",
            baslik: "Veri Yapıları",
            altKonular: [{ konuId: "alt-agac", baslik: "Ağaçlar" }],
        },
    ],
    gecmisKonular: [
        { konuId: "arsiv-liste", baslik: "Bağlı Listeler", altKonular: [] },
    ],
    ...degisiklikler,
});

const soruOlustur = (degisiklikler = {}) => ({
    _id: "soru-1",
    konuId: "alt-agac",
    konuBasligi: "Ağaçlar",
    dogruCevap: "A",
    ogrenciCevabi: "B",
    kaynaklar: [
        { materyalId: "materyal-1", parcaIndeksleri: [0, 2] },
    ],
    ...degisiklikler,
});

const testOlustur = (degisiklikler = {}) => ({
    _id: "test-1",
    kullaniciId,
    dersId,
    durum: "tamamlandi",
    tamamlanmaTarihi: new Date("2026-11-22T10:00:00.000Z"),
    kaynakSurumleri: [{ materyalId: "materyal-1", aktifIslemeId: "isleme-eski" }],
    sorular: [soruOlustur()],
    ...degisiklikler,
});

const denetle = (testler, konuHaritasi = haritaOlustur()) =>
    konuPerformansVerileriniDogrula({ kullaniciId, dersId, konuHaritasi, testler });

test("aktif alt konunun yanlış cevabını, kaynak ve tarih kanıtıyla kabul eder", () => {
    const sonuc = denetle([testOlustur()]);
    assert.deepEqual(sonuc.ozet, {
        incelenenTestSayisi: 1,
        atlananTestSayisi: 0,
        gecerliSoruSayisi: 1,
        dislananSoruSayisi: 0,
    });
    assert.equal(sonuc.gecerliKayitlar[0].konuDurumu, "aktif");
    assert.equal(sonuc.gecerliKayitlar[0].cevapDurumu, "yanlis");
    assert.equal(sonuc.gecerliKayitlar[0].konuId, "alt-agac");
    assert.equal(sonuc.gecerliKayitlar[0].tamamlanmaTarihi, "2026-11-22T10:00:00.000Z");
});

test("ana konu ve arşiv konusu kalıcı kimliğiyle kabul edilir", () => {
    const sonuc = denetle([testOlustur({
        sorular: [
            soruOlustur({ _id: "soru-ana", konuId: "ana-veri", ogrenciCevabi: "A" }),
            soruOlustur({ _id: "soru-arsiv", konuId: "arsiv-liste", ogrenciCevabi: null }),
        ],
    })]);
    assert.deepEqual(sonuc.gecerliKayitlar.map((s) => [s.konuDurumu, s.cevapDurumu]), [
        ["aktif", "dogru"],
        ["arsiv", "bos"],
    ]);
});

test("boş konuId veya sadece başlık / test konuId varsa tahmin yürütmez", () => {
    const sonuc = denetle([testOlustur({
        konuId: "alt-agac",
        sorular: [soruOlustur({ konuId: "", konuBasligi: "Ağaçlar" })],
    })]);
    assert.equal(sonuc.gecerliKayitlar.length, 0);
    assert.equal(sonuc.dislananSorular[0].neden, DISLAMA_NEDENLERI.KONU_ID_EKSIK);
});

test("bilinmeyen ve başka üst konuya taşınmış çakışık kimlikleri reddeder", () => {
    const harita = haritaOlustur({
        anaKonular: [
            { konuId: "ana-a", altKonular: [{ konuId: "tekrar", baslik: "Bir" }] },
            { konuId: "ana-b", altKonular: [{ konuId: "tekrar", baslik: "İki" }] },
        ],
    });
    const sonuc = denetle([testOlustur({
        sorular: [
            soruOlustur({ _id: "soru-bilinmez", konuId: "bilinmeyen" }),
            soruOlustur({ _id: "soru-tekrar", konuId: "tekrar" }),
        ],
    })], harita);
    assert.deepEqual(sonuc.dislananSorular.map((s) => s.neden), [
        DISLAMA_NEDENLERI.KONU_ID_BILINMIYOR,
        DISLAMA_NEDENLERI.KONU_ID_CAKISMASI,
    ]);
});

test("aynı kimliğin arşiv ve aktif haritada aynı bağlamda bulunması geçerlidir", () => {
    const harita = haritaOlustur({
        gecmisKonular: [
            {
                konuId: "ana-veri",
                baslik: "Veri Yapıları (eski ad)",
                altKonular: [{ konuId: "alt-agac", baslik: "Ağaç Veri Yapıları" }],
            },
        ],
    });
    const sonuc = denetle([testOlustur()], harita);
    assert.equal(sonuc.gecerliKayitlar.length, 1);
    assert.equal(sonuc.gecerliKayitlar[0].konuBasligi, "Ağaçlar");
});

test("farklı öğrenci veya dersin testini analiz etmez", () => {
    const sonuc = denetle([
        testOlustur({ kullaniciId: "ogrenci-2" }),
        testOlustur({ dersId: "ders-2" }),
    ]);
    assert.equal(sonuc.gecerliKayitlar.length, 0);
    assert.equal(sonuc.atlananTestler.length, 2);
    assert.ok(sonuc.atlananTestler.every((t) => t.neden === "BASKA_KULLANICI_VEYA_DERS"));
});

test("başka öğrenci ya da derse ait konu haritası için hata verir", () => {
    assert.throws(() => denetle([testOlustur()], haritaOlustur({ kullaniciId: "ogrenci-2" })), TypeError);
    assert.throws(() => denetle([testOlustur()], haritaOlustur({ dersId: "ders-2" })), TypeError);
    assert.throws(() => konuPerformansVerileriniDogrula({ dersId }), TypeError);
});

test("bitmemiş ve yanlış tekrarı testlerini dışarıda tutar, eski normal testi kabul eder", () => {
    const sonuc = denetle([
        testOlustur({ _id: "devam", durum: "devam_ediyor" }),
        testOlustur({ _id: "yanlis", testTuru: "yanlis_tekrari" }),
        testOlustur({ _id: "bilinmeyen", testTuru: "diger" }),
        testOlustur({ _id: "normal" }),
        testOlustur({ _id: "adaptif", testTuru: "adaptif" }),
    ]);
    assert.equal(sonuc.atlananTestler.length, 3);
    assert.equal(sonuc.gecerliKayitlar.length, 2);
});

test("kaynak sürümü eksik veya sorunun kaynağı uyumsuzsa soruyu dışlar", () => {
    const sonuc = denetle([
        testOlustur({ _id: "surum-yok", kaynakSurumleri: [] }),
        testOlustur({
            _id: "kaynak-farkli",
            sorular: [soruOlustur({
                kaynaklar: [{ materyalId: "materyal-baska", parcaIndeksleri: [0] }],
            })],
        }),
        testOlustur({
            _id: "indeks-hatali",
            sorular: [soruOlustur({
                kaynaklar: [{ materyalId: "materyal-1", parcaIndeksleri: [-1] }],
            })],
        }),
    ]);
    assert.deepEqual(sonuc.dislananSorular.map((s) => s.neden), [
        DISLAMA_NEDENLERI.KAYNAK_SURUMU_EKSIK,
        DISLAMA_NEDENLERI.SORU_KAYNAGI_GECERSIZ,
        DISLAMA_NEDENLERI.SORU_KAYNAGI_GECERSIZ,
    ]);
});

test("aynı materyal için çelişen tarihsel kaynak sürümlerini reddeder", () => {
    const sonuc = denetle([testOlustur({
        kaynakSurumleri: [
            { materyalId: "materyal-1", aktifIslemeId: "eski-1" },
            { materyalId: "materyal-1", aktifIslemeId: "eski-2" },
        ],
    })]);
    assert.equal(sonuc.dislananSorular[0].neden, DISLAMA_NEDENLERI.KAYNAK_SURUMU_CAKISMASI);
});

test("güncel kaynağa bakmadan testin tarihsel kaynak anlık görüntüsünü kullanır", () => {
    const sonuc = denetle([testOlustur({
        kaynakSurumleri: [{ materyalId: "materyal-1", aktifIslemeId: "isleme-tarihsel" }],
    })]);
    assert.equal(sonuc.gecerliKayitlar.length, 1);
    assert.deepEqual(sonuc.gecerliKayitlar[0].kaynakMateryalIdleri, ["materyal-1"]);
});

test("bozuk cevap, eksik soru kimliği veya tarih kaydı uygun değildir", () => {
    const sonuc = denetle([
        testOlustur({ _id: "cevap", sorular: [soruOlustur({ ogrenciCevabi: "E" })] }),
        testOlustur({ _id: "kimlik", sorular: [soruOlustur({ _id: null })] }),
        testOlustur({ _id: "tarih", tamamlanmaTarihi: null }),
    ]);
    assert.deepEqual(sonuc.dislananSorular.map((s) => s.neden), [
        DISLAMA_NEDENLERI.CEVAP_GECERSIZ,
        DISLAMA_NEDENLERI.SORU_ID_EKSIK,
        DISLAMA_NEDENLERI.TAMAMLANMA_TARIHI_GECERSIZ,
    ]);
});

test("harita eksikse soru eşleştirmesi uydurulmaz; veri yoksa boş sonuç döner", () => {
    const kayitsiz = denetle([]);
    assert.equal(kayitsiz.ozet.gecerliSoruSayisi, 0);
    const sonuc = denetle([testOlustur()], null);
    assert.equal(sonuc.dislananSorular[0].neden, DISLAMA_NEDENLERI.KONU_HARITASI_YOK);
    assert.equal(sonuc.gecerliKayitlar.length, 0);
});

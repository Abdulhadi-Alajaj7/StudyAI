import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import TestModel from "../models/Test.js";
import {
    cevapGirdisiniDogrula,
    isaretGirdisiniDogrula,
    sonSoruGirdisiniDogrula,
    testOlusturmaGirdisiniDogrula,
    testiSunumaHazirla,
} from "../controllers/testController.js";
import { testPartisiPromptunuOlustur, testSorulariniDogrula } from "../services/geminiService.js";
import {
    cevabiKaydet,
    altKonuKotalariniDagit,
    konuKotalariniDagit,
    sonGoruntulenenSoruyuGuncelle,
    soruIsaretiniGuncelle,
    testOlustur,
    testiBaslat,
    testiGetir,
    testiTamamla,
    testleriListele,
    zorlukDagiliminiOlustur,
} from "../services/testService.js";

const kullaniciId = new mongoose.Types.ObjectId();
const digerKullaniciId = new mongoose.Types.ObjectId();
const dersId = new mongoose.Types.ObjectId();
const materyalId = new mongoose.Types.ObjectId();
const ikinciMateryalId = new mongoose.Types.ObjectId();
const islemeId = new mongoose.Types.ObjectId();
const ikinciIslemeId = new mongoose.Types.ObjectId();

const zincir = (deger) => ({
    select() { return this; },
    sort() { return this; },
    async lean() { return deger; },
});

const konuHaritasi = {
    anaKonular: [{
        konuId: "top-veri-yapilari",
        baslik: "Veri Yapıları",
        aciklama: "Temel veri yapıları",
        kaynakMateryalIds: [materyalId, ikinciMateryalId],
        altKonular: [
            {
                konuId: "sub-yigin",
                baslik: "Yığın",
                aciklama: "LIFO çalışma ilkesi",
                kaynakMateryalIds: [materyalId],
            },
            {
                konuId: "sub-kuyruk",
                baslik: "Kuyruk",
                aciklama: "FIFO çalışma ilkesi",
                kaynakMateryalIds: [ikinciMateryalId],
            },
        ],
    }],
};

const materyaller = [
    {
        _id: materyalId,
        durum: "hazir",
        aktifIslemeId: islemeId,
        orijinalDosyaAdi: "yigin.pdf",
        dosyaAdi: "yigin.pdf",
    },
    {
        _id: ikinciMateryalId,
        durum: "hazir",
        aktifIslemeId: ikinciIslemeId,
        orijinalDosyaAdi: "kuyruk.pdf",
        dosyaAdi: "kuyruk.pdf",
    },
];

const uzunIcerik = (baslik, aciklama) => (
    `${baslik} ${aciklama} `.repeat(45)
);

const metinParcalari = [
    {
        _id: new mongoose.Types.ObjectId(),
        materyalId,
        islemeId,
        parcaIndex: 0,
        icerik: uzunIcerik("Yığın", "LIFO çalışma ilkesi ekleme çıkarma işlemleri"),
    },
    {
        _id: new mongoose.Types.ObjectId(),
        materyalId: ikinciMateryalId,
        islemeId: ikinciIslemeId,
        parcaIndex: 0,
        icerik: uzunIcerik("Kuyruk", "FIFO çalışma ilkesi ekleme çıkarma işlemleri"),
    },
];

const ornekSorular = (adet, zorluk = "orta") => Array.from(
    { length: adet },
    (_, index) => ({
        metin: `Örnek soru ${index + 1}?`,
        secenekler: ["A", "B", "C", "D"].map((anahtar) => ({
            anahtar,
            metin: `${anahtar} seçeneği ${index + 1}`,
        })),
        dogruCevap: "A",
        aciklama: `Örnek açıklama ${index + 1}`,
        zorluk,
        konuId: "",
        konuBasligi: "",
        kaynaklar: [{
            materyalId,
            dosyaAdi: "yigin.pdf",
            parcaIndeksleri: [0],
        }],
        ogrenciCevabi: null,
        isaretli: false,
    })
);

const uretimBagimliliklari = ({
    parcalar = metinParcalari,
    harita = konuHaritasi,
    geminiTestUret,
    testTanilamaYaz,
    korelasyonIdOlustur,
    testUretimIzleyicisiOlustur,
} = {}) => {
    let kaydedilen;
    const bagimliliklar = {
        DersModel: {
            findOne() {
                return zincir({
                    _id: dersId,
                    dersAdi: "Veri Yapıları",
                    aciklama: "",
                    materyallerOnaylandi: true,
                });
            },
        },
        MateryalModel: {
            findOne(filtre) {
                return zincir(materyaller.find(
                    (materyal) => String(materyal._id) === String(filtre._id)
                ) || null);
            },
            find(filtre) {
                const izinli = filtre._id?.$in
                    ? new Set(filtre._id.$in.map(String))
                    : null;
                return zincir(materyaller.filter((materyal) => (
                    !izinli || izinli.has(String(materyal._id))
                )));
            },
        },
        MetinParcasiModel: {
            find(filtre) {
                const surumler = new Set((filtre.$or || []).map(
                    (surum) => `${surum.materyalId}:${surum.islemeId}`
                ));
                return zincir(parcalar.filter((parca) => (
                    surumler.has(`${parca.materyalId}:${parca.islemeId}`)
                )));
            },
        },
        KonuHaritasiModel: {
            findOne() { return zincir(harita); },
        },
        TestModel: {
            async create(veri) {
                kaydedilen = { _id: new mongoose.Types.ObjectId(), ...veri };
                return kaydedilen;
            },
        },
        geminiTestUret: geminiTestUret || (async ({ soruSayisi }) => ({
            sorular: ornekSorular(soruSayisi),
            model: "test-model",
        })),
        // Embedding motorunu taklit eden deterministik sonuçlar:
        // Üretim kodu metinsel eşleştirme yapmaz; yalnızca skor ve parça
        // kimlikleriyle dönen semantik sonuçları tüketir.
        semanticArama: async ({ sorgu, materyalIds }) => {
            const izinli = new Set((materyalIds || []).map(String));
            const tip = /Yığın/u.test(sorgu) ? String(materyalId)
                : /Kuyruk/u.test(sorgu) ? String(ikinciMateryalId) : "";
            return { sonuclar: parcalar
                .filter((parca) => String(parca.materyalId) === tip &&
                    izinli.has(String(parca.materyalId)))
                .map((parca) => ({
                    materyalId: String(parca.materyalId),
                    parcaIndex: parca.parcaIndex,
                    skor: 0.91,
                })) };
        },
        kaynakButcesi: 40_000,
        ...(testTanilamaYaz ? { testTanilamaYaz } : {}),
        ...(korelasyonIdOlustur ? { korelasyonIdOlustur } : {}),
        ...(testUretimIzleyicisiOlustur ? { testUretimIzleyicisiOlustur } : {}),
    };
    return { bagimliliklar, kaydiGetir: () => kaydedilen };
};

test("Test modeli üretim, ilerleme ve sonuç alanlarını gömülü belgelerde tutar", () => {
    for (const alan of [
        "kullaniciId",
        "dersId",
        "kapsamTuru",
        "soruSayisi",
        "zorluk",
        "sorular",
        "durum",
        "sonGoruntulenenSoru",
        "baslamaTarihi",
        "tamamlanmaTarihi",
        "sonuc",
    ]) {
        assert.ok(TestModel.schema.path(alan), `${alan} alanı bulunmalı`);
    }
    assert.ok(TestModel.schema.path("sorular.dogruCevap"));
    assert.ok(TestModel.schema.path("sorular.ogrenciCevabi"));
    assert.ok(TestModel.schema.path("sorular.isaretli"));
    assert.ok(TestModel.schema.path("sorular.kaynaklar"));
});

test("üç test kapsamı ile varsayılan ve geçersiz ayarlar doğrulanır", () => {
    assert.deepEqual(
        testOlusturmaGirdisiniDogrula(String(dersId), { kapsamTuru: "tum_ders" }),
        {
            kapsamTuru: "tum_ders",
            soruSayisi: 10,
            zorluk: "karisik",
            materyalId: null,
            konuId: "",
        }
    );
    assert.equal(testOlusturmaGirdisiniDogrula(String(dersId), {
        kapsamTuru: "materyal",
        materyalId: String(materyalId),
        soruSayisi: 10,
        zorluk: "kolay",
    }).kapsamTuru, "materyal");
    assert.equal(testOlusturmaGirdisiniDogrula(String(dersId), {
        kapsamTuru: "konu",
        konuId: "sub-yigin",
        soruSayisi: 20,
        zorluk: "zor",
    }).kapsamTuru, "konu");

    assert.equal(testOlusturmaGirdisiniDogrula(String(dersId), {
        kapsamTuru: "yanlis",
    }).kod, "GECERSIZ_TEST_KAPSAMI");
    for (const soruSayisi of [5, 7]) {
        assert.equal(testOlusturmaGirdisiniDogrula(String(dersId), {
            kapsamTuru: "tum_ders",
            soruSayisi,
        }).kod, "GECERSIZ_SORU_SAYISI");
    }
    assert.equal(testOlusturmaGirdisiniDogrula(String(dersId), {
        kapsamTuru: "tum_ders",
        zorluk: "imkansiz",
    }).kod, "GECERSIZ_ZORLUK");
});

test("cevap, işaret ve son soru API girdileri katı biçimde doğrulanır", () => {
    assert.deepEqual(cevapGirdisiniDogrula({ cevap: "b" }), { cevap: "B" });
    assert.deepEqual(cevapGirdisiniDogrula({ cevap: null }), { cevap: null });
    assert.equal(cevapGirdisiniDogrula({ cevap: "E" }).kod, "GECERSIZ_CEVAP");
    assert.deepEqual(isaretGirdisiniDogrula({ isaretli: false }), { isaretli: false });
    assert.equal(isaretGirdisiniDogrula({ isaretli: 0 }).kod, "GECERSIZ_ISARET_DURUMU");
    assert.deepEqual(sonSoruGirdisiniDogrula({ soruIndex: 2 }), { soruIndex: 2 });
    assert.equal(sonSoruGirdisiniDogrula({ soruIndex: -1 }).kod, "GECERSIZ_SORU_INDEXI");
});

test("karışık zorluk dağılımı test başlamadan dengeli ve sabit belirlenir", () => {
    assert.deepEqual(zorlukDagiliminiOlustur("karisik", 5), {
        kolay: 2,
        orta: 2,
        zor: 1,
    });
    assert.deepEqual(zorlukDagiliminiOlustur("karisik", 10), {
        kolay: 3,
        orta: 4,
        zor: 3,
    });
    assert.deepEqual(zorlukDagiliminiOlustur("zor", 20), { zor: 20 });
});

test("eski haritada test üretimi hiç embedding çağırmaz", async () => {
    const { bagimliliklar, kaydiGetir } = uretimBagimliliklari();
    let embeddingCagrildi = false;
    bagimliliklar.semanticArama = async () => {
        embeddingCagrildi = true;
        throw new Error("Embedding kullanılmamalı");
    };
    await testOlustur({ kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "sub-yigin", soruSayisi: 10, zorluk: "orta" }, bagimliliklar);
    assert.equal(embeddingCagrildi, false);
    assert.equal(kaydiGetir().soruSayisi, 10);
});

test("eski haritada yalnızca ilgili hazır materyallerin parçaları gönderilir", async () => {
    let girdi;
    const { bagimliliklar } = uretimBagimliliklari({
        geminiTestUret: async (deger) => {
            girdi = deger;
            return { sorular: ornekSorular(10), model: "mock" };
        },
    });
    await testOlustur({ kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "sub-yigin", soruSayisi: 10, zorluk: "orta" }, bagimliliklar);
    assert.equal(girdi.kaynaklar.length, 1);
    assert.equal(String(girdi.kaynaklar[0].materyalId), String(materyalId));
    assert.deepEqual(girdi.kaynaklar[0].konuIds, []);
});

test("yeni haritanın parça-konu atamaları eşleşmeyen metni dışarıda bırakır", async () => {
    const ekParca = { ...metinParcalari[0], parcaIndex: 7,
        icerik: uzunIcerik("Kuyruk", "FIFO çalışma ilkesi") };
    const harita = { ...konuHaritasi, parcaAtamaSurumu: 1,
        parcaKonuAtamalari: [{
            materyalId, islemeId, parcaIndex: 0, konuIds: ["sub-yigin"],
        }] };
    let girdi;
    const { bagimliliklar } = uretimBagimliliklari({
        parcalar: [...metinParcalari, ekParca], harita,
        geminiTestUret: async (deger) => {
            girdi = deger;
            return { sorular: ornekSorular(10), model: "mock" };
        },
    });
    await testOlustur({ kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "sub-yigin", soruSayisi: 10, zorluk: "orta" }, bagimliliklar);
    assert.equal(girdi.kaynaklar.length, 1);
    assert.equal(girdi.kaynaklar[0].parcaIndex, 0);
    assert.deepEqual(girdi.kaynaklar[0].konuIds, ["sub-yigin"]);
});

test("tüm ders, materyal ve konu kapsamlarında ilgili metinler gönderilir", async () => {
    for (const hedef of [
        { kapsamTuru: "tum_ders", beklenen: [materyalId, ikinciMateryalId] },
        { kapsamTuru: "materyal", materyalId, beklenen: [materyalId] },
        { kapsamTuru: "konu", konuId: "sub-yigin", beklenen: [materyalId] },
    ]) {
        let girdi;
        const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({
            geminiTestUret: async (veri) => {
                girdi = veri;
                return { sorular: ornekSorular(10), model: "mock" };
            },
        });
        await testOlustur({
            kullaniciId, dersId, kapsamTuru: hedef.kapsamTuru,
            ...(hedef.materyalId ? { materyalId: hedef.materyalId } : {}),
            ...(hedef.konuId ? { konuId: hedef.konuId } : {}),
            soruSayisi: 10, zorluk: "orta",
        }, bagimliliklar);
        assert.deepEqual(new Set(girdi.kaynaklar.map((kaynak) =>
            String(kaynak.materyalId))),
            new Set(hedef.beklenen.map(String)));
        assert.equal(kaydiGetir().soruSayisi, 10);
        if (hedef.kapsamTuru === "tum_ders") {
            assert.deepEqual(girdi.konuDagilimi.map((konu) => konu.adet), [5, 5]);
        }
    }
});

test("aynı parça iki alt konuya bağlanmışsa tek kaynak ve iki konu etiketi iletilir", async () => {
    const ortakHarita = { parcaAtamaSurumu: 1,
        anaKonular: [{ konuId: "ana-ortak", baslik: "Ortak Konu",
            kaynakMateryalIds: [materyalId], altKonular: [
                { konuId: "alt-1", baslik: "A", kaynakMateryalIds: [materyalId] },
                { konuId: "alt-2", baslik: "B", kaynakMateryalIds: [materyalId] },
            ] }],
        parcaKonuAtamalari: [{ materyalId, islemeId, parcaIndex: 0,
            konuIds: ["alt-1", "alt-2"] }],
    };
    let girdi;
    const { bagimliliklar } = uretimBagimliliklari({
        harita: ortakHarita,
        geminiTestUret: async (deger) => {
            girdi = deger;
            return { sorular: ornekSorular(10), model: "mock" };
        },
    });
    await testOlustur({ kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "ana-ortak", soruSayisi: 10, zorluk: "orta" }, bagimliliklar);
    assert.equal(girdi.kaynaklar.length, 1);
    assert.deepEqual(new Set(girdi.kaynaklar[0].konuIds),
        new Set(["alt-1", "alt-2"]));
});

test("başarısız üretim güvenli korelasyonlu metadata kaydı bırakır ve hatayı değiştirmez", async () => {
    const kayitlar = [];
    const izlemeTamamlamalari = [];
    const asilHata = Object.assign(new Error("Güvenli genel hata mesajı"), {
        status: 502,
        kod: "GEMINI_GECERSIZ_TEST_YANITI",
        tanilama: {
            asama: "TEST_DOGRULAMA",
            dogrulamaAltKodu: "KAYNAK_UYUMU",
            soruIndeksi: 3,
            geminiYanitiBos: false,
            jsonAyristirmaSonucu: "basarili",
            uretilenSoruSayisi: 5,
            destekAdayiSayisi: 8,
            kaynakKelimeSayisi: 4,
            ortakKelimeSayisi: 1,
            gerekenOrtakKelimeSayisi: 2,
            kaynakReferansiSayisi: 2,
            kaynakBasinaEnYuksekOrtakKelimeSayisi: 1,
            farkliFizikselKaynakSayisi: 2,
            ayniFizikselParcaTekrariVarMi: false,
            orijinalSdkHataSinifi: "ApiError",
            orijinalHttpDurumu: 503,
            saglayiciHataKodu: "UNAVAILABLE",
            agHataKodu: null,
            hataKaynagi: "saglayici_http",
            retryUygunMu: true,
            retryEdildiMi: true,
            gercekDenemeSayisi: 2,
            maksimumDenemeSayisi: 2,
            partiSayisi: 1,
            partiIndeksi: 0,
            onarimDenemeSayisi: 2,
            apiCagriSayisi: 3,
            sdkCagriAsamasi: "models.generateContent",
        },
    });
    const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({
        geminiTestUret: async () => { throw asilHata; },
        korelasyonIdOlustur: () => "sabit-korelasyon-id",
        testTanilamaYaz: (kayit) => kayitlar.push(kayit),
        testUretimIzleyicisiOlustur: () => ({
            baslat() {},
            tamamla(ozet) { izlemeTamamlamalari.push(ozet); },
        }),
    });

    await assert.rejects(
        testOlustur({
            kullaniciId,
            dersId,
            kapsamTuru: "tum_ders",
            soruSayisi: 5,
            zorluk: "karisik",
        }, bagimliliklar),
        (hata) => hata === asilHata
    );

    assert.equal(kayitlar.length, 1);
    assert.deepEqual(izlemeTamamlamalari, [{
        sonuc: "basarisiz",
        hataKodu: "GEMINI_GECERSIZ_TEST_YANITI",
        altNeden: "KAYNAK_UYUMU",
    }]);
    assert.equal(kaydiGetir(), undefined, "Başarısız üretim atomik olarak kaydedilmemeli");
    assert.deepEqual(kayitlar[0], {
        korelasyonId: "sabit-korelasyon-id",
        kapsamTuru: "tum_ders",
        istenenSoruSayisi: 5,
        istenenZorluk: "karisik",
        model: "gemini-3.5-flash-lite",
        kaynakMateryalSayisi: 2,
        kaynakMetinParcasiSayisi: 2,
        konuSayisi: 0,
        toplamKaynakKarakterSayisi: metinParcalari.reduce(
            (toplam, parca) => toplam + parca.icerik.trim().length,
            0
        ),
        asama: "TEST_DOGRULAMA",
        dogrulamaAltKodu: "KAYNAK_UYUMU",
        soruIndeksi: 3,
        geminiYanitiBos: false,
        jsonAyristirmaSonucu: "basarili",
        uretilenSoruSayisi: 5,
        destekAdayiSayisi: 8,
        kaynakKelimeSayisi: 4,
        ortakKelimeSayisi: 1,
        gerekenOrtakKelimeSayisi: 2,
        kaynakReferansiSayisi: 2,
        kaynakBasinaEnYuksekOrtakKelimeSayisi: 1,
        farkliFizikselKaynakSayisi: 2,
        ayniFizikselParcaTekrariVarMi: false,
        orijinalSdkHataSinifi: "ApiError",
        orijinalHttpDurumu: 503,
        saglayiciHataKodu: "UNAVAILABLE",
        agHataKodu: null,
        hataKaynagi: "saglayici_http",
        retryUygunMu: true,
        retryEdildiMi: true,
        gercekDenemeSayisi: 2,
        maksimumDenemeSayisi: 2,
        partiSayisi: 1,
        partiIndeksi: 0,
        onarimDenemeSayisi: 2,
        apiCagriSayisi: 3,
        sdkCagriAsamasi: "models.generateContent",
        httpDurumu: 502,
        uygulamaHataKodu: "GEMINI_GECERSIZ_TEST_YANITI",
    });
});

test("başarılı test üretimi ayrıntılı hata tanılaması yazmaz", async () => {
    const kayitlar = [];
    const { bagimliliklar } = uretimBagimliliklari({
        testTanilamaYaz: (kayit) => kayitlar.push(kayit),
    });
    await testOlustur({
        kullaniciId,
        dersId,
        kapsamTuru: "materyal",
        materyalId,
        soruSayisi: 5,
        zorluk: "orta",
    }, bagimliliklar);
    assert.deepEqual(kayitlar, []);
});

test("test üretimi korelasyonlu terminal izleyicisini Gemini akışına bağlar ve başarıyla kapatır", async () => {
    const olaylar = [];
    const izleyici = {
        baslat() { olaylar.push("basladi"); },
        tamamla(ozet) { olaylar.push(ozet); },
    };
    let geminiIzleyicisi;
    const { bagimliliklar } = uretimBagimliliklari({
        korelasyonIdOlustur: () => "terminal-korelasyon-id",
        testUretimIzleyicisiOlustur: (meta) => {
            assert.deepEqual(meta, {
                korelasyonId: "terminal-korelasyon-id",
                kapsamTuru: "materyal",
                soruSayisi: 5,
                zorluk: "orta",
            });
            return izleyici;
        },
        geminiTestUret: async ({ soruSayisi }, ikinciBagimliliklar) => {
            geminiIzleyicisi = ikinciBagimliliklar.uretimIzleyicisi;
            return { sorular: ornekSorular(soruSayisi), model: "test-model" };
        },
    });

    await testOlustur({
        kullaniciId,
        dersId,
        kapsamTuru: "materyal",
        materyalId,
        soruSayisi: 5,
        zorluk: "orta",
    }, bagimliliklar);

    assert.equal(geminiIzleyicisi, izleyici);
    assert.deepEqual(olaylar, ["basladi", { sonuc: "basarili" }]);
});

test("konu kapsamı materyal sınırını embedding olmadan korur", async () => {
    let girdi;
    const { bagimliliklar } = uretimBagimliliklari({
        geminiTestUret: async (deger) => {
            girdi = deger;
            return { sorular: ornekSorular(10), model: "mock" };
        },
    });
    bagimliliklar.semanticArama = async () => {
        throw new Error("Embedding artık kullanılmamalı");
    };
    await testOlustur({ kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "sub-yigin", soruSayisi: 10, zorluk: "orta" }, bagimliliklar);
    assert.deepEqual(new Set(girdi.kaynaklar.map((kaynak) =>
        String(kaynak.materyalId))), new Set([String(materyalId)]));
});

test("kısa kaynak bile Gemini'ye gönderilir, içerik kapasitesi önceden reddedilmez", async () => {
    let geminiCagrildi = false;
    const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({
        parcalar: [{ ...metinParcalari[0], icerik: "Kısa not." }],
        geminiTestUret: async () => {
            geminiCagrildi = true;
            return { sorular: ornekSorular(1), model: "mock",
                kismiUretimNedeni: "KAYNAK_KAPASITESI" };
        },
    });
    await testOlustur({ kullaniciId, dersId, kapsamTuru: "materyal",
        materyalId, soruSayisi: 10, zorluk: "orta" }, bagimliliklar);
    assert.equal(geminiCagrildi, true);
    assert.equal(kaydiGetir().soruSayisi, 1);
});

const dogrulamaKaynaklari = [
    {
        anahtar: "K1",
        materyalId,
        dosyaAdi: "ders.pdf",
        parcaIndex: 0,
        icerik: "Yığın veri yapısı LIFO çalışma prensibi ile ekleme ve çıkarma yapar.",
    },
    {
        anahtar: "K2",
        materyalId,
        dosyaAdi: "ders.pdf",
        parcaIndex: 1,
        icerik: "Kuyruk veri yapısı FIFO sırasıyla elemanları işler.",
    },
];

const hamSoru = ({ metin, dogru, aciklama, kaynak, kanit }) => ({
    metin,
    secenekler: [
        { anahtar: "A", metin: dogru },
        { anahtar: "B", metin: "Rastgele seçim" },
        { anahtar: "C", metin: "Ters sıralama" },
        { anahtar: "D", metin: "Sabit erişim" },
    ],
    dogruCevap: "A",
    aciklama,
    zorluk: "kolay",
    konuId: "",
    kaynakReferanslari: [kaynak],
    kaynakKanitlari: [{ kaynakReferansi: kaynak, alinti: kanit }],
});

test("Gemini test çıktısı yapı, kaynak ve tekrar bakımından doğrulanır", () => {
    const veri = {
        sorular: [
            hamSoru({
                metin: "Yığın veri yapısında hangi çalışma ilkesi uygulanır?",
                dogru: "LIFO çalışma prensibi",
                aciklama: "Yığın ekleme ve çıkarma işlemlerinde LIFO kullanır.",
                kaynak: "K1",
                kanit: "Yığın veri yapısı LIFO çalışma prensibi ile ekleme ve çıkarma yapar.",
            }),
            hamSoru({
                metin: "Kuyruk elemanları hangi sırayla işler?",
                dogru: "FIFO sırası",
                aciklama: "Kuyruk veri yapısı elemanları FIFO sırasıyla işler.",
                kaynak: "K2",
                kanit: "Kuyruk veri yapısı FIFO sırasıyla elemanları işler.",
            }),
        ],
    };
    const dogrulanan = testSorulariniDogrula(veri, {
        soruSayisi: 2,
        zorlukDagilimi: { kolay: 2 },
        kaynaklar: dogrulamaKaynaklari,
    });
    assert.equal(dogrulanan.length, 2);
    assert.deepEqual(dogrulanan[0].kaynaklar[0].parcaIndeksleri, [0]);

    const tekrarli = { sorular: [veri.sorular[0], { ...veri.sorular[0] }] };
    assert.throws(
        () => testSorulariniDogrula(tekrarli, {
            soruSayisi: 2,
            zorlukDagilimi: { kolay: 2 },
            kaynaklar: dogrulamaKaynaklari,
        }),
        (hata) => hata.kod === "GEMINI_GECERSIZ_TEST_YANITI"
    );

    const uydurmaKaynak = {
        sorular: [{ ...veri.sorular[0], kaynakReferanslari: ["K99"] }],
    };
    assert.throws(
        () => testSorulariniDogrula(uydurmaKaynak, {
            soruSayisi: 1,
            zorlukDagilimi: { kolay: 1 },
            kaynaklar: dogrulamaKaynaklari,
        }),
        (hata) => hata.kod === "GEMINI_GECERSIZ_TEST_YANITI"
    );
});

const durumModeliniOlustur = ({ adet = 2 } = {}) => {
    const soruIds = Array.from({ length: adet }, () => new mongoose.Types.ObjectId());
    const testId = new mongoose.Types.ObjectId();
    const baslangic = new Date("2026-01-01T00:00:00.000Z");
    const testBelgesi = {
        _id: testId,
        kullaniciId,
        dersId,
        kapsamTuru: "tum_ders",
        soruSayisi: adet,
        zorluk: "orta",
        durum: "hazirlandi",
        sonGoruntulenenSoru: 0,
        baslamaTarihi: null,
        tamamlanmaTarihi: null,
        updatedAt: baslangic,
        sorular: soruIds.map((soruId, index) => ({
            _id: soruId,
            metin: `Soru ${index + 1}`,
            secenekler: ["A", "B", "C", "D"].map((anahtar) => ({
                anahtar,
                metin: `${anahtar} seçeneği`,
            })),
            dogruCevap: index === 0 ? "A" : "B",
            aciklama: `Açıklama ${index + 1}`,
            ogrenciCevabi: null,
            isaretli: false,
        })),
    };
    const ekTestler = [];
    let sayac = 0;

    const sahip = (belge, filtre) => (
        String(belge._id) === String(filtre._id ?? belge._id) &&
        String(belge.kullaniciId) === String(filtre.kullaniciId ?? belge.kullaniciId) &&
        String(belge.dersId) === String(filtre.dersId ?? belge.dersId)
    );
    const TestModelMock = {
        findOne(filtre) {
            const belge = [testBelgesi, ...ekTestler].find((aday) => sahip(aday, filtre));
            return zincir(belge || null);
        },
        find(filtre) {
            const durumlar = filtre.durum?.$in || [filtre.durum];
            const belgeler = [testBelgesi, ...ekTestler].filter((belge) => (
                String(belge.kullaniciId) === String(filtre.kullaniciId) &&
                String(belge.dersId) === String(filtre.dersId) &&
                durumlar.includes(belge.durum)
            ));
            return zincir(belgeler.map((belge) => ({
                ...belge,
                sorular: belge.sorular.map((soru) => ({
                    ogrenciCevabi: soru.ogrenciCevabi,
                })),
            })));
        },
        findOneAndUpdate(filtre, guncelleme) {
            const belge = [testBelgesi, ...ekTestler].find((aday) => sahip(aday, filtre));
            if (!belge) return zincir(null);
            if (filtre.durum && belge.durum !== filtre.durum) return zincir(null);
            if (
                filtre.updatedAt &&
                new Date(belge.updatedAt).getTime() !== new Date(filtre.updatedAt).getTime()
            ) return zincir(null);
            if (filtre.soruSayisi?.$gt != null && !(belge.soruSayisi > filtre.soruSayisi.$gt)) {
                return zincir(null);
            }
            const soruId = filtre["sorular._id"];
            const soru = soruId
                ? belge.sorular.find((aday) => String(aday._id) === String(soruId))
                : null;
            if (soruId && !soru) return zincir(null);

            for (const [alan, deger] of Object.entries(guncelleme.$set || {})) {
                if (alan === "sorular.$.ogrenciCevabi") soru.ogrenciCevabi = deger;
                else if (alan === "sorular.$.isaretli") soru.isaretli = deger;
                else belge[alan] = deger;
            }
            sayac += 1;
            belge.updatedAt = new Date(baslangic.getTime() + (sayac * 1_000));
            return zincir(belge);
        },
    };
    return {
        testId,
        soruIds,
        testBelgesi,
        ekle(belge) { ekTestler.push(belge); },
        bagimliliklar: {
            TestModel: TestModelMock,
            DersModel: {
                findOne() {
                    return zincir({ _id: dersId, dersAdi: "Ders" });
                },
            },
            simdi: () => new Date("2026-01-02T00:00:00.000Z"),
        },
    };
};

test("cevaplar değiştirilebilir, boş bırakılabilir ve işaret durumu kaldırılabilir", async () => {
    const durum = durumModeliniOlustur();
    const ortak = { kullaniciId, dersId, testId: durum.testId };
    await testiBaslat(ortak, durum.bagimliliklar);
    await cevabiKaydet({ ...ortak, soruId: durum.soruIds[0], cevap: "A" }, durum.bagimliliklar);
    await cevabiKaydet({ ...ortak, soruId: durum.soruIds[0], cevap: "C" }, durum.bagimliliklar);
    assert.equal(durum.testBelgesi.sorular[0].ogrenciCevabi, "C");
    await cevabiKaydet({ ...ortak, soruId: durum.soruIds[0], cevap: null }, durum.bagimliliklar);
    assert.equal(durum.testBelgesi.sorular[0].ogrenciCevabi, null);

    await soruIsaretiniGuncelle({
        ...ortak,
        soruId: durum.soruIds[1],
        isaretli: true,
    }, durum.bagimliliklar);
    assert.equal(durum.testBelgesi.sorular[1].isaretli, true);
    await soruIsaretiniGuncelle({
        ...ortak,
        soruId: durum.soruIds[1],
        isaretli: false,
    }, durum.bagimliliklar);
    assert.equal(durum.testBelgesi.sorular[1].isaretli, false);
});

test("son görüntülenen soru saklanır ve tamamlanmamış teste devam edilir", async () => {
    const durum = durumModeliniOlustur();
    const ortak = { kullaniciId, dersId, testId: durum.testId };
    await testiBaslat(ortak, durum.bagimliliklar);
    await sonGoruntulenenSoruyuGuncelle({ ...ortak, soruIndex: 1 }, durum.bagimliliklar);
    const tekrarAcilan = await testiGetir(ortak, durum.bagimliliklar);
    assert.equal(tekrarAcilan.durum, "devam_ediyor");
    assert.equal(tekrarAcilan.sonGoruntulenenSoru, 1);
    assert.equal(tekrarAcilan.baslamaTarihi.toISOString(), "2026-01-02T00:00:00.000Z");
});

test("aynı derste birden fazla bağımsız devam eden test listelenir", async () => {
    const durum = durumModeliniOlustur();
    durum.testBelgesi.durum = "devam_ediyor";
    durum.testBelgesi.sorular[0].ogrenciCevabi = "A";
    durum.ekle({
        ...durum.testBelgesi,
        _id: new mongoose.Types.ObjectId(),
        sorular: ornekSorular(2),
    });
    const liste = await testleriListele({
        kullaniciId,
        dersId,
        tamamlandi: false,
    }, durum.bagimliliklar);
    assert.equal(liste.length, 2);
    assert.ok(liste.every((kayit) => !("sorular" in kayit)));
    assert.equal(liste[0].cevaplananSoruSayisi, 1);
    assert.equal(liste[1].cevaplananSoruSayisi, 0);
});

test("boş sorularla tamamlama doğru sonucu hesaplar ve tekrar tamamlama idempotenttir", async () => {
    const durum = durumModeliniOlustur({ adet: 5 });
    const ortak = { kullaniciId, dersId, testId: durum.testId };
    await testiBaslat(ortak, durum.bagimliliklar);
    await cevabiKaydet({ ...ortak, soruId: durum.soruIds[0], cevap: "A" }, durum.bagimliliklar);
    await cevabiKaydet({ ...ortak, soruId: durum.soruIds[1], cevap: "C" }, durum.bagimliliklar);

    const ilk = await testiTamamla(ortak, durum.bagimliliklar);
    assert.equal(ilk.zatenTamamlandi, false);
    assert.deepEqual(ilk.test.sonuc, {
        dogruSayisi: 1,
        yanlisSayisi: 1,
        bosSayisi: 3,
        basariOrani: 20,
    });
    const tekrar = await testiTamamla(ortak, durum.bagimliliklar);
    assert.equal(tekrar.zatenTamamlandi, true);
    assert.deepEqual(tekrar.test.sonuc, ilk.test.sonuc);
});

test("tamamlanmış test değiştirilemez ve başka kullanıcının testi görünmez", async () => {
    const durum = durumModeliniOlustur();
    const ortak = { kullaniciId, dersId, testId: durum.testId };
    await testiBaslat(ortak, durum.bagimliliklar);
    await testiTamamla(ortak, durum.bagimliliklar);
    await assert.rejects(
        cevabiKaydet({
            ...ortak,
            soruId: durum.soruIds[0],
            cevap: "A",
        }, durum.bagimliliklar),
        (hata) => hata.status === 409 && hata.kod === "TEST_TAMAMLANDI"
    );
    await assert.rejects(
        testiGetir({ ...ortak, kullaniciId: digerKullaniciId }, durum.bagimliliklar),
        (hata) => hata.status === 404 && hata.kod === "TEST_BULUNAMADI"
    );
});

test("tamamlanmamış test sunumu cevap anahtarını, açıklamayı ve sonucu sızdırmaz", () => {
    const durum = durumModeliniOlustur();
    durum.testBelgesi.sonuc = {
        dogruSayisi: 1,
        yanlisSayisi: 1,
        bosSayisi: 0,
        basariOrani: 50,
    };
    const guvenli = testiSunumaHazirla(durum.testBelgesi);
    assert.equal(guvenli.sonuc, undefined);
    assert.equal(guvenli.sorular[0].dogruCevap, undefined);
    assert.equal(guvenli.sorular[0].aciklama, undefined);
    assert.equal(guvenli.sorular[0].ogrenciCevabi, null);

    const inceleme = testiSunumaHazirla({
        ...durum.testBelgesi,
        durum: "tamamlandi",
    }, { inceleme: true });
    assert.equal(inceleme.sorular[0].dogruCevap, "A");
    assert.equal(inceleme.sorular[0].aciklama, "Açıklama 1");
    assert.equal(inceleme.sonuc.basariOrani, 50);
});

test("denetim: eşzamanlı aynı test oluşturma tek üretim ve kayıt yapar", async () => {
    let cagrilar = 0, baslat, bitir;
    const basladi = new Promise(r => { baslat = r; });
    const bekleme = new Promise(r => { bitir = r; });
    const { bagimliliklar } = uretimBagimliliklari({ geminiTestUret: async () => {
        cagrilar++; baslat(); await bekleme;
        return { sorular: ornekSorular(5), model: "test-model" };
    } });
    const girdi = { kullaniciId, dersId, kapsamTuru: "tum_ders", soruSayisi: 5, zorluk: "orta" };
    const ilk = testOlustur(girdi, bagimliliklar);
    await basladi;
    const ikinci = testOlustur(girdi, bagimliliklar);
    await new Promise(r => setTimeout(r, 0));
    bitir();
    const [a, b] = await Promise.all([ilk, ikinci]);
    assert.equal(cagrilar, 1);
    assert.equal(String(a._id), String(b._id));
});


test("denetim: test üretimi hatasında single-flight kaydı temizlenir ve sonraki istek çalışır", async () => {
    let sayi = 0;
    const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({ geminiTestUret: async () => {
        if (++sayi === 1) throw Object.assign(new Error("Geçici servis hatası"), { status: 503, kod: "GEMINI_GECICI_HATA" });
        return { sorular: ornekSorular(5, "orta") };
    } });
    const girdi = { kullaniciId, dersId, kapsamTuru: "tum_ders", soruSayisi: 5, zorluk: "orta" };
    await assert.rejects(testOlustur(girdi, bagimliliklar), h => h.status === 503);
    assert.equal(kaydiGetir(), undefined);
    await testOlustur(girdi, bagimliliklar);
    assert.equal(sayi, 2);
    assert.equal(kaydiGetir().sorular.length, 5);
});


test("ana konu: 10 soru 5 alt konuya eşit dağıtılır", () => {
    const gruplar = Array.from({ length: 5 }, (_, index) => ({
        konuId: `alt-${index + 1}`,
        baslik: `Alt konu ${index + 1}`,
        parcalar: [{ materyalId, parcaIndex: index, icerik: "a".repeat(1000) }],
    }));
    const dagilim = altKonuKotalariniDagit(gruplar, 10);
    assert.equal(dagilim.length, 5);
    assert.deepEqual(dagilim.map((konu) => konu.adet), [2, 2, 2, 2, 2]);
});

test("ana konu: bölünemeyen sayıdaki ek sorular içerik kapsamı yüksek konulara gider", () => {
    const uzunluklar = [1600, 1300, 1000, 800, 700, 600, 500];
    const gruplar = uzunluklar.map((uzunluk, index) => ({
        konuId: `alt-${index + 1}`,
        baslik: `Alt konu ${index + 1}`,
        parcalar: [{ materyalId, parcaIndex: index, icerik: "a".repeat(uzunluk) }],
    }));
    const dagilim = altKonuKotalariniDagit(gruplar, 10);
    assert.equal(dagilim.reduce((toplam, grup) => toplam + grup.adet, 0), 10);
    assert.ok(dagilim.every((grup) => grup.adet >= 1));
    assert.equal(dagilim[0].adet, 2);
    assert.equal(dagilim[1].adet, 2);
    assert.equal(dagilim[2].adet, 2);
    assert.deepEqual(altKonuKotalariniDagit(gruplar, 6), []);
});

test("ana konu: her alt konu için yeterli kaynak yoksa kota verilmez", () => {
    const dagilim = altKonuKotalariniDagit([
        { konuId: "a", baslik: "A", parcalar: [{ materyalId, parcaIndex: 0, icerik: "a".repeat(900) }] },
        { konuId: "b", baslik: "B", parcalar: [{ materyalId, parcaIndex: 1, icerik: "b".repeat(20) }] },
    ], 10);
    assert.deepEqual(dagilim, []);
});

test("ana konu seçimi yalnızca doğrudan alt konular için Gemini kotası hazırlar", async () => {
    let geminiGirdisi;
    const yeniHarita = { ...konuHaritasi, parcaAtamaSurumu: 1,
        parcaKonuAtamalari: [
            { materyalId, islemeId, parcaIndex: 0, konuIds: ["sub-yigin"] },
            { materyalId: ikinciMateryalId, islemeId: ikinciIslemeId,
                parcaIndex: 0, konuIds: ["sub-kuyruk"] },
        ],
    };
    const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({
        harita: yeniHarita,
        geminiTestUret: async (girdi) => {
            geminiGirdisi = girdi;
            return { sorular: ornekSorular(girdi.soruSayisi), model: "test-model" };
        },
    });
    await testOlustur({
        kullaniciId, dersId,
        kapsamTuru: "konu",
        konuId: "top-veri-yapilari",
        soruSayisi: 10,
        zorluk: "orta",
    }, bagimliliklar);
    assert.deepEqual(
        new Map(geminiGirdisi.konuDagilimi.map((konu) => [konu.konuId, konu.adet])),
        new Map([["sub-yigin", 5], ["sub-kuyruk", 5]])
    );
    assert.deepEqual(
        new Set(geminiGirdisi.kaynaklar.flatMap((kaynak) => kaynak.konuIds)),
        new Set(["sub-yigin", "sub-kuyruk"])
    );
    assert.equal(kaydiGetir().soruSayisi, 10);
    assert.equal(geminiGirdisi.kaynaklar.length, 2);
});

test("ana konu: 12 alt konu için 10 soru isteği Gemini çağrılmadan reddedilir", async () => {
    const harita = { anaKonular: [{
        konuId: "ana-oniki",
        baslik: "On İki Konu",
        kaynakMateryalIds: [materyalId],
        altKonular: Array.from({ length: 12 }, (_, index) => ({
            konuId: `alt-${index + 1}`,
            baslik: `Alt konu ${index + 1}`,
            kaynakMateryalIds: [materyalId],
        })),
    }] };
    let geminiCagrisi = false;
    const { bagimliliklar } = uretimBagimliliklari({
        harita,
        geminiTestUret: async () => {
            geminiCagrisi = true;
            return { sorular: [] };
        },
    });
    await assert.rejects(testOlustur({
        kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "ana-oniki", soruSayisi: 10, zorluk: "orta",
    }, bagimliliklar), (hata) => (
        hata.status === 422 && hata.kod === "ALT_KONU_SORU_SAYISI_YETERSIZ"
    ));
    assert.equal(geminiCagrisi, false);
});

test("ana konu: iki alt konunun ortak fiziksel metni tek kez iletilir, iki bağ korunur", async () => {
    const ortakHarita = { parcaAtamaSurumu: 1,
        parcaKonuAtamalari: [{ materyalId, islemeId, parcaIndex: 0,
            konuIds: ["alt-1", "alt-2"] }],
        anaKonular: [{
        konuId: "ana-ortak",
        baslik: "Ortak Ana Konu",
        aciklama: "İki konu",
        kaynakMateryalIds: [materyalId],
        altKonular: [
            { konuId: "alt-1", baslik: "Yığın", aciklama: "LIFO", kaynakMateryalIds: [materyalId] },
            { konuId: "alt-2", baslik: "Kuyruk", aciklama: "FIFO", kaynakMateryalIds: [materyalId] },
        ],
    }] };
    const parcalar = [{
        _id: new mongoose.Types.ObjectId(),
        materyalId, islemeId, parcaIndex: 0,
        icerik: uzunIcerik("Yığın LIFO ve Kuyruk FIFO", "iki veri yapısının çalışma ilkeleri"),
    }];
    let geminiGirdisi;
    const { bagimliliklar } = uretimBagimliliklari({
        harita: ortakHarita,
        parcalar,
        geminiTestUret: async (girdi) => {
            geminiGirdisi = girdi;
            return { sorular: ornekSorular(girdi.soruSayisi), model: "test-model" };
        },
    });

    await testOlustur({
        kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "ana-ortak", soruSayisi: 10, zorluk: "orta",
    }, bagimliliklar);
    assert.equal(geminiGirdisi.kaynaklar.length, 1);
    assert.deepEqual(
        new Set(geminiGirdisi.kaynaklar[0].konuIds),
        new Set(["alt-1", "alt-2"])
    );
});

test("Gemini soru istemi her alt konunun adını ve açıklamasını içerir", () => {
    const istem = testPartisiPromptunuOlustur({
        dersBilgisi: { dersAdi: "Uygulamalı Veri Bilimi", aciklama: "Veri bilimi dersi" },
        kapsamTuru: "konu", hedefBasligi: "Veri Bilimine Giriş",
        soruPlani: [{ sira: 1, zorluk: "orta", konuId: "sub-yasam-dongusu" }],
        kaynaklar: [{ anahtar: "K1", konuIds: ["sub-yasam-dongusu"],
            icerik: "CRISP-DM veri hazırlama aşaması modellemeden önce gelir." }],
        izinliKonuIds: [{ konuId: "sub-yasam-dongusu",
            baslik: "Veri Bilimi Proje Yaşam Döngüsü ve Süreçler",
            aciklama: "CRISP-DM ve KDD aşamaları", konuTuru: "alt" }],
    });
    assert.match(istem, /"konuBasligi":"Veri Bilimi Proje Yaşam Döngüsü ve Süreçler"/);
    assert.match(istem, /"konuAciklamasi":"CRISP-DM ve KDD aşamaları"/);
    assert.match(istem, /KONU_KIMLIKLERI_VE_KAPSAMLARI/);
    assert.match(istem, /öğrenme hedefini ölçmeyen soruları üretme/);
});

test("konu testi tek istek kullanır, ek embedding veya kalite denetimi çağırmaz", async () => {
    let denetlemeCagrildi = false;
    const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({
        geminiTestUret: async (girdi) => {
            assert.equal(girdi.tekIstekModu, true);
            assert.equal(girdi.soruKonuDogrula, undefined);
            assert.equal(girdi.soruKalitesiDogrula, undefined);
            return {
                sorular: ornekSorular(girdi.soruSayisi).map((soru) => ({
                    ...soru, konuId: "sub-yigin",
                })),
                model: "test-model", apiCagriSayisi: 1,
            };
        },
    });
    bagimliliklar.testKonuDogrulayicisiOlustur = () => {
        denetlemeCagrildi = true;
        throw new Error("Tek istek modunda kullanılmamalı.");
    };
    await testOlustur({
        kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "sub-yigin", soruSayisi: 10, zorluk: "orta",
    }, bagimliliklar);
    assert.equal(denetlemeCagrildi, false);
    assert.equal(kaydiGetir().sorular[0].konuDogrulama, undefined);
    assert.equal(kaydiGetir().sorular[0].kaynaklar[0].parcaSkorlari, undefined);
});

test("ek Gemini kalite isteği artık yapılmaz; tek üretim çağrısı yeterlidir", async () => {
    let denetimCagrilari = 0;
    let uretimCagrilari = 0;
    const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({
        geminiTestUret: async (girdi) => {
            uretimCagrilari += 1;
            assert.equal(girdi.tekIstekModu, true);
            return {
                sorular: ornekSorular(girdi.soruSayisi).map((soru) => ({
                    ...soru, konuId: "sub-yigin",
                })),
                model: "test-model",
            };
        },
    });
    bagimliliklar.geminiKaliteDenetle = async () => {
        denetimCagrilari += 1;
        throw new Error("İkinci Gemini çağrısı yapılmamalı.");
    };
    await testOlustur({
        kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "sub-yigin", soruSayisi: 10, zorluk: "orta",
    }, bagimliliklar);
    assert.equal(uretimCagrilari, 1);
    assert.equal(denetimCagrilari, 0);
    assert.equal(kaydiGetir().sorular[0].kaliteDogrulama, undefined);
});

test("20 soru istendiğinde kısa kaynaklar önceden soru sayısını azaltmaz", async () => {
    const parcalar = metinParcalari.map((parca) => ({
        ...parca, icerik: "Yığın ve kuyruk temel ilkeleri",
    }));
    let geminiGirdisi;
    const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({
        parcalar,
        geminiTestUret: async (girdi) => {
            geminiGirdisi = girdi;
            return { sorular: ornekSorular(20), model: "test-model" };
        },
    });
    await testOlustur({
        kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "top-veri-yapilari", soruSayisi: 20, zorluk: "orta",
    }, bagimliliklar);
    assert.equal(geminiGirdisi.soruSayisi, 20);
    assert.equal(kaydiGetir().soruSayisi, 20);
    assert.equal(kaydiGetir().istenenSoruSayisi, 20);
    assert.equal(kaydiGetir().eksikSoruNedeni, "");
});

test("20 sorudan 17 tanesi tüm kontrolleri geçerse 17 soruluk test kaydedilir", async () => {
    const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({
        geminiTestUret: async ({ soruSayisi, kismiSonucKabul }) => {
            assert.equal(soruSayisi, 20);
            assert.equal(kismiSonucKabul, true);
            return {
                sorular: ornekSorular(17).map((soru, index) => ({
                    ...soru, konuId: index % 2 ? "sub-kuyruk" : "sub-yigin",
                })),
                model: "test-model",
                kismiUretimNedeni: "KALITE_KONTROLU",
            };
        },
    });
    await testOlustur({
        kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "top-veri-yapilari", soruSayisi: 20, zorluk: "orta",
    }, bagimliliklar);
    assert.equal(kaydiGetir().soruSayisi, 17);
    assert.equal(kaydiGetir().istenenSoruSayisi, 20);
    assert.equal(kaydiGetir().eksikSoruNedeni, "KALITE_KONTROLU");
});

test("Gemini kısmi sonuç verirse konu kapsamı eksik olsa da mevcut sorular kaydedilir", async () => {
    const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({
        geminiTestUret: async () => ({
            sorular: ornekSorular(17).map((soru) => ({
                ...soru, konuId: "sub-yigin",
            })),
            model: "test-model", kismiUretimNedeni: "KAYNAK_KAPASITESI",
        }),
    });
    await testOlustur({
        kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "top-veri-yapilari", soruSayisi: 20, zorluk: "orta",
    }, bagimliliklar);
    assert.equal(kaydiGetir().soruSayisi, 17);
    assert.equal(kaydiGetir().eksikSoruNedeni, "KAYNAK_KAPASITESI");
});

test("MongoDB Test modeli 17/20 geçerli soru kaydını kabul eder, tutarsız sayıyı reddeder", () => {
    const veri = {
        kullaniciId, dersId, kapsamTuru: "konu",
        konuId: "top-veri-yapilari",
        konuBasligi: "Veri Yapıları",
        soruSayisi: 17, istenenSoruSayisi: 20,
        eksikSoruNedeni: "KALITE_KONTROLU",
        zorluk: "orta",
        sorular: ornekSorular(17),
        kaynakSurumleri: [{ materyalId, aktifIslemeId: islemeId }],
    };
    const belge = new TestModel(veri);
    assert.equal(belge.validateSync(), undefined);
    assert.equal(belge.sorular.length, 17);
    assert.equal(belge.soruSayisi, 17);
    const hatali = new TestModel({ ...veri, soruSayisi: 20 });
    assert.ok(hatali.validateSync()?.errors?.sorular);
    const limitDisi = new TestModel({ ...veri, soruSayisi: 21 });
    assert.ok(limitDisi.validateSync()?.errors?.soruSayisi);
});

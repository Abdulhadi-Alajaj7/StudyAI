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
import { testSorulariniDogrula } from "../services/geminiService.js";
import {
    cevabiKaydet,
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
    geminiTestUret,
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
            findOne() { return zincir(konuHaritasi); },
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
        semanticArama: async () => ({ sonuclar: [] }),
        kaynakButcesi: 40_000,
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
        soruSayisi: 5,
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
    assert.equal(testOlusturmaGirdisiniDogrula(String(dersId), {
        kapsamTuru: "tum_ders",
        soruSayisi: 7,
    }).kod, "GECERSIZ_SORU_SAYISI");
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

test("tüm ders konu kotası içeriği yetersiz konuya soru zorlamadan dengelenir", () => {
    const dagilim = konuKotalariniDagit([
        { konuId: "a", baslik: "A", parcalar: [{ icerik: "a".repeat(800) }] },
        { konuId: "b", baslik: "B", parcalar: [{ icerik: "b".repeat(500) }] },
        { konuId: "c", baslik: "C", parcalar: [{ icerik: "kısa" }] },
    ], 5);
    assert.equal(dagilim.reduce((toplam, konu) => toplam + konu.adet, 0), 5);
    assert.deepEqual(new Set(dagilim.map((konu) => konu.konuId)), new Set(["a", "b"]));
    assert.ok(dagilim.every((konu) => konu.adet >= 1));
});

test("tum_ders, materyal ve konu üretimleri yalnızca doğrulanmış kapsamdaki kaynakları kullanır", async () => {
    for (const girdi of [
        { kapsamTuru: "tum_ders" },
        { kapsamTuru: "materyal", materyalId },
        { kapsamTuru: "konu", konuId: "sub-yigin" },
    ]) {
        let geminiGirdisi;
        const { bagimliliklar, kaydiGetir } = uretimBagimliliklari({
            geminiTestUret: async (veri) => {
                geminiGirdisi = veri;
                return { sorular: ornekSorular(5), model: "test-model" };
            },
        });
        await testOlustur({
            kullaniciId,
            dersId,
            soruSayisi: 5,
            zorluk: "orta",
            ...girdi,
        }, bagimliliklar);

        const kaynakMateryalleri = new Set(
            geminiGirdisi.kaynaklar.map((kaynak) => String(kaynak.materyalId))
        );
        if (girdi.kapsamTuru === "tum_ders") {
            assert.deepEqual(kaynakMateryalleri, new Set([
                String(materyalId),
                String(ikinciMateryalId),
            ]));
            assert.equal(
                geminiGirdisi.konuDagilimi.reduce((toplam, konu) => toplam + konu.adet, 0),
                5
            );
        } else {
            assert.deepEqual(kaynakMateryalleri, new Set([String(materyalId)]));
        }
        assert.equal(kaydiGetir().kapsamTuru, girdi.kapsamTuru);
        assert.equal(kaydiGetir().sorular.length, 5);
    }
});

test("konu kapsamı mevcut semantik aramayı konu materyalleriyle sınırlar", async () => {
    let aramaGirdisi;
    const { bagimliliklar } = uretimBagimliliklari();
    bagimliliklar.semanticArama = async (girdi) => {
        aramaGirdisi = girdi;
        return {
            sonuclar: [{
                materyalId: String(materyalId),
                parcaIndex: 0,
                icerik: metinParcalari[0].icerik,
            }],
        };
    };

    await testOlustur({
        kullaniciId,
        dersId,
        kapsamTuru: "konu",
        konuId: "sub-yigin",
        soruSayisi: 5,
        zorluk: "orta",
    }, bagimliliklar);

    assert.match(aramaGirdisi.sorgu, /Yığın/);
    assert.deepEqual(aramaGirdisi.materyalIds.map(String), [String(materyalId)]);
    assert.equal(aramaGirdisi.limit, 10);
});

test("yetersiz işlenmiş içerikte Gemini çağrılmadan anlaşılır hata üretilir", async () => {
    let geminiCagrildi = false;
    const { bagimliliklar } = uretimBagimliliklari({
        parcalar: [{
            _id: new mongoose.Types.ObjectId(),
            materyalId,
            islemeId,
            parcaIndex: 0,
            icerik: "Çok kısa içerik.",
        }],
        geminiTestUret: async () => {
            geminiCagrildi = true;
            return { sorular: [] };
        },
    });
    await assert.rejects(
        testOlustur({
            kullaniciId,
            dersId,
            kapsamTuru: "materyal",
            materyalId,
            soruSayisi: 5,
            zorluk: "kolay",
        }, bagimliliklar),
        (hata) => hata.status === 422 && hata.kod === "YETERSIZ_TEST_ICERIGI"
    );
    assert.equal(geminiCagrildi, false);
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

const hamSoru = ({ metin, dogru, aciklama, kaynak }) => ({
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
});

test("Gemini test çıktısı yapı, kaynak ve tekrar bakımından doğrulanır", () => {
    const veri = {
        sorular: [
            hamSoru({
                metin: "Yığın veri yapısında hangi çalışma ilkesi uygulanır?",
                dogru: "LIFO çalışma prensibi",
                aciklama: "Yığın ekleme ve çıkarma işlemlerinde LIFO kullanır.",
                kaynak: "K1",
            }),
            hamSoru({
                metin: "Kuyruk elemanları hangi sırayla işler?",
                dogru: "FIFO sırası",
                aciklama: "Kuyruk veri yapısı elemanları FIFO sırasıyla işler.",
                kaynak: "K2",
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

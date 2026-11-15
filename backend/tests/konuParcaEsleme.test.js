import test from "node:test";
import assert from "node:assert/strict";
import {
    konuParcaBaglantilariniHesapla, konuParcaSurumImzasi,
    konuKaynakGruplariniOlustur,
} from "../services/konuParcaPlanlama.mjs";
import {
    konuParcaEslemesiniHazirla, tekKonununKaynaklariniGetir,
} from "../services/konuParcaEslemeService.js";
import { haritaKartlariniDogrula } from "../services/haritaTabanliKartPlanlama.mjs";

const konular = [
    { konuId: "hist", baslik: "Histogram ve Veri Görselleştirme", aciklama: "Histogram dağılımı gösterir" },
    { konuId: "bayes", baslik: "Naive Bayes", aciklama: "Koşullu olasılık ve Bayes teoremi" },
];
const parcalar = [
    { _id: "p1", materyalId: "mat", islemeId: "v1", parcaIndex: 0,
        icerik: "Histogram çizimi ile veri dağılımı görselleştirilir.",
        embeddingDurumu: "hazir", embeddingModel: "model", embeddingBoyutu: 2, embedding: [1, 0] },
    { _id: "p2", materyalId: "mat", islemeId: "v1", parcaIndex: 1,
        icerik: "Frekansları gösteren grafik örneği.",
        embeddingDurumu: "hazir", embeddingModel: "model", embeddingBoyutu: 2, embedding: [0.9, 0.1] },
    { _id: "p3", materyalId: "mat", islemeId: "v1", parcaIndex: 2,
        icerik: "Naive Bayes sınıf koşullu olasılıkları kullanır.",
        embeddingDurumu: "hazir", embeddingModel: "model", embeddingBoyutu: 2, embedding: [0, 1] },
    { _id: "p4", materyalId: "mat", islemeId: "v1", parcaIndex: 3,
        icerik: "Diğer dersin bu konularla ilgisiz metin içeriği.",
        embeddingDurumu: "hazir", embeddingModel: "model", embeddingBoyutu: 2, embedding: [-1, -1] },
];

test("Topic vector + chunk matching kaynakları doğru konulara bağlar, ilişkisiz parçayı kaybetmez", () => {
    const esleme = konuParcaBaglantilariniHesapla({
        konular, parcalar, sorguVektorleri: [[1, 0], [0, 1]],
        model: "model", boyut: 2, maksParca: 3, maksIlkSecim: 2,
    });
    assert.ok(esleme.konular[0].kaynaklar.some((k) => k.parcaId === "p1"));
    assert.ok(esleme.konular[1].kaynaklar.some((k) => k.parcaId === "p3"));
    assert.ok(esleme.eslesmeyenParcaIds.includes("p4"));
    assert.equal(esleme.toplamParcaSayisi, 4);
    assert.equal(esleme.eslesenParcaSayisi + esleme.eslesmeyenParcaIds.length, 4);
    assert.ok(esleme.konular.every((k) => k.kaynaklar.length <= 3));
    assert.equal(esleme.embeddingiEksikParcaIds.length, 0);
});

test("Tek kaynak iki konuyu destekleyebilir; konuya özel kod yanlış konu kartında kullanılamaz", () => {
    const ortak = { _id: "ortak", materyalId: "mat", islemeId: "v1", parcaIndex: 1,
        icerik: "Histogram ve Bayes teoremi iki ayrı yöntemdir.",
        embeddingDurumu: "hazir", embeddingModel: "model", embeddingBoyutu: 2,
        embedding: [0.707, 0.707] };
    const esleme = konuParcaBaglantilariniHesapla({
        konular, parcalar: [ortak], sorguVektorleri: [[1, 0], [0, 1]],
        model: "model", boyut: 2,
    });
    assert.deepEqual(esleme.eslesmeyenParcaIds, []);
    assert.equal(esleme.konular[0].kaynaklar[0].parcaId, "ortak");
    assert.equal(esleme.konular[1].kaynaklar[0].parcaId, "ortak");
    const gruplar = konuKaynakGruplariniOlustur({
        esleme, agac: [], parcalar: [ortak],
        materyaller: [{ _id: "mat", orijinalDosyaAdi: "ders.pdf" }],
    });
    assert.equal(gruplar.length, 1);
    assert.equal(gruplar[0].kaynaklar.length, 2);
    const kaynakHist = gruplar[0].kaynaklar.find((k) => k.konuId === "hist");
    const kaynakBayes = gruplar[0].kaynaklar.find((k) => k.konuId === "bayes");
    assert.notEqual(kaynakHist.kod, kaynakBayes.kod);
    const kontrol = haritaKartlariniDogrula({
        hamKartlar: [
            { konuId: "hist", soru: "Histogram hangi amaçla kullanılır?",
                cevap: "Dağılım görselleştirmek için.", kaynakKodlari: [kaynakBayes.kod] },
            { konuId: "hist", soru: "Histogram hangi amaçla kullanılır?",
                cevap: "Dağılım görselleştirmek için.", kaynakKodlari: [kaynakHist.kod] },
        ],
        konular, kaynaklar: gruplar[0].kaynaklar, ayrinti: true,
    });
    assert.equal(kontrol.gecersiz, 1);
    assert.equal(kontrol.kartlar.length, 1);
});

test("Embedding hazır değilse kelime eşleşmesi uygulanır ve eksik embedding kayıt altındadır", () => {
    const eksik = { _id: "eksik", materyalId: "mat", islemeId: "v1",
        parcaIndex: 0, icerik: "Histogram kullanarak görselleştirme yapılır.",
        embeddingDurumu: "hata", embedding: undefined };
    const sonuc = konuParcaBaglantilariniHesapla({
        konular, parcalar: [eksik], sorguVektorleri: [[1, 0], [0, 1]],
        model: "model", boyut: 2,
    });
    assert.ok(sonuc.konular[0].kaynaklar.some((k) => k.parcaId === "eksik"));
    assert.deepEqual(sonuc.embeddingiEksikParcaIds, ["eksik"]);
});

test("Sürüm imzası konu, model veya aktif kaynak değişince güncellenir", () => {
    const input = { agac: konular, materyaller: [{ _id: "mat", aktifIslemeId: "v1" }],
        model: "model", boyut: 768 };
    const a = konuParcaSurumImzasi(input);
    assert.notEqual(a, konuParcaSurumImzasi({ ...input, model: "model2" }));
    assert.notEqual(a, konuParcaSurumImzasi({ ...input,
        materyaller: [{ _id: "mat", aktifIslemeId: "v2" }] }));
    assert.notEqual(a, konuParcaSurumImzasi({ ...input,
        agac: [{ ...konular[0], baslik: "Değişik konu" }] }));
});

const q = (data) => ({
    select() { return this; }, sort() { return this; },
    lean() { return Promise.resolve(typeof data === "function" ? data() : data); },
});
const testKaynak = () => {
    let cache = null, embeddingCagrisi = 0;
    const harita = { anaKonular: [{ konuId: "ana", baslik: "Veri Bilimi",
        altKonular: [
            { konuId: "hist", baslik: "Histogram ve Veri Görselleştirme", aciklama: "Histogram dağılımı gösterir" },
            { konuId: "bayes", baslik: "Naive Bayes", aciklama: "Koşullu olasılık ve Bayes teoremi" },
        ] }] };
    const materyaller = [{ _id: "mat", aktifIslemeId: "v1", dosyaAdi: "Hafta.pdf" }];
    const deps = {
        DersModel: { findOne: () => q({ _id: "ders", materyallerOnaylandi: true }) },
        HaritaModel: { findOne: () => q(harita) },
        MateryalModel: { find: () => q(materyaller) },
        ParcaModel: { find: () => q(parcalar.map((p) => ({
            ...p, icerikHash: "hash-" + p._id, embeddingGirdiHash: "ver-" + p._id,
        }))) },
        EslemeModel: {
            findOne: (f) => q(cache?.surumImzasi === f.surumImzasi ? cache : null),
            findOneAndUpdate: (_f, update) => q(() => {
                cache = update.$set;
                return cache;
            }),
        },
        ayarlar: { model: "model", boyut: 2 },
        async embeddingUret() { embeddingCagrisi++; return [[1, 0], [0, 1]]; },
    };
    return { deps, getCagrilar: () => embeddingCagrisi,
        getCache: () => cache, materyaller };
};

test("Konu-parça eşleşmesi MongoDB kaydından tekrar kullanılır, konu kaynağı Quiz için okunabilir", async () => {
    const fixture = testKaynak();
    const args = { kullaniciId: "user", dersId: "ders" };
    const ilk = await konuParcaEslemesiniHazirla(args, fixture.deps);
    assert.equal(ilk.onbellekten, false);
    assert.equal(fixture.getCagrilar(), 1);
    const ikinci = await konuParcaEslemesiniHazirla(args, fixture.deps);
    assert.equal(ikinci.onbellekten, true);
    assert.equal(fixture.getCagrilar(), 1);
    const tek = await tekKonununKaynaklariniGetir({ ...args, konuId: "hist" }, fixture.deps);
    assert.ok(tek.kaynaklar.length > 0);
    assert.equal(fixture.getCagrilar(), 1);
    assert.ok(fixture.getCache().eslesmeyenParcaIds.includes("p4"));
});

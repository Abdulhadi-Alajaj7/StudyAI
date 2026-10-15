/**
 * incrementalKonuHaritasi.test.js
 *
 * Incremental Topic Map mimarisinin uçtan uca mock testleri.
 * Gerçek MongoDB veya Gemini API çağrısı yapılmaz.
 *
 * Çalıştırmak için:
 *   node --experimental-test-module-mocks --test tests/incrementalKonuHaritasi.test.js
 *
 * Test senaryoları:
 *  1. İlk materyal ekleme
 *  2. İkinci materyal eklenince eski konuId'lerin korunması
 *  3. İki materyalde ortak konu → kaynakMateryalIds her ikisini içermeli
 *  4. Ortak konunun kaynaklarından birinin silinmesi → konu aktif kalmali
 *  5. Son kaynağın silinmesi → konu arşivlenmeli
 *  6. Yeniden yükleme → arşivdeki eski konuId geri gelmeli
 *  7. Benzer başlıklı farklı konular yanlış birleştirilmemeli
 *  8. Farklı dersler arasında izolasyon
 *  9. Silme idempotency (tekrar çağrıldığında güvenli)
 * 10. Gemini hata senaryosu → mevcut harita bozulmamalı
 * 11. Eski kayıtlarla uyumluluk (kaynakMateryalIds eksik kayıt)
 * 12. Ana konu ve alt konu bütünlüğü — konuId'ler benzersiz
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// ─── Shared mock state ──────────────────────────────────────────────────────

const dersId1     = new mongoose.Types.ObjectId();
const dersId2     = new mongoose.Types.ObjectId(); // Farklı ders
const kullaniciId = new mongoose.Types.ObjectId();
const mat1Id      = new mongoose.Types.ObjectId();
const mat2Id      = new mongoose.Types.ObjectId();
const mat3Id      = new mongoose.Types.ObjectId();
const isleme1     = new mongoose.Types.ObjectId();
const isleme2     = new mongoose.Types.ObjectId();
const isleme3     = new mongoose.Types.ObjectId();

// Mutable mock state — her testte reset edilir
let mockHaritaDurum = "yok";
let mockAnaKonular = [];
let mockGecmisKonular = [];
let mockKaynakMateryaller = [];
let mockMateryalBulundu = true;
let mockMetinBlogu = "Veri yapıları ve algoritmalar hakkında içerik.";
let mockGeminiCikti = null;
let mockGeminiHatasi = null;
let mockGeminiBekleme = null;
let mockAktifIslemeId = isleme1;
let mockFindOneCallCount = 0;
let mockFindOneAndUpdateCallCount = 0;
let mockCreateCallCount = 0;
let sonFindOneAndUpdateSet = null;

function haritaObjesi(dId = dersId1) {
    if (mockHaritaDurum === "yok" && mockGecmisKonular.length === 0 && mockAnaKonular.length === 0) {
        return null;
    }
    return {
        _id: new mongoose.Types.ObjectId(),
        dersId: dId,
        kullaniciId,
        durum: mockHaritaDurum,
        anaKonular: mockAnaKonular,
        gecmisKonular: mockGecmisKonular,
        kaynakMateryaller: mockKaynakMateryaller,
        aktifIslemToken: null,
        toObject() { return this; }
    };
}

function sifirla(overrides = {}) {
    mockHaritaDurum                 = overrides.haritaDurum ?? "yok";
    mockAnaKonular                  = overrides.anaKonular ?? [];
    mockGecmisKonular               = overrides.gecmisKonular ?? [];
    mockKaynakMateryaller           = overrides.kaynakMateryaller ?? [];
    mockMateryalBulundu             = overrides.materyalBulundu ?? true;
    mockMetinBlogu                  = overrides.metinBlogu ?? "Test ders içeriği";
    mockGeminiCikti                 = overrides.geminiCikti ?? null;
    mockGeminiHatasi                = overrides.geminiHatasi ?? null;
    mockFindOneCallCount            = 0;
    mockFindOneAndUpdateCallCount   = 0;
    mockCreateCallCount             = 0;
    sonFindOneAndUpdateSet          = null;
    mockAktifIslemeId = overrides.aktifIslemeId ?? isleme1;
    mockGeminiBekleme = null;
}

// ─── Mock: Materyal ──────────────────────────────────────────────────────────

mock.module("../models/Materyal.js", {
    defaultExport: {


        findOne: (sorgu) => {
            mockFindOneCallCount++;

            const matId = sorgu?._id || mat1Id;

            const resultObj = mockMateryalBulundu ? {
                _id: matId,
                dersId: dersId1,
                kullaniciId,
                dosyaAdi: "test.pdf",
                orijinalDosyaAdi: "test.pdf",
                aktifIslemeId: mockAktifIslemeId,
                durum: "hazir"
            } : null;

            let sonuc = resultObj;

            if (sonuc && sorgu?.durum && sorgu.durum !== sonuc.durum) {
                sonuc = null;
            }


            if (sonuc && sorgu?.aktifIslemeId !== undefined) {
                const filtre = sorgu.aktifIslemeId;

                if (
                    filtre &&
                    typeof filtre === "object" &&
                    "$ne" in filtre
                ) {
                    if (String(sonuc.aktifIslemeId) === String(filtre.$ne)) {
                        sonuc = null;
                    }
                } else if (
                    String(filtre) !== String(sonuc.aktifIslemeId)
                ) {
                    sonuc = null;
                }
            }


            return {
                select: () => Promise.resolve(sonuc),
                then: (resolve, reject) =>
                    Promise.resolve(sonuc).then(resolve, reject)
            };
        },
        find: () => ({ select: async () => [] }),
        countDocuments: async () => 1
    }
});

// ─── Mock: MetinParcasi ──────────────────────────────────────────────────────

mock.module("../models/MetinParcasi.js", {
    defaultExport: {
        find: () => ({
            sort: async () => [{
                materyalId: mat1Id,
                islemeId: isleme1,
                icerik: mockMetinBlogu,
                parcaIndex: 0
            }]
        })
    }
});

// ─── Mock: KonuHaritasi ──────────────────────────────────────────────────────

mock.module("../models/KonuHaritasi.js", {
    defaultExport: {
        findOne: async () => {
            mockFindOneCallCount++;
            return haritaObjesi();
        },
        findOneAndUpdate: async (_filtre, guncelleme) => {
            mockFindOneAndUpdateCallCount++;
            sonFindOneAndUpdateSet = guncelleme.$set;
            if (guncelleme.$set?.durum) mockHaritaDurum = guncelleme.$set.durum;
            if (guncelleme.$set?.anaKonular !== undefined) mockAnaKonular = guncelleme.$set.anaKonular;
            if (guncelleme.$set?.gecmisKonular !== undefined) mockGecmisKonular = guncelleme.$set.gecmisKonular;
            if (guncelleme.$set?.kaynakMateryaller !== undefined) mockKaynakMateryaller = guncelleme.$set.kaynakMateryaller;
            return { ...haritaObjesi(), ...guncelleme.$set };
        },
        create: async (doc) => {
            mockCreateCallCount++;
            mockHaritaDurum = doc.durum || "hazir";
            mockAnaKonular = doc.anaKonular || [];
            mockGecmisKonular = doc.gecmisKonular || [];
            mockKaynakMateryaller = doc.kaynakMateryaller || [];
            return { _id: new mongoose.Types.ObjectId(), ...doc };
        }
    }
});

// ─── Mock: Ders ─────────────────────────────────────────────────────────────

mock.module("../models/Ders.js", {
    defaultExport: {
        findById: async () => ({
            _id: dersId1,
            dersAdi: "Veri Yapıları",
            aciklama: "Test dersi",
            donem: "Güz 2024"
        })
    }
});

// ─── Mock: GeminiService ─────────────────────────────────────────────────────

mock.module("../services/geminiService.js", {
    namedExports: {
        VARSAYILAN_GEMINI_MODELI: "test-model",
        geminiIleKonuHaritasiUret: async () => {
            if (mockGeminiBekleme) {
                await mockGeminiBekleme();
            }
            if (mockGeminiHatasi) throw mockGeminiHatasi;
            if (mockGeminiCikti) return mockGeminiCikti;
            return [
                {
                    baslik: "Temel Veri Yapıları",
                    aciklama: "Giriş",
                    sira: 1,
                    altKonular: [
                        { baslik: "Diziler", aciklama: "Dizi yapısı", sira: 1 },
                        { baslik: "Bağlı Listeler", aciklama: "Liste yapısı", sira: 2 }
                    ]
                }
            ];
        },
        geminiIleKonulariBirlestir: async () => {
            throw new Error("Incremental sistemde birleştirme çağrılmamalı");
        }
    }
});

// ─── Servis import ───────────────────────────────────────────────────────────

const {
    materyalEklendigindeIncrementalGuncelle,
    materyalSilindigindeGuncelle,
    deterministikKonuIdUret
} = await import("../services/konuHaritasiService.js");

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1 — İlk materyal ekleme: harita oluşturulur, kaynakMateryalIds dolu
// ═══════════════════════════════════════════════════════════════════════════════
test("T1: İlk materyal eklenince konu haritası oluşturulur ve kaynakMateryalIds dolar", async () => {
    sifirla({ haritaDurum: "yok" });

    const sonuc = await materyalEklendigindeIncrementalGuncelle(mat1Id, dersId1, kullaniciId);

    assert.ok(sonuc, "Sonuç null olmamalı");
    assert.equal(mockHaritaDurum, "hazir");
    assert.ok(mockAnaKonular.length > 0, "En az bir ana konu oluşturulmalı");

    // Her alt konuda kaynakMateryalIds dolu olmalı
    for (const ana of mockAnaKonular) {
        assert.ok(Array.isArray(ana.kaynakMateryalIds), "Ana konuda kaynakMateryalIds olmalı");
        for (const alt of ana.altKonular || []) {
            assert.ok(Array.isArray(alt.kaynakMateryalIds), "Alt konuda kaynakMateryalIds olmalı");
            assert.ok(alt.kaynakMateryalIds.length > 0, "Alt konunun kaynağı dolu olmalı");
        }
    }
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2 — İkinci materyal eklenince eski konuId'ler korunur
// ═══════════════════════════════════════════════════════════════════════════════
test("T2: İkinci materyal eklenince eski konuId'ler değişmez", async () => {
    // İlk harita oluştur
    sifirla({ haritaDurum: "yok" });
    mockGeminiCikti = [
        {
            baslik: "Diziler",
            aciklama: "Dizi yapıları",
            sira: 1,
            altKonular: [
                { baslik: "Tek Boyutlu Diziler", aciklama: "", sira: 1 }
            ]
        }
    ];
    await materyalEklendigindeIncrementalGuncelle(mat1Id, dersId1, kullaniciId);

    const eskiAnaKonuId = mockAnaKonular[0].konuId;
    const eskiAltKonuId = mockAnaKonular[0].altKonular[0].konuId;

    assert.ok(eskiAnaKonuId, "İlk ana konu ID'si oluşturulmalı");
    assert.ok(eskiAltKonuId, "İlk alt konu ID'si oluşturulmalı");

    // İkinci materyal: aynı konuları biraz farklı ifadeyle dönüyor
    mockGeminiCikti = [
        {
            baslik: "Diziler",
            aciklama: "Dizi yapıları (güncellenmiş)",
            sira: 1,
            altKonular: [
                { baslik: "Tek boyutlu diziler", aciklama: "", sira: 1 }, // küçük harf
                { baslik: "Çok Boyutlu Diziler", aciklama: "", sira: 2 } // yeni
            ]
        }
    ];

    await materyalEklendigindeIncrementalGuncelle(mat2Id, dersId1, kullaniciId);

    assert.equal(mockHaritaDurum, "hazir");
    assert.equal(mockAnaKonular[0].konuId, eskiAnaKonuId, "Ana konuId değişmemeli");

    // Eski alt konu hala mevcut ve ID'si korunmuş olmalı
    const eskiAltBulundu = mockAnaKonular[0].altKonular.find(a => a.konuId === eskiAltKonuId);
    assert.ok(eskiAltBulundu, "Eski alt konu kaybedilmemeli");
    assert.equal(eskiAltBulundu.baslik, "Tek Boyutlu Diziler", "Eski orijinal başlık korunmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3 — İki materyalde ortak konu: kaynakMateryalIds her ikisini içermeli
// ═══════════════════════════════════════════════════════════════════════════════
test("T3: Ortak konu iki materyale sahipse her ikisi kaynakMateryalIds'de görünür", async () => {
    // İlk materyal
    sifirla({ haritaDurum: "yok" });
    mockGeminiCikti = [{
        baslik: "Ortak Konu",
        aciklama: "",
        sira: 1,
        altKonular: [{ baslik: "Ortak Alt", aciklama: "", sira: 1 }]
    }];
    await materyalEklendigindeIncrementalGuncelle(mat1Id, dersId1, kullaniciId);

    // İkinci materyal: aynı konuyu getiriyor
    mockGeminiCikti = [{
        baslik: "Ortak Konu",
        aciklama: "Genişletilmiş açıklama",
        sira: 1,
        altKonular: [{ baslik: "Ortak Alt", aciklama: "", sira: 1 }]
    }];
    await materyalEklendigindeIncrementalGuncelle(mat2Id, dersId1, kullaniciId);

    assert.equal(mockAnaKonular.length, 1, "Tek ana konu olmalı (duplikasyon olmamalı)");
    const altKonu = mockAnaKonular[0].altKonular[0];
    assert.ok(altKonu.kaynakMateryalIds.length >= 2, "Ortak alt konu iki materyali göstermeli");
    const matIdStrler = altKonu.kaynakMateryalIds.map(id => id.toString());
    assert.ok(matIdStrler.includes(mat1Id.toString()), "Mat1 kaynakta olmalı");
    assert.ok(matIdStrler.includes(mat2Id.toString()), "Mat2 kaynakta olmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4 — Ortak konunun kaynaklarından biri silinince konu aktif kalır
// ═══════════════════════════════════════════════════════════════════════════════
test("T4: İki kaynaklı konunun bir kaynağı silinince konu aktif kalır", async () => {
    const ortakAltKonuId = "sub-ortak-abc";
    const ortakAnaKonuId = "top-ortak-xyz";

    sifirla({
        haritaDurum: "hazir",
        anaKonular: [{
            konuId: ortakAnaKonuId,
            baslik: "Ortak Ana Konu",
            aciklama: "",
            sira: 1,
            kaynakMateryalIds: [mat1Id, mat2Id],
            altKonular: [{
                konuId: ortakAltKonuId,
                baslik: "Ortak Alt Konu",
                aciklama: "",
                sira: 1,
                kaynakMateryalIds: [mat1Id, mat2Id]
            }]
        }],
        kaynakMateryaller: [
            { materyalId: mat1Id, aktifIslemeId: isleme1 },
            { materyalId: mat2Id, aktifIslemeId: isleme2 }
        ]
    });

    // mat1 silinir
    await materyalSilindigindeGuncelle(mat1Id, dersId1, kullaniciId);

    assert.equal(mockHaritaDurum, "hazir", "Hala mat2 var, harita hazır kalmalı");
    assert.equal(mockAnaKonular.length, 1, "Ana konu aktif kalmalı");
    assert.equal(mockAnaKonular[0].konuId, ortakAnaKonuId, "Ana konuId değişmemeli");

    const aktifAlt = mockAnaKonular[0].altKonular.find(a => a.konuId === ortakAltKonuId);
    assert.ok(aktifAlt, "Ortak alt konu hala aktif olmalı");

    const altMatIds = aktifAlt.kaynakMateryalIds.map(id => id.toString());
    assert.ok(!altMatIds.includes(mat1Id.toString()), "Mat1 artık kaynak olmamalı");
    assert.ok(altMatIds.includes(mat2Id.toString()), "Mat2 hala kaynak olmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5 — Son kaynağın silinmesi → konu arşivlenmeli
// ═══════════════════════════════════════════════════════════════════════════════
test("T5: Son kaynağın silinmesiyle konu gecmisKonular'a arşivlenir, anaKonular boşalır", async () => {
    const altId = "sub-son-kaynak";
    const anaId = "top-son-kaynak";

    sifirla({
        haritaDurum: "hazir",
        anaKonular: [{
            konuId: anaId,
            baslik: "Son Kaynaklı Ana Konu",
            aciklama: "",
            sira: 1,
            kaynakMateryalIds: [mat1Id],
            altKonular: [{
                konuId: altId,
                baslik: "Son Kaynaklı Alt Konu",
                aciklama: "",
                sira: 1,
                kaynakMateryalIds: [mat1Id]
            }]
        }],
        kaynakMateryaller: [{ materyalId: mat1Id, aktifIslemeId: isleme1 }]
    });

    await materyalSilindigindeGuncelle(mat1Id, dersId1, kullaniciId);

    assert.equal(mockHaritaDurum, "yok", "Harita 'yok' durumuna geçmeli");
    assert.equal(mockAnaKonular.length, 0, "Aktif ana konu kalmamalı");

    // gecmisKonular'da bulunmalı
    const arsivdeVar = mockGecmisKonular.some(g =>
        g.konuId === anaId ||
        (g.altKonular || []).some(a => a.konuId === altId)
    );
    assert.ok(arsivdeVar, "Arşivlenen konu gecmisKonular'da bulunmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6 — Yeniden yükleme: arşivdeki eski konuId geri gelir
// ═══════════════════════════════════════════════════════════════════════════════
test("T6: Arşivlenen konuyla uyumlu yeni materyal yüklenince eski konuId yeniden kullanılır", async () => {
    const eskiAnaId = "top-arsiv-geri";
    const eskiAltId = "sub-arsiv-geri";

    sifirla({
        haritaDurum: "yok",
        anaKonular: [],
        gecmisKonular: [{
            konuId: eskiAnaId,
            baslik: "Ağaç Yapıları",
            aciklama: "Ağaç veri yapısı",
            sira: 1,
            kaynakMateryalIds: [],
            altKonular: [{
                konuId: eskiAltId,
                baslik: "İkili Ağaç",
                aciklama: "",
                sira: 1,
                kaynakMateryalIds: []
            }]
        }],
        kaynakMateryaller: []
    });

    // Yeni materyal: arşivdeki konuyla örtüşen içerik
    mockGeminiCikti = [{
        baslik: "Ağaç Yapıları",
        aciklama: "Ağaç veri yapısı (yeniden)",
        sira: 1,
        altKonular: [
            { baslik: "İkili Ağaç", aciklama: "BST içeriği", sira: 1 }
        ]
    }];

    await materyalEklendigindeIncrementalGuncelle(mat1Id, dersId1, kullaniciId);

    assert.equal(mockHaritaDurum, "hazir");

    // Eski konuId'ler geri gelmeli
    const geriGelenAna = mockAnaKonular.find(a => a.konuId === eskiAnaId);
    assert.ok(geriGelenAna, `Arşivdeki konuId (${eskiAnaId}) aktif haritaya geri gelmeli`);

    const geriGelenAlt = geriGelenAna.altKonular.find(a => a.konuId === eskiAltId);
    assert.ok(geriGelenAlt, `Arşivdeki alt konuId (${eskiAltId}) geri gelmeli`);
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7 — Benzer başlıklı farklı konular yanlış birleştirilmemeli
// ═══════════════════════════════════════════════════════════════════════════════
test("T7: Zıt kavramlı konular (tek/çift bağlı liste) yanlışlıkla birleştirilmez", async () => {
    sifirla({
        haritaDurum: "hazir",
        anaKonular: [{
            konuId: "top-listeler",
            baslik: "Bağlı Listeler",
            aciklama: "",
            sira: 1,
            kaynakMateryalIds: [mat1Id],
            altKonular: [
                {
                    konuId: "sub-tek-bagli",
                    baslik: "Tek Bağlı Liste",
                    aciklama: "",
                    sira: 1,
                    kaynakMateryalIds: [mat1Id]
                }
            ]
        }],
        kaynakMateryaller: [{ materyalId: mat1Id, aktifIslemeId: isleme1 }]
    });

    // İkinci materyal: farklı konu (Çift Bağlı Liste)
    mockGeminiCikti = [{
        baslik: "Bağlı Listeler",
        aciklama: "",
        sira: 1,
        altKonular: [
            { baslik: "Çift Bağlı Liste", aciklama: "", sira: 1 }
        ]
    }];

    await materyalEklendigindeIncrementalGuncelle(mat2Id, dersId1, kullaniciId);

    assert.equal(mockAnaKonular.length, 1, "Ana konu sayısı 1 kalmalı");
    const altlar = mockAnaKonular[0].altKonular;

    const tekBagli = altlar.find(a => a.konuId === "sub-tek-bagli");
    const ciftBagli = altlar.find(a => a.baslik.includes("Çift"));

    assert.ok(tekBagli, "Tek bağlı liste konusu korunmalı");
    assert.ok(ciftBagli, "Çift bağlı liste yeni konu olarak eklenmiş olmalı");
    assert.notEqual(tekBagli.konuId, ciftBagli.konuId, "Zıt konular farklı konuId'ye sahip olmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8 — Farklı dersler arasında izolasyon
// ═══════════════════════════════════════════════════════════════════════════════
test("T8: Farklı dersler arasında konu izolasyonu sağlanır", async () => {
    // deterministikKonuIdUret ile ders bazında farklı ID üretildiğini doğrula
    const dersId1Str = dersId1.toString();
    const dersId2Str = dersId2.toString();

    const id1 = deterministikKonuIdUret(dersId1Str, "Diziler", "", false);
    const id2 = deterministikKonuIdUret(dersId2Str, "Diziler", "", false);

    assert.notEqual(id1, id2, "Aynı başlık farklı dersler için farklı konuId üretmeli");
    assert.ok(id1.startsWith("top-"), "Ana konu ID'si top- ile başlamalı");
    assert.ok(id2.startsWith("top-"), "Ana konu ID'si top- ile başlamalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9 — Silme idempotency: tekrar çağrıldığında güvenli
// ═══════════════════════════════════════════════════════════════════════════════
test("T9: materyalSilindigindeGuncelle idempotent — tekrar çağrılırsa sorun çıkmaz", async () => {
    const altId = "sub-idemp";
    const anaId = "top-idemp";

    sifirla({
        haritaDurum: "hazir",
        anaKonular: [{
            konuId: anaId,
            baslik: "Idempotent Konu",
            aciklama: "",
            sira: 1,
            kaynakMateryalIds: [mat1Id],
            altKonular: [{
                konuId: altId,
                baslik: "Idempotent Alt",
                aciklama: "",
                sira: 1,
                kaynakMateryalIds: [mat1Id]
            }]
        }],
        kaynakMateryaller: [{ materyalId: mat1Id, aktifIslemeId: isleme1 }]
    });

    // İlk silme
    await materyalSilindigindeGuncelle(mat1Id, dersId1, kullaniciId);
    assert.equal(mockHaritaDurum, "yok");

    // İkinci silme — aynı materiyal için tekrar (idempotent olmalı)
    await assert.doesNotReject(
        () => materyalSilindigindeGuncelle(mat1Id, dersId1, kullaniciId),
        "Tekrar silme çağrısı hata fırlatmamalı"
    );
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10 — Gemini hata senaryosu → mevcut harita bozulmamalı
// ═══════════════════════════════════════════════════════════════════════════════
test("T10: Gemini hatası mevcut konuları bozmaz ve hata fırlatılır", async () => {
    const eskiAnaId = "top-gemini-hata";
    sifirla({
        haritaDurum: "hazir",
        anaKonular: [{
            konuId: eskiAnaId,
            baslik: "Mevcut Konu",
            aciklama: "",
            sira: 1,
            kaynakMateryalIds: [mat1Id],
            altKonular: []
        }],
        kaynakMateryaller: [{ materyalId: mat1Id, aktifIslemeId: isleme1 }],
        geminiHatasi: new Error("Gemini 503 Unavailable")
    });

    // Gemini hatası fırlatılmalı
    await assert.rejects(
        () => materyalEklendigindeIncrementalGuncelle(mat2Id, dersId1, kullaniciId),
        /Gemini 503/,
        "Gemini hatası üst katmana iletilmeli"
    );

    // Mevcut harita değişmemeli
    assert.equal(mockHaritaDurum, "hazir", "Harita durumu bozulmamalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 11 — Eski kayıtlarla uyumluluk (kaynakMateryalIds eksik)
// ═══════════════════════════════════════════════════════════════════════════════
test("T11: kaynakMateryalIds eksik eski kayıtlar materyalSilindigindeGuncelle'ye karşı güvenli", async () => {
    // Eski kayıt: kaynakMateryalIds alanı yok (migration öncesi)
    sifirla({
        haritaDurum: "hazir",
        anaKonular: [{
            konuId: "top-eski",
            baslik: "Eski Kayıt",
            aciklama: "",
            sira: 1,
            // kaynakMateryalIds yok (eski format)
            altKonular: [{
                konuId: "sub-eski",
                baslik: "Eski Alt",
                aciklama: "",
                sira: 1
                // kaynakMateryalIds yok
            }]
        }],
        kaynakMateryaller: [{ materyalId: mat1Id, aktifIslemeId: isleme1 }]
    });

    // Silme — eski kayıt kaynakMateryalIds'siz, hata çıkmamalı
    await assert.doesNotReject(
        () => materyalSilindigindeGuncelle(mat1Id, dersId1, kullaniciId),
        "Eski format kayıtlar için silme hatası çıkmamalı"
    );
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 12 — Ana konu ve alt konu bütünlüğü: konuId'ler benzersiz
// ═══════════════════════════════════════════════════════════════════════════════
test("T12: Üretilen tüm konuId değerleri benzersiz (duplikasyon yok)", async () => {
    sifirla({ haritaDurum: "yok" });

    mockGeminiCikti = [
        {
            baslik: "Ana Konu A",
            aciklama: "",
            sira: 1,
            altKonular: [
                { baslik: "Alt A1", aciklama: "", sira: 1 },
                { baslik: "Alt A2", aciklama: "", sira: 2 }
            ]
        },
        {
            baslik: "Ana Konu B",
            aciklama: "",
            sira: 2,
            altKonular: [
                { baslik: "Alt B1", aciklama: "", sira: 1 },
                { baslik: "Alt B2", aciklama: "", sira: 2 }
            ]
        }
    ];

    await materyalEklendigindeIncrementalGuncelle(mat1Id, dersId1, kullaniciId);

    const tumIdler = [];
    for (const ana of mockAnaKonular) {
        tumIdler.push(ana.konuId);
        for (const alt of ana.altKonular || []) {
            tumIdler.push(alt.konuId);
        }
    }

    assert.equal(tumIdler.length, new Set(tumIdler).size, "Tüm konuId değerleri benzersiz olmalı");
    assert.ok(tumIdler.length >= 6, "2 ana + 4 alt konu üretilmeli");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 13 — Çoklu materyal ardışık incremental yüklendiğinde eski materyaller korunur
// ═══════════════════════════════════════════════════════════════════════════════
test("T13: Çoklu materyal ardışık incremental yüklendiğinde konular birleşir ve eski konular korunur", async () => {
    sifirla({ haritaDurum: "yok" });

    // 1. Materyal
    mockGeminiCikti = [
        {
            baslik: "Veri Yapıları",
            aciklama: "Bölüm 1",
            sira: 1,
            altKonular: [{ baslik: "Diziler", aciklama: "", sira: 1 }]
        }
    ];
    await materyalEklendigindeIncrementalGuncelle(mat1Id, dersId1, kullaniciId);

    const ilkAnaKonuId = mockAnaKonular[0].konuId;
    const ilkAltKonuId = mockAnaKonular[0].altKonular[0].konuId;

    // 2. Materyal (aynı ana konuya yeni bir alt konu ekliyor)
    mockGeminiCikti = [
        {
            baslik: "Veri Yapıları",
            aciklama: "Bölüm 2",
            sira: 1,
            altKonular: [{ baslik: "Yığınlar", aciklama: "", sira: 2 }]
        }
    ];
    await materyalEklendigindeIncrementalGuncelle(mat2Id, dersId1, kullaniciId);

    assert.equal(mockAnaKonular.length, 1, "Tek ana konu olmalı");
    assert.equal(mockAnaKonular[0].konuId, ilkAnaKonuId, "Ana konuId korunmalı");
    assert.equal(mockAnaKonular[0].altKonular.length, 2, "2 alt konu olmalı");

    const eskiAlt = mockAnaKonular[0].altKonular.find(a => a.konuId === ilkAltKonuId);
    const yeniAlt = mockAnaKonular[0].altKonular.find(a => a.baslik === "Yığınlar");

    assert.ok(eskiAlt, "İlk alt konu kaybolmamalı");
    assert.ok(yeniAlt, "İkinci alt konu eklenmeli");
    assert.ok(yeniAlt.kaynakMateryalIds.map(String).includes(mat2Id.toString()), "Yeni alt konu mat2'ye bağlı olmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 14 — Legacy kaynak ilişkisi bilinmeyen konular derste başka materyal varken silinmez
// ═══════════════════════════════════════════════════════════════════════════════
test("T14: Legacy kaynak ilişkisi bilinmeyen konular derste başka materyal varken silinmez", async () => {
    sifirla({
        haritaDurum: "hazir",
        anaKonular: [{
            konuId: "top-legacy-koru",
            baslik: "Legacy Ana Konu",
            aciklama: "",
            sira: 1,
            kaynakMateryalIds: [], // Kaynağı bilinmeyen legacy konu
            altKonular: [{
                konuId: "sub-legacy-koru",
                baslik: "Legacy Alt Konu",
                aciklama: "",
                sira: 1,
                kaynakMateryalIds: [] // Kaynağı bilinmeyen legacy alt konu
            }]
        }],
        kaynakMateryaller: [
            { materyalId: mat1Id, aktifIslemeId: isleme1 },
            { materyalId: mat2Id, aktifIslemeId: isleme2 }
        ]
    });

    // mat1 siliniyor ama derste mat2 hala var
    await materyalSilindigindeGuncelle(mat1Id, dersId1, kullaniciId);

    assert.equal(mockAnaKonular.length, 1, "Derste mat2 olduğu için legacy konu aktif kalmalı");
    assert.equal(mockAnaKonular[0].konuId, "top-legacy-koru", "Legacy ana konu korunmalı");
    assert.equal(mockAnaKonular[0].altKonular.length, 1, "Legacy alt konu korunmalı");
    assert.equal(mockAnaKonular[0].altKonular[0].konuId, "sub-legacy-koru", "Legacy alt konuId korunmalı");
});

test("T15: Eşzamanlı iki materyal güncellemesi kaynakları kaybetmez", async () => {
    sifirla({ haritaDurum: "yok" });

    mockGeminiCikti = [{
        baslik: "Veri Yapıları",
        aciklama: "Ortak konu",
        sira: 1,
        altKonular: [{
            baslik: "Soyut Veri Tipi (ADT)",
            aciklama: "Abstract Data Type",
            sira: 1
        }]
    }];

    const [sonuc1, sonuc2] = await Promise.all([
        materyalEklendigindeIncrementalGuncelle(
            mat1Id, dersId1, kullaniciId
        ),
        materyalEklendigindeIncrementalGuncelle(
            mat2Id, dersId1, kullaniciId
        )
    ]);

    assert.ok(sonuc1, "İlk işlem başarılı olmalı");
    assert.ok(sonuc2, "İkinci işlem başarılı olmalı");

    assert.equal(mockAnaKonular.length, 1);
    assert.equal(mockAnaKonular[0].altKonular.length, 1);

    const kaynaklar = mockAnaKonular[0].altKonular[0]
        .kaynakMateryalIds.map(String);

    assert.ok(
        kaynaklar.includes(mat1Id.toString()),
        "İlk materyalin kaynak ilişkisi korunmalı"
    );

    assert.ok(
        kaynaklar.includes(mat2Id.toString()),
        "İkinci materyalin kaynak ilişkisi korunmalı"
    );

    assert.equal(
        new Set(kaynaklar).size,
        2,
        "Kaynak materyal kimlikleri tekrarlanmamalı"
    );
});


test("T16: Aynı Gemini çıktısındaki ADT tekrarları tek konu olmalı", async () => {
    sifirla({ haritaDurum: "yok" });

    mockGeminiCikti = [{
        baslik: "Veri Yapıları",
        aciklama: "Veri yapılarının temel kavramları",
        sira: 1,
        altKonular: [
            {
                baslik: "Soyut Veri Tipi (ADT)",
                aciklama: "Abstract Data Type kavramının tanımı",
                sira: 1
            },
            {
                baslik: "Soyut Veri Tipi (ADT) Tanımı",
                aciklama: "Abstract Data Type kavramının açıklaması",
                sira: 2
            }
        ]
    }];

    await materyalEklendigindeIncrementalGuncelle(
        mat1Id,
        dersId1,
        kullaniciId
    );

    assert.equal(
        mockAnaKonular.length,
        1,
        "Tek ana konu oluşturulmalı"
    );

    assert.equal(
        mockAnaKonular[0].altKonular.length,
        1,
        "Aynı anlama gelen ADT konuları birleştirilmeli"
    );
});


test("T17: Eşzamanlı silme ve ekleme kaynakları ve konuId'yi korur", async () => {
    sifirla({ haritaDurum: "yok" });

    mockGeminiCikti = [{
        baslik: "Veri Yapıları",
        aciklama: "Veri yapıları",
        sira: 1,
        altKonular: [{
            baslik: "Soyut Veri Tipi (ADT)",
            aciklama: "Abstract Data Type",
            sira: 1
        }]
    }];

    // Başlangıç: Aynı konuyu destekleyen iki materyal.
    await materyalEklendigindeIncrementalGuncelle(
        mat1Id, dersId1, kullaniciId
    );

    await materyalEklendigindeIncrementalGuncelle(
        mat2Id, dersId1, kullaniciId
    );

    const eskiKonuId = mockAnaKonular[0].altKonular[0].konuId;

    // Aynı ders için silme ve yeni materyal ekleme eşzamanlı başlar.
    const [silmeSonucu, eklemeSonucu] = await Promise.all([
        materyalSilindigindeGuncelle(
            mat1Id, dersId1, kullaniciId
        ),
        materyalEklendigindeIncrementalGuncelle(
            mat3Id, dersId1, kullaniciId
        )
    ]);

    assert.ok(silmeSonucu, "Silme işlemi başarılı olmalı");
    assert.ok(eklemeSonucu, "Ekleme işlemi başarılı olmalı");

    assert.equal(mockAnaKonular.length, 1);
    assert.equal(mockAnaKonular[0].altKonular.length, 1);

    const sonKonu = mockAnaKonular[0].altKonular[0];

    assert.equal(
        sonKonu.konuId,
        eskiKonuId,
        "Eşzamanlı işlemler mevcut konuId'yi değiştirmemeli"
    );

    const kaynaklar = sonKonu.kaynakMateryalIds.map(String);

    assert.deepEqual(
        [...kaynaklar].sort(),
        [mat2Id.toString(), mat3Id.toString()].sort(),
        "Silinen materyal geri gelmemeli, mevcut ve yeni kaynak korunmalı"
    );

    const haritaKaynaklari = mockKaynakMateryaller.map(
        kaynak => kaynak.materyalId.toString()
    );

    assert.deepEqual(
        [...haritaKaynaklari].sort(),
        [mat2Id.toString(), mat3Id.toString()].sort(),
        "Haritanın kaynakMateryaller listesi de tutarlı kalmalı"
    );
});


test("T18: Gemini sırasında değişen materyalin eski sonucu kaydedilmez", async () => {
    sifirla({ haritaDurum: "yok" });

    mockGeminiCikti = [{
        baslik: "Veri Yapıları",
        aciklama: "Test konusu",
        sira: 1,
        altKonular: [{
            baslik: "Soyut Veri Tipi (ADT)",
            aciklama: "ADT konusu",
            sira: 1
        }]
    }];

    let geminiBasladi;
    const geminiBasladiPromise = new Promise(resolve => {
        geminiBasladi = resolve;
    });

    let geminiDevamEt;
    const geminiBeklemePromise = new Promise(resolve => {
        geminiDevamEt = resolve;
    });

    mockGeminiBekleme = async () => {
        geminiBasladi();
        await geminiBeklemePromise;
    };

    try {
        const islem = materyalEklendigindeIncrementalGuncelle(
            mat1Id, dersId1, kullaniciId
        );

        // Materyalin ilk okuması tamamlandı ve Gemini başladı.
        await geminiBasladiPromise;

        // Gemini beklerken aktif işleme sürümü değişiyor.
        mockAktifIslemeId = isleme2;

        // Eski Gemini sonucunun dönmesine izin ver.
        geminiDevamEt();

        const sonuc = await islem;

        assert.equal(
            sonuc,
            null,
            "Eski işleme sürümünün Gemini sonucu reddedilmeli"
        );

        assert.equal(
            mockAnaKonular.length,
            0,
            "Eski sonuç haritaya konu eklememeli"
        );

        assert.equal(
            mockFindOneAndUpdateCallCount,
            0,
            "Geçersiz sonuç veritabanına yazılmamalı"
        );

        assert.equal(
            mockCreateCallCount,
            0,
            "Geçersiz sonuç yeni harita oluşturmamalı"
        );
    } finally {
        geminiDevamEt();
        mockGeminiBekleme = null;
    }
});


test("T19: Gemini sırasında silinen materyalin sonucu kaydedilmez", async () => {
    sifirla({ haritaDurum: "yok" });

    let geminiBasladi;
    const geminiBasladiPromise = new Promise(resolve => {
        geminiBasladi = resolve;
    });

    let geminiDevamEt;
    const geminiBeklemePromise = new Promise(resolve => {
        geminiDevamEt = resolve;
    });

    mockGeminiBekleme = async () => {
        geminiBasladi();
        await geminiBeklemePromise;
    };

    try {
        const islem = materyalEklendigindeIncrementalGuncelle(
            mat1Id, dersId1, kullaniciId
        );

        // Gemini'nin gerçekten başladığını bekle.
        await geminiBasladiPromise;

        // Gemini çalışırken materyal veritabanından siliniyor.
        mockMateryalBulundu = false;

        // Gemini eski analiz sonucunu döndürüyor.
        geminiDevamEt();

        const sonuc = await islem;

        assert.equal(
            sonuc,
            null,
            "Silinen materyalin sonucu reddedilmeli"
        );

        assert.equal(
            mockAnaKonular.length,
            0,
            "Silinen materyalin konuları haritaya eklenmemeli"
        );

        assert.equal(
            mockFindOneAndUpdateCallCount,
            0,
            "Silinen materyal için harita güncellenmemeli"
        );

        assert.equal(
            mockCreateCallCount,
            0,
            "Silinen materyal için yeni harita oluşturulmamalı"
        );
    } finally {
        geminiDevamEt();
        mockGeminiBekleme = null;
    }
});


test("T20: Çalışma Soruları tekrarları tespit edilmeli", async () => {
    sifirla({ haritaDurum: "yok" });

    mockGeminiCikti = [{
        baslik: "Gerçek Kullanım Örnekleri ve Uygulamalar",
        aciklama: "",
        altKonular: [
            {
                baslik: "Çalışma Soruları ve Problemler",
                aciklama: "Parantez kontrolü ve yazıcı kuyruğu"
            },
            {
                baslik: "Çalışma Soruları",
                aciklama: "Parantez kontrolü ve yazıcı kuyruğu"
            }
        ]
    }];

    await materyalEklendigindeIncrementalGuncelle(
        mat1Id, dersId1, kullaniciId
    );

    const altlar = mockAnaKonular.flatMap(
        ana => ana.altKonular || []
    );

    assert.equal(
        altlar.length,
        1,
        "Aynı çalışma soruları iki kez oluşturulmamalı"
    );
});

test("T21: Aynı alt konu farklı ana konularda tekrarlanmamalı", async () => {
    sifirla({ haritaDurum: "yok" });

    mockGeminiCikti = [
        {
            baslik: "Ağaç Dolaşma Yöntemleri",
            altKonular: [
                { baslik: "Binary Search", aciklama: "İkili arama" }
            ]
        },
        {
            baslik: "Arama Algoritmaları",
            altKonular: [
                { baslik: "Binary Search", aciklama: "İkili arama" }
            ]
        }
    ];

    await materyalEklendigindeIncrementalGuncelle(
        mat1Id, dersId1, kullaniciId
    );

    const tumAltlar = mockAnaKonular.flatMap(
        ana => ana.altKonular || []
    );

    const binarySearchSayisi = tumAltlar.filter(
        alt => alt.baslik === "Binary Search"
    ).length;

    assert.equal(
        binarySearchSayisi,
        1,
        "Binary Search iki farklı ana konuda tekrarlanmamalı"
    );
});

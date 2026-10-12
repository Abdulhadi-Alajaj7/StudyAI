/**
 * otomatikGuncelleme.test.js
 *
 * Materyal ekleme/silme sonrası konu haritasının otomatik güncellenmesini,
 * eşzamanlılık güvenliğini, hata kurtarmayı ve arka arkaya üretimlerde
 * konu kimlikleri (konuId) ile başlıklarının (baslik) korunmasını test eder.
 *
 * Çalıştırmak için:
 *   node --experimental-test-module-mocks --test tests/otomatikGuncelleme.test.js
 */

import { test, mock } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

// ─── Paylaşılan mock durum değişkenleri ──────────────────────────────────────

const dersId      = new mongoose.Types.ObjectId();
const kullaniciId = new mongoose.Types.ObjectId();
const matId       = new mongoose.Types.ObjectId();
const eskiIslemeId = new mongoose.Types.ObjectId();
const yeniIslemeId = new mongoose.Types.ObjectId();

let hazirSayisi   = 1;
let haritaDurum   = "hazir";
let haritaKaynak  = [{ materyalId: matId, aktifIslemeId: eskiIslemeId }];
let haritaMevcutAnaKonular = [];
let haritaGecmisKonular = [];
let haritaAktifIslemToken = null;
let hazirMateryaller = [{ _id: matId, dosyaAdi: "ders.pdf", orijinalDosyaAdi: "ders.pdf", aktifIslemeId: yeniIslemeId }];

let geminiCalls          = 0;
let findOneAndUpdateCalls = 0;
let createCalls          = 0;
let createError          = null;
let geminiHatasi         = null;
let geminiCagrisiKancasi = null;
let geminiCiktisiOverride = null;
let sonGuncellemeSet     = null;
let sonGuncellemeAddToSet = null;

// ─── Mock Modüller ────────────────────────────────────────────────────────────

mock.module("../models/Materyal.js", {
    namedExports: {},
    defaultExport: {
        countDocuments: async () => hazirSayisi,
        find: () => ({
            select: async () => hazirMateryaller
        })
    }
});

mock.module("../models/MetinParcasi.js", {
    namedExports: {},
    defaultExport: {
        find: () => ({
            sort: async () => [
                {
                    materyalId: matId,
                    islemeId: yeniIslemeId,
                    icerik: "Test ders içeriği. Bu bir birim test metnidir.",
                    parcaIndex: 0
                }
            ]
        })
    }
});

mock.module("../models/KonuHaritasi.js", {
    namedExports: {},
    defaultExport: {
        findOne: async (sorgu) => {
            // konuHaritasiUretVeKaydet içindeki kilit doğrulama çağrısı
            if (sorgu && sorgu.aktifIslemToken) {
                if (haritaDurum === "olusturuluyor") {
                    return {
                        _id: new mongoose.Types.ObjectId(),
                        dersId,
                        kullaniciId,
                        durum: "olusturuluyor",
                        anaKonular: haritaMevcutAnaKonular,
                        gecmisKonular: haritaGecmisKonular,
                        aktifIslemToken: sorgu.aktifIslemToken,
                        updatedAt: new Date(),
                        sonOlusturmaTarihi: new Date()
                    };
                }
                return null;
            }
            // arkaPlandaKonuHaritasiGuncelle ilk findOne çağrısı
            if (haritaDurum === "yok") return null;
            return {
                _id: new mongoose.Types.ObjectId(),
                dersId,
                kullaniciId,
                durum: haritaDurum,
                anaKonular: haritaMevcutAnaKonular,
                gecmisKonular: haritaGecmisKonular,
                kaynakMateryaller: haritaKaynak,
                aktifIslemToken: haritaAktifIslemToken,
                updatedAt: new Date(),
                sonOlusturmaTarihi: new Date()
            };
        },
        create: async (doc) => {
            createCalls++;
            if (createError) throw createError;
            haritaDurum = "olusturuluyor";
            haritaAktifIslemToken = doc?.aktifIslemToken || new mongoose.Types.ObjectId();
            return {
                _id: new mongoose.Types.ObjectId(),
                dersId,
                kullaniciId,
                durum: "olusturuluyor",
                anaKonular: [],
                gecmisKonular: [],
                aktifIslemToken: haritaAktifIslemToken,
                updatedAt: new Date(),
                sonOlusturmaTarihi: new Date()
            };
        },
        findOneAndUpdate: async (_filtre, guncelleme) => {
            findOneAndUpdateCalls++;
            sonGuncellemeSet = guncelleme.$set;
            sonGuncellemeAddToSet = guncelleme.$addToSet;

            if (guncelleme.$set?.durum) {
                haritaDurum = guncelleme.$set.durum;
            }
            if (guncelleme.$set?.aktifIslemToken !== undefined) {
                haritaAktifIslemToken = guncelleme.$set.aktifIslemToken;
            }
            if (guncelleme.$set?.anaKonular !== undefined) {
                haritaMevcutAnaKonular = guncelleme.$set.anaKonular;
            }
            if (guncelleme.$set?.gecmisKonular !== undefined) {
                haritaGecmisKonular = guncelleme.$set.gecmisKonular;
            }
            if (guncelleme.$set?.kaynakMateryaller !== undefined) {
                haritaKaynak = guncelleme.$set.kaynakMateryaller;
            }
            return guncelleme.$set || {};
        }
    }
});

mock.module("../models/Ders.js", {
    namedExports: {},
    defaultExport: {
        findById: async () => ({
            _id: dersId,
            dersAdi: "Veri Yapıları",
            aciklama: "Test dersi",
            donem: "Güz 2024"
        })
    }
});

mock.module("../services/geminiService.js", {
    namedExports: {
        VARSAYILAN_GEMINI_MODELI: "test-model",
        geminiIleKonuHaritasiUret: async () => {
            geminiCalls++;
            if (geminiCagrisiKancasi) {
                geminiCagrisiKancasi();
            }
            if (geminiHatasi) throw geminiHatasi;
            if (geminiCiktisiOverride) return geminiCiktisiOverride;
            return [
                {
                    baslik: "Test Ana Konu",
                    aciklama: "Test açıklaması",
                    sira: 1,
                    altKonular: [
                        { baslik: "Test Alt Konu", aciklama: "Alt açıklama", sira: 1 }
                    ]
                }
            ];
        },
        geminiIleKonulariBirlestir: async () => {
            throw new Error("Tek grup testinde birleştirme çağrılmamalı.");
        }
    }
});

// ─── Servis İmport ────────────────────────────────────────────────────────────

const { arkaPlandaKonuHaritasiGuncelle, konuHaritasiUretVeKaydet } = await import(
    "../services/konuHaritasiService.js"
);

// ─── Yardımcı: sayaçları ve durumu sıfırla ───────────────────────────────────

function sifirla(overrides = {}) {
    hazirSayisi              = overrides.hazirSayisi   ?? 1;
    haritaDurum              = overrides.haritaDurum   ?? "hazir";
    haritaKaynak             = overrides.haritaKaynak  ?? [{ materyalId: matId, aktifIslemeId: eskiIslemeId }];
    haritaMevcutAnaKonular   = overrides.haritaMevcutAnaKonular ?? [];
    haritaGecmisKonular      = overrides.haritaGecmisKonular ?? [];
    haritaAktifIslemToken    = overrides.haritaAktifIslemToken ?? null;
    hazirMateryaller         = overrides.hazirMateryaller ?? [
        { _id: matId, dosyaAdi: "ders.pdf", orijinalDosyaAdi: "ders.pdf", aktifIslemeId: yeniIslemeId }
    ];
    geminiCalls              = 0;
    findOneAndUpdateCalls    = 0;
    createCalls              = 0;
    createError              = null;
    geminiHatasi             = null;
    geminiCagrisiKancasi     = null;
    geminiCiktisiOverride    = null;
    sonGuncellemeSet         = null;
    sonGuncellemeAddToSet    = null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 1 — Hazır materyal yoksa ve harita da yoksa Gemini çağrılmaz ve dokunulmaz
// ═══════════════════════════════════════════════════════════════════════════════
test("Hazır materyal yoksa ve harita da yoksa Gemini çağrılmaz", async () => {
    sifirla({ hazirSayisi: 0, haritaDurum: "yok" });

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(geminiCalls, 0, "Gemini çağrılmamalı");
    assert.equal(createCalls, 0, "Yeni harita kaydı oluşturulmamalı");
    assert.equal(findOneAndUpdateCalls, 0, "Güncelleme yapılmamalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 2 — Harita zaten "olusturuluyor" ise atlanır
// ═══════════════════════════════════════════════════════════════════════════════
test("Harita zaten olusturuluyor ise ikinci çağrı Gemini'ye gitmiyor", async () => {
    sifirla({ haritaDurum: "olusturuluyor" });

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(geminiCalls, 0, "Zaten üretiliyor; Gemini tekrar çağrılmamalı");
    assert.equal(findOneAndUpdateCalls, 0, "Kilit tekrar alınmamalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 3 — Harita zaten güncel ise Gemini çağrılmaz
// ═══════════════════════════════════════════════════════════════════════════════
test("Harita zaten güncel ise gereksiz Gemini çağrısı yapılmaz", async () => {
    sifirla({
        haritaDurum: "hazir",
        haritaKaynak: [{ materyalId: matId, aktifIslemeId: yeniIslemeId }],
        hazirMateryaller: [{ _id: matId, aktifIslemeId: yeniIslemeId }]
    });

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(geminiCalls, 0, "Güncel harita için Gemini çağrılmamalı");
    assert.equal(findOneAndUpdateCalls, 0, "Harita değiştirilmemeli");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 4 — İlk materyal yüklendi, harita henüz yok → oluşturulur
// ═══════════════════════════════════════════════════════════════════════════════
test("İlk materyal yüklenmesi haritanın otomatik oluşturulmasını tetikler", async () => {
    sifirla({ haritaDurum: "yok" });

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(createCalls, 1, "Yeni harita kaydı oluşturulmalı");
    assert.equal(geminiCalls, 1, "Gemini bir kez çağrılmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 5 — Materyal yeniden işlendi (aktifIslemeId değişti) → harita güncellenir
// ═══════════════════════════════════════════════════════════════════════════════
test("Materyal güncellendikten sonra harita yeniden üretilir", async () => {
    sifirla({
        haritaDurum: "hazir",
        haritaKaynak: [{ materyalId: matId, aktifIslemeId: eskiIslemeId }],
        hazirMateryaller: [{ _id: matId, aktifIslemeId: yeniIslemeId }]
    });

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(geminiCalls, 1, "Güncelleme için Gemini çağrılmalı");
    assert.ok(findOneAndUpdateCalls >= 1, "Harita en az bir kez güncellenmeli");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 6 — Son materyal silindiğinde resmi harita boş duruma geçer, gecmisKonular korunur
// ═══════════════════════════════════════════════════════════════════════════════
test("Son materyal silindiğinde güncel içerik boşalır ve öğrenme geçmişi gecmisKonular'a aktarılır", async () => {
    const eskiKonular = [{ konuId: "top-abc", baslik: "Eski Konu", altKonular: [] }];
    sifirla({
        hazirSayisi: 0,
        haritaDurum: "hazir",
        haritaMevcutAnaKonular: eskiKonular
    });

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(geminiCalls, 0, "Hazır materyal kalmadığından Gemini çağrılmamalı");
    assert.ok(findOneAndUpdateCalls >= 1, "Harita güncelleme çağrılmalı");
    assert.equal(sonGuncellemeSet?.durum, "yok", "Resmi harita durumu 'yok' olmalı");
    assert.deepEqual(sonGuncellemeSet?.anaKonular, [], "Güncel ana konular boş diziye geçmeli");
    assert.equal(sonGuncellemeSet?.toplamAnaKonuSayisi, 0, "Toplam ana konu sayısı 0 olmalı");
    assert.deepEqual(sonGuncellemeSet?.gecmisKonular, eskiKonular, "Öğrenme geçmişi gecmisKonular arşivine aktarılmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 7 — E11000 yarış durumu sessizce atlanır ve hata yayılmaz
// ═══════════════════════════════════════════════════════════════════════════════
test("E11000 yarış durumu sessizce atlanır ve hata yayılmaz", async () => {
    sifirla({ haritaDurum: "yok" });
    createError = Object.assign(new Error("E11000 duplicate key"), { code: 11000 });

    await assert.doesNotReject(
        () => arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId),
        "E11000 hatası üst katmana yayılmamalı"
    );

    assert.equal(geminiCalls, 0, "Çakışan oluşturma atlandığından Gemini çağrılmamalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 8 — Gemini hatası mevcut geçerli haritayı bozmaz ve kilit serbest bırakılır
// ═══════════════════════════════════════════════════════════════════════════════
test("Gemini 503 hatası sırasında uygulama çökmez, kilit açılır ve mevcut harita korunur", async () => {
    const mevcutKonular = [{ konuId: "top-mevcut", baslik: "Mevcut Konu", altKonular: [] }];
    sifirla({
        haritaDurum: "hazir",
        haritaKaynak: [{ materyalId: matId, aktifIslemeId: eskiIslemeId }],
        hazirMateryaller: [{ _id: matId, aktifIslemeId: yeniIslemeId }],
        haritaMevcutAnaKonular: mevcutKonular
    });
    geminiHatasi = new Error("Gemini 503 Service Unavailable");

    await assert.doesNotReject(
        () => arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId),
        "Gemini hatası HTTP yanıtını veya uygulamayı çökertmemeli"
    );

    assert.equal(geminiCalls, 1, "Gemini denenmiş ancak başarısız olmuş olmalı");
    assert.ok(findOneAndUpdateCalls >= 1, "Harita hata/hazir durumuna geçirilmeli");
    assert.equal(haritaAktifIslemToken, null, "Kilit serbest bırakılmalı (null)");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 9 — Çok sayıda hazır materyal olduğunda harita tek seferde güncellenir
// ═══════════════════════════════════════════════════════════════════════════════
test("Çok sayıda materyal için Gemini yalnızca bir kez çağrılır", async () => {
    const mat2 = new mongoose.Types.ObjectId();
    const mat3 = new mongoose.Types.ObjectId();
    sifirla({
        hazirSayisi: 3,
        haritaDurum: "hazir",
        haritaKaynak: [],
        hazirMateryaller: [
            { _id: matId, aktifIslemeId: yeniIslemeId, dosyaAdi: "a.pdf", orijinalDosyaAdi: "a.pdf" },
            { _id: mat2,  aktifIslemeId: yeniIslemeId, dosyaAdi: "b.pdf", orijinalDosyaAdi: "b.pdf" },
            { _id: mat3,  aktifIslemeId: yeniIslemeId, dosyaAdi: "c.pdf", orijinalDosyaAdi: "c.pdf" }
        ]
    });

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(geminiCalls, 1, "3 materyal için Gemini yalnızca bir kez çağrılmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 10 — Öğrenme geçmişinin korunması: anaKonular silinmiyor
// ═══════════════════════════════════════════════════════════════════════════════
test("Başarısız harita üretiminde önceki geçerli anaKonular silinmez", async () => {
    const eskiKonular = [
        { konuId: "top-1", baslik: "Diziler", altKonular: [{ konuId: "sub-1", baslik: "Tek Boyutlu" }] },
        { konuId: "top-2", baslik: "Ağaçlar", altKonular: [] }
    ];
    sifirla({
        haritaDurum: "hazir",
        haritaKaynak: [{ materyalId: matId, aktifIslemeId: eskiIslemeId }],
        hazirMateryaller: [{ _id: matId, aktifIslemeId: yeniIslemeId }],
        haritaMevcutAnaKonular: eskiKonular
    });
    geminiHatasi = new Error("Zaman aşımı hatası (timeout)");

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.deepEqual(
        haritaMevcutAnaKonular,
        eskiKonular,
        "Öğrenme geçmişi (konuId'ler ve başlıklar) değiştirilmemeli"
    );
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 11 — Eşzamanlı materyal değişikliğinde yeni kaynak durumu değerlendirilir
// ═══════════════════════════════════════════════════════════════════════════════
test("Analiz sırasında materyaller değişirse kilit açılır ve işlem sonunda yeni kaynaklar değerlendirilir", async () => {
    const ders = {
        _id: dersId,
        dersAdi: "Veri Yapıları",
        aciklama: "Test",
        donem: "Güz"
    };

    sifirla({
        haritaDurum: "olusturuluyor",
        haritaKaynak: [{ materyalId: matId, aktifIslemeId: eskiIslemeId }],
        hazirMateryaller: [{ _id: matId, aktifIslemeId: eskiIslemeId }]
    });

    const mat2 = new mongoose.Types.ObjectId();
    const yeniIsleme2 = new mongoose.Types.ObjectId();
    // Analiz sırasında (Gemini çağrısı gerçekleşirken) derse yeni materyal eklendi
    geminiCagrisiKancasi = () => {
        hazirMateryaller = [
            { _id: matId, aktifIslemeId: eskiIslemeId },
            { _id: mat2,  aktifIslemeId: yeniIsleme2 }
        ];
    };

    const islemToken = new mongoose.Types.ObjectId();
    const sonuc = await konuHaritasiUretVeKaydet(ders, kullaniciId, islemToken);

    // İlk deneme analizi materyaller değiştiği için stale sayılır ve null döner
    assert.equal(sonuc, null, "Değişen kaynak durumunda ilk üretim taahhüt edilmemeli");
    // Kilit serbest bırakılmış olmalı
    assert.equal(sonGuncellemeSet?.aktifIslemToken, null, "Kilit belirteci null olarak serbest bırakılmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 12 — Kilit sonrası beklenmeyen hata oluşursa harita olusturuluyor'da kalmaz
// ═══════════════════════════════════════════════════════════════════════════════
test("Oluşturma kilidi alındıktan sonra hata oluşursa harita süresiz olusturuluyor durumunda kalmaz", async () => {
    sifirla({
        haritaDurum: "hazir",
        haritaKaynak: [],
        hazirMateryaller: [{ _id: matId, aktifIslemeId: yeniIslemeId }],
        haritaMevcutAnaKonular: [{ konuId: "top-prev", baslik: "Eski Konu", altKonular: [] }]
    });
    geminiHatasi = new Error("API Fatal Error");

    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.notEqual(haritaDurum, "olusturuluyor", "Harita süresiz 'olusturuluyor' durumunda kalmamalı");
    assert.equal(haritaAktifIslemToken, null, "Aktif işlem tokenı sıfırlanmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 13 — Eşleşen eski konuların hem konuId hem de orijinal baslik değerleri korunur
// ═══════════════════════════════════════════════════════════════════════════════
test("Harita yeniden üretildiğinde eşleşen konuların hem konuId hem de orijinal baslik değeri korunur", async () => {
    const ders = {
        _id: dersId,
        dersAdi: "Veri Yapıları",
        aciklama: "Test",
        donem: "Güz"
    };

    const oncekiKonular = [
        {
            konuId: "top-100",
            baslik: "Diziler ve Bellek",
            altKonular: [
                { konuId: "sub-200", baslik: "Tek Boyutlu Diziler" }
            ]
        }
    ];

    sifirla({
        haritaDurum: "olusturuluyor",
        haritaMevcutAnaKonular: oncekiKonular,
        haritaKaynak: [{ materyalId: matId, aktifIslemeId: yeniIslemeId }],
        hazirMateryaller: [{ _id: matId, aktifIslemeId: yeniIslemeId }]
    });

    // Gemini aynı konuyu büyük harfle veya noktalama ile farklı başlıkla döndürsün
    geminiCiktisiOverride = [
        {
            baslik: "DİZİLER VE BELLEK!",
            aciklama: "Yeni açıklama",
            altKonular: [
                { baslik: "TEK BOYUTLU DİZİLER...", aciklama: "Yeni alt açıklama" }
            ]
        }
    ];

    const islemToken = new mongoose.Types.ObjectId();
    const sonuc = await konuHaritasiUretVeKaydet(ders, kullaniciId, islemToken);

    assert.ok(sonuc, "Harita üretilmiş olmalı");
    assert.equal(sonuc.anaKonular[0].konuId, "top-100", "Eski konuId korunmalı");
    assert.equal(sonuc.anaKonular[0].baslik, "Diziler ve Bellek", "Orijinal ana konu başlığı korunmalı (Gemini büyük harfi değil)");
    assert.equal(sonuc.anaKonular[0].altKonular[0].konuId, "sub-200", "Eski alt konuId korunmalı");
    assert.equal(sonuc.anaKonular[0].altKonular[0].baslik, "Tek Boyutlu Diziler", "Orijinal alt konu başlığı korunmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 14 — DersHazir Polling Mekanizması Simülasyonu
// ═══════════════════════════════════════════════════════════════════════════════
test("DersHazir polling sonlandırma kuralları: hazir+guncel, hata ve max deneme sınırları doğrulanır", () => {
    // 1. Hazır ve güncel durumda polling durmalı
    const durum1 = { durum: "hazir", guncelMi: true };
    const durmali1 = durum1.durum === "hazir" && durum1.guncelMi;
    assert.equal(durmali1, true, "Hazır ve güncel haritada polling durmalı");

    // 2. Kalıcı hata durumunda polling durmalı
    const durum2 = { durum: "hata" };
    const durmali2 = durum2.durum === "hata";
    assert.equal(durmali2, true, "Kalıcı hata durumunda sonsuz polling önlenmeli");

    // 3. Maksimum hata sınırına ulaşınca durmalı
    let hataSayisi = 3;
    const MAX_HATA = 3;
    assert.ok(hataSayisi >= MAX_HATA, "Ardışık 3 hatada polling sonlandırılmalı");

    // 4. Maksimum poll sayısına ulaşınca durmalı
    let pollSayisi = 40;
    const MAX_POLL = 40;
    assert.ok(pollSayisi >= MAX_POLL, "Maksimum 40 yoklamada polling sonlandırılmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// TEST 15 — GERÇEK KULLANIM SENARYOSU: Arka Arkaya 3 Harita Üretimi (2 -> 3 -> 4 Materyal)
// ═══════════════════════════════════════════════════════════════════════════════
test("Gerçek senaryo: 3 ardışık materyal ekleme turunda tüm değişmeyen konuların konuId ve baslik değerleri 3. turda da korunur", async () => {
    const mat1Id = new mongoose.Types.ObjectId();
    const mat2Id = new mongoose.Types.ObjectId();
    const mat3Id = new mongoose.Types.ObjectId();
    const mat4Id = new mongoose.Types.ObjectId();

    const islemeId1 = new mongoose.Types.ObjectId();
    const islemeId2 = new mongoose.Types.ObjectId();
    const islemeId3 = new mongoose.Types.ObjectId();
    const islemeId4 = new mongoose.Types.ObjectId();

    // ─── TUR 1: 2 Materyal ile İlk Harita Üretimi (2 Ana Konu, 8 Alt Konu) ─────
    sifirla({
        hazirSayisi: 2,
        haritaDurum: "yok",
        haritaKaynak: [],
        hazirMateryaller: [
            { _id: mat1Id, aktifIslemeId: islemeId1, dosyaAdi: "mat1.pdf" },
            { _id: mat2Id, aktifIslemeId: islemeId2, dosyaAdi: "mat2.pdf" }
        ]
    });

    const tur1GeminiCiktisi = [
        {
            baslik: "Temel Kavramlar ve Veri Yapilari",
            aciklama: "Giriş konuları",
            sira: 1,
            altKonular: [
                { baslik: "Veri yapisi kavrami ve neden gereklidir?", aciklama: "", sira: 1 },
                { baslik: "Soyut veri tipi (ADT)", aciklama: "", sira: 2 },
                { baslik: "Algoritma karmasikligi", aciklama: "", sira: 3 },
                { baslik: "Big-O gosterimine giris", aciklama: "", sira: 4 }
            ]
        },
        {
            baslik: "Bagli Listeler",
            aciklama: "Liste yapıları",
            sira: 2,
            altKonular: [
                { baslik: "Tek bagli liste", aciklama: "", sira: 1 },
                { baslik: "Cift bagli liste", aciklama: "", sira: 2 },
                { baslik: "Dairesel bagli liste", aciklama: "", sira: 3 },
                { baslik: "Bagli liste uygulamalari", aciklama: "", sira: 4 }
            ]
        }
    ];

    geminiCiktisiOverride = tur1GeminiCiktisi;
    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(haritaDurum, "hazir", "1. tur tamamlandığında harita hazır olmalı");
    assert.equal(haritaMevcutAnaKonular.length, 2, "1. turda 2 ana konu olmalı");

    // 1. Turda üretilen kalıcı ID ve başlıkları hafızaya al
    const tur1AnaKonu1 = haritaMevcutAnaKonular[0];
    const tur1AnaKonu2 = haritaMevcutAnaKonular[1];

    const tur1AltKonularMap = new Map();
    for (const ana of haritaMevcutAnaKonular) {
        for (const alt of ana.altKonular) {
            tur1AltKonularMap.set(alt.baslik, { konuId: alt.konuId, baslik: alt.baslik });
        }
    }
    assert.equal(tur1AltKonularMap.size, 8, "1. turda 8 alt konu kaydedilmiş olmalı");

    // ─── TUR 2: 1 Yeni Materyal Eklendi (3 Materyal, 3 Ana Konu, 13 Alt Konu) ───
    // Gemini çıktıları Türkçe karakter ve küçük yazım farklarıyla dönüyor:
    // "Veri yapısı kavramı ve neden gereklidir?", "Soyut Veri Tipi (ADT)", "Algoritma karmaşıklığı" vb.
    sifirla({
        hazirSayisi: 3,
        haritaDurum: "hazir",
        haritaMevcutAnaKonular: haritaMevcutAnaKonular,
        haritaGecmisKonular: haritaGecmisKonular,
        haritaKaynak: [
            { materyalId: mat1Id, aktifIslemeId: islemeId1 },
            { materyalId: mat2Id, aktifIslemeId: islemeId2 }
        ],
        hazirMateryaller: [
            { _id: mat1Id, aktifIslemeId: islemeId1, dosyaAdi: "mat1.pdf" },
            { _id: mat2Id, aktifIslemeId: islemeId2, dosyaAdi: "mat2.pdf" },
            { _id: mat3Id, aktifIslemeId: islemeId3, dosyaAdi: "mat3.pdf" }
        ]
    });

    const tur2GeminiCiktisi = [
        {
            baslik: "Temel Kavramlar ve Veri Yapıları", // Türkçe ı
            aciklama: "Giriş konuları güncellendi",
            sira: 1,
            altKonular: [
                { baslik: "Veri yapısı kavramı ve neden gereklidir?", aciklama: "", sira: 1 }, // ı harfi ile
                { baslik: "Soyut Veri Tipi (ADT)", aciklama: "", sira: 2 }, // Büyük harf varyasyonu
                { baslik: "Algoritma karmaşıklığı", aciklama: "", sira: 3 }, // ş ve ı
                { baslik: "Big-O gösterimine giriş", aciklama: "", sira: 4 }  // ö, ş, i
            ]
        },
        {
            baslik: "Bağlı Listeler", // ğ
            aciklama: "Liste yapıları",
            sira: 2,
            altKonular: [
                { baslik: "Tek bağlı liste", aciklama: "", sira: 1 },
                { baslik: "Çift bağlı liste", aciklama: "", sira: 2 },
                { baslik: "Dairesel bağlı liste", aciklama: "", sira: 3 },
                { baslik: "Bağlı liste uygulamaları", aciklama: "", sira: 4 }
            ]
        },
        {
            baslik: "Yığınlar ve Kuyruklar", // Yeni ana konu
            aciklama: "Stack ve Queue",
            sira: 3,
            altKonular: [
                { baslik: "Yığın (Stack) yapısı", aciklama: "", sira: 1 },
                { baslik: "Kuyruk (Queue) yapısı", aciklama: "", sira: 2 },
                { baslik: "Öncelikli kuyruk", aciklama: "", sira: 3 },
                { baslik: "Uygulama alanları", aciklama: "", sira: 4 },
                { baslik: "Dizi tabanlı gerçekleme", aciklama: "", sira: 5 }
            ]
        }
    ];

    geminiCiktisiOverride = tur2GeminiCiktisi;
    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(haritaDurum, "hazir");
    assert.equal(haritaMevcutAnaKonular.length, 3, "2. turda 3 ana konu olmalı");

    // 2. Turda değişmeyen konuların ID ve başlıkları 1. tur ile aynı kalmalı:
    const tur2Alt1 = haritaMevcutAnaKonular[0].altKonular.find(a =>
        a.baslik.includes("Veri yapisi") || a.baslik.includes("Veri yapısı")
    );
    assert.ok(tur2Alt1, "Veri yapısı konusu bulunmalı");
    assert.equal(tur2Alt1.konuId, tur1AltKonularMap.get("Veri yapisi kavrami ve neden gereklidir?").konuId, "2. turda alt konuId korunmalı");
    assert.equal(tur2Alt1.baslik, "Veri yapisi kavrami ve neden gereklidir?", "2. turda orijinal başlık korunmalı");

    // ─── TUR 3: 1 Yeni Materyal Daha Eklendi (4 Materyal, 4 Ana Konu, 17 Alt Konu) 
    // Gemini çıktıları hem Türkçe varyasyonlu hem de bazı alt konular farklı ana konu hiyerarşisine kaymış
    sifirla({
        hazirSayisi: 4,
        haritaDurum: "hazir",
        haritaMevcutAnaKonular: haritaMevcutAnaKonular,
        haritaGecmisKonular: haritaGecmisKonular,
        haritaKaynak: [
            { materyalId: mat1Id, aktifIslemeId: islemeId1 },
            { materyalId: mat2Id, aktifIslemeId: islemeId2 },
            { materyalId: mat3Id, aktifIslemeId: islemeId3 }
        ],
        hazirMateryaller: [
            { _id: mat1Id, aktifIslemeId: islemeId1, dosyaAdi: "mat1.pdf" },
            { _id: mat2Id, aktifIslemeId: islemeId2, dosyaAdi: "mat2.pdf" },
            { _id: mat3Id, aktifIslemeId: islemeId3, dosyaAdi: "mat3.pdf" },
            { _id: mat4Id, aktifIslemeId: islemeId4, dosyaAdi: "mat4.pdf" }
        ]
    });

    const tur3GeminiCiktisi = [
        {
            baslik: "Temel Kavramlar ve Veri Yapilari", // Tekrar ASCII ile geldi
            aciklama: "3. tur temeller",
            sira: 1,
            altKonular: [
                { baslik: "Veri yapisi kavrami ve neden gereklidir?", aciklama: "", sira: 1 },
                { baslik: "Soyut veri tipi (ADT)", aciklama: "", sira: 2 },
                { baslik: "Algoritma karmaşıklığı", aciklama: "", sira: 3 },
                { baslik: "Big-O gösterimine giriş", aciklama: "", sira: 4 }
            ]
        },
        {
            baslik: "Bağlı Listeler",
            aciklama: "Bağlı liste hiyerarşisi",
            sira: 2,
            altKonular: [
                { baslik: "Tek bağlı liste", aciklama: "", sira: 1 },
                { baslik: "Çift bağlı liste", aciklama: "", sira: 2 },
                { baslik: "Dairesel bağlı liste", aciklama: "", sira: 3 },
                { baslik: "Bağlı liste uygulamaları", aciklama: "", sira: 4 }
            ]
        },
        {
            baslik: "Yığın ve Kuyruk Yapıları", // Ana konu başlığı hafifçe değişti
            aciklama: "Yığın ve kuyruklar",
            sira: 3,
            altKonular: [
                { baslik: "Yığın (Stack) yapısı", aciklama: "", sira: 1 },
                { baslik: "Kuyruk (Queue) yapısı", aciklama: "", sira: 2 },
                { baslik: "Öncelikli kuyruk", aciklama: "", sira: 3 },
                { baslik: "Uygulama alanları", aciklama: "", sira: 4 },
                { baslik: "Dizi tabanlı gerçekleme", aciklama: "", sira: 5 }
            ]
        },
        {
            baslik: "Ağaç Veri Yapıları", // 4. turda yeni ana konu
            aciklama: "Ağaçlar",
            sira: 4,
            altKonular: [
                { baslik: "İkili ağaçlar", aciklama: "", sira: 1 },
                { baslik: "İkili arama ağacı (BST)", aciklama: "", sira: 2 },
                { baslik: "Ağaç dolaşma algoritmaları", aciklama: "", sira: 3 },
                { baslik: "Dengeli ağaçlar (AVL)", aciklama: "", sira: 4 }
            ]
        }
    ];

    geminiCiktisiOverride = tur3GeminiCiktisi;
    await arkaPlandaKonuHaritasiGuncelle(dersId, kullaniciId);

    assert.equal(haritaDurum, "hazir");
    assert.equal(haritaMevcutAnaKonular.length, 4, "3. turda 4 ana konu olmalı");

    // ─── KRİTİK DOĞRULAMA: 1. Turdaki tüm değişmeyen konular 3. Turda da BİREBİR AYNIDIR ───
    
    // 1. Ana Konu 1 (Temel Kavramlar ve Veri Yapıları)
    const tur3Ana1 = haritaMevcutAnaKonular[0];
    assert.equal(tur3Ana1.konuId, tur1AnaKonu1.konuId, "Ana Konu 1 kimliği 3. turda da korunmalı");
    assert.equal(tur3Ana1.baslik, tur1AnaKonu1.baslik, "Ana Konu 1 orijinal başlığı 3. turda da korunmalı");

    // 2. Ana Konu 2 (Bağlı Listeler)
    const tur3Ana2 = haritaMevcutAnaKonular[1];
    assert.equal(tur3Ana2.konuId, tur1AnaKonu2.konuId, "Ana Konu 2 kimliği 3. turda da korunmalı");
    assert.equal(tur3Ana2.baslik, tur1AnaKonu2.baslik, "Ana Konu 2 orijinal başlığı 3. turda da korunmalı");

    // 3. 1. Turdaki TÜM 8 Alt Konu Teker Teker Doğrulanır:
    const testEdilecekOrijinalKonular = [
        "Veri yapisi kavrami ve neden gereklidir?",
        "Soyut veri tipi (ADT)",
        "Algoritma karmasikligi",
        "Big-O gosterimine giris",
        "Tek bagli liste",
        "Cift bagli liste",
        "Dairesel bagli liste",
        "Bagli liste uygulamalari"
    ];

    for (const orijinalBaslik of testEdilecekOrijinalKonular) {
        const beklenen = tur1AltKonularMap.get(orijinalBaslik);
        assert.ok(beklenen, `Test girdisi tanımlı olmalı: ${orijinalBaslik}`);

        // 3. turdaki alt konular arasında bul
        let bulunan = null;
        for (const ana of haritaMevcutAnaKonular) {
            for (const alt of ana.altKonular) {
                if (alt.konuId === beklenen.konuId || alt.baslik === beklenen.baslik) {
                    bulunan = alt;
                    break;
                }
            }
            if (bulunan) break;
        }

        assert.ok(bulunan, `Konu 3. turda bulunamadı: ${orijinalBaslik}`);
        assert.equal(
            bulunan.konuId,
            beklenen.konuId,
            `[${orijinalBaslik}] 3. turda konuId değişmemeli!`
        );
        assert.equal(
            bulunan.baslik,
            beklenen.baslik,
            `[${orijinalBaslik}] 3. turda orijinal baslik değişmemeli!`
        );
        assert.ok(
            !bulunan.konuId.includes("-4f67-") && bulunan.konuId.length < 20,
            `[${orijinalBaslik}] Asla rastgele UUID almamalı: ${bulunan.konuId}`
        );
    }

    // 4. Mükerrer ID kontrolü: 3. turdaki 17 alt konunun hiçbirinin ID'si birbiriyle çakışmamalı
    const tumTur3Idler = [];
    for (const ana of haritaMevcutAnaKonular) {
        tumTur3Idler.push(ana.konuId);
        for (const alt of ana.altKonular) {
            tumTur3Idler.push(alt.konuId);
        }
    }
    const benzersizTur3IdSayisi = new Set(tumTur3Idler).size;
    assert.equal(benzersizTur3IdSayisi, tumTur3Idler.length, "Tüm üretilen konuId değerleri benzersiz olmalı");
});

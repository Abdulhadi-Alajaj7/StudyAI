/**
 * konuKimlikEsleme.test.js
 *
 * Konu eşleştirme servisinin 3 gerçek kullanım senaryosu,
 * negatif senaryoları, 1-e-1 eşleme ve bağlam koruma kurallarını
 * izole biçimde test eder.
 */

import test from "node:test";
import assert from "node:assert/strict";
import {
    turkceKarakterleriAsciilestir,
    konuBasliginiNormalizeEt,
    kelimeKokunuBul,
    zitKavramVarMi,
    ayiracOncesiGovdeyiAl,
    semantikEslesmeKontrolu,
    eskiKonuKimliginiBul,
    konuListesiniEsle
} from "../services/konuKimlikEslemeService.js";

// ═══════════════════════════════════════════════════════════════════════════════
// BİRİM DÜZEYİ FONKSİYON TESTLERİ
// ═══════════════════════════════════════════════════════════════════════════════

test("Birim: turkceKarakterleriAsciilestir Türkçe karakterleri ve diyakritikleri normalize eder", () => {
    assert.equal(turkceKarakterleriAsciilestir("İSTANBUL ışık ÇÖĞÜŞ"), "istanbul isik cogus");
    assert.equal(turkceKarakterleriAsciilestir("Veri Yapısı ve Algoritma"), "veri yapisi ve algoritma");
});

test("Birim: konuBasliginiNormalizeEt noktalama ve boşlukları arındırır", () => {
    assert.equal(
        konuBasliginiNormalizeEt("Veri yapısı kavramı ve neden gereklidir?"),
        "veri yapisi kavrami ve neden gereklidir"
    );
    assert.equal(
        konuBasliginiNormalizeEt("Tree terminolojisi: root, leaf, height!"),
        "tree terminolojisi root leaf height"
    );
});

test("Birim: kelimeKokunuBul Türkçe ekleri doğru budar", () => {
    assert.equal(kelimeKokunuBul("gerekliligi"), "gerek");
    assert.equal(kelimeKokunuBul("gereklidir"), "gerek");
    assert.equal(kelimeKokunuBul("yapisi"), "yapi");
    assert.equal(kelimeKokunuBul("kavrami"), "kavram");
    assert.equal(kelimeKokunuBul("yontemleri"), "yontem");
});

test("Birim: zitKavramVarMi zıt kavramları doğru tespit eder", () => {
    assert.equal(zitKavramVarMi("Tek bağlı liste", "Çift bağlı liste"), true);
    assert.equal(zitKavramVarMi("Doğrusal arama", "İkili arama"), true);
    assert.equal(zitKavramVarMi("Stack yapısı", "Queue yapısı"), true);
    assert.equal(zitKavramVarMi("Veri yapısı kavramı", "Veri yapısı gerekliliği"), false);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SENARYO 1: İkinci Materyal Eklendiğinde Soru Biçimi ve Anlamsal Varyasyon
// ═══════════════════════════════════════════════════════════════════════════════

test("Senaryo 1 (Pozitif): 'Veri Yapısı Kavramı ve Gerekliliği' ile 'Veri yapısı kavramı ve neden gereklidir?' eşleşir", () => {
    const eskiKonu = {
        konuId: "sub-8a5a151b",
        baslik: "Veri Yapısı Kavramı ve Gerekliliği",
        aciklama: "Temel veri yapıları kavramı",
        _kaynak: "aktif"
    };

    const yeniKonu = {
        baslik: "Veri yapısı kavramı ve neden gereklidir?",
        aciklama: "Veri yapıları neden gereklidir ve temel kavramlar"
    };

    // semantikEslesmeKontrolu doğrudan doğrulanır
    const semantikUygun = semantikEslesmeKontrolu(yeniKonu, eskiKonu);
    assert.equal(semantikUygun, true, "Soru formu ve morfolojik varyasyon semantik olarak eşleşmeli");

    // eskiKonuKimliginiBul ile ID eşleşmesi
    const eslesenId = eskiKonuKimliginiBul(yeniKonu, [eskiKonu]);
    assert.equal(eslesenId, "sub-8a5a151b", "Eski konuId korunmalı");

    // konuListesiniEsle ile toplu liste eşleşmesi
    const eslesmeler = konuListesiniEsle([yeniKonu], [eskiKonu]);
    const eslesme = eslesmeler.get(yeniKonu);
    assert.ok(eslesme, "Eşleşme haritasında bulunmalı");
    assert.equal(eslesme.eskiId, "sub-8a5a151b");
    assert.equal(eslesme.eskiKonu.baslik, "Veri Yapısı Kavramı ve Gerekliliği", "Eski orijinal başlık korunmalı");
});

// ═══════════════════════════════════════════════════════════════════════════════
// SENARYO 2A: Materyal Silindiğinde Gövde ve Bağlam Eşleşmesi (Tree Terminolojisi)
// ═══════════════════════════════════════════════════════════════════════════════

test("Senaryo 2A (Pozitif): 'Tree terminolojisi: root, leaf, height' ile 'Tree Terminolojisi' bağlam doğrulamasıyla eşleşir", () => {
    const eskiKonu = {
        konuId: "sub-32be614a",
        baslik: "Tree terminolojisi: root, leaf, height",
        aciklama: "Ağaç düğümleri",
        anaBaslik: "Ağaç Veri Yapıları",
        anaKonuId: "top-tree"
    };

    const yeniKonu = {
        baslik: "Tree Terminolojisi",
        aciklama: "Ağaç temel kavramları"
    };

    const baglam = {
        ustKonuBasligi: "Ağaç Veri Yapıları",
        ustKonuId: "top-tree"
    };

    // Aynı üst konu bağlamında eşleşmeli
    const semantikUygun = semantikEslesmeKontrolu(yeniKonu, eskiKonu, baglam);
    assert.equal(semantikUygun, true, "Üst konu bağlamı varken gövde eşleşmeli");

    const eslesenId = eskiKonuKimliginiBul(yeniKonu, [eskiKonu], new Set(), baglam);
    assert.equal(eslesenId, "sub-32be614a", "Eski konuId korunmalı");
});

test("Senaryo 2A (Pozitif - Açıklama Kanıtı): Farklı üst konu olsa bile açıklamada kavramlar varsa eşleşir", () => {
    const eskiKonu = {
        konuId: "sub-32be614a",
        baslik: "Tree terminolojisi: root, leaf, height",
        aciklama: "",
        anaBaslik: "Ağaçlar"
    };

    const yeniKonu = {
        baslik: "Tree Terminolojisi",
        aciklama: "Ağaç yapısında root, leaf ve height kavramlarının detayları"
    };

    const baglam = {
        ustKonuBasligi: "Gelişmiş Veri Yapıları"
    };

    const semantikUygun = semantikEslesmeKontrolu(yeniKonu, eskiKonu, baglam);
    assert.equal(semantikUygun, true, "Açıklamada root, leaf, height desteği varsa eşleşmeli");
});

test("Senaryo 2A (Negatif - Bağlam Yetersiz): 'Tree Terminolojisi' bağlam veya açıklama desteği yoksa REDDEDİLMELİ", () => {
    const eskiKonu = {
        konuId: "sub-32be614a",
        baslik: "Tree terminolojisi: root, leaf, height",
        aciklama: "",
        anaBaslik: "Ağaçlar"
    };

    const yeniKonu = {
        baslik: "Tree Terminolojisi",
        aciklama: "Genel terminolojiye giriş ve tanımlar" // root, leaf, height YOK
    };

    const baglam = {
        ustKonuBasligi: "Graf Teorisi" // Üst konu tamamen farklı
    };

    const semantikUygun = semantikEslesmeKontrolu(yeniKonu, eskiKonu, baglam);
    assert.equal(semantikUygun, false, "Bağlam yetersiz olduğunda eşleştirme kesinlikle reddedilmeli");

    const eslesenId = eskiKonuKimliginiBul(yeniKonu, [eskiKonu], new Set(), baglam);
    assert.equal(eslesenId, null, "Kimlik eşleşmesi gerçekleşmemeli (yeni kimlik üretilmeli)");
});

// ═══════════════════════════════════════════════════════════════════════════════
// SENARYO 2B: Belirleyici Teknik Terim Grubu (Preorder, Inorder, Postorder)
// ═══════════════════════════════════════════════════════════════════════════════

test("Senaryo 2B (Pozitif): Açıklamada preorder, inorder, postorder yöntemleri açıkça destekleniyorsa eşleşir", () => {
    const eskiKonu = {
        konuId: "sub-1319e875",
        baslik: "Preorder, inorder, postorder dolaşma",
        aciklama: "Ağaç dolaşma algoritmaları",
        anaBaslik: "Ağaçlar"
    };

    const yeniKonu = {
        baslik: "Ağaç Dolaşma Yöntemleri",
        aciklama: "Ağaç veri yapısında preorder, inorder ve postorder dolaşma yöntemleri uygulanır."
    };

    const baglam = {
        ustKonuBasligi: "Ağaçlar"
    };

    const semantikUygun = semantikEslesmeKontrolu(yeniKonu, eskiKonu, baglam);
    assert.equal(semantikUygun, true, "Açıklamada 3 dolaşma yöntemi açıkça destekleniyorsa eşleşmeli");

    const eslesenId = eskiKonuKimliginiBul(yeniKonu, [eskiKonu], new Set(), baglam);
    assert.equal(eslesenId, "sub-1319e875", "Eski konuId korunmalı");
});

test("Senaryo 2B (Negatif - Kanıt Yok): Açıklamada 3 yöntem açıkça desteklenmiyorsa eşleştirme REDDEDİLMELİ", () => {
    const eskiKonu = {
        konuId: "sub-1319e875",
        baslik: "Preorder, inorder, postorder dolaşma",
        aciklama: "Dolaşma algoritmaları",
        anaBaslik: "Ağaçlar"
    };

    const yeniKonu = {
        baslik: "Ağaç Dolaşma Yöntemleri",
        aciklama: "Ağaç üzerinde derinlemesine ve genişlemesine gezinti yöntemleri." // preorder, inorder, postorder YOK
    };

    const baglam = {
        ustKonuBasligi: "Ağaçlar"
    };

    const semantikUygun = semantikEslesmeKontrolu(yeniKonu, eskiKonu, baglam);
    assert.equal(semantikUygun, false, "Açıklamada kanıt yoksa tahminle eşleştirme yapılmamalı");

    const eslesenId = eskiKonuKimliginiBul(yeniKonu, [eskiKonu], new Set(), baglam);
    assert.equal(eslesenId, null, "Kanıt yokluğunda null dönmeli");
});

// ═══════════════════════════════════════════════════════════════════════════════
// NEGATİF TESTLER: Farklı Konuların Yanlışlıkla Eşleşmemesi
// ═══════════════════════════════════════════════════════════════════════════════

test("Negatif Test: 'Tek bağlı liste' ile 'Çift bağlı liste' ASLA eşleşmemeli", () => {
    const eskiKonu = { konuId: "sub-tek", baslik: "Tek bağlı liste" };
    const yeniKonu = { baslik: "Çift bağlı liste" };

    assert.equal(semantikEslesmeKontrolu(yeniKonu, eskiKonu), false);
    assert.equal(eskiKonuKimliginiBul(yeniKonu, [eskiKonu]), null);
});

test("Negatif Test: 'Doğrusal arama' ile 'İkili arama' ASLA eşleşmemeli", () => {
    const eskiKonu = { konuId: "sub-lin", baslik: "Doğrusal Arama (Linear Search)" };
    const yeniKonu = { baslik: "İkili Arama (Binary Search)" };

    assert.equal(semantikEslesmeKontrolu(yeniKonu, eskiKonu), false);
    assert.equal(eskiKonuKimliginiBul(yeniKonu, [eskiKonu]), null);
});

test("Negatif Test: 'Stack (Yığın)' ile 'Queue (Kuyruk)' ASLA eşleşmemeli", () => {
    const eskiKonu = { konuId: "sub-stk", baslik: "Yığın (Stack) Yapısı" };
    const yeniKonu = { baslik: "Kuyruk (Queue) Yapısı" };

    assert.equal(semantikEslesmeKontrolu(yeniKonu, eskiKonu), false);
    assert.equal(eskiKonuKimliginiBul(yeniKonu, [eskiKonu]), null);
});

test("Negatif Test: 'Bağlı Liste' ile 'Dizi' ASLA eşleşmemeli", () => {
    const eskiKonu = { konuId: "sub-list", baslik: "Bağlı Liste Yapısı" };
    const yeniKonu = { baslik: "Dizi Yapısı" };

    assert.equal(semantikEslesmeKontrolu(yeniKonu, eskiKonu), false);
    assert.equal(eskiKonuKimliginiBul(yeniKonu, [eskiKonu]), null);
});

test("Negatif Test: 'İkili Arama Ağacı' ile 'AVL Ağacı' ASLA eşleşmemeli", () => {
    const eskiKonu = { konuId: "sub-bst", baslik: "İkili Arama Ağacı (BST)" };
    const yeniKonu = { baslik: "Dengeli Ağaçlar (AVL)" };

    assert.equal(semantikEslesmeKontrolu(yeniKonu, eskiKonu), false);
    assert.equal(eskiKonuKimliginiBul(yeniKonu, [eskiKonu]), null);
});

test("Negatif Test: 'Doğrusal Veri Yapıları' ile 'Ağaç Veri Yapıları' ASLA eşleşmemeli", () => {
    const eskiKonu = { konuId: "top-dog", baslik: "Doğrusal Veri Yapıları" };
    const yeniKonu = { baslik: "Ağaç Veri Yapıları" };

    assert.equal(semantikEslesmeKontrolu(yeniKonu, eskiKonu), false);
    assert.equal(eskiKonuKimliginiBul(yeniKonu, [eskiKonu]), null);
});

// ═══════════════════════════════════════════════════════════════════════════════
// 1-E-1 BİJECTİON VE ÇAKIŞMA / BELİRSİZLİK GÜVENLİK TESTLERİ
// ═══════════════════════════════════════════════════════════════════════════════

test("Güvenlik: Çakışma durumunda (2 yeni konu aynı eski konuya talipse) her iki yeni konuya da eşleşme reddedilir", () => {
    const eskiKonu = {
        konuId: "sub-ortak",
        baslik: "Veri Yapısı Kavramı ve Gerekliliği"
    };

    // İki yeni konu da aynı eski konuya aday olacak biçimde anlam varyasyonuna sahip:
    const yeniKonu1 = { baslik: "Veri yapısı kavramı ve neden gereklidir?" };
    const yeniKonu2 = { baslik: "Veri yapısı kavramı ve gerekliliği nasıldır?" };

    const eslesmeler = konuListesiniEsle([yeniKonu1, yeniKonu2], [eskiKonu]);

    // Requirement 6: Çakışma veya belirsizlik durumunda yeni kimlik üretilir (eski ID paylaşılmaz)
    assert.equal(eslesmeler.has(yeniKonu1), false, "Çakışmada yeniKonu1 eski ID'yi almamalı");
    assert.equal(eslesmeler.has(yeniKonu2), false, "Çakışmada yeniKonu2 eski ID'yi almamalı");
});

test("Güvenlik: Bir eski konu asla birden fazla yeni konuya bağlanamaz (1-e-1 garantisi)", () => {
    const eskiKonular = [
        { konuId: "sub-1", baslik: "Tek bağlı liste" },
        { konuId: "sub-2", baslik: "Çift bağlı liste" }
    ];

    const yeniKonular = [
        { baslik: "Tek bağlı liste" },
        { baslik: "Tek bağlı liste varyasyonu" }
    ];

    const eslesmeler = konuListesiniEsle(yeniKonular, eskiKonular);
    assert.equal(eslesmeler.size, 1, "Sadece tam eşleşen 1 konu bağlanmalı");

    const eslesen = eslesmeler.get(yeniKonular[0]);
    assert.equal(eslesen.eskiId, "sub-1");
    assert.equal(eslesmeler.has(yeniKonular[1]), false, "İkinci konu aynı ID'yi alamaz");
});

// ═══════════════════════════════════════════════════════════════════════════════
// SENARYO 3: Gerçek Tarayıcı Regresyon Testi
// Gözlem: "Veri Yapısı Kavramı ve Gerekliliği" (sub-bc61f62b) konusu,
// üçüncü materyal ("Stack ve Queue") silindiğinde konuId'si sub-36ef12aa'ya
// değişti. Başlık da "Veri Yapısı Kavramı ve Gereksinimi" olarak yeniden
// üretildi. Bu iki başlık aynı öğrenme hedefini temsil ediyor.
// ═══════════════════════════════════════════════════════════════════════════════

test("Regresyon (Senaryo 3 - ÖNCE HATA): 'Gerekliliği' ↔ 'Gereksinimi' eşleşmeden ÖNCE semantikEslesmeKontrolu false dönerdi", () => {
    // Bu test, düzeltme uygulanmadan önceki başarısızlığı belgeler.
    // kelimeKokunuBul("gerekliligi") = "gerek"   (liligi kuralıyla)
    // kelimeKokunuBul("gereksinimi") = "gereksin" (imi kuralıyla)
    // Bu iki farklı kök kesişmediğinden Jaccard = 3/5 = 0.60 < 0.75 olurdu.
    // Düzeltme sonrası bu test GEÇMELİ (semantik true dönmeli).
    const eskiKonu = {
        konuId: "sub-bc61f62b",
        baslik: "Veri Yapısı Kavramı ve Gerekliliği",
        aciklama: "Veri yapısı kavramını ve neden gerekli olduğunu açıklar.",
        _kaynak: "aktif"
    };
    const yeniKonu = {
        baslik: "Veri Yapısı Kavramı ve Gereksinimi",
        aciklama: "Veri yapısı kavramı ve temel gereksinimi üzerine."
    };

    const semantik = semantikEslesmeKontrolu(yeniKonu, eskiKonu);
    assert.equal(
        semantik, true,
        "'Gerekliliği' ve 'Gereksinimi' aynı anlama gelir; semantik eşleşme true dönmeli"
    );

    const eslesenId = eskiKonuKimliginiBul(yeniKonu, [eskiKonu]);
    assert.equal(
        eslesenId, "sub-bc61f62b",
        "sub-bc61f62b ID'si korunmalı; materyal değişimi kimliği bozmamalı"
    );
});

test("Regresyon (Senaryo 3 - konuListesiniEsle): Gerçek silme senaryosunda birinci konunun kimliği korunur", () => {
    // Dört materyal ekli iken üçüncü materyal ("Stack ve Queue") silindi.
    // Birinci materyalin konusu "Gerekliliği" → "Gereksinimi" olarak yeniden üretildi.
    // Bu eşleşme bulunabilmeli; ID sub-bc61f62b korunmalı.
    const eskiKonu = {
        konuId: "sub-bc61f62b",
        baslik: "Veri Yapısı Kavramı ve Gerekliliği",
        aciklama: "Veri yapısı kavramını ve neden gerekli olduğunu açıklar.",
        _kaynak: "aktif"
    };
    const yeniKonu = {
        baslik: "Veri Yapısı Kavramı ve Gereksinimi",
        aciklama: "Veri yapısı kavramı ve temel gereksinimi üzerine."
    };

    const eslesmeler = konuListesiniEsle([yeniKonu], [eskiKonu]);
    const eslesme = eslesmeler.get(yeniKonu);

    assert.ok(eslesme, "Eşleşme haritasında bulunmalı");
    assert.equal(eslesme.eskiId, "sub-bc61f62b", "Eski konuId korunmalı");
    assert.equal(
        eslesme.eskiKonu.baslik,
        "Veri Yapısı Kavramı ve Gerekliliği",
        "Orijinal başlık korunmalı"
    );
});

test("Negatif (Senaryo 3): Gerçekten farklı konular 'gerek' öneki nedeniyle yanlış eşleşmemeli", () => {
    // "Gereksinim Mühendisliği" ile "Gerekliliği" farklı konular.
    // Ancak bu başlıkta zaten başka ortak kökler yok; eşleşmemeli.
    const eskiKonu = {
        konuId: "sub-bc61f62b",
        baslik: "Veri Yapısı Kavramı ve Gerekliliği",
        aciklama: "Veri yapısı kavramını açıklar."
    };
    const yeniKonu = {
        baslik: "Gereksinim Mühendisliği ve Analizi",
        aciklama: "Yazılım gereksinimlerinin toplanması ve analiz edilmesi."
    };

    const semantik = semantikEslesmeKontrolu(yeniKonu, eskiKonu);
    assert.equal(
        semantik, false,
        "Anlam farklılığı yeterince büyük; yanlış eşleşme olmamalı"
    );
    assert.equal(eskiKonuKimliginiBul(yeniKonu, [eskiKonu]), null);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SENARYO 4: Kimlik Kararlılığı — Silinen Materyalle İlgisi Olmayan Konular
// Gözlem: Üçüncü materyal silindiğinde 11 konunun ID'si korundu; yalnızca
// birinci materyalin tek konusu yeniden eşleşemedi (Senaryo 3).
// Bu test, silme işleminin doğrudan kaynağı olmayan konuların ID'lerini
// koruyacağını garanti eder.
// ═══════════════════════════════════════════════════════════════════════════════

test("Kararlılık (Senaryo 4): Silinen materyalle ilgisi olmayan konuların kimliği değişmez", () => {
    // Birinci materyalden kalan 2 konu (Stack/Queue silinmesinin DOĞRUDAN kaynağı değil)
    // Dördüncü materyalden kalan 3 konu (stack/queue silinmesiyle hiç ilgisi yok)
    const eskiKonular = [
        {
            konuId: "sub-aa001",
            baslik: "Dizi (Array) Veri Yapısı",
            aciklama: "Dizilerin tanımı ve kullanımı.",
            _kaynak: "aktif"
        },
        {
            konuId: "sub-aa002",
            baslik: "Bağlı Liste Yapısı",
            aciklama: "Tek ve çift yönlü bağlı listeler.",
            _kaynak: "aktif"
        },
        {
            konuId: "sub-dd001",
            baslik: "Ağaç Veri Yapısı",
            aciklama: "İkili ağaç ve BST kavramları.",
            _kaynak: "aktif"
        },
        {
            konuId: "sub-dd002",
            baslik: "Graf Veri Yapısı",
            aciklama: "Yönlü ve yönsüz graflar.",
            _kaynak: "aktif"
        },
        {
            konuId: "sub-dd003",
            baslik: "Hash Tablosu",
            aciklama: "Hash fonksiyonları ve çakışma çözümü.",
            _kaynak: "aktif"
        }
    ];

    // Üçüncü materyal silindi; kaynakları değişmeyen bu 5 konunun yeni başlıkları
    // tamamen aynı (Aşama 1: kesin eşleşme bekleniyor).
    const yeniKonular = eskiKonular.map((k) => ({
        baslik: k.baslik,
        aciklama: k.aciklama
    }));

    const eslesmeler = konuListesiniEsle(yeniKonular, eskiKonular);

    assert.equal(eslesmeler.size, 5, "Tüm 5 konu eşleşmeli");

    for (let i = 0; i < yeniKonular.length; i++) {
        const eslesme = eslesmeler.get(yeniKonular[i]);
        assert.ok(eslesme, `Konu ${i + 1} eşleşme haritasında bulunmalı`);
        assert.equal(
            eslesme.eskiId,
            eskiKonular[i].konuId,
            `Konu ${i + 1} kimliği (${eskiKonular[i].konuId}) korunmalı`
        );
    }
});

test("Kararlılık (Senaryo 4 - Semantik Varyasyon): Başlık küçük tipografik varyasyonla gelirse kimlik korunur", () => {
    // Küçük Türkçe karakter/noktalama farkı olan başlıklar hâlâ eşleşmeli.
    const eskiKonu = {
        konuId: "sub-stable-01",
        baslik: "Algoritma Karmaşıklığı ve Big-O Notasyonu",
        aciklama: "Zaman ve alan karmaşıklığı analizi.",
        _kaynak: "aktif"
    };
    const yeniKonu = {
        baslik: "Algoritma Karmaşıklığı ve Big O Notasyonu", // tire eksik
        aciklama: "Zaman ve alan karmaşıklığı analizi."
    };

    const eslesenId = eskiKonuKimliginiBul(yeniKonu, [eskiKonu]);
    assert.equal(
        eslesenId, "sub-stable-01",
        "Tire/noktalama farkı kimlik değişikliğine yol açmamalı"
    );
});

// ═══════════════════════════════════════════════════════════════════════════════
// SENARYO 5: Başlık Sıkıştırma (Title Compression) Regresyonu
//
// Gözlem (Gerçek Tarayıcı): "Ekleme, Silme ve Arama İşlemleri" (sub-f8d4f709)
// başlıklı konu, üçüncü materyal silinince Gemini tarafından "Temel İşlemler"
// olarak yeniden adlandırıldı ve açıklamaya taşındı → yeni ID sub-4225c351 aldı.
//
// Kök neden: Jaccard(baslik vs baslik) = 1/5 = 0.20 < 0.75 (eşiğin çok altında).
// Oysa eski başlığın TÜM kökleri (ekleme, silme, arama, islem) yeni konunun
// AÇIKLAMASINDA birebir mevcut. Bu, "başlık sıkıştırma" örüntüsüdür.
//
// Güvenlik: başlıklar arasında en az 1 ortak kök zorunlu (bağlam filtresi),
//           eski başlıkta en az 3 ayırt edici kök olmalı (başlık yeterince spesifik),
//           açıklamada en az 3 eski kök bulunmalı (kanıt eşiği).
// ═══════════════════════════════════════════════════════════════════════════════

test("Regresyon (Senaryo 5 - ÖNCE HATA): 'Temel İşlemler' açıklamasında eski başlık kökleri varsa eşleşir", () => {
    // MEVCUT KODDA BU TEST BAŞARISIZ OLMALIDIR:
    // kelimeKokunuBul tabanlı Jaccard("Temel İşlemler", "Ekleme, Silme ve Arama İşlemleri") = 1/5 = 0.20
    // Eşik 0.75'in çok altında → semantikEslesmeKontrolu false döner.
    // Düzeltme sonrası: eski başlık kökleri yeni açıklamada bulunuyor → true dönmeli.
    const eskiKonu = {
        konuId: "sub-f8d4f709",
        baslik: "Ekleme, Silme ve Arama İşlemleri",
        aciklama: "Veri yapıları üzerinde ekleme, silme ve arama işlemlerinin nasıl gerçekleştirileceği.",
        _kaynak: "aktif"
    };
    const yeniKonu = {
        baslik: "Temel İşlemler",
        aciklama: "Veri yapıları üzerinde ekleme, silme ve arama işlemleri."
    };

    const semantik = semantikEslesmeKontrolu(yeniKonu, eskiKonu);
    assert.equal(
        semantik, true,
        "'Temel İşlemler' açıklamasında eski başlığın kökleri varsa semantik eşleşme true dönmeli"
    );

    const eslesenId = eskiKonuKimliginiBul(yeniKonu, [eskiKonu]);
    assert.equal(
        eslesenId, "sub-f8d4f709",
        "sub-f8d4f709 ID'si korunmalı; materyal silme kimliği bozmamalı"
    );
});

test("Regresyon (Senaryo 5 - konuListesiniEsle): Gerçek silme senaryosunda ikinci materyal konusunun kimliği korunur", () => {
    // Dört materyal ekli → üçüncü materyal silinince Gemini "Temel İşlemler" üretiyor.
    // İkinci materyale ait "Ekleme, Silme ve Arama İşlemleri" konusunun ID'si korunmalı.
    const eskiKonu = {
        konuId: "sub-f8d4f709",
        baslik: "Ekleme, Silme ve Arama İşlemleri",
        aciklama: "Veri yapıları üzerinde ekleme, silme ve arama işlemlerinin nasıl gerçekleştirileceği.",
        _kaynak: "aktif"
    };
    const yeniKonu = {
        baslik: "Temel İşlemler",
        aciklama: "Veri yapıları üzerinde ekleme, silme ve arama işlemleri."
    };

    const eslesmeler = konuListesiniEsle([yeniKonu], [eskiKonu]);
    const eslesme = eslesmeler.get(yeniKonu);

    assert.ok(eslesme, "Eşleşme haritasında bulunmalı");
    assert.equal(eslesme.eskiId, "sub-f8d4f709", "Eski konuId korunmalı");
    assert.equal(
        eslesme.eskiKonu.baslik,
        "Ekleme, Silme ve Arama İşlemleri",
        "Orijinal başlık korunmalı"
    );
});

test("Regresyon (Senaryo 5 - Üçüncü Aşama): Detaylı başlık tekrar gelince orijinal ID gecmisKonular'dan geri döner", () => {
    // Birinci materyal de silinince Gemini tekrar "Ekleme, Silme ve Arama Islemleri" üretiyor.
    // Bu konu gecmisKonular'a taşınmış olsa da orijinal ID sub-f8d4f709 korunmalı.
    const gecmisKonu = {
        konuId: "sub-f8d4f709",
        baslik: "Ekleme, Silme ve Arama İşlemleri",
        aciklama: "Veri yapıları üzerinde ekleme, silme ve arama işlemlerinin nasıl gerçekleştirileceği.",
        _kaynak: "gecmis"
    };
    // Mevcut aktif konu "Temel İşlemler" olarak gözüküyor (farklı ID)
    const aktifKonu = {
        konuId: "sub-4225c351",
        baslik: "Temel İşlemler",
        aciklama: "Veri yapıları üzerinde ekleme, silme ve arama işlemleri.",
        _kaynak: "aktif"
    };
    // Yeni analiz detaylı başlık döndürüyor
    const yeniKonu = {
        baslik: "Ekleme, Silme ve Arama Islemleri", // ASCII varyasyon
        aciklama: "Veri yapıları üzerinde ekleme, silme ve arama işlemlerinin uygulanması."
    };

    // Hem aktif hem gecmis havuzu var; aktif havuzda sub-4225c351 var (farklı başlık),
    // gecmis havuzunda sub-f8d4f709 var (eşleşen başlık)
    const kullanilanKimlikler = new Set();
    const eslesmeler = konuListesiniEsle([yeniKonu], [aktifKonu], [gecmisKonu], kullanilanKimlikler);
    const eslesme = eslesmeler.get(yeniKonu);

    assert.ok(eslesme, "Eşleşme gecmisKonular'dan yapılmalı");
    assert.equal(eslesme.eskiId, "sub-f8d4f709", "Orijinal sub-f8d4f709 ID'si geri kazanılmalı");
});

test("Negatif (Senaryo 5): Farklı konudaki 'Temel İşlemler' (SQL işlemleri) yanlış eşleşmemeli", () => {
    // "Ekleme, Silme ve Arama İşlemleri" (Veri Yapıları dersi) ile
    // SQL konulu "Temel İşlemler" (SELECT, INSERT, DELETE) eşleşmemeli.
    // Açıklamada eskiBaslik kökleri (ekleme, silme, arama) bulunmuyor.
    const eskiKonu = {
        konuId: "sub-f8d4f709",
        baslik: "Ekleme, Silme ve Arama İşlemleri",
        aciklama: "Veri yapıları üzerinde ekleme, silme ve arama işlemlerinin nasıl gerçekleştirileceği.",
        _kaynak: "aktif"
    };
    const yeniKonuSQL = {
        baslik: "Temel İşlemler",
        aciklama: "SELECT, INSERT, UPDATE ve DELETE sorguları ile veritabanı temel işlemleri."
    };

    const semantik = semantikEslesmeKontrolu(yeniKonuSQL, eskiKonu);
    assert.equal(
        semantik, false,
        "SQL konulu 'Temel İşlemler' Veri Yapıları konusuyla eşleşmemeli"
    );
    assert.equal(eskiKonuKimliginiBul(yeniKonuSQL, [eskiKonu]), null);
});

test("Negatif (Senaryo 5): Başlık ortaklaması olmayan konular açıklama kanıtıyla bile eşleşmemeli", () => {
    // Başlıklar arasında hiç ortak kök yok → açıklama kanıtı tek başına yeterli olmamalı.
    // "Bellek Yönetimi" vs "Temel Kavramlar" → başlık kökleri: {bellek, yonet} vs {temel, kavram}
    // Kesisim = 0; bağlam filtresi geçilemez → eşleşmemeli.
    const eskiKonu = {
        konuId: "sub-mem-001",
        baslik: "Bellek Yönetimi ve Tahsis",
        aciklama: "Dinamik bellek yönetimi, malloc ve free fonksiyonları.",
        _kaynak: "aktif"
    };
    const yeniKonu = {
        baslik: "Temel Kavramlar",
        aciklama: "Bellek yönetimi, tahsis ve dinamik bellek işlemleri." // eskiBaslik kökleri var
    };

    const semantik = semantikEslesmeKontrolu(yeniKonu, eskiKonu);
    assert.equal(
        semantik, false,
        "Başlık bağlam filtresi (kesisimSayisi >= 1) sağlanmadan açıklama kanıtı tek başına yeterli olmamalı"
    );
    assert.equal(eskiKonuKimliginiBul(yeniKonu, [eskiKonu]), null);
});



test("Regresyon: ADT başlığı ile ADT Tanımı aynı konuyu temsil eder", () => {
    const eskiKonular = [{
        konuId: "adt-eski-id",
        baslik: "Soyut Veri Tipi (ADT)",
        aciklama: "Abstract Data Type kavramı",
        anaBaslik: "Veri Yapıları"
    }];

    const yeniKonular = [{
        baslik: "Soyut Veri Tipi (ADT) Tanımı",
        aciklama: "Abstract Data Type kavramının tanımı"
    }];

    const eslesmeler = konuListesiniEsle(
        yeniKonular,
        eskiKonular,
        [],
        new Set(),
        { ustKonuBasligi: "Veri Yapıları" }
    );

    assert.equal(
        eslesmeler.get(yeniKonular[0])?.eskiId,
        "adt-eski-id",
        "ADT Tanımı için yeni konuId üretilmemeli"
    );
});

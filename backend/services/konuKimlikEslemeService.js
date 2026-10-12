/**
 * konuKimlikEslemeService.js
 *
 * Konu başlıklarının Türkçe karakter, noktalama, kelime sırası, soru biçimleri
 * ve anlamı koruyan yeniden ifadelerine karşı dayanıklı biçimde normalize
 * edilmesini ve eski-yeni konular arasında güvenli, tekil (1-e-1) kimlik (konuId)
 * ve başlık (baslik) sürekliliğinin korunmasını sağlar.
 */

/**
 * Türkçe stop-words ve bağlaçlar
 */
export const DURAK_KELIMELER = new Set([
    "ve", "ile", "veya", "ya", "da", "de", "icin", "neden", "nasil", "ne",
    "nedir", "nelerdir", "hakkinda", "genel", "bir", "cok", "ise", "gibi"
]);

/**
 * Zıt / çakışan kavram çiftleri.
 * Eğer bir başlıkta A, diğerinde B varsa bu konular ASLA eşleştirilemez.
 */
export const ZIT_KAVRAMLAR = [
    ["tek", "cift"],
    ["dogrusal", "ikili"],
    ["linear", "binary"],
    ["yigin", "kuyruk"],
    ["stack", "queue"],
    ["en kucuk", "en buyuk"],
    ["min", "max"],
    ["oncelikli", "dairesel"]
];

/**
 * Belirleyici teknik terim grupları (bağlam/açıklama desteğiyle eşleştirilen özel kavramlar)
 */
export const AYIRICI_TEKNIK_TERIMLER = [
    ["preorder", "inorder", "postorder"],
    ["bfs", "dfs"],
    ["push", "pop"],
    ["enqueue", "dequeue"]
];

/**
 * Türkçe karakterleri, diyakritikleri ve büyük/küçük harf varyasyonlarını
 * güvenli eşleştirme için ASCII taban formuna normalize eder.
 * Veritabanındaki gerçek başlıkları değiştirmez.
 */
export const turkceKarakterleriAsciilestir = (metin = "") => {
    return String(metin)
        .replace(/İ/g, "i")
        .replace(/I/g, "ı")
        .toLocaleLowerCase("tr-TR")
        .replace(/ç/g, "c")
        .replace(/ğ/g, "g")
        .replace(/ı/g, "i")
        .replace(/ö/g, "o")
        .replace(/ş/g, "s")
        .replace(/ü/g, "u")
        .replace(/â/g, "a")
        .replace(/î/g, "i")
        .replace(/û/g, "u");
};

/**
 * Konu başlıklarını kesin karşılaştırma için normalize eder.
 * Örneğin:
 *   "Veri yapisi kavrami ve neden gereklidir?" ile
 *   "Veri yapısı kavramı ve neden gereklidir?"
 * her ikisi de "veri yapisi kavrami ve neden gereklidir" biçimine indirgenir.
 */
export const konuBasliginiNormalizeEt = (baslik = "") => {
    if (!baslik) return "";
    const asciilestirilmis = turkceKarakterleriAsciilestir(baslik);
    return asciilestirilmis
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
};

/**
 * Türkçe kelimelerdeki yaygın isim/fiil/çoğul eklerini hafifçe budayarak
 * semantik kökü elde eder.
 */
export const kelimeKokunuBul = (kelime = "") => {
    let k = String(kelime).toLowerCase();
    if (k.length <= 3) return k;

    // Soru / niteleme ekleri
    if (k.endsWith("lidirler")) return k.slice(0, -8);
    if (k.endsWith("lidir")) return k.slice(0, -5);
    if (k.endsWith("liligi")) return k.slice(0, -6);
    if (k.endsWith("lilik")) return k.slice(0, -5);
    if (k.endsWith("likleri")) return k.slice(0, -7);
    if (k.endsWith("ligi")) return k.slice(0, -4);
    if (k.endsWith("lik")) return k.slice(0, -3);

    // Çoğul ekleri
    if (k.endsWith("leri") || k.endsWith("lari")) return k.slice(0, -4);
    if (k.endsWith("ler") || k.endsWith("lar")) return k.slice(0, -3);

    // Eylem / isim fiil ekleri
    if (k.endsWith("ilmesi") || k.endsWith("ilmasi")) return k.slice(0, -6);
    if (k.endsWith("ilisi")) return k.slice(0, -5);
    if (k.endsWith("mesi") || k.endsWith("masi")) return k.slice(0, -4);
    if (k.endsWith("imi") || k.endsWith("umu")) return k.slice(0, -3);

    // İyelik / tamlanan ekleri (yapisi -> yapi, kavrami -> kavram)
    if (k.endsWith("si") || k.endsWith("su")) return k.slice(0, -2);
    if (k.length > 4 && (k.endsWith("i") || k.endsWith("u"))) return k.slice(0, -1);

    return k;
};

/**
 * Bir metindeki durak kelimeleri ayıklar ve anlamlı kökleri küme olarak döner.
 */
export const metinKokleriniCikar = (metin = "") => {
    const norm = turkceKarakterleriAsciilestir(metin);
    const hamKelimeler = norm
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .split(/\s+/)
        .filter((k) => k.length > 0 && !DURAK_KELIMELER.has(k));

    return new Set(hamKelimeler.map((k) => kelimeKokunuBul(k)));
};

/**
 * İki morfolojik kökün anlamsal olarak örtüşüp örtüşmediğini belirler.
 *
 * Türkçe'de aynı kavramı farklı yapım ekleriyle ifade eden kelimeler
 * (ör. "gerekliligi" → kök "gerek", "gereksinimi" → kök "gereksin")
 * farklı kök dizelerine sahip olabilir.
 *
 * Kural: a köküyle b kökünden biri diğerinin önekiyse (en az MIN_ONEK_UZUNLUK
 * karakter), bu iki kök aynı kavramı temsil ediyor sayılır.
 * Böylece:
 *   - "gerek" vs "gereksin" → "gerek" ≤ "gereksin" öneki, uzunluk 5 ≥ 5 → eşleşir
 *   - "ver"   vs "veri"     → 3 < 5 → eşleşmez (çok kısa önek, çok genel)
 *   - "stack" vs "stackover" → olası yanlış pozitif yok çünkü ZIT_KAVRAMLAR önce çalışır
 *
 * @param {string} kokA
 * @param {string} kokB
 * @returns {boolean}
 */
const MIN_ONEK_UZUNLUK = 5;
export const koklerEslesiyorMu = (kokA, kokB) => {
    if (kokA === kokB) return true;
    if (!kokA || !kokB) return false;
    // Kısa olan kökün uzunluğunu kontrol et
    const kisa = kokA.length <= kokB.length ? kokA : kokB;
    const uzun = kokA.length <= kokB.length ? kokB : kokA;
    return kisa.length >= MIN_ONEK_UZUNLUK && uzun.startsWith(kisa);
};

/**
 * İki metin arasında zıt / çatışan kavram var mı kontrol eder.
 */
export const zitKavramVarMi = (metin1 = "", metin2 = "") => {
    const norm1 = turkceKarakterleriAsciilestir(metin1);
    const norm2 = turkceKarakterleriAsciilestir(metin2);

    for (const [z1, z2] of ZIT_KAVRAMLAR) {
        const m1HasZ1 = new RegExp(`\\b${z1}\\b`, "i").test(norm1);
        const m1HasZ2 = new RegExp(`\\b${z2}\\b`, "i").test(norm1);
        const m2HasZ1 = new RegExp(`\\b${z1}\\b`, "i").test(norm2);
        const m2HasZ2 = new RegExp(`\\b${z2}\\b`, "i").test(norm2);

        if ((m1HasZ1 && m2HasZ2) || (m1HasZ2 && m2HasZ1)) {
            return true;
        }
    }
    return false;
};

/**
 * Başlıktaki ayraç (iki nokta, tire, parantez) öncesi ana gövdeyi döner.
 */
export const ayiracOncesiGovdeyiAl = (baslik = "") => {
    const parca = String(baslik).split(/[:\-\(–—]/)[0];
    return konuBasliginiNormalizeEt(parca);
};

/**
 * İki konu arasında Aşama 2 yüksek güvenli semantik ve bağlamsal eşleşmeyi doğrular.
 *
 * @param {Object} yeniKonu - { baslik, aciklama }
 * @param {Object} eskiKonu - { baslik, aciklama, anaBaslik, anaKonuId }
 * @param {Object} baglam - { ustKonuBasligi, ustKonuId }
 * @returns {boolean}
 */
export const semantikEslesmeKontrolu = (yeniKonu, eskiKonu, baglam = {}) => {
    const baslikYeni = yeniKonu?.baslik || "";
    const baslikEski = eskiKonu?.baslik || "";

    // 1. Zıt kavram kontrolü: tek vs çift, doğrusal vs ikili gibi çatışan kavramlar varsa ASLA eşleşemez
    if (zitKavramVarMi(baslikYeni, baslikEski)) {
        return false;
    }

    // 2. Ayraç öncesi gövde eşleşmesi (Örn: "Tree terminolojisi: root, leaf, height" vs "Tree Terminolojisi")
    const govdeYeni = ayiracOncesiGovdeyiAl(baslikYeni);
    const govdeEski = ayiracOncesiGovdeyiAl(baslikEski);

    if (govdeYeni && govdeEski && govdeYeni === govdeEski) {
        const ayiracVar = /[:\-\(–—]/.test(baslikYeni) || /[:\-\(–—]/.test(baslikEski);
        if (ayiracVar) {
            // Gövde aynı ise bağlam doğrulaması yap (Requirement 4)
            const ustYeniKokler = metinKokleriniCikar(baglam.ustKonuBasligi || "");
            const ustEskiKokler = metinKokleriniCikar(eskiKonu.anaBaslik || "");

            let ustOrtak = 0;
            for (const k of ustYeniKokler) {
                if (ustEskiKokler.has(k)) ustOrtak++;
            }

            const uzunBaslik = baslikYeni.length > baslikEski.length ? baslikYeni : baslikEski;
            const ayiracSonrasiMetin = uzunBaslik
                .split(/[:\-\(–—]/)
                .slice(1)
                .join(" ");
            const ayiracKokler = metinKokleriniCikar(ayiracSonrasiMetin);

            const aciklamaMetni = `${yeniKonu?.aciklama || ""} ${eskiKonu?.aciklama || ""}`;
            const aciklamaKokler = metinKokleriniCikar(aciklamaMetni);

            let aciklamaDestegi = 0;
            for (const k of ayiracKokler) {
                if (aciklamaKokler.has(k)) aciklamaDestegi++;
            }

            // Üst konu bağlamı (aynı alan/üst konu altında) veya açıklamadaki kavram desteği doğrulanırsa eşleşir
            if (ustOrtak > 0 || aciklamaDestegi >= 2) {
                return true;
            }

            // Bağlam yeterli değilse eşleştirmeyi kesinlikle reddet (Requirement 4)
            return false;
        }
    }

    // 3. Belirleyici teknik terim grubu kontrolü (Örn: "Preorder, inorder, postorder dolaşma" vs "Ağaç Dolaşma Yöntemleri")
    for (const terimGrubu of AYIRICI_TEKNIK_TERIMLER) {
        const normBaslikEski = turkceKarakterleriAsciilestir(baslikEski).replace(/-/g, "");
        const normBaslikYeni = turkceKarakterleriAsciilestir(baslikYeni).replace(/-/g, "");

        const eskiTumTerimleriIceriyor = terimGrubu.every((t) =>
            normBaslikEski.includes(t)
        );
        const yeniTumTerimleriIceriyor = terimGrubu.every((t) =>
            normBaslikYeni.includes(t)
        );

        if (eskiTumTerimleriIceriyor && yeniTumTerimleriIceriyor) {
            return true;
        }

        if (eskiTumTerimleriIceriyor !== yeniTumTerimleriIceriyor) {
            const terimsizKonu = eskiTumTerimleriIceriyor ? yeniKonu : eskiKonu;
            const terimsizAciklama = turkceKarakterleriAsciilestir(terimsizKonu?.aciklama || "").replace(/-/g, "");

            // Requirement 5: Açıklamada bu yöntemler açıkça destekleniyorsa eşleşsin
            const aciklamadaHepsiVar = terimGrubu.every((t) => terimsizAciklama.includes(t));

            // Başlık veya üst konu bağlamı kontrolü
            const koklerEski = metinKokleriniCikar(baslikEski);
            const koklerYeni = metinKokleriniCikar(baslikYeni);
            const ustYeniKokler = metinKokleriniCikar(baglam.ustKonuBasligi || "");
            const ustEskiKokler = metinKokleriniCikar(eskiKonu.anaBaslik || "");

            let alanBaglamiVar = false;
            for (const k of koklerEski) {
                if (koklerYeni.has(k)) {
                    alanBaglamiVar = true;
                    break;
                }
            }
            if (!alanBaglamiVar) {
                for (const k of ustYeniKokler) {
                    if (ustEskiKokler.has(k)) {
                        alanBaglamiVar = true;
                        break;
                    }
                }
            }

            if (aciklamadaHepsiVar && alanBaglamiVar) {
                return true;
            }
        }
    }

    // 4. Kelime sırası, soru formu ve morfolojik varyasyonlar
    // Örn: "Veri Yapısı Kavramı ve Gerekliliği" vs "Veri yapısı kavramı ve neden gereklidir?"
    // Örn: "Veri Yapısı Kavramı ve Gerekliliği" vs "Veri Yapısı Kavramı ve Gereksinimi"
    //      gerek (gerekliligi kökü) ↔ gereksin (gereksinimi kökü): biri diğerinin öneki → eşleşir
    const koklerYeni = metinKokleriniCikar(baslikYeni);
    const koklerEski = metinKokleriniCikar(baslikEski);

    if (koklerYeni.size >= 2 && koklerEski.size >= 2) {
        // Önek-duyarlı kesişim: tam eşitlik veya biri diğerinin öneki (≥5 karakter)
        let kesisimSayisi = 0;
        const eslesenEskiKokler = new Set();
        for (const kY of koklerYeni) {
            for (const kE of koklerEski) {
                if (!eslesenEskiKokler.has(kE) && koklerEslesiyorMu(kY, kE)) {
                    kesisimSayisi++;
                    eslesenEskiKokler.add(kE);
                    break;
                }
            }
        }

        // Birleşim: iki kümenin toplam benzersiz kök sayısı
        const birlesimSayisi = koklerYeni.size + koklerEski.size - kesisimSayisi;

        const jaccard = kesisimSayisi / birlesimSayisi;

        // Tam kök kümesi eşitliği (kelime sırası, soru formu, ek varyasyonları)
        if (jaccard === 1.0 && kesisimSayisi >= 2) {
            return true;
        }

        // Yüksek eşikli anlam koruyan varyasyon (en az 3 temel kök ortak ve %75+ benzerlik)
        if (jaccard >= 0.75 && kesisimSayisi >= 3) {
            return true;
        }

        // Başlık Sıkıştırma Kontrolü:
        // Gemini bazen ayrıntılı bir başlığı ("Ekleme, Silme ve Arama İşlemleri") genel
        // bir başlıkla ("Temel İşlemler") özetler ve ayrıntıları açıklamaya taşır.
        // Bu durumda başlık Jaccard çok düşük kalır ama eski başlığın kökleri
        // yeni konunun açıklamasında bulunur.
        //
        // Güvenlik koşulları (yanlış pozitif önlemleri):
        //   1. Eski başlıkta en az 3 ayırt edici kök olmalı (başlık yeterince spesifik).
        //   2. Başlıklar arasında en az 1 ortak kök olmalı (bağlam filtresi;
        //      tamamen farklı konuların eşleşmesini engeller).
        //   3. Eski başlığın en az min(3, koklerEski.size) kökü yeni açıklamada bulunmalı.
        if (koklerEski.size >= 3 && kesisimSayisi >= 1) {
            const aciklamaYeniKokler = metinKokleriniCikar(yeniKonu?.aciklama || "");
            if (aciklamaYeniKokler.size > 0) {
                let aciklamadaEskiKokSayisi = 0;
                for (const kE of koklerEski) {
                    for (const kA of aciklamaYeniKokler) {
                        if (koklerEslesiyorMu(kE, kA)) {
                            aciklamadaEskiKokSayisi++;
                            break;
                        }
                    }
                }
                if (aciklamadaEskiKokSayisi >= Math.min(3, koklerEski.size)) {
                    return true;
                }
            }
        }
    }

    return false;
};

/**
 * Eski ve yeni konular arasında güvenli, iki aşamalı (Aşama 1: Kesin, Aşama 2: Semantik/Bağlamsal)
 * kimlik eşleştirmesi yürütür.
 *
 * @param {Object} yeniKonu - { baslik, aciklama, ... }
 * @param {Array} eskiKonular - [{ konuId, baslik, aciklama, _kaynak, anaBaslik, anaKonuId }, ...]
 * @param {Set} kullanilanKimlikler - Halihazırda yeni haritada atanmış kimlikler (1-e-1 garantisi)
 * @param {Object} baglam - { ustKonuBasligi, ustKonuId }
 * @param {number} sadeceAsama - 0: her iki aşama, 1: sadece kesin, 2: sadece semantik
 * @returns {string|null} - Eşleşen eski konuId veya null
 */
export const eskiKonuKimliginiBul = (
    yeniKonu,
    eskiKonular = [],
    kullanilanKimlikler = new Set(),
    baglam = {},
    sadeceAsama = 0
) => {
    const yeniBaslik = konuBasliginiNormalizeEt(
        yeniKonu?.baslik
    );

    if (!yeniBaslik) {
        return null;
    }

    // ─── AŞAMA 1: Tam Normalize Eşleşme ─────────────────────────────────────
    if (sadeceAsama === 0 || sadeceAsama === 1) {
        const tamEslesenler = eskiKonular.filter((eskiKonu) => {
            if (!eskiKonu?.konuId || kullanilanKimlikler.has(eskiKonu.konuId)) {
                return false;
            }

            return (
                konuBasliginiNormalizeEt(eskiKonu.baslik) ===
                yeniBaslik
            );
        });

        if (tamEslesenler.length > 0) {
            const benzersizIdler = [...new Set(tamEslesenler.map((e) => e.konuId))];
            if (benzersizIdler.length === 1) {
                return benzersizIdler[0];
            }
            const aktifEslesen = tamEslesenler.find((e) => e._kaynak === "aktif");
            if (aktifEslesen) {
                return aktifEslesen.konuId;
            }
            return null;
        }

        if (sadeceAsama === 1) {
            return null;
        }
    }

    // ─── AŞAMA 2: Yüksek Güvenli Semantik ve Bağlamsal Eşleştirme ───────────
    if (sadeceAsama === 0 || sadeceAsama === 2) {
        const semantikAdaylar = eskiKonular.filter((eskiKonu) => {
            if (!eskiKonu?.konuId || kullanilanKimlikler.has(eskiKonu.konuId)) {
                return false;
            }

            return semantikEslesmeKontrolu(yeniKonu, eskiKonu, baglam);
        });

        if (semantikAdaylar.length === 0) {
            return null;
        }

        // Yalnızca tekil ve net eşleşme kabul edilir (Requirement 6: 1-e-1 eşleşme)
        const benzersizSemantikIdler = [...new Set(semantikAdaylar.map((e) => e.konuId))];
        if (benzersizSemantikIdler.length === 1) {
            return benzersizSemantikIdler[0];
        }

        const aktifSemantik = semantikAdaylar.find((e) => e._kaynak === "aktif");
        if (aktifSemantik) {
            const digerleri = semantikAdaylar.filter((e) => e.konuId !== aktifSemantik.konuId);
            if (digerleri.length === 0) {
                return aktifSemantik.konuId;
            }
        }

        // Çakışma veya belirsizlik durumunda güvenli davran, null dön (Requirement 6)
        return null;
    }

    return null;
};

/**
 * Yeni konular listesini eski konular havuzuyla iki aşamalı (önce kesin, sonra semantik),
 * 1-e-1 bijection garantili ve çakışmasız biçimde eşleştirir.
 *
 * @param {Array} yeniKonular
 * @param {Array} birincilEskiKonular
 * @param {Array} ikincilEskiKonular
 * @param {Set} kullanilanKimlikler
 * @param {Object} baglam
 * @returns {Map<Object, { eskiId: string, eskiKonu: Object }>}
 */
export const konuListesiniEsle = (
    yeniKonular = [],
    birincilEskiKonular = [],
    ikincilEskiKonular = [],
    kullanilanKimlikler = new Set(),
    baglam = {}
) => {
    const eslesmeler = new Map();
    const eslesmeyenYeniKonular = [];

    // 1. AŞAMA (KESİN EŞLEŞMELER - Önce birincil havuz, sonra ikincil havuz)
    for (const yeni of yeniKonular) {
        let eskiId = eskiKonuKimliginiBul(yeni, birincilEskiKonular, kullanilanKimlikler, baglam, 1);
        let bulunan = eskiId ? birincilEskiKonular.find(k => k.konuId === eskiId) : null;

        if (!eskiId && ikincilEskiKonular.length > 0) {
            eskiId = eskiKonuKimliginiBul(yeni, ikincilEskiKonular, kullanilanKimlikler, baglam, 1);
            if (eskiId) {
                bulunan = ikincilEskiKonular.find(k => k.konuId === eskiId);
            }
        }

        if (eskiId && bulunan) {
            kullanilanKimlikler.add(eskiId);
            eslesmeler.set(yeni, { eskiId, eskiKonu: bulunan });
        } else {
            eslesmeyenYeniKonular.push(yeni);
        }
    }

    if (eslesmeyenYeniKonular.length === 0) {
        return eslesmeler;
    }

    // 2. AŞAMA (SEMANTİK EŞLEŞMELER - Birincil havuz)
    const birincilAdaylar = [];
    for (const yeni of eslesmeyenYeniKonular) {
        const adaylar = birincilEskiKonular.filter(eski =>
            eski?.konuId &&
            !kullanilanKimlikler.has(eski.konuId) &&
            semantikEslesmeKontrolu(yeni, eski, baglam)
        );

        if (adaylar.length === 1) {
            birincilAdaylar.push({ yeni, aday: adaylar[0] });
        }
    }

    const adayEskiSayilari = new Map();
    for (const { aday } of birincilAdaylar) {
        adayEskiSayilari.set(aday.konuId, (adayEskiSayilari.get(aday.konuId) || 0) + 1);
    }

    const semantikKalanlar = [];
    for (const yeni of eslesmeyenYeniKonular) {
        const kayit = birincilAdaylar.find(a => a.yeni === yeni);
        if (kayit && adayEskiSayilari.get(kayit.aday.konuId) === 1 && !kullanilanKimlikler.has(kayit.aday.konuId)) {
            kullanilanKimlikler.add(kayit.aday.konuId);
            eslesmeler.set(yeni, { eskiId: kayit.aday.konuId, eskiKonu: kayit.aday });
        } else {
            semantikKalanlar.push(yeni);
        }
    }

    if (semantikKalanlar.length === 0 || ikincilEskiKonular.length === 0) {
        return eslesmeler;
    }

    // 2. AŞAMA (SEMANTİK EŞLEŞMELER - İkincil havuz / Fallback)
    const ikincilAdaylar = [];
    for (const yeni of semantikKalanlar) {
        const adaylar = ikincilEskiKonular.filter(eski =>
            eski?.konuId &&
            !kullanilanKimlikler.has(eski.konuId) &&
            semantikEslesmeKontrolu(yeni, eski, baglam)
        );

        if (adaylar.length === 1) {
            ikincilAdaylar.push({ yeni, aday: adaylar[0] });
        }
    }

    const ikincilAdayEskiSayilari = new Map();
    for (const { aday } of ikincilAdaylar) {
        ikincilAdayEskiSayilari.set(aday.konuId, (ikincilAdayEskiSayilari.get(aday.konuId) || 0) + 1);
    }

    for (const yeni of semantikKalanlar) {
        const kayit = ikincilAdaylar.find(a => a.yeni === yeni);
        if (kayit && ikincilAdayEskiSayilari.get(kayit.aday.konuId) === 1 && !kullanilanKimlikler.has(kayit.aday.konuId)) {
            kullanilanKimlikler.add(kayit.aday.konuId);
            eslesmeler.set(yeni, { eskiId: kayit.aday.konuId, eskiKonu: kayit.aday });
        }
    }

    return eslesmeler;
};

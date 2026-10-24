import test from "node:test";
import assert from "node:assert/strict";

import {
    geminiIleTestSorulariUret,
    partiKaynaklariniSec,
    testSorulariniDogrula,
    testUretimPlaniniOlustur,
} from "../services/geminiService.js";
import { zorlukDagiliminiOlustur } from "../services/testService.js";

const kanitMetni = (index) => `Kavram${index} Değer${index} ile güvenilir biçimde açıklanır.`;
const kapsamliKaynakMetni = Array.from({ length: 120 }, (_, index) => kanitMetni(index + 1)).join(" ");

const kaynaklar = [
    {
        anahtar: "K1",
        materyalId: "materyal-1",
        dosyaAdi: "bir.pdf",
        parcaIndex: 0,
        konuId: "konu-1",
        konuIds: ["konu-1", "konu-2"],
        icerik: kapsamliKaynakMetni,
    },
    {
        anahtar: "K2",
        materyalId: "materyal-2",
        dosyaAdi: "iki.pdf",
        parcaIndex: 0,
        konuId: "konu-2",
        konuIds: ["konu-2"],
        icerik: "İkinci materyal yalnızca farklı bir fiziksel kaynak sağlar.",
    },
];

const izinliKonuIds = [
    { konuId: "konu-1", baslik: "Birinci Konu", konuTuru: "ana" },
    { konuId: "konu-2", baslik: "İkinci Konu", konuTuru: "alt" },
];

const planiPrompttanGetir = (prompt) => {
    const eslesme = String(prompt).match(/SORU_PLANI: (.+)\r?\n/);
    assert.ok(eslesme, "Soru planı prompt içinde bulunmalı");
    return JSON.parse(eslesme[1]);
};

const gecerliHamSoru = ({ plan, index, kaynak = "K1" }) => ({
    metin: `Kavram${index} için kaynakta doğrulanan sonuç hangisidir?`,
    secenekler: [
        { anahtar: "A", metin: `Değer${index}` },
        { anahtar: "B", metin: `Alternatif${index}` },
        { anahtar: "C", metin: `Karşıt${index}` },
        { anahtar: "D", metin: `Belirsiz${index}` },
    ],
    dogruCevap: "A",
    aciklama: kanitMetni(index),
    zorluk: plan.zorluk,
    konuId: plan.konuId || "",
    kaynakReferanslari: [kaynak],
    kaynakKanitlari: [{ kaynakReferansi: kaynak, alinti: kanitMetni(index) }],
});

const mockUretici = ({ donustur } = {}) => {
    const istekler = [];
    let sira = 0;
    return {
        istekler,
        istemci: {
            models: {
                async generateContent(istek) {
                    istekler.push(istek);
                    const plan = planiPrompttanGetir(istek.contents);
                    const sorular = plan.map((planlanan) => {
                        sira += 1;
                        const soru = gecerliHamSoru({ plan: planlanan, index: sira });
                        return donustur ? donustur(soru, {
                            cagri: istekler.length,
                            sira,
                            prompt: istek.contents,
                        }) : soru;
                    });
                    return {
                        text: JSON.stringify({ sorular }),
                        candidates: [{ finishReason: "STOP" }],
                        usageMetadata: {
                            promptTokenCount: 10,
                            candidatesTokenCount: 5,
                            totalTokenCount: 15,
                        },
                    };
                },
            },
        },
    };
};

const uret = (soruSayisi, uretici, ayarlar = {}) => geminiIleTestSorulariUret({
    dersBilgisi: { dersAdi: "Güvenilir Sistemler" },
    kapsamTuru: ayarlar.kapsamTuru || "tum_ders",
    hedefBasligi: "Tüm ders",
    soruSayisi,
    zorlukDagilimi: ayarlar.zorlukDagilimi || zorlukDagiliminiOlustur("karisik", soruSayisi),
    konuDagilimi: ayarlar.konuDagilimi || [],
    kaynaklar,
    izinliKonuIds,
}, {
    istemci: uretici.istemci,
    maxDeneme: ayarlar.maxDeneme || 1,
    maksimumOnarimDenemesi: ayarlar.maksimumOnarimDenemesi ?? 2,
    bekle: ayarlar.bekle || (async () => {}),
    rastgele: ayarlar.rastgele || (() => 0),
});

test("5/10/15/20 soruluk testler en fazla beş soruluk şemalı partilerde üretilir", async () => {
    for (const soruSayisi of [5, 10, 15, 20]) {
        const uretici = mockUretici();
        const sonuc = await uret(soruSayisi, uretici);
        const beklenenPartiSayisi = Math.ceil(soruSayisi / 5);

        assert.equal(sonuc.sorular.length, soruSayisi);
        assert.equal(uretici.istekler.length, beklenenPartiSayisi);
        assert.deepEqual(sonuc.tokenKullanimi, {
            girdi: beklenenPartiSayisi * 10,
            cikti: beklenenPartiSayisi * 5,
            toplam: beklenenPartiSayisi * 15,
        });
        for (const istek of uretici.istekler) {
            const sema = istek.config.responseJsonSchema;
            assert.equal(istek.config.responseMimeType, "application/json");
            assert.ok(sema, "JSON response schema gönderilmeli");
            assert.ok(sema.properties.sorular.maxItems <= 5);
            assert.equal(sema.properties.sorular.minItems, sema.properties.sorular.maxItems);
            assert.ok(istek.contents.length < 55_000, "Parti prompt'u kaynak bütçesini aşmamalı");
            assert.ok(
                sema.properties.sorular.items.required.includes("kaynakKanitlari"),
                "Kaynak kanıtı şemada zorunlu olmalı"
            );
        }
    }
});

test("üç kapsam ve dört zorluk seçeneği tam soru kotasını korur", async () => {
    for (const soruSayisi of [5, 10, 15, 20]) {
        for (const zorluk of ["kolay", "orta", "zor", "karisik"]) {
            const dagilim = zorlukDagiliminiOlustur(zorluk, soruSayisi);
            const plan = testUretimPlaniniOlustur({
                soruSayisi,
                zorlukDagilimi: dagilim,
            });
            assert.equal(plan.length, soruSayisi);
            assert.deepEqual(
                Object.fromEntries([...new Set(plan.map((soru) => soru.zorluk))].map(
                    (deger) => [deger, plan.filter((soru) => soru.zorluk === deger).length]
                )),
                dagilim
            );
        }
    }

    for (const kapsamTuru of ["tum_ders", "materyal", "konu"]) {
        const uretici = mockUretici();
        const sonuc = await uret(5, uretici, { kapsamTuru });
        assert.equal(sonuc.sorular.length, 5);
        assert.match(uretici.istekler[0].contents, new RegExp(`Kapsam: ${kapsamTuru}`));
    }
});

test("konu ve zorluk kotaları partiler arasında deterministik ve tam korunur", async () => {
    const uretici = mockUretici();
    const sonuc = await uret(10, uretici, {
        konuDagilimi: [
            { konuId: "konu-1", adet: 6 },
            { konuId: "konu-2", adet: 4 },
        ],
    });
    assert.equal(sonuc.sorular.filter((soru) => soru.konuId === "konu-1").length, 6);
    assert.equal(sonuc.sorular.filter((soru) => soru.konuId === "konu-2").length, 4);
    assert.deepEqual(
        sonuc.sorular.reduce((dagilim, soru) => {
            dagilim[soru.zorluk] = (dagilim[soru.zorluk] || 0) + 1;
            return dagilim;
        }, {}),
        zorlukDagiliminiOlustur("karisik", 10)
    );
});

test("parti kaynakları karakter bütçesini ve çoklu materyal kapsamını korur", () => {
    const secilenler = partiKaynaklariniSec({
        kaynaklar,
        soruPlani: [
            { zorluk: "kolay", konuId: "konu-1" },
            { zorluk: "orta", konuId: "konu-2" },
        ],
        partiIndeksi: 0,
        partiSayisi: 1,
        karakterButcesi: kapsamliKaynakMetni.length + 100,
    });
    assert.deepEqual(new Set(secilenler.map((kaynak) => kaynak.materyalId)), new Set([
        "materyal-1",
        "materyal-2",
    ]));
    assert.ok(secilenler.reduce((toplam, kaynak) => toplam + kaynak.icerik.length, 0) <=
        kapsamliKaynakMetni.length + 100);
});

const dogrulamaAyarlariniOlustur = (kaynak, soru) => ({
    soruSayisi: 1,
    zorlukDagilimi: { kolay: 1 },
    kaynaklar: [kaynak],
    izinliKonuIds,
    soruPlani: [{ sira: 1, zorluk: "kolay", konuId: soru.konuId || "" }],
});

test("Türkçe çekim ekleri ve kısa teknik terimler güvenilir kanıtla kabul edilir", () => {
    const ekliKaynak = {
        ...kaynaklar[0],
        konuIds: ["konu-1"],
        icerik: "Programların sayfalama mekanizması TLB ile hızlandırılır.",
    };
    const hamSoru = {
        metin: "Programlar için sayfalamanın hızlandırılmasında hangi teknik yapı kullanılır?",
        secenekler: [
            { anahtar: "A", metin: "TLB" },
            { anahtar: "B", metin: "FIFO" },
            { anahtar: "C", metin: "HTTP" },
            { anahtar: "D", metin: "SQL" },
        ],
        dogruCevap: "A",
        aciklama: "Programların sayfalama erişimi TLB ile hızlandırılır.",
        zorluk: "kolay",
        konuId: "konu-1",
        kaynakReferanslari: ["K1"],
        kaynakKanitlari: [{
            kaynakReferansi: "K1",
            alinti: "Programların sayfalama mekanizması TLB ile hızlandırılır.",
        }],
    };
    const sonuc = testSorulariniDogrula(
        { sorular: [hamSoru] },
        dogrulamaAyarlariniOlustur(ekliKaynak, hamSoru)
    );
    assert.equal(sonuc.length, 1);
});

test("yalnızca genel sözcüklerden oluşan eşleşme kaynak desteği sayılmaz", () => {
    const genelKaynak = {
        ...kaynaklar[0],
        konuIds: [],
        konuId: "",
        icerik: "Sistem işlem yapı temel bilgi kullanım durum özellik yöntem amaç.",
    };
    const hamSoru = {
        metin: "Bu sistem için temel amaç nedir?",
        secenekler: [
            { anahtar: "A", metin: "Temel işlem yöntemi" },
            { anahtar: "B", metin: "Başka seçenek" },
            { anahtar: "C", metin: "Üçüncü seçenek" },
            { anahtar: "D", metin: "Dördüncü seçenek" },
        ],
        dogruCevap: "A",
        aciklama: "Sistem için temel işlem yöntemi amaç olarak kullanılır.",
        zorluk: "kolay",
        konuId: "",
        kaynakReferanslari: ["K1"],
        kaynakKanitlari: [{ kaynakReferansi: "K1", alinti: genelKaynak.icerik }],
    };
    assert.throws(
        () => testSorulariniDogrula(
            { sorular: [hamSoru] },
            dogrulamaAyarlariniOlustur(genelKaynak, hamSoru)
        ),
        (hata) => hata.tanilama?.dogrulamaAltKodu === "KAYNAK_UYUMU"
    );
});

test("doğru cevapta geçen kısa teknik terim kaynak kanıtında yoksa soru reddedilir", () => {
    const tcpKaynagi = {
        ...kaynaklar[0],
        konuIds: [],
        konuId: "",
        icerik: "TCP bağlantı yönelimli iletişim sağlar.",
    };
    const hamSoru = {
        metin: "Bağlantı yönelimli iletişim için hangi protokol kullanılır?",
        secenekler: [
            { anahtar: "A", metin: "UDP" },
            { anahtar: "B", metin: "TCP" },
            { anahtar: "C", metin: "DNS" },
            { anahtar: "D", metin: "SQL" },
        ],
        dogruCevap: "A",
        aciklama: "UDP bağlantı yönelimli iletişim sağlar.",
        zorluk: "kolay",
        konuId: "",
        kaynakReferanslari: ["K1"],
        kaynakKanitlari: [{ kaynakReferansi: "K1", alinti: tcpKaynagi.icerik }],
    };
    assert.throws(
        () => testSorulariniDogrula(
            { sorular: [hamSoru] },
            dogrulamaAyarlariniOlustur(tcpKaynagi, hamSoru)
        ),
        (hata) => hata.tanilama?.dogrulamaAltKodu === "KAYNAK_KANITI"
    );
});

test("çapraz konu kaynağı, izinli konu kimliği olsa bile reddedilir", () => {
    const hamSoru = {
        metin: "İkinci materyalin sağladığı kaynak nasıl nitelenmiştir?",
        secenekler: [
            { anahtar: "A", metin: "Farklı bir fiziksel kaynak" },
            { anahtar: "B", metin: "Aynı sanal kaynak" },
            { anahtar: "C", metin: "Geçersiz bağlantı" },
            { anahtar: "D", metin: "Eksik kayıt" },
        ],
        dogruCevap: "A",
        aciklama: "İkinci materyal farklı bir fiziksel kaynak sağlar.",
        zorluk: "kolay",
        konuId: "konu-1",
        kaynakReferanslari: ["K2"],
        kaynakKanitlari: [{
            kaynakReferansi: "K2",
            alinti: "İkinci materyal yalnızca farklı bir fiziksel kaynak sağlar.",
        }],
    };
    assert.throws(
        () => testSorulariniDogrula({ sorular: [hamSoru] }, {
            soruSayisi: 1,
            zorlukDagilimi: { kolay: 1 },
            konuDagilimi: [{ konuId: "konu-1", adet: 1 }],
            kaynaklar,
            izinliKonuIds,
            soruPlani: [{ sira: 1, zorluk: "kolay", konuId: "konu-1" }],
        }),
        (hata) => hata.tanilama?.dogrulamaAltKodu === "KAYNAK_KONU_UYUSMAZLIGI"
    );
});

test("tek geçersiz soru sınırlı onarımla değiştirilir, başarılı sorular korunur", async () => {
    let ilkPartiSorulari;
    const uretici = mockUretici({
        donustur(soru, { cagri, sira, prompt }) {
            if (cagri === 1) {
                if (!ilkPartiSorulari) ilkPartiSorulari = [];
                ilkPartiSorulari.push(structuredClone(soru));
                if (sira === 3) {
                    return {
                        ...soru,
                        kaynakReferanslari: ["K99"],
                        kaynakKanitlari: [{ kaynakReferansi: "K99", alinti: "uydurma kaynak" }],
                    };
                }
            }
            assert.match(prompt, /Geçersiz sorunun yerine|Planlanan küçük test partisini üret/);
            return soru;
        },
    });
    const sonuc = await uret(5, uretici);

    assert.equal(uretici.istekler.length, 2);
    assert.equal(sonuc.sorular.length, 5);
    for (const index of [0, 1, 3, 4]) {
        assert.equal(sonuc.sorular[index].metin, ilkPartiSorulari[index].metin);
    }
    assert.notEqual(sonuc.sorular[2].metin, ilkPartiSorulari[2].metin);
});

test("onarım deneme sınırı sonsuz döngüyü ve eksik test kaydını engeller", async () => {
    const uretici = mockUretici({
        donustur(soru) {
            return {
                ...soru,
                kaynakReferanslari: ["K99"],
                kaynakKanitlari: [{ kaynakReferansi: "K99", alinti: "uydurma kaynak" }],
            };
        },
    });
    await assert.rejects(
        uret(5, uretici, { maksimumOnarimDenemesi: 2 }),
        (hata) => {
            assert.equal(hata.kod, "GEMINI_GECERSIZ_TEST_YANITI");
            assert.equal(hata.tanilama?.onarimDenemeSayisi, 2);
            assert.equal(hata.tanilama?.apiCagriSayisi, 3);
            return true;
        }
    );
    assert.equal(uretici.istekler.length, 3);
});

test("503 geçici hatası exponential backoff ile bir kez yeniden denenir", async () => {
    const basariliUretici = mockUretici();
    let cagrilar = 0;
    const beklemeler = [];
    const istemci = {
        models: {
            async generateContent(istek) {
                cagrilar += 1;
                if (cagrilar === 1) {
                    throw Object.assign(new Error("geçici"), { name: "ApiError", status: 503 });
                }
                return basariliUretici.istemci.models.generateContent(istek);
            },
        },
    };
    const sonuc = await geminiIleTestSorulariUret({
        dersBilgisi: { dersAdi: "Ağlar" },
        kapsamTuru: "tum_ders",
        soruSayisi: 5,
        zorlukDagilimi: { kolay: 5 },
        kaynaklar,
        izinliKonuIds,
    }, {
        istemci,
        maxDeneme: 2,
        maksimumOnarimDenemesi: 0,
        bekle: async (ms) => beklemeler.push(ms),
        rastgele: () => 0,
    });
    assert.equal(sonuc.sorular.length, 5);
    assert.equal(cagrilar, 2);
    assert.deepEqual(beklemeler, [400]);
});

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
        konuIds: ["konu-1"],
        icerik: kapsamliKaynakMetni,
    },
    {
        anahtar: "K2",
        materyalId: "materyal-2",
        dosyaAdi: "iki.pdf",
        parcaIndex: 0,
        konuId: "konu-2",
        konuIds: ["konu-2"],
        icerik: `${kapsamliKaynakMetni} İkinci materyal yalnızca farklı bir fiziksel kaynak sağlar.`,
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

const gecerliHamSoru = ({ plan, index, kaynak = plan.izinliKaynakReferanslari?.[0] || "K1" }) => ({
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

const siraliGecerliYanitOlustur = () => {
    let sira = 0;
    return async (istek, donustur = (soru) => soru) => {
        const plan = planiPrompttanGetir(istek.contents);
        const sorular = plan.map((planlanan) => {
            sira += 1;
            return donustur(
                gecerliHamSoru({ plan: planlanan, index: sira }),
                { sira, plan: planlanan }
            );
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
    };
};

const uret = (soruSayisi, uretici, ayarlar = {}) => geminiIleTestSorulariUret({
    dersBilgisi: { dersAdi: "Güvenilir Sistemler" },
    kapsamTuru: ayarlar.kapsamTuru || "tum_ders",
    hedefBasligi: "Tüm ders",
    soruSayisi,
    zorlukDagilimi: ayarlar.zorlukDagilimi || zorlukDagiliminiOlustur("karisik", soruSayisi),
    konuDagilimi: ayarlar.konuDagilimi || [],
    kaynaklar: ayarlar.kaynaklar || kaynaklar,
    izinliKonuIds: ayarlar.izinliKonuIds || izinliKonuIds,
}, {
    istemci: uretici.istemci,
    maxDeneme: ayarlar.maxDeneme || 1,
    maksimumOnarimDenemesi: ayarlar.maksimumOnarimDenemesi ?? 2,
    ...(ayarlar.partiBoyutu ? { partiBoyutu: ayarlar.partiBoyutu } : {}),
    ...(ayarlar.partiKaynakKarakterButcesi
        ? { partiKaynakKarakterButcesi: ayarlar.partiKaynakKarakterButcesi }
        : {}),
    ...(ayarlar.timeoutMs ? { timeoutMs: ayarlar.timeoutMs } : {}),
    ...(Number.isInteger(ayarlar.maksimumKucultmeDerinligi)
        ? { maksimumKucultmeDerinligi: ayarlar.maksimumKucultmeDerinligi }
        : {}),
    bekle: ayarlar.bekle || (async () => {}),
    rastgele: ayarlar.rastgele || (() => 0),
});

test("5/10/15/20 soruluk testler güvenilir en fazla beş soruluk partilerde üretilir", async () => {
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
            assert.equal(istek.config.maxOutputTokens, 6_000);
            assert.ok(istek.contents.length < 55_000, "Parti prompt'u kaynak bütçesini aşmamalı");
            assert.ok(
                sema.properties.sorular.items.required.includes("kaynakKanitlari"),
                "Kaynak kanıtı şemada zorunlu olmalı"
            );
        }
    }
});

test("20 soruda güvenilir varsayılan parti boyutu dört kontrollü çağrı kullanır", async () => {
    const uretici = mockUretici();
    const sonuc = await uret(20, uretici);

    assert.equal(uretici.istekler.length, 4);
    assert.ok(uretici.istekler.every((istek) => planiPrompttanGetir(istek.contents).length === 5));
    assert.deepEqual(sonuc.tokenKullanimi, { girdi: 40, cikti: 20, toplam: 60 });
});

test("üç kapsam ve dört zorluk seçeneği tam soru kotasını korur", async () => {
    for (const kapsamTuru of ["tum_ders", "materyal", "konu"]) {
        for (const soruSayisi of [5, 10, 15, 20]) {
            for (const zorluk of ["kolay", "orta", "zor", "karisik"]) {
                const dagilim = zorlukDagiliminiOlustur(zorluk, soruSayisi);
                const plan = testUretimPlaniniOlustur({
                    soruSayisi,
                    zorlukDagilimi: dagilim,
                });
                assert.equal(plan.length, soruSayisi);

                const uretici = mockUretici();
                const sonuc = await uret(soruSayisi, uretici, {
                    kapsamTuru,
                    zorlukDagilimi: dagilim,
                });
                assert.equal(sonuc.sorular.length, soruSayisi);
                assert.deepEqual(
                    sonuc.sorular.reduce((sayac, soru) => {
                        sayac[soru.zorluk] = (sayac[soru.zorluk] || 0) + 1;
                        return sayac;
                    }, {}),
                    dagilim
                );
                assert.ok(uretici.istekler.every((istek) => (
                    new RegExp(`Kapsam: ${kapsamTuru}`).test(istek.contents)
                )));
            }
        }
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
    const plan = planiPrompttanGetir(uretici.istekler[0].contents);
    assert.ok(plan.every((soru) => soru.izinliKaynakReferanslari.length > 0));
    assert.ok(plan
        .filter((soru) => soru.konuId === "konu-1")
        .every((soru) => soru.izinliKaynakReferanslari.every((anahtar) => anahtar === "K1")));
    assert.ok(plan
        .filter((soru) => soru.konuId === "konu-2")
        .every((soru) => soru.izinliKaynakReferanslari.every((anahtar) => anahtar === "K2")));
});

test("kaynak bütçesi çok konulu partiyi otomatik böler", async () => {
    const uretici = mockUretici();
    const tekKaynakButcesi = Math.max(...kaynaklar.map((kaynak) => kaynak.icerik.length)) + 10;
    const sonuc = await uret(10, uretici, {
        konuDagilimi: [
            { konuId: "konu-1", adet: 5 },
            { konuId: "konu-2", adet: 5 },
        ],
        partiKaynakKarakterButcesi: tekKaynakButcesi,
    });
    assert.equal(sonuc.sorular.length, 10);
    assert.ok(uretici.istekler.length > 1);
    assert.ok(uretici.istekler.every((istek) => istek.contents.length < tekKaynakButcesi + 5_000));
});

test("parti kaynakları karakter bütçesini ve çoklu materyal kapsamını korur", () => {
    const karakterButcesi = kaynaklar.reduce(
        (toplam, kaynak) => toplam + kaynak.icerik.length,
        0
    );
    const secilenler = partiKaynaklariniSec({
        kaynaklar,
        soruPlani: [
            { zorluk: "kolay", konuId: "konu-1" },
            { zorluk: "orta", konuId: "konu-2" },
        ],
        partiIndeksi: 0,
        partiSayisi: 1,
        karakterButcesi,
    });
    assert.deepEqual(new Set(secilenler.map((kaynak) => kaynak.materyalId)), new Set([
        "materyal-1",
        "materyal-2",
    ]));
    assert.ok(secilenler.reduce((toplam, kaynak) => toplam + kaynak.icerik.length, 0) <=
        karakterButcesi);
});

test("parti dönüşü bütçeye sığan zorunlu konu kaynaklarından hiçbirini düşürmez", () => {
    const donenKaynaklar = [
        { anahtar: "K1", materyalId: "m1", parcaIndex: 0, konuIds: ["konu-1"], icerik: "a".repeat(80) },
        { anahtar: "K2", materyalId: "m2", parcaIndex: 0, konuIds: ["konu-2"], icerik: "b".repeat(80) },
        { anahtar: "K3", materyalId: "m3", parcaIndex: 0, konuIds: ["konu-1"], icerik: "c".repeat(100) },
        { anahtar: "K4", materyalId: "m4", parcaIndex: 0, konuIds: ["konu-2"], icerik: "d".repeat(100) },
    ];
    const secilenler = partiKaynaklariniSec({
        kaynaklar: donenKaynaklar,
        soruPlani: [
            { zorluk: "kolay", konuId: "konu-1" },
            { zorluk: "orta", konuId: "konu-2" },
        ],
        partiIndeksi: 1,
        partiSayisi: 2,
        karakterButcesi: 170,
    });

    assert.deepEqual(
        new Set(secilenler.flatMap((kaynak) => kaynak.konuIds)),
        new Set(["konu-1", "konu-2"])
    );
    assert.ok(secilenler.reduce(
        (toplam, kaynak) => toplam + kaynak.icerik.length,
        0
    ) <= 170);
});

test("aynı fiziksel parça ayrı konu etiketleriyle gelirse metin tekrarlanmadan etiketleri birleşir", () => {
    const ortakFizikselKaynaklar = [
        { ...kaynaklar[0], anahtar: "K10", konuId: "konu-1", konuIds: ["konu-1"] },
        { ...kaynaklar[0], anahtar: "K11", konuId: "konu-2", konuIds: ["konu-2"] },
    ];
    const secilenler = partiKaynaklariniSec({
        kaynaklar: ortakFizikselKaynaklar,
        soruPlani: [
            { zorluk: "kolay", konuId: "konu-1" },
            { zorluk: "orta", konuId: "konu-2" },
        ],
        partiIndeksi: 0,
        partiSayisi: 1,
    });
    assert.equal(secilenler.length, 1);
    assert.deepEqual(new Set(secilenler[0].konuIds), new Set(["konu-1", "konu-2"]));
});

test("birleşen fiziksel kaynak konu etiketlerini final doğrulamada da korur", async () => {
    const ortakKaynaklar = [
        { ...kaynaklar[0], anahtar: "K10", konuId: "konu-1", konuIds: ["konu-1"] },
        { ...kaynaklar[0], anahtar: "K11", konuId: "konu-2", konuIds: ["konu-2"] },
    ];
    const uretici = mockUretici();
    const sonuc = await geminiIleTestSorulariUret({
        dersBilgisi: { dersAdi: "Ortak Kaynak" },
        kapsamTuru: "tum_ders",
        hedefBasligi: "Tüm ders",
        soruSayisi: 2,
        zorlukDagilimi: { kolay: 1, orta: 1 },
        konuDagilimi: [
            { konuId: "konu-1", adet: 1 },
            { konuId: "konu-2", adet: 1 },
        ],
        kaynaklar: ortakKaynaklar,
        izinliKonuIds,
    }, {
        istemci: uretici.istemci,
        maxDeneme: 1,
        bekle: async () => {},
        rastgele: () => 0,
    });

    assert.equal(sonuc.sorular.length, 2);
    assert.deepEqual(
        new Set(sonuc.sorular.map((soru) => soru.konuId)),
        new Set(["konu-1", "konu-2"])
    );
    assert.equal(uretici.istekler.length, 1);
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

test("gerçekçi Türkçe teknik anlatım, anlamı koruyan çekimli ifadelerle doğrulanır", () => {
    const gercekciKaynak = {
        ...kaynaklar[0],
        konuIds: ["konu-1"],
        icerik: "İşletim sistemi, sanal adresleri sayfa tabloları aracılığıyla fiziksel çerçevelere eşler. TLB, yakın zamanda kullanılan sayfa tablosu girdilerini önbellekte tutarak adres çevirisini hızlandırır.",
    };
    const hamSoru = {
        metin: "Sayfalama sırasında adreslerin çevrilmesini hızlandıran donanım önbelleği hangisidir?",
        secenekler: [
            { anahtar: "A", metin: "TLB" },
            { anahtar: "B", metin: "Yığın" },
            { anahtar: "C", metin: "İş kuyruğu" },
            { anahtar: "D", metin: "Dosya tanıtıcısı" },
        ],
        dogruCevap: "A",
        aciklama: "TLB, sayfa tablosu girdilerini önbelleğe alıp adres çevrilmesini hızlandırmaktadır.",
        zorluk: "kolay",
        konuId: "konu-1",
        kaynakReferanslari: ["K1"],
        kaynakKanitlari: [{
            kaynakReferansi: "K1",
            alinti: "TLB, yakın zamanda kullanılan sayfa tablosu girdilerini önbellekte tutarak adres çevirisini hızlandırır.",
        }],
    };
    const sonuc = testSorulariniDogrula(
        { sorular: [hamSoru] },
        dogrulamaAyarlariniOlustur(gercekciKaynak, hamSoru)
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

test("aynı anlamı ölçen çok benzer soru TEKRARLAYAN_SORU olarak reddedilir", () => {
    const plan = { zorluk: "kolay", konuId: "konu-1" };
    const ilkSoru = gecerliHamSoru({ plan, index: 1 });
    const tekrar = structuredClone(ilkSoru);
    assert.throws(
        () => testSorulariniDogrula({ sorular: [tekrar] }, {
            ...dogrulamaAyarlariniOlustur(kaynaklar[0], tekrar),
            oncekiSorular: [ilkSoru],
        }),
        (hata) => hata.tanilama?.dogrulamaAltKodu === "TEKRARLAYAN_SORU"
    );
});

test("aynı soru kalıbındaki farklı teknik kavramlar tekrar sayılmaz", () => {
    const ortakKaynak = {
        ...kaynaklar[0],
        konuId: "",
        konuIds: [],
        icerik: "TCP protokolü bağlantı yönelimli iletişim sağlar. DNS protokolü alan adlarını IP adreslerine çözümler.",
    };
    const soruOlustur = ({ kavram, cevap, aciklama, kanit }) => ({
        metin: `Bilgisayar ağlarında ${kavram} protokolünün temel işlevini doğru biçimde açıklayan seçenek aşağıdakilerden hangisidir?`,
        secenekler: [
            { anahtar: "A", metin: cevap },
            { anahtar: "B", metin: "Dosya sıkıştırma" },
            { anahtar: "C", metin: "Görüntü işleme" },
            { anahtar: "D", metin: "Bellek yönetimi" },
        ],
        dogruCevap: "A",
        aciklama,
        zorluk: "kolay",
        konuId: "",
        kaynakReferanslari: ["K1"],
        kaynakKanitlari: [{ kaynakReferansi: "K1", alinti: kanit }],
    });
    const tcpSorusu = soruOlustur({
        kavram: "TCP",
        cevap: "Bağlantı yönelimli iletişim",
        aciklama: "TCP protokolü bağlantı yönelimli iletişim sağlar.",
        kanit: "TCP protokolü bağlantı yönelimli iletişim sağlar.",
    });
    const dnsSorusu = soruOlustur({
        kavram: "DNS",
        cevap: "Alan adlarını IP adreslerine çözümleme",
        aciklama: "DNS protokolü alan adlarını IP adreslerine çözümler.",
        kanit: "DNS protokolü alan adlarını IP adreslerine çözümler.",
    });

    const sonuc = testSorulariniDogrula({ sorular: [tcpSorusu, dnsSorusu] }, {
        soruSayisi: 2,
        zorlukDagilimi: { kolay: 2 },
        kaynaklar: [ortakKaynak],
        izinliKonuIds: [],
        soruPlani: [
            { sira: 1, zorluk: "kolay", konuId: "" },
            { sira: 2, zorluk: "kolay", konuId: "" },
        ],
    });

    assert.equal(sonuc.length, 2);
});

test("aynı teknik kavramı ölçen farklı ifadeli soru tekrar sayılmaya devam eder", () => {
    const kaynak = {
        ...kaynaklar[0],
        konuId: "",
        konuIds: [],
        icerik: "TCP protokolü bağlantı yönelimli iletişim niteliğine sahiptir.",
    };
    const soruOlustur = (metin) => ({
        metin,
        secenekler: [
            { anahtar: "A", metin: "Bağlantı yönelimli iletişim" },
            { anahtar: "B", metin: "Görüntü sıkıştırma" },
            { anahtar: "C", metin: "Bellek adresleme" },
            { anahtar: "D", metin: "Dosya şifreleme" },
        ],
        dogruCevap: "A",
        aciklama: "TCP protokolü bağlantı yönelimli iletişim niteliğine sahiptir.",
        zorluk: "kolay",
        konuId: "",
        kaynakReferanslari: ["K1"],
        kaynakKanitlari: [{
            kaynakReferansi: "K1",
            alinti: "TCP protokolü bağlantı yönelimli iletişim niteliğine sahiptir.",
        }],
    });
    const ilkSoru = soruOlustur(
        "TCP protokolü bağlantı yönelimli iletişim sağlar mı?"
    );
    const benzerSoru = soruOlustur(
        "TCP protokolü bağlantı yönelimli iletişim sunar mı?"
    );

    assert.throws(
        () => testSorulariniDogrula({ sorular: [benzerSoru] }, {
            ...dogrulamaAyarlariniOlustur(kaynak, benzerSoru),
            oncekiSorular: [ilkSoru],
        }),
        (hata) => {
            assert.equal(hata.tanilama?.dogrulamaAltKodu, "TEKRARLAYAN_SORU");
            assert.equal(hata.tanilama?.tekrarTuru, "KAVRAM_BENZERLIGI");
            assert.ok(hata.tanilama?.tekrarBenzerlikPuani >= 0.65);
            return true;
        }
    );
});

test("aynı kaynak için birden fazla geçerli birebir kanıt yanlış pozitif üretmez", () => {
    const kaynak = {
        ...kaynaklar[0],
        konuId: "",
        konuIds: [],
        icerik: "TCP protokolü bağlantı yönelimli iletişim sağlar. TCP güvenilir aktarım için teslim onayları kullanır.",
    };
    const soru = {
        metin: "TCP protokolünün bağlantı ve aktarım özellikleri nelerdir?",
        secenekler: [
            { anahtar: "A", metin: "Bağlantı yönelimli ve güvenilir aktarım" },
            { anahtar: "B", metin: "Yalnızca görüntü işleme" },
            { anahtar: "C", metin: "Dosya sıkıştırma" },
            { anahtar: "D", metin: "Bellek adresleme" },
        ],
        dogruCevap: "A",
        aciklama: "TCP bağlantı yönelimlidir ve teslim onaylarıyla güvenilir aktarımı destekler.",
        zorluk: "kolay",
        konuId: "",
        kaynakReferanslari: ["K1"],
        kaynakKanitlari: [
            { kaynakReferansi: "K1", alinti: "TCP protokolü bağlantı yönelimli iletişim sağlar." },
            { kaynakReferansi: "K1", alinti: "TCP güvenilir aktarım için teslim onayları kullanır." },
        ],
    };

    const sonuc = testSorulariniDogrula(
        { sorular: [soru] },
        dogrulamaAyarlariniOlustur(kaynak, soru)
    );
    assert.equal(sonuc.length, 1);
});

test("kaynakta bulunmayan alıntı ayrıntılı güvenli alt nedenle reddedilir", () => {
    const soru = gecerliHamSoru({ plan: { zorluk: "kolay", konuId: "konu-1" }, index: 1 });
    soru.kaynakKanitlari[0].alinti = "Kaynakta bulunmayan ancak makul görünen farklı bir ifade.";

    assert.throws(
        () => testSorulariniDogrula(
            { sorular: [soru] },
            dogrulamaAyarlariniOlustur(kaynaklar[0], soru)
        ),
        (hata) => {
            assert.equal(hata.tanilama?.dogrulamaAltKodu, "KAYNAK_KANITI");
            assert.equal(hata.tanilama?.kaynakKanitiAltNedeni, "ALINTI_KAYNAKTA_YOK");
            assert.equal(hata.tanilama?.kaynaktaBulunmayanAlintiSayisi, 1);
            return true;
        }
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
    assert.match(uretici.istekler[1].contents, /"dogrulamaAltKodu":"KAYNAK_REFERANSI"/);
    assert.doesNotMatch(uretici.istekler[1].contents, /uydurma kaynak/);
});

test("uzun ama geçerli yapılandırılmış JSON beş soruluk partide doğrulanır", async () => {
    const yanitla = siraliGecerliYanitOlustur();
    let istek;
    const istemci = {
        models: {
            async generateContent(girdi) {
                istek = girdi;
                return yanitla(girdi, (soru) => ({
                    ...soru,
                    aciklama: `${soru.aciklama} ${"Kavram1 güvenilir açıklama ".repeat(120)}`,
                }));
            },
        },
    };
    const sonuc = await uret(5, { istemci, istekler: [] });

    assert.equal(sonuc.sorular.length, 5);
    assert.equal(istek.config.maxOutputTokens, 6_000);
    assert.ok(sonuc.sorular.every((soru) => soru.aciklama.length > 2_000));
});

test("sonraki partide MAX_TOKENS ile kesilen JSON küçük partilere bölünerek kurtarılır", async () => {
    const istekler = [];
    const yanitla = siraliGecerliYanitOlustur();
    const istemci = {
        models: {
            async generateContent(istek) {
                istekler.push(istek);
                if (istekler.length === 2) {
                    return {
                        text: '{"sorular":[',
                        candidates: [{ finishReason: "MAX_TOKENS" }],
                        usageMetadata: {
                            promptTokenCount: 100,
                            candidatesTokenCount: 6_000,
                            totalTokenCount: 6_100,
                        },
                    };
                }
                return yanitla(istek);
            },
        },
    };
    const sonuc = await uret(15, { istemci, istekler });

    assert.equal(sonuc.sorular.length, 15);
    assert.equal(istekler.length, 5);
    assert.deepEqual(istekler.map((istek) => planiPrompttanGetir(istek.contents).length), [5, 5, 2, 3, 5]);
    assert.equal(new Set(sonuc.sorular.map((soru) => soru.metin)).size, 15);
});

test("eksik soru sayısı döndüren parti kalan planı kontrollü biçimde bölerek tamamlanır", async () => {
    const istekler = [];
    const yanitla = siraliGecerliYanitOlustur();
    const istemci = {
        models: {
            async generateContent(istek) {
                istekler.push(istek);
                const yanit = await yanitla(istek);
                if (istekler.length === 1) {
                    const veri = JSON.parse(yanit.text);
                    yanit.text = JSON.stringify({ sorular: veri.sorular.slice(0, -1) });
                }
                return yanit;
            },
        },
    };
    const sonuc = await uret(5, { istemci, istekler });

    assert.equal(sonuc.sorular.length, 5);
    assert.equal(istekler.length, 3);
    assert.deepEqual(istekler.map((istek) => planiPrompttanGetir(istek.contents).length), [5, 2, 3]);
});

test("aynı partideki iki geçersiz soru ayrı ayrı onarılır", async () => {
    const uretici = mockUretici({
        donustur(soru, { cagri, sira }) {
            if (cagri === 1 && [2, 4].includes(sira)) {
                return {
                    ...soru,
                    kaynakReferanslari: ["K99"],
                    kaynakKanitlari: [{ kaynakReferansi: "K99", alinti: "geçersiz" }],
                };
            }
            return soru;
        },
    });
    const sonuc = await uret(5, uretici, { maksimumOnarimDenemesi: 2 });

    assert.equal(sonuc.sorular.length, 5);
    assert.equal(uretici.istekler.length, 3);
    assert.match(uretici.istekler[1].contents, /ONARIM_BAGLAMI/);
    assert.match(uretici.istekler[2].contents, /ONARIM_BAGLAMI/);
});

test("tekrarlayan soru yalnızca ilgili soru değiştirilerek onarılır", async () => {
    let ilkSoru;
    const uretici = mockUretici({
        donustur(soru, { cagri, sira }) {
            if (cagri === 1 && sira === 1) ilkSoru = structuredClone(soru);
            if (cagri === 1 && sira === 2) {
                return { ...structuredClone(ilkSoru), zorluk: soru.zorluk };
            }
            return soru;
        },
    });
    const sonuc = await uret(5, uretici);

    assert.equal(sonuc.sorular.length, 5);
    assert.equal(uretici.istekler.length, 2);
    assert.equal(new Set(sonuc.sorular.map((soru) => soru.metin)).size, 5);
    assert.match(uretici.istekler[1].contents, /"dogrulamaAltKodu":"TEKRARLAYAN_SORU"/);
});

test("tekrarlayan soru onarımında aynı konuya ait denenmemiş kaynak kontrollü seçilir", async () => {
    let ilkSoru;
    const uretici = mockUretici({
        donustur(soru, { cagri, sira }) {
            if (cagri === 1 && sira === 1) ilkSoru = structuredClone(soru);
            if (cagri === 1 && sira === 2) {
                return { ...structuredClone(ilkSoru), zorluk: soru.zorluk };
            }
            return soru;
        },
    });
    const alternatifKaynak = {
        ...kaynaklar[0],
        anahtar: "K3",
        materyalId: "materyal-3",
        dosyaAdi: "uc.pdf",
        parcaIndex: 1,
    };

    const sonuc = await uret(5, uretici, {
        kaynaklar: [kaynaklar[0], alternatifKaynak],
        izinliKonuIds: [izinliKonuIds[0]],
        konuDagilimi: [{ konuId: "konu-1", adet: 5 }],
    });

    const onarimIstegi = uretici.istekler[1];
    const onarimPlani = planiPrompttanGetir(onarimIstegi.contents);
    assert.equal(sonuc.sorular.length, 5);
    assert.deepEqual(onarimPlani[0].izinliKaynakReferanslari, ["K3"]);
    assert.deepEqual(
        onarimIstegi.config.responseJsonSchema.properties.sorular.items.properties
            .kaynakReferanslari.items.enum,
        ["K3"]
    );
    assert.match(onarimIstegi.contents, /"farkliKaynakSecildiMi":true/);
    assert.equal(sonuc.sorular[1].kaynaklar[0].materyalId, "materyal-3");
});

test("gerçek 20 soru zincirinde kaynak-konu onarımı sonrası küçülen partideki tekrar kurtarılır", async () => {
    const istekler = [];
    const yanitla = siraliGecerliYanitOlustur();
    let ilkSoruMetni = "";
    let sdkCagrisi = 0;
    const istemci = {
        models: {
            async generateContent(istek) {
                sdkCagrisi += 1;
                istekler.push(istek);
                if (sdkCagrisi === 1) {
                    throw Object.assign(new Error("geçici"), {
                        name: "ApiError",
                        status: 503,
                    });
                }
                const yanit = await yanitla(istek);
                const veri = JSON.parse(yanit.text);
                if (sdkCagrisi === 2) ilkSoruMetni = veri.sorular[0].metin;

                if ([4, 5, 6].includes(sdkCagrisi)) {
                    const soru = veri.sorular[0];
                    const izinliKaynak = soru.kaynakReferanslari[0];
                    const uyumsuzKaynak = izinliKaynak === "K1" ? "K2" : "K1";
                    soru.kaynakReferanslari = [uyumsuzKaynak];
                    soru.kaynakKanitlari = [{
                        kaynakReferansi: uyumsuzKaynak,
                        alinti: soru.aciklama,
                    }];
                }
                if (sdkCagrisi === 7) veri.sorular[0].metin = ilkSoruMetni;

                return { ...yanit, text: JSON.stringify(veri) };
            },
        },
    };

    const sonuc = await uret(20, { istemci, istekler }, {
        maxDeneme: 2,
        konuDagilimi: [
            { konuId: "konu-1", adet: 10 },
            { konuId: "konu-2", adet: 10 },
        ],
    });

    assert.equal(sonuc.sorular.length, 20);
    assert.equal(new Set(sonuc.sorular.map((soru) => soru.metin)).size, 20);
    assert.equal(sonuc.sorular[0].metin, ilkSoruMetni);
    assert.equal(sonuc.sorular.filter((soru) => soru.konuId === "konu-1").length, 10);
    assert.equal(sonuc.sorular.filter((soru) => soru.konuId === "konu-2").length, 10);
    assert.deepEqual(
        sonuc.sorular.reduce((dagilim, soru) => {
            dagilim[soru.zorluk] = (dagilim[soru.zorluk] || 0) + 1;
            return dagilim;
        }, {}),
        zorlukDagiliminiOlustur("karisik", 20)
    );
    assert.ok(sonuc.sorular.every((soru) => soru.kaynaklar.every((kaynak) => (
        (soru.konuId === "konu-1" && kaynak.materyalId === "materyal-1") ||
        (soru.konuId === "konu-2" && kaynak.materyalId === "materyal-2")
    ))));
    assert.equal(sdkCagrisi, 10);
    const kaynakOnarimPlani = planiPrompttanGetir(istekler[4].contents)[0];
    assert.equal(kaynakOnarimPlani.izinliKaynakReferanslari.length, 1);
    assert.deepEqual(
        istekler[4].config.responseJsonSchema.properties.sorular.items.properties
            .kaynakReferanslari.items.enum,
        kaynakOnarimPlani.izinliKaynakReferanslari
    );
    assert.match(istekler[7].contents, /ONARIM_STRATEJISI/);
});

test("gerçek Materyal logundaki 15 çağrılık KAYNAK_KANITI zinciri hedefli onarımla tamamlanır", async () => {
    const istekler = [];
    const yanitla = siraliGecerliYanitOlustur();
    let sdkCagrisi = 0;
    const kanitiSil = (soru) => {
        soru.kaynakKanitlari = [];
    };
    const istemci = {
        models: {
            async generateContent(istek) {
                sdkCagrisi += 1;
                istekler.push(istek);
                const yanit = await yanitla(istek);
                const veri = JSON.parse(yanit.text);

                if ([1, 4].includes(sdkCagrisi)) {
                    kanitiSil(veri.sorular[0]);
                    kanitiSil(veri.sorular[1]);
                }
                if (sdkCagrisi === 7) {
                    kanitiSil(veri.sorular[0]);
                    kanitiSil(veri.sorular[1]);
                    kanitiSil(veri.sorular[2]);
                }
                if (sdkCagrisi === 11) kanitiSil(veri.sorular[2]);
                if (
                    [12, 13].includes(sdkCagrisi) &&
                    !istek.contents.includes("KANIT_STRATEJISI")
                ) kanitiSil(veri.sorular[0]);
                if (sdkCagrisi === 15) kanitiSil(veri.sorular[0]);

                return { ...yanit, text: JSON.stringify(veri) };
            },
        },
    };

    const sonuc = await uret(20, { istemci, istekler }, { kapsamTuru: "materyal" });

    assert.equal(sonuc.sorular.length, 20);
    assert.equal(new Set(sonuc.sorular.map((soru) => soru.metin)).size, 20);
    assert.equal(sdkCagrisi, 12);
    assert.match(istekler[11].contents, /KANIT_STRATEJISI/);
});

test("gerçek Konu logundaki 11 çağrılık TEKRARLAYAN_SORU zinciri kavram çeşitliliğiyle tamamlanır", async () => {
    const istekler = [];
    const yanitla = siraliGecerliYanitOlustur();
    let sdkCagrisi = 0;
    let ilkSoruMetni = "";
    const tekrarla = (soru) => {
        soru.metin = ilkSoruMetni;
    };
    const istemci = {
        models: {
            async generateContent(istek) {
                sdkCagrisi += 1;
                istekler.push(istek);
                const yanit = await yanitla(istek);
                const veri = JSON.parse(yanit.text);
                if (sdkCagrisi === 1) {
                    ilkSoruMetni = veri.sorular[0].metin;
                    tekrarla(veri.sorular[1]);
                    tekrarla(veri.sorular[2]);
                }
                if (sdkCagrisi === 4) {
                    tekrarla(veri.sorular[0]);
                    tekrarla(veri.sorular[1]);
                }
                if (sdkCagrisi === 7) tekrarla(veri.sorular[2]);
                if (
                    [8, 9].includes(sdkCagrisi) &&
                    !istek.contents.includes("KAVRAM_CESITLILIGI")
                ) tekrarla(veri.sorular[0]);
                if (sdkCagrisi === 11) tekrarla(veri.sorular[0]);
                return { ...yanit, text: JSON.stringify(veri) };
            },
        },
    };

    const sonuc = await uret(20, { istemci, istekler }, {
        kapsamTuru: "konu",
        kaynaklar: [kaynaklar[0]],
        izinliKonuIds: [izinliKonuIds[0]],
        konuDagilimi: [{ konuId: "konu-1", adet: 20 }],
    });

    assert.equal(sonuc.sorular.length, 20);
    assert.equal(new Set(sonuc.sorular.map((soru) => soru.metin)).size, 20);
    assert.equal(sdkCagrisi, 9);
    assert.match(istekler[7].contents, /KAVRAM_CESITLILIGI/);
});

test("tek kaynak bölümünde çeşitlilik tükenirse geçerli parti yeniden üretilmeden anlamlı 422 döner", async () => {
    let ilkSoru;
    const kisaKaynak = {
        ...kaynaklar[0],
        icerik: Array.from({ length: 20 }, (_, index) => kanitMetni(index + 1)).join(" "),
    };
    const uretici = mockUretici({
        donustur(soru, { cagri, sira }) {
            if (cagri === 1 && sira === 1) ilkSoru = structuredClone(soru);
            if ((cagri === 1 && sira === 2) || cagri > 1) {
                return { ...soru, metin: ilkSoru.metin };
            }
            return soru;
        },
    });

    await assert.rejects(
        uret(5, uretici, { kaynaklar: [kisaKaynak] }),
        (hata) => {
            assert.equal(hata.status, 422);
            assert.equal(hata.kod, "YETERSIZ_TEST_ICERIGI");
            assert.equal(hata.tanilama?.dogrulamaAltKodu, "TEKRARLAYAN_SORU");
            assert.equal(hata.tanilama?.icerikCesitliligiYetersizMi, true);
            assert.equal(hata.tanilama?.onarimAdayiTukendiMi, true);
            assert.equal(hata.tanilama?.onarimDenemeSayisi, 1);
            assert.equal(hata.tanilama?.apiCagriSayisi, 2);
            assert.equal(hata.tanilama?.partiKucultmeSayisi, 0);
            return true;
        }
    );
    assert.deepEqual(
        uretici.istekler.map((istek) => planiPrompttanGetir(istek.contents).length),
        [5, 1]
    );
});

test("aynı kaynak bölümünde yinelenen KAYNAK_KANITI hatası ikinci kez çağrılmaz", async () => {
    const kisaKaynak = {
        ...kaynaklar[0],
        icerik: Array.from({ length: 20 }, (_, index) => kanitMetni(index + 1)).join(" "),
    };
    const uretici = mockUretici({
        donustur(soru, { sira }) {
            if (sira === 1 || sira > 5) return { ...soru, kaynakKanitlari: [] };
            return soru;
        },
    });

    await assert.rejects(
        uret(5, uretici, { kaynaklar: [kisaKaynak] }),
        (hata) => {
            assert.equal(hata.status, 502);
            assert.equal(hata.kod, "GEMINI_GECERSIZ_TEST_YANITI");
            assert.equal(hata.tanilama?.dogrulamaAltKodu, "KAYNAK_KANITI");
            assert.equal(hata.tanilama?.kaynakKanitiAltNedeni, "EKSIK_KANIT_REFERANSI");
            assert.equal(hata.tanilama?.onarimAdayiTukendiMi, true);
            assert.equal(hata.tanilama?.onarimDenemeSayisi, 1);
            assert.equal(hata.tanilama?.apiCagriSayisi, 2);
            assert.equal(hata.tanilama?.partiKucultmeSayisi, 0);
            return true;
        }
    );
    assert.equal(uretici.istekler.length, 2);
});

test("farklı partilerdeki geçersiz soruların her biri kendi sınırlı bütçesiyle onarılır", async () => {
    const uretici = mockUretici({
        donustur(soru, { cagri, sira }) {
            if ((cagri === 1 && sira === 3) || (cagri === 3 && sira === 8)) {
                return {
                    ...soru,
                    kaynakReferanslari: ["K99"],
                    kaynakKanitlari: [{ kaynakReferansi: "K99", alinti: "geçersiz" }],
                };
            }
            return soru;
        },
    });
    const sonuc = await uret(20, uretici, { maksimumOnarimDenemesi: 1 });
    assert.equal(sonuc.sorular.length, 20);
    assert.equal(uretici.istekler.length, 6);
    assert.match(uretici.istekler[1].contents, /ONARIM_BAGLAMI/);
    assert.match(uretici.istekler[3].contents, /ONARIM_BAGLAMI/);
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
            assert.equal(hata.tanilama?.apiCagriSayisi, 4);
            assert.equal(hata.tanilama?.onarimButcesiTukendiMi, true);
            assert.equal(hata.tanilama?.partiKucultmeSayisi, 1);
            assert.equal(hata.tanilama?.kurtarmaDerinligi, 1);
            return true;
        }
    );
    assert.equal(uretici.istekler.length, 4);
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

test("sonraki partideki 503 yalnızca o SDK çağrısını yeniden dener", async () => {
    const yanitla = siraliGecerliYanitOlustur();
    const istekler = [];
    let sdkCagrisi = 0;
    const istemci = {
        models: {
            async generateContent(istek) {
                sdkCagrisi += 1;
                istekler.push(istek);
                if (sdkCagrisi === 2) {
                    throw Object.assign(new Error("geçici"), { name: "ApiError", status: 503 });
                }
                return yanitla(istek);
            },
        },
    };
    const sonuc = await uret(15, { istemci, istekler }, { maxDeneme: 2 });

    assert.equal(sonuc.sorular.length, 15);
    assert.equal(sdkCagrisi, 4);
    assert.equal(istekler.filter((istek) => planiPrompttanGetir(istek.contents).length === 5).length, 4);
});

test("test üretimi zaman aşımını 504 olarak sınırlar ve parti küçültmeyle çoğaltmaz", async () => {
    let cagrilar = 0;
    const istemci = {
        models: {
            async generateContent() {
                cagrilar += 1;
                return new Promise(() => {});
            },
        },
    };

    await assert.rejects(
        uret(5, { istemci, istekler: [] }, { timeoutMs: 5, maxDeneme: 1 }),
        (hata) => {
            assert.equal(hata.status, 504);
            assert.equal(hata.kod, "GEMINI_ZAMAN_ASIMI");
            assert.equal(hata.tanilama?.partiKucultmeSayisi, 0);
            return true;
        }
    );
    assert.equal(cagrilar, 1);
});

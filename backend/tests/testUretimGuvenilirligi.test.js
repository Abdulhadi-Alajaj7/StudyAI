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
    ...(ayarlar.partiBoyutu ? { partiBoyutu: ayarlar.partiBoyutu } : {}),
    ...(ayarlar.partiKaynakKarakterButcesi
        ? { partiKaynakKarakterButcesi: ayarlar.partiKaynakKarakterButcesi }
        : {}),
    bekle: ayarlar.bekle || (async () => {}),
    rastgele: ayarlar.rastgele || (() => 0),
});

test("5/10/15/20 soruluk testler uyarlanabilir en fazla on soruluk partilerde üretilir", async () => {
    for (const soruSayisi of [5, 10, 15, 20]) {
        const uretici = mockUretici();
        const sonuc = await uret(soruSayisi, uretici);
        const beklenenPartiSayisi = Math.ceil(soruSayisi / 10);

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
            assert.ok(sema.properties.sorular.maxItems <= 10);
            assert.equal(sema.properties.sorular.minItems, sema.properties.sorular.maxItems);
            assert.ok(istek.contents.length < 55_000, "Parti prompt'u kaynak bütçesini aşmamalı");
            assert.ok(
                sema.properties.sorular.items.required.includes("kaynakKanitlari"),
                "Kaynak kanıtı şemada zorunlu olmalı"
            );
        }
    }
});

test("20 soruda uyarlanabilir partiler sabit beşli akıştan daha az çağrı ve prompt karakteri kullanır", async () => {
    const uyarlanabilir = mockUretici();
    const sabitBesli = mockUretici();
    const uyarlanabilirSonuc = await uret(20, uyarlanabilir);
    const sabitBesliSonuc = await uret(20, sabitBesli, { partiBoyutu: 5 });

    const uyarlanabilirPromptKarakteri = uyarlanabilir.istekler.reduce(
        (toplam, istek) => toplam + istek.contents.length,
        0
    );
    const sabitPromptKarakteri = sabitBesli.istekler.reduce(
        (toplam, istek) => toplam + istek.contents.length,
        0
    );
    assert.equal(uyarlanabilir.istekler.length, 2);
    assert.equal(sabitBesli.istekler.length, 4);
    assert.ok(uyarlanabilirPromptKarakteri < sabitPromptKarakteri);
    assert.deepEqual(uyarlanabilirSonuc.tokenKullanimi, { girdi: 20, cikti: 10, toplam: 30 });
    assert.deepEqual(sabitBesliSonuc.tokenKullanimi, { girdi: 40, cikti: 20, toplam: 60 });
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

test("farklı partilerdeki geçersiz soruların her biri kendi sınırlı bütçesiyle onarılır", async () => {
    const uretici = mockUretici({
        donustur(soru, { cagri, sira }) {
            if ((cagri === 1 && sira === 3) || (cagri === 3 && sira === 12)) {
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
    assert.equal(uretici.istekler.length, 4);
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

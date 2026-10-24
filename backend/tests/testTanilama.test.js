import test from "node:test";
import assert from "node:assert/strict";

import {
    geminiIleTestSorulariUret,
    testSorulariniDogrula,
} from "../services/geminiService.js";
import {
    TANILAMA_ETIKETI,
    testTanilamaEtkinMi,
    testTanilamaKaydiYaz,
} from "../services/testTanilamaService.js";

const materyalId = "materyal-1";
const kaynaklar = [
    {
        anahtar: "K1",
        materyalId,
        dosyaAdi: "ders.pdf",
        parcaIndex: 0,
        konuId: "konu-1",
        icerik: "Yığın veri yapısı LIFO çalışma prensibi ile ekleme ve çıkarma yapar.",
    },
    {
        anahtar: "K2",
        materyalId,
        dosyaAdi: "ders.pdf",
        parcaIndex: 1,
        konuId: "konu-2",
        icerik: "Kuyruk veri yapısı FIFO sırasıyla elemanları işler.",
    },
];
const izinliKonuIds = [
    { konuId: "konu-1", baslik: "Yığın", konuTuru: "alt" },
    { konuId: "konu-2", baslik: "Kuyruk", konuTuru: "alt" },
];

const soru = ({
    metin = "Yığın veri yapısında hangi çalışma ilkesi uygulanır?",
    dogru = "LIFO çalışma prensibi",
    aciklama = "Yığın ekleme ve çıkarma işlemlerinde LIFO çalışma prensibi kullanır.",
    kaynak = "K1",
    konuId = "konu-1",
    zorluk = "kolay",
} = {}) => ({
    metin,
    secenekler: [
        { anahtar: "A", metin: dogru },
        { anahtar: "B", metin: "Rastgele seçim" },
        { anahtar: "C", metin: "Ters sıralama" },
        { anahtar: "D", metin: "Sabit erişim" },
    ],
    dogruCevap: "A",
    aciklama,
    zorluk,
    konuId,
    kaynakReferanslari: [kaynak],
});

const kuyrukSorusu = (degisiklik = {}) => soru({
    metin: "Kuyruk elemanları hangi sırayla işler?",
    dogru: "FIFO sırası",
    aciklama: "Kuyruk veri yapısı elemanları FIFO sırasıyla işler.",
    kaynak: "K2",
    konuId: "konu-2",
    ...degisiklik,
});

const dogrula = (sorular, ayarlar = {}) => testSorulariniDogrula(
    { sorular },
    {
        soruSayisi: sorular.length,
        zorlukDagilimi: { kolay: sorular.length },
        kaynaklar,
        izinliKonuIds,
        ...ayarlar,
    }
);

const altKoduDogrula = (islem, altKod, soruIndeksi = undefined) => assert.throws(
    islem,
    (hata) => {
        assert.equal(hata.status, 502);
        assert.equal(hata.kod, "GEMINI_GECERSIZ_TEST_YANITI");
        assert.equal(hata.tanilama?.dogrulamaAltKodu, altKod);
        if (soruIndeksi !== undefined) assert.equal(hata.tanilama?.soruIndeksi, soruIndeksi);
        return true;
    }
);

test("test doğrulama alt nedenlerini ve sıfır tabanlı soru indeksini ayırt eder", () => {
    altKoduDogrula(
        () => testSorulariniDogrula({ sorular: [soru()] }, {
            soruSayisi: 2,
            zorlukDagilimi: { kolay: 2 },
            kaynaklar,
            izinliKonuIds,
        }),
        "SORU_SAYISI"
    );
    altKoduDogrula(
        () => dogrula([{ ...soru(), aciklama: "" }]),
        "EKSIK_ALAN",
        0
    );
    altKoduDogrula(
        () => dogrula([{ ...soru(), secenekler: soru().secenekler.slice(0, 3) }]),
        "SECENEK_FORMATI",
        0
    );
    altKoduDogrula(
        () => dogrula([{ ...soru(), kaynakReferanslari: ["K99"] }]),
        "KAYNAK_REFERANSI",
        0
    );
    altKoduDogrula(
        () => dogrula([soru(), kuyrukSorusu()], {
            konuDagilimi: [{ konuId: "konu-1", adet: 2 }],
        }),
        "KONU_DAGILIMI"
    );
    altKoduDogrula(
        () => dogrula([soru(), kuyrukSorusu()], {
            zorlukDagilimi: { kolay: 1, orta: 1 },
        }),
        "ZORLUK_DAGILIMI"
    );
    altKoduDogrula(
        () => dogrula([soru(), soru()]),
        "TEKRARLAYAN_SORU",
        1
    );
});

const uyumSorusu = (kaynakReferanslari = ["K1"]) => ({
    ...soru({
        metin: "Echo foxtrot?",
        dogru: "Golf hotel",
        aciklama: "India juliett kilo lima.",
    }),
    kaynakReferanslari,
});

const uyumKaynagi = ({
    anahtar,
    icerik,
    yeniMateryalId = materyalId,
    parcaIndex = 0,
} = {}) => ({
    anahtar,
    materyalId: yeniMateryalId,
    dosyaAdi: "uyum.pdf",
    parcaIndex,
    konuId: "konu-1",
    icerik,
});

test("KAYNAK_UYUMU sıfır kelime örtüşmesini güvenli sayaçlarla tanılar", () => {
    assert.throws(
        () => dogrula([uyumSorusu()], {
            kaynaklar: [uyumKaynagi({
                anahtar: "K1",
                icerik: "alfa bravo charlie delta",
            })],
        }),
        (hata) => {
            assert.deepEqual(hata.tanilama, {
                asama: "TEST_DOGRULAMA",
                dogrulamaAltKodu: "KAYNAK_UYUMU",
                soruIndeksi: 0,
                uretilenSoruSayisi: 1,
                destekAdayiSayisi: 8,
                kaynakKelimeSayisi: 4,
                ortakKelimeSayisi: 0,
                gerekenOrtakKelimeSayisi: 2,
                kaynakReferansiSayisi: 1,
                kaynakBasinaEnYuksekOrtakKelimeSayisi: 0,
                farkliFizikselKaynakSayisi: 1,
                ayniFizikselParcaTekrariVarMi: false,
            });
            return true;
        }
    );
});

test("KAYNAK_UYUMU çok kaynakta tek kelime örtüşmesini ve fiziksel kaynakları sayar", () => {
    const cokluKaynaklar = [
        uyumKaynagi({ anahtar: "K1", icerik: "echo bravo" }),
        uyumKaynagi({
            anahtar: "K3",
            icerik: "charlie delta",
            yeniMateryalId: "materyal-2",
        }),
    ];
    assert.throws(
        () => dogrula([uyumSorusu(["K1", "K3"])], { kaynaklar: cokluKaynaklar }),
        (hata) => {
            assert.equal(hata.tanilama?.dogrulamaAltKodu, "KAYNAK_UYUMU");
            assert.equal(hata.tanilama?.destekAdayiSayisi, 8);
            assert.equal(hata.tanilama?.kaynakKelimeSayisi, 4);
            assert.equal(hata.tanilama?.ortakKelimeSayisi, 1);
            assert.equal(hata.tanilama?.gerekenOrtakKelimeSayisi, 2);
            assert.equal(hata.tanilama?.kaynakReferansiSayisi, 2);
            assert.equal(hata.tanilama?.kaynakBasinaEnYuksekOrtakKelimeSayisi, 1);
            assert.equal(hata.tanilama?.farkliFizikselKaynakSayisi, 2);
            assert.equal(hata.tanilama?.ayniFizikselParcaTekrariVarMi, false);
            return true;
        }
    );
});

test("iki kelime örtüşmesi farklı kaynaklara dağılsa da mevcut algoritma değişmeden kabul eder", () => {
    const sonuc = dogrula([uyumSorusu(["K1", "K3"])], {
        kaynaklar: [
            uyumKaynagi({ anahtar: "K1", icerik: "echo bravo" }),
            uyumKaynagi({
                anahtar: "K3",
                icerik: "foxtrot charlie",
                yeniMateryalId: "materyal-2",
            }),
        ],
    });
    assert.equal(sonuc.length, 1);
});

test("KAYNAK_UYUMU aynı fiziksel parçanın çoklu referansını yalnızca sayaçla belirtir", () => {
    assert.throws(
        () => dogrula([uyumSorusu(["K1", "K3"])], {
            kaynaklar: [
                uyumKaynagi({ anahtar: "K1", icerik: "echo bravo" }),
                uyumKaynagi({ anahtar: "K3", icerik: "charlie delta" }),
            ],
        }),
        (hata) => {
            assert.equal(hata.tanilama?.ortakKelimeSayisi, 1);
            assert.equal(hata.tanilama?.kaynakReferansiSayisi, 2);
            assert.equal(hata.tanilama?.farkliFizikselKaynakSayisi, 1);
            assert.equal(hata.tanilama?.ayniFizikselParcaTekrariVarMi, true);
            return true;
        }
    );
});

test("fiziksel kaynak kimliği eksikse türetilemeyen sayaçlar null kalır", () => {
    const eksikFizikselKaynak = uyumKaynagi({
        anahtar: "K1",
        icerik: "alfa bravo charlie delta",
    });
    delete eksikFizikselKaynak.parcaIndex;
    assert.throws(
        () => dogrula([uyumSorusu()], { kaynaklar: [eksikFizikselKaynak] }),
        (hata) => {
            assert.equal(hata.tanilama?.farkliFizikselKaynakSayisi, null);
            assert.equal(hata.tanilama?.ayniFizikselParcaTekrariVarMi, null);
            return true;
        }
    );
});

test("bilinmeyen konu kimliği güvenli metadata ile ayrı tanılanır", () => {
    assert.throws(
        () => dogrula([{ ...soru(), konuId: "izinli-olmayan-konu" }], {
            konuDagilimi: [{ konuId: "konu-1", adet: 1 }],
        }),
        (hata) => {
            assert.equal(hata.status, 502);
            assert.equal(hata.kod, "GEMINI_GECERSIZ_TEST_YANITI");
            assert.deepEqual(hata.tanilama, {
                asama: "TEST_DOGRULAMA",
                dogrulamaAltKodu: "BILINMEYEN_KONU_KIMLIGI",
                soruIndeksi: 0,
                uretilenSoruSayisi: 1,
                konuKimligiIzinliMi: false,
                konuKimligiDagitimdaMi: false,
                konuKimligiTuru: "bilinmiyor",
                kaynakReferansiSayisi: 1,
                eslesenKaynakKonuSayisi: 0,
                uyusmayanKaynakKonuSayisi: 1,
                farkliKaynakKonuSayisi: 1,
                ayniFizikselParcaFarkliKonuEtiketiVarMi: false,
            });
            return true;
        }
    );
});

test("izinli kimlik ile kaynak konu uyuşmazlığı güvenli sayaçlarla ayrı tanılanır", () => {
    const ayniParcaninDigerKonuKaynagi = {
        ...kaynaklar[0],
        anahtar: "K3",
        konuId: "konu-2",
    };
    assert.throws(
        () => dogrula([{
            ...soru(),
            kaynakReferanslari: ["K1", "K3"],
        }], {
            konuDagilimi: [{ konuId: "konu-1", adet: 1 }],
            kaynaklar: [...kaynaklar, ayniParcaninDigerKonuKaynagi],
        }),
        (hata) => {
            assert.equal(hata.status, 502);
            assert.equal(hata.kod, "GEMINI_GECERSIZ_TEST_YANITI");
            assert.deepEqual(hata.tanilama, {
                asama: "TEST_DOGRULAMA",
                dogrulamaAltKodu: "KAYNAK_KONU_UYUSMAZLIGI",
                soruIndeksi: 0,
                uretilenSoruSayisi: 1,
                konuKimligiIzinliMi: true,
                konuKimligiDagitimdaMi: true,
                konuKimligiTuru: "alt",
                kaynakReferansiSayisi: 2,
                eslesenKaynakKonuSayisi: 1,
                uyusmayanKaynakKonuSayisi: 1,
                farkliKaynakKonuSayisi: 2,
                ayniFizikselParcaFarkliKonuEtiketiVarMi: true,
            });
            return true;
        }
    );
});

const testUret = (response) => geminiIleTestSorulariUret({
    dersBilgisi: { dersAdi: "Veri Yapıları" },
    kapsamTuru: "konu",
    hedefBasligi: "Yığın",
    soruSayisi: 1,
    zorlukDagilimi: { kolay: 1 },
    konuDagilimi: [{ konuId: "konu-1", adet: 1 }],
    kaynaklar: [kaynaklar[0]],
    izinliKonuIds,
}, {
    istemci: { models: { generateContent: async () => response } },
    maxDeneme: 1,
});

test("geçersiz JSON güvenli 502 ve JSON_PARSE tanılaması üretir", async () => {
    await assert.rejects(
        testUret({
            text: "{gecersiz-json",
            candidates: [{ finishReason: "MAX_TOKENS" }],
            usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 },
        }),
        (hata) => {
            assert.equal(hata.status, 502);
            assert.equal(hata.kod, "GEMINI_GECERSIZ_YANIT");
            assert.equal(hata.tanilama?.dogrulamaAltKodu, "JSON_PARSE");
            assert.equal(hata.tanilama?.jsonAyristirmaSonucu, "basarisiz");
            assert.equal(hata.tanilama?.finishReason, "MAX_TOKENS");
            assert.equal(hata.tanilama?.tokenKullanimi?.toplam, 18);
            return true;
        }
    );
});

test("boş Gemini yanıtı güvenli 502 ve BOS_YANIT tanılaması üretir", async () => {
    await assert.rejects(
        testUret({ text: "   " }),
        (hata) => (
            hata.status === 502 &&
            hata.kod === "GEMINI_GECERSIZ_YANIT" &&
            hata.tanilama?.dogrulamaAltKodu === "BOS_YANIT" &&
            hata.tanilama?.geminiYanitiBos === true
        )
    );
});

test("başarılı üretimin soru çıktısı ve token davranışı değişmez", async () => {
    const hamSoru = soru();
    const sonuc = await testUret({
        text: JSON.stringify({ sorular: [hamSoru] }),
        candidates: [{ finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    });
    assert.equal(sonuc.sorular.length, 1);
    assert.equal(sonuc.sorular[0].metin, hamSoru.metin);
    assert.deepEqual(sonuc.tokenKullanimi, { girdi: 10, cikti: 20, toplam: 30 });
    assert.equal(sonuc.model, "gemini-3.5-flash-lite");
    assert.deepEqual(Object.keys(sonuc).sort(), ["model", "sorular", "tokenKullanimi"]);
});

test("tanılama kaydı yalnızca beyaz listedeki metadata alanlarını yazar", () => {
    const satirlar = [];
    const yazildi = testTanilamaKaydiYaz({
        korelasyonId: "korelasyon-1",
        kapsamTuru: "tum_ders",
        istenenSoruSayisi: 10,
        uygulamaHataKodu: "GEMINI_GECERSIZ_YANIT",
        orijinalSdkHataSinifi: "ApiError",
        orijinalHttpDurumu: 503,
        saglayiciHataKodu: "UNAVAILABLE",
        agHataKodu: "ECONNRESET",
        hataKaynagi: "saglayici_http",
        retryUygunMu: true,
        retryEdildiMi: true,
        gercekDenemeSayisi: 2,
        maksimumDenemeSayisi: 2,
        sdkCagriAsamasi: "models.generateContent",
        konuKimligiIzinliMi: true,
        konuKimligiDagitimdaMi: false,
        konuKimligiTuru: "ana",
        destekAdayiSayisi: 8,
        kaynakKelimeSayisi: 4,
        ortakKelimeSayisi: 1,
        gerekenOrtakKelimeSayisi: 2,
        kaynakReferansiSayisi: 2,
        kaynakBasinaEnYuksekOrtakKelimeSayisi: 1,
        farkliFizikselKaynakSayisi: 2,
        ayniFizikselParcaTekrariVarMi: false,
        eslesenKaynakKonuSayisi: 1,
        uyusmayanKaynakKonuSayisi: 1,
        farkliKaynakKonuSayisi: 2,
        ayniFizikselParcaFarkliKonuEtiketiVarMi: true,
        apiKey: "cok-gizli-api-key",
        authorization: "Bearer cok-gizli-token",
        kullaniciId: "ogrenci-kimligi",
        prompt: "tam-prompt-metni",
        hamYanit: "ham-gemini-yaniti",
        kaynakMetni: "tam-materyal-metni",
        soruMetni: "hassas-soru-metni",
        dogruCevapMetni: "hassas-dogru-cevap",
        aciklamaMetni: "hassas-aciklama-metni",
        kelimeListesi: ["hassas-kelime"],
        materyalId: "gercek-materyal-kimligi",
        konuId: "gercek-konu-kimligi",
        sdkHataMesaji: "hassas-sdk-hata-mesaji",
        sdkHataGovdesi: "hassas-sdk-hata-govdesi",
    }, {
        etkin: true,
        logger: (satir) => satirlar.push(satir),
        simdi: () => new Date("2026-10-23T10:00:00.000Z"),
    });

    assert.equal(yazildi, true);
    assert.equal(satirlar.length, 1);
    assert.match(satirlar[0], new RegExp(`^\\${TANILAMA_ETIKETI}`));
    const kayit = JSON.parse(satirlar[0].slice(`${TANILAMA_ETIKETI} `.length));
    assert.equal(kayit.konuKimligiIzinliMi, true);
    assert.equal(kayit.orijinalSdkHataSinifi, "ApiError");
    assert.equal(kayit.orijinalHttpDurumu, 503);
    assert.equal(kayit.saglayiciHataKodu, "UNAVAILABLE");
    assert.equal(kayit.agHataKodu, "ECONNRESET");
    assert.equal(kayit.hataKaynagi, "saglayici_http");
    assert.equal(kayit.retryUygunMu, true);
    assert.equal(kayit.retryEdildiMi, true);
    assert.equal(kayit.gercekDenemeSayisi, 2);
    assert.equal(kayit.maksimumDenemeSayisi, 2);
    assert.equal(kayit.sdkCagriAsamasi, "models.generateContent");
    assert.equal(kayit.konuKimligiDagitimdaMi, false);
    assert.equal(kayit.konuKimligiTuru, "ana");
    assert.equal(kayit.destekAdayiSayisi, 8);
    assert.equal(kayit.kaynakKelimeSayisi, 4);
    assert.equal(kayit.ortakKelimeSayisi, 1);
    assert.equal(kayit.gerekenOrtakKelimeSayisi, 2);
    assert.equal(kayit.kaynakReferansiSayisi, 2);
    assert.equal(kayit.kaynakBasinaEnYuksekOrtakKelimeSayisi, 1);
    assert.equal(kayit.farkliFizikselKaynakSayisi, 2);
    assert.equal(kayit.ayniFizikselParcaTekrariVarMi, false);
    assert.equal(kayit.eslesenKaynakKonuSayisi, 1);
    assert.equal(kayit.uyusmayanKaynakKonuSayisi, 1);
    assert.equal(kayit.farkliKaynakKonuSayisi, 2);
    assert.equal(kayit.ayniFizikselParcaFarkliKonuEtiketiVarMi, true);
    for (const gizliDeger of [
        "cok-gizli-api-key",
        "cok-gizli-token",
        "ogrenci-kimligi",
        "tam-prompt-metni",
        "ham-gemini-yaniti",
        "tam-materyal-metni",
        "hassas-soru-metni",
        "hassas-dogru-cevap",
        "hassas-aciklama-metni",
        "hassas-kelime",
        "gercek-materyal-kimligi",
        "gercek-konu-kimligi",
        "hassas-sdk-hata-mesaji",
        "hassas-sdk-hata-govdesi",
    ]) {
        assert.equal(satirlar[0].includes(gizliDeger), false);
    }
});

test("tanılama varsayılan olarak yalnızca geliştirmede, ayarla açıkça yönetilir", () => {
    assert.equal(testTanilamaEtkinMi({ NODE_ENV: "development" }), true);
    assert.equal(testTanilamaEtkinMi({ NODE_ENV: "production" }), false);
    assert.equal(testTanilamaEtkinMi({ NODE_ENV: "production", TEST_TANILAMA_LOGU: "true" }), true);
    assert.equal(testTanilamaEtkinMi({ NODE_ENV: "development", TEST_TANILAMA_LOGU: "false" }), false);
});

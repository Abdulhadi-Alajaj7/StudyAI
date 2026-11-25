import test from "node:test";
import assert from "node:assert/strict";
import { geminiIleTestSorulariUret } from "../services/geminiService.js";
import { TANILAMA_ETIKETI, testTanilamaEtkinMi, testTanilamaKaydiYaz } from "../services/testTanilamaService.js";
import { ornekPaket } from "./helpers/testUretimOrnekleri.js";
const { girdi, sorular } = ornekPaket([1], "kolay");
const soru = () => sorular[0];
const testUret = (response) => geminiIleTestSorulariUret(girdi, {
    istemci: { models: { generateContent: async () => response } },
    istekYonetimi: { yerAyir: () => () => {} },
});

test("token sınırında kesilen JSON güvenli 502 ve CIKTI_TOKEN_SINIRI tanılaması üretir", async () => {
    await assert.rejects(
        testUret({
            text: "{gecersiz-json",
            candidates: [{ finishReason: "MAX_TOKENS" }],
            usageMetadata: { promptTokenCount: 11, candidatesTokenCount: 7, totalTokenCount: 18 },
        }),
        (hata) => {
            assert.equal(hata.status, 502);
            assert.equal(hata.kod, "GEMINI_GECERSIZ_YANIT");
            assert.equal(hata.tanilama?.dogrulamaAltKodu, "CIKTI_TOKEN_SINIRI");
            assert.equal(hata.tanilama?.jsonAyristirmaSonucu, "basarisiz");
            assert.equal(hata.tanilama?.finishReason, "MAX_TOKENS");
            assert.equal(hata.tanilama?.tokenKullanimi?.toplam, 18);
            return true;
        }
    );
});

test("token sınırı dışındaki bozuk JSON ayrı JSON_PARSE tanılaması üretir", async () => {
    await assert.rejects(
        testUret({
            text: "{gecersiz-json",
            candidates: [{ finishReason: "STOP" }],
        }),
        (hata) => (
            hata.status === 502 &&
            hata.kod === "GEMINI_GECERSIZ_YANIT" &&
            hata.tanilama?.dogrulamaAltKodu === "JSON_PARSE" &&
            hata.tanilama?.finishReason === "STOP"
        )
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
        text: JSON.stringify({ durum: "tamamlandi", sorular: [hamSoru] }),
        candidates: [{ finishReason: "STOP" }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
    });
    assert.equal(sonuc.sorular.length, 1);
    assert.equal(sonuc.sorular[0].metin, hamSoru.metin);
    assert.deepEqual(sonuc.tokenKullanimi, { girdi: 10, cikti: 20, toplam: 30 });
    assert.equal(sonuc.model, "mock-model");
    assert.deepEqual(Object.keys(sonuc).sort(), ["apiCagriSayisi", "model", "sorular", "tanilama", "tokenKullanimi"]);
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
        partiSayisi: 4,
        partiIndeksi: 2,
        partiBoyutu: 5,
        kurtarmaDerinligi: 1,
        partiKucultmeSayisi: 1,
        kurtarmaNedeni: "CIKTI_TOKEN_SINIRI",
        onarimButcesiTukendiMi: true,
        dogrulamaKapsami: "parti",
        istekMaxOutputTokens: 6000,
        istekTimeoutMs: 60000,
        onarimDenemeSayisi: 1,
        apiCagriSayisi: 5,
        sdkCagriAsamasi: "models.generateContent",
        konuKimligiIzinliMi: true,
        konuKimligiDagitimdaMi: false,
        konuKimligiTuru: "ana",
        destekAdayiSayisi: 8,
        kaynakKelimeSayisi: 4,
        ortakKelimeSayisi: 1,
        gerekenOrtakKelimeSayisi: 2,
        kaynakReferansiSayisi: 2,
        kaynakKanitiAltNedeni: "ALINTI_KAYNAKTA_YOK",
        kanitSayisi: 3,
        eksikKanitReferansiSayisi: 0,
        bilinmeyenKanitReferansiSayisi: 0,
        bosAlintiSayisi: 0,
        cokUzunAlintiSayisi: 0,
        cokKisaAlintiSayisi: 0,
        kaynaktaBulunmayanAlintiSayisi: 1,
        anlamsizAlintiSayisi: 0,
        cevabiDesteklemeyenKanitSayisi: 1,
        soruyuDesteklemeyenKanitSayisi: 0,
        dogrulanmayanTeknikTerimSayisi: 1,
        tekrarTuru: "KAVRAM_BENZERLIGI",
        tekrarBenzerlikPuani: 0.82,
        tekrarEdenOncekiSoruIndeksi: 7,
        tekrarOrtakKavramSayisi: 4,
        tekrarAdayKavramSayisi: 5,
        onarimAdayiTukendiMi: true,
        icerikCesitliligiYetersizMi: true,
        kaynakBolumAdayiSayisi: 2,
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
        kaynakKanitlari: [{ alinti: "hassas-kaynak-kaniti" }],
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
    assert.equal(kayit.orijinalSdkHataSinifi, "ApiError");
    assert.equal(kayit.orijinalHttpDurumu, 503);
    assert.equal(kayit.saglayiciHataKodu, "UNAVAILABLE");
    assert.equal(kayit.agHataKodu, "ECONNRESET");
    assert.equal(kayit.hataKaynagi, "saglayici_http");
    assert.equal(kayit.retryUygunMu, true);
    assert.equal(kayit.retryEdildiMi, true);
    assert.equal(kayit.gercekDenemeSayisi, 2);
    assert.equal(kayit.maksimumDenemeSayisi, 2);
    assert.equal(kayit.istekMaxOutputTokens, 6000);
    assert.equal(kayit.istekTimeoutMs, 60000);
    assert.equal(kayit.apiCagriSayisi, 5);
    assert.equal(kayit.sdkCagriAsamasi, "models.generateContent");
    for (const gizliDeger of [
        "cok-gizli-api-key",
        "cok-gizli-token",
        "ogrenci-kimligi",
        "tam-prompt-metni",
        "ham-gemini-yaniti",
        "tam-materyal-metni",
        "hassas-kaynak-kaniti",
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


test("kota türü, retry süresi ve gerçek işlem süresi yalnızca güvenli metadata olarak loglanır", () => {
    const satirlar = [];
    testTanilamaKaydiYaz({
        kotaTuru: "rpm", retryAfterMs: 3000, toplamIslemSureMs: 5416, hataKaynagi: "yerel_sinir",
        message: "sentetik-ham-materyal", apiKey: "sentetik-gizli-anahtar",
    }, { etkin: true, logger: s => satirlar.push(s) });
    const kayit = JSON.parse(satirlar[0].slice(TANILAMA_ETIKETI.length + 1));
    assert.equal(kayit.kotaTuru, "rpm");
    assert.equal(kayit.retryAfterMs, 3000);
    assert.equal(kayit.toplamIslemSureMs, 5416);
    assert.equal(kayit.hataKaynagi, "yerel_sinir");
    assert.doesNotMatch(satirlar[0], /sentetik-/);
});

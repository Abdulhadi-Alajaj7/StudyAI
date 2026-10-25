import assert from "node:assert/strict";
import test from "node:test";

import {
    TEST_URETIM_IZLEME_ETIKETI,
    testUretimIzleyicisiOlustur,
} from "../services/testUretimIzlemeService.js";

const kaydiAyikla = (satir) => JSON.parse(
    satir.slice(`${TEST_URETIM_IZLEME_ETIKETI} `.length)
);

test("test üretim izleyicisi gerçek SDK çağrılarını ayrık kategoriler ve tokenlarla sayar", () => {
    const satirlar = [];
    const zamanlar = [
        new Date("2026-10-25T10:00:00.000Z"),
        new Date("2026-10-25T10:00:01.250Z"),
    ];
    const izleyici = testUretimIzleyicisiOlustur({
        korelasyonId: "kor-izleme-1",
        kapsamTuru: "konu",
        soruSayisi: 20,
        zorluk: "karisik",
    }, {
        logger: (satir) => satirlar.push(satir),
        ortam: { NODE_ENV: "development" },
        simdi: () => zamanlar.shift() || new Date("2026-10-25T10:00:01.250Z"),
    });

    izleyici.baslat();
    izleyici.sdkCagrisiBasladi({
        anaCagriTuru: "uretim",
        sdkDenemesi: 1,
        partiIndeksi: 0,
        partiBoyutu: 5,
        prompt: "LOGDA_OLMAMALI",
    });
    izleyici.sdkCagrisiBasladi({
        anaCagriTuru: "uretim",
        sdkDenemesi: 2,
        partiIndeksi: 0,
        partiBoyutu: 5,
    });
    izleyici.sdkCagrisiTamamlandi({
        tokenKullanimi: { girdi: 100, cikti: 50, toplam: 150 },
    });
    izleyici.onarimBasladi({
        hataNedeni: "TEKRARLAYAN_SORU",
        soruIndeksi: 3,
        onarimDenemesi: 1,
    });
    izleyici.sdkCagrisiBasladi({
        anaCagriTuru: "onarim",
        sdkDenemesi: 1,
        partiIndeksi: 0,
        partiBoyutu: 1,
    });
    izleyici.sdkCagrisiTamamlandi({
        tokenKullanimi: { girdi: 40, cikti: 20, toplam: 60 },
    });
    izleyici.partiKucultuldu({
        neden: "SORU_SAYISI",
        oncekiPartiBoyutu: 5,
        yeniPartiBoyutlari: [2, 3],
    });
    izleyici.sdkCagrisiBasladi({
        anaCagriTuru: "kurtarma",
        sdkDenemesi: 1,
        partiIndeksi: 0,
        partiBoyutu: 2,
    });
    izleyici.sdkCagrisiTamamlandi({
        tokenKullanimi: { girdi: 30, cikti: 10, toplam: 40 },
    });
    izleyici.tamamla({ sonuc: "basarili" });

    const kayitlar = satirlar.map(kaydiAyikla);
    assert.equal(kayitlar[0].olay, "test_uretimi_basladi");
    assert.equal(kayitlar[0].korelasyonId, "kor-izleme-1");
    assert.deepEqual(
        kayitlar.filter((kayit) => kayit.olay === "gemini_sdk_cagrisi")
            .map((kayit) => [kayit.sdkCagriNo, kayit.cagriTuru, kayit.anaCagriTuru]),
        [
            [1, "uretim", "uretim"],
            [2, "sdk_retry", "uretim"],
            [3, "onarim", "onarim"],
            [4, "kurtarma", "kurtarma"],
        ]
    );
    assert.equal(kayitlar.find((kayit) => kayit.olay === "soru_onarimi").hataNedeni,
        "TEKRARLAYAN_SORU");
    assert.deepEqual(
        kayitlar.find((kayit) => kayit.olay === "parti_kucultme").yeniPartiBoyutlari,
        [2, 3]
    );
    const ozet = kayitlar.at(-1);
    assert.equal(ozet.olay, "test_uretimi_tamamlandi");
    assert.equal(ozet.toplamSdkCagriSayisi, 4);
    assert.equal(ozet.ilkUretimCagriSayisi, 1);
    assert.equal(ozet.onarimCagriSayisi, 1);
    assert.equal(ozet.kurtarmaCagriSayisi, 1);
    assert.equal(ozet.sdkRetryCagriSayisi, 1);
    assert.equal(ozet.toplamOnarimDenemesi, 1);
    assert.deepEqual(ozet.tokenKullanimi, { girdi: 170, cikti: 80, toplam: 250 });
    assert.equal(ozet.toplamSureMs, 1250);
    assert.equal(ozet.sonuc, "basarili");
    assert.doesNotMatch(satirlar.join("\n"), /LOGDA_OLMAMALI/);
});

test("test üretim izleme production ortamında güvenli tanılama ayarı açılmadan log yazmaz", () => {
    const satirlar = [];
    const izleyici = testUretimIzleyicisiOlustur({
        korelasyonId: "kor-prod",
        kapsamTuru: "materyal",
        soruSayisi: 5,
        zorluk: "kolay",
    }, {
        logger: (satir) => satirlar.push(satir),
        ortam: { NODE_ENV: "production" },
    });

    izleyici.baslat();
    izleyici.sdkCagrisiBasladi({ anaCagriTuru: "uretim", sdkDenemesi: 1 });
    izleyici.tamamla({ sonuc: "basarisiz", hataKodu: "GUVENLI_KOD" });

    assert.deepEqual(satirlar, []);
});

test("production ortamında güvenli tanılama ayarı açılırsa yalnız güvenli hata özeti yazılır", () => {
    const satirlar = [];
    const izleyici = testUretimIzleyicisiOlustur({
        korelasyonId: "kor-prod-acik",
        kapsamTuru: "konu",
        soruSayisi: 20,
        zorluk: "zor",
        kullaniciId: "LOGDA_OLMAMALI",
    }, {
        logger: (satir) => satirlar.push(satir),
        ortam: { NODE_ENV: "production", TEST_TANILAMA_LOGU: "true" },
    });

    izleyici.baslat();
    izleyici.tamamla({
        sonuc: "basarisiz",
        hataKodu: "GEMINI_GECERSIZ_TEST_YANITI",
        altNeden: "KAYNAK_KANITI",
    });

    const ozet = kaydiAyikla(satirlar.at(-1));
    assert.equal(ozet.sonuc, "basarisiz");
    assert.equal(ozet.hataKodu, "GEMINI_GECERSIZ_TEST_YANITI");
    assert.equal(ozet.altNeden, "KAYNAK_KANITI");
    assert.doesNotMatch(satirlar.join("\n"), /LOGDA_OLMAMALI/);
});

test("eş zamanlı test izleyicileri sayaçlarını korelasyon kimliğine göre ayırır", () => {
    const satirlar = [];
    const olustur = (korelasyonId) => testUretimIzleyicisiOlustur({
        korelasyonId,
        kapsamTuru: "tum_ders",
        soruSayisi: 5,
        zorluk: "karisik",
    }, {
        logger: (satir) => satirlar.push(satir),
        ortam: { NODE_ENV: "development" },
    });
    const birinci = olustur("kor-es-1");
    const ikinci = olustur("kor-es-2");

    birinci.baslat();
    ikinci.baslat();
    birinci.sdkCagrisiBasladi({ anaCagriTuru: "uretim", sdkDenemesi: 1 });
    ikinci.sdkCagrisiBasladi({ anaCagriTuru: "onarim", sdkDenemesi: 1 });
    birinci.tamamla({ sonuc: "basarili" });
    ikinci.tamamla({ sonuc: "basarili" });

    const ozetler = satirlar.map(kaydiAyikla)
        .filter((kayit) => kayit.olay === "test_uretimi_tamamlandi");
    const birinciOzet = ozetler.find((kayit) => kayit.korelasyonId === "kor-es-1");
    const ikinciOzet = ozetler.find((kayit) => kayit.korelasyonId === "kor-es-2");
    assert.equal(birinciOzet.toplamSdkCagriSayisi, 1);
    assert.equal(birinciOzet.ilkUretimCagriSayisi, 1);
    assert.equal(birinciOzet.onarimCagriSayisi, 0);
    assert.equal(ikinciOzet.toplamSdkCagriSayisi, 1);
    assert.equal(ikinciOzet.ilkUretimCagriSayisi, 0);
    assert.equal(ikinciOzet.onarimCagriSayisi, 1);
});

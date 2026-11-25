import { testTanilamaEtkinMi } from "./testTanilamaService.js";

export const TEST_URETIM_IZLEME_ETIKETI = "[TEST_URETIM_IZLEME]";

const CAGRI_TURLERI = new Set(["uretim", "onarim"]);
const KAPSAM_TURLERI = new Set(["tum_ders", "materyal", "konu"]);
const ZORLUKLAR = new Set(["kolay", "orta", "zor", "karisik"]);

const guvenliTanimlayici = (deger, azamiUzunluk = 100) => (
    typeof deger === "string" &&
    /^[A-Za-z0-9_.-]+$/.test(deger) &&
    deger.length <= azamiUzunluk
        ? deger
        : null
);
const guvenliSayi = (deger) => Number.isFinite(deger) ? deger : null;
const guvenliPozitifTamSayi = (deger) => (
    Number.isInteger(deger) && deger >= 0 ? deger : null
);
const tarihOlustur = (simdi) => {
    const deger = simdi();
    const tarih = deger instanceof Date ? deger : new Date(deger);
    return Number.isNaN(tarih.getTime()) ? new Date() : tarih;
};

export const testUretimIzleyicisiOlustur = (meta = {}, {
    logger = console.info,
    ortam = process.env,
    simdi = () => new Date(),
} = {}) => {
    const etkin = testTanilamaEtkinMi(ortam);
    const korelasyonId = guvenliTanimlayici(meta.korelasyonId, 64);
    const kapsamTuru = KAPSAM_TURLERI.has(meta.kapsamTuru) ? meta.kapsamTuru : null;
    const soruSayisi = guvenliPozitifTamSayi(meta.soruSayisi);
    const zorluk = ZORLUKLAR.has(meta.zorluk) ? meta.zorluk : null;
    const sayaclar = {
        toplamSdkCagriSayisi: 0,
        ilkUretimCagriSayisi: 0,
        onarimCagriSayisi: 0,
        sdkRetryCagriSayisi: 0,
        toplamOnarimDenemesi: 0,
        tokenKullanimi: { girdi: 0, cikti: 0, toplam: 0 },
    };
    let baslangicZamani = null;

    const yaz = (olay, alanlar = {}) => {
        if (!etkin) return;
        const kayit = {
            olay,
            zaman: tarihOlustur(simdi).toISOString(),
            korelasyonId,
            ...alanlar,
        };
        try {
            logger(`${TEST_URETIM_IZLEME_ETIKETI} ${JSON.stringify(kayit)}`);
        } catch {
            // İzleme, test üretiminin sonucunu veya hata davranışını değiştirmemelidir.
        }
    };

    return {
        baslat() {
            baslangicZamani = tarihOlustur(simdi);
            yaz("test_uretimi_basladi", { kapsamTuru, soruSayisi, zorluk });
        },
        sdkCagrisiBasladi({
            anaCagriTuru,
            sdkDenemesi,
        } = {}) {
            const guvenliAnaTur = CAGRI_TURLERI.has(anaCagriTuru)
                ? anaCagriTuru
                : "uretim";
            const retryMi = Number.isInteger(sdkDenemesi) && sdkDenemesi > 1;
            sayaclar.toplamSdkCagriSayisi += 1;
            if (retryMi) {
                sayaclar.sdkRetryCagriSayisi += 1;
            } else if (guvenliAnaTur === "onarim") {
                sayaclar.onarimCagriSayisi += 1;
            } else {
                sayaclar.ilkUretimCagriSayisi += 1;
            }
            yaz("gemini_sdk_cagrisi", {
                sdkCagriNo: sayaclar.toplamSdkCagriSayisi,
                cagriTuru: retryMi ? "sdk_retry" : guvenliAnaTur,
                anaCagriTuru: guvenliAnaTur,
                sdkDenemesi: guvenliPozitifTamSayi(sdkDenemesi),
            });
        },
        sdkCagrisiTamamlandi({ tokenKullanimi } = {}) {
            for (const alan of ["girdi", "cikti", "toplam"]) {
                const deger = guvenliSayi(tokenKullanimi?.[alan]);
                if (deger != null) sayaclar.tokenKullanimi[alan] += deger;
            }
        },
        onarimBasladi({ hataNedeni, soruIndeksi, onarimDenemesi } = {}) {
            sayaclar.toplamOnarimDenemesi += 1;
            yaz("soru_onarimi", {
                hataNedeni: guvenliTanimlayici(hataNedeni),
                soruIndeksi: guvenliPozitifTamSayi(soruIndeksi),
                onarimDenemesi: guvenliPozitifTamSayi(onarimDenemesi),
                toplamOnarimDenemesi: sayaclar.toplamOnarimDenemesi,
            });
        },
        tamamla({ sonuc, hataKodu = null, altNeden = null } = {}) {
            const bitisZamani = tarihOlustur(simdi);
            const toplamSureMs = baslangicZamani
                ? Math.max(0, bitisZamani.getTime() - baslangicZamani.getTime())
                : null;
            yaz("test_uretimi_tamamlandi", {
                kapsamTuru,
                soruSayisi,
                zorluk,
                ...sayaclar,
                tokenKullanimi: { ...sayaclar.tokenKullanimi },
                toplamSureMs,
                sonuc: sonuc === "basarili" ? "basarili" : "basarisiz",
                hataKodu: guvenliTanimlayici(hataKodu),
                altNeden: guvenliTanimlayici(altNeden),
            });
        },
        ozetiGetir() {
            return {
                ...sayaclar,
                tokenKullanimi: { ...sayaclar.tokenKullanimi },
            };
        },
    };
};

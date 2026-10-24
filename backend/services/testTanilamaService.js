const TANILAMA_ETIKETI = "[TEST_OLUSTURMA_TANILAMA]";

const dogruDegerler = new Set(["1", "true", "yes", "on", "acik"]);
const yanlisDegerler = new Set(["0", "false", "no", "off", "kapali"]);

const guvenliMetin = (deger, azamiUzunluk = 120) => {
    if (typeof deger !== "string" || !deger.trim()) return null;
    return deger.trim().slice(0, azamiUzunluk);
};

const guvenliSayi = (deger) => Number.isFinite(deger) ? deger : null;
const guvenliBoolean = (deger) => typeof deger === "boolean" ? deger : null;
const guvenliTanimlayici = (deger) => (
    typeof deger === "string" && /^[A-Za-z][A-Za-z0-9_.-]{0,79}$/.test(deger)
        ? deger
        : null
);
const guvenliHataKaynagi = (deger) => [
    "saglayici_http",
    "ag",
    "uygulama_timeout",
    "yanit_isleme",
    "bilinmiyor",
].includes(deger) ? deger : null;
const guvenliKonuTuru = (deger) => ["ana", "alt", "bilinmiyor"].includes(deger)
    ? deger
    : null;

export const testTanilamaEtkinMi = (ortam = process.env) => {
    const ayar = String(ortam.TEST_TANILAMA_LOGU || "").trim().toLowerCase();
    if (dogruDegerler.has(ayar)) return true;
    if (yanlisDegerler.has(ayar)) return false;
    return ortam.NODE_ENV === "development";
};

export const testTanilamaKaydiOlustur = (girdi = {}, simdi = () => new Date()) => ({
    olay: "test_olusturma_hatasi",
    zaman: simdi().toISOString(),
    korelasyonId: guvenliMetin(girdi.korelasyonId, 64),
    kapsamTuru: guvenliMetin(girdi.kapsamTuru, 30),
    istenenSoruSayisi: guvenliSayi(girdi.istenenSoruSayisi),
    istenenZorluk: guvenliMetin(girdi.istenenZorluk, 30),
    model: guvenliMetin(girdi.model, 120),
    kaynakMateryalSayisi: guvenliSayi(girdi.kaynakMateryalSayisi),
    kaynakMetinParcasiSayisi: guvenliSayi(girdi.kaynakMetinParcasiSayisi),
    konuSayisi: guvenliSayi(girdi.konuSayisi),
    toplamKaynakKarakterSayisi: guvenliSayi(girdi.toplamKaynakKarakterSayisi),
    geminiYanitiBos: guvenliBoolean(girdi.geminiYanitiBos),
    jsonAyristirmaSonucu: guvenliMetin(girdi.jsonAyristirmaSonucu, 30) || "bilinmiyor",
    uretilenSoruSayisi: guvenliSayi(girdi.uretilenSoruSayisi),
    finishReason: guvenliMetin(girdi.finishReason, 80),
    tokenKullanimi: {
        girdi: guvenliSayi(girdi.tokenKullanimi?.girdi),
        cikti: guvenliSayi(girdi.tokenKullanimi?.cikti),
        toplam: guvenliSayi(girdi.tokenKullanimi?.toplam),
    },
    asama: guvenliMetin(girdi.asama, 80),
    httpDurumu: guvenliSayi(girdi.httpDurumu),
    uygulamaHataKodu: guvenliMetin(girdi.uygulamaHataKodu, 100),
    orijinalSdkHataSinifi: guvenliTanimlayici(girdi.orijinalSdkHataSinifi),
    orijinalHttpDurumu: guvenliSayi(girdi.orijinalHttpDurumu),
    saglayiciHataKodu: guvenliTanimlayici(girdi.saglayiciHataKodu),
    agHataKodu: guvenliTanimlayici(girdi.agHataKodu),
    hataKaynagi: guvenliHataKaynagi(girdi.hataKaynagi),
    retryUygunMu: guvenliBoolean(girdi.retryUygunMu),
    retryEdildiMi: guvenliBoolean(girdi.retryEdildiMi),
    gercekDenemeSayisi: guvenliSayi(girdi.gercekDenemeSayisi),
    maksimumDenemeSayisi: guvenliSayi(girdi.maksimumDenemeSayisi),
    partiSayisi: guvenliSayi(girdi.partiSayisi),
    partiIndeksi: guvenliSayi(girdi.partiIndeksi),
    onarimDenemeSayisi: guvenliSayi(girdi.onarimDenemeSayisi),
    apiCagriSayisi: guvenliSayi(girdi.apiCagriSayisi),
    sdkCagriAsamasi: girdi.sdkCagriAsamasi === "models.generateContent"
        ? girdi.sdkCagriAsamasi
        : null,
    dogrulamaAltKodu: guvenliMetin(girdi.dogrulamaAltKodu, 100),
    soruIndeksi: guvenliSayi(girdi.soruIndeksi),
    konuKimligiIzinliMi: guvenliBoolean(girdi.konuKimligiIzinliMi),
    konuKimligiDagitimdaMi: guvenliBoolean(girdi.konuKimligiDagitimdaMi),
    konuKimligiTuru: guvenliKonuTuru(girdi.konuKimligiTuru),
    destekAdayiSayisi: guvenliSayi(girdi.destekAdayiSayisi),
    kaynakKelimeSayisi: guvenliSayi(girdi.kaynakKelimeSayisi),
    ortakKelimeSayisi: guvenliSayi(girdi.ortakKelimeSayisi),
    gerekenOrtakKelimeSayisi: guvenliSayi(girdi.gerekenOrtakKelimeSayisi),
    kaynakReferansiSayisi: guvenliSayi(girdi.kaynakReferansiSayisi),
    kaynakBasinaEnYuksekOrtakKelimeSayisi: guvenliSayi(
        girdi.kaynakBasinaEnYuksekOrtakKelimeSayisi
    ),
    farkliFizikselKaynakSayisi: guvenliSayi(girdi.farkliFizikselKaynakSayisi),
    ayniFizikselParcaTekrariVarMi: guvenliBoolean(
        girdi.ayniFizikselParcaTekrariVarMi
    ),
    eslesenKaynakKonuSayisi: guvenliSayi(girdi.eslesenKaynakKonuSayisi),
    uyusmayanKaynakKonuSayisi: guvenliSayi(girdi.uyusmayanKaynakKonuSayisi),
    farkliKaynakKonuSayisi: guvenliSayi(girdi.farkliKaynakKonuSayisi),
    ayniFizikselParcaFarkliKonuEtiketiVarMi: guvenliBoolean(
        girdi.ayniFizikselParcaFarkliKonuEtiketiVarMi
    ),
});

export const testTanilamaKaydiYaz = (
    girdi,
    {
        logger = console.error,
        etkin = testTanilamaEtkinMi(),
        simdi,
    } = {}
) => {
    if (!etkin) return false;
    const kayit = testTanilamaKaydiOlustur(girdi, simdi);
    logger(`${TANILAMA_ETIKETI} ${JSON.stringify(kayit)}`);
    return true;
};

export { TANILAMA_ETIKETI };

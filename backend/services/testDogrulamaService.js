const SECENEKLER = ["A", "B", "C", "D"];
const ZORLUKLAR = ["kolay", "orta", "zor"];

export class TestDogrulamaHatasi extends Error {
    constructor(altKod, mesaj = "Üretilen soruların sayı, konu, kaynak veya kalite koşulları sağlanamadı. Test kaydedilmedi; daha az soru veya daha kapsamlı kaynak seçebilirsiniz.") {
        super(mesaj);
        this.name = "TestDogrulamaHatasi";
        this.status = 422;
        this.kod = "TEST_HEDEFI_KARSILANAMADI";
        this.tanilama = { asama: "TEST_DOGRULAMA", dogrulamaAltKodu: altKod };
    }
}

const testMetniniNormalizeEt = (metin) => String(metin || "")
    .normalize("NFKC").toLocaleLowerCase("tr-TR")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();

const metniDogrula = (deger, sinir, kod = "EKSIK_ALAN") => {
    if (typeof deger !== "string" || !deger.trim() || deger.trim().length > sinir) {
        throw new TestDogrulamaHatasi(kod);
    }
    return deger.trim();
};

const DURAK_KELIMELER = new Set("bir bu ve veya ile için göre hangi hangisi nasıl neden olarak olan olur aşağıdaki doğru yanlış ifade ifadeyi seçeneği kaynak kaynakta belirtilen verilen bilgi temel yapısı çalışma prensibi".split(" "));
const kelimeler = (metin) => new Set(testMetniniNormalizeEt(metin).split(" ")
    .filter((kelime) => kelime.length > 2 && !DURAK_KELIMELER.has(kelime))
    .map((kelime) => kelime.replace(/(larının|lerinin|lardan|lerden|ları|leri|lar|ler|nın|nin|nun|nün|dır|dir|dur|dür)$/u, "")));
const ortakSayisi = (sol, sag) => [...sol].filter((kelime) => sag.has(kelime)).length;
const benzerlik = (sol, sag) => {
    const ortak = ortakSayisi(sol, sag);
    return ortak ? ortak / (sol.size + sag.size - ortak) : 0;
};
const cevapMetni = (soru) => soru.secenekler.find((secenek) => secenek.anahtar === soru.dogruCevap).metin;
const secenekMetniniNormalizeEt = (metin) => metin.normalize("NFKC").toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
// Alıntılarda işlem/karşılaştırma işaretleri bilgi taşır; bunları silme.
const kanitMetniniNormalizeEt = (metin) => String(metin || "").normalize("NFKC")
    .toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();

const tekrarMi = (sol, sag) => {
    if (testMetniniNormalizeEt(sol.metin) === testMetniniNormalizeEt(sag.metin) ||
        testMetniniNormalizeEt(sol.ogrenmeHedefi) === testMetniniNormalizeEt(sag.ogrenmeHedefi)) return true;
    const solHedef = kelimeler(sol.ogrenmeHedefi);
    const sagHedef = kelimeler(sag.ogrenmeHedefi);
    // Aynı terimleri içeren farklı hesaplama/veri örneklerini karıştırma.
    const sayilar = (soru) => (soru.metin + " " + soru.ogrenmeHedefi).match(/\d+/g)?.join(",") || "";
    if (sayilar(sol) !== sayilar(sag)) return false;
    if (ortakSayisi(solHedef, sagHedef) >= 2 && benzerlik(solHedef, sagHedef) >= 0.8) return true;
    const ayniCevap = testMetniniNormalizeEt(cevapMetni(sol)) === testMetniniNormalizeEt(cevapMetni(sag));
    const ayniKanit = sol.kaynakKanitlari.some((a) => sag.kaynakKanitlari.some((b) =>
        kanitMetniniNormalizeEt(a.alinti) === kanitMetniniNormalizeEt(b.alinti)));
    return (ayniCevap && (benzerlik(solHedef, sagHedef) >= 0.5 ||
        (ayniKanit && ortakSayisi(solHedef, sagHedef) >= 2 && benzerlik(solHedef, sagHedef) >= 0.3))) ||
        benzerlik(kelimeler(sol.metin + " " + cevapMetni(sol)), kelimeler(sag.metin + " " + cevapMetni(sag))) >= 0.85;
};

export const kaynakKonuKimlikleriniGetir = (kaynak) => [...new Set(
    (Array.isArray(kaynak?.konuIds) ? kaynak.konuIds : [kaynak?.konuId]).filter(Boolean).map(String)
)];

export const testDagilimKurallariniOlustur = ({ soruSayisi, konuDagilimi = [], zorlukDagilimi = {} }) => {
    if (!Number.isInteger(soruSayisi) || soruSayisi < 1 || soruSayisi > 20) {
        throw new TestDogrulamaHatasi("SORU_SAYISI", "Soru sayısı 1 ile 20 arasında bir tam sayı olmalıdır.");
    }
    const konuIds = [...new Set(konuDagilimi.map((konu) => konu.konuId))];
    if (konuIds.length > soruSayisi) {
        const hata = new TestDogrulamaHatasi("KONU_KAPSAMI", `Bu kapsamda ${konuIds.length} konu var. Her konu için en az bir soru gerektiğinden en az ${konuIds.length} soru seçin.`);
        hata.kod = "ALT_KONU_SORU_SAYISI_YETERSIZ";
        throw hata;
    }
    if (Object.entries(zorlukDagilimi).some(([zorluk, adet]) => !ZORLUKLAR.includes(zorluk) || !Number.isInteger(adet) || adet < 0) ||
        Object.values(zorlukDagilimi).reduce((a, b) => a + b, 0) !== soruSayisi) {
        throw new TestDogrulamaHatasi("ZORLUK_DAGILIMI");
    }
    const esit = konuIds.length > 0 && soruSayisi % konuIds.length === 0;
    return { soruSayisi, konuIds, esit, konuAdedi: esit ? soruSayisi / konuIds.length : 1, zorlukDagilimi };
};

const soruyuDogrula = (ham, { kaynaklar = [], izinliKonuIds = [], kurallar }) => {
    const metin = metniDogrula(ham?.metin, 4000);
    const aciklama = metniDogrula(ham?.aciklama, 6000);
    const ogrenmeHedefi = metniDogrula(ham?.ogrenmeHedefi, 500);
    const dogruCevap = metniDogrula(ham?.dogruCevap, 1, "DOGRU_CEVAP").toUpperCase();
    if (!SECENEKLER.includes(dogruCevap)) throw new TestDogrulamaHatasi("DOGRU_CEVAP");
    if (!Array.isArray(ham.secenekler) || ham.secenekler.length !== 4) throw new TestDogrulamaHatasi("SECENEK_FORMATI");
    const secenekler = ham.secenekler.map((secenek) => ({
        anahtar: metniDogrula(secenek?.anahtar, 1, "SECENEK_FORMATI").toUpperCase(),
        metin: metniDogrula(secenek?.metin, 2000, "SECENEK_FORMATI"),
    }));
    if (!SECENEKLER.every((anahtar) => secenekler.some((s) => s.anahtar === anahtar)) ||
        new Set(secenekler.map((s) => secenekMetniniNormalizeEt(s.metin))).size !== 4) {
        throw new TestDogrulamaHatasi("SECENEK_FORMATI");
    }
    secenekler.sort((a, b) => a.anahtar.localeCompare(b.anahtar));
    if (!kurallar.zorlukDagilimi[ham.zorluk]) throw new TestDogrulamaHatasi("ZORLUK_DAGILIMI");
    const konuId = typeof ham.konuId === "string" ? ham.konuId.trim() : "";
    const konu = izinliKonuIds.find((konu) => konu.konuId === konuId);
    if ((izinliKonuIds.length && !konu) || (!izinliKonuIds.length && konuId) ||
        (kurallar.konuIds.length && !kurallar.konuIds.includes(konuId))) {
        throw new TestDogrulamaHatasi("BILINMEYEN_KONU_KIMLIGI");
    }
    const kaynakHaritasi = new Map(kaynaklar.map((kaynak) => [kaynak.anahtar, kaynak]));
    const referanslar = ham.kaynakReferanslari;
    if (!Array.isArray(referanslar) || !referanslar.length || referanslar.length > 3 ||
        referanslar.some((ref) => typeof ref !== "string" || !kaynakHaritasi.has(ref))) {
        throw new TestDogrulamaHatasi("KAYNAK_REFERANSI");
    }
    const secilenKaynaklar = [...new Set(referanslar)].map((ref) => kaynakHaritasi.get(ref));
    if (secilenKaynaklar.some((kaynak) => {
        const ids = kaynakKonuKimlikleriniGetir(kaynak);
        return ids.length > 0 && !ids.includes(konuId);
    })) throw new TestDogrulamaHatasi("KAYNAK_KONU_UYUSMAZLIGI");
    if (!Array.isArray(ham.kaynakKanitlari) || !ham.kaynakKanitlari.length || ham.kaynakKanitlari.length > 3) {
        throw new TestDogrulamaHatasi("KAYNAK_KANITI");
    }
    const kaynakKanitlari = ham.kaynakKanitlari.map((kanit) => {
        const alinti = metniDogrula(kanit?.alinti, 600, "KAYNAK_KANITI");
        if (!referanslar.includes(kanit.kaynakReferansi) || !testMetniniNormalizeEt(alinti) ||
            !kanitMetniniNormalizeEt(kaynakHaritasi.get(kanit.kaynakReferansi)?.icerik).includes(kanitMetniniNormalizeEt(alinti))) {
            throw new TestDogrulamaHatasi("KAYNAK_KANITI");
        }
        return { kaynakReferansi: kanit.kaynakReferansi, alinti };
    });
    if (referanslar.some((ref) => !kaynakKanitlari.some((kanit) => kanit.kaynakReferansi === ref))) {
        throw new TestDogrulamaHatasi("KAYNAK_KANITI");
    }
    // Hafif dayanak kontrolü: birebir cevap şartı yok; açıklama çıkarımı destekleyebilir.
    const kanitKelimeleri = kelimeler(kaynakKanitlari.map((kanit) => kanit.alinti).join(" "));
    const cevap = secenekler.find((secenek) => secenek.anahtar === dogruCevap).metin;
    const aciklamadakiAnahtar = aciklama.match(/doğru (?:cevap|seçenek)\s*[:=]?\s*([ABCD])\b/iu)?.[1]?.toUpperCase();
    if ((aciklamadakiAnahtar && aciklamadakiAnahtar !== dogruCevap) ||
        (!ortakSayisi(kanitKelimeleri, kelimeler(cevap)) &&
            !testMetniniNormalizeEt(aciklama).includes(testMetniniNormalizeEt(cevap)))) {
        throw new TestDogrulamaHatasi("CEVAP_ACIKLAMA_UYUSMAZLIGI");
    }
    if (!ortakSayisi(kanitKelimeleri, kelimeler(cevap + " " + aciklama)) ||
        !ortakSayisi(kanitKelimeleri, kelimeler(metin + " " + ogrenmeHedefi))) {
        throw new TestDogrulamaHatasi("KAYNAK_KANITI");
    }
    const materyaller = new Map();
    for (const kaynak of secilenKaynaklar) {
        const id = String(kaynak.materyalId);
        if (!materyaller.has(id)) materyaller.set(id, { materyalId: kaynak.materyalId, dosyaAdi: kaynak.dosyaAdi || "Materyal", parcaIndeksleri: [] });
        materyaller.get(id).parcaIndeksleri.push(kaynak.parcaIndex);
    }
    return { metin, aciklama, ogrenmeHedefi, secenekler, dogruCevap, zorluk: ham.zorluk,
        konuId, konuBasligi: konu?.baslik || "", kaynakReferanslari: [...new Set(referanslar)], kaynakKanitlari,
        kaynaklar: [...materyaller.values()].map((kaynak) => ({ ...kaynak, parcaIndeksleri: [...new Set(kaynak.parcaIndeksleri)] })),
        ogrenciCevabi: null, isaretli: false };
};

// En çok 20 soru için konu ve zorluk kotalarını birlikte eşleştirir.
// Artık kenarlar, ilk seçimin daha sonra uygun bir soruyla değiştirilmesini sağlar.
const kotalaraGoreSec = (sorular, kurallar) => {
    const konuIds = kurallar.konuIds.length ? kurallar.konuIds : [...new Set(sorular.map((s) => s.konuId))];
    const hedef = konuIds.length + 4;
    const graf = Array.from({ length: hedef + 1 }, () => []);
    const kenarEkle = (a, b, kapasite, soru = null) => {
        const ileri = { hedef: b, kapasite, ters: graf[b].length, soru };
        graf[a].push(ileri);
        graf[b].push({ hedef: a, kapasite: 0, ters: graf[a].length - 1 });
        return ileri;
    };
    const konuKenarlari = konuIds.map((id, i) => kenarEkle(0, i + 1,
        kurallar.konuIds.length ? kurallar.konuAdedi : kurallar.soruSayisi));
    const soruKenarlari = sorular.map((soru) => kenarEkle(konuIds.indexOf(soru.konuId) + 1,
        konuIds.length + 1 + ZORLUKLAR.indexOf(soru.zorluk), 1, soru));
    ZORLUKLAR.forEach((zorluk, i) => kenarEkle(konuIds.length + 1 + i, hedef, kurallar.zorlukDagilimi[zorluk] || 0));
    const doldur = (sinir) => {
        let adet = 0;
        while (adet < sinir) {
            const onceki = new Map([[0, null]]);
            const kuyruk = [0];
            for (let i = 0; i < kuyruk.length && !onceki.has(hedef); i += 1) {
                const dugum = kuyruk[i];
                graf[dugum].forEach((kenar, index) => {
                    if (kenar.kapasite > 0 && !onceki.has(kenar.hedef)) {
                        onceki.set(kenar.hedef, [dugum, index]);
                        kuyruk.push(kenar.hedef);
                    }
                });
            }
            if (!onceki.has(hedef)) break;
            for (let dugum = hedef; dugum !== 0;) {
                const [kaynak, index] = onceki.get(dugum);
                const kenar = graf[kaynak][index];
                kenar.kapasite -= 1;
                graf[dugum][kenar.ters].kapasite += 1;
                dugum = kaynak;
            }
            adet += 1;
        }
        return adet;
    };
    const ilkAdet = doldur(kurallar.soruSayisi);
    if (kurallar.konuIds.length && !kurallar.esit) {
        const eksikKonu = konuKenarlari.filter((kenar) => kenar.kapasite > 0).length;
        konuKenarlari.forEach((kenar) => { kenar.kapasite += kurallar.soruSayisi - konuIds.length; });
        doldur(kurallar.soruSayisi - ilkAdet - eksikKonu);
    }
    return soruKenarlari.filter((kenar) => kenar.kapasite === 0).map((kenar) => kenar.soru);
};

export const gecerliTestSorulariniSec = (hamSorular, ayarlar) => {
    const kurallar = testDagilimKurallariniOlustur(ayarlar);
    const sorular = [];
    const redNedenleri = {};
    for (const ham of (Array.isArray(hamSorular) ? hamSorular : []).slice(0, 40)) {
        try {
            const soru = soruyuDogrula(ham, { ...ayarlar, kurallar });
            if (sorular.some((onceki) => tekrarMi(onceki, soru))) throw new TestDogrulamaHatasi("TEKRARLAYAN_SORU");
            sorular.push(soru);
        } catch (hata) {
            if (!(hata instanceof TestDogrulamaHatasi)) throw hata;
            const kod = hata.tanilama.dogrulamaAltKodu;
            redNedenleri[kod] = (redNedenleri[kod] || 0) + 1;
        }
    }
    return { sorular: kotalaraGoreSec(sorular, kurallar), redNedenleri };
};

export const testEksikleriniGetir = (sorular, ayarlar) => {
    const kurallar = testDagilimKurallariniOlustur(ayarlar);
    const konuDagilimi = kurallar.konuIds.map((konuId) => ({ konuId,
        adet: Math.max(0, kurallar.konuAdedi - sorular.filter((s) => s.konuId === konuId).length) }));
    return { soruSayisi: kurallar.soruSayisi - sorular.length,
        konuDagilimi: konuDagilimi.filter((konu) => konu.adet > 0),
        esitDagilim: kurallar.esit,
        zorlukDagilimi: Object.fromEntries(Object.entries(kurallar.zorlukDagilimi).map(([zorluk, adet]) =>
            [zorluk, adet - sorular.filter((s) => s.zorluk === zorluk).length])) };
};

export const testSorulariniDogrula = (veri, ayarlar) => {
    if (!Array.isArray(veri?.sorular) || veri.sorular.length !== ayarlar.soruSayisi) throw new TestDogrulamaHatasi("SORU_SAYISI");
    const sonuc = gecerliTestSorulariniSec(veri.sorular, ayarlar);
    if (sonuc.sorular.length !== ayarlar.soruSayisi) {
        throw new TestDogrulamaHatasi(Object.keys(sonuc.redNedenleri)[0] || "KONU_VE_ZORLUK_DAGILIMI");
    }
    const eksik = testEksikleriniGetir(sonuc.sorular, ayarlar);
    if (eksik.konuDagilimi.length) throw new TestDogrulamaHatasi("KONU_DAGILIMI");
    return sonuc.sorular;
};

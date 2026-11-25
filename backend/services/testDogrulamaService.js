const SECENEKLER = ["A", "B", "C", "D"];
const ZORLUKLAR = ["kolay", "orta", "zor"];

export class TestDogrulamaHatasi extends Error {
    constructor(altKod, mesaj = "Yapay zekâ geçerli test biçiminde yanıt vermedi. Lütfen yeniden deneyin.") {
        super(mesaj);
        this.name = "TestDogrulamaHatasi";
        this.status = 422;
        this.kod = "TEST_HEDEFI_KARSILANAMADI";
        this.tanilama = { asama: "TEST_DOGRULAMA", dogrulamaAltKodu: altKod };
    }
}

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

// Yalnızca uygulamanın okuyabileceği veri biçimi. Akademik kalite, tekrar,
 // alıntı, konu ve zorluk dağılımı Gemini'nin prompt talimatlarıdır.
const metin = (deger, sinir, kod = "EKSIK_ALAN") => {
    if (typeof deger !== "string" || !deger.trim() || deger.trim().length > sinir) {
        throw new TestDogrulamaHatasi(kod);
    }
    return deger.trim();
};

export const testSorulariniDogrula = (veri, { soruSayisi, kaynaklar = [], izinliKonuIds = [] }) => {
    if (!Array.isArray(veri?.sorular) || veri.sorular.length !== soruSayisi) {
        throw new TestDogrulamaHatasi("SORU_SAYISI", `Yapay zekâ istenen ${soruSayisi} soruyu döndürmedi. Lütfen yeniden deneyin.`);
    }
    const kaynakHaritasi = new Map(kaynaklar.map((k) => [k.anahtar, k]));
    const konular = new Map(izinliKonuIds.map((k) => [k.konuId, k]));
    return veri.sorular.map((ham) => {
        const dogruCevap = metin(ham?.dogruCevap, 1, "DOGRU_CEVAP").toUpperCase();
        if (!SECENEKLER.includes(dogruCevap)) throw new TestDogrulamaHatasi("DOGRU_CEVAP");
        if (!Array.isArray(ham.secenekler) || ham.secenekler.length !== 4) throw new TestDogrulamaHatasi("SECENEK_FORMATI");
        const secenekler = ham.secenekler.map((s) => ({
            anahtar: metin(s?.anahtar, 1, "SECENEK_FORMATI").toUpperCase(),
            metin: metin(s?.metin, 2000, "SECENEK_FORMATI"),
        }));
        if (!SECENEKLER.every((a) => secenekler.some((s) => s.anahtar === a))) throw new TestDogrulamaHatasi("SECENEK_FORMATI");
        secenekler.sort((a, b) => a.anahtar.localeCompare(b.anahtar));
        if (!ZORLUKLAR.includes(ham.zorluk)) throw new TestDogrulamaHatasi("ZORLUK_FORMATI");
        const konu = konular.get(typeof ham.konuId === "string" ? ham.konuId.trim() : "");
        const referanslar = [...new Set(Array.isArray(ham.kaynakReferanslari) ? ham.kaynakReferanslari : [])]
            .filter((ref) => typeof ref === "string" && kaynakHaritasi.has(ref));
        const materyaller = new Map();
        for (const ref of referanslar) {
            const k = kaynakHaritasi.get(ref);
            const id = String(k.materyalId);
            if (!materyaller.has(id)) materyaller.set(id, {
                materyalId: k.materyalId, dosyaAdi: k.dosyaAdi || "Materyal", parcaIndeksleri: [],
            });
            materyaller.get(id).parcaIndeksleri.push(k.parcaIndex);
        }
        return {
            metin: metin(ham.metin, 4000), aciklama: metin(ham.aciklama, 6000),
            secenekler, dogruCevap, zorluk: ham.zorluk,
            konuId: konu?.konuId || "", konuBasligi: konu?.baslik || "",
            kaynakReferanslari: referanslar,
            kaynaklar: [...materyaller.values()].map((k) => ({ ...k, parcaIndeksleri: [...new Set(k.parcaIndeksleri)] })),
            ogrenciCevabi: null, isaretli: false,
        };
    });
};

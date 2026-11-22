/**
 * Adım 1: Tamamlanmış testlerin konu bazlı analiz için güvenilir cevap kayıtlarını ayırır.
 * Bu servis HÂKİMİYET PUANI HESAPLAMAZ ve veritabanını değiştirmez.
 * Adım 2'de veri erişim katmanı bu saf fonksiyonu kullanabilir.
 */

export const DISLAMA_NEDENLERI = Object.freeze({
    KONU_HARITASI_YOK: "KONU_HARITASI_YOK",
    KONU_ID_EKSIK: "KONU_ID_EKSIK",
    KONU_ID_BILINMIYOR: "KONU_ID_BILINMIYOR",
    KONU_ID_CAKISMASI: "KONU_ID_CAKISMASI",
    SORU_ID_EKSIK: "SORU_ID_EKSIK",
    CEVAP_GECERSIZ: "CEVAP_GECERSIZ",
    TAMAMLANMA_TARIHI_GECERSIZ: "TAMAMLANMA_TARIHI_GECERSIZ",
    KAYNAK_SURUMU_EKSIK: "KAYNAK_SURUMU_EKSIK",
    KAYNAK_SURUMU_CAKISMASI: "KAYNAK_SURUMU_CAKISMASI",
    SORU_KAYNAGI_GECERSIZ: "SORU_KAYNAGI_GECERSIZ",
});

const TEST_DISLAMA_NEDENLERI = Object.freeze({
    BASKA_KULLANICI_VEYA_DERS: "BASKA_KULLANICI_VEYA_DERS",
    TEST_TAMAMLANMADI: "TEST_TAMAMLANMADI",
    TEST_TURU_UYGUN_DEGIL: "TEST_TURU_UYGUN_DEGIL",
});

const kimlik = (deger) => String(deger ?? "").trim();
const cevaplar = new Set(["A", "B", "C", "D"]);
const normalTestTurleri = new Set(["normal", "manuel", "adaptif"]);

const konuIndeksiniOlustur = (harita) => {
    const indeks = new Map();
    const cakisikKimlikler = new Set();

    const ekle = (konu, tur, durum, ustKonuId = "") => {
        const konuId = kimlik(konu?.konuId);
        if (!konuId) return;
        const kayit = {
            konuId,
            konuBasligi: String(konu?.baslik || ""),
            tur,
            durum,
            ustKonuId,
        };
        const onceki = indeks.get(konuId);
        if (!onceki) {
            indeks.set(konuId, kayit);
            return;
        }

        // Aynı kalıcı kimlik, aktif ve arşivde aynı tür/üst konu ile bulunabilir.
        // Başlığın değişmesi tek başına kimliği geçersiz yapmaz.
        const ayniKimlikBaglami = onceki.tur === tur && onceki.ustKonuId === ustKonuId;
        const aktifVeArsiv = onceki.durum !== durum;
        if (ayniKimlikBaglami && aktifVeArsiv && !cakisikKimlikler.has(konuId)) {
            if (durum === "aktif") indeks.set(konuId, kayit);
            return;
        }

        // Aynı listede birden çok kimlik veya farklı bağlam: yanlış eşleştirme yapma.
        cakisikKimlikler.add(konuId);
    };

    const grubuEkle = (anaKonular, durum) => {
        for (const anaKonu of Array.isArray(anaKonular) ? anaKonular : []) {
            ekle(anaKonu, "ana", durum);
            const ustKonuId = kimlik(anaKonu?.konuId);
            for (const altKonu of Array.isArray(anaKonu?.altKonular) ? anaKonu.altKonular : []) {
                ekle(altKonu, "alt", durum, ustKonuId);
            }
        }
    };

    grubuEkle(harita?.anaKonular, "aktif");
    grubuEkle(harita?.gecmisKonular, "arsiv");

    return { indeks, cakisikKimlikler };
};

const kaynakSurumleriniDogrula = (test) => {
    const surumler = new Map();
    const kaynakSurumleri = test?.kaynakSurumleri;
    if (!Array.isArray(kaynakSurumleri) || kaynakSurumleri.length === 0) {
        return { neden: DISLAMA_NEDENLERI.KAYNAK_SURUMU_EKSIK };
    }
    for (const kaynak of kaynakSurumleri) {
        const materyalId = kimlik(kaynak?.materyalId);
        const islemeId = kimlik(kaynak?.aktifIslemeId);
        if (!materyalId || !islemeId) {
            return { neden: DISLAMA_NEDENLERI.KAYNAK_SURUMU_EKSIK };
        }
        if (surumler.has(materyalId) && surumler.get(materyalId) !== islemeId) {
            return { neden: DISLAMA_NEDENLERI.KAYNAK_SURUMU_CAKISMASI };
        }
        surumler.set(materyalId, islemeId);
    }
    return { surumler };
};

const soruKaynaklariniDogrula = (soru, surumler) => {
    if (!Array.isArray(soru?.kaynaklar) || soru.kaynaklar.length === 0) {
        return false;
    }
    // Testin oluşturulduğu andaki kaynak sürümü korunur; güncel sürüm aranmaz.
    return soru.kaynaklar.every((kaynak) => {
        const materyalId = kimlik(kaynak?.materyalId);
        return materyalId && surumler.has(materyalId) &&
            Array.isArray(kaynak?.parcaIndeksleri) &&
            kaynak.parcaIndeksleri.length > 0 &&
            kaynak.parcaIndeksleri.every((indeks) => Number.isInteger(indeks) && indeks >= 0);
    });
};

/**
 * @param {object} girdi
 * @param {string|object} girdi.kullaniciId
 * @param {string|object} girdi.dersId
 * @param {object|null} girdi.konuHaritasi - Aynı kullanıcının/derse ait harita.
 * @param {object[]} girdi.testler - Gerekli alanlarıyla tam Test belgeleri.
 * @returns {{gecerliKayitlar: object[], dislananSorular: object[], atlananTestler: object[], ozet: object}}
 */
export const konuPerformansVerileriniDogrula = ({
    kullaniciId, dersId, konuHaritasi = null, testler = [],
} = {}) => {
    const sahipId = kimlik(kullaniciId);
    const dersKimligi = kimlik(dersId);
    if (!sahipId || !dersKimligi) {
        throw new TypeError("Kullanıcı ve ders kimliği zorunludur.");
    }
    if (konuHaritasi && (
        kimlik(konuHaritasi.kullaniciId) !== sahipId ||
        kimlik(konuHaritasi.dersId) !== dersKimligi
    )) {
        throw new TypeError("Konu haritası istenen kullanıcıya ve derse ait olmalıdır.");
    }

    const { indeks, cakisikKimlikler } = konuIndeksiniOlustur(konuHaritasi);
    const gecerliKayitlar = [];
    const dislananSorular = [];
    const atlananTestler = [];

    for (const test of Array.isArray(testler) ? testler : []) {
        const testId = kimlik(test?._id);
        let testNedeni = null;
        if (kimlik(test?.kullaniciId) !== sahipId || kimlik(test?.dersId) !== dersKimligi) {
            testNedeni = TEST_DISLAMA_NEDENLERI.BASKA_KULLANICI_VEYA_DERS;
        } else if (test?.durum !== "tamamlandi") {
            testNedeni = TEST_DISLAMA_NEDENLERI.TEST_TAMAMLANMADI;
        } else if (!normalTestTurleri.has(test?.testTuru ?? "normal")) {
            // Gelecekteki yanlış tekrarı ve bilinmeyen türler ana puana katılmaz.
            testNedeni = TEST_DISLAMA_NEDENLERI.TEST_TURU_UYGUN_DEGIL;
        }
        if (testNedeni) {
            atlananTestler.push({ testId, neden: testNedeni });
            continue;
        }

        const tarih = new Date(test.tamamlanmaTarihi);
        const tarihGecerli = test.tamamlanmaTarihi != null &&
            Number.isFinite(tarih.getTime());
        const { neden: kaynakNedeni, surumler } = kaynakSurumleriniDogrula(test);

        for (const soru of Array.isArray(test?.sorular) ? test.sorular : []) {
            const soruId = kimlik(soru?._id);
            const konuId = kimlik(soru?.konuId);
            let neden = null;
            if (!konuHaritasi) {
                neden = DISLAMA_NEDENLERI.KONU_HARITASI_YOK;
            } else if (!soruId) {
                neden = DISLAMA_NEDENLERI.SORU_ID_EKSIK;
            } else if (!konuId) {
                neden = DISLAMA_NEDENLERI.KONU_ID_EKSIK;
            } else if (cakisikKimlikler.has(konuId)) {
                neden = DISLAMA_NEDENLERI.KONU_ID_CAKISMASI;
            } else if (!indeks.has(konuId)) {
                neden = DISLAMA_NEDENLERI.KONU_ID_BILINMIYOR;
            } else if (!tarihGecerli) {
                neden = DISLAMA_NEDENLERI.TAMAMLANMA_TARIHI_GECERSIZ;
            } else if (kaynakNedeni) {
                neden = kaynakNedeni;
            } else if (!soruKaynaklariniDogrula(soru, surumler)) {
                neden = DISLAMA_NEDENLERI.SORU_KAYNAGI_GECERSIZ;
            } else if (
                !cevaplar.has(soru?.dogruCevap) ||
                (soru?.ogrenciCevabi != null && !cevaplar.has(soru.ogrenciCevabi))
            ) {
                neden = DISLAMA_NEDENLERI.CEVAP_GECERSIZ;
            }

            if (neden) {
                dislananSorular.push({ testId, soruId, konuId, neden });
                continue;
            }

            const konu = indeks.get(konuId);
            const cevapDurumu = soru.ogrenciCevabi == null
                ? "bos"
                : soru.ogrenciCevabi === soru.dogruCevap ? "dogru" : "yanlis";
            gecerliKayitlar.push({
                kullaniciId: sahipId,
                dersId: dersKimligi,
                testId,
                soruId,
                konuId,
                konuBasligi: konu.konuBasligi,
                konuDurumu: konu.durum,
                soruKonuBasligi: String(soru.konuBasligi || ""),
                cevapDurumu,
                tamamlanmaTarihi: tarih.toISOString(),
                kaynakMateryalIdleri: soru.kaynaklar.map((kaynak) => kimlik(kaynak.materyalId)),
            });
        }
    }

    return {
        gecerliKayitlar,
        dislananSorular,
        atlananTestler,
        ozet: {
            incelenenTestSayisi: Array.isArray(testler) ? testler.length : 0,
            atlananTestSayisi: atlananTestler.length,
            gecerliSoruSayisi: gecerliKayitlar.length,
            dislananSoruSayisi: dislananSorular.length,
        },
    };
};

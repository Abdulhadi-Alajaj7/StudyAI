import mongoose from "mongoose";
import {
    TestSistemiHatasi,
    cevabiKaydet as cevabiKaydetService,
    sonGoruntulenenSoruyuGuncelle as sonSoruyuGuncelleService,
    soruIsaretiniGuncelle as soruIsaretiniGuncelleService,
    testOlustur as testOlusturService,
    testSonucunuGetir as testSonucunuGetirService,
    testiBaslat as testiBaslatService,
    testiGetir as testiGetirService,
    testiTamamla as testiTamamlaService,
    testleriListele as testleriListeleService,
} from "../services/testService.js";

const KAPSAM_TURLERI = new Set(["tum_ders", "materyal", "konu"]);
const SORU_SAYILARI = new Set([5, 10, 15, 20]);
const ZORLUKLAR = new Set(["kolay", "orta", "zor", "karisik"]);
const CEVAPLAR = new Set(["A", "B", "C", "D"]);

export const testOlusturmaGirdisiniDogrula = (dersId, girdi = {}) => {
    if (!mongoose.Types.ObjectId.isValid(dersId)) {
        return { hata: "Geçersiz ders kimliği.", kod: "GECERSIZ_DERS_ID" };
    }

    const veri = girdi && typeof girdi === "object" && !Array.isArray(girdi)
        ? girdi
        : {};
    const kapsamTuru = typeof (veri.kapsamTuru ?? veri.tur) === "string"
        ? (veri.kapsamTuru ?? veri.tur).trim()
        : "";
    if (!KAPSAM_TURLERI.has(kapsamTuru)) {
        return {
            hata: "Test kapsamı tum_ders, materyal veya konu olmalıdır.",
            kod: "GECERSIZ_TEST_KAPSAMI",
        };
    }

    const soruSayisi = veri.soruSayisi === undefined ? 10 : Number(veri.soruSayisi);
    if (!SORU_SAYILARI.has(soruSayisi)) {
        return {
            hata: "Soru sayısı 5, 10, 15 veya 20 olmalıdır.",
            kod: "GECERSIZ_SORU_SAYISI",
        };
    }

    const zorluk = veri.zorluk === undefined
        ? "karisik"
        : (typeof veri.zorluk === "string" ? veri.zorluk.trim() : "");
    if (!ZORLUKLAR.has(zorluk)) {
        return {
            hata: "Zorluk kolay, orta, zor veya karisik olmalıdır.",
            kod: "GECERSIZ_ZORLUK",
        };
    }

    const materyalId = typeof veri.materyalId === "string"
        ? veri.materyalId.trim()
        : "";
    const konuId = typeof veri.konuId === "string" ? veri.konuId.trim() : "";
    if (kapsamTuru === "materyal") {
        if (!mongoose.Types.ObjectId.isValid(materyalId)) {
            return {
                hata: "Materyal kapsamı için geçerli bir materyal kimliği gereklidir.",
                kod: "GECERSIZ_MATERYAL_ID",
            };
        }
        if (konuId) {
            return {
                hata: "Materyal kapsamında konu kimliği gönderilemez.",
                kod: "GECERSIZ_TEST_HEDEFI",
            };
        }
    } else if (kapsamTuru === "konu") {
        if (!konuId || konuId.length > 200) {
            return {
                hata: "Konu kapsamı için geçerli bir konu kimliği gereklidir.",
                kod: "GECERSIZ_KONU_ID",
            };
        }
        if (materyalId) {
            return {
                hata: "Konu kapsamında materyal kimliği gönderilemez.",
                kod: "GECERSIZ_TEST_HEDEFI",
            };
        }
    } else if (materyalId || konuId) {
        return {
            hata: "Tüm ders kapsamında materyal veya konu hedefi gönderilemez.",
            kod: "GECERSIZ_TEST_HEDEFI",
        };
    }

    return {
        kapsamTuru,
        soruSayisi,
        zorluk,
        materyalId: kapsamTuru === "materyal" ? materyalId : null,
        konuId: kapsamTuru === "konu" ? konuId : "",
    };
};

export const testKimlikleriniDogrula = ({ dersId, testId, soruId = null }) => {
    if (!mongoose.Types.ObjectId.isValid(dersId)) {
        return { hata: "Geçersiz ders kimliği.", kod: "GECERSIZ_DERS_ID" };
    }
    if (!mongoose.Types.ObjectId.isValid(testId)) {
        return { hata: "Geçersiz test kimliği.", kod: "GECERSIZ_TEST_ID" };
    }
    if (soruId != null && !mongoose.Types.ObjectId.isValid(soruId)) {
        return { hata: "Geçersiz soru kimliği.", kod: "GECERSIZ_SORU_ID" };
    }
    return { dersId, testId, ...(soruId == null ? {} : { soruId }) };
};

export const cevapGirdisiniDogrula = (girdi = {}) => {
    const veri = girdi && typeof girdi === "object" ? girdi : {};
    if (veri.cevap === null) return { cevap: null };
    const cevap = typeof veri.cevap === "string"
        ? veri.cevap.trim().toUpperCase()
        : "";
    if (!CEVAPLAR.has(cevap)) {
        return {
            hata: "Cevap A, B, C, D veya boş bırakmak için null olmalıdır.",
            kod: "GECERSIZ_CEVAP",
        };
    }
    return { cevap };
};

export const isaretGirdisiniDogrula = (girdi = {}) => (
    girdi && typeof girdi === "object" && typeof girdi.isaretli === "boolean"
        ? { isaretli: girdi.isaretli }
        : {
            hata: "isaretli alanı true veya false olmalıdır.",
            kod: "GECERSIZ_ISARET_DURUMU",
        }
);

export const sonSoruGirdisiniDogrula = (girdi = {}) => (
    girdi && typeof girdi === "object" &&
    Number.isInteger(girdi.soruIndex) && girdi.soruIndex >= 0
        ? { soruIndex: girdi.soruIndex }
        : {
            hata: "soruIndex sıfır veya daha büyük bir tam sayı olmalıdır.",
            kod: "GECERSIZ_SORU_INDEXI",
        }
);

export const testiSunumaHazirla = (testBelgesi, { inceleme = false } = {}) => {
    const nesne = testBelgesi?.toObject
        ? testBelgesi.toObject()
        : { ...testBelgesi };
    delete nesne.__v;
    delete nesne.kaynakSurumleri;
    delete nesne.kullanilanModel;
    nesne.sorular = (nesne.sorular || []).map((soru) => {
        const guvenliSoru = soru?.toObject ? soru.toObject() : { ...soru };
        if (!inceleme) {
            delete guvenliSoru.dogruCevap;
            delete guvenliSoru.aciklama;
        }
        return guvenliSoru;
    });
    if (!inceleme) delete nesne.sonuc;
    return nesne;
};

const hataYaniti = (res, hata) => {
    if (hata instanceof TestSistemiHatasi) {
        return res.status(hata.status).json({ hata: hata.message, kod: hata.kod });
    }
    if (Number.isInteger(hata?.status) && typeof hata?.kod === "string") {
        return res.status(hata.status).json({ hata: hata.message, kod: hata.kod });
    }
    if (hata?.name === "ValidationError" || hata?.name === "CastError") {
        return res.status(400).json({
            hata: "Gönderilen test bilgileri geçersiz.",
            kod: "GECERSIZ_TEST_VERISI",
        });
    }
    console.error("Test sistemi işlemi hatası:", hata?.message || "Bilinmeyen hata");
    return res.status(500).json({
        hata: "Test sistemi işlemi sırasında bir sunucu hatası oluştu.",
        kod: "TEST_SISTEMI_SUNUCU_HATASI",
    });
};

const servisKimlikleri = (req) => ({
    kullaniciId: req.user._id,
    dersId: req.params.dersId,
    testId: req.params.testId,
});

const kimlikDogrulamaYaniti = (req, res, soruId = null) => {
    const sonuc = testKimlikleriniDogrula({
        dersId: req.params.dersId,
        testId: req.params.testId,
        soruId,
    });
    if (sonuc.hata) {
        res.status(400).json(sonuc);
        return false;
    }
    return true;
};

export const testOlustur = async (req, res) => {
    const girdi = testOlusturmaGirdisiniDogrula(req.params.dersId, req.body);
    if (girdi.hata) return res.status(400).json(girdi);
    try {
        const testBelgesi = await testOlusturService({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            ...girdi,
        });
        return res.status(201).json({
            basarili: true,
            test: testiSunumaHazirla(testBelgesi),
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const testDetayiniGetir = async (req, res) => {
    if (!kimlikDogrulamaYaniti(req, res)) return;
    try {
        const testBelgesi = await testiGetirService(servisKimlikleri(req));
        return res.status(200).json({
            basarili: true,
            test: testiSunumaHazirla(testBelgesi, {
                inceleme: testBelgesi.durum === "tamamlandi",
            }),
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

const testListesiniGetir = async (req, res, tamamlandi) => {
    if (!mongoose.Types.ObjectId.isValid(req.params.dersId)) {
        return res.status(400).json({
            hata: "Geçersiz ders kimliği.",
            kod: "GECERSIZ_DERS_ID",
        });
    }
    try {
        const testler = await testleriListeleService({
            kullaniciId: req.user._id,
            dersId: req.params.dersId,
            tamamlandi,
        });
        return res.status(200).json({
            basarili: true,
            testSayisi: testler.length,
            testler,
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const devamEdenTestleriListele = (req, res) => (
    testListesiniGetir(req, res, false)
);

export const tamamlananTestleriListele = (req, res) => (
    testListesiniGetir(req, res, true)
);

export const testiBaslat = async (req, res) => {
    if (!kimlikDogrulamaYaniti(req, res)) return;
    try {
        const testBelgesi = await testiBaslatService(servisKimlikleri(req));
        return res.status(200).json({
            basarili: true,
            test: testiSunumaHazirla(testBelgesi),
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const cevabiKaydet = async (req, res) => {
    if (!kimlikDogrulamaYaniti(req, res, req.params.soruId)) return;
    const cevapGirdisi = cevapGirdisiniDogrula(req.body);
    if (cevapGirdisi.hata) return res.status(400).json(cevapGirdisi);
    try {
        const testBelgesi = await cevabiKaydetService({
            ...servisKimlikleri(req),
            soruId: req.params.soruId,
            ...cevapGirdisi,
        });
        return res.status(200).json({
            basarili: true,
            soruId: req.params.soruId,
            cevap: cevapGirdisi.cevap,
            updatedAt: testBelgesi.updatedAt,
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const soruIsaretiniGuncelle = async (req, res) => {
    if (!kimlikDogrulamaYaniti(req, res, req.params.soruId)) return;
    const isaretGirdisi = isaretGirdisiniDogrula(req.body);
    if (isaretGirdisi.hata) return res.status(400).json(isaretGirdisi);
    try {
        const testBelgesi = await soruIsaretiniGuncelleService({
            ...servisKimlikleri(req),
            soruId: req.params.soruId,
            ...isaretGirdisi,
        });
        return res.status(200).json({
            basarili: true,
            soruId: req.params.soruId,
            isaretli: isaretGirdisi.isaretli,
            updatedAt: testBelgesi.updatedAt,
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const sonGoruntulenenSoruyuGuncelle = async (req, res) => {
    if (!kimlikDogrulamaYaniti(req, res)) return;
    const sonSoruGirdisi = sonSoruGirdisiniDogrula(req.body);
    if (sonSoruGirdisi.hata) return res.status(400).json(sonSoruGirdisi);
    try {
        const testBelgesi = await sonSoruyuGuncelleService({
            ...servisKimlikleri(req),
            ...sonSoruGirdisi,
        });
        return res.status(200).json({
            basarili: true,
            sonGoruntulenenSoru: testBelgesi.sonGoruntulenenSoru,
            updatedAt: testBelgesi.updatedAt,
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const testiTamamla = async (req, res) => {
    if (!kimlikDogrulamaYaniti(req, res)) return;
    try {
        const sonuc = await testiTamamlaService(servisKimlikleri(req));
        return res.status(200).json({
            basarili: true,
            zatenTamamlandi: sonuc.zatenTamamlandi,
            test: testiSunumaHazirla(sonuc.test, { inceleme: true }),
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

export const testSonucunuGetir = async (req, res) => {
    if (!kimlikDogrulamaYaniti(req, res)) return;
    try {
        const testBelgesi = await testSonucunuGetirService(servisKimlikleri(req));
        return res.status(200).json({
            basarili: true,
            test: testiSunumaHazirla(testBelgesi, { inceleme: true }),
        });
    } catch (hata) {
        return hataYaniti(res, hata);
    }
};

import crypto from "node:crypto";
import MetinParcasi from "../models/MetinParcasi.js";
import { getGeminiClient } from "./geminiService.js";

export const VARSAYILAN_EMBEDDING_MODELI = "gemini-embedding-001";
export const VARSAYILAN_EMBEDDING_BOYUTU = 768;

const pozitifTamSayi = (deger, varsayilan, enFazla = Number.MAX_SAFE_INTEGER) => {
    const sayi = Number.parseInt(deger, 10);
    return Number.isInteger(sayi) && sayi > 0
        ? Math.min(sayi, enFazla)
        : varsayilan;
};

const embeddingBoyutuGetir = (deger) => {
    const boyut = Number.parseInt(deger, 10);
    return Number.isInteger(boyut) && boyut >= 128 && boyut <= 3072
        ? boyut
        : VARSAYILAN_EMBEDDING_BOYUTU;
};

export const embeddingAyarlariGetir = () => ({
    model: process.env.GEMINI_EMBEDDING_MODELI?.trim() || VARSAYILAN_EMBEDDING_MODELI,
    boyut: embeddingBoyutuGetir(process.env.GEMINI_EMBEDDING_BOYUTU),
    batchBoyutu: pozitifTamSayi(process.env.GEMINI_EMBEDDING_BATCH_BOYUTU, 20, 100),
    rpm: pozitifTamSayi(process.env.GEMINI_EMBEDDING_RPM, 90, 10_000),
    tpm: pozitifTamSayi(process.env.GEMINI_EMBEDDING_TPM, 27_000, 10_000_000),
    rpd: pozitifTamSayi(process.env.GEMINI_EMBEDDING_RPD, 900, 1_000_000),
    maksDeneme: pozitifTamSayi(process.env.GEMINI_EMBEDDING_MAKS_DENEME, 3, 5),
});

export const vektoruNormalizeEt = (vektor) => {
    if (!Array.isArray(vektor) || vektor.length === 0) {
        throw new Error("Embedding yanıtı boş veya geçersiz.");
    }

    let karelerToplami = 0;
    for (const deger of vektor) {
        if (!Number.isFinite(deger)) {
            throw new Error("Embedding yanıtında geçersiz sayısal değer var.");
        }
        karelerToplami += deger * deger;
    }

    const norm = Math.sqrt(karelerToplami);
    if (!Number.isFinite(norm) || norm === 0) {
        throw new Error("Embedding vektörünün normu sıfır veya geçersiz.");
    }

    return vektor.map((deger) => deger / norm);
};

export const kosinusBenzerligi = (sol, sag) => {
    if (!Array.isArray(sol) || !Array.isArray(sag) || sol.length === 0 || sol.length !== sag.length) {
        return null;
    }

    let skalerCarpim = 0;
    let solKare = 0;
    let sagKare = 0;

    for (let index = 0; index < sol.length; index++) {
        const solDeger = sol[index];
        const sagDeger = sag[index];
        if (!Number.isFinite(solDeger) || !Number.isFinite(sagDeger)) return null;
        skalerCarpim += solDeger * sagDeger;
        solKare += solDeger * solDeger;
        sagKare += sagDeger * sagDeger;
    }

    if (solKare === 0 || sagKare === 0) return null;
    return skalerCarpim / (Math.sqrt(solKare) * Math.sqrt(sagKare));
};

const bekle = (milisaniye) => new Promise((resolve) => setTimeout(resolve, milisaniye));

let kotaZinciri = Promise.resolve();
let gunlukKotaAnahtari = "";
let gunlukIstekSayisi = 0;
let dakikaIstekleri = [];

const pasifikGunAnahtari = () => new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
}).format(new Date());

const tahminiTokenSayisi = (metinler) => Math.max(
    1,
    Math.ceil(metinler.reduce((toplam, metin) => toplam + String(metin).length, 0) / 3)
);

const kotaSirasinaGir = (tahminiToken, ayarlar, beklet) => {
    const gorev = kotaZinciri.then(async () => {
        const gunAnahtari = pasifikGunAnahtari();
        if (gunAnahtari !== gunlukKotaAnahtari) {
            gunlukKotaAnahtari = gunAnahtari;
            gunlukIstekSayisi = 0;
        }

        if (gunlukIstekSayisi >= ayarlar.rpd) {
            const hata = new Error("Embedding için yapılandırılan günlük istek sınırına ulaşıldı.");
            hata.kod = "EMBEDDING_GUNLUK_LIMIT";
            hata.status = 429;
            throw hata;
        }
        if (tahminiToken > ayarlar.tpm) {
            const hata = new Error("Tek embedding isteği yapılandırılan dakikalık token sınırını aşıyor.");
            hata.kod = "EMBEDDING_TOKEN_LIMIT";
            hata.status = 400;
            throw hata;
        }

        while (true) {
            const simdi = Date.now();
            dakikaIstekleri = dakikaIstekleri.filter((kayit) => simdi - kayit.zaman < 60_000);
            const kullanilanToken = dakikaIstekleri.reduce((toplam, kayit) => toplam + kayit.token, 0);
            if (dakikaIstekleri.length < ayarlar.rpm && kullanilanToken + tahminiToken <= ayarlar.tpm) {
                dakikaIstekleri.push({ zaman: simdi, token: tahminiToken });
                gunlukIstekSayisi += 1;
                return;
            }

            const enEski = dakikaIstekleri[0]?.zaman ?? simdi;
            await beklet(Math.max(50, 60_000 - (simdi - enEski)));
        }
    });

    kotaZinciri = gorev.catch(() => {});
    return gorev;
};

const hataGeciciMi = (hata) => {
    // Yerel RPD sınırı Pasifik gün dönümüne kadar düzelmez; kısa backoff ile
    // yeniden denemek yalnızca isteği geciktirir. Sağlayıcı 429'ları ise sınırlı
    // biçimde retry edilmeye devam eder.
    if (hata?.kod === "EMBEDDING_GUNLUK_LIMIT") return false;
    const durum = hata?.status ?? hata?.statusCode ?? hata?.code;
    const mesaj = String(hata?.message || "").toLowerCase();
    return durum === 429 || (Number(durum) >= 500 && Number(durum) < 600) ||
        mesaj.includes("429") || mesaj.includes("quota") || mesaj.includes("rate limit") ||
        mesaj.includes("timeout") || mesaj.includes("econnreset") || mesaj.includes("temporarily unavailable");
};

const embeddingHatasiniSiniflandir = (hata) => {
    if (hata?.kod) return hata;

    const mesaj = String(hata?.message || "Embedding servisi hatası.");
    const kucuk = mesaj.toLowerCase();
    const sonuc = new Error(mesaj);
    sonuc.cause = hata;

    if (mesaj.includes("429") || kucuk.includes("quota") || kucuk.includes("rate limit")) {
        sonuc.kod = "EMBEDDING_KOTA_ASIMI";
        sonuc.status = 429;
    } else if (mesaj.includes("401") || mesaj.includes("403") || kucuk.includes("api key")) {
        sonuc.kod = "EMBEDDING_YETKISIZ";
        sonuc.status = 503;
    } else if (mesaj.includes("404") || kucuk.includes("not found")) {
        sonuc.kod = "EMBEDDING_MODEL_BULUNAMADI";
        sonuc.status = 503;
    } else {
        sonuc.kod = "EMBEDDING_SERVIS_HATASI";
        sonuc.status = 503;
    }
    return sonuc;
};

const embeddingIstegiYap = async ({
    istemci,
    model,
    contents,
    config,
    ayarlar,
    beklet,
    limitUygula,
}) => {
    let sonHata;
    const metinler = Array.isArray(contents) ? contents : [contents];

    for (let deneme = 1; deneme <= ayarlar.maksDeneme; deneme++) {
        try {
            if (limitUygula) {
                await kotaSirasinaGir(tahminiTokenSayisi(metinler), ayarlar, beklet);
            }
            return await istemci.models.embedContent({ model, contents, config });
        } catch (hata) {
            sonHata = hata;
            if (!hataGeciciMi(hata) || deneme === ayarlar.maksDeneme) break;
            await beklet(500 * (2 ** (deneme - 1)));
        }
    }

    throw embeddingHatasiniSiniflandir(sonHata);
};

const yanitVektorleriniDogrula = (yanit, beklenenAdet, boyut) => {
    const vektorler = yanit?.embeddings?.map((embedding) => embedding?.values) || [];
    if (vektorler.length !== beklenenAdet) {
        throw new Error(`Embedding servisi ${beklenenAdet} yerine ${vektorler.length} vektör döndürdü.`);
    }
    return vektorler.map((vektor) => {
        if (!Array.isArray(vektor) || vektor.length !== boyut) {
            throw new Error(`Embedding boyutu beklenen ${boyut} değeriyle eşleşmiyor.`);
        }
        return vektoruNormalizeEt(vektor);
    });
};

/**
 * Metinler için Gemini embedding üretir. Embedding 1 bir string listesini ayrı
 * vektörler olarak işlediği için batch kullanılır. Embedding 2 çoklu girdiyi tek
 * vektörde birleştirdiğinden metinler kontrollü biçimde tek tek gönderilir.
 */
export const embeddingleriUret = async (metinler, {
    tur = "dokuman",
    baslik = "",
    istemci = null,
    ayarlar = embeddingAyarlariGetir(),
    beklet = bekle,
    limitUygula = true,
} = {}) => {
    if (!Array.isArray(metinler) || metinler.length === 0) return [];
    // SDK'nin kendi retry katmanını kapatıp toplam deneme sayısını burada tek
    // ve ölçülebilir bir noktadan yönetiyoruz.
    const ai = istemci || getGeminiClient({ maxRetries: 0 });
    const embedding2 = ayarlar.model === "gemini-embedding-2";
    const sonuclar = [];

    if (embedding2) {
        for (const metin of metinler) {
            const contents = tur === "sorgu"
                ? `task: search result | query: ${metin}`
                : `title: ${baslik || "none"} | text: ${metin}`;
            const yanit = await embeddingIstegiYap({
                istemci: ai,
                model: ayarlar.model,
                contents,
                config: { outputDimensionality: ayarlar.boyut },
                ayarlar,
                beklet,
                limitUygula,
            });
            sonuclar.push(...yanitVektorleriniDogrula(yanit, 1, ayarlar.boyut));
        }
        return sonuclar;
    }

    for (let index = 0; index < metinler.length; index += ayarlar.batchBoyutu) {
        const grup = metinler.slice(index, index + ayarlar.batchBoyutu);
        const config = {
            outputDimensionality: ayarlar.boyut,
            taskType: tur === "sorgu" ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
        };
        if (tur === "dokuman" && baslik) config.title = baslik;

        const yanit = await embeddingIstegiYap({
            istemci: ai,
            model: ayarlar.model,
            contents: grup.length === 1 ? grup[0] : grup,
            config,
            ayarlar,
            beklet,
            limitUygula,
        });
        sonuclar.push(...yanitVektorleriniDogrula(yanit, grup.length, ayarlar.boyut));
    }

    return sonuclar;
};

const girdiHashi = (icerik, baslik, ayarlar) => crypto
    .createHash("sha256")
    .update(`${ayarlar.model}\0${ayarlar.boyut}\0${baslik}\0${icerik}`)
    .digest("hex");

export const materyalEmbeddingleriniOlustur = async (materyal, islemeId, secenekler = {}) => {
    const ayarlar = secenekler.ayarlar || embeddingAyarlariGetir();
    const baslik = materyal.orijinalDosyaAdi || materyal.dosyaAdi || "none";
    const parcalar = await MetinParcasi.find({
        kullaniciId: materyal.kullaniciId,
        dersId: materyal.dersId,
        materyalId: materyal._id,
        islemeId,
    })
        .select("+embedding icerik parcaIndex")
        .sort({ parcaIndex: 1 })
        .lean();

    if (parcalar.length === 0) {
        return { toplam: 0, apiIleOlusturulan: 0, onbellektenKullanilan: 0, ...ayarlar };
    }

    const hashler = parcalar.map((parca) => girdiHashi(parca.icerik, baslik, ayarlar));
    const onbellekKayitlari = await MetinParcasi.find({
        kullaniciId: materyal.kullaniciId,
        embeddingGirdiHash: { $in: [...new Set(hashler)] },
        embeddingModel: ayarlar.model,
        embeddingBoyutu: ayarlar.boyut,
        embeddingDurumu: "hazir",
    })
        .select("+embedding embeddingGirdiHash")
        .lean();

    const vektorHaritasi = new Map();
    for (const kayit of onbellekKayitlari) {
        if (Array.isArray(kayit.embedding) && kayit.embedding.length === ayarlar.boyut) {
            vektorHaritasi.set(kayit.embeddingGirdiHash, kayit.embedding);
        }
    }

    const eksikHashler = [];
    const eksikMetinler = [];
    for (let index = 0; index < parcalar.length; index++) {
        const hash = hashler[index];
        if (!vektorHaritasi.has(hash) && !eksikHashler.includes(hash)) {
            eksikHashler.push(hash);
            eksikMetinler.push(parcalar[index].icerik);
        }
    }

    try {
        const yeniVektorler = await embeddingleriUret(eksikMetinler, {
            tur: "dokuman",
            baslik,
            ayarlar,
            istemci: secenekler.istemci,
            beklet: secenekler.beklet,
            limitUygula: secenekler.limitUygula,
        });
        eksikHashler.forEach((hash, index) => vektorHaritasi.set(hash, yeniVektorler[index]));

        const simdi = new Date();
        await MetinParcasi.bulkWrite(parcalar.map((parca, index) => ({
            updateOne: {
                filter: { _id: parca._id, islemeId },
                update: {
                    $set: {
                        embedding: vektorHaritasi.get(hashler[index]),
                        embeddingModel: ayarlar.model,
                        embeddingBoyutu: ayarlar.boyut,
                        embeddingGirdiHash: hashler[index],
                        embeddingDurumu: "hazir",
                        embeddingHatasi: "",
                        embeddingOlusturulmaTarihi: simdi,
                    }
                }
            }
        })));

        return {
            toplam: parcalar.length,
            apiIleOlusturulan: eksikHashler.length,
            onbellektenKullanilan: parcalar.length - eksikHashler.length,
            model: ayarlar.model,
            boyut: ayarlar.boyut,
        };
    } catch (hata) {
        const siniflandirilmis = embeddingHatasiniSiniflandir(hata);
        await MetinParcasi.updateMany(
            { materyalId: materyal._id, islemeId },
            {
                $set: {
                    embeddingDurumu: "hata",
                    embeddingHatasi: siniflandirilmis.kod,
                    embeddingModel: ayarlar.model,
                    embeddingBoyutu: ayarlar.boyut,
                },
                $unset: { embedding: 1, embeddingOlusturulmaTarihi: 1 }
            }
        );
        throw siniflandirilmis;
    }
};

export const embeddingKullaniciHatasi = (hata) => {
    if (hata?.kod === "EMBEDDING_KOTA_ASIMI" || hata?.kod === "EMBEDDING_GUNLUK_LIMIT") {
        return "Semantik arama kotası şu anda dolu. Bir süre sonra tekrar deneyin.";
    }
    if (hata?.kod === "EMBEDDING_YETKISIZ") {
        return "Semantik arama servisi yapılandırılamadı. Yönetici GEMINI_API_KEY ayarını kontrol etmeli.";
    }
    if (hata?.kod === "EMBEDDING_MODEL_BULUNAMADI") {
        return "Semantik arama modeli kullanılamıyor. Model yapılandırmasını kontrol edin.";
    }
    return "Semantik arama dizini geçici olarak oluşturulamadı. Daha sonra yeniden deneyin.";
};

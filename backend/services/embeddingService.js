import { geminiHazirlamaHatasiniSiniflandir, geminiRetryBeklemesiniGetir, geminiTanilamasiniLogla } from "../utils/geminiHazirlamaHatasi.js";
import crypto from "node:crypto";
import MetinParcasi from "../models/MetinParcasi.js";
import { getGeminiClient } from "./geminiService.js";
import { sureOlc } from "../utils/islemSuresi.js";

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

const embeddingHatasiniSiniflandir = hata => {
    if (hata?.guvenliHazirlamaHatasi) return hata;
    const sonuc = geminiHazirlamaHatasiniSiniflandir(hata);
    sonuc.hazirlamaKodu = sonuc.kod;
    // Mevcut semantik arama istemcilerinin hata kodlarını koru.
    const kodlar = { GEMINI_429: "EMBEDDING_KOTA_ASIMI", GEMINI_GUNLUK_KOTA: "EMBEDDING_GUNLUK_LIMIT",
        GEMINI_503: "EMBEDDING_SERVIS_HATASI", GEMINI_YAPILANDIRMA: "EMBEDDING_YETKISIZ", GEMINI_MODEL_BULUNAMADI: "EMBEDDING_MODEL_BULUNAMADI" };
    sonuc.kod = kodlar[sonuc.kod] || sonuc.kod;
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
    sahipligiDogrula,
}) => {
    let sonHata;
    const metinler = Array.isArray(contents) ? contents : [contents];

    for (let deneme = 1; deneme <= ayarlar.maksDeneme; deneme++) {
        const baslangic = performance.now();
        try {
            await sahipligiDogrula?.();
            if (limitUygula) {
                await kotaSirasinaGir(tahminiTokenSayisi(metinler), ayarlar, beklet);
            }
            await sahipligiDogrula?.();
            const yanit = await istemci.models.embedContent({ model, contents, config });
            geminiTanilamasiniLogla({ asama: "embedding", model, deneme, sureMs: performance.now() - baslangic, yanit });
            return yanit;
        } catch (hata) {
            sonHata = embeddingHatasiniSiniflandir(hata);
            geminiTanilamasiniLogla({ asama: "embedding", model, deneme, sureMs: performance.now() - baslangic, hata: sonHata });
            const bekleme = geminiRetryBeklemesiniGetir(sonHata, deneme);
            if (deneme === ayarlar.maksDeneme || bekleme == null) break;
            await beklet(bekleme);
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
    sahipligiDogrula,
    partiKaydet,
} = {}) => {
    if (!Array.isArray(metinler) || metinler.length === 0) return [];
    // Kurulu SDK'nin models çağrıları tek HTTP isteği yapar; sınırlı retry yukarıdadır.
    const ai = istemci || getGeminiClient({ timeout: 60_000 });
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
                sahipligiDogrula,
            });
            const vektorler = yanitVektorleriniDogrula(yanit, 1, ayarlar.boyut);
            await partiKaydet?.(sonuclar.length, vektorler);
            sonuclar.push(...vektorler);
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
            sahipligiDogrula,
        });
        const vektorler = yanitVektorleriniDogrula(yanit, grup.length, ayarlar.boyut);
        await partiKaydet?.(index, vektorler);
        sonuclar.push(...vektorler);
    }

    return sonuclar;
};

const girdiHashi = (icerik, baslik, ayarlar) => crypto
    .createHash("sha256")
    .update(`${ayarlar.model}\0${ayarlar.boyut}\0${baslik}\0${icerik}`)
    .digest("hex");

const vektorGecerliMi = (vektor, boyut) => Array.isArray(vektor) && vektor.length === boyut &&
    vektor.every(Number.isFinite) && vektor.some(v => v !== 0);
const parcaEmbeddingiGuncelMi = (parca, baslik, ayarlar) => parca.embeddingDurumu === "hazir" &&
    parca.embeddingModel === ayarlar.model && parca.embeddingBoyutu === ayarlar.boyut &&
    parca.embeddingGirdiHash === girdiHashi(parca.icerik, baslik, ayarlar) && vektorGecerliMi(parca.embedding, ayarlar.boyut);
const embeddingParcalariniGetir = (materyal, islemeId) => MetinParcasi.find({
    kullaniciId: materyal.kullaniciId, dersId: materyal.dersId, materyalId: materyal._id, islemeId,
}).select("+embedding icerik parcaIndex embeddingGirdiHash embeddingModel embeddingBoyutu embeddingDurumu").sort({ parcaIndex: 1 }).lean();

export const materyalEmbeddingHazirliginiKontrolEt = async (materyal, islemeId, ayarlar = embeddingAyarlariGetir()) => {
    const parcalar = await embeddingParcalariniGetir(materyal, islemeId);
    const baslik = materyal.orijinalDosyaAdi || materyal.dosyaAdi || "none";
    const eksikParcaSayisi = parcalar.filter(p => !parcaEmbeddingiGuncelMi(p, baslik, ayarlar)).length;
    return { toplam: parcalar.length, hazirMi: parcalar.length > 0 && eksikParcaSayisi === 0, eksikParcaSayisi,
        model: ayarlar.model, boyut: ayarlar.boyut };
};

export const materyalEmbeddingleriniOlustur = async (materyal, islemeId, secenekler = {}) => {
    const ayarlar = secenekler.ayarlar || embeddingAyarlariGetir();
    const baslik = materyal.orijinalDosyaAdi || materyal.dosyaAdi || "none";
    const parcalar = await embeddingParcalariniGetir(materyal, islemeId);
    if (!parcalar.length) return { toplam: 0, apiIleOlusturulan: 0, onbellektenKullanilan: 0, ...ayarlar };
    const hashler = parcalar.map(p => girdiHashi(p.icerik, baslik, ayarlar));
    const hazirKimlikler = new Set(parcalar.filter(p => parcaEmbeddingiGuncelMi(p, baslik, ayarlar)).map(p => String(p._id)));
    if (hazirKimlikler.size === parcalar.length) return { toplam: parcalar.length, apiIleOlusturulan: 0,
        onbellektenKullanilan: parcalar.length, model: ayarlar.model, boyut: ayarlar.boyut };
    const onbellekKayitlari = await MetinParcasi.find({
        kullaniciId: materyal.kullaniciId,
        embeddingGirdiHash: { $in: [...new Set(hashler)] },
        embeddingModel: ayarlar.model,
        embeddingBoyutu: ayarlar.boyut,
        embeddingDurumu: "hazir",
    })
        .select("+embedding embeddingGirdiHash")
        .lean();

    const vektorHaritasi = new Map(parcalar.filter(p => hazirKimlikler.has(String(p._id))).map((p) => [p.embeddingGirdiHash, p.embedding]));
    for (const kayit of onbellekKayitlari) {
        if (vektorGecerliMi(kayit.embedding, ayarlar.boyut)) {
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
            sahipligiDogrula: secenekler.sahipligiDogrula,
            // Sonraki parti hata verse de başarılı API sonuçları korunur.
            partiKaydet: async (baslangic, vektorler) => {
                await secenekler.sahipligiDogrula?.();
                const parti = new Map(vektorler.map((vektor, i) => [eksikHashler[baslangic + i], vektor]));
                await sureOlc("embedding_veritabani_kaydi", () => MetinParcasi.bulkWrite(parcalar.flatMap((parca, i) => parti.has(hashler[i]) && !hazirKimlikler.has(String(parca._id)) ? [{
                    updateOne: {
                        filter: { _id: parca._id, islemeId },
                        update: { $set: {
                            embedding: parti.get(hashler[i]), embeddingModel: ayarlar.model,
                            embeddingBoyutu: ayarlar.boyut, embeddingGirdiHash: hashler[i],
                            embeddingDurumu: "hazir", embeddingHatasi: "", embeddingOlusturulmaTarihi: new Date(),
                        } },
                    },
                }] : [])));
            },
        });
        eksikHashler.forEach((hash, index) => vektorHaritasi.set(hash, yeniVektorler[index]));

        await secenekler.sahipligiDogrula?.();
        const simdi = new Date();
        const yeniHashler = new Set(eksikHashler);
        // Yeni partiler zaten kaydedildi; yalnız önbellekten alınanları bu sürüme yaz.
        const onbellekYazmalari = parcalar.flatMap((parca, index) => yeniHashler.has(hashler[index]) || hazirKimlikler.has(String(parca._id)) ? [] : [{
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
        }]);
        if (onbellekYazmalari.length) {
            await sureOlc("embedding_veritabani_kaydi", () => MetinParcasi.bulkWrite(onbellekYazmalari));
        }

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
            { materyalId: materyal._id, islemeId, embeddingDurumu: { $ne: "hazir" } },
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

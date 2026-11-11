import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { materyalEmbeddingleriniOlustur } from "./embeddingService.js";
import { konuHaritasiUretVeKaydet, konuHaritasiGuncellikKontrolu } from "./konuHaritasiService.js";
import { konuHaritasiKilitAlmaKosulu } from "./konuHaritasiKilitService.js";
import { dersOnayiniTamamla } from "./dersOnayService.js";
import { sureOlc } from "../utils/islemSuresi.js";

const LEASE_MS = 5 * 60 * 1000;
const sorun = (mesaj, status = 409) => Object.assign(new Error(mesaj), { status });
const sahiplik = (dersId, kullaniciId, token) => ({
    _id: dersId, kullaniciId, hazirlamaToken: token, hazirlamaDurumu: "isleniyor",
    materyallerOnaylandi: { $ne: true }, temizleniyor: { $ne: true },
    $expr: { $gt: ["$hazirlamaSonYenileme", { $subtract: ["$$NOW", LEASE_MS] }] },
});

export const hazirlamaHatasiniAcikla = (hata) => {
    const status = Number(hata?.status ?? hata?.statusCode ?? hata?.code);
    const mesaj = String(hata?.message || "");
    if (status === 429 || /429|quota|rate limit/i.test(mesaj)) {
        return { kod: "GEMINI_429", mesaj: "Gemini istek kotası dolu. Bir süre sonra yeniden deneyin; dosyalarınız ve hazır işlemler korundu." };
    }
    if (status === 503 || /503|unavailable/i.test(mesaj)) {
        return { kod: "GEMINI_503", mesaj: "Gemini geçici olarak kullanılamıyor. Yeniden deneyebilirsiniz; dosyalarınız ve hazır işlemler korundu." };
    }
    return { kod: "HAZIRLAMA_HATASI", mesaj: "Ders hazırlanamadı. Materyalleri kontrol edip yeniden deneyin; dosyalarınız ve hazır işlemler korundu." };
};

// Süresi dolan iş otomatik üretilmez. Eski token aynı transaction içinde
// geçersiz kılınır; eski süreç haritayı kaydedemez veya dersi onaylayamaz.
export const yarimKalanHazirlamayiKurtar = async (dersId, kullaniciId) => {
    const session = await mongoose.startSession();
    try {
        await session.withTransaction(async () => {
            const ders = await Ders.findOneAndUpdate({
                _id: dersId, kullaniciId, hazirlamaDurumu: "isleniyor",
                materyallerOnaylandi: { $ne: true },
                $expr: { $lte: [{ $ifNull: ["$hazirlamaSonYenileme", new Date(0)] }, { $subtract: ["$$NOW", LEASE_MS] }] },
            }, { $set: {
                hazirlamaDurumu: "hata", hazirlamaToken: null,
                hazirlamaHataKodu: "HAZIRLAMA_KESILDI",
                hazirlamaHatasi: "Hazırlama işlemi kesildi. Dosyalarınız korundu; yeniden deneyebilir veya materyalleri kontrol edebilirsiniz.",
            } }, { session, new: false }).select("+hazirlamaToken");
            if (!ders) return;
            await KonuHaritasi.updateOne({
                dersId, kullaniciId, aktifIslemToken: ders.hazirlamaToken,
                degisikliklereKilitli: { $ne: true },
            }, { $set: { durum: "hata", aktifIslemToken: null, kilitSonYenilemeTarihi: null } }, { session });
        });
    } finally {
        await session.endSession();
    }
};

export const hazirlamayiBaslat = async (dersId, kullaniciId) => {
    await yarimKalanHazirlamayiKurtar(dersId, kullaniciId);
    const token = new mongoose.Types.ObjectId();
    // Materyal işlemleriyle aynı Ders belgesi üzerinde atomik karşılaştır/yaz.
    const ders = await Ders.findOneAndUpdate({
        _id: dersId, kullaniciId, materyallerOnaylandi: { $ne: true },
        temizleniyor: { $ne: true }, aktifMateryalIslemSayisi: 0,
        hazirlamaDurumu: { $ne: "isleniyor" },
    }, { $set: {
        hazirlamaDurumu: "isleniyor", hazirlamaAsamasi: "metinler",
        hazirlamaToken: token, hazirlamaHatasi: "", hazirlamaHataKodu: "",
    }, $currentDate: { hazirlamaSonYenileme: true } }, { new: true });
    if (ders) return { ders, token, yeni: true };
    const mevcut = await Ders.findOne({ _id: dersId, kullaniciId });
    if (!mevcut) throw sorun("Ders bulunamadı veya yetkiniz yok.", 404);
    if (mevcut.temizleniyor) throw sorun("Ders siliniyor.");
    if (mevcut.materyallerOnaylandi || mevcut.hazirlamaDurumu === "isleniyor") {
        return { ders: mevcut, yeni: false };
    }
    throw sorun("Materyal işlemleri devam ediyor. Tamamlanmasını bekleyin.");
};

const haritayiHazirla = async (ders, kullaniciId, token) => {
    const dersId = ders._id;
    let harita = await KonuHaritasi.findOne({ dersId, kullaniciId });
    if (harita?.durum === "hazir" && !harita.aktifIslemToken &&
        await konuHaritasiGuncellikKontrolu(harita, dersId, kullaniciId)) return;
    const alanlar = { durum: "olusturuluyor", aktifIslemToken: token, olusturmaHatasi: "" };
    if (!harita) {
        harita = await KonuHaritasi.create({ dersId, kullaniciId, ...alanlar, kilitSonYenilemeTarihi: new Date() });
    } else {
        harita = await KonuHaritasi.findOneAndUpdate({
            _id: harita._id, degisikliklereKilitli: { $ne: true }, ...konuHaritasiKilitAlmaKosulu(),
        }, { $set: alanlar, $currentDate: { kilitSonYenilemeTarihi: true } }, { new: true });
    }
    if (!harita) throw sorun("Konu haritası işlemi devam ediyor.");
    // Full algoritma: 80.000 karaktere kadar bir çağrı; büyük girdide grup + birleştirme.
    const sonuc = await konuHaritasiUretVeKaydet(ders, kullaniciId, token);
    if (!sonuc || !await konuHaritasiGuncellikKontrolu(sonuc, dersId, kullaniciId)) {
        throw sorun("Konu haritası kaynakları doğrulanamadı.");
    }
};

export const dersiHazirla = async (ders, kullaniciId, token) => sureOlc("toplam_hazirlama", async () => {
    const filtre = sahiplik(ders._id, kullaniciId, token);
    let heartbeatHatasi = null;
    let yenileme = null;
    const dogrula = async (asama) => {
        if (heartbeatHatasi) throw heartbeatHatasi;
        const sonuc = await Ders.updateOne(filtre, {
            ...(asama ? { $set: { hazirlamaAsamasi: asama } } : {}),
            $currentDate: { hazirlamaSonYenileme: true },
        });
        if (sonuc.matchedCount !== 1) throw sorun("Hazırlama işlem sahipliği kaybedildi.");
    };
    const timer = setInterval(() => {
        if (yenileme) return;
        yenileme = dogrula().catch((hata) => { heartbeatHatasi = hata; }).finally(() => { yenileme = null; });
    }, 30_000);
    timer.unref?.();
    try {
        await dogrula("metinler");
        const materyaller = await Materyal.find({ dersId: ders._id, kullaniciId }).select("-cikarilanMetin").lean();
        if (!materyaller.length || materyaller.some(m => m.durum !== "hazir" || !m.aktifIslemeId)) {
            throw sorun("Tüm materyallerin metinleri hazır olmalıdır.");
        }
        for (const materyal of materyaller) {
            const adet = await MetinParcasi.countDocuments({
                dersId: ders._id, kullaniciId, materyalId: materyal._id, islemeId: materyal.aktifIslemeId,
            });
            if (!adet) throw sorun("Materyalin metin parçaları bulunamadı.");
        }
        // Sıralı üretim kota patlamasını ve embedding hatasında boşa harita çağrısını önler.
        await dogrula("embedding");
        await sureOlc("embedding", async () => {
            for (const materyal of materyaller) {
                await dogrula();
                const sonuc = await materyalEmbeddingleriniOlustur(materyal, materyal.aktifIslemeId, { sahipligiDogrula: dogrula });
                await dogrula();
                if (!sonuc.toplam) throw sorun("Embedding parçaları bulunamadı.");
                await Materyal.updateOne({ _id: materyal._id, aktifIslemeId: materyal.aktifIslemeId }, { $set: {
                    embeddingDurumu: "hazir", embeddingHatasi: "", embeddingModel: sonuc.model, embeddingBoyutu: sonuc.boyut,
                } });
            }
        });
        await dogrula("harita");
        await sureOlc("konu_haritasi", () => haritayiHazirla(ders, kullaniciId, token));
        await dogrula();
        await sureOlc("onay_veritabani_kaydi", () => dersOnayiniTamamla(ders._id, kullaniciId, token));
    } catch (hata) {
        const aciklama = hazirlamaHatasiniAcikla(hata);
        console.warn("[DersHazirlama]", { kod: aciklama.kod });
        // Token koşulu, eski bir işin yeni işin durumunu bozmasını önler.
        await Ders.updateOne({ _id: ders._id, kullaniciId, hazirlamaToken: token, hazirlamaDurumu: "isleniyor" }, { $set: {
            hazirlamaDurumu: "hata", hazirlamaToken: null,
            hazirlamaHatasi: aciklama.mesaj, hazirlamaHataKodu: aciklama.kod,
        } });
    } finally {
        clearInterval(timer);
        if (yenileme) await yenileme;
    }
});

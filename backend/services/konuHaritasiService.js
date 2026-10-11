import mongoose from "mongoose";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { geminiIleKonuHaritasiUret, VARSAYILAN_GEMINI_MODELI } from "./geminiService.js";

/**
 * Bir dersin hazır ve aktif sürümdeki metin parçalarını toplar ve temizler.
 * Yalnızca Materyal.durum === "hazir" ve Materyal.aktifIslemeId ile eşleşen
 * MetinParcasi parçalarını çeker (Staging veya eski sürümler dahil edilmez).
 * 
 * @param {mongoose.Types.ObjectId} dersId 
 * @param {mongoose.Types.ObjectId} kullaniciId 
 * @returns {Promise<{ hazirMateryaller: Array, metinParcalari: Array, birlestirilmisMetin: string }>}
 */
export const aktifMateryalMetinleriniTopla = async (dersId, kullaniciId) => {
    // 1. Kullanıcının bu derse ait hazır durumdaki materyallerini bul
    const hazirMateryaller = await Materyal.find({
        dersId,
        kullaniciId,
        durum: "hazir",
        aktifIslemeId: { $ne: null }
    }).select("_id dosyaAdi orijinalDosyaAdi aktifIslemeId");

    if (!hazirMateryaller || hazirMateryaller.length === 0) {
        return { hazirMateryaller: [], metinParcalari: [], birlestirilmisMetin: "" };
    }

    // 2. Her materyalin sadece aktifIslemeId'sine ait olan metin parçalarını çek
    const materyalFiltreleri = hazirMateryaller.map(m => ({
        materyalId: m._id,
        islemeId: m.aktifIslemeId
    }));

    const metinParcalari = await MetinParcasi.find({
        dersId,
        kullaniciId,
        $or: materyalFiltreleri
    }).sort({ materyalId: 1, parcaIndex: 1 });

    if (!metinParcalari || metinParcalari.length === 0) {
        return { hazirMateryaller, metinParcalari: [], birlestirilmisMetin: "" };
    }

    // 3. Maliyet ve Prompt Token Kontrolü:
    // Metin parçaları materyallere göre düzenlenir ve prompt sınırını aşmayacak şekilde birleştirilir.
    // Her materyal için başlık ayracı ve parça içerikleri eklenir.
    const materyalGrup = {};
    for (const m of hazirMateryaller) {
        materyalGrup[m._id.toString()] = {
            dosyaAdi: m.orijinalDosyaAdi || m.dosyaAdi,
            parcalar: []
        };
    }

    for (const p of metinParcalari) {
        const matIdStr = p.materyalId.toString();
        if (materyalGrup[matIdStr]) {
            materyalGrup[matIdStr].parcalar.push(p.icerik);
        }
    }

    const metinBloklari = [];
    const MAKSIMUM_TOPLAM_KARAKTER = 120000; // ~30.000 token civarı, tek prompt için ideal maliyet ve performans dengesi
    let toplamKarakter = 0;

    for (const matId of Object.keys(materyalGrup)) {
        const grup = materyalGrup[matId];
        metinBloklari.push(`\n=== MATERYAL: ${grup.dosyaAdi} ===\n`);
        
        for (const parca of grup.parcalar) {
            if (toplamKarakter + parca.length > MAKSIMUM_TOPLAM_KARAKTER) {
                // Sınır aşıldığında diğer materyallerden de temsil edilmesi için kontrollü kesit al
                break;
            }
            metinBloklari.push(parca);
            toplamKarakter += parca.length;
        }
    }

    const birlestirilmisMetin = metinBloklari.join("\n\n");
    return { hazirMateryaller, metinParcalari, birlestirilmisMetin };
};

/**
 * Ders için konu haritası üretimini yöneten arka plan koordinatörü.
 * 
 * @param {object} ders - Ders belgesi
 * @param {mongoose.Types.ObjectId} kullaniciId 
 * @param {mongoose.Types.ObjectId} islemToken - Bu çalıştırma için atanmış eşzamanlılık tokenı
 * @param {string} [modelAdi] 
 */
export const konuHaritasiUretVeKaydet = async (ders, kullaniciId, islemToken, modelAdi = VARSAYILAN_GEMINI_MODELI) => {
    try {
        // 1. Aktif ve hazır materyal metinlerini topla
        const { hazirMateryaller, metinParcalari, birlestirilmisMetin } = await aktifMateryalMetinleriniTopla(ders._id, kullaniciId);

        if (hazirMateryaller.length === 0) {
            throw new Error("Derste hazır durumda hiç materyal bulunamadı.");
        }
        if (metinParcalari.length === 0 || !birlestirilmisMetin.trim()) {
            throw new Error("Hazır materyallerin aktif sürümünde işlenmiş metin parçası bulunamadı.");
        }

        // 2. Kontrol noktası: Harita veya ders bu süreçte silindi mi ya da yeni işlem başlatıldı mı?
        const kilitliHarita = await KonuHaritasi.findOne({
            dersId: ders._id,
            aktifIslemToken: islemToken,
            durum: "olusturuluyor"
        });

        if (!kilitliHarita) {
            // İşlem iptal edilmiş veya başka bir istek devralmış
            return null;
        }

        // 3. Gemini ile yapılandırılmış konu hiyerarşisi üret
        const hamKonular = await geminiIleKonuHaritasiUret(
            birlestirilmisMetin,
            { dersAdi: ders.dersAdi, aciklama: ders.aciklama, donem: ders.donem },
            modelAdi
        );

        // 4. Konulara kalıcı, benzersiz kimlikler (UUID/String) ve sıra ata
        let toplamAlt = 0;
        const kaliciAnaKonular = hamKonular.map((ana, aIndex) => {
            const anaKonuId = `top-${ders._id.toString().slice(-4)}-${aIndex + 1}`;
            
            const altlar = (ana.altKonular || []).map((alt, subIndex) => {
                toplamAlt++;
                return {
                    konuId: `sub-${ders._id.toString().slice(-4)}-${aIndex + 1}-${subIndex + 1}`,
                    baslik: alt.baslik,
                    aciklama: alt.aciklama || "",
                    sira: alt.sira || subIndex + 1
                };
            });

            return {
                konuId: anaKonuId,
                baslik: ana.baslik,
                aciklama: ana.aciklama || "",
                sira: ana.sira || aIndex + 1,
                altKonular: altlar
            };
        });

        const kaynakMateryaller = hazirMateryaller.map(m => ({
            materyalId: m._id,
            aktifIslemeId: m.aktifIslemeId,
            dosyaAdi: m.orijinalDosyaAdi || m.dosyaAdi
        }));

        // 5. Atomik Taahhüt (Commit): Harita kaydını başarıyla güncelle
        const guncellenenHarita = await KonuHaritasi.findOneAndUpdate(
            { dersId: ders._id, aktifIslemToken: islemToken },
            {
                $set: {
                    durum: "hazir",
                    olusturmaHatasi: "",
                    anaKonular: kaliciAnaKonular,
                    toplamAnaKonuSayisi: kaliciAnaKonular.length,
                    toplamAltKonuSayisi: toplamAlt,
                    kaynakMateryaller,
                    kullanilanModel: modelAdi,
                    sonOlusturmaTarihi: new Date(),
                    aktifIslemToken: null
                }
            },
            { new: true }
        );

        return guncellenenHarita;
    } catch (hata) {
        console.error(`Konu Haritası oluşturma hatası (Ders ID: ${ders._id}):`, hata.message);

        // Hata durumunda var olan eski başarılı haritayı bozmadan, sadece hata durumunu kaydet
        await KonuHaritasi.findOneAndUpdate(
            { dersId: ders._id, aktifIslemToken: islemToken },
            {
                $set: {
                    durum: "hata",
                    olusturmaHatasi: hata.message,
                    aktifIslemToken: null
                }
            }
        );

        throw hata;
    }
};

/**
 * Mevcut konu haritasının, dersteki hazır materyallere göre güncel olup olmadığını denetler.
 * 
 * @param {object} konuHaritasi 
 * @param {mongoose.Types.ObjectId} dersId 
 * @param {mongoose.Types.ObjectId} kullaniciId 
 * @returns {Promise<boolean>} - true ise güncel, false ise güncelliğini yitirmiş (materyal değişmiş/silinmiş/eklenmiş)
 */
export const konuHaritasiGuncellikKontrolu = async (konuHaritasi, dersId, kullaniciId) => {
    if (!konuHaritasi || konuHaritasi.durum !== "hazir") return false;

    // Dersteki şu anki hazır materyalleri al
    const mevcutHazir = await Materyal.find({
        dersId,
        kullaniciId,
        durum: "hazir",
        aktifIslemeId: { $ne: null }
    }).select("_id aktifIslemeId");

    const kayitliKaynaklar = konuHaritasi.kaynakMateryaller || [];

    if (mevcutHazir.length !== kayitliKaynaklar.length) {
        return false;
    }

    const kayitliMap = new Map();
    for (const k of kayitliKaynaklar) {
        kayitliMap.set(k.materyalId.toString(), k.aktifIslemeId?.toString() || "");
    }

    for (const m of mevcutHazir) {
        const matIdStr = m._id.toString();
        const aktifIdStr = m.aktifIslemeId?.toString() || "";
        if (!kayitliMap.has(matIdStr) || kayitliMap.get(matIdStr) !== aktifIdStr) {
            return false;
        }
    }

    return true;
};

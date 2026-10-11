import crypto from "crypto";
import mongoose from "mongoose";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { 
    geminiIleKonuHaritasiUret, 
    geminiIleKonulariBirlestir, 
    VARSAYILAN_GEMINI_MODELI 
} from "./geminiService.js";

/**
 * Başlık ve hiyerarşi temelinde kararlı, benzersiz ve deterministik konu kimliği üretir.
 * Yeniden oluşturmada aynı kavramsal konu korunuyorsa önceki kimliğini korur.
 * 
 * @param {string} dersIdStr 
 * @param {string} baslik 
 * @param {string} [ustKonuBasligi] 
 * @param {boolean} isAltKonu 
 * @returns {string} örn: "top-7a2b9f3c" veya "sub-4d8e1a5f"
 */
export const deterministikKonuIdUret = (dersIdStr, baslik, ustKonuBasligi = "", isAltKonu = false) => {
    const normalizeMetin = (baslik || "")
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/[\s\-_]+/g, " ");

    const ustNormalize = (ustKonuBasligi || "")
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/[\s\-_]+/g, " ");

    const hamGirdi = `${dersIdStr}::${ustNormalize}::${normalizeMetin}`;
    const hash = crypto.createHash("sha256").update(hamGirdi, "utf8").digest("hex").slice(0, 8);

    return isAltKonu ? `sub-${hash}` : `top-${hash}`;
};

/**
 * Bir dersin hazır ve aktif sürümdeki TÜM metin parçalarını gruplar.
 * Hiçbir parça sessizce atlanmaz; büyük içerikler batch'lere bölünür.
 * 
 * @param {mongoose.Types.ObjectId} dersId 
 * @param {mongoose.Types.ObjectId} kullaniciId 
 * @returns {Promise<{ hazirMateryaller: Array, metinGruplari: Array<string>, toplamParcaSayisi: number }>}
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
        return { hazirMateryaller: [], metinGruplari: [], toplamParcaSayisi: 0 };
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
        return { hazirMateryaller, metinGruplari: [], toplamParcaSayisi: 0 };
    }

    // 3. Materyallere göre metinleri düzenle ve kontrollü batch'lere (gruplara) ayır
    // BATCH_MAX_KARAKTER: ~80.000 karakter (yaklaşık 20.000 token). Tek prompt'ta güvenli ve eksiksiz analiz sağlar.
    const BATCH_MAX_KARAKTER = 80000;
    const metinGruplari = [];
    let mevcutGrup = [];
    let mevcutGrupKarakter = 0;

    let sonMateryalId = null;

    for (const parca of metinParcalari) {
        const matIdStr = parca.materyalId.toString();
        const matBilgi = hazirMateryaller.find(m => m._id.toString() === matIdStr);
        const dosyaBasligi = matBilgi ? (matBilgi.orijinalDosyaAdi || matBilgi.dosyaAdi) : "Materyal";

        // Yeni materyale geçildiğinde başlık ekle
        let parcaMetni = parca.icerik || "";
        if (sonMateryalId !== matIdStr) {
            parcaMetni = `\n=== MATERYAL: ${dosyaBasligi} ===\n` + parcaMetni;
            sonMateryalId = matIdStr;
        }

        if (mevcutGrupKarakter + parcaMetni.length > BATCH_MAX_KARAKTER && mevcutGrup.length > 0) {
            metinGruplari.push(mevcutGrup.join("\n\n"));
            mevcutGrup = [parcaMetni];
            mevcutGrupKarakter = parcaMetni.length;
        } else {
            mevcutGrup.push(parcaMetni);
            mevcutGrupKarakter += parcaMetni.length;
        }
    }

    if (mevcutGrup.length > 0) {
        metinGruplari.push(mevcutGrup.join("\n\n"));
    }

    return { 
        hazirMateryaller, 
        metinGruplari, 
        toplamParcaSayisi: metinParcalari.length 
    };
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
        // 1. Analiz başlangıcında aktif ve hazır materyal metinlerini topla
        const { hazirMateryaller, metinGruplari, toplamParcaSayisi } = await aktifMateryalMetinleriniTopla(ders._id, kullaniciId);

        if (hazirMateryaller.length === 0) {
            throw new Error("Derste hazır durumda hiç materyal bulunamadı.");
        }
        if (metinGruplari.length === 0 || toplamParcaSayisi === 0) {
            throw new Error("Hazır materyallerin aktif sürümünde işlenmiş metin parçası bulunamadı.");
        }

        // Başlangıç kaynak anlık görüntüsü
        const baslangicKaynaklar = hazirMateryaller.map(m => ({
            materyalId: m._id.toString(),
            aktifIslemeId: m.aktifIslemeId?.toString() || ""
        }));

        // 2. Kontrol noktası: Harita veya ders bu süreçte silindi mi ya da yeni işlem başlatıldı mı?
        const kilitliHarita = await KonuHaritasi.findOne({
            dersId: ders._id,
            aktifIslemToken: islemToken,
            durum: "olusturuluyor"
        });

        if (!kilitliHarita) {
            return null; // Başka işlem devralmış veya iptal edilmiş
        }

        // 3. Gemini ile Analiz (Batching & Map-Reduce):
        // Eğer 1 grup varsa doğrudan üret; birden fazla grup varsa her birinden ara konuları çıkar ve sentezle
        let hamKonular = [];
        const dersBilgisi = { dersAdi: ders.dersAdi, aciklama: ders.aciklama, donem: ders.donem };

        if (metinGruplari.length === 1) {
            hamKonular = await geminiIleKonuHaritasiUret(metinGruplari[0], dersBilgisi, modelAdi);
        } else {
            const araKonuListeleri = [];
            for (const grupMetin of metinGruplari) {
                const araListe = await geminiIleKonuHaritasiUret(grupMetin, dersBilgisi, modelAdi);
                if (araListe && araListe.length > 0) {
                    araKonuListeleri.push(...araListe);
                }
            }
            hamKonular = await geminiIleKonulariBirlestir(araKonuListeleri, dersBilgisi, modelAdi);
        }

        // 4. Sonucu veritabanına yazmadan önce materyaller değişti mi kontrol et (Eşzamanlılık ve Tutarlılık)
        const guncelHazir = await Materyal.find({
            dersId: ders._id,
            kullaniciId,
            durum: "hazir",
            aktifIslemeId: { $ne: null }
        }).select("_id aktifIslemeId");

        // Kaynak karşılaştırması
        let kaynaklarAyni = (guncelHazir.length === baslangicKaynaklar.length);
        if (kaynaklarAyni) {
            const guncelMap = new Map();
            for (const g of guncelHazir) {
                guncelMap.set(g._id.toString(), g.aktifIslemeId?.toString() || "");
            }
            for (const b of baslangicKaynaklar) {
                if (guncelMap.get(b.materyalId) !== b.aktifIslemeId) {
                    kaynaklarAyni = false;
                    break;
                }
            }
        }

        if (!kaynaklarAyni) {
            // Analiz devam ederken materyaller değişti/silindi/güncellendi.
            // Bu analizi GÜNCEL kabul edip kaydetmeyip, haritayı önceki haline veya hata/güncelleme durumuna çekiyoruz
            await KonuHaritasi.findOneAndUpdate(
                { dersId: ders._id, aktifIslemToken: islemToken },
                {
                    $set: {
                        durum: kilitliHarita.anaKonular?.length > 0 ? "hazir" : "hata",
                        olusturmaHatasi: "Analiz sırasında materyaller değişti. Lütfen konu haritasını yeniden oluşturun.",
                        aktifIslemToken: null
                    }
                }
            );
            return null;
        }

        // 5. Konulara kararlı ve benzersiz kimlikler (deterministik ve önceki haritayla uyumlu) ata
        const dersIdStr = ders._id.toString();
        let toplamAlt = 0;

        // Önceki başarılı haritadaki konuların başlık-kimlik eşleşme haritası
        const eskiKimlikMap = new Map();
        if (kilitliHarita.anaKonular && Array.isArray(kilitliHarita.anaKonular)) {
            for (const eAna of kilitliHarita.anaKonular) {
                if (eAna.baslik && eAna.konuId) {
                    eskiKimlikMap.set(eAna.baslik.trim().toLowerCase(), eAna.konuId);
                }
                if (Array.isArray(eAna.altKonular)) {
                    for (const eAlt of eAna.altKonular) {
                        if (eAlt.baslik && eAlt.konuId) {
                            eskiKimlikMap.set(`${eAna.baslik.trim().toLowerCase()}::${eAlt.baslik.trim().toLowerCase()}`, eAlt.konuId);
                        }
                    }
                }
            }
        }

        const kaliciAnaKonular = hamKonular.map((ana, aIndex) => {
            const anaBaslik = ana.baslik.trim();
            const eskiAnaId = eskiKimlikMap.get(anaBaslik.toLowerCase());
            const anaKonuId = eskiAnaId || deterministikKonuIdUret(dersIdStr, anaBaslik, "", false);
            
            const altlar = (ana.altKonular || []).map((alt, subIndex) => {
                toplamAlt++;
                const altBaslik = alt.baslik.trim();
                const eskiAltId = eskiKimlikMap.get(`${anaBaslik.toLowerCase()}::${altBaslik.toLowerCase()}`);
                const altKonuId = eskiAltId || deterministikKonuIdUret(dersIdStr, altBaslik, anaBaslik, true);

                return {
                    konuId: altKonuId,
                    baslik: altBaslik,
                    aciklama: alt.aciklama || "",
                    sira: alt.sira || subIndex + 1
                };
            });

            return {
                konuId: anaKonuId,
                baslik: anaBaslik,
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

        // 6. Atomik Taahhüt (Commit): Harita kaydını başarıyla güncelle
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
        // Eğer önceden başarılı anaKonular varsa harita durumunu "hazir" tutup hatayı bildiriyoruz; yoksa "hata"
        const mevcut = await KonuHaritasi.findOne({ dersId: ders._id });
        const oncekiBasariliMi = mevcut && mevcut.anaKonular && mevcut.anaKonular.length > 0;

        await KonuHaritasi.findOneAndUpdate(
            { dersId: ders._id, aktifIslemToken: islemToken },
            {
                $set: {
                    durum: oncekiBasariliMi ? "hazir" : "hata",
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

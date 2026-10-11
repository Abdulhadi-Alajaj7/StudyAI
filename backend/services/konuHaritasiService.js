
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

import {
    eskiKonuKimliginiBul
} from "./konuKimlikEslemeService.js";

/**
 * Başlık ve hiyerarşi temelinde deterministik konu ID üretir.
 */
export const deterministikKonuIdUret = (
    dersIdStr,
    baslik,
    ustKonuBasligi = "",
    isAltKonu = false
) => {
    const normalizeMetin = (baslik || "")
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/[\s\-_]+/g, " ");

    const ustNormalize = (ustKonuBasligi || "")
        .trim()
        .toLocaleLowerCase("tr-TR")
        .replace(/[\s\-_]+/g, " ");

    const hamGirdi =
        `${dersIdStr}::${ustNormalize}::${normalizeMetin}`;

    const hash = crypto
        .createHash("sha256")
        .update(hamGirdi, "utf8")
        .digest("hex")
        .slice(0, 8);

    return isAltKonu ? `sub-${hash}` : `top-${hash}`;
};

/**
 * Hazır materyallerin aktif metin parçalarını toplar.
 */
export const aktifMateryalMetinleriniTopla = async (
    dersId,
    kullaniciId
) => {
    const hazirMateryaller = await Materyal.find({
        dersId,
        kullaniciId,
        durum: "hazir",
        aktifIslemeId: { $ne: null }
    }).select("_id dosyaAdi orijinalDosyaAdi aktifIslemeId");

    if (!hazirMateryaller || hazirMateryaller.length === 0) {
        return {
            hazirMateryaller: [],
            metinGruplari: [],
            toplamParcaSayisi: 0
        };
    }

    const materyalFiltreleri = hazirMateryaller.map(m => ({
        materyalId: m._id,
        islemeId: m.aktifIslemeId
    }));

    const metinParcalari = await MetinParcasi.find({
        dersId,
        kullaniciId,
        $or: materyalFiltreleri
    }).sort({
        materyalId: 1,
        parcaIndex: 1
    });

    if (!metinParcalari || metinParcalari.length === 0) {
        return {
            hazirMateryaller,
            metinGruplari: [],
            toplamParcaSayisi: 0
        };
    }

    const BATCH_MAX_KARAKTER = 80000;
    const metinGruplari = [];

    let mevcutGrup = [];
    let mevcutGrupKarakter = 0;
    let sonMateryalId = null;

    for (const parca of metinParcalari) {
        const matIdStr = parca.materyalId.toString();

        const matBilgi = hazirMateryaller.find(
            m => m._id.toString() === matIdStr
        );

        const dosyaBasligi = matBilgi
            ? (matBilgi.orijinalDosyaAdi || matBilgi.dosyaAdi)
            : "Materyal";

        let parcaMetni = parca.icerik || "";

        if (sonMateryalId !== matIdStr) {
            parcaMetni =
                `\n=== MATERYAL: ${dosyaBasligi} ===\n` +
                parcaMetni;

            sonMateryalId = matIdStr;
        }

        if (
            mevcutGrupKarakter + parcaMetni.length >
                BATCH_MAX_KARAKTER &&
            mevcutGrup.length > 0
        ) {
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
 * Konu haritasını üretir ve kaydeder.
 */
export const konuHaritasiUretVeKaydet = async (
    ders,
    kullaniciId,
    islemToken,
    modelAdi = VARSAYILAN_GEMINI_MODELI
) => {
    try {
        const {
            hazirMateryaller,
            metinGruplari,
            toplamParcaSayisi
        } = await aktifMateryalMetinleriniTopla(
            ders._id,
            kullaniciId
        );

        if (hazirMateryaller.length === 0) {
            throw new Error(
                "Derste hazır durumda hiç materyal bulunamadı."
            );
        }

        if (
            metinGruplari.length === 0 ||
            toplamParcaSayisi === 0
        ) {
            throw new Error(
                "Hazır materyallerin aktif sürümünde işlenmiş metin parçası bulunamadı."
            );
        }

        const baslangicKaynaklar = hazirMateryaller.map(m => ({
            materyalId: m._id.toString(),
            aktifIslemeId:
                m.aktifIslemeId?.toString() || ""
        }));

        const kilitliHarita = await KonuHaritasi.findOne({
            dersId: ders._id,
            aktifIslemToken: islemToken,
            durum: "olusturuluyor"
        });

        if (!kilitliHarita) {
            return null;
        }

        let hamKonular = [];

        const dersBilgisi = {
            dersAdi: ders.dersAdi,
            aciklama: ders.aciklama,
            donem: ders.donem
        };

        if (metinGruplari.length === 1) {
            hamKonular = await geminiIleKonuHaritasiUret(
                metinGruplari[0],
                dersBilgisi,
                modelAdi
            );
        } else {
            const araKonuListeleri = [];

            for (const grupMetin of metinGruplari) {
                const araListe =
                    await geminiIleKonuHaritasiUret(
                        grupMetin,
                        dersBilgisi,
                        modelAdi
                    );

                if (araListe && araListe.length > 0) {
                    araKonuListeleri.push(...araListe);
                }
            }

            hamKonular = await geminiIleKonulariBirlestir(
                araKonuListeleri,
                dersBilgisi,
                modelAdi
            );
        }

        // Materyaller analiz sırasında değişti mi?
        const guncelHazir = await Materyal.find({
            dersId: ders._id,
            kullaniciId,
            durum: "hazir",
            aktifIslemeId: { $ne: null }
        }).select("_id aktifIslemeId");

        let kaynaklarAyni =
            guncelHazir.length === baslangicKaynaklar.length;

        if (kaynaklarAyni) {
            const guncelMap = new Map();

            for (const g of guncelHazir) {
                guncelMap.set(
                    g._id.toString(),
                    g.aktifIslemeId?.toString() || ""
                );
            }

            for (const b of baslangicKaynaklar) {
                if (
                    guncelMap.get(b.materyalId) !==
                    b.aktifIslemeId
                ) {
                    kaynaklarAyni = false;
                    break;
                }
            }
        }

        if (!kaynaklarAyni) {
            await KonuHaritasi.findOneAndUpdate(
                {
                    dersId: ders._id,
                    aktifIslemToken: islemToken
                },
                {
                    $set: {
                        durum:
                            kilitliHarita.anaKonular?.length > 0
                                ? "hazir"
                                : "hata",
                        olusturmaHatasi:
                            "Analiz sırasında materyaller değişti. Lütfen konu haritasını yeniden oluşturun.",
                        aktifIslemToken: null
                    }
                }
            );

            return null;
        }

        // =========================================
        // KONU ID EŞLEŞTİRME - YENİ BÖLÜM
        // =========================================

        const dersIdStr = ders._id.toString();
        let toplamAlt = 0;

        const eskiAnaKonular = Array.isArray(
            kilitliHarita.anaKonular
        )
            ? kilitliHarita.anaKonular
            : [];

        const kullanilanKimlikler = new Set();
        const yeniHaritaKimlikleri = new Set();

        // Eski kimliklerin yanlışlıkla başka bir konuya
        // atanmasını önlemek için hepsini ayır.
        const eskiTumKimlikler = new Set();

        for (const eskiAna of eskiAnaKonular) {
            if (eskiAna.konuId) {
                eskiTumKimlikler.add(eskiAna.konuId);
            }

            for (const eskiAlt of eskiAna.altKonular || []) {
                if (eskiAlt.konuId) {
                    eskiTumKimlikler.add(eskiAlt.konuId);
                }
            }
        }

        const kimlikAta = (eskiKimlik, yeniKimlik, tur) => {
            // Önceki konu güvenle eşleşmişse eski ID'yi koru.
            if (
                eskiKimlik &&
                !yeniHaritaKimlikleri.has(eskiKimlik)
            ) {
                yeniHaritaKimlikleri.add(eskiKimlik);
                kullanilanKimlikler.add(eskiKimlik);
                return eskiKimlik;
            }

            let kimlik = yeniKimlik;

            // Yeni ID, başka bir konunun eski ID'sini
            // veya bu haritadaki bir ID'yi kullanmamalı.
            if (
                eskiTumKimlikler.has(kimlik) ||
                yeniHaritaKimlikleri.has(kimlik)
            ) {
                do {
                    kimlik = `${tur}-${crypto.randomUUID()}`;
                } while (
                    eskiTumKimlikler.has(kimlik) ||
                    yeniHaritaKimlikleri.has(kimlik)
                );
            }

            yeniHaritaKimlikleri.add(kimlik);
            return kimlik;
        };

        const kaliciAnaKonular = hamKonular.map(
            (ana, aIndex) => {
                const anaBaslik = ana.baslik.trim();

                const eskiAnaId = eskiKonuKimliginiBul(
                    ana,
                    eskiAnaKonular,
                    kullanilanKimlikler
                );

                const anaKonuId = kimlikAta(
                    eskiAnaId,
                    deterministikKonuIdUret(
                        dersIdStr,
                        anaBaslik,
                        "",
                        false
                    ),
                    "top"
                );

                const eskiAnaKonu = eskiAnaKonular.find(
                    konu => konu.konuId === eskiAnaId
                );

                const eskiAltKonular =
                    eskiAnaKonu?.altKonular || [];

                const altlar = (ana.altKonular || []).map(
                    (alt, subIndex) => {
                        toplamAlt++;

                        const altBaslik = alt.baslik.trim();

                        const eskiAltId =
                            eskiKonuKimliginiBul(
                                alt,
                                eskiAltKonular,
                                kullanilanKimlikler
                            );

                        const altKonuId = kimlikAta(
                            eskiAltId,
                            deterministikKonuIdUret(
                                dersIdStr,
                                altBaslik,
                                anaBaslik,
                                true
                            ),
                            "sub"
                        );

                        return {
                            konuId: altKonuId,
                            baslik: altBaslik,
                            aciklama: alt.aciklama || "",
                            sira: alt.sira || subIndex + 1
                        };
                    }
                );

                return {
                    konuId: anaKonuId,
                    baslik: anaBaslik,
                    aciklama: ana.aciklama || "",
                    sira: ana.sira || aIndex + 1,
                    altKonular: altlar
                };
            }
        );

        // =========================================
        // KONU ID EŞLEŞTİRME SONU
        // =========================================

        const kaynakMateryaller = hazirMateryaller.map(m => ({
            materyalId: m._id,
            aktifIslemeId: m.aktifIslemeId,
            dosyaAdi:
                m.orijinalDosyaAdi || m.dosyaAdi
        }));

        const guncellenenHarita =
            await KonuHaritasi.findOneAndUpdate(
                {
                    dersId: ders._id,
                    aktifIslemToken: islemToken
                },
                {
                    $set: {
                        durum: "hazir",
                        olusturmaHatasi: "",
                        anaKonular: kaliciAnaKonular,
                        toplamAnaKonuSayisi:
                            kaliciAnaKonular.length,
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
        console.error(
            `Konu Haritası oluşturma hatası (Ders ID: ${ders._id}):`,
            hata.message
        );

        const mevcut = await KonuHaritasi.findOne({
            dersId: ders._id
        });

        const oncekiBasariliMi =
            mevcut &&
            mevcut.anaKonular &&
            mevcut.anaKonular.length > 0;

        await KonuHaritasi.findOneAndUpdate(
            {
                dersId: ders._id,
                aktifIslemToken: islemToken
            },
            {
                $set: {
                    durum: oncekiBasariliMi
                        ? "hazir"
                        : "hata",
                    olusturmaHatasi: hata.message,
                    aktifIslemToken: null
                }
            }
        );

        throw hata;
    }
};

/**
 * Konu haritasının güncelliğini kontrol eder.
 */
export const konuHaritasiGuncellikKontrolu = async (
    konuHaritasi,
    dersId,
    kullaniciId
) => {
    if (!konuHaritasi || konuHaritasi.durum !== "hazir") {
        return false;
    }

    const mevcutHazir = await Materyal.find({
        dersId,
        kullaniciId,
        durum: "hazir",
        aktifIslemeId: { $ne: null }
    }).select("_id aktifIslemeId");

    const kayitliKaynaklar =
        konuHaritasi.kaynakMateryaller || [];

    if (mevcutHazir.length !== kayitliKaynaklar.length) {
        return false;
    }

    const kayitliMap = new Map();

    for (const k of kayitliKaynaklar) {
        kayitliMap.set(
            k.materyalId.toString(),
            k.aktifIslemeId?.toString() || ""
        );
    }

    for (const m of mevcutHazir) {
        const matIdStr = m._id.toString();
        const aktifIdStr =
            m.aktifIslemeId?.toString() || "";

        if (
            !kayitliMap.has(matIdStr) ||
            kayitliMap.get(matIdStr) !== aktifIdStr
        ) {
            return false;
        }
    }

    return true;
};


import crypto from "crypto";
import mongoose from "mongoose";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Ders from "../models/Ders.js";

import {
    geminiIleKonuHaritasiUret,
    geminiIleKonulariBirlestir,
    VARSAYILAN_GEMINI_MODELI
} from "./geminiService.js";

import {
    konuBasliginiNormalizeEt,
    konuListesiniEsle
} from "./konuKimlikEslemeService.js";
import {
    konuHaritasiHeartbeatBaslat,
    konuHaritasiKilidiAktifMi,
    konuHaritasiKilitAlmaKosulu
} from "./konuHaritasiKilitService.js";

/**
 * Başlık ve hiyerarşi temelinde deterministik konu ID üretir.
 * Türkçe karakter ve noktalama varyasyonlarına karşı konuBasliginiNormalizeEt ile tutarlı üretilir.
 */
export const deterministikKonuIdUret = (
    dersIdStr,
    baslik,
    ustKonuBasligi = "",
    isAltKonu = false
) => {
    const normalizeMetin = konuBasliginiNormalizeEt(baslik);
    const ustNormalize = konuBasliginiNormalizeEt(ustKonuBasligi);

    const hamGirdi =
        `${dersIdStr}::${isAltKonu ? "sub" : "top"}::${ustNormalize}::${normalizeMetin}`;

    const hash = crypto
        .createHash("sha256")
        .update(hamGirdi, "utf8")
        .digest("hex")
        .slice(0, 8);

    return isAltKonu ? `sub-${hash}` : `top-${hash}`;
};


export const konuSiralariniDuzenle = (konular = []) => {
    return konular.map((ana, anaIndex) => ({
        ...ana,
        sira: anaIndex + 1,
        altKonular: (ana.altKonular || []).map((alt, altIndex) => ({
            ...alt,
            sira: altIndex + 1
        }))
    }));
};

const geminiTekrarlariniTemizle = (konular = []) => {
    const temelBaslik = (baslik) => {
        return konuBasliginiNormalizeEt(baslik || "")
            .replace(/\s+tanimi$/i, "")
            .replace(/\s+ve\s+problemler$/i, "")
            .trim();
    };

    const sonuc = [];
    for (const ana of konular) {
        if (!ana?.baslik?.trim()) continue;

        // Aynı başlık farklı ana konularda farklı öğrenme hedeflerini temsil edebilir.
        // Bu yüzden tekilleştirme havuzu her ana konu için yeniden oluşturulur.
        const gorulenAltlar = new Map();

        const anaKopya = {
            ...ana,
            altKonular: []
        };

        for (const alt of ana.altKonular || []) {
            if (!alt?.baslik?.trim()) continue;

            const anahtar = temelBaslik(alt.baslik);

            if (!anahtar) continue;

            if (!gorulenAltlar.has(anahtar)) {
                const yeniAlt = { ...alt };
                gorulenAltlar.set(anahtar, yeniAlt);
                anaKopya.altKonular.push(yeniAlt);
                continue;
            }

            const mevcutAlt = gorulenAltlar.get(anahtar);

            if (
                (alt.aciklama || "").length >
                (mevcutAlt.aciklama || "").length
            ) {
                mevcutAlt.aciklama = alt.aciklama;
            }
        }

        sonuc.push(anaKopya);
    }

    return sonuc;
};


/**
 * Tek bir materyalin aktif metin parçalarını toplar (incremental analiz için).
 */
export const tekMateryalMetinleriniTopla = async (materyalId, dersId, kullaniciId) => {
    const materyal = await Materyal.findOne({
        _id: materyalId,
        dersId,
        kullaniciId,
        durum: "hazir",
        aktifIslemeId: { $ne: null }
    }).select("_id dosyaAdi orijinalDosyaAdi aktifIslemeId");

    if (!materyal) {
        return { materyal: null, metinBlogu: "" };
    }

    const parcalar = await MetinParcasi.find({
        materyalId: materyal._id,
        islemeId: materyal.aktifIslemeId,
        dersId,
        kullaniciId
    }).sort({ parcaIndex: 1 });

    if (!parcalar || parcalar.length === 0) {
        return { materyal, metinBlogu: "" };
    }

    const dosyaBasligi = materyal.orijinalDosyaAdi || materyal.dosyaAdi;
    const metinBlogu = `\n=== MATERYAL: ${dosyaBasligi} ===\n` +
        parcalar.map(p => p.icerik || "").join("\n\n");

    return { materyal, metinBlogu };
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
    modelAdi = VARSAYILAN_GEMINI_MODELI,
    heartbeatSecenekleri = {}
) => {
    let heartbeat = null;

    try {
        const kilitliHarita = await KonuHaritasi.findOne({
            dersId: ders._id,
            kullaniciId,
            aktifIslemToken: islemToken,
            durum: "olusturuluyor",
            degisikliklereKilitli: { $ne: true }
        });

        if (!kilitliHarita) {
            return null;
        }

        heartbeat = await konuHaritasiHeartbeatBaslat({
            dersId: ders._id,
            kullaniciId,
            islemToken,
            ...heartbeatSecenekleri
        });

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

        let hamKonular = [];

        const dersBilgisi = {
            dersAdi: ders.dersAdi,
            aciklama: ders.aciklama,
            donem: ders.donem
        };

        if (metinGruplari.length === 1) {
            hamKonular = await heartbeat.bekle(geminiIleKonuHaritasiUret(
                metinGruplari[0],
                dersBilgisi,
                modelAdi
            ));
        } else {
            const araKonuListeleri = [];

            for (const grupMetin of metinGruplari) {
                const araListe =
                    await heartbeat.bekle(geminiIleKonuHaritasiUret(
                        grupMetin,
                        dersBilgisi,
                        modelAdi
                    ));

                if (araListe && araListe.length > 0) {
                    araKonuListeleri.push(...araListe);
                }
            }

            hamKonular = await heartbeat.bekle(geminiIleKonulariBirlestir(
                araKonuListeleri,
                dersBilgisi,
                modelAdi
            ));
        }

        await heartbeat.kilidiDogrula();

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
            // Analiz sırasında materyaller değişti!
            // Kilit belirtecini sıfırla, önceki geçerli konuları koru
            const guncelVarMi = guncelHazir.length > 0;
            await KonuHaritasi.findOneAndUpdate(
                {
                    dersId: ders._id,
                    aktifIslemToken: islemToken,
                    degisikliklereKilitli: { $ne: true }
                },
                {
                    $set: {
                        durum:
                            kilitliHarita.anaKonular?.length > 0
                                ? "hazir"
                                : (guncelVarMi ? "hata" : "yok"),
                        olusturmaHatasi: guncelVarMi
                            ? "Analiz sırasında materyaller değişti. Güncel kaynaklar değerlendiriliyor..."
                            : "",
                        aktifIslemToken: null,
                        kilitSonYenilemeTarihi: null
                    }
                }
            );

            // Yeni kaynak durumunun işlem sonunda mutlaka değerlendirilmesini sağla:
            arkaPlandaKonuHaritasiGuncelle(ders._id, kullaniciId).catch((err) => {
                console.error("Yeni kaynak değerlendirme hatası:", err.message);
            });

            return null;
        }

        // =========================================
        // KONU ID EŞLEŞTİRME - YENİ BÖLÜM
        // =========================================
        hamKonular = geminiTekrarlariniTemizle(hamKonular);
        const dersIdStr = ders._id.toString();
        let toplamAlt = 0;

        // 1. Aktif haritadaki konular önceliklidir
        const aktifKonular = (Array.isArray(kilitliHarita.anaKonular) ? kilitliHarita.anaKonular : [])
            .map(k => (typeof k?.toObject === "function" ? k.toObject() : k));

        const arsivKonular = (Array.isArray(kilitliHarita.gecmisKonular) ? kilitliHarita.gecmisKonular : [])
            .map(k => (typeof k?.toObject === "function" ? k.toObject() : k));

        // Tekilleştirilmiş ana konular listesi: aktif olanlar öncelikli
        const birlesikAnaKonular = [];
        const gorulenAnaKonuIdler = new Set();
        const gorulenAnaBasliklar = new Set();

        for (const ana of aktifKonular) {
            if (!ana || !ana.konuId) continue;
            gorulenAnaKonuIdler.add(ana.konuId);
            gorulenAnaBasliklar.add(konuBasliginiNormalizeEt(ana.baslik));
            birlesikAnaKonular.push({
                ...ana,
                _kaynak: "aktif"
            });
        }

        for (const ana of arsivKonular) {
            if (!ana || !ana.konuId) continue;
            const normBaslik = konuBasliginiNormalizeEt(ana.baslik);
            if (!gorulenAnaKonuIdler.has(ana.konuId) && !gorulenAnaBasliklar.has(normBaslik)) {
                gorulenAnaKonuIdler.add(ana.konuId);
                gorulenAnaBasliklar.add(normBaslik);
                birlesikAnaKonular.push({
                    ...ana,
                    _kaynak: "arsiv"
                });
            }
        }

        // 2. Tüm eski alt konular havuzu (ana konu başlığı değişse veya konu taşınsa bile eşleştirebilmek için)
        const tumEskiAltKonular = [];
        const gorulenAltKonuIdler = new Set();

        for (const ana of birlesikAnaKonular) {
            for (const alt of ana.altKonular || []) {
                if (!alt || !alt.konuId) continue;
                if (!gorulenAltKonuIdler.has(alt.konuId)) {
                    gorulenAltKonuIdler.add(alt.konuId);
                    tumEskiAltKonular.push({
                        ...alt,
                        anaKonuId: ana.konuId,
                        anaBaslik: ana.baslik,
                        _kaynak: ana._kaynak
                    });
                }
            }
        }

        const kullanilanKimlikler = new Set();
        const yeniHaritaKimlikleri = new Set();

        // Eski kimliklerin yanlışlıkla başka yeni bir konuya
        // atanmasını önlemek için tümünü ayır.
        const eskiTumKimlikler = new Set();

        for (const ana of birlesikAnaKonular) {
            if (ana.konuId) eskiTumKimlikler.add(ana.konuId);
            for (const alt of ana.altKonular || []) {
                if (alt.konuId) eskiTumKimlikler.add(alt.konuId);
            }
        }
        for (const alt of tumEskiAltKonular) {
            if (alt.konuId) eskiTumKimlikler.add(alt.konuId);
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

        const anaEslesmeleri = konuListesiniEsle(
            hamKonular,
            birlesikAnaKonular,
            [],
            kullanilanKimlikler,
            {}
        );

        const kaliciAnaKonularHam = hamKonular.map(
            (ana, aIndex) => {
                const anaBaslik = ana.baslik.trim();
                const anaEslesme = anaEslesmeleri.get(ana);
                const eskiAnaId = anaEslesme?.eskiId || null;
                const eskiAnaKonu = anaEslesme?.eskiKonu || null;

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

                // Eşleşen eski konularda hem eski konuId hem eski baslik korunur
                const nihaiAnaBaslik = (eskiAnaKonu && eskiAnaKonu.baslik)
                    ? eskiAnaKonu.baslik
                    : anaBaslik;

                const eskiAltKonular = (eskiAnaKonu?.altKonular || []).map(altItem => ({
                    ...(typeof altItem?.toObject === "function" ? altItem.toObject() : altItem),
                    anaKonuId: eskiAnaKonu.konuId,
                    anaBaslik: eskiAnaKonu.baslik,
                    _kaynak: eskiAnaKonu._kaynak
                }));

                const baglam = {
                    ustKonuBasligi: nihaiAnaBaslik,
                    ustKonuId: anaKonuId
                };

                const altEslesmeleri = konuListesiniEsle(
                    ana.altKonular || [],
                    eskiAltKonular,
                    tumEskiAltKonular,
                    kullanilanKimlikler,
                    baglam
                );

                const altlar = (ana.altKonular || []).map(
                    (alt, subIndex) => {
                        toplamAlt++;

                        const altBaslik = alt.baslik.trim();
                        const altEslesme = altEslesmeleri.get(alt);
                        const eskiAltId = altEslesme?.eskiId || null;
                        const eskiAltKonu = altEslesme?.eskiKonu || null;

                        const altKonuId = kimlikAta(
                            eskiAltId,
                            deterministikKonuIdUret(
                                dersIdStr,
                                altBaslik,
                                nihaiAnaBaslik,
                                true
                            ),
                            "sub"
                        );

                        // Eşleşen eski alt konularda hem eski konuId hem eski baslik korunur
                        const nihaiAltBaslik = (eskiAltKonu && eskiAltKonu.baslik)
                            ? eskiAltKonu.baslik
                            : altBaslik;

                        const altKaynakIds = Array.isArray(eskiAltKonu?.kaynakMateryalIds) && eskiAltKonu.kaynakMateryalIds.length > 0
                            ? eskiAltKonu.kaynakMateryalIds
                            : (hazirMateryaller.length === 1 ? [hazirMateryaller[0]._id] : []);

                        return {
                            konuId: altKonuId,
                            baslik: nihaiAltBaslik,
                            aciklama: alt.aciklama || eskiAltKonu?.aciklama || "",
                            sira: alt.sira || subIndex + 1,
                            kaynakMateryalIds: altKaynakIds
                        };
                    }
                );

                const anaKaynakIds = Array.isArray(eskiAnaKonu?.kaynakMateryalIds) && eskiAnaKonu.kaynakMateryalIds.length > 0
                    ? eskiAnaKonu.kaynakMateryalIds
                    : (hazirMateryaller.length === 1 ? [hazirMateryaller[0]._id] : []);

                return {
                    konuId: anaKonuId,
                    baslik: nihaiAnaBaslik,
                    aciklama: ana.aciklama || eskiAnaKonu?.aciklama || "",
                    sira: ana.sira || aIndex + 1,
                    kaynakMateryalIds: anaKaynakIds,
                    altKonular: altlar
                };
            }
        );
        const kaliciAnaKonular = konuSiralariniDuzenle(kaliciAnaKonularHam);

        // =========================================
        // KONU ID EŞLEŞTİRME SONU
        // =========================================

        const kaynakMateryaller = hazirMateryaller.map(m => ({
            materyalId: m._id,
            aktifIslemeId: m.aktifIslemeId,
            dosyaAdi:
                m.orijinalDosyaAdi || m.dosyaAdi
        }));

        // Geçmiş konuları tekil olarak (konuId bazında) birleştir ve kaydet
        const guncelGecmisMap = new Map();

        for (const eski of (kilitliHarita.gecmisKonular || [])) {
            const doc = typeof eski?.toObject === "function" ? eski.toObject() : eski;
            if (doc?.konuId) {
                guncelGecmisMap.set(doc.konuId, doc);
            }
        }

        for (const aktif of (kilitliHarita.anaKonular || [])) {
            const doc = typeof aktif?.toObject === "function" ? aktif.toObject() : aktif;
            if (doc?.konuId) {
                guncelGecmisMap.set(doc.konuId, doc);
            }
        }

        for (const yeni of kaliciAnaKonular) {
            if (yeni?.konuId) {
                guncelGecmisMap.set(yeni.konuId, yeni);
            }
        }

        const nihaiGecmisKonular = Array.from(guncelGecmisMap.values());

        await heartbeat.kilidiDogrula();

        // Analiz sürerken ders onaylanmış veya silinmeye başlamış olabilir.
        // Eski analiz sonucunu böyle bir derse yazma.
        const guncelDers = await Ders.findOne({
            _id: ders._id,
            kullaniciId,
            materyallerOnaylandi: { $ne: true },
            temizleniyor: { $ne: true }
        });

        if (!guncelDers) {
            await KonuHaritasi.findOneAndUpdate(
                {
                    dersId: ders._id,
                    aktifIslemToken: islemToken,
                    degisikliklereKilitli: { $ne: true }
                },
                {
                    $set: {
                        durum: kilitliHarita.anaKonular?.length > 0 ? "hazir" : "hata",
                        olusturmaHatasi: "Ders onaylandı veya silinmeye başladığı için analiz sonucu kaydedilmedi.",
                        aktifIslemToken: null,
                        kilitSonYenilemeTarihi: null
                    }
                }
            );
            return null;
        }

        const guncellenenHarita =
            await KonuHaritasi.findOneAndUpdate(
                {
                    dersId: ders._id,
                    aktifIslemToken: islemToken,
                    degisikliklereKilitli: { $ne: true }
                },
                {
                    $set: {
                        durum: "hazir",
                        olusturmaHatasi: "",
                        anaKonular: kaliciAnaKonular,
                        gecmisKonular: nihaiGecmisKonular,
                        toplamAnaKonuSayisi:
                            kaliciAnaKonular.length,
                        toplamAltKonuSayisi: toplamAlt,
                        kaynakMateryaller,
                        kullanilanModel: modelAdi,
                        sonOlusturmaTarihi: new Date(),
                        aktifIslemToken: null,
                        kilitSonYenilemeTarihi: null
                    }
                },
                { new: true }
            );

        // İşlem tamamlandıktan sonra yeni kaynak durumunu güvence altına al
        if (guncellenenHarita) {
            konuHaritasiGuncellikKontrolu(guncellenenHarita, ders._id, kullaniciId).then((guncelMi) => {
                if (!guncelMi) {
                    arkaPlandaKonuHaritasiGuncelle(ders._id, kullaniciId).catch(() => { });
                }
            }).catch(() => { });
        }

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
            Array.isArray(mevcut.anaKonular) &&
            mevcut.anaKonular.length > 0;

        await KonuHaritasi.findOneAndUpdate(
            {
                dersId: ders._id,
                aktifIslemToken: islemToken,
                degisikliklereKilitli: { $ne: true }
            },
            {
                $set: {
                    durum: oncekiBasariliMi
                        ? "hazir"
                        : "hata",
                    olusturmaHatasi: hata.message,
                    aktifIslemToken: null,
                    kilitSonYenilemeTarihi: null
                }
            }
        );

        throw hata;
    } finally {
        heartbeat?.durdur();
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

/**
 * Materyal ekleme veya silme sonrasında konu haritasını arka planda otomatik günceller.
 *
 * Güvenlik garantileri:
 * - Son hazır materyal silindiğinde güncel harita içeriği boş duruma geçer;
 *   ancak önceki konular gecmisKonular'a aktarılarak öğrenme geçmişi ve gelecekteki Quiz/Flashcard/Mastery korunur.
 * - Harita zaten "olusturuluyor" durumundaysa çift Gemini çağrısı yapılmaz; devam eden üretim sonunda yeni kaynaklar değerlendirilir.
 * - Harita zaten güncel ise gereksiz Gemini çağrısı yapılmaz.
 * - Eşzamanlı çağrılarda aktifIslemToken (unique index) yarış durumunu önler.
 * - Gemini hatası veya kilit sonrası hata durumunda mevcut geçerli harita korunur ve kilit serbest bırakılır.
 *
 * @param {mongoose.Types.ObjectId|string} dersId
 * @param {mongoose.Types.ObjectId|string} kullaniciId
 */

const arkaPlandaKonuHaritasiGuncelleIslemi = async (dersId, kullaniciId) => {
    let alinanIslemToken = null;
    let islemKaydedildi = false;

    try {
        // Onaylanmış derslerde otomatik güncelleme başlatılmaz.
        // İşlem sayacı atomik olarak artırılır.
        const dersKilidi = await Ders.findOneAndUpdate(
            {
                _id: dersId,
                kullaniciId,
                materyallerOnaylandi: { $ne: true },
                temizleniyor: { $ne: true }
            },
            {
                $inc: { aktifMateryalIslemSayisi: 1 }
            },
            { new: true }
        );

        if (!dersKilidi) {
            return;
        }

        islemKaydedildi = true;

        // 1. Hazır materyal var mı?
        const hazirSayisi = await Materyal.countDocuments({
            dersId,
            kullaniciId,
            durum: "hazir",
            aktifIslemeId: { $ne: null }
        });

        if (hazirSayisi === 0) {
            // Önceki konuları arşivde koru.
            const mevcutHarita = await KonuHaritasi.findOne({
                dersId,
                kullaniciId
            });

            if (mevcutHarita) {
                const oncekiKonular = Array.isArray(mevcutHarita.anaKonular)
                    ? mevcutHarita.anaKonular
                    : [];

                const gecmisMap = new Map();

                for (const eski of (mevcutHarita.gecmisKonular || [])) {
                    const doc = typeof eski?.toObject === "function"
                        ? eski.toObject()
                        : eski;

                    if (doc?.konuId) {
                        gecmisMap.set(doc.konuId, doc);
                    }
                }

                for (const aktif of oncekiKonular) {
                    const doc = typeof aktif?.toObject === "function"
                        ? aktif.toObject()
                        : aktif;

                    if (doc?.konuId) {
                        gecmisMap.set(doc.konuId, doc);
                    }
                }

                const nihaiGecmis = Array.from(gecmisMap.values());

                await KonuHaritasi.findOneAndUpdate(
                    {
                        dersId,
                        kullaniciId,
                        degisikliklereKilitli: { $ne: true }
                    },
                    {
                        $set: {
                            durum: "yok",
                            anaKonular: [],
                            gecmisKonular: nihaiGecmis,
                            toplamAnaKonuSayisi: 0,
                            toplamAltKonuSayisi: 0,
                            kaynakMateryaller: [],
                            olusturmaHatasi: "",
                            aktifIslemToken: null,
                            kilitSonYenilemeTarihi: null
                        }
                    }
                );
            }

            return;
        }

        // 2. Mevcut harita durumunu kontrol et.
        const harita = await KonuHaritasi.findOne({
            dersId,
            kullaniciId
        });

        if (harita && harita.durum === "olusturuluyor") {
            if (konuHaritasiKilidiAktifMi(harita)) {
                return;
            }
        }

        // 3. Güncel haritayı gereksiz yere yeniden üretme.
        const guncelMi = await konuHaritasiGuncellikKontrolu(
            harita,
            dersId,
            kullaniciId
        );

        if (guncelMi) {
            return;
        }

        // 4. Ders bilgisini al.
        const ders = await Ders.findOne({
            _id: dersId,
            kullaniciId,
            materyallerOnaylandi: { $ne: true },
            temizleniyor: { $ne: true }
        });

        if (!ders) {
            return;
        }

        // 5. Harita oluşturma kilidini al.
        const yeniIslemToken = new mongoose.Types.ObjectId();
        const kilitBaslangici = new Date();
        alinanIslemToken = yeniIslemToken;

        if (!harita) {
            try {
                await KonuHaritasi.create({
                    dersId,
                    kullaniciId,
                    durum: "olusturuluyor",
                    olusturmaHatasi: "",
                    aktifIslemToken: yeniIslemToken,
                    kilitSonYenilemeTarihi: kilitBaslangici,
                    degisikliklereKilitli: false
                });
            } catch (err) {
                if (err.code === 11000) {
                    return;
                }

                throw err;
            }
        } else {
            const kilitliHarita = await KonuHaritasi.findOneAndUpdate(
                {
                    _id: harita._id,
                    degisikliklereKilitli: { $ne: true },
                    ...konuHaritasiKilitAlmaKosulu()
                },
                {
                    $set: {
                        durum: "olusturuluyor",
                        olusturmaHatasi: "",
                        aktifIslemToken: yeniIslemToken
                    },
                    $currentDate: { kilitSonYenilemeTarihi: true }
                },
                { new: true }
            );

            if (!kilitliHarita) {
                return;
            }
        }

        // 6. Gemini analizini tamamla.
        await konuHaritasiUretVeKaydet(
            ders,
            kullaniciId,
            yeniIslemToken
        );

    } catch (hata) {
        console.error(
            `Otomatik konu haritası güncelleme hatası (Ders ID: ${dersId}):`,
            hata.message
        );

        try {
            const mevcut = await KonuHaritasi.findOne({ dersId });

            const oncekiBasariliMi = Boolean(
                mevcut &&
                Array.isArray(mevcut.anaKonular) &&
                mevcut.anaKonular.length > 0
            );

            // Başka bir işlemin kilidine dokunma.
            if (alinanIslemToken) {
                await KonuHaritasi.findOneAndUpdate(
                    {
                        dersId,
                        kullaniciId,
                        aktifIslemToken: alinanIslemToken,
                        degisikliklereKilitli: { $ne: true }
                    },
                    {
                        $set: {
                            durum: oncekiBasariliMi ? "hazir" : "hata",
                            olusturmaHatasi:
                                hata.message || "Otomatik güncelleme hatası",
                            aktifIslemToken: null,
                            kilitSonYenilemeTarihi: null
                        }
                    }
                );
            }
        } catch (kilitAcmaHatasi) {
            console.error(
                "Kilit temizleme hatası:",
                kilitAcmaHatasi.message
            );
        }

    } finally {
        // Her durumda işlem sayacını serbest bırak.
        if (islemKaydedildi) {
            try {
                await Ders.findOneAndUpdate(
                    {
                        _id: dersId,
                        kullaniciId,
                        aktifMateryalIslemSayisi: { $gt: 0 }
                    },
                    {
                        $inc: { aktifMateryalIslemSayisi: -1 }
                    }
                );
            } catch (sayacHatasi) {
                console.error(
                    "Otomatik harita işlem sayacı azaltılamadı:",
                    sayacHatasi
                );
            }
        }
    }
};

/**
 * Yeni bir materyal eklendiğinde SADECE o materyali Gemini ile analiz eder ve
 * mevcut konu haritasıyla güvenli biçimde birleştirir (Incremental Update).
 *
 * Kesin kurallar:
 * - Mevcut konuların ID ve başlıkları gereksiz yere değiştirilmez.
 * - Yeni materyalin getirdiği gerçekten yeni konulara yeni konuId üretilir.
 * - Eşleşen eski konulara yeni materyalId'si kaynak olarak eklenir.
 * - Arşivden geri dönen konu varsa eski konuId yeniden kullanılır.
 *
 * @param {string|ObjectId} materyalId - Yeni yüklenen materyalin ID'si
 * @param {string|ObjectId} dersId
 * @param {string|ObjectId} kullaniciId
 * @param {string} [modelAdi]
 */
const materyalEklendigindeIncrementalGuncelleIslemi = async (
    materyalId,
    dersId,
    kullaniciId,
    modelAdi = VARSAYILAN_GEMINI_MODELI
) => {
    const matIdStr = materyalId.toString();
    const dersIdStr = dersId.toString();

    // 1. Yeni materyalin metnini topla
    const { materyal, metinBlogu } = await tekMateryalMetinleriniTopla(materyalId, dersId, kullaniciId);

    if (!materyal || !metinBlogu.trim()) {
        console.warn(`[Incremental] Materyal metni boş veya hazır değil: ${matIdStr}`);
        return null;
    }

    // 2. Ders bilgisini al
    const ders = await Ders.findOne({
        _id: dersId,
        kullaniciId,
        temizleniyor: { $ne: true }
    });

    if (!ders) {
        console.warn(`[Incremental] Ders bulunamadı: ${dersIdStr}`);
        return null;
    }

    // Onaylanmış derslerde incremental analiz başlatılmaz.
    if (ders.materyallerOnaylandi === true) {
        console.warn(
            `[Incremental] Ders onaylandığı için güncelleme engellendi: ${dersIdStr}`
        );
        return null;
    }

    const dersBilgisi = {
        dersAdi: ders.dersAdi,
        aciklama: ders.aciklama,
        donem: ders.donem
    };

    // 3. Sadece yeni materyali Gemini ile analiz et
    let yeniGeminiKonular;
    try {
        yeniGeminiKonular = await geminiIleKonuHaritasiUret(metinBlogu, dersBilgisi, modelAdi);
    } catch (geminiHata) {
        console.error(`[Incremental] Gemini analiz hatası (Materyal: ${matIdStr}):`, geminiHata.message);
        throw geminiHata;
    }

    // Gemini çalışırken materyal silinmiş veya yeniden işlenmiş olabilir.
    // Eski analiz sonucunun konu haritasına yazılmasını engelle.
    const guncelMateryal = await Materyal.findOne({
        _id: materyalId,
        dersId,
        kullaniciId,
        durum: "hazir",
        aktifIslemeId: materyal.aktifIslemeId
    });

    if (!guncelMateryal) {
        console.warn(
            `[Incremental] Materyal silindi veya işleme sürümü değişti: ${matIdStr}`
        );
        return null;
    }

    if (!yeniGeminiKonular || yeniGeminiKonular.length === 0) {
        console.warn(`[Incremental] Gemini yeni konular üretemedi: ${matIdStr}`);
        return null;
    }
    yeniGeminiKonular = geminiTekrarlariniTemizle(yeniGeminiKonular);
    // 4. Mevcut konu haritasını oku
    const mevcutHarita = await KonuHaritasi.findOne({ dersId, kullaniciId });

    // Full üretim veya başka bir process'teki güncelleme kilitliyken mevcut
    // veriyi temel alıp üzerine yazma. Process içi kuyruk tek başına yeterli değildir.
    if (
        mevcutHarita &&
        (mevcutHarita.degisikliklereKilitli === true ||
            mevcutHarita.durum === "olusturuluyor" ||
            mevcutHarita.aktifIslemToken)
    ) {
        return null;
    }

    const eskiAnaKonular = (mevcutHarita?.anaKonular || []).map(k =>
        typeof k?.toObject === "function" ? k.toObject() : k
    );
    const eskiGecmisKonular = (mevcutHarita?.gecmisKonular || []).map(k =>
        typeof k?.toObject === "function" ? k.toObject() : k
    );

    // 5. Birleşik eski konu havuzu (aktif öncelikli)
    const birlesikEskiListe = [];
    const gorulenAnaIds = new Set();
    const gorulenAnaNorms = new Set();

    for (const ana of eskiAnaKonular) {
        if (!ana?.konuId) continue;
        gorulenAnaIds.add(ana.konuId);
        gorulenAnaNorms.add(konuBasliginiNormalizeEt(ana.baslik));
        birlesikEskiListe.push({ ...ana, _kaynak: "aktif" });
    }
    for (const ana of eskiGecmisKonular) {
        if (!ana?.konuId || gorulenAnaIds.has(ana.konuId)) continue;
        const normBaslik = konuBasliginiNormalizeEt(ana.baslik);
        if (!gorulenAnaNorms.has(normBaslik)) {
            gorulenAnaIds.add(ana.konuId);
            gorulenAnaNorms.add(normBaslik);
            birlesikEskiListe.push({ ...ana, _kaynak: "arsiv" });
        }
    }

    // Tüm eski alt konular havuzu
    const tumEskiAltKonular = [];
    const gorulenAltIds = new Set();
    for (const ana of birlesikEskiListe) {
        for (const alt of ana.altKonular || []) {
            if (!alt?.konuId) continue;
            if (!gorulenAltIds.has(alt.konuId)) {
                gorulenAltIds.add(alt.konuId);
                tumEskiAltKonular.push({
                    ...alt,
                    anaKonuId: ana.konuId,
                    anaBaslik: ana.baslik,
                    _kaynak: ana._kaynak
                });
            }
        }
    }

    // 6. Mevcut haritadaki tüm kimlikleri topla (aktif + arşiv)
    const eskiTumKimlikler = new Set();
    for (const ana of birlesikEskiListe) {
        if (ana.konuId) eskiTumKimlikler.add(ana.konuId);
        for (const alt of ana.altKonular || []) {
            if (alt.konuId) eskiTumKimlikler.add(alt.konuId);
        }
    }

    // Aktif haritada şu an bulunan ve yeni atanan tüm konu kimlikleri (çakışmaları önlemek için)
    const atanmisAktifKimlikler = new Set();
    const nihaiAnaKonuMap = new Map();

    for (const ana of eskiAnaKonular) {
        if (!ana?.konuId) continue;
        atanmisAktifKimlikler.add(ana.konuId);
        const altlar = [];
        for (const alt of ana.altKonular || []) {
            if (alt?.konuId) {
                atanmisAktifKimlikler.add(alt.konuId);
                altlar.push({ ...alt, kaynakMateryalIds: [...(alt.kaynakMateryalIds || [])] });
            }
        }
        nihaiAnaKonuMap.set(ana.konuId, {
            ...ana,
            kaynakMateryalIds: [...(ana.kaynakMateryalIds || [])],
            altKonular: altlar
        });
    }

    const yeniBenzersizKimlikUret = (tabanKimlik, tur) => {
        let kimlik = tabanKimlik;
        if (eskiTumKimlikler.has(kimlik) || atanmisAktifKimlikler.has(kimlik)) {
            do {
                kimlik = `${tur}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
            } while (eskiTumKimlikler.has(kimlik) || atanmisAktifKimlikler.has(kimlik));
        }
        atanmisAktifKimlikler.add(kimlik);
        eskiTumKimlikler.add(kimlik);
        return kimlik;
    };

    // 7. Gemini çıktısını mevcut haritayla birleştir
    // Ana konuları 1-e-1 eşleştirmek için taze bir Set başlatılır:
    const eslesenAnaKimlikler = new Set();
    const anaEslesmeleri = konuListesiniEsle(
        yeniGeminiKonular,
        birlesikEskiListe,
        [],
        eslesenAnaKimlikler,
        {}
    );

    for (let aIndex = 0; aIndex < yeniGeminiKonular.length; aIndex++) {
        const anaKonu = yeniGeminiKonular[aIndex];
        const anaEslesme = anaEslesmeleri.get(anaKonu);
        const eskiAnaId = anaEslesme?.eskiId || null;
        const eskiAnaKonu = anaEslesme?.eskiKonu || null;

        if (eskiAnaId && nihaiAnaKonuMap.has(eskiAnaId)) {
            // Mevcut aktif ana konu: materyali kaynak olarak ekle
            const mevcutAna = nihaiAnaKonuMap.get(eskiAnaId);
            const mevAnaMatIds = new Set((mevcutAna.kaynakMateryalIds || []).map(id => id.toString()));
            if (!mevAnaMatIds.has(matIdStr)) {
                mevcutAna.kaynakMateryalIds.push(materyalId);
            }

            const eskiAltlar = mevcutAna.altKonular;
            const baglam = { ustKonuBasligi: mevcutAna.baslik, ustKonuId: mevcutAna.konuId };

            const eskiAltHavuz = eskiAltlar.map(alt => ({
                ...alt,
                anaKonuId: mevcutAna.konuId,
                anaBaslik: mevcutAna.baslik,
                _kaynak: "aktif"
            }));
            const ikincilAltHavuz = tumEskiAltKonular.filter(
                a => !eskiAltHavuz.find(b => b.konuId === a.konuId)
            );

            const eslesenAltKimlikler = new Set();
            const altEslesmeleri = konuListesiniEsle(
                anaKonu.altKonular || [],
                eskiAltHavuz,
                ikincilAltHavuz,
                eslesenAltKimlikler,
                baglam
            );

            for (let subIndex = 0; subIndex < (anaKonu.altKonular || []).length; subIndex++) {
                const altKonu = anaKonu.altKonular[subIndex];
                const altEslesme = altEslesmeleri.get(altKonu);
                const eskiAltId = altEslesme?.eskiId || null;

                if (eskiAltId) {
                    const altIdx = eskiAltlar.findIndex(a => a.konuId === eskiAltId);
                    if (altIdx >= 0) {
                        const mevAlt = eskiAltlar[altIdx];
                        const mevAltMatIds = new Set((mevAlt.kaynakMateryalIds || []).map(id => id.toString()));
                        if (!mevAltMatIds.has(matIdStr)) {
                            mevAlt.kaynakMateryalIds.push(materyalId);
                        }
                    } else {
                        // İkincil havuzdan (arşivden vb.) eşleşti
                        const bulunanEskiAlt = altEslesme.eskiKonu;
                        eskiAltlar.push({
                            konuId: eskiAltId,
                            baslik: bulunanEskiAlt?.baslik || altKonu.baslik.trim(),
                            aciklama: altKonu.aciklama || bulunanEskiAlt?.aciklama || "",
                            sira: altKonu.sira || subIndex + 1,
                            kaynakMateryalIds: [materyalId]
                        });
                        atanmisAktifKimlikler.add(eskiAltId);
                    }
                } else {
                    const yeniAltId = yeniBenzersizKimlikUret(
                        deterministikKonuIdUret(dersIdStr, altKonu.baslik.trim(), mevcutAna.baslik, true),
                        "sub"
                    );
                    eskiAltlar.push({
                        konuId: yeniAltId,
                        baslik: altKonu.baslik.trim(),
                        aciklama: altKonu.aciklama || "",
                        sira: altKonu.sira || subIndex + 1,
                        kaynakMateryalIds: [materyalId]
                    });
                }
            }

            mevcutAna.altKonular = eskiAltlar;
            nihaiAnaKonuMap.set(eskiAnaId, mevcutAna);

        } else if (eskiAnaId && eskiAnaKonu && !nihaiAnaKonuMap.has(eskiAnaId)) {
            // Arşivden geri dönen ana konu: yeniden aktifleştir
            atanmisAktifKimlikler.add(eskiAnaId);
            const baglam = { ustKonuBasligi: eskiAnaKonu.baslik, ustKonuId: eskiAnaId };

            const eskiAltHavuz = (eskiAnaKonu.altKonular || []).map(alt => ({
                ...alt,
                anaKonuId: eskiAnaId,
                anaBaslik: eskiAnaKonu.baslik,
                _kaynak: "arsiv"
            }));
            const ikincilAltHavuz = tumEskiAltKonular.filter(
                a => !eskiAltHavuz.find(b => b.konuId === a.konuId)
            );

            const eslesenAltKimlikler = new Set();
            const altEslesmeleri = konuListesiniEsle(
                anaKonu.altKonular || [],
                eskiAltHavuz,
                ikincilAltHavuz,
                eslesenAltKimlikler,
                baglam
            );

            const geriGelenAltlar = [];
            for (let subIndex = 0; subIndex < (anaKonu.altKonular || []).length; subIndex++) {
                const altKonu = anaKonu.altKonular[subIndex];
                const altEslesme = altEslesmeleri.get(altKonu);
                const eskiAltId = altEslesme?.eskiId || null;

                if (eskiAltId) {
                    const bulunanEskiAlt = altEslesme.eskiKonu;
                    geriGelenAltlar.push({
                        konuId: eskiAltId,
                        baslik: bulunanEskiAlt?.baslik || altKonu.baslik.trim(),
                        aciklama: altKonu.aciklama || bulunanEskiAlt?.aciklama || "",
                        sira: altKonu.sira || subIndex + 1,
                        kaynakMateryalIds: [materyalId]
                    });
                    atanmisAktifKimlikler.add(eskiAltId);
                } else {
                    const yeniAltId = yeniBenzersizKimlikUret(
                        deterministikKonuIdUret(dersIdStr, altKonu.baslik.trim(), eskiAnaKonu.baslik, true),
                        "sub"
                    );
                    geriGelenAltlar.push({
                        konuId: yeniAltId,
                        baslik: altKonu.baslik.trim(),
                        aciklama: altKonu.aciklama || "",
                        sira: altKonu.sira || subIndex + 1,
                        kaynakMateryalIds: [materyalId]
                    });
                }
            }

            nihaiAnaKonuMap.set(eskiAnaId, {
                konuId: eskiAnaId,
                baslik: eskiAnaKonu.baslik,
                aciklama: anaKonu.aciklama || eskiAnaKonu.aciklama || "",
                sira: anaKonu.sira || eskiAnaKonu.sira || aIndex + 1,
                kaynakMateryalIds: [materyalId],
                altKonular: geriGelenAltlar
            });

        } else {
            // Tamamen yeni ana konu
            const yeniAnaId = yeniBenzersizKimlikUret(
                deterministikKonuIdUret(dersIdStr, anaKonu.baslik.trim(), "", false),
                "top"
            );

            const yeniAltlar = (anaKonu.altKonular || []).map((alt, subIndex) => {
                const yeniAltId = yeniBenzersizKimlikUret(
                    deterministikKonuIdUret(dersIdStr, alt.baslik.trim(), anaKonu.baslik.trim(), true),
                    "sub"
                );
                return {
                    konuId: yeniAltId,
                    baslik: alt.baslik.trim(),
                    aciklama: alt.aciklama || "",
                    sira: alt.sira || subIndex + 1,
                    kaynakMateryalIds: [materyalId]
                };
            });

            nihaiAnaKonuMap.set(yeniAnaId, {
                konuId: yeniAnaId,
                baslik: anaKonu.baslik.trim(),
                aciklama: anaKonu.aciklama || "",
                sira: anaKonu.sira || aIndex + 1,
                kaynakMateryalIds: [materyalId],
                altKonular: yeniAltlar
            });
        }
    }

    const nihaiAnaKonular = konuSiralariniDuzenle(Array.from(nihaiAnaKonuMap.values()));

    let toplamAlt = 0;
    for (const ana of nihaiAnaKonular) {
        toplamAlt += (ana.altKonular || []).length;
    }

    // gecmisKonular güncelle
    const gecmisMap = new Map();
    for (const eski of eskiGecmisKonular) {
        if (eski?.konuId) gecmisMap.set(eski.konuId, eski);
    }
    for (const aktif of nihaiAnaKonular) {
        if (aktif?.konuId) gecmisMap.set(aktif.konuId, aktif);
    }
    const nihaiGecmis = Array.from(gecmisMap.values());

    // kaynakMateryaller güncelle
    const mevcutKaynaklar = (mevcutHarita?.kaynakMateryaller || []).filter(
        k => k.materyalId?.toString() !== matIdStr
    );
    const yeniKaynaklar = [
        ...mevcutKaynaklar,
        {
            materyalId: materyal._id,
            aktifIslemeId: materyal.aktifIslemeId,
            dosyaAdi: materyal.orijinalDosyaAdi || materyal.dosyaAdi
        }
    ];
    // Gemini analizi sırasında ders onaylandı mı?
    // Onaylanan dersin konu haritasını değiştirme.
    const guncelDers = await Ders.findOne({
        _id: dersId,
        kullaniciId,
        materyallerOnaylandi: { $ne: true },
        temizleniyor: { $ne: true }
    }).select("materyallerOnaylandi");

    if (!guncelDers || guncelDers.materyallerOnaylandi === true) {
        console.warn(
            `[Incremental] Ders onaylandı veya silindi, harita kaydedilmeyecek: ${dersIdStr}`
        );
        return null;
    }
    
    // 8. Haritayı kaydet
    if (!mevcutHarita) {
        try {
            return await KonuHaritasi.create({
                dersId,
                kullaniciId,
                durum: "hazir",
                olusturmaHatasi: "",
                anaKonular: nihaiAnaKonular,
                gecmisKonular: nihaiGecmis,
                toplamAnaKonuSayisi: nihaiAnaKonular.length,
                toplamAltKonuSayisi: toplamAlt,
                kaynakMateryaller: yeniKaynaklar,
                kullanilanModel: modelAdi,
                sonOlusturmaTarihi: new Date(),
                aktifIslemToken: null,
                degisikliklereKilitli: false
            });
        } catch (hata) {
            if (hata.code === 11000) {
                return null;
            }
            throw hata;
        }
    }

    // updatedAt optimistik sürüm kontrolüdür. Başka bir process haritayı
    // değiştirdiyse eski hesap sonucu güvenli biçimde reddedilir.
    if (!mevcutHarita.updatedAt) {
        return null;
    }

    return await KonuHaritasi.findOneAndUpdate(
        {
            _id: mevcutHarita._id,
            dersId,
            kullaniciId,
            durum: { $ne: "olusturuluyor" },
            aktifIslemToken: null,
            degisikliklereKilitli: { $ne: true },
            updatedAt: mevcutHarita.updatedAt
        },
        {
            $set: {
                durum: "hazir",
                olusturmaHatasi: "",
                anaKonular: nihaiAnaKonular,
                gecmisKonular: nihaiGecmis,
                toplamAnaKonuSayisi: nihaiAnaKonular.length,
                toplamAltKonuSayisi: toplamAlt,
                kaynakMateryaller: yeniKaynaklar,
                kullanilanModel: modelAdi,
                sonOlusturmaTarihi: new Date()
            }
        },
        { new: true }
    );
};


/**
 * Aynı ders için incremental güncellemeleri sıraya alır.
 * Farklı dersler birbirini beklemez.
 *
 * Not: Bu kilit tek Node.js process'i içinde çalışır.
 */

const dersGuncellemeKuyruklari = new Map();

const dersIsleminiSirayaAl = async (dersId, kullaniciId, islem) => {
    const kuyrukAnahtari = `${kullaniciId}:${dersId}`;

    const oncekiIslem =
        dersGuncellemeKuyruklari.get(kuyrukAnahtari) ||
        Promise.resolve();

    const yeniIslem = oncekiIslem
        .catch(() => {
            // Önceki işlem başarısız olsa da sonraki işlem çalışır.
        })
        .then(islem);

    dersGuncellemeKuyruklari.set(kuyrukAnahtari, yeniIslem);

    try {
        return await yeniIslem;
    } finally {
        if (dersGuncellemeKuyruklari.get(kuyrukAnahtari) === yeniIslem) {
            dersGuncellemeKuyruklari.delete(kuyrukAnahtari);
        }
    }
};

export const materyalEklendigindeIncrementalGuncelle = async (
    materyalId,
    dersId,
    kullaniciId,
    modelAdi = VARSAYILAN_GEMINI_MODELI
) => {
    return dersIsleminiSirayaAl(
        dersId,
        kullaniciId,
        () => materyalEklendigindeIncrementalGuncelleIslemi(
            materyalId,
            dersId,
            kullaniciId,
            modelAdi
        )
    );
};


export const arkaPlandaKonuHaritasiGuncelle = async (dersId, kullaniciId) => {
    return dersIsleminiSirayaAl(
        dersId,
        kullaniciId,
        () => arkaPlandaKonuHaritasiGuncelleIslemi(
            dersId,
            kullaniciId
        )
    );
};


/**
 * Bir materyal silindiğinde Gemini ÇAĞIRMADAN konu haritasını günceller.
 *
 * Kesin kurallar:
 * - Sadece bu materyale ait kaynak bağlantıları kaldırılır.
 * - Başka materyal tarafından desteklenen konular aktif kalır (konuId değişmez).
 * - Hiç aktif kaynağı kalmayan alt konular gecmisKonular'a arşivlenir.
 * - Öğrenci quiz/mastery/flashcard verisi bu fonksiyonda silinmez.
 * - İdempotent: Tekrar çağrıldığında güvenlidir.
 *
 * @param {string|ObjectId} materyalId - Silinen materyalin ID'si
 * @param {string|ObjectId} dersId
 * @param {string|ObjectId} kullaniciId
 */
const materyalSilindigindeGuncelleIslemi = async (materyalId, dersId, kullaniciId) => {
    const matIdStr = materyalId.toString();

    const harita = await KonuHaritasi.findOne({ dersId, kullaniciId });
    if (!harita || harita.degisikliklereKilitli === true) return null;

    const mevcutAnaKonular = (harita.anaKonular || []).map(k =>
        typeof k?.toObject === "function" ? k.toObject() : k
    );
    const mevcutGecmis = (harita.gecmisKonular || []).map(k =>
        typeof k?.toObject === "function" ? k.toObject() : k
    );

    const guncelKaynaklar = (harita.kaynakMateryaller || []).filter(
        k => k.materyalId?.toString() !== matIdStr
    );
    const baskaKaynakVarMi = guncelKaynaklar.length > 0;

    const guncelAnaKonular = [];
    const arsivEklemeleri = []; // { anaKonuId, anaKonuBaslik, altKonu }

    for (const ana of mevcutAnaKonular) {
        if (!ana?.konuId) continue;

        const anaKaynaklar = ana.kaynakMateryalIds || [];
        const anaLegacyMi = anaKaynaklar.length === 0;
        const anaSonrasiMatIds = anaKaynaklar.filter(
            id => id.toString() !== matIdStr
        );

        const aktifAltlar = [];
        const arsivlenecekAltlar = [];

        for (const alt of ana.altKonular || []) {
            if (!alt?.konuId) continue;
            const altKaynaklar = alt.kaynakMateryalIds || [];
            const altBuMateryaliDestekliyorMu = altKaynaklar.some(id => id.toString() === matIdStr);
            const altLegacyMi = altKaynaklar.length === 0;

            const altSonrasiMatIds = altKaynaklar.filter(
                id => id.toString() !== matIdStr
            );

            if (altBuMateryaliDestekliyorMu) {
                if (altSonrasiMatIds.length === 0) {
                    arsivlenecekAltlar.push({ ...alt, kaynakMateryalIds: [] });
                } else {
                    aktifAltlar.push({ ...alt, kaynakMateryalIds: altSonrasiMatIds });
                }
            } else if (altLegacyMi) {
                // Kaynak ilişkisi bilinmeyen legacy konular: başka materyal varsa yanlışlıkla arşivleme!
                if (baskaKaynakVarMi) {
                    aktifAltlar.push({ ...alt, kaynakMateryalIds: [] });
                } else {
                    arsivlenecekAltlar.push({ ...alt, kaynakMateryalIds: [] });
                }
            } else {
                // Bu silinen materyalle ilişkisi olmayan başka materyal(ler)e bağlı alt konu
                if (altSonrasiMatIds.length > 0) {
                    aktifAltlar.push({ ...alt, kaynakMateryalIds: altSonrasiMatIds });
                } else if (baskaKaynakVarMi) {
                    aktifAltlar.push({ ...alt, kaynakMateryalIds: [] });
                } else {
                    arsivlenecekAltlar.push({ ...alt, kaynakMateryalIds: [] });
                }
            }
        }

        // Arşivlenen alt konuları gecmisKonular'a ekle
        for (const arsivAlt of arsivlenecekAltlar) {
            arsivEklemeleri.push({
                anaKonuId: ana.konuId,
                anaKonuBaslik: ana.baslik,
                anaKonuAciklama: ana.aciklama || "",
                anaKonuSira: ana.sira,
                altKonu: arsivAlt
            });
        }

        const anaAktifKaynak = anaSonrasiMatIds.length > 0 || aktifAltlar.length > 0 || (anaLegacyMi && baskaKaynakVarMi);

        if (anaAktifKaynak && aktifAltlar.length > 0) {
            guncelAnaKonular.push({
                ...ana,
                kaynakMateryalIds: anaSonrasiMatIds,
                altKonular: aktifAltlar
            });
        } else {
            // Ana konuyu tüm alt konularıyla birlikte arşivle
            for (const alt of [...aktifAltlar, ...arsivlenecekAltlar]) {
                arsivEklemeleri.push({
                    anaKonuId: ana.konuId,
                    anaKonuBaslik: ana.baslik,
                    anaKonuAciklama: ana.aciklama || "",
                    anaKonuSira: ana.sira,
                    altKonu: { ...alt, kaynakMateryalIds: [] }
                });
            }
        }
    }

    const siraliGuncelAnaKonular = konuSiralariniDuzenle(guncelAnaKonular);

    // gecmisKonular güncelle
    const gecmisMap = new Map();
    for (const eski of mevcutGecmis) {
        if (eski?.konuId) gecmisMap.set(eski.konuId, { ...eski });
    }
    // Aktif kalan konuları gecmis'e de yaz
    for (const aktif of siraliGuncelAnaKonular) {
        if (aktif?.konuId) gecmisMap.set(aktif.konuId, aktif);
    }
    // Arşivlenen alt konuları ana konularına göre gecmis'e ekle
    for (const ekle of arsivEklemeleri) {
        const mevcutArsivAna = gecmisMap.get(ekle.anaKonuId);
        if (mevcutArsivAna) {
            const birleskAltIds = new Set((mevcutArsivAna.altKonular || []).map(a => a.konuId));
            if (!birleskAltIds.has(ekle.altKonu.konuId)) {
                mevcutArsivAna.altKonular = [...(mevcutArsivAna.altKonular || []), ekle.altKonu];
                gecmisMap.set(ekle.anaKonuId, mevcutArsivAna);
            }
        } else {
            gecmisMap.set(ekle.anaKonuId, {
                konuId: ekle.anaKonuId,
                baslik: ekle.anaKonuBaslik,
                aciklama: ekle.anaKonuAciklama,
                sira: ekle.anaKonuSira,
                kaynakMateryalIds: [],
                altKonular: [ekle.altKonu]
            });
        }
    }

    const nihaiGecmis = Array.from(gecmisMap.values());

    let toplamAlt = 0;
    for (const ana of siraliGuncelAnaKonular) {
        toplamAlt += (ana.altKonular || []).length;
    }

    const yeniDurum = siraliGuncelAnaKonular.length > 0 ? "hazir" : "yok";

    return await KonuHaritasi.findOneAndUpdate(
        {
            dersId,
            kullaniciId,
            degisikliklereKilitli: { $ne: true }
        },
        {
            $set: {
                durum: yeniDurum,
                olusturmaHatasi: "",
                anaKonular: siraliGuncelAnaKonular,
                gecmisKonular: nihaiGecmis,
                toplamAnaKonuSayisi: siraliGuncelAnaKonular.length,
                toplamAltKonuSayisi: toplamAlt,
                kaynakMateryaller: guncelKaynaklar,
                aktifIslemToken: null
            }
        },
        { new: true }
    );
};


export const materyalSilindigindeGuncelle = async (
    materyalId,
    dersId,
    kullaniciId
) => {
    return dersIsleminiSirayaAl(
        dersId,
        kullaniciId,
        () => materyalSilindigindeGuncelleIslemi(
            materyalId,
            dersId,
            kullaniciId
        )
    );
};

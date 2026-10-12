
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
    eskiKonuKimliginiBul,
    konuBasliginiNormalizeEt,
    konuListesiniEsle
} from "./konuKimlikEslemeService.js";

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
            // Analiz sırasında materyaller değişti!
            // Kilit belirtecini sıfırla, önceki geçerli konuları koru
            const guncelVarMi = guncelHazir.length > 0;
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
                                : (guncelVarMi ? "hata" : "yok"),
                        olusturmaHatasi: guncelVarMi
                            ? "Analiz sırasında materyaller değişti. Güncel kaynaklar değerlendiriliyor..."
                            : "",
                        aktifIslemToken: null
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
        const gorulenAltBasliklar = new Set();

        for (const ana of birlesikAnaKonular) {
            for (const alt of ana.altKonular || []) {
                if (!alt || !alt.konuId) continue;
                const normBaslik = konuBasliginiNormalizeEt(alt.baslik);
                if (!gorulenAltKonuIdler.has(alt.konuId) && !gorulenAltBasliklar.has(normBaslik)) {
                    gorulenAltKonuIdler.add(alt.konuId);
                    gorulenAltBasliklar.add(normBaslik);
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

        const kaliciAnaKonular = hamKonular.map(
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

                        return {
                            konuId: altKonuId,
                            baslik: nihaiAltBaslik,
                            aciklama: alt.aciklama || eskiAltKonu?.aciklama || "",
                            sira: alt.sira || subIndex + 1
                        };
                    }
                );

                return {
                    konuId: anaKonuId,
                    baslik: nihaiAnaBaslik,
                    aciklama: ana.aciklama || eskiAnaKonu?.aciklama || "",
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
                        gecmisKonular: nihaiGecmisKonular,
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

        // İşlem tamamlandıktan sonra yeni kaynak durumunu güvence altına al
        if (guncellenenHarita) {
            konuHaritasiGuncellikKontrolu(guncellenenHarita, ders._id, kullaniciId).then((guncelMi) => {
                if (!guncelMi) {
                    arkaPlandaKonuHaritasiGuncelle(ders._id, kullaniciId).catch(() => {});
                }
            }).catch(() => {});
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
                $or: [
                    { aktifIslemToken: islemToken },
                    { durum: "olusturuluyor" }
                ]
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
export const arkaPlandaKonuHaritasiGuncelle = async (dersId, kullaniciId) => {
    let alinanIslemToken = null;
    try {
        // 1. Hazır (aktif islemeId'ye sahip) materyal var mı?
        const hazirSayisi = await Materyal.countDocuments({
            dersId,
            kullaniciId,
            durum: "hazir",
            aktifIslemeId: { $ne: null }
        });

        if (hazirSayisi === 0) {
            // Son hazır materyal silindiğinde resmi konu haritasının güncel içeriği boş duruma geçmeli.
            // Ancak gelecekteki Quiz, Flashcard ve Mastery Score kayıtları veya öğrenme geçmişi silinmemeli.
            const mevcutHarita = await KonuHaritasi.findOne({ dersId, kullaniciId });
            if (mevcutHarita) {
                const oncekiKonular = Array.isArray(mevcutHarita.anaKonular) ? mevcutHarita.anaKonular : [];
                const gecmisMap = new Map();
                for (const eski of (mevcutHarita.gecmisKonular || [])) {
                    const doc = typeof eski?.toObject === "function" ? eski.toObject() : eski;
                    if (doc?.konuId) gecmisMap.set(doc.konuId, doc);
                }
                for (const aktif of oncekiKonular) {
                    const doc = typeof aktif?.toObject === "function" ? aktif.toObject() : aktif;
                    if (doc?.konuId) gecmisMap.set(doc.konuId, doc);
                }
                const nihaiGecmis = Array.from(gecmisMap.values());

                await KonuHaritasi.findOneAndUpdate(
                    { dersId, kullaniciId },
                    {
                        $set: {
                            durum: "yok",
                            anaKonular: [],
                            gecmisKonular: nihaiGecmis,
                            toplamAnaKonuSayisi: 0,
                            toplamAltKonuSayisi: 0,
                            kaynakMateryaller: [],
                            olusturmaHatasi: "",
                            aktifIslemToken: null
                        }
                    }
                );
            }
            return;
        }

        // 2. Mevcut harita durumunu kontrol et
        const harita = await KonuHaritasi.findOne({ dersId, kullaniciId });

        if (harita && harita.durum === "olusturuluyor") {
            const KILIT_ZAMAN_ASIMI_MS = 5 * 60 * 1000;
            const sonGuncelleme = new Date(harita.updatedAt || harita.sonOlusturmaTarihi || Date.now()).getTime();
            const gecenSure = Date.now() - sonGuncelleme;
            if (gecenSure < KILIT_ZAMAN_ASIMI_MS) {
                // Zaten başka bir istek üretiyor ve kilit geçerli; çift Gemini çağrısından kaçın.
                return;
            }
        }

        // 3. Güncellik kontrolü — harita zaten tüm hazır materyalleri kapsıyorsa yeniden üretme
        const guncelMi = await konuHaritasiGuncellikKontrolu(harita, dersId, kullaniciId);
        if (guncelMi) {
            return;
        }

        // 4. Ders bilgisini al
        const ders = await Ders.findById(dersId);
        if (!ders) return;

        // 5. Eşzamanlı erişim kilidi: Haritayı "olusturuluyor" durumuna geçir
        const yeniIslemToken = new mongoose.Types.ObjectId();
        alinanIslemToken = yeniIslemToken;

        if (!harita) {
            try {
                await KonuHaritasi.create({
                    dersId,
                    kullaniciId,
                    durum: "olusturuluyor",
                    olusturmaHatasi: "",
                    aktifIslemToken: yeniIslemToken
                });
            } catch (err) {
                if (err.code === 11000) {
                    // Başka bir eşzamanlı istek kaydı önce oluşturdu; atla
                    return;
                }
                throw err;
            }
        } else {
            const kilitliHarita = await KonuHaritasi.findOneAndUpdate(
                { _id: harita._id, durum: { $ne: "olusturuluyor" } },
                {
                    $set: {
                        durum: "olusturuluyor",
                        olusturmaHatasi: "",
                        aktifIslemToken: yeniIslemToken
                    }
                },
                { new: true }
            );

            if (!kilitliHarita) {
                // Yarış durumu: başka bir istek kilidi önce aldı
                return;
            }
        }

        // 6. Konu haritasını üret ve kaydet (hata yönetimi içinde, mevcut veri korunur)
        await konuHaritasiUretVeKaydet(ders, kullaniciId, yeniIslemToken);

    } catch (hata) {
        console.error(
            `Otomatik konu haritası güncelleme hatası (Ders ID: ${dersId}):`,
            hata.message
        );
        // Kilit alındıktan sonra hata oluşursa haritanın süresiz "olusturuluyor" durumunda kalmasını önle
        try {
            const mevcut = await KonuHaritasi.findOne({ dersId });
            const oncekiBasariliMi = Boolean(mevcut && Array.isArray(mevcut.anaKonular) && mevcut.anaKonular.length > 0);
            await KonuHaritasi.findOneAndUpdate(
                {
                    dersId,
                    ...(alinanIslemToken
                        ? { aktifIslemToken: alinanIslemToken }
                        : { durum: "olusturuluyor" })
                },
                {
                    $set: {
                        durum: oncekiBasariliMi ? "hazir" : "hata",
                        olusturmaHatasi: hata.message || "Otomatik güncelleme hatası",
                        aktifIslemToken: null
                    }
                }
            );
        } catch (kilitAcmaHatasi) {
            console.error("Kilit temizleme hatası:", kilitAcmaHatasi.message);
        }
    }
};


import Materyal from "../models/Materyal.js";
import Ders from "../models/Ders.js";
import path from "path";
import { guvenliDosyaSil } from "../utils/dosyaIslemleri.js";
import { metinCikar } from "../services/metinCikarmaService.js";
import { metinParcalaVeKaydet } from "../services/metinParcalamaService.js";
import MetinParcasi from "../models/MetinParcasi.js";
import {
    materyalEklendigindeIncrementalGuncelle,
    materyalSilindigindeGuncelle
} from "../services/konuHaritasiService.js";

import mongoose from "mongoose";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { dosyaIceriginiDogrula } from "../services/dosyaTuruDogrulamaService.js";

/**
 * Ders onayıyla yarışmayan atomik materyal işlem kaydı.
 * Başarılı her kayıt, işlem tamamen bitince bir kez serbest bırakılmalıdır.
 */
const materyalIslemiBaslat = async (dersId, kullaniciId) => {
    return Ders.findOneAndUpdate(
        {
            _id: dersId,
            kullaniciId,
            materyallerOnaylandi: { $ne: true },
            temizleniyor: { $ne: true }
        },
        { $inc: { aktifMateryalIslemSayisi: 1 } },
        { new: true }
    );
};

const materyalIslemiBitir = async (dersId, kullaniciId) => {
    await Ders.updateOne(
        { _id: dersId, kullaniciId, aktifMateryalIslemSayisi: { $gt: 0 } },
        { $inc: { aktifMateryalIslemSayisi: -1 } }
    );
};

/**
 * Arka planda metin çıkarma ve parçalama işlemini güvenli staging mantığıyla yürütür.
 * Eşzamanlı çağrılar veya silme işlemleriyle yarış durumlarına karşı dayanıklıdır.
 */
const arkaPlandaMetinCikar = async (materyalIds, dersId, kullaniciId) => {
    const basariliMateryalIds = [];

    for (const id of materyalIds) {
        const yeniIslemeId = new mongoose.Types.ObjectId();
        try {
            // 1. Atomik sahiplik alımı: Yalnızca "siliniyor" olmayan ve "isleniyor" durumda olmayan materyali sahiplen
            const materyal = await Materyal.findOneAndUpdate(
                { _id: id, durum: { $nin: ["isleniyor", "siliniyor"] } },
                { $set: { durum: "isleniyor", islemeId: yeniIslemeId, islemeHatasi: "" } },
                { new: true }
            );

            if (!materyal) {
                // Materyal zaten başka bir işlem tarafından işleniyor, silinmiş ya da silinme aşamasında
                continue;
            }

            // 2. Metin çıkarma
            const cikarilanText = await metinCikar(materyal.dosyaYolu, materyal.mimeTuru);

            // 3. Kontrol noktası: Metin çıkarılırken materyal silinmiş veya silinme aşamasına alınmış mı?
            const aktifMateryal = await Materyal.findOne({ _id: id, islemeId: yeniIslemeId, durum: "isleniyor" });
            if (!aktifMateryal) {
                // Silme başladıysa veya durum değiştiyse yazma yapmadan çık
                continue;
            }

            // 4. Staging olarak metin parçalarını kaydet (eski parçalara dokunulmaz)
            await metinParcalaVeKaydet(cikarilanText, aktifMateryal, yeniIslemeId);

            // 5. Atomik Taahhüt (Commit): Materyal hâlâ bu işleme mi ait ve "isleniyor" durumunda mı?
            const guncellenen = await Materyal.findOneAndUpdate(
                { _id: id, islemeId: yeniIslemeId, durum: "isleniyor" },
                {
                    $set: {
                        durum: "hazir",
                        aktifIslemeId: yeniIslemeId,
                        cikarilanMetin: cikarilanText,
                        islemeHatasi: ""
                    }
                },
                { new: true }
            );

            if (!guncellenen) {
                // Materyal insertMany sırasında veya hemen sonrasında silinmişse veya iptal edildiyse
                // Yazılmış yeni parçaları da temizle (yetim kayıt kalmasını önle)
                await MetinParcasi.deleteMany({ materyalId: id, islemeId: yeniIslemeId });
                continue;
            }

            // 6. Başarılı taahhüt sonrası eski parçaları güvenle temizle
            try {
                await MetinParcasi.deleteMany({ materyalId: id, islemeId: { $ne: yeniIslemeId } });
            } catch (eskiSilmeHatasi) {
                console.error(`Eski parçaları temizleme uyarısı (Materyal ID: ${id}):`, eskiSilmeHatasi.message);
                // Taahhüt edilmiş aktif versiyonu BOZMA; catch bloğuna düşüp aktif versiyonu silmesini engelle!
            }

            basariliMateryalIds.push(id);

        } catch (error) {
            console.error(`Metin çıkarma hatası (Materyal ID: ${id}):`, error);

            // Hata durumunda bu işleme ait kısmi parçaları temizle (eski aktif versiyona dokunma!)
            await MetinParcasi.deleteMany({ materyalId: id, islemeId: yeniIslemeId });

            // Materyal silinme aşamasında değilse hata durumunu kaydet
            await Materyal.findOneAndUpdate(
                { _id: id, islemeId: yeniIslemeId, durum: "isleniyor" },
                {
                    $set: {
                        durum: "hata",
                        islemeHatasi: error.message
                    }
                }
            );
        }
    }

    // Başarıyla hazır duruma gelen yeni materyalleri sırayla ve güvenle incremental olarak konu haritasına ekle
    // Yalnızca yeni yüklenen materyal analiz edilir; eski tüm materyaller Gemini'ye yeniden gönderilmez
    if (dersId && kullaniciId && basariliMateryalIds.length > 0) {
        for (const matId of basariliMateryalIds) {
            try {
                await materyalEklendigindeIncrementalGuncelle(matId, dersId, kullaniciId);
            } catch (incHata) {
                console.error(`Incremental konu haritası güncelleme hatası (Materyal ID: ${matId}):`, incHata.message);
            }
        }
    }
};

export const materyalYukle = async (req, res) => {
    const dersId = req.params.dersId;
    const kullaniciId = req.user._id;
    let islemKaydedildi = false;
    let arkaPlanaDevredildi = false;
    const basariliIds = [];

    try {
        if (!mongoose.Types.ObjectId.isValid(dersId)) {
            return res.status(400).json({ hata: "Geçersiz ders kimliği." });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ hata: "Dosya yüklenmedi." });
        }

        const ders = await materyalIslemiBaslat(dersId, kullaniciId);
        if (!ders) {
            const mevcut = await Ders.findOne({ _id: dersId, kullaniciId });
            return res.status(mevcut ? 409 : 404).json({
                hata: mevcut
                    ? "Bu dersin materyalleri onaylandı. Yeni materyal eklenemez."
                    : "Ders bulunamadı veya yetkiniz yok."
            });
        }
        islemKaydedildi = true;

        const yuklenenMateryaller = [];
        const tekrarEdenDosyalar = [];
        const dogrulananDosyalar = [];

        for (const file of req.files) {
            const dosyaIcerigi = await fs.readFile(file.path);

            const ext = path.extname(file.originalname).substring(1).toLowerCase();
            const dosyaTuru =
                ext === "docx" ? "docx" :
                    ext === "pptx" ? "pptx" :
                        ext === "txt" ? "txt" : "pdf";

            // Uzantı/MIME filtresine ek olarak, diske yazılmış gerçek içeriği
            // kalıcı Materyal kaydı oluşturmadan önce doğrula.
            dosyaIceriginiDogrula(dosyaIcerigi, dosyaTuru);

            const dosyaHash = crypto
                .createHash("sha256")
                .update(dosyaIcerigi)
                .digest("hex");

            dogrulananDosyalar.push({ file, dosyaTuru, dosyaHash });
        }

        // Toplu yüklemede tek bir geçersiz dosya varsa hiçbir kalıcı kayıt
        // oluşturmamak için veritabanı yazılarına ancak tüm doğrulamalar geçince başla.
        for (const { file, dosyaTuru, dosyaHash } of dogrulananDosyalar) {
            try {
                const yeniMateryal = await Materyal.create({
                    kullaniciId,
                    dersId,
                    dosyaAdi: file.filename,
                    orijinalDosyaAdi: file.originalname,
                    dosyaYolu: file.path,
                    dosyaTuru,
                    mimeTuru: file.mimetype,
                    dosyaBoyutu: file.size,
                    dosyaHash,
                    durum: "yuklendi"
                });

                basariliIds.push(yeniMateryal._id);
                yuklenenMateryaller.push(yeniMateryal);

            } catch (error) {
                if (error.code === 11000) {
                    tekrarEdenDosyalar.push(file.originalname);
                    await fs.unlink(file.path).catch(() => { });
                    continue;
                }

                throw error;
            }
        }
        if (basariliIds.length === 0) {
            return res.status(409).json({
                hata: "Yüklenen dosyaların tamamı bu derste zaten mevcut.",
                tekrarEdenDosyalar
            });
        }

        // Kilit, metin çıkarma ve incremental Gemini güncellemesi bitene kadar korunur.
        const arkaPlan = arkaPlandaMetinCikar(basariliIds, dersId, kullaniciId);
        arkaPlanaDevredildi = true;
        void arkaPlan
            .catch((hata) => console.error("Arka plan materyal işleme hatası:", hata))
            .finally(() => materyalIslemiBitir(dersId, kullaniciId).catch((hata) => {
                console.error("Materyal işlem kilidi bırakılamadı:", hata);
            }));

        return res.status(201).json({
            mesaj: "Materyaller başarıyla yüklendi ve işlemeye alındı",
            materyaller: yuklenenMateryaller,
            tekrarEdenDosyalar
        });
    } catch (error) {
        if (basariliIds.length > 0 && !arkaPlanaDevredildi) {
            try {
                await Materyal.deleteMany({ _id: { $in: basariliIds } });
            } catch (temizlemeHatasi) {
                console.error("Materyal kayıt temizleme hatası:", temizlemeHatasi);
            }
        }
        return res.status(error.statusCode === 400 ? 400 : 500).json({
            hata: error.message || "Materyal yüklenirken bir hata oluştu."
        });
    } finally {
        if (!arkaPlanaDevredildi) {
            if (req.files) {
                for (const file of req.files) {
                    try {
                        guvenliDosyaSil(file.path);
                    } catch (temizlemeHatasi) {
                        console.error(`Geçici dosya temizlenemedi (${file.path}):`, temizlemeHatasi);
                    }
                }
            }
            if (islemKaydedildi) {
                await materyalIslemiBitir(dersId, kullaniciId).catch(hata => {
                    console.error("Materyal işlem kilidi bırakılamadı:", hata);
                });
            }
        }
    }
};

export const materyalleriGetir = async (req, res) => {
    try {
        const dersId = req.params.dersId;
        const kullaniciId = req.user._id;

        const ders = await Ders.findOne({ _id: dersId, kullaniciId });
        if (!ders) {
            return res.status(404).json({ hata: "Ders bulunamadı veya yetkiniz yok." });
        }

        const materyaller = await Materyal.find({ dersId, kullaniciId }).select('-cikarilanMetin').sort({ createdAt: -1 });
        res.status(200).json({ materyaller });
    } catch (error) {
        res.status(500).json({ hata: "Materyaller getirilirken hata oluştu." });
    }
};

export const materyalGetir = async (req, res) => {
    try {
        const materyalId = req.params.id;
        const kullaniciId = req.user._id;

        const materyal = await Materyal.findOne({ _id: materyalId, kullaniciId });
        if (!materyal) {
            return res.status(404).json({ hata: "Materyal bulunamadı veya yetkiniz yok." });
        }

        res.status(200).json({ materyal });
    } catch (error) {
        res.status(500).json({ hata: "Materyal getirilirken hata oluştu." });
    }
};

export const materyalSil = async (req, res) => {
    const materyalId = req.params.id;
    const kullaniciId = req.user._id;
    let kilitliDersId = null;

    try {
        if (!mongoose.Types.ObjectId.isValid(materyalId)) {
            return res.status(400).json({ hata: "Geçersiz materyal kimliği." });
        }

        const mevcutMateryal = await Materyal.findOne({ _id: materyalId, kullaniciId });
        if (!mevcutMateryal) {
            return res.status(404).json({ hata: "Materyal bulunamadı veya yetkiniz yok." });
        }

        const ders = await materyalIslemiBaslat(mevcutMateryal.dersId, kullaniciId);
        if (!ders) {
            return res.status(409).json({ hata: "Bu dersin materyalleri onaylandı veya ders artık mevcut değil." });
        }
        kilitliDersId = mevcutMateryal.dersId;

        const materyal = await Materyal.findOneAndUpdate(
            { _id: materyalId, kullaniciId, dersId: kilitliDersId, durum: { $ne: "siliniyor" } },
            { $set: { durum: "siliniyor" } },
            { new: true }
        );
        if (!materyal) {
            return res.status(404).json({ hata: "Materyal bulunamadı, silinmekte veya yetkiniz yok." });
        }

        await MetinParcasi.deleteMany({ materyalId });
        await guvenliDosyaSil(materyal.dosyaYolu);
        await Materyal.deleteOne({ _id: materyalId, kullaniciId });
        await MetinParcasi.deleteMany({ materyalId });

        // Harita güncellemesini de kilidin içinde tamamla.
        await materyalSilindigindeGuncelle(materyalId, materyal.dersId, kullaniciId);
        return res.status(200).json({ mesaj: "Materyal başarıyla silindi." });
    } catch (error) {
        console.error("Materyal silme hatası:", error);
        return res.status(500).json({ hata: "Materyal silinirken hata oluştu: " + error.message });
    } finally {
        if (kilitliDersId) {
            await materyalIslemiBitir(kilitliDersId, kullaniciId).catch(hata => {
                console.error("Materyal işlem kilidi bırakılamadı:", hata);
            });
        }
    }
};

export const materyalMetinCikar = async (req, res) => {
    const materyalId = req.params.id;
    const kullaniciId = req.user._id;
    const yeniIslemeId = new mongoose.Types.ObjectId();
    let kilitliDersId = null;

    try {
        if (!mongoose.Types.ObjectId.isValid(materyalId)) {
            return res.status(400).json({ hata: "Geçersiz materyal kimliği." });
        }
        const mevcutMateryal = await Materyal.findOne({ _id: materyalId, kullaniciId });
        if (!mevcutMateryal) {
            return res.status(404).json({ hata: "Materyal bulunamadı veya yetkiniz yok." });
        }
        const ders = await materyalIslemiBaslat(mevcutMateryal.dersId, kullaniciId);
        if (!ders) {
            return res.status(409).json({ hata: "Bu dersin materyalleri onaylandı veya ders artık mevcut değil." });
        }
        kilitliDersId = mevcutMateryal.dersId;

        // 1. Atomik sahiplik alımı
        const materyal = await Materyal.findOneAndUpdate(
            { _id: materyalId, kullaniciId, dersId: kilitliDersId, durum: { $nin: ["isleniyor", "siliniyor"] } },
            { $set: { durum: "isleniyor", islemeId: yeniIslemeId, islemeHatasi: "" } },
            { new: true }
        );

        if (!materyal) {
            // Materyal zaten işleniyor olabilir veya bulunamadı
            const mevcut = await Materyal.findOne({ _id: materyalId, kullaniciId });
            if (!mevcut) {
                return res.status(404).json({ hata: "Materyal bulunamadı veya yetkiniz yok." });
            }
            if (mevcut.durum === "isleniyor") {
                return res.status(409).json({ hata: "Materyal şu anda zaten işleniyor." });
            }
            if (mevcut.durum === "siliniyor") {
                return res.status(409).json({ hata: "Materyal silinme aşamasında." });
            }
            return res.status(400).json({ hata: "Materyal işlenmeye uygun durumda değil." });
        }

        try {
            // 2. Metin çıkarma
            const cikarilanText = await metinCikar(materyal.dosyaYolu, materyal.mimeTuru);

            // 3. Kontrol noktası: Metin çıkarılırken materyal silinmiş veya siliniyor yapılmış mı?
            const aktifMateryal = await Materyal.findOne({ _id: materyalId, islemeId: yeniIslemeId, durum: "isleniyor" });
            if (!aktifMateryal) {
                await MetinParcasi.deleteMany({ materyalId: materyalId, islemeId: yeniIslemeId });
                return res.status(409).json({ hata: "Materyal işleme sırasında silindi veya iptal edildi." });
            }

            // 4. Staging olarak metin parçalarını kaydet
            await metinParcalaVeKaydet(cikarilanText, aktifMateryal, yeniIslemeId);

            // 5. Atomik Taahhüt (Commit)
            const guncellenen = await Materyal.findOneAndUpdate(
                { _id: materyalId, islemeId: yeniIslemeId, durum: "isleniyor" },
                {
                    $set: {
                        durum: "hazir",
                        aktifIslemeId: yeniIslemeId,
                        cikarilanMetin: cikarilanText,
                        islemeHatasi: ""
                    }
                },
                { new: true }
            );

            if (!guncellenen) {
                await MetinParcasi.deleteMany({ materyalId: materyalId, islemeId: yeniIslemeId });
                return res.status(409).json({ hata: "Materyal işleme tamamlanırken silindi veya iptal edildi." });
            }

            // 6. Eski parçaları temizle
            try {
                await MetinParcasi.deleteMany({ materyalId: materyalId, islemeId: { $ne: yeniIslemeId } });
            } catch (eskiSilmeHatasi) {
                console.error(`Eski parçaları temizleme uyarısı (Materyal ID: ${materyalId}):`, eskiSilmeHatasi.message);
                // Taahhüt edilmiş aktif versiyonu BOZMA; catch bloğuna düşüp aktif parçaları silmesini engelle!
            }

            // Başarılı taahhüt sonrası konu haritası hatası aktif metin sürümünü bozmamalı.
            try {
                await materyalEklendigindeIncrementalGuncelle(materyalId, materyal.dersId, kullaniciId);
            } catch (konuHaritasiHatasi) {
                console.error(
                    `Incremental konu haritası güncelleme hatası (Materyal ID: ${materyalId}):`,
                    konuHaritasiHatasi.message
                );
            }

            return res.status(200).json({ mesaj: "Metin başarıyla çıkarıldı.", materyal: guncellenen });
        } catch (err) {
            // Bu denemenin parçalarını temizle (eski aktif versiyon korunur)
            await MetinParcasi.deleteMany({ materyalId: materyalId, islemeId: yeniIslemeId });

            await Materyal.findOneAndUpdate(
                { _id: materyalId, islemeId: yeniIslemeId, durum: "isleniyor" },
                {
                    $set: {
                        durum: mevcutMateryal.aktifIslemeId ? "hazir" : "hata",
                        islemeHatasi: err.message
                    }
                }
            );

            return res.status(400).json({ hata: "Metin çıkarma başarısız oldu: " + err.message });
        }
    } catch (error) {
        return res.status(500).json({ hata: "Metin çıkarma isteği işlenirken hata oluştu: " + error.message });
    } finally {
        if (kilitliDersId) {
            await materyalIslemiBitir(kilitliDersId, kullaniciId).catch(hata => {
                console.error("Materyal işlem kilidi bırakılamadı:", hata);
            });
        }
    }
};

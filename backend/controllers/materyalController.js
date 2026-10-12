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
    try {
        const dersId = req.params.dersId;
        const kullaniciId = req.user._id;

        const ders = await Ders.findOne({ _id: dersId, kullaniciId });
        if (!ders) {
            // Yetki yok veya ders yoksa, yuklenen dosyalari temizle
            if (req.files) {
                req.files.forEach(file => {
                    guvenliDosyaSil(file.path);
                });
            }
            return res.status(404).json({ hata: "Ders bulunamadı veya yetkiniz yok." });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ hata: "Dosya yüklenmedi." });
        }

        const yuklenenMateryaller = [];
        const basariliIds = [];

        try {
            for (const file of req.files) {
                const ext = path.extname(file.originalname).substring(1).toLowerCase();
                const dosyaTuru = ext === "docx" ? "docx" : ext === "pptx" ? "pptx" : ext === "txt" ? "txt" : "pdf";

                const yeniMateryal = await Materyal.create({
                    kullaniciId,
                    dersId,
                    dosyaAdi: file.filename,
                    orijinalDosyaAdi: file.originalname,
                    dosyaYolu: file.path,
                    dosyaTuru,
                    mimeTuru: file.mimetype,
                    dosyaBoyutu: file.size,
                    durum: "yuklendi"
                });

                basariliIds.push(yeniMateryal._id);
                yuklenenMateryaller.push(yeniMateryal);
            }

            // Arka planda extraction başlat (await kullanmıyoruz)
            // dersId ve kullaniciId iletilir: batch bitince konu haritası da otomatik güncellenir
            arkaPlandaMetinCikar(basariliIds, dersId, kullaniciId);

            res.status(201).json({ mesaj: "Materyaller başarıyla yüklendi ve işlemeye alındı", materyaller: yuklenenMateryaller });
        } catch (dbError) {
            // DB kaydı sırasında hata olursa oluşturulanları geri al
            if (basariliIds.length > 0) {
                await Materyal.deleteMany({ _id: { $in: basariliIds } });
            }
            throw dbError; // Outer catch'e fırlat ki dosyalar da silinsin
        }
    } catch (error) {
        if (req.files) {
            req.files.forEach(file => {
                guvenliDosyaSil(file.path);
            });
        }
        res.status(500).json({ hata: error.message || "Materyal yüklenirken bir hata oluştu." });
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
    try {
        const materyalId = req.params.id;
        const kullaniciId = req.user._id;

        // 1. Atomik olarak materyali "siliniyor" durumuna geçir (devam eden işlemleri iptale zorlar)
        const materyal = await Materyal.findOneAndUpdate(
            { _id: materyalId, kullaniciId, durum: { $ne: "siliniyor" } },
            { $set: { durum: "siliniyor" } },
            { new: true }
        );

        if (!materyal) {
            return res.status(404).json({ hata: "Materyal bulunamadı, silinmekte veya yetkiniz yok." });
        }

        // 2. İlişkili tüm metin parçalarını sil (tüm versiyonlar/staging dahil)
        await MetinParcasi.deleteMany({ materyalId: materyalId });
        
        // 3. Dosyayı güvenli ve idempotent şekilde diskten sil
        guvenliDosyaSil(materyal.dosyaYolu);

        // 4. Materyali veritabanından tamamen sil
        await Materyal.deleteOne({ _id: materyalId });

        // 5. Yarış durumu temizliği: Silme işlemi sırasında `insertMany` yapmış olabilecek arka plan işi varsa temizle
        await MetinParcasi.deleteMany({ materyalId: materyalId });

        // 6. Silme tamamlandı; Gemini ÇAĞIRMADAN konu haritasındaki kaynak bağlantısını kaldır ve gerekirse arşivle
        // Hata yanıtı bloke edilmez; arka plan hatası HTTP yanıtını etkilemez
        materyalSilindigindeGuncelle(materyalId, materyal.dersId, kullaniciId).catch((hata) => {
            console.error(`Materyal silme sonrası incremental konu haritası güncelleme hatası (Ders ID: ${materyal.dersId}):`, hata.message);
        });

        res.status(200).json({ mesaj: "Materyal başarıyla silindi." });
    } catch (error) {
        console.error("Materyal silme hatası:", error);
        res.status(500).json({ hata: "Materyal silinirken hata oluştu: " + error.message });
    }
};

export const materyalMetinCikar = async (req, res) => {
    const materyalId = req.params.id;
    const kullaniciId = req.user._id;
    const yeniIslemeId = new mongoose.Types.ObjectId();

    try {
        // 1. Atomik sahiplik alımı
        const materyal = await Materyal.findOneAndUpdate(
            { _id: materyalId, kullaniciId, durum: { $nin: ["isleniyor", "siliniyor"] } },
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

            // Başarılı taahhüt sonrası yeni materyali incremental olarak konu haritasına ekle
            materyalEklendigindeIncrementalGuncelle(materyalId, materyal.dersId, kullaniciId).catch((hata) => {
                console.error(`Tekil metin çıkarma sonrası incremental konu haritası tetikleme hatası (Ders ID: ${materyal.dersId}):`, hata.message);
            });

            return res.status(200).json({ mesaj: "Metin başarıyla çıkarıldı.", materyal: guncellenen });
        } catch (err) {
            // Bu denemenin parçalarını temizle (eski aktif versiyon korunur)
            await MetinParcasi.deleteMany({ materyalId: materyalId, islemeId: yeniIslemeId });

            await Materyal.findOneAndUpdate(
                { _id: materyalId, islemeId: yeniIslemeId, durum: "isleniyor" },
                {
                    $set: {
                        durum: "hata",
                        islemeHatasi: err.message
                    }
                }
            );

            return res.status(400).json({ hata: "Metin çıkarma başarısız oldu: " + err.message });
        }
    } catch (error) {
        res.status(500).json({ hata: "Metin çıkarma isteği işlenirken hata oluştu: " + error.message });
    }
};

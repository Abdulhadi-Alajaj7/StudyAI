
import Materyal from "../models/Materyal.js";
import Ders from "../models/Ders.js";
import path from "path";
import { guvenliDosyaSil } from "../utils/dosyaIslemleri.js";
import { metinCikar } from "../services/metinCikarmaService.js";
import { metinParcalaVeKaydet } from "../services/metinParcalamaService.js";
import MetinParcasi from "../models/MetinParcasi.js";
import DersOzeti from "../models/DersOzeti.js";
import mongoose from "mongoose";

import crypto from "node:crypto";
import fs from "node:fs/promises";
import { dosyaIceriginiDogrula } from "../services/dosyaTuruDogrulamaService.js";
import { sureOlc } from "../utils/islemSuresi.js";
import { DOSYA_BOYUT_SINIRLARI, MAKSIMUM_DOSYA_SAYISI } from "../config/materyalYuklemeSinirlari.js";

const metinCikarmaKullaniciMesaji = () => (
    "Dosya içeriğinden metin çıkarılamadı. Dosyanın bozuk olmadığını kontrol edip tekrar deneyin."
);

/**
 * Ders onayıyla yarışmayan atomik materyal işlem kaydı.
 * Başarılı her kayıt, işlem tamamen bitince bir kez serbest bırakılmalıdır.
 */
const materyalIslemiBaslat = async (dersId, kullaniciId, session) => {
    return Ders.findOneAndUpdate(
        {
            _id: dersId,
            kullaniciId,
            materyallerOnaylandi: { $ne: true },
            hazirlamaDurumu: { $ne: "isleniyor" },
            temizleniyor: { $ne: true }
        },
        { $inc: { aktifMateryalIslemSayisi: 1 }, $set: { hazirlamaAsamasi: "metinler" } },
        { new: true, session }
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
const arkaPlandaMetinCikar = async (materyalIds) => {

    for (const id of materyalIds) {
        const yeniIslemeId = new mongoose.Types.ObjectId();
        try {
            // 1. Atomik sahiplik alımı: Yalnızca "siliniyor" olmayan ve "isleniyor" durumda olmayan materyali sahiplen
            const materyal = await Materyal.findOneAndUpdate(
                { _id: id, durum: { $nin: ["isleniyor", "siliniyor"] } },
                {
                    $set: {
                        durum: "isleniyor",
                        islemeId: yeniIslemeId,
                        islemeHatasi: "",
                        embeddingDurumu: "bekliyor",
                        embeddingHatasi: ""
                    }
                },
                { new: true }
            );

            if (!materyal) {
                // Materyal zaten başka bir işlem tarafından işleniyor, silinmiş ya da silinme aşamasında
                continue;
            }

            // 2. Metin çıkarma
            const cikarilanText = await sureOlc("metin_cikarma", () => metinCikar(materyal.dosyaYolu, materyal.mimeTuru));

            // 3. Kontrol noktası: Metin çıkarılırken materyal silinmiş veya silinme aşamasına alınmış mı?
            const aktifMateryal = await Materyal.findOne({ _id: id, islemeId: yeniIslemeId, durum: "isleniyor" });
            if (!aktifMateryal) {
                // Silme başladıysa veya durum değiştiyse yazma yapmadan çık
                continue;
            }

            // 4. Staging olarak metin parçalarını kaydet (eski parçalara dokunulmaz)
            await sureOlc("metin_parcalama_ve_kayit", () => metinParcalaVeKaydet(cikarilanText, aktifMateryal, yeniIslemeId));

            // 5. Atomik Taahhüt (Commit): Materyal hâlâ bu işleme mi ait ve "isleniyor" durumunda mı?
            const guncellenen = await Materyal.findOneAndUpdate(
                { _id: id, islemeId: yeniIslemeId, durum: "isleniyor" },
                {
                    $set: {
                        durum: "hazir",
                        aktifIslemeId: yeniIslemeId,
                        cikarilanMetin: cikarilanText,
                        islemeHatasi: "",
                        embeddingDurumu: "bekliyor",
                        embeddingHatasi: ""
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

            // 6. Yalnızca işlem başında aktif olan eski sürümü temizle. Materyal
            // hazir olduktan sonra başlayabilecek daha yeni staging sürümlerine dokunma.
            try {
                await MetinParcasi.deleteMany({
                    materyalId: id,
                    islemeId: materyal.aktifIslemeId ?? null
                });
            } catch (eskiSilmeHatasi) {
                console.error(`Eski parçaları temizleme uyarısı (Materyal ID: ${id}):`, eskiSilmeHatasi.message);
                // Taahhüt edilmiş aktif versiyonu BOZMA; catch bloğuna düşüp aktif versiyonu silmesini engelle!
            }


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
                        islemeHatasi: metinCikarmaKullaniciMesaji(),
                        embeddingDurumu: "hata",
                        embeddingHatasi: "Metin hazırlanamadığı için semantik arama dizini oluşturulamadı."
                    }
                }
            );
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

        const session = await mongoose.startSession();
        let sonuc;
        try {
            sonuc = await session.withTransaction(async () => {
                // Sayım ve kayıt aynı ders belgesine yazan yüklemeler arasında sıralanır.
                const ders = await materyalIslemiBaslat(dersId, kullaniciId, session);
                if (!ders) return null;

                const mevcutSayi = await Materyal.countDocuments({ dersId, kullaniciId }, { session });
                const kalan = Math.max(0, MAKSIMUM_DOSYA_SAYISI - mevcutSayi);
                if (req.files.length > kalan) {
                    const mesaj = kalan === 0
                        ? `Ders başına en fazla ${MAKSIMUM_DOSYA_SAYISI} materyal yükleyebilirsiniz. Yeni dosya yüklemek için mevcut bir materyali silin.`
                        : `Ders başına en fazla ${MAKSIMUM_DOSYA_SAYISI} materyal yükleyebilirsiniz. En fazla ${kalan} dosya daha yükleyebilirsiniz.`;
                    throw Object.assign(new Error(mesaj), { statusCode: 400, code: "DOSYA_SAYISI_ASILDI" });
                }

                const dogrulananDosyalar = [];
                for (const file of req.files) {
                    const dosyaTuru = path.extname(file.originalname).substring(1).toLowerCase();
                    if (!Object.hasOwn(DOSYA_BOYUT_SINIRLARI, dosyaTuru)) {
                        throw Object.assign(new Error("Sadece PDF, DOCX, PPTX ve TXT dosyaları desteklenir."), {
                            statusCode: 400, code: "DESTEKLENMEYEN_DOSYA_TURU"
                        });
                    }
                    const sinir = DOSYA_BOYUT_SINIRLARI[dosyaTuru];
                    const dosyaIcerigi = await fs.readFile(file.path);
                    if (dosyaIcerigi.length > sinir.bayt) {
                        throw Object.assign(
                            new Error(`${dosyaTuru.toUpperCase()} dosyaları en fazla ${sinir.etiket} olabilir.`),
                            { statusCode: 400, code: "LIMIT_FILE_SIZE" }
                        );
                    }

                    // Uzantı/MIME filtresine ek olarak gerçek içeriği kalıcı kayıttan önce doğrula.
                    dosyaIceriginiDogrula(dosyaIcerigi, dosyaTuru);
                    const dosyaHash = crypto.createHash("sha256").update(dosyaIcerigi).digest("hex");
                    dogrulananDosyalar.push({ file, dosyaTuru, dosyaHash });
                }

                const yuklenenMateryaller = [];
                const tekrarEdenDosyalar = [];
                for (const { file, dosyaTuru, dosyaHash } of dogrulananDosyalar) {
                    // Yinelenen içerikleri işlemi iptal eden bir indeks hatası oluşmadan atla.
                    if (await Materyal.findOne({ dersId, dosyaHash }, "_id", { session })) {
                        tekrarEdenDosyalar.push(file);
                        continue;
                    }

                    const [yeniMateryal] = await Materyal.create([{
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
                    }], { session });
                    yuklenenMateryaller.push(yeniMateryal);
                }
                return { yuklenenMateryaller, tekrarEdenDosyalar };
            });
            if (sonuc) {
                islemKaydedildi = true;
                basariliIds.push(...sonuc.yuklenenMateryaller.map(materyal => materyal._id));
            }
        } finally {
            await session.endSession();
        }

        if (!sonuc) {
            const mevcut = await Ders.findOne({ _id: dersId, kullaniciId });
            return res.status(mevcut ? 409 : 404).json({
                hata: mevcut
                    ? "Bu ders hazırlanıyor veya materyalleri onaylandı. Yeni materyal eklenemez."
                    : "Ders bulunamadı veya yetkiniz yok."
            });
        }

        const { yuklenenMateryaller } = sonuc;
        const tekrarEdenDosyalar = sonuc.tekrarEdenDosyalar.map(file => file.originalname);
        for (const file of sonuc.tekrarEdenDosyalar) {
            await fs.unlink(file.path).catch(() => { });
        }
        if (basariliIds.length === 0) {
            return res.status(409).json({
                hata: "Yüklenen dosyaların tamamı bu derste zaten mevcut.",
                tekrarEdenDosyalar
            });
        }

        // Kilit yalnızca yerel metin hazırlama bitene kadar korunur.
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
        const istemciHatasi = error.statusCode === 400;
        return res.status(istemciHatasi ? 400 : 500).json({
            hata: istemciHatasi
                ? error.message
                : "Materyal yüklenirken bir sorun oluştu. Lütfen tekrar deneyin.",
            kod: error.code || (istemciHatasi ? "GECERSIZ_DOSYA" : "MATERYAL_YUKLEME_HATASI")
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
            return res.status(409).json({ hata: "Bu ders hazırlanıyor, onaylandı veya artık mevcut değil." });
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

        // Ders içeriği değiştiği için önceki tüm ders/materyal/konu özetleri
        // artık güncel kabul edilemez.
        await DersOzeti.deleteMany({ dersId: materyal.dersId, kullaniciId });

        // Sonraki onayda kaynak listesi ve harita güncelliği yeniden doğrulanır.
        return res.status(200).json({ mesaj: "Materyal başarıyla silindi." });
    } catch (error) {
        console.error("Materyal silme hatası:", error);
        return res.status(500).json({
            hata: "Materyal silinirken bir sorun oluştu. Lütfen tekrar deneyin.",
            kod: "MATERYAL_SILME_HATASI"
        });
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
            return res.status(409).json({ hata: "Bu ders hazırlanıyor, onaylandı veya artık mevcut değil." });
        }
        kilitliDersId = mevcutMateryal.dersId;

        // 1. Atomik sahiplik alımı
        const materyal = await Materyal.findOneAndUpdate(
            { _id: materyalId, kullaniciId, dersId: kilitliDersId, durum: { $nin: ["isleniyor", "siliniyor"] } },
            {
                $set: {
                    durum: "isleniyor",
                    islemeId: yeniIslemeId,
                    islemeHatasi: "",
                    embeddingDurumu: "bekliyor",
                    embeddingHatasi: ""
                }
            },
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
            const cikarilanText = await sureOlc("metin_cikarma", () => metinCikar(materyal.dosyaYolu, materyal.mimeTuru));

            // 3. Kontrol noktası: Metin çıkarılırken materyal silinmiş veya siliniyor yapılmış mı?
            const aktifMateryal = await Materyal.findOne({ _id: materyalId, islemeId: yeniIslemeId, durum: "isleniyor" });
            if (!aktifMateryal) {
                await MetinParcasi.deleteMany({ materyalId: materyalId, islemeId: yeniIslemeId });
                return res.status(409).json({ hata: "Materyal işleme sırasında silindi veya iptal edildi." });
            }

            // 4. Staging olarak metin parçalarını kaydet
            await sureOlc("metin_parcalama_ve_kayit", () => metinParcalaVeKaydet(cikarilanText, aktifMateryal, yeniIslemeId));

            // 5. Atomik Taahhüt (Commit)
            const guncellenen = await Materyal.findOneAndUpdate(
                { _id: materyalId, islemeId: yeniIslemeId, durum: "isleniyor" },
                {
                    $set: {
                        durum: "hazir",
                        aktifIslemeId: yeniIslemeId,
                        cikarilanMetin: cikarilanText,
                        islemeHatasi: "",
                        embeddingDurumu: "bekliyor",
                        embeddingHatasi: ""
                    }
                },
                { new: true }
            );

            if (!guncellenen) {
                await MetinParcasi.deleteMany({ materyalId: materyalId, islemeId: yeniIslemeId });
                return res.status(409).json({ hata: "Materyal işleme tamamlanırken silindi veya iptal edildi." });
            }

            // 6. Yalnızca işlem başında aktif olan eski sürümü temizle. Materyal
            // hazir olduktan sonra başlayabilecek daha yeni staging sürümlerine dokunma.
            try {
                await MetinParcasi.deleteMany({
                    materyalId: materyalId,
                    islemeId: materyal.aktifIslemeId ?? null
                });
            } catch (eskiSilmeHatasi) {
                console.error(`Eski parçaları temizleme uyarısı (Materyal ID: ${materyalId}):`, eskiSilmeHatasi.message);
                // Taahhüt edilmiş aktif versiyonu BOZMA; catch bloğuna düşüp aktif parçaları silmesini engelle!
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
                        islemeHatasi: metinCikarmaKullaniciMesaji(),
                        embeddingDurumu: mevcutMateryal.aktifIslemeId
                            ? (mevcutMateryal.embeddingDurumu || "bekliyor")
                            : "hata",
                        embeddingHatasi: mevcutMateryal.aktifIslemeId
                            ? (mevcutMateryal.embeddingHatasi || "")
                            : "Metin hazırlanamadığı için semantik arama dizini oluşturulamadı."
                    }
                }
            );

            return res.status(400).json({
                hata: metinCikarmaKullaniciMesaji(),
                kod: "METIN_CIKARMA_HATASI"
            });
        }
    } catch (error) {
        return res.status(500).json({
            hata: "Metin çıkarma isteği işlenirken bir sorun oluştu. Lütfen tekrar deneyin.",
            kod: "METIN_CIKARMA_ISTEK_HATASI"
        });
    } finally {
        if (kilitliDersId) {
            await materyalIslemiBitir(kilitliDersId, kullaniciId).catch(hata => {
                console.error("Materyal işlem kilidi bırakılamadı:", hata);
            });
        }
    }
};

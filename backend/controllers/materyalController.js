import Materyal from "../models/Materyal.js";
import Ders from "../models/Ders.js";
import path from "path";
import fs from "fs";

export const materyalYukle = async (req, res) => {
    try {
        const dersId = req.params.dersId;
        const kullaniciId = req.user._id;

        const ders = await Ders.findOne({ _id: dersId, kullaniciId });
        if (!ders) {
            // Yetki yok veya ders yoksa, yuklenen dosyalari temizle
            if (req.files) {
                req.files.forEach(file => {
                    if(fs.existsSync(file.path)) fs.unlinkSync(file.path);
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

            res.status(201).json({ mesaj: "Materyaller başarıyla yüklendi", materyaller: yuklenenMateryaller });
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
                if(fs.existsSync(file.path)) fs.unlinkSync(file.path);
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

        const materyaller = await Materyal.find({ dersId, kullaniciId }).sort({ createdAt: -1 });
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

        const materyal = await Materyal.findOne({ _id: materyalId, kullaniciId });
        if (!materyal) {
            return res.status(404).json({ hata: "Materyal bulunamadı veya yetkiniz yok." });
        }

        // Dosyayi diskten sil
        if (fs.existsSync(materyal.dosyaYolu)) {
            fs.unlinkSync(materyal.dosyaYolu);
        }

        await Materyal.deleteOne({ _id: materyalId });
        res.status(200).json({ mesaj: "Materyal başarıyla silindi." });
    } catch (error) {
        res.status(500).json({ hata: "Materyal silinirken hata oluştu." });
    }
};

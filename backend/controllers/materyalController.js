
import Materyal from "../models/Materyal.js";
import Ders from "../models/Ders.js";
import DersTaslagi from "../models/DersTaslagi.js";
import MetinParcasi from "../models/MetinParcasi.js";

import mongoose from "mongoose";
import path from "node:path";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";

import { guvenliDosyaSil } from "../utils/dosyaIslemleri.js";
import { metinCikar } from "../services/metinCikarmaService.js";
import { metinParcalaVeKaydet } from "../services/metinParcalamaService.js";

import {
    materyalEklendigindeIncrementalGuncelle,
    materyalSilindigindeGuncelle,
} from "../services/konuHaritasiService.js";

const TASLAK_DURUMLARI = [
    "hazirlaniyor",
    "analiz_hatasi",
    "onaya_hazir",
];

const dosyalariTemizle = (dosyalar = []) => {
    for (const dosya of dosyalar) {
        if (dosya?.path) {
            guvenliDosyaSil(dosya.path);
        }
    }
};

const gecerliId = (id) => mongoose.isValidObjectId(id);

const dosyaHashHesapla = async (dosyaYolu) => {
    const buffer = await fs.readFile(dosyaYolu);

    return createHash("sha256")
        .update(buffer)
        .digest("hex");
};

const dosyaTurunuBul = (dosyaAdi) => {
    const uzanti = path
        .extname(dosyaAdi)
        .slice(1)
        .toLowerCase();

    const desteklenen = ["pdf", "docx", "pptx", "txt"];

    if (!desteklenen.includes(uzanti)) {
        throw new Error("Desteklenmeyen dosya türü.");
    }

    return uzanti;
};

const taslakAnaliziniGecersizKil = async (taslakId, kullaniciId) => {
    return DersTaslagi.findOneAndUpdate(
        {
            _id: taslakId,
            kullaniciId,
            durum: { $in: TASLAK_DURUMLARI },
        },
        {
            $inc: { materyalSurumu: 1 },
            $set: {
                durum: "hazirlaniyor",
                analizSurumu: -1,
                hazirKonuHaritasi: null,
                analizTokeni: null,
                analizHatasi: "",
                analizBitisTarihi: null,
                sonEtkinlikTarihi: new Date(),
            },
        },
        { new: true }
    );
};

const materyalIsle = async (materyalId, kullaniciId) => {
    const islemeId = new mongoose.Types.ObjectId();

    const materyal = await Materyal.findOneAndUpdate(
        {
            _id: materyalId,
            kullaniciId,
            durum: {
                $in: ["yuklendi", "hata"],
            },
        },
        {
            $set: {
                durum: "isleniyor",
                islemeId,
                islemeHatasi: "",
            },
        },
        { new: true }
    );

    if (!materyal) {
        return null;
    }

    try {
        const metin = await metinCikar(
            materyal.dosyaYolu,
            materyal.mimeTuru
        );

        if (!metin || !metin.trim()) {
            throw new Error(
                "Dosyadan analiz edilebilir metin çıkarılamadı."
            );
        }

        const halaAktif = await Materyal.exists({
            _id: materyalId,
            islemeId,
            durum: "isleniyor",
        });

        if (!halaAktif) {
            return null;
        }

        await metinParcalaVeKaydet(
            metin,
            materyal,
            islemeId
        );

        const guncellenen = await Materyal.findOneAndUpdate(
            {
                _id: materyalId,
                islemeId,
                durum: "isleniyor",
            },
            {
                $set: {
                    durum: "hazir",
                    aktifIslemeId: islemeId,
                    cikarilanMetin: metin,
                    islemeHatasi: "",
                },
            },
            { new: true }
        );

        if (!guncellenen) {
            await MetinParcasi.deleteMany({
                materyalId,
                islemeId,
            });

            return null;
        }

        try {
            await MetinParcasi.deleteMany({
                materyalId,
                islemeId: { $ne: islemeId },
            });
        } catch (hata) {
            console.error(
                "Eski metin parçaları temizlenemedi:",
                hata.message
            );
        }

        return guncellenen;
    } catch (hata) {
        await MetinParcasi.deleteMany({
            materyalId,
            islemeId,
        });

        await Materyal.findOneAndUpdate(
            {
                _id: materyalId,
                islemeId,
                durum: "isleniyor",
            },
            {
                $set: {
                    durum: "hata",
                    islemeHatasi: hata.message,
                },
            }
        );

        console.error("Materyal işleme hatası:", hata.message);

        return null;
    }
};

const arkaPlandaMetinCikar = async (
    materyalIds,
    kullaniciId,
    dersId = null
) => {
    for (const materyalId of materyalIds) {
        const sonuc = await materyalIsle(
            materyalId,
            kullaniciId
        );

        // Taslakta Gemini haritası otomatik üretilmez.
        // Tüm dosyalar hazır olduğunda tek analiz yapılır.
        if (sonuc && dersId) {
            try {
                await materyalEklendigindeIncrementalGuncelle(
                    materyalId,
                    dersId,
                    kullaniciId
                );
            } catch (hata) {
                console.error(
                    "Konu haritası güncelleme hatası:",
                    hata.message
                );
            }
        }
    }
};

const materyalKaydet = async (
    req,
    sahiplik
) => {
    const kullaniciId = req.user._id;
    const dosyalar = req.files || [];

    if (dosyalar.length === 0) {
        return {
            status: 400,
            body: { hata: "Dosya yüklenmedi." },
        };
    }

    const materyaller = [];
    const yeniIds = [];
    const atlananDosyalar = [];

    for (const file of dosyalar) {
        try {
            const dosyaTuru = dosyaTurunuBul(
                file.originalname
            );

            const dosyaHash = await dosyaHashHesapla(
                file.path
            );

            const mevcut = await Materyal.findOne({
                kullaniciId,
                ...sahiplik,
                dosyaHash,
            });

            if (mevcut) {
                guvenliDosyaSil(file.path);

                atlananDosyalar.push({
                    dosyaAdi: file.originalname,
                    neden: "Aynı içerik zaten eklenmiş.",
                });

                continue;
            }

            const materyal = await Materyal.create({
                kullaniciId,
                dersId: sahiplik.dersId || null,
                taslakId: sahiplik.taslakId || null,
                dosyaAdi: file.filename,
                orijinalDosyaAdi: file.originalname,
                dosyaYolu: file.path,
                dosyaTuru,
                mimeTuru: file.mimetype,
                dosyaBoyutu: file.size,
                dosyaHash,
                durum: "yuklendi",
            });

            materyaller.push(materyal);
            yeniIds.push(materyal._id);
        } catch (hata) {
            guvenliDosyaSil(file.path);

            if (hata.code === 11000) {
                atlananDosyalar.push({
                    dosyaAdi: file.originalname,
                    neden: "Aynı içerik zaten eklenmiş.",
                });
            } else {
                console.error(
                    "Dosya kaydetme hatası:",
                    hata.message
                );

                atlananDosyalar.push({
                    dosyaAdi: file.originalname,
                    neden: hata.message,
                });
            }
        }
    }

    if (sahiplik.taslakId && yeniIds.length > 0) {
        const guncellenenTaslak =
            await taslakAnaliziniGecersizKil(
                sahiplik.taslakId,
                kullaniciId
            );

        if (!guncellenenTaslak) {
            for (const materyal of materyaller) {
                await Materyal.deleteOne({
                    _id: materyal._id,
                });

                guvenliDosyaSil(materyal.dosyaYolu);
            }

            return {
                status: 409,
                body: {
                    hata: "Taslak artık düzenlenemiyor.",
                },
            };
        }
    }

    if (yeniIds.length > 0) {
        void arkaPlandaMetinCikar(
            yeniIds,
            kullaniciId,
            sahiplik.dersId || null
        ).catch((hata) => {
            console.error(
                "Arka plan işleme hatası:",
                hata.message
            );
        });
    }

    return {
        status: 201,
        body: {
            mesaj: "Dosya yükleme işlemi tamamlandı.",
            materyaller,
            atlananDosyalar,
        },
    };
};

// POST /materyaller/ders/:dersId
export const materyalYukle = async (req, res) => {
    try {
        const { dersId } = req.params;

        if (!gecerliId(dersId)) {
            dosyalariTemizle(req.files);

            return res.status(400).json({
                hata: "Geçersiz ders ID.",
            });
        }

        const ders = await Ders.findOne({
            _id: dersId,
            kullaniciId: req.user._id,
        });

        if (!ders) {
            dosyalariTemizle(req.files);

            return res.status(404).json({
                hata: "Ders bulunamadı.",
            });
        }

        if (ders.materyallerKilitli) {
            dosyalariTemizle(req.files);

            return res.status(403).json({
                hata:
                    "Bu dersin materyalleri kilitlidir. " +
                    "Yeni materyal eklenemez.",
            });
        }

        const sonuc = await materyalKaydet(req, {
            dersId: ders._id,
        });

        return res
            .status(sonuc.status)
            .json(sonuc.body);
    } catch (hata) {
        dosyalariTemizle(req.files);

        return res.status(500).json({
            hata: hata.message,
        });
    }
};

// POST /materyaller/taslak/:taslakId
export const taslakMateryalYukle = async (req, res) => {
    try {
        const { taslakId } = req.params;

        if (!gecerliId(taslakId)) {
            dosyalariTemizle(req.files);

            return res.status(400).json({
                hata: "Geçersiz taslak ID.",
            });
        }

        const taslak = await DersTaslagi.findOne({
            _id: taslakId,
            kullaniciId: req.user._id,
            durum: { $in: TASLAK_DURUMLARI },
        });

        if (!taslak) {
            dosyalariTemizle(req.files);

            return res.status(409).json({
                hata:
                    "Taslak bulunamadı veya düzenlemeye kapalı.",
            });
        }

        const sonuc = await materyalKaydet(req, {
            taslakId: taslak._id,
        });

        return res
            .status(sonuc.status)
            .json(sonuc.body);
    } catch (hata) {
        dosyalariTemizle(req.files);

        return res.status(500).json({
            hata: hata.message,
        });
    }
};

// GET /materyaller/ders/:dersId
export const materyalleriGetir = async (req, res) => {
    try {
        const ders = await Ders.findOne({
            _id: req.params.dersId,
            kullaniciId: req.user._id,
        });

        if (!ders) {
            return res.status(404).json({
                hata: "Ders bulunamadı.",
            });
        }

        const materyaller = await Materyal.find({
            dersId: ders._id,
            kullaniciId: req.user._id,
        })
            .select("-cikarilanMetin")
            .sort({ createdAt: -1 });

        return res.json({ materyaller });
    } catch (hata) {
        return res.status(500).json({
            hata: hata.message,
        });
    }
};

// GET /materyaller/taslak/:taslakId
export const taslakMateryalleriGetir = async (
    req,
    res
) => {
    try {
        const taslak = await DersTaslagi.findOne({
            _id: req.params.taslakId,
            kullaniciId: req.user._id,
        });

        if (!taslak) {
            return res.status(404).json({
                hata: "Taslak bulunamadı.",
            });
        }

        const materyaller = await Materyal.find({
            taslakId: taslak._id,
            kullaniciId: req.user._id,
        })
            .select("-cikarilanMetin")
            .sort({ createdAt: -1 });

        return res.json({ materyaller });
    } catch (hata) {
        return res.status(500).json({
            hata: hata.message,
        });
    }
};

// GET /materyaller/:id
export const materyalGetir = async (req, res) => {
    try {
        const materyal = await Materyal.findOne({
            _id: req.params.id,
            kullaniciId: req.user._id,
        });

        if (!materyal) {
            return res.status(404).json({
                hata: "Materyal bulunamadı.",
            });
        }

        return res.json({ materyal });
    } catch (hata) {
        return res.status(500).json({
            hata: hata.message,
        });
    }
};

// DELETE /materyaller/:id
export const materyalSil = async (req, res) => {
    try {
        const materyal = await Materyal.findOne({
            _id: req.params.id,
            kullaniciId: req.user._id,
        });

        if (!materyal) {
            return res.status(404).json({
                hata: "Materyal bulunamadı.",
            });
        }

        if (materyal.dersId) {
            const ders = await Ders.findOne({
                _id: materyal.dersId,
                kullaniciId: req.user._id,
            });

            if (!ders || ders.materyallerKilitli) {
                return res.status(403).json({
                    hata:
                        "Ders onaylandığı için materyal silinemez.",
                });
            }
        }

        if (materyal.taslakId) {
            const taslak = await DersTaslagi.findOne({
                _id: materyal.taslakId,
                kullaniciId: req.user._id,
                durum: { $in: TASLAK_DURUMLARI },
            });

            if (!taslak) {
                return res.status(409).json({
                    hata:
                        "Taslak şu anda düzenlenemiyor.",
                });
            }

            const guncellenen =
                await taslakAnaliziniGecersizKil(
                    taslak._id,
                    req.user._id
                );

            if (!guncellenen) {
                return res.status(409).json({
                    hata: "Taslak düzenlemeye kapalı.",
                });
            }
        }

        const silinen = await Materyal.findOneAndUpdate(
            {
                _id: materyal._id,
                kullaniciId: req.user._id,
                durum: { $ne: "siliniyor" },
            },
            {
                $set: { durum: "siliniyor" },
            },
            { new: true }
        );

        if (!silinen) {
            return res.status(409).json({
                hata: "Materyal zaten siliniyor.",
            });
        }

        await MetinParcasi.deleteMany({
            materyalId: materyal._id,
        });

        guvenliDosyaSil(materyal.dosyaYolu);

        await Materyal.deleteOne({
            _id: materyal._id,
        });

        await MetinParcasi.deleteMany({
            materyalId: materyal._id,
        });

        if (materyal.dersId) {
            void materyalSilindigindeGuncelle(
                materyal._id,
                materyal.dersId,
                req.user._id
            ).catch((hata) => {
                console.error(
                    "Konu haritası kaynak güncelleme hatası:",
                    hata.message
                );
            });
        }

        return res.json({
            mesaj: "Materyal başarıyla silindi.",
        });
    } catch (hata) {
        console.error("Materyal silme hatası:", hata);

        return res.status(500).json({
            hata: hata.message,
        });
    }
};

// POST /materyaller/:id/metin-cikar
export const materyalMetinCikar = async (req, res) => {
    try {
        const materyal = await Materyal.findOne({
            _id: req.params.id,
            kullaniciId: req.user._id,
        });

        if (!materyal) {
            return res.status(404).json({
                hata: "Materyal bulunamadı.",
            });
        }

        if (materyal.dersId) {
            const ders = await Ders.findOne({
                _id: materyal.dersId,
                kullaniciId: req.user._id,
            });

            if (!ders || ders.materyallerKilitli) {
                return res.status(403).json({
                    hata: "Ders materyalleri kilitlidir.",
                });
            }
        }

        if (materyal.taslakId) {
            const taslak = await DersTaslagi.findOne({
                _id: materyal.taslakId,
                kullaniciId: req.user._id,
                durum: { $in: TASLAK_DURUMLARI },
            });

            if (!taslak) {
                return res.status(409).json({
                    hata: "Taslak düzenlenemiyor.",
                });
            }

            await taslakAnaliziniGecersizKil(
                taslak._id,
                req.user._id
            );
        }

        // Hazır materyaller yeniden işlenmez.
        if (materyal.durum === "hazir") {
            return res.json({
                mesaj: "Materyal zaten hazır.",
                materyal,
            });
        }

        if (materyal.durum === "isleniyor") {
            return res.status(409).json({
                hata: "Materyal zaten işleniyor.",
            });
        }

        const sonuc = await materyalIsle(
            materyal._id,
            req.user._id
        );

        if (!sonuc) {
            return res.status(400).json({
                hata:
                    "Metin çıkarılamadı. Materyal durumunu kontrol edin.",
            });
        }

        if (sonuc.dersId) {
            void materyalEklendigindeIncrementalGuncelle(
                sonuc._id,
                sonuc.dersId,
                req.user._id
            ).catch((hata) => {
                console.error(
                    "Konu haritası güncelleme hatası:",
                    hata.message
                );
            });
        }

        return res.json({
            mesaj: "Metin başarıyla çıkarıldı.",
            materyal: sonuc,
        });
    } catch (hata) {
        return res.status(500).json({
            hata: hata.message,
        });
    }
};

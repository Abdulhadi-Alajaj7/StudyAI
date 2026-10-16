
import mongoose from "mongoose";
import { randomUUID } from "node:crypto";

import DersTaslagi from "../models/DersTaslagi.js";
import Materyal from "../models/Materyal.js";

import {
    dersTaslaginiAnalizEt,
} from "../services/dersTaslagiAnalizService.js";

import {
    dersTaslaginiOnayla,
} from "../services/dersTaslagiOnayService.js";

const DUZENLENEBILIR_DURUMLAR = [
    "hazirlaniyor",
    "analiz_hatasi",
    "onaya_hazir",
];

const taslakBul = async (req) => {
    if (!mongoose.isValidObjectId(req.params.id)) {
        return null;
    }

    return DersTaslagi.findOne({
        _id: req.params.id,
        kullaniciId: req.user._id,
    });
};

const dersBilgileriniAl = (body = {}) => {
    const alanlar = [
        "dersAdi",
        "aciklama",
        "donem",
        "dersKodu",
        "renk",
        "simge",
    ];

    const sonuc = {};

    for (const alan of alanlar) {
        if (Object.prototype.hasOwnProperty.call(body, alan)) {
            if (typeof body[alan] !== "string") {
                const hata = new Error(
                    `${alan} metin olmalıdır.`
                );
                hata.status = 400;
                throw hata;
            }

            sonuc[alan] = body[alan].trim();
        }
    }

    return sonuc;
};

const hataYanitla = (res, hata) => {
    if (hata.name === "ValidationError") {
        return res.status(400).json({
            basarili: false,
            hata: hata.message,
        });
    }

    if (hata.code === 11000) {
        return res.status(409).json({
            basarili: false,
            hata: "Bu oluşturma isteği zaten kayıtlı.",
        });
    }

    if (hata.status) {
        return res.status(hata.status).json({
            basarili: false,
            hata: hata.message,
        });
    }

    console.error("Ders taslağı hatası:", hata);

    return res.status(500).json({
        basarili: false,
        hata: "İşlem sırasında bir hata oluştu.",
    });
};

// POST /ders-taslaklari
export const taslakOlustur = async (req, res) => {
    try {
        const bilgiler = dersBilgileriniAl(req.body);

        if (!bilgiler.dersAdi) {
            return res.status(400).json({
                basarili: false,
                hata: "Ders adı zorunludur.",
            });
        }

        const anahtar = req.body.olusturmaAnahtari;

        if (
            anahtar !== undefined &&
            (
                typeof anahtar !== "string" ||
                anahtar.length < 8 ||
                anahtar.length > 128
            )
        ) {
            return res.status(400).json({
                basarili: false,
                hata: "Geçersiz oluşturma anahtarı.",
            });
        }

        const olusturmaAnahtari =
            anahtar || randomUUID();

        const mevcut = await DersTaslagi.findOne({
            kullaniciId: req.user._id,
            olusturmaAnahtari,
        });

        if (mevcut) {
            return res.status(200).json({
                basarili: true,
                taslak: mevcut,
            });
        }

        const taslak = await DersTaslagi.create({
            ...bilgiler,
            kullaniciId: req.user._id,
            olusturmaAnahtari,
        });

        return res.status(201).json({
            basarili: true,
            mesaj: "Ders taslağı oluşturuldu.",
            taslak,
        });
    } catch (hata) {
        return hataYanitla(res, hata);
    }
};

// GET /ders-taslaklari/:id
export const taslakGetir = async (req, res) => {
    try {
        const taslak = await taslakBul(req);

        if (!taslak) {
            return res.status(404).json({
                basarili: false,
                hata: "Ders taslağı bulunamadı.",
            });
        }

        const materyaller = await Materyal.find({
            taslakId: taslak._id,
            kullaniciId: req.user._id,
        })
            .select("-cikarilanMetin -dosyaYolu")
            .sort({ createdAt: 1 });

        return res.status(200).json({
            basarili: true,
            taslak,
            materyaller,
            analizGuncel: taslak.analizGuncelMi(),
        });
    } catch (hata) {
        return hataYanitla(res, hata);
    }
};

// PUT /ders-taslaklari/:id
export const taslakGuncelle = async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                basarili: false,
                hata: "Geçersiz taslak ID.",
            });
        }

        const bilgiler = dersBilgileriniAl(req.body);

        if (
            Object.prototype.hasOwnProperty.call(
                bilgiler,
                "dersAdi"
            ) &&
            !bilgiler.dersAdi
        ) {
            return res.status(400).json({
                basarili: false,
                hata: "Ders adı boş olamaz.",
            });
        }

        const taslak = await DersTaslagi.findOneAndUpdate(
            {
                _id: req.params.id,
                kullaniciId: req.user._id,
                durum: {
                    $in: DUZENLENEBILIR_DURUMLAR,
                },
            },
            {
                $set: {
                    ...bilgiler,
                    sonEtkinlikTarihi: new Date(),
                },
            },
            {
                new: true,
                runValidators: true,
            }
        );

        if (!taslak) {
            return res.status(409).json({
                basarili: false,
                hata:
                    "Taslak bulunamadı veya şu anda düzenlenemiyor.",
            });
        }

        return res.status(200).json({
            basarili: true,
            mesaj: "Ders bilgileri güncellendi.",
            taslak,
        });
    } catch (hata) {
        return hataYanitla(res, hata);
    }
};

// GET /ders-taslaklari/:id/durum
export const taslakDurumGetir = async (req, res) => {
    try {
        const taslak = await taslakBul(req);

        if (!taslak) {
            return res.status(404).json({
                basarili: false,
                hata: "Ders taslağı bulunamadı.",
            });
        }

        const materyaller = await Materyal.find({
            taslakId: taslak._id,
            kullaniciId: req.user._id,
        }).select("durum");

        const materyalSayisi = materyaller.length;

        const tumMateryallerHazir =
            materyalSayisi > 0 &&
            materyaller.every(
                (materyal) =>
                    materyal.durum === "hazir"
            );

        const analizGuncel =
            taslak.analizGuncelMi();

        return res.status(200).json({
            basarili: true,
            durum: taslak.durum,
            materyalSayisi,
            tumMateryallerHazir,
            materyalSurumu: taslak.materyalSurumu,
            analizSurumu: taslak.analizSurumu,
            analizHatasi: taslak.analizHatasi,
            analizGuncel,
            onaylanabilir:
                tumMateryallerHazir &&
                analizGuncel,
            olusturulanDersId:
                taslak.olusturulanDersId,
        });
    } catch (hata) {
        return hataYanitla(res, hata);
    }
};

// POST /ders-taslaklari/:id/analiz
// Tüm materyaller hazır olduğunda Gemini analizi başlatır.
export const taslakAnalizEt = async (req, res) => {
    try {
        const taslak = await taslakBul(req);

        if (!taslak) {
            return res.status(404).json({
                basarili: false,
                hata: "Ders taslağı bulunamadı.",
            });
        }

        if (
            !DUZENLENEBILIR_DURUMLAR.includes(
                taslak.durum
            )
        ) {
            return res.status(409).json({
                basarili: false,
                hata:
                    "Taslak şu anda analiz için uygun değil.",
            });
        }

        const materyaller = await Materyal.find({
            taslakId: taslak._id,
            kullaniciId: req.user._id,
        }).select(
            "durum aktifIslemeId cikarilanMetin"
        );

        if (materyaller.length === 0) {
            return res.status(400).json({
                basarili: false,
                hata:
                    "Analiz için en az bir materyal ekleyin.",
            });
        }

        const tumMateryallerHazir =
            materyaller.every(
                (materyal) =>
                    materyal.durum === "hazir" &&
                    Boolean(materyal.aktifIslemeId) &&
                    Boolean(
                        materyal.cikarilanMetin?.trim()
                    )
            );

        if (!tumMateryallerHazir) {
            return res.status(409).json({
                basarili: false,
                hata:
                    "Analiz başlamadan önce tüm materyaller hazır olmalıdır.",
            });
        }

        // İşlem uzun sürebilir. Bu sürüm sonucu bekler.
        const sonuc = await dersTaslaginiAnalizEt(
            taslak._id,
            req.user._id
        );

        return res.status(200).json({
            basarili: true,
            mesaj:
                "Konu haritası başarıyla oluşturuldu.",
            ...sonuc,
        });
    } catch (hata) {
        console.error(
            "Taslak Gemini analiz hatası:",
            hata
        );

        return res.status(500).json({
            basarili: false,
            hata:
                hata.message ||
                "Konu haritası oluşturulamadı.",
        });
    }
};


/**
 * POST /ders-taslaklari/:id/onayla
 *
 * Gemini analizi tamamlanan taslağı resmi derse dönüştürür.
 * Materyaller ve konu haritası tek transaction ile aktarılır.
 */
export const taslakOnayla = async (req, res) => {
    try {
        const { id } = req.params;

        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({
                basarili: false,
                hata: "Geçersiz taslak ID.",
            });
        }

        const sonuc = await dersTaslaginiOnayla(
            id,
            req.user._id
        );

        return res.status(
            sonuc.zatenOlusturulmus ? 200 : 201
        ).json({
            basarili: true,
            mesaj: sonuc.zatenOlusturulmus
                ? "Bu ders daha önce oluşturulmuş."
                : "Ders ve konu haritası başarıyla oluşturuldu.",
            dersId: sonuc.dersId,
            ders: sonuc.ders,
            konuHaritasiId:
                sonuc.konuHaritasiId || null,
            materyalSayisi:
                sonuc.materyalSayisi ?? null,
            zatenOlusturulmus:
                sonuc.zatenOlusturulmus,
        });
    } catch (hata) {
        console.error(
            "Ders taslağı onaylama hatası:",
            hata
        );

        if (hata.status) {
            return res.status(hata.status).json({
                basarili: false,
                hata: hata.message,
            });
        }

        if (
            hata.code === 11000 ||
            hata.code === 112 ||
            hata.codeName === "WriteConflict"
        ) {
            return res.status(409).json({
                basarili: false,
                hata:
                    "Ders oluşturma işlemi başka bir istekle çakıştı. " +
                    "Lütfen ders durumunu kontrol edin.",
            });
        }

        return res.status(500).json({
            basarili: false,
            hata:
                "Ders oluşturulurken bir hata oluştu.",
        });
    }
};

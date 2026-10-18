import mongoose from "mongoose";
import Materyal from "../models/Materyal.js";
import { semanticAramaYap } from "../services/semanticAramaService.js";
import {
    embeddingAyarlariGetir,
    embeddingKullaniciHatasi,
    materyalEmbeddingleriniOlustur,
} from "../services/embeddingService.js";

const sorguSinirlari = { enAz: 2, enFazla: 500 };

export const semanticAramaGirdisiniDogrula = (dersId, govde = {}) => {
    if (!mongoose.Types.ObjectId.isValid(dersId)) {
        return { hata: "Geçersiz ders kimliği.", kod: "GECERSIZ_DERS_ID" };
    }

    const sorgu = typeof govde.sorgu === "string" ? govde.sorgu.trim() : "";
    if (sorgu.length < sorguSinirlari.enAz || sorgu.length > sorguSinirlari.enFazla) {
        return {
            hata: `Arama sorgusu ${sorguSinirlari.enAz}-${sorguSinirlari.enFazla} karakter arasında olmalıdır.`,
            kod: "GECERSIZ_SORGU"
        };
    }

    return { sorgu };
};

export const semantikArama = async (req, res) => {
    const dersId = req.params.id;
    const kullaniciId = req.user._id;
    const dogrulama = semanticAramaGirdisiniDogrula(dersId, req.body);
    if (dogrulama.hata) {
        return res.status(400).json(dogrulama);
    }
    const { sorgu } = dogrulama;

    try {
        const sonuc = await semanticAramaYap({
            kullaniciId,
            dersId,
            sorgu,
            limit: req.body?.limit,
        });
        return res.status(200).json({ sorgu, ...sonuc });
    } catch (hata) {
        const status = Number.isInteger(hata.status) ? hata.status : 503;
        return res.status(status).json({
            hata: status === 404 ? hata.message : embeddingKullaniciHatasi(hata),
            kod: hata.kod || "SEMANTIK_ARAMA_HATASI"
        });
    }
};

export const materyalEmbeddingleriniYenile = async (req, res) => {
    const materyalId = req.params.id;
    const kullaniciId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(materyalId)) {
        return res.status(400).json({ hata: "Geçersiz materyal kimliği.", kod: "GECERSIZ_MATERYAL_ID" });
    }

    let materyal;
    try {
        materyal = await Materyal.findOneAndUpdate(
            {
                _id: materyalId,
                kullaniciId,
                durum: "hazir",
                aktifIslemeId: { $ne: null },
                embeddingDurumu: { $ne: "isleniyor" },
            },
            { $set: { embeddingDurumu: "isleniyor", embeddingHatasi: "" } },
            { new: true }
        );

        if (!materyal) {
            return res.status(409).json({
                hata: "Materyal bulunamadı, hazır değil veya semantik dizini zaten oluşturuluyor.",
                kod: "EMBEDDING_YENILEME_UYGUN_DEGIL"
            });
        }

        const sonuc = await materyalEmbeddingleriniOlustur(materyal, materyal.aktifIslemeId);
        const guncelleme = await Materyal.updateOne(
            { _id: materyal._id, kullaniciId, aktifIslemeId: materyal.aktifIslemeId },
            {
                $set: {
                    embeddingDurumu: "hazir",
                    embeddingHatasi: "",
                    embeddingModel: sonuc.model,
                    embeddingBoyutu: sonuc.boyut,
                }
            }
        );

        if (guncelleme.matchedCount !== 1) {
            const surumHatasi = new Error(
                "Materyal semantik indeks oluşturulurken değişti. Güncel sürüm için işlemi yeniden deneyin."
            );
            surumHatasi.kod = "EMBEDDING_SURUM_DEGISTI";
            surumHatasi.status = 409;
            throw surumHatasi;
        }

        return res.status(200).json({ mesaj: "Semantik arama dizini güncellendi.", sonuc });
    } catch (hata) {
        if (materyal) {
            await Materyal.updateOne(
                { _id: materyal._id, kullaniciId, aktifIslemeId: materyal.aktifIslemeId },
                {
                    $set: {
                        embeddingDurumu: "hata",
                        embeddingHatasi: embeddingKullaniciHatasi(hata),
                        embeddingModel: embeddingAyarlariGetir().model,
                        embeddingBoyutu: embeddingAyarlariGetir().boyut,
                    }
                }
            ).catch(() => {});
        }
        const status = hata.status === 409 ? 409 : (hata.status === 429 ? 429 : 503);
        return res.status(status).json({
            hata: status === 409 ? hata.message : embeddingKullaniciHatasi(hata),
            kod: hata.kod || "EMBEDDING_YENILEME_HATASI"
        });
    }
};

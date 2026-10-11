import mongoose from "mongoose";

const metinParcasiSchema = new mongoose.Schema(
    {
        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            required: true,
        },
        dersId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ders",
            required: true,
        },
        materyalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Materyal",
            required: true,
        },
        islemeId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        parcaIndex: {
            type: Number,
            required: true,
        },
        icerik: {
            type: String,
            required: true,
        },
        karakterSayisi: {
            type: Number,
            required: true,
        }
    },
    {
        timestamps: true,
    }
);

// Yeni çoklu-versiyonlama ve staging uyumlu bileşik tekillik indeksi.
// Aynı işlem içinde (islemeId) parcaIndex tekrarı olamaz, farklı işlemler (staging) birbirini engellemez.
metinParcasiSchema.index({ materyalId: 1, islemeId: 1, parcaIndex: 1 }, { unique: true });

const MetinParcasi = mongoose.model("MetinParcasi", metinParcasiSchema);

export default MetinParcasi;

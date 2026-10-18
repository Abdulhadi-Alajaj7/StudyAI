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
        },
        icerikHash: {
            type: String,
            required: true,
        },
        embedding: {
            type: [Number],
            default: undefined,
            select: false,
        },
        embeddingModel: {
            type: String,
            default: "",
        },
        embeddingBoyutu: {
            type: Number,
            default: 0,
        },
        embeddingGirdiHash: {
            type: String,
            default: "",
        },
        embeddingDurumu: {
            type: String,
            enum: ["bekliyor", "hazir", "hata"],
            default: "bekliyor",
        },
        embeddingHatasi: {
            type: String,
            default: "",
        },
        embeddingOlusturulmaTarihi: {
            type: Date,
            default: null,
        }
    },
    {
        timestamps: true,
    }
);

// Yeni çoklu-versiyonlama ve staging uyumlu bileşik tekillik indeksi.
// Aynı işlem içinde (islemeId) parcaIndex tekrarı olamaz, farklı işlemler (staging) birbirini engellemez.
metinParcasiSchema.index({ materyalId: 1, islemeId: 1, parcaIndex: 1 }, { unique: true });
metinParcasiSchema.index({ kullaniciId: 1, embeddingGirdiHash: 1, embeddingModel: 1, embeddingBoyutu: 1 });
metinParcasiSchema.index({ kullaniciId: 1, dersId: 1, islemeId: 1, embeddingDurumu: 1 });

const MetinParcasi = mongoose.model("MetinParcasi", metinParcasiSchema);

export default MetinParcasi;

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

// Aynı materyal içinde parcaIndex tekrarını engellemek için
metinParcasiSchema.index({ materyalId: 1, parcaIndex: 1 }, { unique: true });

const MetinParcasi = mongoose.model("MetinParcasi", metinParcasiSchema);

export default MetinParcasi;

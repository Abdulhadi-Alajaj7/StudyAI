import mongoose from "mongoose";

const materyalSchema = new mongoose.Schema(
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
        dosyaAdi: {
            type: String,
            required: true,
        },
        orijinalDosyaAdi: {
            type: String,
            required: true,
        },
        dosyaYolu: {
            type: String,
            required: true,
        },
        dosyaTuru: {
            type: String,
            required: true,
        },
        mimeTuru: {
            type: String,
            required: true,
        },
        dosyaBoyutu: {
            type: Number,
            required: true,
        },
        dosyaHash: {
            type: String,
            default: undefined,
        },
        durum: {
            type: String,
            default: "yuklendi",
        },
        islemeId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        aktifIslemeId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        cikarilanMetin: {
            type: String,
            default: "",
        },
        islemeHatasi: {
            type: String,
            default: "",
        },
        embeddingDurumu: {
            type: String,
            enum: ["bekliyor", "isleniyor", "hazir", "hata"],
            default: "bekliyor",
        },
        embeddingHatasi: {
            type: String,
            default: "",
        },
        embeddingModel: {
            type: String,
            default: "",
        },
        embeddingBoyutu: {
            type: Number,
            default: 0,
        }
    },
    {
        timestamps: true,
    }
);
materyalSchema.index(
    { dersId: 1, dosyaHash: 1 },
    {
        unique: true,
        partialFilterExpression: {
            dosyaHash: { $type: "string" }
        }
    }
);

const Materyal = mongoose.model("Materyal", materyalSchema);

export default Materyal;

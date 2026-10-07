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
        durum: {
            type: String,
            default: "yuklendi",
        },
        cikarilanMetin: {
            type: String,
            default: "",
        },
        islemeHatasi: {
            type: String,
            default: "",
        }
    },
    {
        timestamps: true,
    }
);

const Materyal = mongoose.model("Materyal", materyalSchema);

export default Materyal;

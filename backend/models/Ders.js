
import mongoose from "mongoose";

const dersSchema = new mongoose.Schema(
    {
        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            required: true,
        },

        dersAdi: {
            type: String,
            required: [true, "Ders adı zorunludur"],
            trim: true,
        },

        aciklama: {
            type: String,
            trim: true,
            default: "",
        },

        donem: {
            type: String,
            trim: true,
            default: "",
        },

        dersKodu: {
            type: String,
            trim: true,
            default: "",
        },

        renk: {
            type: String,
            default: "indigo",
        },

        simge: {
            type: String,
            default: "desktop",
        },

        materyallerOnaylandi: {
            type: Boolean,
            default: false,
        },

        aktifMateryalIslemSayisi: {
            type: Number,
            default: 0,
            min: 0,
        },
        temizleniyor: {
            type: Boolean,
            default: false,
        },
        temizlikIslemToken: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        temizlikKilitSonYenilemeTarihi: {
            type: Date,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

dersSchema.index({
    materyallerOnaylandi: 1,
    updatedAt: 1
});

const Ders = mongoose.model("Ders", dersSchema);

export default Ders;


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
        hazirlamaDurumu: { type: String, enum: ["bekliyor", "isleniyor", "hata", "tamamlandi"], default: "bekliyor" },
        hazirlamaAsamasi: { type: String, default: "metinler" },
        hazirlamaHatasi: { type: String, default: "" },
        hazirlamaHataKodu: { type: String, default: "" },
        hazirlamaTanilama: {
            type: new mongoose.Schema({
                orijinalHttpDurumu: Number, saglayiciHataKodu: String, kotaTuru: String,
                retryAfterMs: Number, agHataKodu: String, asama: String, model: String,
                deneme: Number, sureMs: Number,
            }, { _id: false }),
            default: null,
        },
        hazirlamaToken: { type: mongoose.Schema.Types.ObjectId, default: null, select: false },
        hazirlamaSonYenileme: { type: Date, default: null },
        sohbetSurumu: {
            type: Number,
            default: 0,
            min: 0,
        },
        kartSurumu: { type: Number, default: 0, min: 0 },
        temizleniyor: {
            type: Boolean,
            default: false,
        },
        silmeNiyeti: {
            type: String,
            enum: ["kullanici"],
            default: null,
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

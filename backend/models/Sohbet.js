import mongoose from "mongoose";

const sohbetSchema = new mongoose.Schema(
    {
        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            required: true,
            immutable: true,
        },
        dersId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ders",
            required: true,
            immutable: true,
        },
        baslik: {
            type: String,
            required: true,
            trim: true,
            minlength: 1,
            maxlength: 100,
        },
        baslikManuel: {
            type: Boolean,
            default: false,
        },
        baslikKaynagi: {
            type: String,
            enum: ["varsayilan", "gemini", "manuel"],
            default: "varsayilan",
        },
        baslikUretimDurumu: {
            type: String,
            enum: ["bekliyor", "tamamlandi", "hata"],
            default: "bekliyor",
        },
        sonMesajTarihi: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
        optimisticConcurrency: true,
    }
);

sohbetSchema.index({
    kullaniciId: 1,
    dersId: 1,
    sonMesajTarihi: -1,
    _id: -1,
});

const Sohbet = mongoose.model("Sohbet", sohbetSchema);

export default Sohbet;

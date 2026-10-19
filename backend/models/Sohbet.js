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
            enum: ["bekliyor", "isleniyor", "tamamlandi", "hata"],
            default: "bekliyor",
        },
        baslikUretimBaslamaTarihi: {
            type: Date,
            default: undefined,
        },
        baslikUretimDenemeSayisi: {
            type: Number,
            min: 0,
            max: 1,
            default: 0,
        },
        aktifIstekId: {
            type: String,
            trim: true,
            maxlength: 128,
            default: undefined,
        },
        aktifIstekBaslamaTarihi: {
            type: Date,
            default: undefined,
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

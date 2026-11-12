import mongoose from "mongoose";

const schema = new mongoose.Schema({
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", required: true, immutable: true },
    dersId: { type: mongoose.Schema.Types.ObjectId, ref: "Ders", required: true, immutable: true },
    desteId: { type: mongoose.Schema.Types.ObjectId, ref: "CalismaKartiDestesi", required: true, immutable: true },
    kartId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    istemciIstekId: { type: String, required: true, maxlength: 128, immutable: true },
    degerlendirme: { type: String, enum: ["tekrar", "zor", "orta", "kolay"], required: true, immutable: true },
    zaman: { type: Date, default: Date.now, required: true, immutable: true },
}, { timestamps: false });
schema.index({ kullaniciId: 1, istemciIstekId: 1 }, { unique: true });
schema.index({ kullaniciId: 1, dersId: 1, kartId: 1, zaman: -1 });
export default mongoose.model("KartDegerlendirmesi", schema);

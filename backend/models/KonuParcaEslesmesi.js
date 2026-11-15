import mongoose from "mongoose";

const kaynakBaglantisi = new mongoose.Schema({
    parcaId: { type: String, required: true },
    skor: { type: Number, required: true },
    yontem: { type: String, enum: ["karma", "kelime", "komsu"], required: true },
}, { _id: false });

const konuBaglantisi = new mongoose.Schema({
    konuId: { type: String, required: true },
    baslik: { type: String, required: true },
    aciklama: { type: String, default: "" },
    kaynaklar: { type: [kaynakBaglantisi], default: [] },
}, { _id: false });

const schema = new mongoose.Schema({
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Kullanici" },
    dersId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Ders", unique: true },
    surumImzasi: { type: String, required: true },
    embeddingModel: { type: String, required: true },
    embeddingBoyutu: { type: Number, required: true },
    algoritmaSurumu: { type: Number, required: true },
    durum: { type: String, enum: ["hazir"], default: "hazir" },
    konular: { type: [konuBaglantisi], default: [] },
    eslesmeyenParcaIds: { type: [String], default: [] },
    embeddingiEksikParcaIds: { type: [String], default: [] },
    toplamParcaSayisi: { type: Number, default: 0 },
    eslesenParcaSayisi: { type: Number, default: 0 },
    bosKonuIds: { type: [String], default: [] },
}, { timestamps: true });
schema.index({ kullaniciId: 1, dersId: 1 });

export default mongoose.model("KonuParcaEslesmesi", schema);

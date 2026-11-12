import mongoose from "mongoose";

const schema = new mongoose.Schema({
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", required: true, immutable: true },
    dersId: { type: mongoose.Schema.Types.ObjectId, ref: "Ders", required: true, immutable: true },
    desteId: { type: mongoose.Schema.Types.ObjectId, ref: "CalismaKartiDestesi", required: true, immutable: true },
    kartId: { type: mongoose.Schema.Types.ObjectId, required: true, immutable: true },
    gorulduTarihi: { type: Date, default: null },
    yildizli: { type: Boolean, default: false },
    // İleride zamanlama eklendiğinde kullanılabilir; bu aşamada hesaplanmaz.
    sonrakiTekrarTarihi: { type: Date, default: null },
    tekrarAlgoritmasiSurumu: { type: String, default: null },
}, { timestamps: true });
schema.index({ kullaniciId: 1, desteId: 1, kartId: 1 }, { unique: true });
schema.index({ dersId: 1, kullaniciId: 1 });
export default mongoose.model("KartCalismaDurumu", schema);

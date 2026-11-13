import mongoose from "mongoose";

const schema = new mongoose.Schema({
    _id: String,
    sayac: { type: Number, default: 0 },
    sonTarih: { type: Date, required: true },
}, { versionKey: false });
// TTL yalnız istek sayacı koleksiyonundadır; kullanıcı belgesine TTL eklenmez.
schema.index({ sonTarih: 1 }, { expireAfterSeconds: 0 });
export default mongoose.model("AuthIstekSiniri", schema);

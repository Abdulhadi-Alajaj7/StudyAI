import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import { sifreGecerliMi } from "../utils/authGuvenligi.js";

const kullaniciSchema = new mongoose.Schema(
    {
        kullaniciAdi: {
            type: String,
            required: [true, "Kullanıcı adı zorunludur"],
            minlength: 3,
            trim: true,
        },

        email: {
            type: String,
            required: [true, "E-posta zorunludur"],
            unique: true,
            lowercase: true,
            match: [/^\S+@\S+\.\S+$/, "Geçerli bir e-posta adresi giriniz"],
        },

        sifre: {
            type: String,
            required: [true, "Şifre zorunludur"],
            minlength: [6, "Şifre en az 6 karakter olmalıdır"],
            select: false,
        },

        profilResmi: {
            type: String,
            default: null,
        },
        // Varsayılan yok: sp3 ve öncesindeki hesaplar geriye uyumlu kalır.
        emailDogrulandi: { type: Boolean, default: undefined },
        emailDogrulamaZorunluKayit: { type: Boolean, default: undefined, select: false },
        kayitDogrulamaTokenHash: { type: String, select: false },
        kayitDogrulamaSonTarih: { type: Date, select: false },
        kayitDogrulamaSonIstek: { type: Date, select: false },
        hesapTemizlemeToken: { type: mongoose.Schema.Types.ObjectId, select: false },
        hesapTemizlemeSonTarih: { type: Date, select: false },
        oturumSurumu: { type: Number, default: 0, select: false, min: 0 },
        sifirlamaTokenHash: { type: String, select: false },
        sifirlamaSonTarih: { type: Date, select: false },
        sifirlamaSonIstek: { type: Date, select: false },
        bekleyenEmail: { type: String, select: false },
        emailDegisimTokenHash: { type: String, select: false },
        emailDegisimSonTarih: { type: Date, select: false },
        emailDegisimSonIstek: { type: Date, select: false },
    },
    {
        timestamps: true,
    }
);

kullaniciSchema.pre("save", async function (next) {
    if (!this.isModified("sifre")) {
        return next();
    }

    this.sifre = await this.constructor.sifreyiHashle(this.sifre);
    next();
});

// Atomik query güncellemeleri save hook'unu çalıştırmaz; iki akış aynı hash yöntemini kullanır.
kullaniciSchema.statics.sifreyiHashle = async function (sifre) {
    if (!sifreGecerliMi(sifre)) throw Object.assign(new Error("Şifre en az 6 karakter ve en fazla 72 UTF-8 bayt olmalıdır."), { status: 400, kod: "GECERSIZ_SIFRE" });
    return bcrypt.hash(sifre, 10);
};

kullaniciSchema.methods.sifreEslesiyorMu = async function (girilenSifre) {
    return await bcrypt.compare(girilenSifre, this.sifre);
};

kullaniciSchema.index({ sifirlamaTokenHash: 1 }, { sparse: true });
kullaniciSchema.index({ kayitDogrulamaTokenHash: 1 }, { sparse: true });
kullaniciSchema.index({ emailDogrulamaZorunluKayit: 1, emailDogrulandi: 1, kayitDogrulamaSonTarih: 1 });
const Kullanici = mongoose.model("Kullanici", kullaniciSchema);

export default Kullanici;

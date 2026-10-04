import mongoose from "mongoose";
import bcrypt from "bcryptjs";

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
    },
    {
        timestamps: true,
    }
);

kullaniciSchema.pre("save", async function (next) {
    if (!this.isModified("sifre")) {
        return next();
    }

    const salt = await bcrypt.genSalt(10);
    this.sifre = await bcrypt.hash(this.sifre, salt);
    next();
});

kullaniciSchema.methods.sifreEslesiyorMu = async function (girilenSifre) {
    return await bcrypt.compare(girilenSifre, this.sifre);
};

const Kullanici = mongoose.model("Kullanici", kullaniciSchema);

export default Kullanici;
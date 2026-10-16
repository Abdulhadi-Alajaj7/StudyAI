
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

        // Dersin oluşturulma sürecindeki durumunu gösterir.
        // Eski dersler varsayılan olarak hazır kabul edilir.
        durum: {
            type: String,
            enum: ["hazirlaniyor", "hazir"],
            default: "hazir",
            index: true,
        },

        // Ders onaylandıktan sonra materyaller değiştirilemez.
        materyallerKilitli: {
            type: Boolean,
            default: false,
        },

        // Aynı onay isteğinin ikinci kez ders oluşturmasını önler.
        olusturmaAnahtari: {
            type: String,
            trim: true,
            default: undefined,
        },
    },
    {
        timestamps: true,
    }
);

// Aynı kullanıcı için oluşturma anahtarı benzersiz olmalıdır.
dersSchema.index(
    { kullaniciId: 1, olusturmaAnahtari: 1 },
    {
        unique: true,
        partialFilterExpression: {
            olusturmaAnahtari: { $type: "string" },
        },
    }
);

const Ders = mongoose.model("Ders", dersSchema);

export default Ders;

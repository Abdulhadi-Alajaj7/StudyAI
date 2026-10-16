
import mongoose from "mongoose";

const materyalSchema = new mongoose.Schema(
    {
        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            required: true,
        },

        // Hazırlık aşamasında dersId henüz bulunmayabilir.
        dersId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ders",
            default: null,
        },

        // Materyalin ait olduğu geçici oluşturma oturumu.
        taslakId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DersTaslagi",
            default: null,
        },

        dosyaAdi: {
            type: String,
            required: true,
        },

        orijinalDosyaAdi: {
            type: String,
            required: true,
        },

        dosyaYolu: {
            type: String,
            required: true,
        },

        dosyaTuru: {
            type: String,
            required: true,
        },

        mimeTuru: {
            type: String,
            required: true,
        },

        dosyaBoyutu: {
            type: Number,
            required: true,
        },

        // Aynı içeriğin tekrar yüklenmesini tespit eder.
        dosyaHash: {
            type: String,
            lowercase: true,
            trim: true,
            default: undefined,
            match: /^[a-f0-9]{64}$/,
        },

        durum: {
            type: String,
            default: "yuklendi",
        },

        islemeId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },

        aktifIslemeId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },

        cikarilanMetin: {
            type: String,
            default: "",
        },

        islemeHatasi: {
            type: String,
            default: "",
        },
    },
    {
        timestamps: true,
    }
);

// Ders içindeki aynı dosya içeriğini engeller.
materyalSchema.index(
    { dersId: 1, dosyaHash: 1 },
    {
        unique: true,
        partialFilterExpression: {
            dersId: { $type: "objectId" },
            dosyaHash: { $type: "string" },
        },
    }
);

// Taslak içindeki aynı dosya içeriğini engeller.
materyalSchema.index(
    { taslakId: 1, dosyaHash: 1 },
    {
        unique: true,
        partialFilterExpression: {
            taslakId: { $type: "objectId" },
            dosyaHash: { $type: "string" },
        },
    }
);

// Materyal ya bir derse ya da bir taslağa bağlı olmalıdır.
materyalSchema.pre("validate", function () {
    const dersVar = Boolean(this.dersId);
    const taslakVar = Boolean(this.taslakId);

    if (dersVar === taslakVar) {
        this.invalidate(
            "dersId",
            "Materyal yalnızca bir derse veya bir taslağa bağlı olmalıdır."
        );
    }
});

const Materyal = mongoose.model("Materyal", materyalSchema);

export default Materyal;

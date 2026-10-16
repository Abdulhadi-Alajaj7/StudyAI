
import mongoose from "mongoose";

const metinParcasiSchema = new mongoose.Schema(
    {
        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            required: true,
        },

        // Resmi derse ait metin parçaları için.
        dersId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ders",
            default: null,
        },

        // Ders oluşturulmadan önceki hazırlık aşaması için.
        taslakId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DersTaslagi",
            default: null,
        },

        materyalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Materyal",
            required: true,
        },

        islemeId: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },

        parcaIndex: {
            type: Number,
            required: true,
        },

        icerik: {
            type: String,
            required: true,
        },

        karakterSayisi: {
            type: Number,
            required: true,
        },
    },
    {
        timestamps: true,
    }
);

// Aynı materyalin aynı işleme sürümünde
// parça numaraları tekrarlanamaz.
metinParcasiSchema.index(
    {
        materyalId: 1,
        islemeId: 1,
        parcaIndex: 1,
    },
    {
        unique: true,
    }
);

// Taslağa bağlı parçaları hızlıca bulmak için.
metinParcasiSchema.index({
    taslakId: 1,
    materyalId: 1,
});

// Resmi derse bağlı parçaları hızlıca bulmak için.
metinParcasiSchema.index({
    dersId: 1,
    materyalId: 1,
});

// Parça yalnızca bir derse veya bir taslağa ait olmalıdır.
metinParcasiSchema.pre("validate", function () {
    const dersVar = Boolean(this.dersId);
    const taslakVar = Boolean(this.taslakId);

    if (dersVar === taslakVar) {
        this.invalidate(
            "dersId",
            "Metin parçası yalnızca bir derse veya taslağa ait olmalıdır."
        );
    }
});

const MetinParcasi = mongoose.model(
    "MetinParcasi",
    metinParcasiSchema
);

export default MetinParcasi;

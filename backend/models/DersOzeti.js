import mongoose from "mongoose";

const temelKavramSchema = new mongoose.Schema(
    {
        baslik: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
        },
        aciklama: {
            type: String,
            required: true,
            trim: true,
            maxlength: 4_000,
        },
    },
    { _id: false }
);

const ozetIcerigiSchema = new mongoose.Schema(
    {
        genelBakis: {
            type: String,
            required: true,
            trim: true,
            maxlength: 20_000,
        },
        temelKavramlar: {
            type: [temelKavramSchema],
            default: [],
        },
        onemliNoktalar: {
            type: [String],
            default: [],
        },
        konularArasiIliskiler: {
            type: [String],
            default: [],
        },
        ornekler: {
            type: [String],
            default: [],
        },
        sinavIcinOnemli: {
            type: [String],
            default: [],
        },
    },
    { _id: false }
);

const kaynakSchema = new mongoose.Schema(
    {
        materyalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Materyal",
            required: true,
        },
        dosyaAdi: {
            type: String,
            required: true,
            trim: true,
            maxlength: 500,
        },
        aktifIslemeId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
        parcaIndeksleri: {
            type: [Number],
            default: [],
        },
    },
    { _id: false }
);

const dersOzetiSchema = new mongoose.Schema(
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
        tur: {
            type: String,
            enum: ["tum_ders", "materyal", "konu"],
            required: true,
            immutable: true,
        },
        hedefAnahtari: {
            type: String,
            required: true,
            trim: true,
            maxlength: 200,
            immutable: true,
        },
        materyalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Materyal",
            default: null,
        },
        konuId: {
            type: String,
            trim: true,
            maxlength: 200,
            default: "",
        },
        konuBasligi: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
        },
        uzunluk: {
            type: String,
            enum: ["kisa", "orta", "uzun"],
            required: true,
            immutable: true,
        },
        basarili: {
            type: Boolean,
            default: false,
        },
        icerik: {
            type: ozetIcerigiSchema,
            default: undefined,
        },
        kullanilanKaynaklar: {
            type: [kaynakSchema],
            default: [],
        },
        kullanilanModel: {
            type: String,
            trim: true,
            default: "",
        },
        olusturulmaTarihi: {
            type: Date,
            default: null,
        },
        aktifIslemToken: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
        kilitSonYenilemeTarihi: {
            type: Date,
            default: null,
        },
    },
    { timestamps: true }
);

dersOzetiSchema.index(
    {
        kullaniciId: 1,
        dersId: 1,
        tur: 1,
        hedefAnahtari: 1,
        uzunluk: 1,
    },
    { unique: true }
);

dersOzetiSchema.index({ dersId: 1, kullaniciId: 1 });

const DersOzeti = mongoose.model("DersOzeti", dersOzetiSchema);

export default DersOzeti;

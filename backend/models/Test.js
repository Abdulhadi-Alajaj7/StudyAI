import mongoose from "mongoose";

const secenekSchema = new mongoose.Schema(
    {
        anahtar: {
            type: String,
            enum: ["A", "B", "C", "D"],
            required: true,
        },
        metin: {
            type: String,
            required: true,
            trim: true,
            maxlength: 2_000,
        },
    },
    { _id: false }
);

const soruKaynagiSchema = new mongoose.Schema(
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
        parcaIndeksleri: {
            type: [Number],
            default: [],
        },
    },
    { _id: false }
);

const soruSchema = new mongoose.Schema({
    metin: {
        type: String,
        required: true,
        trim: true,
        maxlength: 4_000,
    },
    secenekler: {
        type: [secenekSchema],
        required: true,
        validate: {
            validator: (secenekler) => (
                Array.isArray(secenekler) &&
                secenekler.length === 4 &&
                new Set(secenekler.map((secenek) => secenek.anahtar)).size === 4
            ),
            message: "Her soru A, B, C ve D seçeneklerini içermelidir.",
        },
    },
    dogruCevap: {
        type: String,
        enum: ["A", "B", "C", "D"],
        required: true,
    },
    aciklama: {
        type: String,
        required: true,
        trim: true,
        maxlength: 6_000,
    },
    zorluk: {
        type: String,
        enum: ["kolay", "orta", "zor"],
        required: true,
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
    kaynaklar: {
        type: [soruKaynagiSchema],
        default: [],
        validate: {
            validator: (kaynaklar) => Array.isArray(kaynaklar) && kaynaklar.length > 0,
            message: "Her soru en az bir doğrulanmış kaynağa bağlı olmalıdır.",
        },
    },
    ogrenciCevabi: {
        type: String,
        enum: ["A", "B", "C", "D", null],
        default: null,
    },
    isaretli: {
        type: Boolean,
        default: false,
    },
});

const kaynakSurumuSchema = new mongoose.Schema(
    {
        materyalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Materyal",
            required: true,
        },
        aktifIslemeId: {
            type: mongoose.Schema.Types.ObjectId,
            required: true,
        },
    },
    { _id: false }
);

const sonucSchema = new mongoose.Schema(
    {
        dogruSayisi: { type: Number, min: 0, required: true },
        yanlisSayisi: { type: Number, min: 0, required: true },
        bosSayisi: { type: Number, min: 0, required: true },
        basariOrani: { type: Number, min: 0, max: 100, required: true },
    },
    { _id: false }
);

const testSchema = new mongoose.Schema(
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
        kapsamTuru: {
            type: String,
            enum: ["tum_ders", "materyal", "konu"],
            required: true,
            immutable: true,
        },
        materyalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Materyal",
            default: null,
            immutable: true,
        },
        konuId: {
            type: String,
            trim: true,
            maxlength: 200,
            default: "",
            immutable: true,
        },
        konuBasligi: {
            type: String,
            trim: true,
            maxlength: 500,
            default: "",
            immutable: true,
        },
        soruSayisi: {
            type: Number,
            enum: [5, 10, 15, 20],
            required: true,
            immutable: true,
        },
        zorluk: {
            type: String,
            enum: ["kolay", "orta", "zor", "karisik"],
            required: true,
            immutable: true,
        },
        sorular: {
            type: [soruSchema],
            required: true,
        },
        kaynakSurumleri: {
            type: [kaynakSurumuSchema],
            default: [],
            immutable: true,
            validate: {
                validator: (kaynaklar) => Array.isArray(kaynaklar) && kaynaklar.length > 0,
                message: "Test en az bir doğrulanmış kaynak sürümüne bağlı olmalıdır.",
            },
        },
        kullanilanModel: {
            type: String,
            trim: true,
            default: "",
            immutable: true,
        },
        durum: {
            type: String,
            enum: ["hazirlandi", "devam_ediyor", "tamamlandi"],
            default: "hazirlandi",
            index: true,
        },
        sonGoruntulenenSoru: {
            type: Number,
            min: 0,
            default: 0,
        },
        baslamaTarihi: {
            type: Date,
            default: null,
        },
        tamamlanmaTarihi: {
            type: Date,
            default: null,
        },
        sonuc: {
            type: sonucSchema,
            default: undefined,
        },
    },
    {
        timestamps: true,
        optimisticConcurrency: true,
    }
);

testSchema.path("sorular").validate(
    function soruSayisiEslesiyor(sorular) {
        return Array.isArray(sorular) && sorular.length === this.soruSayisi;
    },
    "Üretilen soru sayısı test ayarıyla eşleşmelidir."
);

testSchema.index({ kullaniciId: 1, dersId: 1, durum: 1, updatedAt: -1 });

const Test = mongoose.model("Test", testSchema);

export default Test;

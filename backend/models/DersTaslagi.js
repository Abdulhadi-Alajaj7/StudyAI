
import mongoose from "mongoose";

const dersTaslagiSchema = new mongoose.Schema(
    {
        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            required: true,
            index: true,
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

        // Taslağın işlem durumu.
        durum: {
            type: String,
            enum: [
                "hazirlaniyor",
                "analiz_ediliyor",
                "analiz_hatasi",
                "onaya_hazir",
                "tamamlaniyor",
                "tamamlandi",
            ],
            default: "hazirlaniyor",
            index: true,
        },

        // Materyal listesi değiştiğinde artırılır.
        materyalSurumu: {
            type: Number,
            default: 0,
            min: 0,
        },

        // Başarılı analiz hangi materyal sürümüne ait?
        analizSurumu: {
            type: Number,
            default: -1,
        },

        // Analiz devam ederken eşzamanlı işlem kontrolü.
        analizTokeni: {
            type: String,
            default: null,
        },

        analizHatasi: {
            type: String,
            default: "",
        },

        analizBaslamaTarihi: {
            type: Date,
            default: null,
        },

        analizBitisTarihi: {
            type: Date,
            default: null,
        },

        // Gemini analizinden çıkan konu haritası.
        // Mevcut KonuHaritasi yapısına aktarılacaktır.
        hazirKonuHaritasi: {
            type: mongoose.Schema.Types.Mixed,
            default: null,
        },

        // Onaydan sonra oluşturulan resmi ders.
        olusturulanDersId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ders",
            default: null,
        },

        // Aynı onayın iki kez işlenmesini önler.
        olusturmaAnahtari: {
            type: String,
            required: true,
            trim: true,
        },

        sonEtkinlikTarihi: {
            type: Date,
            default: Date.now,
        },
    },
    {
        timestamps: true,
    }
);

// Her kullanıcı için oluşturma anahtarı benzersizdir.
dersTaslagiSchema.index(
    { kullaniciId: 1, olusturmaAnahtari: 1 },
    { unique: true }
);

// Kullanıcının aktif taslaklarını hızlıca bulmak için.
dersTaslagiSchema.index({
    kullaniciId: 1,
    durum: 1,
    updatedAt: -1,
});

// Analiz sonucunun güncel olup olmadığını kontrol eder.
dersTaslagiSchema.methods.analizGuncelMi = function () {
    return (
        this.durum === "onaya_hazir" &&
        this.analizSurumu === this.materyalSurumu &&
        this.hazirKonuHaritasi !== null &&
        Array.isArray(this.hazirKonuHaritasi.anaKonular) &&
        this.hazirKonuHaritasi.anaKonular.length > 0
    );
};

const DersTaslagi = mongoose.model(
    "DersTaslagi",
    dersTaslagiSchema
);

export default DersTaslagi;

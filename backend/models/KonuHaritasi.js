import mongoose from "mongoose";

const altKonuSchema = new mongoose.Schema(
    {
        konuId: {
            type: String,
            required: true,
            // Benzersiz kalıcı kimlik (örn: "sub-1-2" veya UUID/ObjectId string)
        },
        baslik: {
            type: String,
            required: [true, "Alt konu başlığı zorunludur"],
            trim: true,
        },
        aciklama: {
            type: String,
            trim: true,
            default: "",
        },
        sira: {
            type: Number,
            default: 1,
        },
        // Bu konuyu destekleyen materyallerin MongoDB ObjectId listesi.
        // Adaptif modüller (Quiz, Mastery, Flashcard) bu ID üzerinden çalışır.
        // Aynı materyal iki kez eklenemez (uygulama katmanında garanti edilir).
        kaynakMateryalIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Materyal",
            }
        ],
    },
    { _id: true }
);

const anaKonuSchema = new mongoose.Schema(
    {
        konuId: {
            type: String,
            required: true,
            // Benzersiz kalıcı kimlik (Gelecekte Quiz/Flashcard/Mastery Score bağlanabilmesi için)
        },
        baslik: {
            type: String,
            required: [true, "Ana konu başlığı zorunludur"],
            trim: true,
        },
        aciklama: {
            type: String,
            trim: true,
            default: "",
        },
        sira: {
            type: Number,
            default: 1,
        },
        // Bu ana konuyu destekleyen materyaller (altKonular üzerinden birleşik bakış için).
        // Adaptif modüller öncelikle altKonu.kaynakMateryalIds'yi kullanır.
        kaynakMateryalIds: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "Materyal",
            }
        ],
        altKonular: [altKonuSchema],
    },
    { _id: true }
);

const konuHaritasiSchema = new mongoose.Schema(
    {
        kullaniciId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Kullanici",
            required: true,
            index: true,
        },
        dersId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Ders",
            required: true,
            unique: true, // Her dersin tek bir resmi konu haritası kaydı olur
            index: true,
        },
        durum: {
            type: String,
            enum: ["yok", "olusturuluyor", "hazir", "hata"],
            default: "yok",
            index: true,
        },
        olusturmaHatasi: {
            type: String,
            default: "",
        },
        anaKonular: [anaKonuSchema],
        // Son hazır materyal silinse bile gelecekteki Quiz, Flashcard ve Mastery kayıtlarının
        // konu kimliklerini ve öğrenme geçmişini koruyan arşiv
        gecmisKonular: [anaKonuSchema],
        toplamAnaKonuSayisi: {
            type: Number,
            default: 0,
        },
        toplamAltKonuSayisi: {
            type: Number,
            default: 0,
        },
        // Haritanın hangi materyallerden ve hangi aktif metin işleme sürümlerinden üretildiği
        kaynakMateryaller: [
            {
                materyalId: {
                    type: mongoose.Schema.Types.ObjectId,
                    ref: "Materyal",
                },
                aktifIslemeId: {
                    type: mongoose.Schema.Types.ObjectId,
                },
                dosyaAdi: String,
            },
        ],
        kullanilanModel: {
            type: String,
            default: "",
        },
        sonOlusturmaTarihi: {
            type: Date,
            default: null,
        },
        // Eşzamanlı oluşturma kilit belirteci
        aktifIslemToken: {
            type: mongoose.Schema.Types.ObjectId,
            default: null,
        },
    },
    {
        timestamps: true,
    }
);

const KonuHaritasi = mongoose.model("KonuHaritasi", konuHaritasiSchema);

export default KonuHaritasi;

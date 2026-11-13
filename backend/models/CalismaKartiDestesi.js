import mongoose from "mongoose";
import { KART_HATA_ASAMALARI, KART_DOGRULAMA_ALT_KODLARI } from "../utils/calismaKartiTanilama.js";

const taniSchema = new mongoose.Schema({
    asama: { type: String, enum: KART_HATA_ASAMALARI },
    konuId: { type: String, maxlength: 200 },
    dogrulamaAltKodu: { type: String, enum: KART_DOGRULAMA_ALT_KODLARI },
    kartIndex: Number, beklenenKartSayisi: Number, uretilenKartSayisi: Number,
    gercekDenemeSayisi: Number, orijinalHttpDurumu: Number,
    finishReason: { type: String, enum: ["STOP", "MAX_TOKENS", "MAX_OUTPUT_TOKENS", "SAFETY", "RECITATION", "OTHER"] },
}, { _id: false });

const kaynakSchema = new mongoose.Schema({
    materyalId: { type: mongoose.Schema.Types.ObjectId, ref: "Materyal", required: true },
    islemeId: { type: mongoose.Schema.Types.ObjectId, required: true },
    parcaIndex: { type: Number, required: true },
    dosyaAdi: { type: String, required: true, maxlength: 500 },
    alinti: { type: String, required: true, maxlength: 1600 },
    // Eski kartlarda bulunması zorunlu değildir; yeni kartta gerçek parça aralıklarıdır.
    kanitBaslangic: Number, kanitBitis: Number, cevapBaslangic: Number, cevapBitis: Number,
    metinParcasiId: { type: mongoose.Schema.Types.ObjectId, ref: "MetinParcasi" },
}, { _id: false });

const kartSchema = new mongoose.Schema({
    konuId: { type: String, required: true, maxlength: 200 },
    soru: { type: String, required: true, trim: true, maxlength: 400 },
    cevap: { type: String, required: true, trim: true, maxlength: 800 },
    kaynak: { type: kaynakSchema, required: true },
    tur: { type: String, enum: ["soru_cevap", "bosluk_doldurma"] },
    kavramId: { type: String, maxlength: 24 },
    kavramTuru: { type: String, maxlength: 40 },
});
const konuSchema = new mongoose.Schema({
    konuId: { type: String, required: true, maxlength: 200 },
    anaKonuId: { type: String, required: true, maxlength: 200 },
    baslik: { type: String, required: true, maxlength: 500 },
    anaBaslik: { type: String, required: true, maxlength: 500 },
    hedefKartSayisi: { type: Number, required: true, min: 0 },
    kavramSayisi: { type: Number, min: 0 },
    sifirKartNedeni: { type: String, default: "", maxlength: 60 },
    retrievalYontemi: { type: String, enum: ["keyword", "hybrid", "keyword_fallback"] },
    retrievalHataKodu: { type: String, maxlength: 80 },
    kullanilanModel: { type: String, maxlength: 120 },
    planSurumu: Number,
    tamamlandi: { type: Boolean, default: false },
    kartlar: { type: [kartSchema], default: [] },
    denemeSayisi: { type: Number, default: 0, min: 0 },
    sdkCagriSayisi: { type: Number, default: 0, min: 0 },
    sonDenemeSdkCagrisi: { type: Number, default: 0, min: 0 },
    hataKodu: { type: String, default: "", maxlength: 80 },
    reddedilenKartlar: { type: [taniSchema], default: [] },
}, { _id: false });

const schema = new mongoose.Schema({
    kullaniciId: { type: mongoose.Schema.Types.ObjectId, ref: "Kullanici", required: true, immutable: true },
    dersId: { type: mongoose.Schema.Types.ObjectId, ref: "Ders", required: true, immutable: true },
    kaynakImzasi: { type: String, required: true, immutable: true },
    durum: { type: String, enum: ["olusturuluyor", "kismi", "hata", "hazir"], required: true },
    konular: { type: [konuSchema], required: true },
    aktifIslemToken: { type: mongoose.Schema.Types.ObjectId, default: null },
    sonYenileme: { type: Date, default: null },
    hataKodu: { type: String, default: "", maxlength: 80 },
    hataTanilama: { type: taniSchema, default: undefined },
    cagriPenceresiBaslangici: { type: Date, default: null },
    // Aktif işin ayrılan hakkı dahildir. Normal bitişte kullanılmayan hak geri verilir;
    // süreç çökerse bilinmeyen çağrılar güvenlik için harcanmış sayılır.
    ayrilanCagriSayisi: { type: Number, default: 0, min: 0 },
    aktifCagriLimiti: { type: Number, default: 0, min: 0 },
    sonIslemSdkCagrisi: { type: Number, default: 0, min: 0 },
    kullanilanModel: { type: String, default: "", maxlength: 120 },
}, { timestamps: true });
schema.index({ kullaniciId: 1, dersId: 1 }, { unique: true });
export default mongoose.model("CalismaKartiDestesi", schema);

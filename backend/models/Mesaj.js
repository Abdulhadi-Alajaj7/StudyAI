import mongoose from "mongoose";

const kaynakKonumuSchema = new mongoose.Schema(
    {
        tur: {
            type: String,
            enum: ["sayfa", "slayt", "bolum"],
            default: undefined,
        },
        deger: {
            type: String,
            trim: true,
            maxlength: 100,
            default: undefined,
        },
    },
    { _id: false }
);

const mesajKaynagiSchema = new mongoose.Schema(
    {
        metinParcasiId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "MetinParcasi",
            required: true,
        },
        materyalId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Materyal",
            required: true,
        },
        materyalAdi: {
            type: String,
            required: true,
            trim: true,
            maxlength: 255,
        },
        parcaIndex: {
            type: Number,
            min: 0,
            required: true,
        },
        konum: {
            type: kaynakKonumuSchema,
            default: undefined,
        },
    },
    { _id: false }
);

const mesajSchema = new mongoose.Schema(
    {
        sohbetId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Sohbet",
            required: true,
            immutable: true,
        },
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
        rol: {
            type: String,
            enum: ["user", "assistant"],
            required: true,
            immutable: true,
        },
        icerik: {
            type: String,
            required: true,
            minlength: 1,
            maxlength: 30_000,
        },
        kaynaklar: {
            type: [mesajKaynagiSchema],
            default: undefined,
        },
        istemciIstekId: {
            type: String,
            trim: true,
            minlength: 8,
            maxlength: 128,
            required: [
                function () { return this.rol === "user"; },
                "Kullanıcı mesajı için istemci istek kimliği zorunludur.",
            ],
            default: undefined,
        },
        yanitlananMesajId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Mesaj",
            default: undefined,
        },
        yanitDurumu: {
            type: String,
            enum: ["kaydedildi", "yanit_bekliyor", "yanitlandi", "hata"],
            default: undefined,
        },
        hataKodu: {
            type: String,
            trim: true,
            maxlength: 100,
            default: undefined,
        },
        tokenKullanimi: {
            girdi: { type: Number, min: 0, default: undefined },
            cikti: { type: Number, min: 0, default: undefined },
            toplam: { type: Number, min: 0, default: undefined },
        },
    },
    { timestamps: true }
);

mesajSchema.index({ sohbetId: 1, createdAt: -1, _id: -1 });
mesajSchema.index({ kullaniciId: 1, dersId: 1, createdAt: -1 });
mesajSchema.index(
    { kullaniciId: 1, istemciIstekId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            rol: "user",
            istemciIstekId: { $type: "string" },
        },
    }
);
mesajSchema.index(
    { sohbetId: 1, yanitlananMesajId: 1 },
    {
        unique: true,
        partialFilterExpression: {
            rol: "assistant",
            yanitlananMesajId: { $type: "objectId" },
        },
    }
);

const Mesaj = mongoose.model("Mesaj", mesajSchema);

export default Mesaj;

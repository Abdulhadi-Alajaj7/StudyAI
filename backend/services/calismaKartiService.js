import Ders from "../models/Ders.js";
import CalismaKarti from "../models/CalismaKarti.js";

export class CalismaKartiHatasi extends Error {
    constructor(message, status = 422, kod = "KART_HATASI") {
        super(message);
        this.status = status;
        this.kod = kod;
    }
}
const bagimliliklar = (d = {}) => ({
    DersModel: d.DersModel || Ders,
    KartModel: d.KartModel || CalismaKarti,
});
const dersGetir = async (x, kullaniciId, dersId) => {
    const ders = await x.DersModel.findOne({
        _id: dersId, kullaniciId, temizleniyor: { $ne: true },
    }).lean();
    if (!ders) throw new CalismaKartiHatasi("Ders bulunamadı.", 404, "DERS_BULUNAMADI");
    return ders;
};
export const calismaKartlariDurumunuGetir = async ({ kullaniciId, dersId }, d = {}) => {
    const x = bagimliliklar(d);
    const ders = await dersGetir(x, kullaniciId, dersId);
    const yeniSistem = Boolean(ders.kartDersSurumImzasi);
    const uretimSuruyor = Boolean(ders.kartDersOtomatikAktif);
    const tamamlandi = yeniSistem && Boolean(ders.kartDersTamamlandi) &&
        !uretimSuruyor;
    // Yarım üretilmiş kartlar ve eski kartlar öğrencinin önüne düşmez.
    // Tamamlanma anında bütün ders kartları tek defada açılır.
    const kartlarGosterilsin = !uretimSuruyor && (!yeniSistem || tamamlandi);
    const kartlar = kartlarGosterilsin
        ? await x.KartModel.find({ kullaniciId, dersId })
            .sort({ createdAt: 1, _id: 1 }).lean()
        : [];
    return {
        kartlar, tamamlandi,
        dersKartTamamlandi: tamamlandi,
        uretimSuruyor,
        uretimHatasi: !uretimSuruyor
            ? String(ders.kartDersOtomatikHataKodu || "") : "",
        sonrakiDeneme: uretimSuruyor ? ders.kartDersSonrakiDeneme || null : null,
        toplamGrupSayisi: yeniSistem ? Number(ders.kartDersToplamGrupSayisi || 0) : 0,
        islenenGrupSayisi: yeniSistem
            ? (ders.kartDersIslenenGrupImzalari || []).length : 0,
    };
};
export const calismaKartlariniListele = async (girdi, d = {}) =>
    (await calismaKartlariDurumunuGetir(girdi, d)).kartlar;

export const calismaKartiDurumuGuncelle = async ({
    kullaniciId, dersId, kartId, goruldu, yildizli, zorluk,
}, d = {}) => {
    const x = bagimliliklar(d);
    await dersGetir(x, kullaniciId, dersId);
    const set = {};
    if (typeof goruldu === "boolean") set.goruldu = goruldu;
    if (typeof yildizli === "boolean") set.yildizli = yildizli;
    if (["zor", "orta", "kolay"].includes(zorluk)) set.zorluk = zorluk;
    if (!Object.keys(set).length) {
        throw new CalismaKartiHatasi("Geçersiz kart durumu.", 400);
    }
    const kart = await x.KartModel.findOneAndUpdate(
        { _id: kartId, kullaniciId, dersId },
        { $set: set },
        { new: true, runValidators: true }
    ).lean();
    if (!kart) throw new CalismaKartiHatasi("Kart bulunamadı.", 404);
    return kart;
};

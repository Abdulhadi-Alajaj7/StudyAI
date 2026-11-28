import Ders from "../models/Ders.js";
import CalismaKarti from "../models/CalismaKarti.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { konuKartSurumuGerekliMi } from "./dersKartPlanlama.mjs";
import { gunlukTekrarlariGetir, tekrarPlaniOlustur, tekrarPlaniSifirla } from "./aralikliTekrarService.js";

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
    KonuHaritasiModel: d.KonuHaritasiModel || (d.DersModel ? null : KonuHaritasi),
    simdi: d.simdi || (() => new Date()),
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
    const uretimSuruyor = Boolean(ders.kartDersOtomatikAktif || ders.kartUretimToken);
    const konuSistemi=String(ders.kartDersSurumImzasi||"").startsWith("konu-v2:");
    const harita=ders.kartDersTamamlandi&&!konuSistemi
        ? await x.KonuHaritasiModel?.findOne({kullaniciId,dersId,durum:"hazir"}).select("parcaAtamaSurumu").lean() : null;
    const yeniKonuKartlariGerekli=konuKartSurumuGerekliMi(ders,harita);
    const tamamlandi = yeniSistem && Boolean(ders.kartDersTamamlandi) &&
        !uretimSuruyor && !yeniKonuKartlariGerekli;
    // Yarım üretilmiş kartlar ve eski kartlar öğrencinin önüne düşmez.
    // Tamamlanma anında bütün ders kartları tek defada açılır.
    const kartlarGosterilsin = !uretimSuruyor && !ders.kartDersOtomatikHataKodu &&
        !yeniKonuKartlariGerekli && (!yeniSistem || tamamlandi);
    const kartlar = kartlarGosterilsin
        ? await x.KartModel.find({ kullaniciId, dersId })
            .sort({ createdAt: 1, _id: 1 }).lean()
        : [];
    return {
        kartlar, tamamlandi, yeniKonuKartlariGerekli,
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

export const calismaKartiTekrarlariniGetir = async ({ kullaniciId, dersId }, d = {}) => {
    const x = bagimliliklar(d);
    await dersGetir(x, kullaniciId, dersId);
    return gunlukTekrarlariGetir(x.KartModel, { kullaniciId, dersId }, x.simdi());
};

const surumFiltresi = (surum) => surum === 0
    ? { $or: [{ __v: 0 }, { __v: { $exists: false } }] }
    : { __v: surum };

const tekrarSurumuDegisti = () => new CalismaKartiHatasi(
    "Kartın tekrar planı değişti. Güncel kartı kontrol edip yeniden deneyin.", 409, "KART_TEKRAR_SURUMU_DEGISTI"
);

const tekrarDegisikliginiKaydet = async (x, filtre, surum, set) => {
    const kart = await x.KartModel.findOneAndUpdate(
        { ...filtre, ...surumFiltresi(surum) },
        { $set: set, $inc: { __v: 1 } },
        { new: true, runValidators: true }
    ).lean();
    if (kart) return kart;
    if (!await x.KartModel.findOne(filtre).lean()) throw new CalismaKartiHatasi("Kart bulunamadı.", 404);
    throw tekrarSurumuDegisti();
};

const tekrarSurumunuDogrula = (surum) => {
    if (!Number.isSafeInteger(surum) || surum < 0) {
        throw new CalismaKartiHatasi("Kartın tekrar sürümü geçersiz.", 400);
    }
};

export const calismaKartiTekrariniSifirla = async ({ kullaniciId, dersId, kartId, surum }, d = {}) => {
    tekrarSurumunuDogrula(surum);
    const x = bagimliliklar(d);
    await dersGetir(x, kullaniciId, dersId);
    return tekrarDegisikliginiKaydet(x, { _id: kartId, kullaniciId, dersId }, surum, tekrarPlaniSifirla());
};

export const calismaKartiDurumuGuncelle = async ({
    kullaniciId, dersId, kartId, goruldu, yildizli, zorluk, surum,
}, d = {}) => {
    const x = bagimliliklar(d);
    await dersGetir(x, kullaniciId, dersId);
    const set = {};
    const filtre = { _id: kartId, kullaniciId, dersId };
    if (typeof goruldu === "boolean") set.goruldu = goruldu;
    if (typeof yildizli === "boolean") set.yildizli = yildizli;
    if (["zor", "orta", "kolay"].includes(zorluk)) {
        tekrarSurumunuDogrula(surum);
        const mevcut = await x.KartModel.findOne(filtre).lean();
        if (!mevcut) throw new CalismaKartiHatasi("Kart bulunamadı.", 404);
        if ((mevcut.__v ?? 0) !== surum) throw tekrarSurumuDegisti();
        return tekrarDegisikliginiKaydet(x, filtre, surum, {
            ...set, ...tekrarPlaniOlustur(mevcut.tekrarSeviyesi, zorluk, x.simdi())
        });
    }
    if (!Object.keys(set).length) {
        throw new CalismaKartiHatasi("Geçersiz kart durumu.", 400);
    }
    const kart = await x.KartModel.findOneAndUpdate(
        filtre,
        { $set: set },
        { new: true, runValidators: true }
    ).lean();
    if (!kart) throw new CalismaKartiHatasi("Kart bulunamadı.", 404);
    return kart;
};

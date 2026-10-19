import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Sohbet from "../models/Sohbet.js";
import Mesaj from "../models/Mesaj.js";

export class SohbetHatasi extends Error {
    constructor(mesaj, { status = 500, kod = "SOHBET_HATASI" } = {}) {
        super(mesaj);
        this.name = "SohbetHatasi";
        this.status = status;
        this.kod = kod;
    }
}

const bagimliliklariGetir = (bagimliliklar = {}) => ({
    DersModel: bagimliliklar.DersModel || Ders,
    SohbetModel: bagimliliklar.SohbetModel || Sohbet,
    MesajModel: bagimliliklar.MesajModel || Mesaj,
    startSession: bagimliliklar.startSession || (() => mongoose.startSession()),
});

const belgeyiNesneyeCevir = (belge) => (
    belge?.toObject ? belge.toObject() : belge
);

const oturumEkle = (sorgu, session) => (
    session ? sorgu.session(session) : sorgu
);

const dersBulunamadiHatasi = () => new SohbetHatasi(
    "Ders bulunamadı veya bu ders için yetkiniz yok.",
    { status: 404, kod: "DERS_BULUNAMADI" }
);

const sohbetBulunamadiHatasi = () => new SohbetHatasi(
    "Sohbet bulunamadı veya bu sohbet için yetkiniz yok.",
    { status: 404, kod: "SOHBET_BULUNAMADI" }
);

const cursorHatasi = () => new SohbetHatasi(
    "Sayfalama bilgisi geçersiz veya artık kullanılamıyor.",
    { status: 400, kod: "GECERSIZ_CURSOR" }
);

export const varsayilanSohbetBasligiOlustur = (ilkMesaj) => {
    const temiz = String(ilkMesaj || "")
        .replace(/[`*_>#\[\](){}]/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!temiz) return "Yeni Sohbet";
    if (temiz.length <= 70) return temiz;
    return `${temiz.slice(0, 69).trimEnd()}…`;
};

const dersiDogrula = async ({ kullaniciId, dersId }, DersModel) => {
    const ders = await DersModel.findOne({
        _id: dersId,
        kullaniciId,
        temizleniyor: { $ne: true },
    })
        .select("_id")
        .lean();

    if (!ders) throw dersBulunamadiHatasi();
    return ders;
};

const tekrarIstekSonucunuGetir = async ({
    kullaniciId,
    dersId,
    istemciIstekId,
    beklenenIcerik = null,
    session = null,
}, { SohbetModel, MesajModel }) => {
    let mesajSorgusu = MesajModel.findOne({
        kullaniciId,
        rol: "user",
        istemciIstekId,
    });
    mesajSorgusu = oturumEkle(mesajSorgusu, session);
    const mesaj = await mesajSorgusu.lean();
    if (!mesaj) return null;

    if (
        String(mesaj.dersId) !== String(dersId) ||
        (beklenenIcerik != null && mesaj.icerik !== beklenenIcerik)
    ) {
        throw new SohbetHatasi(
            "Aynı istemci istek kimliği farklı bir mesaj için kullanılamaz.",
            { status: 409, kod: "ISTEK_ID_CAKISMASI" }
        );
    }

    let sohbetSorgusu = SohbetModel.findOne({
        _id: mesaj.sohbetId,
        kullaniciId,
        dersId,
    });
    sohbetSorgusu = oturumEkle(sohbetSorgusu, session);
    const sohbet = await sohbetSorgusu.lean();

    if (!sohbet) {
        throw new SohbetHatasi(
            "Tekrar isteğine ait sohbet kaydı bulunamadı.",
            { status: 409, kod: "SOHBET_TUTARSIZLIGI" }
        );
    }

    return { sohbet, mesaj, tekrar: true };
};

export const sohbetOlustur = async ({
    kullaniciId,
    dersId,
    ilkMesaj,
    istemciIstekId,
}, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);

    const oncekiSonuc = await tekrarIstekSonucunuGetir(
        { kullaniciId, dersId, istemciIstekId, beklenenIcerik: ilkMesaj },
        deps
    );
    if (oncekiSonuc) return oncekiSonuc;

    const session = await deps.startSession();
    let sonuc;

    try {
        await session.withTransaction(async () => {
            const transactionTekrari = await tekrarIstekSonucunuGetir(
                {
                    kullaniciId,
                    dersId,
                    istemciIstekId,
                    beklenenIcerik: ilkMesaj,
                    session,
                },
                deps
            );
            if (transactionTekrari) {
                sonuc = transactionTekrari;
                return;
            }

            // Ders belgesine yapılan kısa sürüm yazımı sohbet oluşturma ile ders
            // silme kilidini aynı belge üzerinde sıralar. Silme kilidi önce
            // alınmışsa yeni sohbet oluşmaz; sohbet önce tamamlanmışsa temizlik
            // yeni kaydı da görür.
            const ders = await deps.DersModel.findOneAndUpdate(
                {
                    _id: dersId,
                    kullaniciId,
                    temizleniyor: { $ne: true },
                },
                { $inc: { sohbetSurumu: 1 } },
                { new: true, session }
            );
            if (!ders) throw dersBulunamadiHatasi();

            const simdi = new Date();
            const [sohbetBelgesi] = await deps.SohbetModel.create([
                {
                    kullaniciId,
                    dersId,
                    baslik: varsayilanSohbetBasligiOlustur(ilkMesaj),
                    baslikManuel: false,
                    baslikKaynagi: "varsayilan",
                    baslikUretimDurumu: "bekliyor",
                    sonMesajTarihi: simdi,
                },
            ], { session });

            const [mesajBelgesi] = await deps.MesajModel.create([
                {
                    sohbetId: sohbetBelgesi._id,
                    kullaniciId,
                    dersId,
                    rol: "user",
                    icerik: ilkMesaj,
                    istemciIstekId,
                    yanitDurumu: "kaydedildi",
                },
            ], { session });

            sonuc = {
                sohbet: belgeyiNesneyeCevir(sohbetBelgesi),
                mesaj: belgeyiNesneyeCevir(mesajBelgesi),
                tekrar: false,
            };
        });
    } catch (hata) {
        if (hata?.code === 11000) {
            const yarisSonucu = await tekrarIstekSonucunuGetir(
                { kullaniciId, dersId, istemciIstekId, beklenenIcerik: ilkMesaj },
                deps
            );
            if (yarisSonucu) return yarisSonucu;
        }
        throw hata;
    } finally {
        await session.endSession();
    }

    return sonuc;
};

export const sohbetleriListele = async ({
    kullaniciId,
    dersId,
    limit = 20,
    cursor = null,
}, bagimliliklar = {}) => {
    const { DersModel, SohbetModel } = bagimliliklariGetir(bagimliliklar);
    await dersiDogrula({ kullaniciId, dersId }, DersModel);

    const filtre = { kullaniciId, dersId };
    if (cursor) {
        const onceki = await SohbetModel.findOne({
            _id: cursor,
            kullaniciId,
            dersId,
        })
            .select("sonMesajTarihi")
            .lean();
        if (!onceki) throw cursorHatasi();

        filtre.$or = [
            { sonMesajTarihi: { $lt: onceki.sonMesajTarihi } },
            { sonMesajTarihi: onceki.sonMesajTarihi, _id: { $lt: onceki._id } },
        ];
    }

    const kayitlar = await SohbetModel.find(filtre)
        .sort({ sonMesajTarihi: -1, _id: -1 })
        .limit(limit + 1)
        .lean();
    const devamEdiyor = kayitlar.length > limit;
    const sohbetler = kayitlar.slice(0, limit);

    return {
        sohbetler,
        sonrakiCursor: devamEdiyor
            ? String(sohbetler[sohbetler.length - 1]._id)
            : null,
    };
};

export const sohbetGetir = async ({
    kullaniciId,
    dersId,
    sohbetId,
}, bagimliliklar = {}) => {
    const { SohbetModel } = bagimliliklariGetir(bagimliliklar);
    const sohbet = await SohbetModel.findOne({
        _id: sohbetId,
        kullaniciId,
        dersId,
    }).lean();

    if (!sohbet) throw sohbetBulunamadiHatasi();
    return sohbet;
};

export const sohbetBasliginiDegistir = async ({
    kullaniciId,
    dersId,
    sohbetId,
    baslik,
}, bagimliliklar = {}) => {
    const { SohbetModel } = bagimliliklariGetir(bagimliliklar);
    const sohbet = await SohbetModel.findOneAndUpdate(
        { _id: sohbetId, kullaniciId, dersId },
        {
            $set: {
                baslik,
                baslikManuel: true,
                baslikKaynagi: "manuel",
                baslikUretimDurumu: "tamamlandi",
            },
        },
        { new: true, runValidators: true }
    );

    if (!sohbet) throw sohbetBulunamadiHatasi();
    return belgeyiNesneyeCevir(sohbet);
};

export const sohbetMesajlariniGetir = async ({
    kullaniciId,
    dersId,
    sohbetId,
    limit = 50,
    cursor = null,
}, bagimliliklar = {}) => {
    const { SohbetModel, MesajModel } = bagimliliklariGetir(bagimliliklar);
    const sohbet = await SohbetModel.findOne({
        _id: sohbetId,
        kullaniciId,
        dersId,
    }).lean();
    if (!sohbet) throw sohbetBulunamadiHatasi();

    const filtre = { sohbetId, kullaniciId, dersId };
    if (cursor) {
        const onceki = await MesajModel.findOne({
            _id: cursor,
            sohbetId,
            kullaniciId,
            dersId,
        })
            .select("createdAt")
            .lean();
        if (!onceki) throw cursorHatasi();

        filtre.$or = [
            { createdAt: { $lt: onceki.createdAt } },
            { createdAt: onceki.createdAt, _id: { $lt: onceki._id } },
        ];
    }

    const kayitlar = await MesajModel.find(filtre)
        .sort({ createdAt: -1, _id: -1 })
        .limit(limit + 1)
        .lean();
    const devamEdiyor = kayitlar.length > limit;
    const enYenidenEskiye = kayitlar.slice(0, limit);
    const sonrakiCursor = devamEdiyor
        ? String(enYenidenEskiye[enYenidenEskiye.length - 1]._id)
        : null;

    return {
        sohbet,
        mesajlar: enYenidenEskiye.reverse(),
        sonrakiCursor,
    };
};

export const sohbetSil = async ({
    kullaniciId,
    dersId,
    sohbetId,
}, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    const session = await deps.startSession();
    let silinenSohbet;

    try {
        await session.withTransaction(async () => {
            silinenSohbet = await deps.SohbetModel.findOneAndDelete({
                _id: sohbetId,
                kullaniciId,
                dersId,
            }).session(session);
            if (!silinenSohbet) throw sohbetBulunamadiHatasi();

            await deps.MesajModel.deleteMany({
                sohbetId,
                kullaniciId,
                dersId,
            }).session(session);
        });
    } finally {
        await session.endSession();
    }

    return belgeyiNesneyeCevir(silinenSohbet);
};

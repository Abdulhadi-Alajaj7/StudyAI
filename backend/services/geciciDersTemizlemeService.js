import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Sohbet from "../models/Sohbet.js";
import Mesaj from "../models/Mesaj.js";
import { guvenliDosyaSil } from "../utils/dosyaIslemleri.js";

const BIR_SAAT = 60 * 60 * 1000;
const TEMIZLIK_LIMITI = 50;
const TEMIZLIK_LEASE_SURESI = 5 * 60 * 1000;
const TEMIZLIK_HEARTBEAT_ARALIGI = 60 * 1000;
const KULLANICI_SILME_NIYETI = "kullanici";

let temizlikCalisiyor = false;

class TemizlikLeaseKaybiHatasi extends Error {
    constructor() {
        super("Geçici ders temizlik lease'i kaybedildi.");
        this.name = "TemizlikLeaseKaybiHatasi";
        this.kod = "GECICI_DERS_TEMIZLIK_LEASE_KAYBI";
    }
}

const degistirilenKayitSayisi = (sonuc) =>
    sonuc?.matchedCount ?? sonuc?.n ?? 0;

const temizlikLeaseYenile = async (dersId, islemToken) => {
    const sonuc = await Ders.updateOne(
        {
            _id: dersId,
            temizleniyor: true,
            temizlikIslemToken: islemToken,
            aktifMateryalIslemSayisi: 0,
            $or: [
                { silmeNiyeti: KULLANICI_SILME_NIYETI },
                {
                    materyallerOnaylandi: { $ne: true },
                    silmeNiyeti: { $ne: KULLANICI_SILME_NIYETI }
                }
            ]
        },
        {
            $currentDate: { temizlikKilitSonYenilemeTarihi: true }
        },
        { timestamps: false }
    );

    if (degistirilenKayitSayisi(sonuc) !== 1) {
        throw new TemizlikLeaseKaybiHatasi();
    }
};

const temizlikHeartbeatBaslat = async (
    dersId,
    islemToken,
    heartbeatAraligi = TEMIZLIK_HEARTBEAT_ARALIGI
) => {
    let durduruldu = false;
    let heartbeatHatasi = null;
    let devamEdenYenileme = null;

    const yenile = () => {
        if (durduruldu) return Promise.resolve();
        if (devamEdenYenileme) return devamEdenYenileme;

        devamEdenYenileme = temizlikLeaseYenile(dersId, islemToken)
            .catch((hata) => {
                heartbeatHatasi = hata;
                throw hata;
            })
            .finally(() => {
                devamEdenYenileme = null;
            });

        return devamEdenYenileme;
    };

    await yenile();

    const zamanlayici = setInterval(() => {
        void yenile().catch(() => {});
    }, heartbeatAraligi);
    zamanlayici.unref?.();

    return {
        async dogrula() {
            if (heartbeatHatasi) throw heartbeatHatasi;
            await yenile();
            if (heartbeatHatasi) throw heartbeatHatasi;
        },
        durdur() {
            durduruldu = true;
            clearInterval(zamanlayici);
        }
    };
};

const leaseSuresiDolmusKosulu = () => ({
    $expr: {
        $lt: [
            {
                $ifNull: [
                    "$temizlikKilitSonYenilemeTarihi",
                    "$updatedAt"
                ]
            },
            { $subtract: ["$$NOW", TEMIZLIK_LEASE_SURESI] }
        ]
    }
});

const temizlikAdayiKosulu = () => ({
    aktifMateryalIslemSayisi: 0,
    $or: [
        {
            materyallerOnaylandi: { $ne: true },
            silmeNiyeti: { $ne: KULLANICI_SILME_NIYETI },
            $or: [
                {
                    temizleniyor: { $ne: true },
                    $expr: {
                        $lt: [
                            "$updatedAt",
                            { $subtract: ["$$NOW", BIR_SAAT] }
                        ]
                    }
                },
                {
                    temizleniyor: true,
                    ...leaseSuresiDolmusKosulu()
                }
            ]
        },
        {
            silmeNiyeti: KULLANICI_SILME_NIYETI,
            temizleniyor: true,
            ...leaseSuresiDolmusKosulu()
        }
    ]
});

/**
 * Tek bir temizlik çalışanının veritabanı turu. Process-local kilitten bağımsız
 * tutulması, farklı instance'ların atomik lease yarışının test edilebilmesini sağlar.
 */
export const geciciDersTemizlemeTuruCalistir = async ({
    logger = console,
    heartbeatAraligi = TEMIZLIK_HEARTBEAT_ARALIGI
} = {}) => {
    let temizlenenDersSayisi = 0;

    for (let i = 0; i < TEMIZLIK_LIMITI; i++) {
        const islemToken = new mongoose.Types.ObjectId();
        const kilit = await Ders.findOneAndUpdate(
            temizlikAdayiKosulu(),
            {
                $set: {
                    temizleniyor: true,
                    temizlikIslemToken: islemToken
                },
                $currentDate: { temizlikKilitSonYenilemeTarihi: true }
            },
            {
                new: true,
                sort: { updatedAt: 1 }
            }
        );

        if (!kilit) break;

        let heartbeat = null;

        try {
            heartbeat = await temizlikHeartbeatBaslat(
                kilit._id,
                islemToken,
                heartbeatAraligi
            );

            const materyaller = await Materyal.find({
                dersId: kilit._id
            })
                .select("dosyaYolu")
                .lean();

            await heartbeat.dogrula();

            // Ders lease'i yeni işlemleri engelledikten sonra materyalleri silme
            // durumuna al. Tekrar çalıştırılması güvenlidir.
            await Materyal.updateMany(
                { dersId: kilit._id },
                { $set: { durum: "siliniyor" } }
            );

            for (const materyal of materyaller) {
                await heartbeat.dogrula();
                await guvenliDosyaSil(materyal.dosyaYolu);
            }

            await heartbeat.dogrula();

            // Dosyalar silindikten sonra ilişkili kayıtları temizlemek tekrar
            // çalıştırılabilir; deleteMany ve dosya yardımcı fonksiyonu idempotenttir.
            // Sohbetler önce silinerek devam eden yanıt transaction'larıyla aynı
            // belge üzerinde sıralanır; mesaj temizliği bundan sonra yapılır.
            await Sohbet.deleteMany({
                dersId: kilit._id,
                kullaniciId: kilit.kullaniciId
            });

            await Promise.all([
                MetinParcasi.deleteMany({ dersId: kilit._id }),
                KonuHaritasi.deleteMany({ dersId: kilit._id }),
                Materyal.deleteMany({ dersId: kilit._id }),
                Mesaj.deleteMany({
                    dersId: kilit._id,
                    kullaniciId: kilit.kullaniciId
                })
            ]);

            await heartbeat.dogrula();

            const silmeSonucu = await Ders.deleteOne({
                _id: kilit._id,
                temizleniyor: true,
                temizlikIslemToken: islemToken,
                aktifMateryalIslemSayisi: 0,
                $or: [
                    { silmeNiyeti: KULLANICI_SILME_NIYETI },
                    {
                        materyallerOnaylandi: { $ne: true },
                        silmeNiyeti: { $ne: KULLANICI_SILME_NIYETI }
                    }
                ]
            });

            if ((silmeSonucu?.deletedCount ?? 0) !== 1) {
                throw new TemizlikLeaseKaybiHatasi();
            }

            temizlenenDersSayisi++;
            logger.log(`Geçici ders temizlendi: ${kilit._id}`);
        } catch (hata) {
            logger.error(
                `Geçici ders temizleme hatası (${kilit._id}):`,
                hata
            );
            // Sahiplik alanları korunur. Lease süresi dolduktan sonra başka bir
            // çalışan aynı tokenı atomik olarak değiştirip güvenle devam edebilir.
        } finally {
            heartbeat?.durdur();
        }
    }

    return { temizlenenDersSayisi };
};

export const geciciDersleriTemizle = async (secenekler = {}) => {
    if (temizlikCalisiyor) return { temizlenenDersSayisi: 0 };

    temizlikCalisiyor = true;

    try {
        return await geciciDersTemizlemeTuruCalistir(secenekler);
    } catch (hata) {
        (secenekler.logger || console).error(
            "Geçici ders temizleme hatası:",
            hata
        );
        return { temizlenenDersSayisi: 0 };
    } finally {
        temizlikCalisiyor = false;
    }
};


import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { guvenliDosyaSil } from "../utils/dosyaIslemleri.js";

const BIR_SAAT = 60 * 60 * 1000;
const TEMIZLIK_LIMITI = 50;

let temizlikCalisiyor = false;

export const geciciDersleriTemizle = async () => {
    if (temizlikCalisiyor) return;

    temizlikCalisiyor = true;

    try {
        const sonTarih = new Date(Date.now() - BIR_SAAT);

        const dersler = await Ders.find({
            materyallerOnaylandi: { $ne: true },
            aktifMateryalIslemSayisi: 0,
            $or: [
                { temizleniyor: true },
                {
                    temizleniyor: { $ne: true },
                    updatedAt: { $lt: sonTarih }
                }
            ]
        })
            .select("_id temizleniyor")
            .limit(TEMIZLIK_LIMITI)
            .lean();

        for (const ders of dersler) {
            try {
                let kilit;

                if (ders.temizleniyor === true) {
                    // Önceki çalışmada yarım kalan temizliği sürdür.
                    kilit = await Ders.findOne({
                        _id: ders._id,
                        materyallerOnaylandi: { $ne: true },
                        temizleniyor: true,
                        aktifMateryalIslemSayisi: 0
                    });
                } else {
                    // Yeni işlem başlamasını engellemek için atomik kilit.
                    kilit = await Ders.findOneAndUpdate(
                        {
                            _id: ders._id,
                            materyallerOnaylandi: { $ne: true },
                            temizleniyor: { $ne: true },
                            aktifMateryalIslemSayisi: 0,
                            updatedAt: { $lt: sonTarih }
                        },
                        {
                            $set: { temizleniyor: true }
                        },
                        { new: true }
                    );
                }

                if (!kilit) continue;

                const materyaller = await Materyal.find({
                    dersId: ders._id
                })
                    .select("dosyaYolu")
                    .lean();

                // İşlenmekte olmayan materyalleri silme durumuna al.
                await Materyal.updateMany(
                    { dersId: ders._id },
                    { $set: { durum: "siliniyor" } }
                );

                // Fiziksel dosyaları önce temizle.
                for (const materyal of materyaller) {
                    await guvenliDosyaSil(materyal.dosyaYolu);
                }

                // Dosyalar silindikten sonra MongoDB kayıtlarını temizle.
                await Promise.all([
                    MetinParcasi.deleteMany({ dersId: ders._id }),
                    KonuHaritasi.deleteMany({ dersId: ders._id }),
                    Materyal.deleteMany({ dersId: ders._id })
                ]);

                await Ders.deleteOne({
                    _id: ders._id,
                    materyallerOnaylandi: { $ne: true },
                    temizleniyor: true,
                    aktifMateryalIslemSayisi: 0
                });

                console.log(`Geçici ders temizlendi: ${ders._id}`);

            } catch (hata) {
                console.error(
                    `Geçici ders temizleme hatası (${ders._id}):`,
                    hata
                );

                // Kilidi koru: sonraki temizlik turunda tekrar denenecek.
            }
        }

    } catch (hata) {
        console.error("Geçici ders temizleme hatası:", hata);
    } finally {
        temizlikCalisiyor = false;
    }
};

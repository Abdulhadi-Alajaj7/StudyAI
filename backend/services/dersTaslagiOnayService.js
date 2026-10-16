
import mongoose from "mongoose";

import Ders from "../models/Ders.js";
import DersTaslagi from "../models/DersTaslagi.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";

/**
 * Ders taslağını resmi derse dönüştürür.
 *
 * Tüm veritabanı değişiklikleri tek transaction
 * içerisinde gerçekleştirilir.
 */
export const dersTaslaginiOnayla = async (
    taslakId,
    kullaniciId
) => {
    if (
        !mongoose.isValidObjectId(taslakId) ||
        !mongoose.isValidObjectId(kullaniciId)
    ) {
        const hata = new Error(
            "Geçersiz taslak veya kullanıcı ID."
        );
        hata.status = 400;
        throw hata;
    }

    const session = await mongoose.startSession();

    let sonuc = null;

    try {
        await session.withTransaction(async () => {
            const taslak = await DersTaslagi.findOne({
                _id: taslakId,
                kullaniciId,
            }).session(session);

            if (!taslak) {
                const hata = new Error(
                    "Ders taslağı bulunamadı."
                );
                hata.status = 404;
                throw hata;
            }

            // Aynı onay isteği tekrar gönderilirse
            // ikinci bir ders oluşturma.
            if (taslak.durum === "tamamlandi") {
                if (!taslak.olusturulanDersId) {
                    throw new Error(
                        "Tamamlanan taslağın ders kaydı bulunamadı."
                    );
                }

                const mevcutDers = await Ders.findOne({
                    _id: taslak.olusturulanDersId,
                    kullaniciId,
                }).session(session);

                if (!mevcutDers) {
                    throw new Error(
                        "Oluşturulan ders bulunamadı."
                    );
                }

                sonuc = {
                    basarili: true,
                    zatenOlusturulmus: true,
                    dersId: mevcutDers._id,
                    ders: mevcutDers,
                };

                return;
            }

            if (
                taslak.durum !== "onaya_hazir" ||
                !taslak.analizGuncelMi()
            ) {
                const hata = new Error(
                    "Konu haritası güncel değil. " +
                    "Dersi oluşturmadan önce analizi tamamlayın."
                );
                hata.status = 409;
                throw hata;
            }

            const materyaller = await Materyal.find({
                taslakId: taslak._id,
                kullaniciId,
            }).session(session);

            if (materyaller.length === 0) {
                const hata = new Error(
                    "Materyal bulunmayan taslak onaylanamaz."
                );
                hata.status = 409;
                throw hata;
            }

            const tumMateryallerHazir =
                materyaller.every(
                    (materyal) =>
                        materyal.durum === "hazir" &&
                        Boolean(materyal.aktifIslemeId) &&
                        Boolean(
                            materyal.cikarilanMetin?.trim()
                        )
                );

            if (!tumMateryallerHazir) {
                const hata = new Error(
                    "Tüm materyaller hazır olmadan " +
                    "ders oluşturulamaz."
                );
                hata.status = 409;
                throw hata;
            }

            const harita =
                taslak.hazirKonuHaritasi;

            if (
                !harita ||
                !Array.isArray(harita.anaKonular) ||
                harita.anaKonular.length === 0
            ) {
                const hata = new Error(
                    "Geçerli bir konu haritası bulunamadı."
                );
                hata.status = 409;
                throw hata;
            }

            // Haritanın aynı materyallere ve aynı
            // metin işleme sürümlerine ait olduğunu doğrula.
            const kaynaklar =
                harita.kaynakMateryaller || [];

            if (
                kaynaklar.length !== materyaller.length
            ) {
                const hata = new Error(
                    "Materyaller analizden sonra değişmiş. " +
                    "Yeniden analiz edin."
                );
                hata.status = 409;
                throw hata;
            }

            const kaynakHaritasi = new Map(
                kaynaklar.map((kaynak) => [
                    String(kaynak.materyalId),
                    String(kaynak.aktifIslemeId),
                ])
            );

            for (const materyal of materyaller) {
                const kayitliIslemeId =
                    kaynakHaritasi.get(
                        String(materyal._id)
                    );

                if (
                    kayitliIslemeId !==
                    String(materyal.aktifIslemeId)
                ) {
                    const hata = new Error(
                        "Materyal içeriği değişmiş. " +
                        "Yeniden analiz edin."
                    );
                    hata.status = 409;
                    throw hata;
                }
            }

            // Taslağı yalnızca uygun durumdaysa kilitle.
            const kilit = await DersTaslagi.updateOne(
                {
                    _id: taslak._id,
                    kullaniciId,
                    durum: "onaya_hazir",
                    materyalSurumu:
                        taslak.materyalSurumu,
                    analizSurumu:
                        taslak.analizSurumu,
                },
                {
                    $set: {
                        durum: "tamamlaniyor",
                        sonEtkinlikTarihi: new Date(),
                    },
                },
                { session }
            );

            if (kilit.modifiedCount !== 1) {
                const hata = new Error(
                    "Taslak başka bir işlem tarafından değiştirildi."
                );
                hata.status = 409;
                throw hata;
            }

            // Resmi ders oluştur.
            const [ders] = await Ders.create(
                [
                    {
                        kullaniciId,
                        dersAdi: taslak.dersAdi,
                        aciklama: taslak.aciklama,
                        donem: taslak.donem,
                        dersKodu: taslak.dersKodu,
                        renk: taslak.renk,
                        simge: taslak.simge,
                        durum: "hazir",
                        materyallerKilitli: true,
                        olusturmaAnahtari:
                            taslak.olusturmaAnahtari,
                    },
                ],
                { session }
            );

            const materyalIds = materyaller.map(
                (materyal) => materyal._id
            );

            // Materyalleri taslaktan resmi derse taşı.
            const tasinanMateryaller =
                await Materyal.updateMany(
                    {
                        _id: { $in: materyalIds },
                        taslakId: taslak._id,
                        kullaniciId,
                        durum: "hazir",
                    },
                    {
                        $set: {
                            dersId: ders._id,
                            taslakId: null,
                        },
                    },
                    { session }
                );

            if (
                tasinanMateryaller.modifiedCount !==
                materyaller.length
            ) {
                throw new Error(
                    "Materyallerin tamamı derse aktarılamadı."
                );
            }

            // Metin parçalarını da resmi derse bağla.
            await MetinParcasi.updateMany(
                {
                    taslakId: taslak._id,
                    kullaniciId,
                    materyalId: {
                        $in: materyalIds,
                    },
                },
                {
                    $set: {
                        dersId: ders._id,
                        taslakId: null,
                    },
                },
                { session }
            );

            // Önceden hazırlanmış Gemini haritasını
            // yeniden üretmeden resmi derse kaydet.
            const [konuHaritasi] =
                await KonuHaritasi.create(
                    [
                        {
                            kullaniciId,
                            dersId: ders._id,
                            durum: "hazir",
                            olusturmaHatasi: "",
                            anaKonular:
                                harita.anaKonular,
                            gecmisKonular: [],
                            toplamAnaKonuSayisi:
                                harita.toplamAnaKonuSayisi,
                            toplamAltKonuSayisi:
                                harita.toplamAltKonuSayisi,
                            kaynakMateryaller:
                                harita.kaynakMateryaller,
                            kullanilanModel:
                                harita.kullanilanModel,
                            sonOlusturmaTarihi:
                                harita.sonOlusturmaTarihi ||
                                new Date(),
                            aktifIslemToken: null,
                        },
                    ],
                    { session }
                );

            if (!konuHaritasi) {
                throw new Error(
                    "Konu haritası kaydedilemedi."
                );
            }

            // Taslağı tamamlandı olarak işaretle.
            const tamamlanan =
                await DersTaslagi.updateOne(
                    {
                        _id: taslak._id,
                        kullaniciId,
                        durum: "tamamlaniyor",
                    },
                    {
                        $set: {
                            durum: "tamamlandi",
                            olusturulanDersId: ders._id,
                            sonEtkinlikTarihi:
                                new Date(),
                        },
                    },
                    { session }
                );

            if (tamamlanan.modifiedCount !== 1) {
                throw new Error(
                    "Taslak tamamlanamadı."
                );
            }

            sonuc = {
                basarili: true,
                zatenOlusturulmus: false,
                dersId: ders._id,
                ders,
                konuHaritasiId: konuHaritasi._id,
                materyalSayisi: materyaller.length,
            };
        });

        if (!sonuc) {
            throw new Error(
                "Ders oluşturma işlemi tamamlanamadı."
            );
        }

        return sonuc;
    } finally {
        await session.endSession();
    }
};


import { createHash, randomUUID } from "node:crypto";

import DersTaslagi from "../models/DersTaslagi.js";
import Materyal from "../models/Materyal.js";

import {
    geminiIleKonuHaritasiUret,
    geminiIleKonulariBirlestir,
    VARSAYILAN_GEMINI_MODELI,
} from "./geminiService.js";

const ANALIZ_SURUMU = 1;
const AZAMI_DENEME = 4;

const bekle = (sure) =>
    new Promise((resolve) => setTimeout(resolve, sure));

const BASLIK_NORMALIZE = (metin = "") =>
    String(metin)
        .toLocaleLowerCase("tr-TR")
        .normalize("NFKC")
        .replace(/[^\p{L}\p{N}]+/gu, " ")
        .trim();

const konuKimligi = (tur, baslik, ustBaslik = "") => {
    const anahtar = [
        tur,
        BASLIK_NORMALIZE(ustBaslik),
        BASLIK_NORMALIZE(baslik),
    ].join("|");

    const hash = createHash("sha256")
        .update(anahtar)
        .digest("hex")
        .slice(0, 20);

    return `${tur}-${hash}`;
};

const benzersizIdler = (idListesi) => [
    ...new Set(idListesi.map((id) => String(id))),
];

const metinHazirMi = (materyal) =>
    materyal.durum === "hazir" &&
    typeof materyal.cikarilanMetin === "string" &&
    materyal.cikarilanMetin.trim().length > 0 &&
    Boolean(materyal.aktifIslemeId);

const geciciGeminiHatasiMi = (hata) => {
    const kodlar = [
        hata?.status,
        hata?.code,
        hata?.response?.status,
        hata?.response?.data?.error?.code,
        hata?.error?.code,
        hata?.error?.status,
    ];

    if (
        kodlar.some((kod) =>
            [429, 500, 502, 503, 504].includes(
                Number(kod)
            )
        )
    ) {
        return true;
    }

    const mesaj = [
        hata?.message,
        hata?.response?.data?.error?.message,
        hata?.cause?.message,
    ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

    return (
        /\b(429|500|502|503|504)\b/.test(mesaj) ||
        mesaj.includes("high demand") ||
        mesaj.includes("unavailable") ||
        mesaj.includes("resource exhausted") ||
        mesaj.includes("too many requests") ||
        mesaj.includes("rate limit")
    );
};

const geminiIstegiCalistir = async (
    islem,
    aciklama
) => {
    for (
        let deneme = 1;
        deneme <= AZAMI_DENEME;
        deneme++
    ) {
        try {
            return await islem();
        } catch (hata) {
            if (
                !geciciGeminiHatasiMi(hata) ||
                deneme === AZAMI_DENEME
            ) {
                throw hata;
            }

            const gecikme =
                Math.min(
                    2000 * 2 ** (deneme - 1),
                    16000
                ) + Math.floor(Math.random() * 1000);

            console.warn(
                `[Gemini] ${aciklama}: Geçici hata. ` +
                `Deneme ${deneme}/${AZAMI_DENEME}. ` +
                `${gecikme} ms beklenecek.`
            );

            await bekle(gecikme);
        }
    }
};

const analizKoleksiyonu = () =>
    DersTaslagi.db.collection(
        "taslak_materyal_analizleri"
    );

const metinKimligi = (metin) =>
    createHash("sha256")
        .update(metin)
        .digest("hex");

const analizAnahtari = (materyal) =>
    [
        String(materyal._id),
        String(materyal.aktifIslemeId),
        metinKimligi(materyal.cikarilanMetin),
        VARSAYILAN_GEMINI_MODELI,
        ANALIZ_SURUMU,
    ].join("|");

const kayitliAnaliziGetir = async (
    materyal,
    kullaniciId
) => {
    const kayit = await analizKoleksiyonu().findOne({
        _id: analizAnahtari(materyal),
        kullaniciId: String(kullaniciId),
    });

    if (
        !kayit ||
        !Array.isArray(kayit.konular) ||
        kayit.konular.length === 0
    ) {
        return null;
    }

    return kayit.konular;
};

const analiziKaydet = async (
    materyal,
    kullaniciId,
    konular
) => {
    await analizKoleksiyonu().updateOne(
        {
            _id: analizAnahtari(materyal),
            kullaniciId: String(kullaniciId),
        },
        {
            $set: {
                konular,
                guncellenmeTarihi: new Date(),
            },
            $setOnInsert: {
                materyalId: materyal._id,
                kullaniciId: String(kullaniciId),
                olusturulmaTarihi: new Date(),
            },
        },
        { upsert: true }
    );
};

const kaynaklariBul = (baslik, analizler) => {
    const hedef = BASLIK_NORMALIZE(baslik);

    if (!hedef) {
        return [];
    }

    const kaynaklar = [];

    for (const analiz of analizler) {
        const bulundu = analiz.konular.some(
            (anaKonu) => {
                if (
                    BASLIK_NORMALIZE(
                        anaKonu.baslik
                    ) === hedef
                ) {
                    return true;
                }

                return (
                    anaKonu.altKonular || []
                ).some(
                    (altKonu) =>
                        BASLIK_NORMALIZE(
                            altKonu.baslik
                        ) === hedef
                );
            }
        );

        if (bulundu) {
            kaynaklar.push(analiz.materyalId);
        }
    }

    return benzersizIdler(kaynaklar);
};

const haritayiHazirla = (
    birlesikKonular,
    analizler
) => {
    if (
        !Array.isArray(birlesikKonular) ||
        birlesikKonular.length === 0
    ) {
        throw new Error(
            "Geçerli bir konu haritası oluşturulamadı."
        );
    }

    const gorulenKimlikler = new Set();

    const anaKonular = birlesikKonular.map(
        (anaKonu, anaIndex) => {
            const anaId = konuKimligi(
                "ana",
                anaKonu.baslik
            );

            if (gorulenKimlikler.has(anaId)) {
                throw new Error(
                    "Gemini aynı ana konuyu birden fazla üretti."
                );
            }

            gorulenKimlikler.add(anaId);

            const altKonular = (
                anaKonu.altKonular || []
            ).map((altKonu, altIndex) => {
                const altId = konuKimligi(
                    "alt",
                    altKonu.baslik,
                    anaKonu.baslik
                );

                if (gorulenKimlikler.has(altId)) {
                    throw new Error(
                        "Gemini tekrarlanan alt konu üretti."
                    );
                }

                gorulenKimlikler.add(altId);

                return {
                    konuId: altId,
                    baslik: altKonu.baslik,
                    aciklama:
                        altKonu.aciklama || "",
                    sira: altIndex + 1,
                    kaynakMateryalIds:
                        kaynaklariBul(
                            altKonu.baslik,
                            analizler
                        ),
                };
            });

            const anaKaynaklar =
                benzersizIdler([
                    ...kaynaklariBul(
                        anaKonu.baslik,
                        analizler
                    ),
                    ...altKonular.flatMap(
                        (alt) =>
                            alt.kaynakMateryalIds
                    ),
                ]);

            return {
                konuId: anaId,
                baslik: anaKonu.baslik,
                aciklama:
                    anaKonu.aciklama || "",
                sira: anaIndex + 1,
                kaynakMateryalIds:
                    anaKaynaklar,
                altKonular,
            };
        }
    );

    return {
        anaKonular,
        toplamAnaKonuSayisi:
            anaKonular.length,
        toplamAltKonuSayisi:
            anaKonular.reduce(
                (toplam, ana) =>
                    toplam +
                    ana.altKonular.length,
                0
            ),
        kullanilanModel:
            VARSAYILAN_GEMINI_MODELI,
        sonOlusturmaTarihi: new Date(),
    };
};

const analizHalaGecerliMi = async (
    taslak,
    kullaniciId,
    analizTokeni,
    baslangicSurumu
) => {
    const gecerli = await DersTaslagi.exists({
        _id: taslak._id,
        kullaniciId,
        durum: "analiz_ediliyor",
        analizTokeni,
        materyalSurumu: baslangicSurumu,
    });

    if (!gecerli) {
        throw new Error(
            "Analiz sırasında taslak değişti. Yeniden analiz edin."
        );
    }
};

export const dersTaslaginiAnalizEt = async (
    taslakId,
    kullaniciId
) => {
    const analizTokeni = randomUUID();

    const taslak =
        await DersTaslagi.findOneAndUpdate(
            {
                _id: taslakId,
                kullaniciId,
                durum: {
                    $in: [
                        "hazirlaniyor",
                        "analiz_hatasi",
                        "onaya_hazir",
                    ],
                },
            },
            {
                $set: {
                    durum: "analiz_ediliyor",
                    analizTokeni,
                    analizHatasi: "",
                    analizBaslamaTarihi:
                        new Date(),
                    analizBitisTarihi: null,
                    analizSurumu: -1,
                    hazirKonuHaritasi: null,
                },
            },
            { new: true }
        );

    if (!taslak) {
        throw new Error(
            "Taslak bulunamadı veya analiz için uygun değil."
        );
    }

    const baslangicSurumu =
        taslak.materyalSurumu;

    try {
        const materyaller =
            await Materyal.find({
                taslakId: taslak._id,
                kullaniciId,
            }).sort({ createdAt: 1 });

        if (materyaller.length === 0) {
            throw new Error(
                "Analiz için en az bir materyal ekleyin."
            );
        }

        if (!materyaller.every(metinHazirMi)) {
            throw new Error(
                "Tüm materyallerin metin çıkarma işlemi tamamlanmalıdır."
            );
        }

        const analizler = [];

        for (const materyal of materyaller) {
            await analizHalaGecerliMi(
                taslak,
                kullaniciId,
                analizTokeni,
                baslangicSurumu
            );

            let konular =
                await kayitliAnaliziGetir(
                    materyal,
                    kullaniciId
                );

            if (konular) {
                console.log(
                    `[Gemini] Önbellekten kullanıldı: ${materyal.orijinalDosyaAdi}`
                );
            } else {
                console.log(
                    `[Gemini] Yeni analiz: ${materyal.orijinalDosyaAdi}`
                );

                konular =
                    await geminiIstegiCalistir(
                        () =>
                            geminiIleKonuHaritasiUret(
                                materyal.cikarilanMetin,
                                {
                                    dersAdi:
                                        taslak.dersAdi,
                                    aciklama:
                                        taslak.aciklama,
                                }
                            ),
                        materyal.orijinalDosyaAdi
                    );

                if (
                    !Array.isArray(konular) ||
                    konular.length === 0
                ) {
                    throw new Error(
                        `${materyal.orijinalDosyaAdi} analiz edilemedi.`
                    );
                }

                await analiziKaydet(
                    materyal,
                    kullaniciId,
                    konular
                );
            }

            analizler.push({
                materyalId: materyal._id,
                dosyaAdi:
                    materyal.orijinalDosyaAdi,
                aktifIslemeId:
                    materyal.aktifIslemeId,
                konular,
            });
        }

        await analizHalaGecerliMi(
            taslak,
            kullaniciId,
            analizTokeni,
            baslangicSurumu
        );

        let birlesikKonular;

        if (analizler.length === 1) {
            birlesikKonular =
                analizler[0].konular;
        } else {
            console.log(
                `[Gemini] ${analizler.length} materyalin konuları birleştiriliyor.`
            );

            birlesikKonular =
                await geminiIstegiCalistir(
                    () =>
                        geminiIleKonulariBirlestir(
                            analizler.map(
                                (analiz) =>
                                    analiz.konular
                            ),
                            {
                                dersAdi:
                                    taslak.dersAdi,
                                aciklama:
                                    taslak.aciklama,
                            }
                        ),
                    "Konu birleştirme"
                );
        }

        const harita = haritayiHazirla(
            birlesikKonular,
            analizler
        );

        harita.kaynakMateryaller =
            analizler.map((analiz) => ({
                materyalId:
                    analiz.materyalId,
                aktifIslemeId:
                    analiz.aktifIslemeId,
                dosyaAdi: analiz.dosyaAdi,
            }));

        const kaydedilen =
            await DersTaslagi.findOneAndUpdate(
                {
                    _id: taslak._id,
                    kullaniciId,
                    durum: "analiz_ediliyor",
                    analizTokeni,
                    materyalSurumu:
                        baslangicSurumu,
                },
                {
                    $set: {
                        durum: "onaya_hazir",
                        analizSurumu:
                            baslangicSurumu,
                        hazirKonuHaritasi:
                            harita,
                        analizTokeni: null,
                        analizHatasi: "",
                        analizBitisTarihi:
                            new Date(),
                    },
                },
                { new: true }
            );

        if (!kaydedilen) {
            throw new Error(
                "Analiz sırasında taslak değişti. Yeniden analiz edin."
            );
        }

        console.log(
            `[Gemini] Analiz tamamlandı: ${analizler.length} materyal.`
        );

        return {
            basarili: true,
            taslakId: kaydedilen._id,
            durum: kaydedilen.durum,
            analizGuncel:
                kaydedilen.analizGuncelMi(),
            konuHaritasi: harita,
        };
    } catch (hata) {
        await DersTaslagi.findOneAndUpdate(
            {
                _id: taslak._id,
                kullaniciId,
                durum: "analiz_ediliyor",
                analizTokeni,
            },
            {
                $set: {
                    durum: "analiz_hatasi",
                    analizTokeni: null,
                    analizHatasi: hata.message,
                    analizBitisTarihi:
                        new Date(),
                    analizSurumu: -1,
                    hazirKonuHaritasi: null,
                },
            }
        );

        throw hata;
    }
};

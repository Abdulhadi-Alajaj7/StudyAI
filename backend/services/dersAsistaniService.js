import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Mesaj from "../models/Mesaj.js";
import Sohbet from "../models/Sohbet.js";
import { semanticAramaYap } from "./semanticAramaService.js";
import {
    geminiIleSohbetBasligiUret,
    geminiIleSohbetYanitiUret,
} from "./geminiService.js";
import { SohbetHatasi } from "./sohbetService.js";
import { dahiliKaynakAtiflariniTemizle } from "../utils/dahiliKaynakAtiflari.js";

const MESAJ_KILIDI_MS = 2 * 60 * 1000;
const BAGLAM_MESAJ_LIMITI = 8;
const BAGLAM_KARAKTER_LIMITI = 8_000;
const RAG_TEK_KONU_SONUC_LIMITI = 6;
const RAG_COK_KONU_SONUC_LIMITI = 10;

const depsGetir = (bagimliliklar = {}) => ({
    DersModel: bagimliliklar.DersModel || Ders,
    MesajModel: bagimliliklar.MesajModel || Mesaj,
    SohbetModel: bagimliliklar.SohbetModel || Sohbet,
    semanticArama: bagimliliklar.semanticArama || semanticAramaYap,
    geminiYanitUret: bagimliliklar.geminiYanitUret || geminiIleSohbetYanitiUret,
    geminiBaslikUret: bagimliliklar.geminiBaslikUret || geminiIleSohbetBasligiUret,
    simdi: bagimliliklar.simdi || (() => new Date()),
    logger: bagimliliklar.logger || console,
    startSession: bagimliliklar.startSession || (() => mongoose.startSession()),
});

const nesneyeCevir = (belge) => (belge?.toObject ? belge.toObject() : belge);

const asistanMesajiniSunumaHazirla = (mesaj) => {
    const nesne = nesneyeCevir(mesaj);
    if (!nesne || nesne.rol !== "assistant") return nesne;
    return { ...nesne, icerik: dahiliKaynakAtiflariniTemizle(nesne.icerik) };
};

const sohbetBulunamadi = () => new SohbetHatasi(
    "Sohbet bulunamadı veya bu sohbet için yetkiniz yok.",
    { status: 404, kod: "SOHBET_BULUNAMADI" }
);

const dersBulunamadi = () => new SohbetHatasi(
    "Ders bulunamadı veya bu ders için yetkiniz yok.",
    { status: 404, kod: "DERS_BULUNAMADI" }
);

const istekCakismasi = () => new SohbetHatasi(
    "Aynı istemci istek kimliği farklı bir mesaj için kullanılamaz.",
    { status: 409, kod: "ISTEK_ID_CAKISMASI" }
);

const mesajIsleniyor = () => new SohbetHatasi(
    "Bu sohbette başka bir mesaj işleniyor. İşlem tamamlandıktan sonra yeniden deneyin.",
    { status: 409, kod: "SOHBET_MESAJI_ISLENIYOR" }
);

const turkceKucult = (metin) => String(metin || "").toLocaleLowerCase("tr-TR").trim();

export const yalnizcaMateryalIstegiMi = (mesaj) => {
    const metin = turkceKucult(mesaj);
    return /\b(yalnızca|sadece)\b.{0,45}\b(ders|materyal|not|doküman|belge|sunum)/i.test(metin) ||
        /\b(genel bilgi|kendi bilgin|harici bilgi|dış kaynak)\b.{0,25}\b(kullanma|ekleme|verme)/i.test(metin) ||
        /\b(ders|materyal|not|doküman|belge|sunum)\w*\b.{0,35}\b(dışına çıkma|dayanarak yanıtla)/i.test(metin);
};

const genelTakipKavramlari = new Set([
    "avantaj", "avantajları", "dezavantaj", "dezavantajları", "fayda", "faydaları",
    "zarar", "zararları", "özellik", "özellikleri", "örnek", "örnekleri", "aşama",
    "aşamaları", "neden", "nasıl", "hangileri", "nelerdir", "detay", "devam",
]);

export const acikKonuIceriyorMu = (mesaj) => {
    const metin = turkceKucult(mesaj).replace(/[^\p{L}\p{N}\s-]/gu, " ").replace(/\s+/g, " ");
    const eslesme = metin.match(/^(.{2,100}?)\s+(nedir|ne demektir|kimdir|nasıl çalışır|nasıl işler|açıkla|tanımla)\b/u);
    if (!eslesme) return false;
    const konuSozcukleri = eslesme[1].split(" ").filter(Boolean);
    if (konuSozcukleri.some((sozcuk) => ["bu", "bunun", "bunlar", "onun", "onlar", "peki"].includes(sozcuk))) {
        return false;
    }
    return konuSozcukleri.some((sozcuk) => !genelTakipKavramlari.has(sozcuk));
};

const takipSorusuGibiMi = (mesaj) => {
    const metin = turkceKucult(mesaj);
    const sozcukler = metin.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
    const isaretVar = /^(peki|ya |bunun|buna|bunlar|bu |onun|ona|onlar|ayrıca|öyleyse)/u.test(metin);
    const genelKavramVar = sozcukler.some((sozcuk) => genelTakipKavramlari.has(sozcuk));
    const iyelikliGenelKavram = sozcukler.some((sozcuk) => /(ları|leri|sı|si|su|sü)$/u.test(sozcuk) && sozcuk.length > 4);
    return !acikKonuIceriyorMu(mesaj) && sozcukler.length <= 12 && (isaretVar || genelKavramVar || iyelikliGenelKavram);
};

export const anlamsalAramaSorgusuOlustur = ({ guncelMesaj, oncekiMesajlar = [] }) => {
    if (!takipSorusuGibiMi(guncelMesaj)) {
        return { sorgu: guncelMesaj, takipSorusu: false, baglamMesajId: null };
    }

    const oncekiKonu = [...oncekiMesajlar]
        .reverse()
        .find((mesaj) => mesaj.rol === "user" && acikKonuIceriyorMu(mesaj.icerik));
    if (!oncekiKonu) {
        return { sorgu: guncelMesaj, takipSorusu: false, baglamMesajId: null };
    }

    return {
        sorgu: `Önceki konu: ${oncekiKonu.icerik}\nTakip sorusu: ${guncelMesaj}`,
        takipSorusu: true,
        baglamMesajId: oncekiKonu._id ? String(oncekiKonu._id) : null,
    };
};

export const ragSonucLimitiGetir = (sorgu) => {
    const metin = turkceKucult(sorgu);
    const cokluKonuAyiraciVar = /[,;/]|\b(?:ve|ile|ayrıca|ayrica|hem|birlikte)\b/iu.test(metin);
    return cokluKonuAyiraciVar
        ? RAG_COK_KONU_SONUC_LIMITI
        : RAG_TEK_KONU_SONUC_LIMITI;
};

export const konusmaBaglaminiSinirla = (mesajlar = []) => {
    const uygun = mesajlar
        .filter((mesaj) => ["user", "assistant"].includes(mesaj.rol))
        .filter((mesaj) => mesaj.rol !== "user" || mesaj.yanitDurumu !== "hata")
        .slice(-BAGLAM_MESAJ_LIMITI);
    const sonuc = [];
    let toplam = 0;
    for (const mesaj of [...uygun].reverse()) {
        const hamIcerik = String(mesaj.icerik || "").trim();
        const icerik = mesaj.rol === "assistant"
            ? dahiliKaynakAtiflariniTemizle(hamIcerik)
            : hamIcerik;
        if (!icerik) continue;
        const kalan = BAGLAM_KARAKTER_LIMITI - toplam;
        if (kalan <= 0) break;
        sonuc.unshift({
            _id: mesaj._id,
            rol: mesaj.rol,
            icerik: icerik.slice(Math.max(0, icerik.length - kalan)),
            yanitDurumu: mesaj.yanitDurumu,
        });
        toplam += Math.min(kalan, icerik.length);
    }
    return sonuc;
};

export const kaynakAdaylariniHazirla = (
    sonuclar = [],
    limit = RAG_TEK_KONU_SONUC_LIMITI
) => sonuclar
    .filter((kaynak) => (
        kaynak?.metinParcasiId && kaynak?.materyalId && kaynak?.materyalAdi &&
        Number.isInteger(kaynak?.parcaIndex) && typeof kaynak?.icerik === "string"
    ))
    .slice(0, Math.min(RAG_COK_KONU_SONUC_LIMITI, Math.max(1, limit)))
    .map((kaynak, index) => ({ ...kaynak, kod: `K${index + 1}` }));

export const kaynakSnapshotlariniDogrula = (kodlar = [], adaylar = []) => {
    const adayHaritasi = new Map(adaylar.map((aday) => [aday.kod, aday]));
    const kullanilanParcalar = new Set();
    const snapshotlar = [];
    for (const kod of kodlar) {
        const aday = adayHaritasi.get(kod);
        if (!aday || kullanilanParcalar.has(String(aday.metinParcasiId))) continue;
        kullanilanParcalar.add(String(aday.metinParcasiId));
        snapshotlar.push({
            metinParcasiId: aday.metinParcasiId,
            materyalId: aday.materyalId,
            materyalAdi: aday.materyalAdi,
            parcaIndex: aday.parcaIndex,
        });
    }
    return snapshotlar;
};

const sohbetKilidiniBirak = async ({
    SohbetModel,
    sohbetId,
    kullaniciId,
    dersId,
    istemciIstekId,
    kilitBaslamaTarihi = null,
}) => {
    await SohbetModel.updateOne(
        {
            _id: sohbetId,
            kullaniciId,
            dersId,
            aktifIstekId: istemciIstekId,
            ...(kilitBaslamaTarihi ? { aktifIstekBaslamaTarihi: kilitBaslamaTarihi } : {}),
        },
        { $unset: { aktifIstekId: "", aktifIstekBaslamaTarihi: "" } }
    );
};

const sohbetKilidiniAl = async ({
    SohbetModel,
    sohbetId,
    kullaniciId,
    dersId,
    istemciIstekId,
    simdi,
    session = null,
}) => SohbetModel.findOneAndUpdate(
    {
        _id: sohbetId,
        kullaniciId,
        dersId,
        $or: [
            { aktifIstekId: { $exists: false } },
            { aktifIstekId: null },
            { aktifIstekBaslamaTarihi: { $lt: new Date(simdi.getTime() - MESAJ_KILIDI_MS) } },
        ],
    },
    {
        $set: {
            aktifIstekId: istemciIstekId,
            aktifIstekBaslamaTarihi: simdi,
        },
    },
    { new: true, ...(session ? { session } : {}) }
);

const tekrarMesajiniGetir = async ({ MesajModel, kullaniciId, istemciIstekId }) => (
    MesajModel.findOne({ kullaniciId, rol: "user", istemciIstekId }).lean()
);

const asistanMesajiniGetir = async ({ MesajModel, sohbetId, kullaniciId, dersId, mesajId }) => (
    MesajModel.findOne({
        sohbetId,
        kullaniciId,
        dersId,
        rol: "assistant",
        yanitlananMesajId: mesajId,
    }).lean()
);

const tekrarIceriginiDogrula = ({ mesaj, sohbetId, dersId, icerik }) => {
    if (
        String(mesaj.sohbetId) !== String(sohbetId) ||
        String(mesaj.dersId) !== String(dersId) ||
        mesaj.icerik !== icerik
    ) {
        throw istekCakismasi();
    }
};

const yeniKullaniciMesajiniKaydet = async ({
    deps,
    kullaniciId,
    dersId,
    sohbetId,
    icerik,
    istemciIstekId,
}) => {
    const session = await deps.startSession();
    let sonuc;
    try {
        await session.withTransaction(async () => {
            const mevcutMesaj = await deps.MesajModel.findOne({
                kullaniciId,
                rol: "user",
                istemciIstekId,
            }).session(session).lean();
            if (mevcutMesaj) {
                tekrarIceriginiDogrula({ mesaj: mevcutMesaj, sohbetId, dersId, icerik });
                sonuc = { kullaniciMesaji: mevcutMesaj, kilit: null };
                return;
            }

            // Ders belgesine yapılan bu kısa yazım, yeni mesaj eklemeyi ders
            // silme kilidiyle aynı belge üzerinde sıralar. Gemini çağrısı bu
            // transaction tamamlandıktan sonra yapılır.
            const ders = await deps.DersModel.findOneAndUpdate(
                { _id: dersId, kullaniciId, temizleniyor: { $ne: true } },
                { $inc: { sohbetSurumu: 1 } },
                { new: true, session }
            );
            if (!ders) throw dersBulunamadi();

            const simdi = deps.simdi();
            const kilit = await sohbetKilidiniAl({
                SohbetModel: deps.SohbetModel,
                sohbetId,
                kullaniciId,
                dersId,
                istemciIstekId,
                simdi,
                session,
            });
            if (!kilit) throw mesajIsleniyor();

            const [mesajBelgesi] = await deps.MesajModel.create([{
                sohbetId,
                kullaniciId,
                dersId,
                rol: "user",
                icerik,
                istemciIstekId,
                yanitDurumu: "yanit_bekliyor",
            }], { session });
            sonuc = {
                kullaniciMesaji: nesneyeCevir(mesajBelgesi),
                kilit: nesneyeCevir(kilit),
            };
        });
        return sonuc;
    } finally {
        await session.endSession();
    }
};

const tamamlanmisYanitiOnar = async ({ deps, sohbetId, kullaniciId, dersId, istemciIstekId, kullaniciMesaji, asistanMesaji }) => {
    await deps.MesajModel.updateOne(
        { _id: kullaniciMesaji._id, sohbetId, kullaniciId, dersId },
        { $set: { yanitDurumu: "yanitlandi" }, $unset: { hataKodu: "" } }
    );
    await deps.SohbetModel.updateOne(
        { _id: sohbetId, kullaniciId, dersId },
        { $max: { sonMesajTarihi: asistanMesaji.createdAt || deps.simdi() } }
    );
    await sohbetKilidiniBirak({
        SohbetModel: deps.SohbetModel,
        sohbetId,
        kullaniciId,
        dersId,
        istemciIstekId,
    });
};

export const sohbetMesajinaYanitOlustur = async ({
    kullaniciId,
    dersId,
    sohbetId,
    icerik,
    istemciIstekId,
    kullaniciMesaji: verilenKullaniciMesaji = null,
    kilitZatenAlindi = false,
}, bagimliliklar = {}) => {
    const deps = depsGetir(bagimliliklar);
    const sohbet = await deps.SohbetModel.findOne({ _id: sohbetId, kullaniciId, dersId }).lean();
    if (!sohbet) throw sohbetBulunamadi();

    let kullaniciMesaji = verilenKullaniciMesaji;
    if (!kullaniciMesaji) {
        kullaniciMesaji = await tekrarMesajiniGetir({
            MesajModel: deps.MesajModel,
            kullaniciId,
            istemciIstekId,
        });
        if (kullaniciMesaji) {
            tekrarIceriginiDogrula({ mesaj: kullaniciMesaji, sohbetId, dersId, icerik });
        }
    }

    if (kullaniciMesaji) {
        const mevcutYanit = await asistanMesajiniGetir({
            MesajModel: deps.MesajModel,
            sohbetId,
            kullaniciId,
            dersId,
            mesajId: kullaniciMesaji._id,
        });
        if (mevcutYanit) {
            await tamamlanmisYanitiOnar({
                deps, sohbetId, kullaniciId, dersId, istemciIstekId, kullaniciMesaji, asistanMesaji: mevcutYanit,
            });
            return {
                kullaniciMesaji,
                asistanMesaji: asistanMesajiniSunumaHazirla(mevcutYanit),
                tekrar: true,
            };
        }
    }

    let kilitBizde = kilitZatenAlindi && sohbet.aktifIstekId === istemciIstekId;
    let dersSilmeKilitliIslemleSirali = kilitBizde;
    let kilitBaslamaTarihi = kilitBizde ? sohbet.aktifIstekBaslamaTarihi : null;
    if (!kullaniciMesaji) {
        const kayitSonucu = await yeniKullaniciMesajiniKaydet({
            deps,
            kullaniciId,
            dersId,
            sohbetId,
            icerik,
            istemciIstekId,
        });
        kullaniciMesaji = kayitSonucu.kullaniciMesaji;
        if (kayitSonucu.kilit) {
            kilitBizde = true;
            dersSilmeKilitliIslemleSirali = true;
            kilitBaslamaTarihi = kayitSonucu.kilit.aktifIstekBaslamaTarihi;
        } else {
            const yarisYaniti = await asistanMesajiniGetir({
                MesajModel: deps.MesajModel,
                sohbetId,
                kullaniciId,
                dersId,
                mesajId: kullaniciMesaji._id,
            });
            if (yarisYaniti) {
                await tamamlanmisYanitiOnar({
                    deps, sohbetId, kullaniciId, dersId, istemciIstekId, kullaniciMesaji, asistanMesaji: yarisYaniti,
                });
                return {
                    kullaniciMesaji,
                    asistanMesaji: asistanMesajiniSunumaHazirla(yarisYaniti),
                    tekrar: true,
                };
            }
        }
    }
    if (!kilitBizde) {
        const kilit = await sohbetKilidiniAl({
            SohbetModel: deps.SohbetModel,
            sohbetId,
            kullaniciId,
            dersId,
            istemciIstekId,
            simdi: deps.simdi(),
        });
        if (!kilit) throw mesajIsleniyor();
        kilitBizde = true;
        kilitBaslamaTarihi = kilit.aktifIstekBaslamaTarihi;
    }

    try {
        if (!dersSilmeKilitliIslemleSirali) {
            const ders = await deps.DersModel.findOneAndUpdate(
                { _id: dersId, kullaniciId, temizleniyor: { $ne: true } },
                { $inc: { sohbetSurumu: 1 } },
                { new: true }
            );
            if (!ders) throw dersBulunamadi();
        }

        await deps.MesajModel.updateOne(
            { _id: kullaniciMesaji._id, sohbetId, kullaniciId, dersId },
            { $set: { yanitDurumu: "yanit_bekliyor" }, $unset: { hataKodu: "" } }
        );

        const gecmis = await deps.MesajModel.find({
            sohbetId,
            kullaniciId,
            dersId,
            _id: { $ne: kullaniciMesaji._id },
        })
            .sort({ createdAt: -1, _id: -1 })
            .limit(BAGLAM_MESAJ_LIMITI + 4)
            .lean();
        const baglam = konusmaBaglaminiSinirla([...gecmis].reverse());
        const arama = anlamsalAramaSorgusuOlustur({
            guncelMesaj: icerik,
            oncekiMesajlar: baglam,
        });
        const ragSonucLimiti = ragSonucLimitiGetir(arama.sorgu);
        const aramaSonucu = await deps.semanticArama({
            kullaniciId,
            dersId,
            sorgu: arama.sorgu,
            limit: ragSonucLimiti,
        });
        const kaynakAdaylari = kaynakAdaylariniHazirla(
            aramaSonucu?.sonuclar || [],
            ragSonucLimiti
        );
        const baglamdakiKonuMesaji = arama.baglamMesajId
            ? baglam.find((mesaj) => String(mesaj._id) === arama.baglamMesajId)
            : null;
        const yalnizcaMateryal = yalnizcaMateryalIstegiMi(icerik) || (
            arama.takipSorusu && yalnizcaMateryalIstegiMi(baglamdakiKonuMesaji?.icerik)
        );

        let yapayZekaSonucu;
        if (yalnizcaMateryal && kaynakAdaylari.length === 0) {
            yapayZekaSonucu = {
                yanit: "Bu soruyu yanıtlayacak doğrulanmış bilgi ders materyallerinde bulunamadı. Yalnızca ders materyallerini kullanmamı istediğiniz için genel bilgi eklemedim.",
                kullanilanKaynakKodlari: [],
                bilgiDurumu: "bulunamadi",
                tokenKullanimi: undefined,
            };
        } else {
            yapayZekaSonucu = await deps.geminiYanitUret({
                soru: icerik,
                konusmaBaglami: baglam,
                kaynaklar: kaynakAdaylari,
                yalnizcaMateryal,
            });
        }

        const kaynaklar = kaynakSnapshotlariniDogrula(
            yapayZekaSonucu.kullanilanKaynakKodlari,
            kaynakAdaylari
        );
        const temizYanit = dahiliKaynakAtiflariniTemizle(yapayZekaSonucu.yanit).trim();
        if (!temizYanit) {
            throw new SohbetHatasi(
                "Yapay zekâ hizmetinden gösterilebilir bir yanıt alınamadı. Aynı isteği yeniden deneyebilirsiniz.",
                { status: 502, kod: "GEMINI_GECERSIZ_YANIT" }
            );
        }
        const kayitSession = await deps.startSession();
        let asistanMesaji;
        try {
            await kayitSession.withTransaction(async () => {
                const yanitTarihi = deps.simdi();
                const kilitliSohbet = await deps.SohbetModel.findOneAndUpdate(
                    {
                        _id: sohbetId,
                        kullaniciId,
                        dersId,
                        aktifIstekId: istemciIstekId,
                        aktifIstekBaslamaTarihi: kilitBaslamaTarihi,
                    },
                    {
                        $set: { sonMesajTarihi: yanitTarihi },
                        $unset: { aktifIstekId: "", aktifIstekBaslamaTarihi: "" },
                    },
                    { new: true, session: kayitSession }
                );
                if (!kilitliSohbet) {
                    throw new SohbetHatasi(
                        "Mesaj işleme süresi doldu. Aynı isteği güvenle yeniden deneyebilirsiniz.",
                        { status: 409, kod: "SOHBET_MESAJ_KILIDI_KAYBEDILDI" }
                    );
                }

                const asistanBelgesi = await deps.MesajModel.findOneAndUpdate(
                    {
                        sohbetId,
                        kullaniciId,
                        dersId,
                        rol: "assistant",
                        yanitlananMesajId: kullaniciMesaji._id,
                    },
                    {
                        $setOnInsert: {
                            sohbetId,
                            kullaniciId,
                            dersId,
                            rol: "assistant",
                            icerik: temizYanit,
                            kaynaklar,
                            yanitlananMesajId: kullaniciMesaji._id,
                            tokenKullanimi: yapayZekaSonucu.tokenKullanimi,
                        },
                    },
                    {
                        upsert: true,
                        new: true,
                        runValidators: true,
                        setDefaultsOnInsert: true,
                        session: kayitSession,
                    }
                );
                asistanMesaji = nesneyeCevir(asistanBelgesi);

                await deps.MesajModel.updateOne(
                    { _id: kullaniciMesaji._id, sohbetId, kullaniciId, dersId },
                    { $set: { yanitDurumu: "yanitlandi" }, $unset: { hataKodu: "" } },
                    { session: kayitSession }
                );
            });
        } finally {
            await kayitSession.endSession();
        }

        return {
            kullaniciMesaji,
            asistanMesaji,
            tekrar: false,
            arama: {
                takipSorusu: arama.takipSorusu,
                bilgiDurumu: yapayZekaSonucu.bilgiDurumu,
            },
        };
    } catch (hata) {
        if (kullaniciMesaji?._id) {
            await deps.MesajModel.updateOne(
                { _id: kullaniciMesaji._id, sohbetId, kullaniciId, dersId, yanitDurumu: { $ne: "yanitlandi" } },
                { $set: { yanitDurumu: "hata", hataKodu: hata?.kod || "YANIT_URETILEMEDI" } }
            );
        }
        if (kilitBizde) {
            await sohbetKilidiniBirak({
                SohbetModel: deps.SohbetModel,
                sohbetId,
                kullaniciId,
                dersId,
                istemciIstekId,
                kilitBaslamaTarihi,
            });
        }
        throw hata;
    }
};

export const otomatikSohbetBasliginiUret = async ({
    kullaniciId,
    dersId,
    sohbetId,
    ilkMesaj,
}, bagimliliklar = {}) => {
    const deps = depsGetir(bagimliliklar);
    const baslamaTarihi = deps.simdi();
    const talep = await deps.SohbetModel.findOneAndUpdate(
        {
            _id: sohbetId,
            kullaniciId,
            dersId,
            baslikManuel: false,
            baslikUretimDurumu: "bekliyor",
            $or: [
                { baslikUretimDenemeSayisi: 0 },
                { baslikUretimDenemeSayisi: { $exists: false } },
            ],
        },
        {
            $set: {
                baslikUretimDurumu: "isleniyor",
                baslikUretimBaslamaTarihi: baslamaTarihi,
            },
            $inc: { baslikUretimDenemeSayisi: 1 },
        },
        { new: true }
    );
    if (!talep) return { denendi: false };

    try {
        const baslik = await deps.geminiBaslikUret({ ilkMesaj });
        const guncellenen = await deps.SohbetModel.findOneAndUpdate(
            {
                _id: sohbetId,
                kullaniciId,
                dersId,
                baslikManuel: false,
                baslikUretimDurumu: "isleniyor",
            },
            {
                $set: {
                    baslik,
                    baslikKaynagi: "gemini",
                    baslikUretimDurumu: "tamamlandi",
                },
                $unset: { baslikUretimBaslamaTarihi: "" },
            },
            { new: true, runValidators: true }
        );
        return { denendi: true, guncellendi: Boolean(guncellenen), baslik: guncellenen?.baslik };
    } catch (hata) {
        await deps.SohbetModel.updateOne(
            {
                _id: sohbetId,
                kullaniciId,
                dersId,
                baslikManuel: false,
                baslikUretimDurumu: "isleniyor",
            },
            {
                $set: { baslikUretimDurumu: "hata" },
                $unset: { baslikUretimBaslamaTarihi: "" },
            }
        );
        deps.logger.warn("Otomatik sohbet başlığı üretilemedi.", { kod: hata?.kod || "BASLIK_URETIM_HATASI" });
        return { denendi: true, guncellendi: false };
    }
};

export const yarimKalanBaslikUretimleriniKapat = async ({
    eskiTarih = new Date(Date.now() - MESAJ_KILIDI_MS),
} = {}, bagimliliklar = {}) => {
    const { SohbetModel } = depsGetir(bagimliliklar);
    const sonuc = await SohbetModel.updateMany(
        {
            baslikUretimDurumu: "isleniyor",
            baslikUretimBaslamaTarihi: { $lt: eskiTarih },
        },
        {
            $set: { baslikUretimDurumu: "hata" },
            $unset: { baslikUretimBaslamaTarihi: "" },
        }
    );
    return sonuc.modifiedCount || 0;
};

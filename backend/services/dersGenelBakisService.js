import Ders from "../models/Ders.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Test from "../models/Test.js";
import Materyal from "../models/Materyal.js";
import { hakimiyetDurumunuGetir, haritadanKonuHakimiyetiniGetir } from "./konuHakimiyetService.js";
import { analizdenAdaptifTestOnerisiGetir } from "./adaptifTestService.js";
import { dersKartIstatistikleriniGetir } from "./calismaKartiService.js";

const normalVeyaAdaptif = kaynak => kaynak == null || kaynak === "normal" || kaynak === "adaptif";

const testIstatistikleriniGetir = async (filtre) => {
    const basariGelisimi = [];
    const sonTestler = [];
    const soruAnalizi = { dogru: 0, yanlis: 0, bos: 0, toplam: 0 };
    let tamamlananTestSayisi = 0;
    const testler = Test.find({ ...filtre, durum: "tamamlandi" })
        .select("kapsamTuru kaynak konuId konuBasligi materyalId tamamlanmaTarihi sonuc.dogruSayisi sonuc.yanlisSayisi sonuc.bosSayisi")
        .sort({ tamamlanmaTarihi: -1, _id: -1 }).lean().cursor();

    try {
        for await (const { _id, kaynak, kapsamTuru, konuId, konuBasligi, materyalId, tamamlanmaTarihi, sonuc } of testler) {
            const { dogruSayisi, yanlisSayisi, bosSayisi } = sonuc || {};
            const sayilar = [dogruSayisi, yanlisSayisi, bosSayisi];
            const toplam = sayilar.every(sayi => Number.isSafeInteger(sayi) && sayi >= 0)
                ? dogruSayisi + yanlisSayisi + bosSayisi : 0;
            const basari = toplam > 0 ? dogruSayisi * 100 / toplam : null;
            const test = { _id, kaynak, kapsamTuru, konuId, konuBasligi, materyalId, tamamlanmaTarihi, basari };
            if (sonTestler.length < 5) sonTestler.push(test);
            if (basari === null || !normalVeyaAdaptif(kaynak)) continue;

            soruAnalizi.dogru += dogruSayisi;
            soruAnalizi.yanlis += yanlisSayisi;
            soruAnalizi.bos += bosSayisi;
            soruAnalizi.toplam += toplam;
            tamamlananTestSayisi++;
            if (basariGelisimi.length < 8) basariGelisimi.push(test);
        }
    } finally {
        await testler.close();
    }

    return {
        tamamlananTestSayisi, soruAnalizi, sonTestler, basariGelisimi: basariGelisimi.reverse(),
        testBasarisi: soruAnalizi.toplam > 0 ? soruAnalizi.dogru * 100 / soruAnalizi.toplam : null
    };
};

export const dersGenelBakisiniGetir = async (filtre, { sadeceHakimiyet = false } = {}) => {
    const ders = await Ders.findOne({ _id: filtre.dersId, kullaniciId: filtre.kullaniciId, temizleniyor: { $ne: true } })
        .select("kartDersSurumImzasi kartDersTamamlandi kartDersOtomatikAktif kartUretimToken kartDersOtomatikHataKodu").lean();
    if (!ders) return null;

    const harita = await KonuHaritasi.findOne(filtre).select(sadeceHakimiyet
        ? "anaKonular.altKonular.konuId"
        : "durum parcaAtamaSurumu anaKonular.konuId anaKonular.baslik anaKonular.altKonular.konuId anaKonular.altKonular.baslik"
    ).lean();
    const [analiz, testler, kartlar] = await Promise.all([
        haritadanKonuHakimiyetiniGetir(filtre, harita),
        sadeceHakimiyet ? null : testIstatistikleriniGetir(filtre),
        sadeceHakimiyet ? null : dersKartIstatistikleriniGetir(filtre, ders, harita)
    ]);
    const degerlendirilen = analiz.filter(konu => Number.isFinite(konu.yuzde));
    const yuzde = degerlendirilen.length
        ? degerlendirilen.reduce((toplam, konu) => toplam + konu.yuzde, 0) / degerlendirilen.length : null;
    const genelHakimiyet = { yuzde, durum: hakimiyetDurumunuGetir(yuzde), degerlendirilen: degerlendirilen.length, toplam: analiz.length };
    if (sadeceHakimiyet) return { genelHakimiyet };

    const konular = (harita?.anaKonular || []).flatMap(({ konuId, baslik, altKonular }) => [{ konuId, baslik }, ...(altKonular || [])]);
    const basliklar = new Map(konular.map(konu => [konu.konuId, konu.baslik]));
    const konuDurumlari = { iyi: 0, gelistirilmeli: 0, zayif: 0, yeterli_veri_yok: 0 };
    for (const konu of analiz) konuDurumlari[konu.durum]++;
    const oncelikliKonular = [...analiz].sort((a, b) => (a.yuzde ?? 101) - (b.yuzde ?? 101))
        .slice(0, 5).map(({ konuId, yuzde, durum }) => ({ konuId, baslik: basliklar.get(konuId), yuzde, durum }));

    const gosterilenTestler = [...testler.sonTestler, ...testler.basariGelisimi];
    const konuIds = new Set(gosterilenTestler.filter(test => test.kapsamTuru === "konu" && !test.konuBasligi).map(test => test.konuId));
    const materyalIds = [...new Set(gosterilenTestler.filter(test => test.kapsamTuru === "materyal").map(test => test.materyalId)
        .filter(Boolean).map(String))];
    const materyaller = materyalIds.length
        ? await Materyal.find({ ...filtre, _id: { $in: materyalIds } }).select("orijinalDosyaAdi dosyaAdi").lean()
        : [];
    return {
        genelHakimiyet, ...testler, kartlar, konuDurumlari, oncelikliKonular,
        adaptifOneri: analizdenAdaptifTestOnerisiGetir(harita, analiz),
        testHedefleri: { konular: konular.filter(konu => konuIds.has(konu.konuId)), materyaller }
    };
};

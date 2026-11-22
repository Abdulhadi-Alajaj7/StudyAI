/**
 * Salt okunur soru–konu denetim raporu. Üretim verilerini GÜNCELLEMEZ.
 *
 * Kullanım (backend klasöründen):
 * node scripts/soruKonuDenetimRaporu.mjs --kullanici <ObjectId> --ders <ObjectId>
 *
 * Rapor yalnızca sayıları ve dışlama nedeni kodlarını yazar.
 */
import dotenv from "dotenv";
import mongoose from "mongoose";

import Test from "../models/Test.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { konuPerformansVerileriniDogrula } from "../services/konuPerformansVerisiService.js";

dotenv.config({ path: new URL("../.env", import.meta.url) });

const arguman = (ad) => {
    const indeks = process.argv.indexOf(ad);
    return indeks >= 0 ? process.argv[indeks + 1] : "";
};

const kullaniciId = arguman("--kullanici");
const dersId = arguman("--ders");
const orneklemSiniri = 50;

const nedenleriSay = (kayitlar) => {
    const sayac = {};
    for (const kayit of kayitlar) {
        sayac[kayit.neden] = (sayac[kayit.neden] || 0) + 1;
    }
    return sayac;
};

const calistir = async () => {
    if (!mongoose.isValidObjectId(kullaniciId) || !mongoose.isValidObjectId(dersId)) {
        throw new Error("--kullanici ve --ders için geçerli MongoDB ObjectId gereklidir.");
    }
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error("MONGODB_URI ayarı eksik.");

    try {
        await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

        const [konuHaritasi, testler] = await Promise.all([
            KonuHaritasi.findOne({ kullaniciId, dersId })
                .select("kullaniciId dersId anaKonular gecmisKonular")
                .lean(),
            Test.find({ kullaniciId, dersId })
                .sort({ updatedAt: -1, _id: -1 })
                .limit(orneklemSiniri)
                .lean(),
        ]);

        const rapor = konuPerformansVerileriniDogrula({
            kullaniciId,
            dersId,
            konuHaritasi,
            testler,
        });

        console.log(JSON.stringify({
            raporTuru: "SORU_KONU_DENETIMI",
            saltOkunur: true,
            enFazlaIncelenenTest: orneklemSiniri,
            konuHaritasiVar: Boolean(konuHaritasi),
            ...rapor.ozet,
            dislamaNedenleri: nedenleriSay(rapor.dislananSorular),
            atlananTestNedenleri: nedenleriSay(rapor.atlananTestler),
        }, null, 2));
        // Gizlilik: Test/soru içeriği, cevaplar ve öğrenci kimlikleri yazdırılmaz.
    } finally {
        await mongoose.disconnect();
    }
};

calistir().catch((hata) => {
    console.error("Soru-konu denetimi başarısız:", hata.message);
    process.exitCode = 1;
});

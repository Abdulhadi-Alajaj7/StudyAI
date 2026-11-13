// Varsayılan: yalnızca MongoDB okuması ve yerel kaynak seçimi.
// --gemini: açık kullanıcı onayından sonra, en fazla 1 SDK çağrısı; DB yazımı yok.
// Backend dizininde: node scripts/calismaKartiSaltOkunurTani.js --ders-id=<kimlik>
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { kartKonulariniGetir, konuKartKaynaklariniSec } from "../services/calismaKartlariService.js";
import { geminiIleKartBatchiUret, getGeminiClient } from "../services/geminiService.js";
import { kartHataTanilamasiniOlustur } from "../utils/calismaKartiTanilama.js";
import { kartKavramPlaniniOlustur, kartBatchleriniPlanla, kartBatchAyarlari } from "../utils/calismaKartiPlanlama.js";

// Saf hazırlık: testte sentetik snapshot ile kullanılır; ağ/DB erişimi yapmaz.
export const ilkEksikKartBatchiniHazirla = ({ konular, parcalar, materyaller, deste }, ayar = kartBatchAyarlari()) => {
    const konu = konular.find(k => !deste?.konular?.find(eski => eski.konuId === k.konuId)?.tamamlandi);
    if (!konu) return null;
    const oncekiKartlar = (deste?.konular || []).flatMap(k => k.kartlar || []);
    const kaynaklar = konuKartKaynaklariniSec(konu, parcalar, materyaller).map(k => ({ ...k, anahtar: `${konu.konuId}:${k.anahtar}` }));
    const plan = kartKavramPlaniniOlustur(konu, kaynaklar, oncekiKartlar);
    const partiler = kartBatchleriniPlanla([{ konu, kaynaklar, kavramlar: plan.kavramlar }], { ...ayar, konu: 1 });
    return { konu, plan, parti: partiler[0] || [], oncekiKartlar };
};

const taniyiCalistir = async () => {
await import("dotenv/config");
const args = process.argv.slice(2);
const dersArg = args.find(a => a.startsWith("--ders-id="));
if (!dersArg || !/^[a-f\d]{24}$/i.test(dersArg.slice(10)) || args.some(a => a !== dersArg && a !== "--gemini")) {
    console.error("Kullanım: node scripts/calismaKartiSaltOkunurTani.js --ders-id=<24 karakter kimlik> [--gemini]");
    process.exitCode = 1;
} else {
    let c, sdkCagrisi = 0, konuId, asama = "KAYNAK_SECIMI";
    try {
        c = mongoose.createConnection(process.env.MONGODB_URI, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 8000 });
        await c.asPromise();
        // Raw koleksiyonlar: model init, index, transaction, güncelleme veya temizlik çalışmaz.
        const col = ad => c.db.collection(mongoose.pluralize()(ad));
        const opts = { maxTimeMS: 10_000 };
        const ders = await col("Ders").findOne({ _id: new mongoose.Types.ObjectId(dersArg.slice(10)) },
            { ...opts, projection: { kullaniciId: 1, materyallerOnaylandi: 1, temizleniyor: 1, hazirlamaDurumu: 1 } });
        if (!ders || !ders.materyallerOnaylandi || ders.temizleniyor) throw Object.assign(new Error(), { kod: "DERS_HAZIR_DEGIL" });
        const f = { dersId: ders._id, kullaniciId: ders.kullaniciId };
        const [harita, materyaller, deste] = await Promise.all([
            col("KonuHaritasi").findOne({ ...f, durum: "hazir", degisikliklereKilitli: true }, opts),
            col("Materyal").find({ ...f, durum: "hazir", aktifIslemeId: { $ne: null } },
                { ...opts, projection: { _id: 1, aktifIslemeId: 1 } }).sort({ _id: 1 }).toArray(),
            col("CalismaKartiDestesi").findOne(f, opts),
        ]);
        const konular = kartKonulariniGetir(harita, materyaller);
        if (!materyaller.length) throw Object.assign(new Error(), { kod: "KART_KAYNAK_YETERSIZ" });
        const parcalar = await col("MetinParcasi").find({ ...f,
            $or: materyaller.map(m => ({ materyalId: m._id, islemeId: m.aktifIslemeId })),
        }, { ...opts, projection: { materyalId: 1, islemeId: 1, parcaIndex: 1, icerik: 1 } })
            .sort({ materyalId: 1, parcaIndex: 1 }).toArray();
        const imza = createHash("sha256").update(JSON.stringify({ konular,
            surumler: materyaller.map(m => [String(m._id), String(m.aktifIslemeId)]).sort(),
        })).digest("hex");
        const hazirlik = ilkEksikKartBatchiniHazirla({ konular, parcalar, materyaller, deste });
        konuId = hazirlik?.konu.konuId;
        const kartSayisi = hazirlik?.parti.reduce((n, is) => n + is.kavramlar.length, 0) || 0;
        console.log(JSON.stringify({ saltOkunur: true,
            dersHazirlamaDurumu: ["bekliyor", "isleniyor", "hata", "tamamlandi"].includes(ders.hazirlamaDurumu) ? ders.hazirlamaDurumu : "bilinmiyor",
            hazirMateryal: materyaller.length, aktifParca: parcalar.length,
            konu: konular.length, ilkEksikKonununKavramSayisi: hazirlik?.plan.kavramlar.length || 0,
            kalanKavramSayisi: hazirlik?.plan.kavramlar.filter(k => !k.tamamlandi).length || 0,
            sifirKartNedeni: hazirlik?.plan.sifirKartNedeni || "", retrievalYontemi: "keyword",
            desteDurumu: deste?.durum || "yok", hataKodu: deste?.hataKodu || "", hataTanilamaVar: Boolean(deste?.hataTanilama),
            kaynakImzasiGuncel: !deste || deste.kaynakImzasi === imza, konuId, kartSayisi, sdkCagrisi }));
        if (args.includes("--gemini")) {
            if (deste?.aktifIslemToken || (deste && deste.kaynakImzasi !== imza) || !kartSayisi) {
                throw Object.assign(new Error(), { kod: "CANLI_TANI_UYGUN_DEGIL" });
            }
            asama = "GEMINI_ISTEGI";
            const istemci = getGeminiClient();
            const sonuc = await geminiIleKartBatchiUret({ isler: hazirlik.parti, oncekiKartlar: hazirlik.oncekiKartlar,
                apiCagriButcesi: { maksimum: 1, kullanilan: 0 } },
            { maxDeneme: 1, env: { ...process.env, GEMINI_MODEL_ROUTING_AKTIF: "false" }, istemci: { models: { generateContent: g => {
                if (sdkCagrisi >= 1) throw Object.assign(new Error(), { kod: "CANLI_TANI_CAGRI_SINIRI" });
                sdkCagrisi++; return istemci.models.generateContent(g);
            } } } });
            const kartlar = sonuc.sonuclar.flatMap(s => s.kartlar), reddedilenler = sonuc.sonuclar.flatMap(s => s.reddedilenler);
            console.log(JSON.stringify({ sonuc: !kartlar.length ? "dogrulanamadi" : kartlar.length < kartSayisi ? "kismi_dogrulandi" : "dogrulandi",
                kartSayisi: kartlar.length, reddedilenler, model: sonuc.tanilama.model, sdkCagrisi, embeddingCagrisi: 0, veritabaninaYazildi: false }));
            if (!kartlar.length) process.exitCode = 1;
        }
    } catch (hata) {
        // Ham SDK/Mongo hata metinleri URI, anahtar veya materyal içerebilir.
        const kod = ["DERS_HAZIR_DEGIL", "KART_KAYNAK_YETERSIZ", "KART_KANIT_YETERSIZ", "KART_ISLEM_CAGRI_SINIRI", "KART_KONU_HATASI", "KART_KAYNAK_BAGLANTISI_EKSIK",
            "CANLI_TANI_UYGUN_DEGIL", "CANLI_TANI_CAGRI_SINIRI", "KART_GECERSIZ_YANIT", "GEMINI_GECERSIZ_YANIT",
            "GEMINI_ZAMAN_ASIMI", "GEMINI_AG_HATASI", "GEMINI_GECICI_HATA", "GEMINI_GUNLUK_KOTA", "GEMINI_KOTA_ASIMI",
            "GEMINI_YAPILANDIRMA", "GEMINI_MODEL_BULUNAMADI", "GEMINI_GECERSIZ_ISTEK", "KART_BATCH_SINIRI",
            "GEMINI_YEREL_RPM", "GEMINI_YEREL_TPM", "GEMINI_YEREL_RPD", "GEMINI_YEREL_KOTA", "GEMINI_MODEL_KAPALI"].includes(hata?.kod) ? hata.kod : "TANI_TAMAMLANAMADI";
        console.error(JSON.stringify({ kod, ...kartHataTanilamasiniOlustur(hata, { asama, konuId }), sdkCagrisi, veritabaninaYazildi: false }));
        process.exitCode = 1;
    } finally { await c?.close(); }
}
};

// Import eden mock testi .env yüklemez ve komut satırı akışını başlatmaz.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await taniyiCalistir();

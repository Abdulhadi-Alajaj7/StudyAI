import mongoose from "mongoose";
import { createHash } from "node:crypto";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import CalismaKartiDestesi from "../models/CalismaKartiDestesi.js";
import KartCalismaDurumu from "../models/KartCalismaDurumu.js";
import KartDegerlendirmesi from "../models/KartDegerlendirmesi.js";
import { geminiIleCalismaKartlariUret, geminiIleKartBatchiUret, VARSAYILAN_GEMINI_MODELI } from "./geminiService.js";
import { semanticAramaYap } from "./semanticAramaService.js";
import { kartKavramPlaniniOlustur, kartBatchleriniPlanla, kartBatchAyarlari } from "../utils/calismaKartiPlanlama.js";
import { kartKelimeleri } from "../utils/calismaKartiDogrulama.js";
import { kartHataTanilamasiniOlustur } from "../utils/calismaKartiTanilama.js";

const KILIT_MS = 3 * 60_000;
const BUTCE_PENCERESI_MS = 24 * 60 * 60_000;
export const kartCagriSinirlariniGetir = (ayar = {}) => {
    const sinirla = (v, varsayilan, ust) => Number.isInteger(Number(v)) && Number(v) > 0 ? Math.min(ust, Number(v)) : varsayilan;
    return { islem: sinirla(ayar.islem ?? process.env.GEMINI_KART_ISLEM_CAGRI_BUTCESI, 4, 12),
        ders: sinirla(ayar.ders ?? process.env.GEMINI_KART_DERS_GUNLUK_CAGRI_BUTCESI, 48, 200) };
};
const cagriHakkiniAyir = (deste, deps) => {
    const sinir = kartCagriSinirlariniGetir(deps.cagriSinirlari);
    const baslangic = new Date(deste?.cagriPenceresiBaslangici || 0).getTime();
    const guncel = Boolean(deste?.cagriPenceresiBaslangici) && baslangic > deps.simdi().getTime() - BUTCE_PENCERESI_MS;
    const kullanilan = guncel ? (deste.ayrilanCagriSayisi || 0) : 0;
    const limit = Math.min(sinir.islem, sinir.ders - kullanilan);
    if (limit <= 0) throw new CalismaKartiHatasi("Bu dersin günlük kart üretim sınırına ulaşıldı. Kaydedilen kartlar korunuyor; daha sonra devam edebilirsiniz.", "KART_DERS_CAGRI_SINIRI", 429);
    return { cagriPenceresiBaslangici: guncel ? deste.cagriPenceresiBaslangici : deps.simdi(),
        ayrilanCagriSayisi: kullanilan + limit, aktifCagriLimiti: limit, sonIslemSdkCagrisi: 0 };
};
const kimlik = deger => String(deger ?? "");
const nesne = belge => belge?.toObject ? belge.toObject() : belge;
export class CalismaKartiHatasi extends Error {
    constructor(mesaj, kod = "KART_URETIM_HATASI", status = 409) {
        super(mesaj); this.name = "CalismaKartiHatasi"; this.kod = kod; this.status = status;
    }
}
const depsGetir = (d = {}) => ({
    DersModel: Ders, MateryalModel: Materyal, MetinParcasiModel: MetinParcasi,
    KonuHaritasiModel: KonuHaritasi, DesteModel: CalismaKartiDestesi,
    DurumModel: KartCalismaDurumu, DegerlendirmeModel: KartDegerlendirmesi,
    oturumBaslat: () => mongoose.startSession(), simdi: () => new Date(),
    kartUret: geminiIleCalismaKartlariUret, heartbeatMs: 30_000,
    semanticArama: semanticAramaYap,
    kartBatchUret: d.kartUret && !d.kartBatchUret ? async ({ isler, ...ortak }) => {
        const sonuclar = [];
        for (const is of isler) sonuclar.push({ konuId: is.konu.konuId, ...await d.kartUret({ ...ortak,
            konu: is.konu, kaynaklar: is.kaynaklar, kartSayisi: is.kavramlar.length }) });
        return { sonuclar };
    } : geminiIleKartBatchiUret,
    tanilamaLogla: veri => console.error("[CalismaKartlari]", veri),
    arkaPlandaBaslat: islem => { void islem().catch(() => {}); }, ...d,
});
const filtre = ({ kullaniciId, dersId }) => ({ kullaniciId, dersId });
const dersYok = () => new CalismaKartiHatasi("Ders bulunamadı veya bu ders için yetkiniz yok.", "DERS_BULUNAMADI", 404);

// Ders silme kilidiyle aynı belgeye yazılır; geç gelen checkpoint/durum kaydı yetim kalamaz.
const atomikDersIslemi = async (girdi, islem, deps) => {
    const session = await deps.oturumBaslat();
    let sonuc;
    try {
        await session.withTransaction(async () => {
            const ders = await deps.DersModel.findOneAndUpdate({
                _id: girdi.dersId, kullaniciId: girdi.kullaniciId, temizleniyor: { $ne: true },
            }, { $inc: { kartSurumu: 1 } }, { new: true, session });
            if (!ders) throw dersYok();
            sonuc = await islem(session);
        });
        return sonuc;
    } finally { await session.endSession(); }
};

export const kartKonulariniGetir = (harita, materyaller = []) => {
    // Tam ders haritalarında konu bazlı bağlantılar boş olabilir. Yalnızca haritanın
    // kayıtlı kaynak snapshot'ı ile aynı aktif sürümü taşıyan materyaller adaydır.
    const aktifSurumler = new Map(materyaller.filter(m => m.aktifIslemeId)
        .map(m => [kimlik(m._id), kimlik(m.aktifIslemeId)]));
    const haritaKaynakIds = [...new Set((harita?.kaynakMateryaller || [])
        .filter(k => k.materyalId && k.aktifIslemeId && aktifSurumler.get(kimlik(k.materyalId)) === kimlik(k.aktifIslemeId))
        .map(k => kimlik(k.materyalId)))];
    const sonuc = [], kimlikler = new Set();
    for (const ana of harita?.anaKonular || []) {
        const yapraklar = ana.altKonular?.length ? ana.altKonular : [ana];
        for (const konu of yapraklar) {
            if (!konu.konuId || kimlikler.has(konu.konuId)) throw new CalismaKartiHatasi("Konu haritasındaki konu kimlikleri doğrulanamadı.", "KART_KONU_HATASI", 422);
            kimlikler.add(konu.konuId);
            sonuc.push({
                konuId: konu.konuId, anaKonuId: ana.konuId, baslik: konu.baslik, anaBaslik: ana.baslik,
                aciklama: konu.aciklama || "",
                kaynakIds: (konu.kaynakMateryalIds?.length ? konu.kaynakMateryalIds
                    : ana.kaynakMateryalIds?.length ? ana.kaynakMateryalIds : haritaKaynakIds).map(kimlik).sort(),
            });
        }
    }
    if (!sonuc.length || sonuc.length > 120) throw new CalismaKartiHatasi("Kart üretimi için 1–120 konu içeren hazır bir konu haritası gerekli.", "KART_KONU_HATASI", 422);
    return sonuc;
};

const baglamiGetir = async (girdi, deps, session = null) => {
    const ders = await deps.DersModel.findOne({ _id: girdi.dersId, kullaniciId: girdi.kullaniciId, temizleniyor: { $ne: true } })
        .session(session).lean();
    if (!ders) throw dersYok();
    if (!ders.materyallerOnaylandi) throw new CalismaKartiHatasi("Önce dersinizin materyallerini onaylayıp hazırlamayı tamamlayın.", "KART_DERS_HAZIR_DEGIL", 422);
    const harita = await deps.KonuHaritasiModel.findOne({ ...filtre(girdi), durum: "hazir", degisikliklereKilitli: true }).session(session).lean();
    if (!harita) throw new CalismaKartiHatasi("Kartlar için onaylanmış ve hazır bir konu haritası gerekli.", "KART_HARITA_HAZIR_DEGIL", 422);
    const materyaller = await deps.MateryalModel.find({ ...filtre(girdi), durum: "hazir", aktifIslemeId: { $ne: null } })
        .select("_id aktifIslemeId dosyaAdi orijinalDosyaAdi").sort({ _id: 1 }).session(session).lean();
    const konular = kartKonulariniGetir(harita, materyaller);
    const imza = createHash("sha256").update(JSON.stringify({
        konular, surumler: materyaller.map(m => [kimlik(m._id), kimlik(m.aktifIslemeId)]).sort(),
    })).digest("hex");
    return { konular, materyaller, imza };
};
const imzayiDogrula = (deste, baglam) => {
    if (deste.kaynakImzasi !== baglam.imza) throw new CalismaKartiHatasi("Kaynaklar değiştiği için bu kart destesi güncel değil. Ders kaynaklarını kontrol edin.", "KART_KAYNAK_DEGISTI");
};

export const konuKartKaynaklariniSec = (konu, parcalar, materyaller, semanticSonuclar = []) => {
    if (!konu.kaynakIds.length) throw new CalismaKartiHatasi(
        "Konunun kaynak bağlantısı doğrulanamadı. Konu haritasının materyal ve sürüm bilgilerini kontrol edin.",
        "KART_KAYNAK_BAGLANTISI_EKSIK", 422
    );
    const kelimeler = kartKelimeleri(`${konu.baslik} ${konu.aciklama}`);
    const aktif = new Map(materyaller.map(m => [kimlik(m._id), kimlik(m.aktifIslemeId)]));
    const adaylar = parcalar.filter(p => konu.kaynakIds.includes(kimlik(p.materyalId)) &&
        aktif.get(kimlik(p.materyalId)) === kimlik(p.islemeId)).map(parca => {
        const metin = kartKelimeleri(parca.icerik);
        const skor = [...kelimeler].filter(k => [...metin].some(m => m === k || (Math.min(m.length, k.length) >= 5 && (m.startsWith(k) || k.startsWith(m))))).length;
        const semantic = semanticSonuclar.find(s => kimlik(s.metinParcasiId) === kimlik(parca._id) &&
            kimlik(s.materyalId) === kimlik(parca.materyalId) && kimlik(s.islemeId) === kimlik(parca.islemeId) && s.icerik === parca.icerik);
        return { parca, skor, birlesik: skor / Math.max(1, kelimeler.size) + (Number.isFinite(semantic?.skor) ? Math.max(0, semantic.skor) : 0) };
    }).filter(a => a.skor > 0).sort((a, b) => b.birlesik - a.birlesik || a.parca.parcaIndex - b.parca.parcaIndex);
    // Önce her materyalin en ilgili parçası, sonra ortak sıralama. Semantik skor
    // konu ilişkisini ve aktif kaynak denetimini aşamaz; özgün parça kesilmez.
    const secim = [], gorulen = new Set(), materyalGoruldu = new Set();
    for (const a of adaylar) if (!materyalGoruldu.has(kimlik(a.parca.materyalId))) {
        secim.push(a.parca); gorulen.add(a.parca); materyalGoruldu.add(kimlik(a.parca.materyalId));
    }
    for (const a of adaylar) if (!gorulen.has(a.parca)) secim.push(a.parca);
    let uzunluk = 0;
    const secilen = secim.filter(p => { if (uzunluk + p.icerik.length > 12_000) return false; uzunluk += p.icerik.length; return true; }).slice(0, 10);
    const harita = new Map(materyaller.map(m => [kimlik(m._id), m]));
    return secilen.map((p, i) => ({
        anahtar: `K${i + 1}`, materyalId: p.materyalId, islemeId: p.islemeId,
        metinParcasiId: p._id,
        parcaIndex: p.parcaIndex, icerik: p.icerik,
        dosyaAdi: harita.get(kimlik(p.materyalId))?.orijinalDosyaAdi || harita.get(kimlik(p.materyalId))?.dosyaAdi || "Materyal",
    }));
};
export const konuKartHybridKaynaklariniSec = async ({ girdi, konu, parcalar, materyaller, apiCagriButcesi, sahipligiDogrula }, deps) => {
    let sonuclar = [], retrievalYontemi = "keyword", retrievalHataKodu = "";
    if (process.env.GEMINI_KART_HYBRID_AKTIF !== "false") {
        try {
            const semantic = await deps.semanticArama({ ...girdi, materyalIds: konu.kaynakIds,
                sorgu: `${konu.baslik}. ${konu.aciklama || ""} Ana konu: ${konu.anaBaslik || ""}`,
                limit: 10, onbellekKullan: true, apiCagriButcesi, sahipligiDogrula });
            sonuclar = semantic.sonuclar;
            retrievalYontemi = sonuclar.length ? "hybrid" : "keyword";
        } catch (hata) {
            if (hata?.sahiplikHatasi || (hata?.kod && /KILIT|SAHIP|IPTAL|DERS_BULUNAMADI/.test(hata.kod))) throw hata;
            retrievalYontemi = "keyword_fallback";
            retrievalHataKodu = ["EMBEDDING_SERVIS_HATASI", "EMBEDDING_GUNLUK_LIMIT", "EMBEDDING_KOTA_ASIMI", "GEMINI_CAGRI_BUTCESI_ASILDI"].includes(hata?.kod) ? hata.kod : "KART_SEMANTIC_HATASI";
        }
    }
    return { kaynaklar: konuKartKaynaklariniSec(konu, parcalar, materyaller, sonuclar), retrievalYontemi, retrievalHataKodu };
};
const parcalariGetir = (girdi, baglam, deps) => deps.MetinParcasiModel.find({
    ...filtre(girdi), $or: baglam.materyaller.map(m => ({ materyalId: m._id, islemeId: m.aktifIslemeId })),
}).select("_id materyalId islemeId parcaIndex icerik").sort({ materyalId: 1, parcaIndex: 1 }).lean();

const kartlariGetir = deste => (deste?.konular || []).flatMap(k => k.kartlar || []);
const guvenliKod = kod => new Set([
    "GEMINI_YEREL_RPM", "GEMINI_YEREL_TPM", "GEMINI_YEREL_RPD", "GEMINI_YEREL_KOTA", "GEMINI_MODEL_KAPALI", "GEMINI_ISLEM_SURESI", "KART_BATCH_SINIRI",
    "KART_GECERSIZ_YANIT", "KART_KAYIT_HATASI", "KART_KANIT_YETERSIZ", "KART_ISLEM_CAGRI_SINIRI", "KART_DERS_CAGRI_SINIRI", "KART_KAYNAK_YETERSIZ", "KART_KAYNAK_BAGLANTISI_EKSIK", "KART_KAYNAK_DEGISTI", "KART_KILIT_KAYBI",
    "GEMINI_GECICI_HATA", "GEMINI_KOTA_ASIMI", "GEMINI_GUNLUK_KOTA", "GEMINI_ZAMAN_ASIMI",
    "GEMINI_AG_HATASI", "GEMINI_GECERSIZ_YANIT", "GEMINI_ISTEK_YOGUNLUGU", "GEMINI_YAPILANDIRMA",
    "GEMINI_MODEL_BULUNAMADI", "GEMINI_GECERSIZ_ISTEK", "GEMINI_ISTEK_BOYUTU",
]).has(kod) ? kod : "KART_URETIM_HATASI";
const tanilamayiLogla = (deps, veri) => {
    try { deps.tanilamaLogla(veri); } catch { /* Tanılama üretim ve hata kaydını engellemez. */ }
};

const eskiKilidiKapat = async (girdi, deste, deps) => {
    if (!deste?.aktifIslemToken || new Date(deste.sonYenileme || 0).getTime() > deps.simdi().getTime() - KILIT_MS) return deste;
    await deps.DesteModel.updateOne({ ...filtre(girdi), _id: deste._id, aktifIslemToken: deste.aktifIslemToken,
        sonYenileme: deste.sonYenileme }, { $set: {
        aktifIslemToken: null, durum: kartlariGetir(deste).length ? "kismi" : "hata", hataKodu: "KART_ISLEM_KESILDI",
    } });
    return deps.DesteModel.findOne(filtre(girdi)).lean();
};

export const kartDestesiniSun = (deste, durumlar = []) => {
    const durumHaritasi = new Map(durumlar.map(d => [kimlik(d.kartId), d]));
    const kartlar = kartlariGetir(deste).map(k => ({
        ...nesne(k), _id: kimlik(k._id),
        goruldu: Boolean(durumHaritasi.get(kimlik(k._id))?.gorulduTarihi),
        yildizli: Boolean(durumHaritasi.get(kimlik(k._id))?.yildizli),
    }));
    const gorulen = kartlar.filter(k => k.goruldu).length;
    return {
        durum: deste?.durum || "yok", desteId: deste ? kimlik(deste._id) : null,
        olusturulabilir: true, hataKodu: deste?.hataKodu || "", kartlar,
        ilerleme: { tamamlananKonu: deste?.konular.filter(k => k.tamamlandi).length || 0, toplamKonu: deste?.konular.length || 0 },
        istatistikler: { toplam: kartlar.length, gorulen, gorulmeyen: kartlar.length - gorulen, yildizli: kartlar.filter(k => k.yildizli).length },
        konular: (deste?.konular || []).map(k => ({ konuId: k.konuId, anaKonuId: k.anaKonuId, baslik: k.baslik, anaBaslik: k.anaBaslik,
            tamamlandi: k.tamamlandi, kartSayisi: k.kartlar.length, eksikKartSayisi: Math.max(0, k.hedefKartSayisi - k.kartlar.length), hataKodu: k.hataKodu || "",
            kavramSayisi: k.kavramSayisi, sifirKartNedeni: k.sifirKartNedeni || "", retrievalYontemi: k.retrievalYontemi || "keyword" })),
    };
};
const sun = async (girdi, deste, deps) => kartDestesiniSun(deste, deste ? await deps.DurumModel.find({ ...filtre(girdi), desteId: deste._id }).lean() : []);

export const calismaKartlariniGetir = async (girdi, bagimliliklar = {}) => {
    const deps = depsGetir(bagimliliklar);
    const deste = await deps.DesteModel.findOne(filtre(girdi)).lean();
    let baglam;
    try { baglam = await baglamiGetir(girdi, deps); }
    catch (hata) {
        if (!deste && hata instanceof CalismaKartiHatasi && hata.status === 422) return { ...kartDestesiniSun(null), olusturulabilir: false, engelMesaji: hata.message };
        throw hata;
    }
    if (deste && deste.kaynakImzasi !== baglam.imza) return { ...await sun(girdi, deste, deps),
        olusturulabilir: false, kaynakGuncel: false, durum: deste.durum === "olusturuluyor" ? "kismi" : deste.durum,
        hataKodu: "KART_KAYNAK_DEGISTI", engelMesaji: "Ders kaynakları değişti. Önceki kartlar ve çalışma kayıtları korunuyor; kaynaklar kontrol edilene kadar bu deste salt okunurdur." };
    return sun(girdi, await eskiKilidiKapat(girdi, deste, deps), deps);
};

const desteyiUret = async (girdi, ilkDeste, token, deps) => {
    let yenileme = null, kilitHatasi = null;
    let asama = "KAYNAK_SECIMI", konuId, sonHataKodu = "", sonTanilama = null;
    const konular = ilkDeste.konular.map(k => ({ ...k, kartlar: [...k.kartlar] }));
    const oncekiKartlar = kartlariGetir(ilkDeste);
    const apiCagriButcesi = { kullanilan: 0, maksimum: ilkDeste.aktifCagriLimiti };
    const butceSonucu = () => ({
        ayrilanCagriSayisi: Math.max(0, ilkDeste.ayrilanCagriSayisi - (apiCagriButcesi.maksimum - apiCagriButcesi.kullanilan)),
        aktifCagriLimiti: 0, sonIslemSdkCagrisi: apiCagriButcesi.kullanilan,
    });
    const logla = veri => tanilamayiLogla(deps, veri);
    const yenile = () => {
        if (kilitHatasi) return Promise.reject(kilitHatasi);
        if (yenileme) return yenileme;
        yenileme = deps.DesteModel.updateOne({ ...filtre(girdi), _id: ilkDeste._id, aktifIslemToken: token },
            { $currentDate: { sonYenileme: true } }, { timestamps: false })
            .then(s => { if (s.matchedCount !== 1) throw new CalismaKartiHatasi("Kart üretim işleminin sahipliği değişti.", "KART_KILIT_KAYBI"); })
            .catch(hata => { kilitHatasi = hata; throw hata; }).finally(() => { yenileme = null; });
        return yenileme;
    };
    const kaydetKonu = async (konu, alanlar) => {
        asama = "VERITABANI_KAYDI";
        await atomikDersIslemi(girdi, async session => {
            imzayiDogrula(ilkDeste, await baglamiGetir(girdi, deps, session));
            const set = Object.fromEntries(Object.entries(alanlar).map(([k, v]) => [`konular.$.${k}`, v]));
            const kayit = await deps.DesteModel.findOneAndUpdate({ ...filtre(girdi), _id: ilkDeste._id,
                aktifIslemToken: token, "konular.konuId": konu.konuId }, { $set: set }, { new: true, session, runValidators: true });
            if (!kayit) throw new CalismaKartiHatasi("Kart üretim işleminin sahipliği değişti.", "KART_KILIT_KAYBI");
        }, deps);
        // Yalnızca kalıcı checkpoint başarılıysa yerel plan ilerler.
        Object.assign(konu, alanlar);
    };
    const timer = setInterval(() => { void yenile().catch(() => {}); }, deps.heartbeatMs);
    timer.unref?.();
    try {
        const baglam = await baglamiGetir(girdi, deps);
        imzayiDogrula(ilkDeste, baglam);
        if (!baglam.materyaller.length) throw new CalismaKartiHatasi("Kart üretmek için hazır materyal bulunamadı.", "KART_KAYNAK_YETERSIZ", 422);
        const parcalar = await parcalariGetir(girdi, baglam, deps);
        // Hiç denenmemiş konular, sürekli başarısız bir konunun arkasında kalmaz.
        const bekleyenler = konular.filter(k => !k.tamamlandi).sort((a, b) => (a.denemeSayisi || 0) - (b.denemeSayisi || 0));
        const isler = [];
        // Sorgu embedding'leri de aynı gerçek SDK bütçesinden düşer; üretime bir
        // deneme bırakılır. Cache/keyword için bir sağlayıcı çağrısı yapılmaz.
        const retrievalButcesi = { maksimum: Math.max(0, apiCagriButcesi.maksimum - 1),
            get kullanilan() { return apiCagriButcesi.kullanilan; },
            set kullanilan(v) { apiCagriButcesi.kullanilan = v; } };
        let semanticDurdu = false;
        for (const konu of bekleyenler) {
            konuId = konu.konuId; asama = "KAYNAK_SECIMI";
            await yenile();
            try {
                const kaynakKonusu = baglam.konular.find(k => k.konuId === konu.konuId);
                const retrieval = await konuKartHybridKaynaklariniSec({ girdi, konu: kaynakKonusu, parcalar,
                    materyaller: baglam.materyaller, apiCagriButcesi: retrievalButcesi, sahipligiDogrula: yenile },
                    semanticDurdu ? { ...deps, semanticArama: async () => { throw Object.assign(new Error("Bekleme"), { kod: "KART_SEMANTIC_HATASI" }); } } : deps);
                if (retrieval.retrievalYontemi === "keyword_fallback") semanticDurdu = true;
                const kaynaklar = retrieval.kaynaklar.map(k => ({ ...k, anahtar: `${konu.konuId}:${k.anahtar}` }));
                const plan = kartKavramPlaniniOlustur(kaynakKonusu, kaynaklar, oncekiKartlar);
                const eksik = plan.kavramlar.filter(k => !k.tamamlandi);
                if (["kaynak_yok", "kanit_yetersiz"].includes(plan.sifirKartNedeni)) {
                    await kaydetKonu(konu, { sifirKartNedeni: plan.sifirKartNedeni, retrievalYontemi: retrieval.retrievalYontemi, retrievalHataKodu: retrieval.retrievalHataKodu });
                    throw new CalismaKartiHatasi("Bu konu için doğrulanabilir kaynak kanıtı bulunamadı.", plan.sifirKartNedeni === "kaynak_yok" ? "KART_KAYNAK_YETERSIZ" : "KART_KANIT_YETERSIZ", 422);
                }
                await kaydetKonu(konu, { hedefKartSayisi: konu.kartlar.length + eksik.length, kavramSayisi: plan.kavramlar.length,
                    sifirKartNedeni: plan.sifirKartNedeni || (!konu.kartlar.length && !eksik.length ? "kavramlar_zaten_kapsandi" : ""),
                    tamamlandi: !eksik.length, planSurumu: 2, hataKodu: "", retrievalYontemi: retrieval.retrievalYontemi, retrievalHataKodu: retrieval.retrievalHataKodu });
                if (eksik.length) isler.push({ konu: { ...kaynakKonusu, ...konu }, kaynaklar, kavramlar: eksik });
            } catch (hata) {
                if (!["KART_KAYNAK_YETERSIZ", "KART_KANIT_YETERSIZ", "KART_KAYNAK_BAGLANTISI_EKSIK"].includes(hata?.kod)) throw hata;
                const tani = kartHataTanilamasiniOlustur(hata, { asama: "KAYNAK_SECIMI", konuId });
                sonHataKodu = hata.kod; sonTanilama = tani;
                await kaydetKonu(konu, { hataKodu: hata.kod, tamamlandi: false, reddedilenKartlar: [tani],
                    denemeSayisi: (konu.denemeSayisi || 0) + 1 });
            }
        }
        const ayar = { ...kartBatchAyarlari(), ...(deps.batchAyarlari || {}) };
        const partiler = kartBatchleriniPlanla(isler, ayar);
        for (const isler of partiler) {
            if (apiCagriButcesi.kullanilan >= apiCagriButcesi.maksimum) {
                sonHataKodu = "KART_ISLEM_CAGRI_SINIRI"; sonTanilama = null; break;
            }
            await yenile(); asama = "GEMINI_ISTEGI"; konuId = isler[0].konu.konuId;
            const ilkSdkSayisi = apiCagriButcesi.kullanilan;
            const sdkSayilari = konu => ({ sdkCagriSayisi: (konu.sdkCagriSayisi || 0) + apiCagriButcesi.kullanilan - ilkSdkSayisi,
                sonDenemeSdkCagrisi: apiCagriButcesi.kullanilan - ilkSdkSayisi });
            let batch;
            try {
                batch = await deps.kartBatchUret({ isler, oncekiKartlar, apiCagriButcesi, sahipligiDogrula: yenile });
                await yenile();
            } catch (hata) {
                if (hata?.kod === "KART_KILIT_KAYBI") throw hata;
                for (const is of isler) {
                    const konu = konular.find(k => k.konuId === is.konu.konuId);
                    const tani = kartHataTanilamasiniOlustur(hata, { asama: "GEMINI_ISTEGI", konuId: konu.konuId });
                    await kaydetKonu(konu, { hataKodu: guvenliKod(hata?.kod), sifirKartNedeni: konu.kartlar.length ? "" : "uretim_basarisiz",
                        denemeSayisi: (konu.denemeSayisi || 0) + 1, reddedilenKartlar: [tani], ...sdkSayilari(konu) });
                }
                asama = "GEMINI_ISTEGI"; throw hata;
            }
            for (const is of isler) {
                const konu = konular.find(k => k.konuId === is.konu.konuId);
                konuId = konu.konuId;
                const parti = batch.sonuclar.find(p => p.konuId === konuId) || { kartlar: [], reddedilenler: [{ dogrulamaAltKodu: "KART_SAYISI" }] };
                const yeniKartlar = parti.kartlar.map(k => ({ ...k, _id: new mongoose.Types.ObjectId() }));
                const kartlar = [...konu.kartlar, ...yeniKartlar];
                const tamamlandi = kartlar.length >= konu.hedefKartSayisi;
                const reddedilenKartlar = parti.reddedilenler.map(r => kartHataTanilamasiniOlustur({ tanilama: {
                    ...parti.tanilama, ...r, asama: "KART_DOGRULAMA",
                } }, { konuId }));
                for (const tani of reddedilenKartlar) logla({ kod: "KART_GECERSIZ_YANIT", ...tani });
                const hataKodu = tamamlandi || !reddedilenKartlar.length ? "" : "KART_GECERSIZ_YANIT";
                await kaydetKonu(konu, { kartlar, tamamlandi, hataKodu,
                    sifirKartNedeni: !kartlar.length && reddedilenKartlar.length ? "dogrulama_basarisiz" : "",
                    ...(parti.tanilama?.model ? { kullanilanModel: parti.tanilama.model } : {}),
                    denemeSayisi: (konu.denemeSayisi || 0) + 1, reddedilenKartlar, ...sdkSayilari(konu) });
                oncekiKartlar.push(...yeniKartlar);
                if (hataKodu) { sonHataKodu = hataKodu; sonTanilama = reddedilenKartlar[0] || null; }
            }
        }
        await yenile(); clearInterval(timer); if (yenileme) await yenileme;
        asama = "VERITABANI_KAYDI";
        const hazir = konular.every(k => k.tamamlandi);
        await atomikDersIslemi(girdi, async session => {
            imzayiDogrula(ilkDeste, await baglamiGetir(girdi, deps, session));
            const sonuc = await deps.DesteModel.updateOne({ ...filtre(girdi), _id: ilkDeste._id, aktifIslemToken: token }, { $set: {
                durum: hazir ? "hazir" : oncekiKartlar.length ? "kismi" : "hata", aktifIslemToken: null,
                hataKodu: hazir ? "" : sonHataKodu, hataTanilama: hazir ? null : sonTanilama, ...butceSonucu(),
            } }, { session });
            if (sonuc.matchedCount !== 1) throw new CalismaKartiHatasi("Kart üretim işleminin sahipliği değişti.", "KART_KILIT_KAYBI");
        }, deps);
    } catch (hata) {
        const hataTanilama = kartHataTanilamasiniOlustur(hata, { asama, konuId });
        let hataKodu = guvenliKod(hata?.kod);
        if (hataKodu === "KART_URETIM_HATASI" && asama === "VERITABANI_KAYDI") hataKodu = "KART_KAYIT_HATASI";
        logla({ kod: hataKodu, ...hataTanilama });
        await deps.DesteModel.updateOne({ ...filtre(girdi), _id: ilkDeste._id, aktifIslemToken: token }, { $set: {
            durum: oncekiKartlar.length ? "kismi" : "hata", aktifIslemToken: null, hataKodu, hataTanilama, ...butceSonucu(),
        } }).catch(() => logla({ kod: "KART_KAYIT_HATASI", asama: "VERITABANI_KAYDI" }));
    } finally { clearInterval(timer); if (yenileme) await yenileme.catch(() => {}); }
};

export const calismaKartlariniOlustur = async (girdi, bagimliliklar = {}) => {
    const deps = depsGetir(bagimliliklar);
    const baglam = await baglamiGetir(girdi, deps);
    let mevcut = await deps.DesteModel.findOne(filtre(girdi)).lean();
    if (mevcut) imzayiDogrula(mevcut, baglam);
    if (mevcut?.durum === "hazir" || (mevcut?.aktifIslemToken && new Date(mevcut.sonYenileme).getTime() > deps.simdi().getTime() - KILIT_MS)) return sun(girdi, mevcut, deps);
    let plan = null;
    if (!mevcut) {
        if (!baglam.materyaller.length) throw new CalismaKartiHatasi("Kart üretmek için hazır materyal bulunamadı.", "KART_KAYNAK_YETERSIZ", 422);
        plan = baglam.konular.map(konu => ({ konuId: konu.konuId, anaKonuId: konu.anaKonuId, baslik: konu.baslik,
            anaBaslik: konu.anaBaslik, hedefKartSayisi: 0, tamamlandi: false, kartlar: [] }));
    }
    const token = new mongoose.Types.ObjectId();
    let baslat = false;
    try {
        mevcut = await atomikDersIslemi(girdi, async session => {
            baslat = false;
            const kayit = await deps.DesteModel.findOne(filtre(girdi)).session(session).lean();
            if (kayit) {
                imzayiDogrula(kayit, baglam);
                if (kayit.durum === "hazir" || (kayit.aktifIslemToken && new Date(kayit.sonYenileme).getTime() > deps.simdi().getTime() - KILIT_MS)) return kayit;
                baslat = true;
                return nesne(await deps.DesteModel.findOneAndUpdate({ ...filtre(girdi), _id: kayit._id, aktifIslemToken: kayit.aktifIslemToken },
                    { $set: { durum: "olusturuluyor", aktifIslemToken: token, sonYenileme: deps.simdi(), hataKodu: "", hataTanilama: null, ...cagriHakkiniAyir(kayit, deps) } }, { new: true, session }));
            }
            baslat = true;
            const [yeni] = await deps.DesteModel.create([{ ...filtre(girdi), kaynakImzasi: baglam.imza, konular: plan,
                durum: "olusturuluyor", aktifIslemToken: token, sonYenileme: deps.simdi(), ...cagriHakkiniAyir(null, deps), kullanilanModel: process.env.GEMINI_KART_MODELI || VARSAYILAN_GEMINI_MODELI }], { session });
            return nesne(yeni);
        }, deps);
    } catch (hata) {
        if (hata?.code !== 11000) throw hata;
        baslat = false;
        mevcut = await deps.DesteModel.findOne(filtre(girdi)).lean();
        if (!mevcut) throw hata;
        imzayiDogrula(mevcut, baglam);
    }
    if (baslat) deps.arkaPlandaBaslat(() => desteyiUret(girdi, mevcut, token, deps));
    return sun(girdi, mevcut, deps);
};

const kartiDogrula = async (girdi, deps, session) => {
    const deste = await deps.DesteModel.findOne(filtre(girdi)).session(session).lean();
    const kart = kartlariGetir(deste).find(k => kimlik(k._id) === kimlik(girdi.kartId));
    if (!deste || !kart) throw new CalismaKartiHatasi("Çalışma kartı bulunamadı.", "KART_BULUNAMADI", 404);
    imzayiDogrula(deste, await baglamiGetir(girdi, deps, session));
    return { deste, kart };
};

export const kartDurumunuGuncelle = async (girdi, bagimliliklar = {}) => {
    const deps = depsGetir(bagimliliklar);
    if (girdi.goruldu !== true && typeof girdi.yildizli !== "boolean") throw new CalismaKartiHatasi("Geçersiz kart durumu.", "KART_GECERSIZ_GIRDI", 400);
    return atomikDersIslemi(girdi, async session => {
        const { deste } = await kartiDogrula(girdi, deps, session);
        const hedef = { ...filtre(girdi), desteId: deste._id, kartId: girdi.kartId };
        // İlk görülme tarihi idempotenttir; yıldızın kaldırılması tarihi silmez.
        const mevcut = await deps.DurumModel.findOne(hedef).session(session).lean();
        if (girdi.goruldu === true && !mevcut?.gorulduTarihi) await deps.DurumModel.updateOne(hedef,
            { $setOnInsert: { ...hedef }, $set: { gorulduTarihi: deps.simdi() } }, { upsert: true, session, runValidators: true });
        if (typeof girdi.yildizli === "boolean") await deps.DurumModel.updateOne(hedef,
            { $setOnInsert: { ...hedef }, $set: { yildizli: girdi.yildizli } }, { upsert: true, session, runValidators: true });
        return nesne(await deps.DurumModel.findOne(hedef).session(session).lean());
    }, deps);
};

export const kartiDegerlendir = async (girdi, bagimliliklar = {}) => {
    const deps = depsGetir(bagimliliklar);
    if (!["tekrar", "zor", "orta", "kolay"].includes(girdi.degerlendirme) || !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(girdi.istemciIstekId || "")) throw new CalismaKartiHatasi("Geçersiz kart değerlendirmesi.", "KART_GECERSIZ_GIRDI", 400);
    return atomikDersIslemi(girdi, async session => {
        const { deste } = await kartiDogrula(girdi, deps, session);
        const eski = await deps.DegerlendirmeModel.findOne({ kullaniciId: girdi.kullaniciId, istemciIstekId: girdi.istemciIstekId }).session(session).lean();
        if (eski) {
            if (kimlik(eski.kartId) !== kimlik(girdi.kartId) || kimlik(eski.dersId) !== kimlik(girdi.dersId) || eski.degerlendirme !== girdi.degerlendirme) throw new CalismaKartiHatasi("Bu istek kimliği farklı bir değerlendirmede kullanılmış.", "KART_ISTEK_CAKISMASI");
            return eski;
        }
        const hedef = { ...filtre(girdi), desteId: deste._id, kartId: girdi.kartId };
        const durum = await deps.DurumModel.findOne(hedef).session(session).lean();
        if (!durum?.gorulduTarihi) throw new CalismaKartiHatasi("Değerlendirmeden önce kartın cevabını açın.", "KART_ONCE_CEVABI_AC");
        const [kayit] = await deps.DegerlendirmeModel.create([{ ...hedef, istemciIstekId: girdi.istemciIstekId, degerlendirme: girdi.degerlendirme, zaman: deps.simdi() }], { session });
        return nesne(kayit);
    }, deps);
};

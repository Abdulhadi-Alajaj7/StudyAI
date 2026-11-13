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
import { kartKavramPlaniniOlustur, kartKaynakBatchleriniPlanla, kartKaynakAnahtari, kartBatchAyarlari } from "../utils/calismaKartiPlanlama.js";
import { geminiGunSonunaKalanMs } from "../utils/geminiOrtakIstekYonetimi.js";
import { kartKelimeleri } from "../utils/calismaKartiDogrulama.js";
import { kartHataTanilamasiniOlustur } from "../utils/calismaKartiTanilama.js";

const KILIT_MS = 3 * 60_000;
const BUTCE_PENCERESI_MS = 24 * 60 * 60_000;
export const kartCagriSinirlariniGetir = (ayar = {}) => {
    const sinirla = (v, varsayilan, ust) => Number.isInteger(Number(v)) && Number(v) > 0 ? Math.min(ust, Number(v)) : varsayilan;
    const ders = sinirla(ayar.ders ?? process.env.GEMINI_KART_DERS_GUNLUK_CAGRI_BUTCESI, 48, 200);
    return { islem: sinirla(ayar.islem ?? process.env.GEMINI_KART_ISLEM_CAGRI_BUTCESI, 4, 12), ders,
        toplam: sinirla(ayar.toplam ?? process.env.GEMINI_KART_TOPLAM_CAGRI_BUTCESI, ders, 200) };
};
const cagriHakkiniAyir = (deste, deps) => {
    const sinir = kartCagriSinirlariniGetir(deps.cagriSinirlari);
    const baslangic = new Date(deste?.cagriPenceresiBaslangici || 0).getTime();
    const guncel = Boolean(deste?.cagriPenceresiBaslangici) && baslangic > deps.simdi().getTime() - BUTCE_PENCERESI_MS;
    const kullanilan = guncel ? (deste.ayrilanCagriSayisi || 0) : 0;
    const is = deste?.uretimIsi || { protokolSurumu: 3, toplamCagriLimiti: sinir.toplam, ayrilanToplamCagri: 0,
        gercekSdkCagrisi: 0, geciciHataSayisi: 0, ilerlemesizTurSayisi: 0, baslangic: deps.simdi() };
    const toplamKalan = is.toplamCagriLimiti - is.ayrilanToplamCagri;
    if (toplamKalan <= 0) throw new CalismaKartiHatasi("Onaylı toplam kart üretim sınırına ulaşıldı. Kaydedilen kartlar korunuyor.", "KART_TOPLAM_CAGRI_SINIRI", 429);
    const limit = Math.min(sinir.islem, sinir.ders - kullanilan, toplamKalan);
    if (limit <= 0) throw new CalismaKartiHatasi("Bu dersin günlük kart üretim sınırına ulaşıldı. Kaydedilen kartlar korunuyor; daha sonra devam edebilirsiniz.", "KART_DERS_CAGRI_SINIRI", 429);
    return { cagriPenceresiBaslangici: guncel ? deste.cagriPenceresiBaslangici : deps.simdi(),
        ayrilanCagriSayisi: kullanilan + limit, aktifCagriLimiti: limit, sonIslemSdkCagrisi: 0,
        uretimIsi: { ...is, durum: "calisiyor", sonrakiDeneme: deps.simdi(), beklemeNedeni: "", ayrilanToplamCagri: is.ayrilanToplamCagri + limit } };
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
            konu: is.konu, kaynaklar: is.kaynaklar, kartSayisi: kartKavramPlaniniOlustur(is.konu, is.kaynaklar, ortak.oncekiKartlar).kavramlar.filter(k => !k.tamamlandi).length }), kaynaklarTamamlandi: true });
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
        return { parca, skor, semanticSkor: semantic?.skor || 0, birlesik: skor / Math.max(1, kelimeler.size) + (Number.isFinite(semantic?.skor) ? Math.max(0, semantic.skor) : 0) };
    }).filter(a => a.skor > 0 || a.semanticSkor >= 0.65).sort((a, b) => b.birlesik - a.birlesik || a.parca.parcaIndex - b.parca.parcaIndex);
    // Önce her materyalin en ilgili parçası, sonra ortak sıralama. Güçlü semantik
    // eşleşme kelime örtüşmesi gerektirmez; aktif kaynak denetimi hep uygulanır.
    const secim = [], gorulen = new Set(), materyalGoruldu = new Set();
    for (const a of adaylar) if (!materyalGoruldu.has(kimlik(a.parca.materyalId))) {
        secim.push(a.parca); gorulen.add(a.parca); materyalGoruldu.add(kimlik(a.parca.materyalId));
    }
    for (const a of adaylar) if (!gorulen.has(a.parca)) secim.push(a.parca);
    let uzunluk = 0;
    const secilen = secim.filter(p => { if (uzunluk + p.icerik.length > 12_000) return false; uzunluk += p.icerik.length; return true; }).slice(0, 10);
    return kaynaklariSun(secilen, materyaller);
};
const kaynaklariSun = (parcalar, materyaller) => {
    const harita = new Map(materyaller.map(m => [kimlik(m._id), m]));
    return parcalar.map((p, i) => ({
        anahtar: `K${i + 1}`, materyalId: p.materyalId, islemeId: p.islemeId,
        kullaniciId: p.kullaniciId, dersId: p.dersId,
        metinParcasiId: p._id,
        parcaIndex: p.parcaIndex, icerik: p.icerik,
        dosyaAdi: harita.get(kimlik(p.materyalId))?.orijinalDosyaAdi || harita.get(kimlik(p.materyalId))?.dosyaAdi || "Materyal",
    }));
};
export const konuKartHybridKaynaklariniSec = async ({ girdi, konu, parcalar, materyaller, apiCagriButcesi, sahipligiDogrula }, deps) => {
    let sonuclar = [], retrievalYontemi = "keyword", retrievalHataKodu = "", retrievalHatasi = null;
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
            const kod = { EMBEDDING_SERVIS_HATASI: "GEMINI_GECICI_HATA", EMBEDDING_GUNLUK_LIMIT: "GEMINI_GUNLUK_KOTA",
                EMBEDDING_KOTA_ASIMI: "GEMINI_KOTA_ASIMI", EMBEDDING_YETKISIZ: "GEMINI_YAPILANDIRMA",
                EMBEDDING_MODEL_BULUNAMADI: "GEMINI_MODEL_BULUNAMADI", GEMINI_503: "GEMINI_GECICI_HATA" }[hata?.kod] || guvenliKod(hata?.kod);
            retrievalHataKodu = ["EMBEDDING_SERVIS_HATASI", "EMBEDDING_GUNLUK_LIMIT", "EMBEDDING_KOTA_ASIMI", "EMBEDDING_YETKISIZ", "EMBEDDING_MODEL_BULUNAMADI", "GEMINI_CAGRI_BUTCESI_ASILDI"].includes(hata?.kod)
                ? hata.kod : kod === "KART_URETIM_HATASI" ? "KART_SEMANTIC_HATASI" : kod;
            retrievalHatasi = { kod: kod === "KART_URETIM_HATASI" ? "GEMINI_GECICI_HATA" : kod,
                retryAfterMs: Number.isFinite(hata.retryAfterMs) ? hata.retryAfterMs : 0 };
        }
    }
    return { kaynaklar: konuKartKaynaklariniSec(konu, parcalar, materyaller, sonuclar), retrievalYontemi, retrievalHataKodu, retrievalHatasi };
};
const parcalariGetir = (girdi, baglam, deps) => deps.MetinParcasiModel.find({
    ...filtre(girdi), $or: baglam.materyaller.map(m => ({ materyalId: m._id, islemeId: m.aktifIslemeId })),
}).select("_id kullaniciId dersId materyalId islemeId parcaIndex icerik").sort({ materyalId: 1, parcaIndex: 1 }).lean();

const kartlariGetir = deste => (deste?.konular || []).flatMap(k => k.kartlar || []);
const guvenliKod = kod => new Set([
    "KART_TOPLAM_CAGRI_SINIRI", "KART_ILERLEME_YOK",
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
    // Kalıcı işler GET ile kapatılmaz; zamanlayıcı lease süresi dolunca devralır.
    if (deste?.uretimIsi) return deste;
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
        olusturulabilir: deste?.hataKodu !== "KART_TOPLAM_CAGRI_SINIRI", hataKodu: deste?.hataKodu || "", kartlar,
        uretimIsi: deste?.uretimIsi ? { durum: deste.uretimIsi.durum, sonrakiDeneme: deste.uretimIsi.sonrakiDeneme,
            beklemeNedeni: deste.uretimIsi.beklemeNedeni } : null,
        ilerleme: { tamamlananKonu: deste?.konular.filter(k => k.tamamlandi).length || 0, toplamKonu: deste?.konular.length || 0 },
        istatistikler: { toplam: kartlar.length, gorulen, gorulmeyen: kartlar.length - gorulen, yildizli: kartlar.filter(k => k.yildizli).length },
        konular: (deste?.konular || []).map(k => ({ konuId: k.konuId, anaKonuId: k.anaKonuId, baslik: k.baslik, anaBaslik: k.anaBaslik,
            tamamlandi: k.tamamlandi, kartSayisi: k.kartlar.length, eksikKartSayisi: k.planSurumu === 3 && !k.tamamlandi ? null : Math.max(0, k.hedefKartSayisi - k.kartlar.length), hataKodu: k.hataKodu || "",
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

export const kartIsiBeklemesiniGetir = (hata, simdi, hataSayisi = 0) => {
    const kod = hata?.kod;
    if (["GEMINI_GUNLUK_KOTA", "GEMINI_YEREL_RPD"].includes(kod)) return Math.max(geminiGunSonunaKalanMs(simdi), hata.retryAfterMs || 0) + 1000;
    if (["GEMINI_YEREL_RPM", "GEMINI_YEREL_TPM", "GEMINI_YEREL_KOTA", "GEMINI_KOTA_ASIMI", "GEMINI_429", "GEMINI_ISTEK_YOGUNLUGU"].includes(kod)) {
        return Math.max(10_000, hata.retryAfterMs || hata.tanilama?.retryAfterMs || 60_000);
    }
    if (hataSayisi < 3 && ["GEMINI_GECICI_HATA", "GEMINI_503", "GEMINI_SUNUCU_HATASI", "GEMINI_AG_HATASI", "GEMINI_ZAMAN_ASIMI", "KART_KAYIT_HATASI"].includes(kod)) {
        return Math.max(hata.retryAfterMs || 0, 60_000 * 2 ** hataSayisi);
    }
    return null;
};

const desteyiUret = async (girdi, ilkDeste, token, deps) => {
    let yenileme = null, kilitHatasi = null, asama = "KAYNAK_SECIMI", konuId, ilerledi = false;
    const konular = ilkDeste.konular.map(k => ({ ...k, kartlar: [...k.kartlar] }));
    const oncekiKartlar = kartlariGetir(ilkDeste), is = { ...ilkDeste.uretimIsi };
    const apiCagriButcesi = { kullanilan: 0, maksimum: ilkDeste.aktifCagriLimiti };
    const yenile = () => {
        if (kilitHatasi) return Promise.reject(kilitHatasi);
        if (yenileme) return yenileme;
        yenileme = deps.DesteModel.updateOne({ ...filtre(girdi), _id: ilkDeste._id, aktifIslemToken: token },
            { $currentDate: { sonYenileme: true } }, { timestamps: false })
            .then(s => { if (s.matchedCount !== 1) throw new CalismaKartiHatasi("Üretim sahipliği değişti.", "KART_KILIT_KAYBI"); })
            .catch(hata => { kilitHatasi = hata; throw hata; }).finally(() => { yenileme = null; });
        return yenileme;
    };
    const kaydetKonu = async (konu, alanlar) => {
        asama = "VERITABANI_KAYDI";
        await atomikDersIslemi(girdi, async session => {
            imzayiDogrula(ilkDeste, await baglamiGetir(girdi, deps, session));
            const kayit = await deps.DesteModel.findOneAndUpdate({ ...filtre(girdi), _id: ilkDeste._id,
                aktifIslemToken: token, "konular.konuId": konu.konuId },
            { $set: Object.fromEntries(Object.entries(alanlar).map(([k, v]) => [`konular.$.${k}`, v])) }, { new: true, session, runValidators: true });
            if (!kayit) throw new CalismaKartiHatasi("Üretim sahipliği değişti.", "KART_KILIT_KAYBI");
        }, deps);
        Object.assign(konu, alanlar);
    };
    const bitir = async (durum, kod = "", beklemeMs = 0, tani = null) => {
        const iade = apiCagriButcesi.maksimum - apiCagriButcesi.kullanilan;
        const ayrilanToplamCagri = Math.max(0, is.ayrilanToplamCagri - iade);
        if (durum !== "tamamlandi" && ayrilanToplamCagri >= is.toplamCagriLimiti) { durum = "durduruldu"; kod = "KART_TOPLAM_CAGRI_SINIRI"; }
        const aktif = ["kuyrukta", "bekliyor"].includes(durum);
        await atomikDersIslemi(girdi, async session => {
            if (durum === "tamamlandi" || aktif) imzayiDogrula(ilkDeste, await baglamiGetir(girdi, deps, session));
            const sonuc = await deps.DesteModel.updateOne({ ...filtre(girdi), _id: ilkDeste._id, aktifIslemToken: token }, { $set: {
            durum: durum === "tamamlandi" ? "hazir" : aktif ? "olusturuluyor" : oncekiKartlar.length ? "kismi" : "hata",
            aktifIslemToken: null, aktifCagriLimiti: 0, sonIslemSdkCagrisi: apiCagriButcesi.kullanilan,
            ayrilanCagriSayisi: Math.max(0, ilkDeste.ayrilanCagriSayisi - iade), hataKodu: kod, hataTanilama: tani,
            uretimIsi: { ...is, durum, ayrilanToplamCagri, gercekSdkCagrisi: (is.gercekSdkCagrisi || 0) + apiCagriButcesi.kullanilan,
                sonrakiDeneme: aktif ? new Date(deps.simdi().getTime() + beklemeMs) : null, beklemeNedeni: aktif ? kod : "" },
            } }, { session });
            if (sonuc.matchedCount !== 1) throw new CalismaKartiHatasi("Üretim sahipliği değişti.", "KART_KILIT_KAYBI");
        }, deps);
    };
    const timer = setInterval(() => { void yenile().catch(() => {}); }, deps.heartbeatMs); timer.unref?.();
    try {
        const baglam = await baglamiGetir(girdi, deps); imzayiDogrula(ilkDeste, baglam);
        if (!baglam.materyaller.length) throw new CalismaKartiHatasi("Hazır kaynak bulunamadı.", "KART_KAYNAK_YETERSIZ", 422);
        const parcalar = await parcalariGetir(girdi, baglam, deps);
        const isler = [], tumKaynaklar = new Map();
        let kaynakBeklemesi = null, kaynakIlerledi = false, uretimDenendi = false;
        // Tek çağrılık turda semantik kaynak seçimi ayrı tur olabilir; checkpoint
        // sonraki turda aynı embedding'i yeniden istemeyi önler.
        const retrievalButcesi = { maksimum: Math.max(1, apiCagriButcesi.maksimum - 1),
            get kullanilan() { return apiCagriButcesi.kullanilan; }, set kullanilan(v) { apiCagriButcesi.kullanilan = v; } };
        let semanticDurdu = null;
        for (const konu of konular.filter(k => !k.tamamlandi && !k.uretimiDurduruldu).sort((a, b) => (a.denemeSayisi || 0) - (b.denemeSayisi || 0))) {
            konuId = konu.konuId; asama = "KAYNAK_SECIMI"; await yenile();
            const kaynakKonusu = baglam.konular.find(k => k.konuId === konu.konuId);
            try {
                let kaynaklar;
                if (konu.kaynakParcaIds?.length) {
                    // İlk seçim kalıcıdır: restart/sonraki batch yeniden embedding
                    // harcamaz; aynı aktif snapshot ve sahiplik filtreleri uygulanır.
                    const ids = konu.kaynakParcaIds.map(kimlik);
                    const secilen = ids.map(id => parcalar.find(p => kimlik(p._id) === id));
                    if (secilen.some(p => !p || !kaynakKonusu.kaynakIds.includes(kimlik(p.materyalId)))) throw new CalismaKartiHatasi("Kaynak parçası değişti.", "KART_KAYNAK_DEGISTI");
                    kaynaklar = kaynaklariSun(secilen, baglam.materyaller);
                } else {
                    const retrieval = semanticDurdu
                        ? { ...semanticDurdu, kaynaklar: konuKartKaynaklariniSec(kaynakKonusu, parcalar, baglam.materyaller) }
                        : await konuKartHybridKaynaklariniSec({ girdi, konu: kaynakKonusu, parcalar, materyaller: baglam.materyaller,
                            apiCagriButcesi: retrievalButcesi, sahipligiDogrula: yenile }, deps);
                    if (retrieval.retrievalYontemi === "keyword_fallback") semanticDurdu = retrieval;
                    kaynaklar = retrieval.kaynaklar;
                    // Bütçe/kesinti yüzünden henüz aranamadıysa "kaynak yok"
                    // sayılmaz. Lexical sonucu olan diğer konular ilerleyebilir.
                    if (!kaynaklar.length && retrieval.retrievalHataKodu) {
                        const kod = retrieval.retrievalHataKodu;
                        if (kod !== "GEMINI_CAGRI_BUTCESI_ASILDI") kaynakBeklemesi = retrieval.retrievalHatasi;
                        continue;
                    }
                    await kaydetKonu(konu, { kaynakParcaIds: kaynaklar.map(k => k.metinParcasiId), planSurumu: 3,
                        retrievalYontemi: retrieval.retrievalYontemi, retrievalHataKodu: retrieval.retrievalHataKodu });
                    if (kaynaklar.length) kaynakIlerledi = true;
                }
                if (!kaynaklar.length) throw new CalismaKartiHatasi("Konu için kaynak bulunamadı.", "KART_KAYNAK_YETERSIZ", 422);
                tumKaynaklar.set(konuId, kaynaklar);
                const eksikler = kaynaklar.filter(k => !(konu.incelenenKaynaklar || []).includes(kartKaynakAnahtari(k)));
                if (eksikler.length) isler.push({ konu: kaynakKonusu, kaynaklar: eksikler });
                else { await kaydetKonu(konu, { tamamlandi: true, hataKodu: "" }); ilerledi = true; }
            } catch (hata) {
                if (!["KART_KAYNAK_YETERSIZ", "KART_KANIT_YETERSIZ", "KART_KAYNAK_BAGLANTISI_EKSIK"].includes(hata?.kod)) throw hata;
                await kaydetKonu(konu, { tamamlandi: false, uretimiDurduruldu: true, sifirKartNedeni: "kaynak_yok", hataKodu: hata.kod });
            }
        }
        const ayar = { ...kartBatchAyarlari(), ...deps.batchAyarlari };
        const partiler = kartKaynakBatchleriniPlanla(isler, oncekiKartlar, ayar);
        for (const partiIsleri of partiler) {
            if (apiCagriButcesi.kullanilan >= apiCagriButcesi.maksimum) break;
            uretimDenendi = true;
            await yenile(); asama = "GEMINI_ISTEGI"; konuId = partiIsleri[0].konu.konuId;
            const sayac = apiCagriButcesi.kullanilan;
            let batch;
            try {
                batch = await deps.kartBatchUret({ isler: partiIsleri, oncekiKartlar, apiCagriButcesi,
                    kaynakBaglami: { ...girdi, materyaller: baglam.materyaller }, sahipligiDogrula: yenile }, { batchAyarlari: ayar });
            } catch (hata) {
                for (const parcaIs of partiIsleri) {
                    const konu = konular.find(k => k.konuId === parcaIs.konu.konuId);
                    await kaydetKonu(konu, { denemeSayisi: (konu.denemeSayisi || 0) + 1,
                        sdkCagriSayisi: (konu.sdkCagriSayisi || 0) + apiCagriButcesi.kullanilan - sayac,
                        sonDenemeSdkCagrisi: apiCagriButcesi.kullanilan - sayac, hataKodu: guvenliKod(hata.kod),
                        reddedilenKartlar: [kartHataTanilamasiniOlustur(hata, { konuId: konu.konuId, asama: "GEMINI_ISTEGI" })] });
                }
                asama = "GEMINI_ISTEGI";
                throw hata;
            }
            await yenile();
            for (const parcaIs of partiIsleri) {
                const konu = konular.find(k => k.konuId === parcaIs.konu.konuId); konuId = konu.konuId;
                const sonuc = batch.sonuclar.find(r => r.konuId === konuId) || { kartlar: [], reddedilenler: [{ dogrulamaAltKodu: "KONU_KIMLIGI" }] };
                const yeni = sonuc.kartlar.map(k => ({ ...k, _id: new mongoose.Types.ObjectId() }));
                const reddedilenler = sonuc.reddedilenler || [];
                const incelenen = [...new Set([...(konu.incelenenKaynaklar || []),
                    ...(sonuc.kaynaklarTamamlandi && !reddedilenler.length ? parcaIs.kaynaklar.map(kartKaynakAnahtari) : [])])];
                const tamamlandi = tumKaynaklar.get(konuId).every(k => incelenen.includes(kartKaynakAnahtari(k)));
                const gecersizDenemeSayisi = reddedilenler.length ? (konu.gecersizDenemeSayisi || 0) + 1 : 0;
                const kartlar = [...konu.kartlar, ...yeni];
                const retler = reddedilenler.map(r => kartHataTanilamasiniOlustur({ tanilama: { ...sonuc.tanilama, ...r, asama: "KART_DOGRULAMA" } }, { konuId }));
                await kaydetKonu(konu, { kartlar, tamamlandi, incelenenKaynaklar: incelenen,
                    hedefKartSayisi: kartlar.length, kavramSayisi: kartlar.length, gecersizDenemeSayisi,
                    uretimiDurduruldu: gecersizDenemeSayisi >= 3, hataKodu: retler.length ? "KART_GECERSIZ_YANIT" : "",
                    sifirKartNedeni: kartlar.length ? "" : retler.length ? "dogrulama_basarisiz" : sonuc.sifirKartNedeni || "",
                    reddedilenKartlar: retler, denemeSayisi: (konu.denemeSayisi || 0) + 1,
                    sdkCagriSayisi: (konu.sdkCagriSayisi || 0) + apiCagriButcesi.kullanilan - sayac,
                    sonDenemeSdkCagrisi: apiCagriButcesi.kullanilan - sayac,
                    ...(sonuc.tanilama?.model ? { kullanilanModel: sonuc.tanilama.model } : {}),
                });
                oncekiKartlar.push(...yeni);
                if (yeni.length || (sonuc.kaynaklarTamamlandi && !retler.length)) ilerledi = true;
                for (const tani of retler) tanilamayiLogla(deps, { kod: "KART_GECERSIZ_YANIT", ...tani });
            }
        }
        await yenile(); imzayiDogrula(ilkDeste, await baglamiGetir(girdi, deps));
        if (!uretimDenendi && kaynakIlerledi) ilerledi = true;
        if (kaynakBeklemesi) {
            const bekleme = kartIsiBeklemesiniGetir(kaynakBeklemesi, deps.simdi().getTime(), is.geciciHataSayisi || 0);
            is.geciciHataSayisi = (is.geciciHataSayisi || 0) + 1;
            await bitir(bekleme == null ? "durduruldu" : "bekliyor", kaynakBeklemesi.kod, bekleme || 0);
            return;
        }
        is.geciciHataSayisi = 0;
        is.ilerlemesizTurSayisi = ilerledi ? 0 : (is.ilerlemesizTurSayisi || 0) + 1;
        if (konular.every(k => k.tamamlandi)) await bitir("tamamlandi");
        else if (!konular.some(k => !k.tamamlandi && !k.uretimiDurduruldu)) await bitir("durduruldu", konular.find(k => k.hataKodu)?.hataKodu || "KART_GECERSIZ_YANIT");
        else if (is.ilerlemesizTurSayisi >= 3) await bitir("durduruldu", "KART_ILERLEME_YOK");
        else await bitir("kuyrukta");
    } catch (hata) {
        const tani = kartHataTanilamasiniOlustur(hata, { asama, konuId });
        const kod = asama === "VERITABANI_KAYDI" && !hata.kod ? "KART_KAYIT_HATASI" : guvenliKod(hata.kod);
        tanilamayiLogla(deps, { kod, ...tani });
        const bekleme = kartIsiBeklemesiniGetir({ ...hata, kod }, deps.simdi().getTime(), is.geciciHataSayisi || 0);
        if (bekleme != null) is.geciciHataSayisi = (is.geciciHataSayisi || 0) + 1;
        await bitir(bekleme == null ? "durduruldu" : "bekliyor", kod, bekleme || 0, tani)
            .catch(() => tanilamayiLogla(deps, { kod: "KART_KAYIT_HATASI", asama: "VERITABANI_KAYDI" }));
    } finally { clearInterval(timer); if (yenileme) await yenileme.catch(() => {}); }
};

const aktifKartIsi = deste => ["kuyrukta", "calisiyor", "bekliyor"].includes(deste?.uretimIsi?.durum);
const leaseGuncel = (deste, simdi) => deste?.aktifIslemToken && new Date(deste.sonYenileme || 0).getTime() > simdi - KILIT_MS;

export const calismaKartlariniOlustur = async (girdi, bagimliliklar = {}) => {
    const deps = depsGetir(bagimliliklar), otomatik = bagimliliklar.otomatikDevam === true;
    const token = new mongoose.Types.ObjectId(); let baslat = false, mevcut;
    try {
        mevcut = await atomikDersIslemi(girdi, async session => {
            baslat = false;
            const kayit = await deps.DesteModel.findOne(filtre(girdi)).session(session).lean();
            const simdi = deps.simdi().getTime();
            if (otomatik && (!aktifKartIsi(kayit) || new Date(kayit.uretimIsi.sonrakiDeneme).getTime() > simdi)) return kayit;
            const baglam = await baglamiGetir(girdi, deps, session);
            if (kayit) imzayiDogrula(kayit, baglam);
            if (kayit?.durum === "hazir" || leaseGuncel(kayit, simdi) || (!otomatik && aktifKartIsi(kayit))) return kayit;
            if (!baglam.materyaller.length) throw new CalismaKartiHatasi("Kart üretmek için hazır materyal bulunamadı.", "KART_KAYNAK_YETERSIZ", 422);
            const temel = kayit && !otomatik && kayit.uretimIsi ? { ...kayit, uretimIsi: { ...kayit.uretimIsi, geciciHataSayisi: 0, ilerlemesizTurSayisi: 0 } } : kayit;
            let hak;
            try { hak = cagriHakkiniAyir(temel, deps); }
            catch (hata) {
                if (hata.kod !== "KART_DERS_CAGRI_SINIRI" || !kayit) throw hata;
                const yeniIs = kayit.uretimIsi || { protokolSurumu: 3, baslangic: deps.simdi(), toplamCagriLimiti: kartCagriSinirlariniGetir(deps.cagriSinirlari).toplam,
                    ayrilanToplamCagri: 0, gercekSdkCagrisi: 0, geciciHataSayisi: 0, ilerlemesizTurSayisi: 0 };
                return nesne(await deps.DesteModel.findOneAndUpdate({ ...filtre(girdi), _id: kayit._id, aktifIslemToken: kayit.aktifIslemToken }, { $set: {
                    durum: "olusturuluyor", aktifIslemToken: null, aktifCagriLimiti: 0, hataKodu: hata.kod,
                    uretimIsi: { ...yeniIs, durum: "bekliyor", beklemeNedeni: hata.kod,
                        sonrakiDeneme: new Date(new Date(kayit.cagriPenceresiBaslangici).getTime() + BUTCE_PENCERESI_MS + 1000) },
                } }, { new: true, session }));
            }
            baslat = true;
            if (kayit) return nesne(await deps.DesteModel.findOneAndUpdate({ ...filtre(girdi), _id: kayit._id, aktifIslemToken: kayit.aktifIslemToken }, { $set: {
                durum: "olusturuluyor", aktifIslemToken: token, sonYenileme: deps.simdi(), hataKodu: "", hataTanilama: null, ...hak,
                ...(!otomatik ? { konular: kayit.konular.map(k => k.tamamlandi ? k : { ...k, uretimiDurduruldu: false, gecersizDenemeSayisi: 0 }) } : {}),
            } }, { new: true, session }));
            const plan = baglam.konular.map(k => ({ konuId: k.konuId, anaKonuId: k.anaKonuId, baslik: k.baslik, anaBaslik: k.anaBaslik,
                hedefKartSayisi: 0, tamamlandi: false, planSurumu: 3, kartlar: [] }));
            const [yeni] = await deps.DesteModel.create([{ ...filtre(girdi), kaynakImzasi: baglam.imza, konular: plan, ...hak,
                durum: "olusturuluyor", aktifIslemToken: token, sonYenileme: deps.simdi(), kullanilanModel: process.env.GEMINI_KART_MODELI || VARSAYILAN_GEMINI_MODELI }], { session });
            return nesne(yeni);
        }, deps);
    } catch (hata) {
        if (hata?.code !== 11000) throw hata;
        baslat = false; mevcut = await deps.DesteModel.findOne(filtre(girdi)).lean();
        if (!mevcut) throw hata;
        imzayiDogrula(mevcut, await baglamiGetir(girdi, deps));
    }
    if (baslat && mevcut) deps.arkaPlandaBaslat(() => desteyiUret(girdi, mevcut, token, deps));
    return sun(girdi, mevcut, deps);
};

// Tıklama, tarayıcı ve Node belleğinden bağımsız: yalnız daha önce kullanıcı
// tarafından başlatılan, zamanı gelen işleri DB lease'iyle devralır.
export const kartUretimIsleriniDevamEttir = async (bagimliliklar = {}) => {
    const deps = depsGetir(bagimliliklar), simdi = deps.simdi();
    const adaylar = await deps.DesteModel.find({ "uretimIsi.durum": { $in: ["kuyrukta", "bekliyor", "calisiyor"] },
        "uretimIsi.sonrakiDeneme": { $lte: simdi },
        $or: [{ aktifIslemToken: null }, { sonYenileme: { $lte: new Date(simdi.getTime() - KILIT_MS) } }],
    }).sort({ "uretimIsi.sonrakiDeneme": 1, _id: 1 }).limit(10).lean();
    for (const aday of adaylar) {
        const girdi = { kullaniciId: aday.kullaniciId, dersId: aday.dersId };
        try { await calismaKartlariniOlustur(girdi, { ...deps, otomatikDevam: true }); }
        catch (hata) {
            // Yalnız incelenen snapshot hâlâ aynıysa durdur. Başka instance'ın
            // az önce aldığı lease veya kaydettiği checkpoint ezilemez.
            const kalici = ["KART_TOPLAM_CAGRI_SINIRI", "KART_KAYNAK_DEGISTI", "DERS_BULUNAMADI", "KART_DERS_HAZIR_DEGIL", "KART_HARITA_HAZIR_DEGIL", "KART_KONU_HATASI", "KART_KAYNAK_YETERSIZ"].includes(hata.kod);
            if (kalici) await deps.DesteModel.updateOne({ ...filtre(girdi), _id: aday._id, aktifIslemToken: aday.aktifIslemToken,
                "uretimIsi.durum": aday.uretimIsi.durum, "uretimIsi.sonrakiDeneme": aday.uretimIsi.sonrakiDeneme }, { $set: {
                durum: kartlariGetir(aday).length ? "kismi" : "hata", aktifIslemToken: null, hataKodu: guvenliKod(hata.kod),
                uretimIsi: { ...aday.uretimIsi, durum: "durduruldu", sonrakiDeneme: null, beklemeNedeni: "" },
            } });
            tanilamayiLogla(deps, { kod: guvenliKod(hata.kod), asama: "VERITABANI_KAYDI" });
        }
    }
};

export const kartUretimZamanlayicisiniBaslat = (bagimliliklar = {}) => {
    let calisiyor = false, kapali = false;
    const tara = async () => {
        if (calisiyor || kapali) return;
        calisiyor = true;
        try { await kartUretimIsleriniDevamEttir(bagimliliklar); }
        catch { /* DB kesintisinde kalıcı iş kalır; sonraki tarama yeniden dener. */ }
        finally { calisiyor = false; }
    };
    void tara();
    const timer = setInterval(() => { void tara(); }, 15_000); timer.unref?.();
    return () => { kapali = true; clearInterval(timer); };
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

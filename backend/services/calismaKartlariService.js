import mongoose from "mongoose";
import { createHash } from "node:crypto";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import CalismaKartiDestesi from "../models/CalismaKartiDestesi.js";
import KartCalismaDurumu from "../models/KartCalismaDurumu.js";
import KartDegerlendirmesi from "../models/KartDegerlendirmesi.js";
import { geminiIleCalismaKartlariUret, VARSAYILAN_GEMINI_MODELI } from "./geminiService.js";
import { dengeliOzetParcalariniSec } from "./dersOzetiService.js";
import { kartKelimeleri } from "../utils/calismaKartiDogrulama.js";
import { kartHataTanilamasiniOlustur } from "../utils/calismaKartiTanilama.js";

const KILIT_MS = 3 * 60_000;
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

export const konuKartKaynaklariniSec = (konu, parcalar, materyaller) => {
    if (!konu.kaynakIds.length) throw new CalismaKartiHatasi(
        "Konunun kaynak bağlantısı doğrulanamadı. Konu haritasının materyal ve sürüm bilgilerini kontrol edin.",
        "KART_KAYNAK_BAGLANTISI_EKSIK", 422
    );
    const kelimeler = kartKelimeleri(`${konu.baslik} ${konu.aciklama}`);
    const adaylar = parcalar.filter(p => konu.kaynakIds.includes(kimlik(p.materyalId))).map(parca => {
        const metin = kartKelimeleri(parca.icerik);
        const skor = [...kelimeler].filter(k => [...metin].some(m => m === k || (Math.min(m.length, k.length) >= 5 && (m.startsWith(k) || k.startsWith(m))))).length;
        return { parca, skor };
    }).filter(a => a.skor > 0).sort((a, b) => b.skor - a.skor || a.parca.parcaIndex - b.parca.parcaIndex).slice(0, 10).map(a => a.parca);
    const secilen = dengeliOzetParcalariniSec(adaylar, 12_000);
    const harita = new Map(materyaller.map(m => [kimlik(m._id), m]));
    return secilen.map((p, i) => ({
        anahtar: `K${i + 1}`, materyalId: p.materyalId, islemeId: p.islemeId,
        parcaIndex: p.parcaIndex, icerik: p.icerik,
        dosyaAdi: harita.get(kimlik(p.materyalId))?.orijinalDosyaAdi || harita.get(kimlik(p.materyalId))?.dosyaAdi || "Materyal",
    }));
};
const parcalariGetir = (girdi, baglam, deps) => deps.MetinParcasiModel.find({
    ...filtre(girdi), $or: baglam.materyaller.map(m => ({ materyalId: m._id, islemeId: m.aktifIslemeId })),
}).select("materyalId islemeId parcaIndex icerik").sort({ materyalId: 1, parcaIndex: 1 }).lean();

const kartlariGetir = deste => (deste?.konular || []).flatMap(k => k.kartlar || []);
const guvenliKod = kod => new Set([
    "KART_GECERSIZ_YANIT", "KART_KAYIT_HATASI", "KART_KAYNAK_YETERSIZ", "KART_KAYNAK_BAGLANTISI_EKSIK", "KART_KAYNAK_DEGISTI", "KART_KILIT_KAYBI",
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
            tamamlandi: k.tamamlandi, kartSayisi: k.kartlar.length })),
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
    if (deste) imzayiDogrula(deste, baglam);
    return sun(girdi, await eskiKilidiKapat(girdi, deste, deps), deps);
};

const desteyiUret = async (girdi, ilkDeste, token, deps) => {
    let yenileme = null, kilitHatasi = null;
    let asama = "KAYNAK_SECIMI", konuId;
    const oncekiKartlar = kartlariGetir(ilkDeste);
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
    const timer = setInterval(() => { void yenile().catch(() => {}); }, deps.heartbeatMs);
    timer.unref?.();
    try {
        const baglam = await baglamiGetir(girdi, deps);
        imzayiDogrula(ilkDeste, baglam);
        if (!baglam.materyaller.length) throw new CalismaKartiHatasi("Kart üretmek için hazır materyal bulunamadı.", "KART_KAYNAK_YETERSIZ", 422);
        const parcalar = await parcalariGetir(girdi, baglam, deps);
        for (const konu of ilkDeste.konular.filter(k => !k.tamamlandi)) {
            konuId = konu.konuId; asama = "KAYNAK_SECIMI";
            await yenile();
            const kaynaklar = konuKartKaynaklariniSec(baglam.konular.find(k => k.konuId === konu.konuId), parcalar, baglam.materyaller);
            if (!kaynaklar.length) throw new CalismaKartiHatasi("Bu konuya uygun kaynak içeriği bulunamadı.", "KART_KAYNAK_YETERSIZ", 422);
            asama = "GEMINI_ISTEGI";
            const uretilen = await deps.kartUret({ konu, kartSayisi: konu.hedefKartSayisi, kaynaklar, oncekiKartlar });
            await yenile();
            const kartlar = uretilen.map(k => ({ ...k, _id: new mongoose.Types.ObjectId() }));
            asama = "VERITABANI_KAYDI";
            await atomikDersIslemi(girdi, async session => {
                imzayiDogrula(ilkDeste, await baglamiGetir(girdi, deps, session));
                const kayit = await deps.DesteModel.findOneAndUpdate({ ...filtre(girdi), _id: ilkDeste._id, aktifIslemToken: token, "konular.konuId": konu.konuId },
                    { $set: { "konular.$.kartlar": kartlar, "konular.$.tamamlandi": true } }, { new: true, session, runValidators: true });
                if (!kayit) throw new CalismaKartiHatasi("Kart üretim işleminin sahipliği değişti.", "KART_KILIT_KAYBI");
            }, deps);
            oncekiKartlar.push(...kartlar);
        }
        await yenile();
        clearInterval(timer);
        if (yenileme) await yenileme;
        asama = "VERITABANI_KAYDI";
        await atomikDersIslemi(girdi, async session => {
            imzayiDogrula(ilkDeste, await baglamiGetir(girdi, deps, session));
            const sonuc = await deps.DesteModel.updateOne({ ...filtre(girdi), _id: ilkDeste._id, aktifIslemToken: token },
                { $set: { durum: "hazir", aktifIslemToken: null, hataKodu: "", hataTanilama: null } }, { session });
            if (sonuc.matchedCount !== 1) throw new CalismaKartiHatasi("Kart üretim işleminin sahipliği değişti.", "KART_KILIT_KAYBI");
        }, deps);
    } catch (hata) {
        const hataTanilama = kartHataTanilamasiniOlustur(hata, { asama, konuId });
        let hataKodu = guvenliKod(hata?.kod);
        if (hataKodu === "KART_URETIM_HATASI" && asama === "VERITABANI_KAYDI") hataKodu = "KART_KAYIT_HATASI";
        logla({ kod: hataKodu, ...hataTanilama });
        await deps.DesteModel.updateOne({ ...filtre(girdi), _id: ilkDeste._id, aktifIslemToken: token }, { $set: {
            durum: oncekiKartlar.length ? "kismi" : "hata", aktifIslemToken: null, hataKodu, hataTanilama,
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
        const parcalar = await parcalariGetir(girdi, baglam, deps);
        plan = baglam.konular.map(konu => {
            try {
                const kaynaklar = konuKartKaynaklariniSec(konu, parcalar, baglam.materyaller);
                const kelimeSayisi = kaynaklar.reduce((t, k) => t + k.icerik.split(/\s+/u).length, 0);
                if (!kelimeSayisi) throw new CalismaKartiHatasi(`“${konu.baslik}” konusu için uygun kaynak bulunamadı.`, "KART_KAYNAK_YETERSIZ", 422);
                return { konuId: konu.konuId, anaKonuId: konu.anaKonuId, baslik: konu.baslik, anaBaslik: konu.anaBaslik,
                    hedefKartSayisi: Math.min(4, Math.max(1, Math.ceil(kelimeSayisi / 180))), tamamlandi: false, kartlar: [] };
            } catch (hata) {
                tanilamayiLogla(deps, { kod: guvenliKod(hata?.kod),
                    ...kartHataTanilamasiniOlustur(hata, { asama: "KAYNAK_SECIMI", konuId: konu.konuId }) });
                throw hata;
            }
        });
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
                    { $set: { durum: "olusturuluyor", aktifIslemToken: token, sonYenileme: deps.simdi(), hataKodu: "", hataTanilama: null } }, { new: true, session }));
            }
            baslat = true;
            const [yeni] = await deps.DesteModel.create([{ ...filtre(girdi), kaynakImzasi: baglam.imza, konular: plan,
                durum: "olusturuluyor", aktifIslemToken: token, sonYenileme: deps.simdi(), kullanilanModel: process.env.GEMINI_KART_MODELI || VARSAYILAN_GEMINI_MODELI }], { session });
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

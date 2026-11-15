import { createHash } from "node:crypto";
import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import CalismaKarti from "../models/CalismaKarti.js";
import { kartKilidiniAl, kartKilidiniBirak } from "./calismaKartiLock.js";
import { geminiIleDersKartlariUret } from "./geminiService.js";
import {
    dersKartGruplariniOlustur, dersKartlariniDogrula,
    kartDersKaynakImzasi,
} from "./dersKartPlanlama.mjs";

export class DersKartiHatasi extends Error {
    constructor(message, status = 422, kod = "DERS_KART_HATASI") {
        super(message);
        this.status = status; this.kod = kod;
    }
}
const sha = (x) => createHash("sha256").update(String(x)).digest("hex");
const bagimliliklar = (d = {}) => ({
    DersModel: d.DersModel || Ders,
    MateryalModel: d.MateryalModel || Materyal,
    ParcaModel: d.ParcaModel || MetinParcasi,
    KartModel: d.KartModel || CalismaKarti,
    uret: d.uret || geminiIleDersKartlariUret,
    gruplama: d.gruplama || dersKartGruplariniOlustur,
});

const dersGetir = (x, kullaniciId, dersId) =>
    x.DersModel.findOne({ _id: dersId, kullaniciId,
        temizleniyor: { $ne: true } }).lean();

const kartGetir = (x, kullaniciId, dersId) =>
    x.KartModel.find({ kullaniciId, dersId }).sort({ createdAt: 1, _id: 1 }).lean();

export const dersKartKaynaklariniGetir = async (x, kullaniciId, dersId) => {
    const materyaller = await x.MateryalModel.find({
        kullaniciId, dersId, durum: "hazir", aktifIslemeId: { $ne: null },
    }).select("_id aktifIslemeId orijinalDosyaAdi dosyaAdi").lean();
    if (!materyaller.length) throw new DersKartiHatasi(
        "Ders için işlenmiş materyal bulunamadı.", 422, "KART_MATERYAL_YOK"
    );
    const parcalar = await x.ParcaModel.find({
        kullaniciId, dersId,
        $or: materyaller.map((m) =>
            ({ materyalId: m._id, islemeId: m.aktifIslemeId })),
    }).select("materyalId islemeId parcaIndex icerik")
        .sort({ materyalId: 1, parcaIndex: 1 }).lean();
    if (!parcalar.length) throw new DersKartiHatasi(
        "Ders materyallerinde işlenmiş metin bulunamadı.", 422, "KART_METIN_YOK"
    );
    const gruplar = x.gruplama(parcalar, materyaller);
    if (!gruplar.length) throw new DersKartiHatasi(
        "Ders materyallerinde çalışma kartına uygun metin bulunamadı.",
        422, "KART_METIN_BOS"
    );
    return { materyaller, parcalar, gruplar,
        surum: kartDersKaynakImzasi(materyaller, parcalar) };
};

const yeniKartlariKaydet = async (x, { kullaniciId, dersId, token, kartlar }) => {
    const sahip = await x.DersModel.findOne({
        _id: dersId, kullaniciId, kartUretimToken: token,
        temizleniyor: { $ne: true },
    }).select("_id").lean();
    if (!sahip) throw new DersKartiHatasi(
        "Kart üretim kilidi kaybedildi.", 409, "KART_KILIDI_KAYBEDILDI"
    );
    if (!kartlar.length) return;
    await x.KartModel.bulkWrite(kartlar.map((kart) => {
        const soruKimligi = sha(kart.soru.trim().toLocaleLowerCase("tr-TR"));
        return { updateOne: {
            // Eski konu bağlı kartlarda da bu soru varsa kayıt korunur.
            filter: { kullaniciId, dersId, soruKimligi },
            update: { $setOnInsert: { kullaniciId, dersId,
                ...kart, soruKimligi } },
            upsert: true,
        } };
    }), { ordered: false });
};

export const dersGeneliKartlariOlustur = async ({
    kullaniciId, dersId,
}, d = {}) => {
    const bas = Date.now(), x = bagimliliklar(d);
    const ders = await dersGetir(x, kullaniciId, dersId);
    if (!ders) throw new DersKartiHatasi("Ders bulunamadı.", 404, "DERS_BULUNAMADI");
    if (!ders.materyallerOnaylandi) throw new DersKartiHatasi(
        "Önce ders materyallerini onaylayın.");
    const token = new mongoose.Types.ObjectId();
    const kilit = await kartKilidiniAl(x.DersModel, kullaniciId, dersId, token);
    if (!kilit) throw new DersKartiHatasi(
        "Bu ders için kart üretimi devam ediyor.", 409, "KART_URETIM_DEVAM_EDIYOR"
    );

    try {
        const kaynak = await dersKartKaynaklariniGetir(x, kullaniciId, dersId);
        const guncel = await dersGetir(x, kullaniciId, dersId);
        if (!guncel) throw new DersKartiHatasi("Ders bulunamadı.", 404);
        if (guncel.kartDersSurumImzasi !== kaynak.surum) {
            // Önceki kartlar ve çalışma durumları tutulur; yeni materyalin
            // bütün grupları yeniden taranır. Eski konu eşleştirmesi kullanılmaz.
            const r = await x.DersModel.updateOne({
                _id: dersId, kullaniciId, kartUretimToken: token,
                temizleniyor: { $ne: true },
            }, { $set: {
                kartDersSurumImzasi: kaynak.surum,
                kartDersIslenenGrupImzalari: [],
                kartDersToplamGrupSayisi: kaynak.gruplar.length,
                kartDersTamamlandi: false,
            } });
            if ((r.matchedCount ?? r.n) !== 1)
                throw new DersKartiHatasi("Ders kart üretimi başlatılamadı.", 409);
            guncel.kartDersIslenenGrupImzalari = [];
            guncel.kartDersTamamlandi = false;
        }
        const islenen = new Set(guncel.kartDersIslenenGrupImzalari || []);
        const kalan = kaynak.gruplar.filter((g) => !islenen.has(g.imza));
        const mevcut = await kartGetir(x, kullaniciId, dersId);
        let yeniKart = 0, gecersiz = 0, tekrar = 0, basarisiz = 0, kota = false;
        let sira = 0;
        // İki Gemini isteği aynı anda olabilir; kayıtlar sıralı yazılır.
        // Bu şekilde farklı gruplardaki soru tekrarları da ayıklanır.
        let kayitSirasi = Promise.resolve();
        const siraliKaydet = (fn) => {
            const islem = kayitSirasi.then(fn);
            kayitSirasi = islem.catch(() => {});
            return islem;
        };
        const isci = async () => {
            while (sira < kalan.length && !kota) {
                const grup = kalan[sira++];
                const t0 = Date.now();
                try {
                    const cevap = await x.uret({
                        dersAdi: ders.dersAdi, grup,
                        oncekiSorular: mevcut,
                    });
                    if (!Array.isArray(cevap?.kartlar))
                        throw new DersKartiHatasi(
                            "Kart üretimi geçerli yanıt dönmedi.", 502, "KART_GECERSIZ_YANIT"
                        );
                    await siraliKaydet(async () => {
                        const kontrol = dersKartlariniDogrula({
                            hamKartlar: cevap.kartlar,
                            kaynaklar: grup.kaynaklar,
                            mevcutKartlar: mevcut,
                        });
                        if (cevap.kartlar.length && !kontrol.kartlar.length &&
                            kontrol.gecersiz > 0 && !kontrol.tekrar)
                            throw new DersKartiHatasi(
                                "Kart kaynakları doğrulanamadı.", 502, "KART_KAYNAK_GECERSIZ"
                            );
                        await yeniKartlariKaydet(x, {
                            kullaniciId, dersId, token,
                            kartlar: kontrol.kartlar,
                        });
                        const r = await x.DersModel.updateOne({
                            _id: dersId, kullaniciId, kartUretimToken: token,
                            temizleniyor: { $ne: true },
                        }, {
                            $addToSet: { kartDersIslenenGrupImzalari: grup.imza },
                            $currentDate: { kartUretimSonYenileme: true },
                        });
                        if ((r.matchedCount ?? r.n) !== 1)
                            throw new DersKartiHatasi("Kart üretimi kaydedilemedi.", 409);
                        islenen.add(grup.imza);
                        mevcut.push(...kontrol.kartlar);
                        yeniKart += kontrol.kartlar.length;
                        gecersiz += kontrol.gecersiz;
                        tekrar += kontrol.tekrar;
                        console.info("[CalismaKartlari][ders] Metin bölümü incelendi", {
                            grup: grup.sira, toplamGrup: kaynak.gruplar.length,
                            adayKart: cevap.kartlar.length,
                            yeniKart: kontrol.kartlar.length,
                            gecersiz: kontrol.gecersiz, tekrar: kontrol.tekrar,
                            sureMs: Date.now() - t0,
                        });
                    });
                } catch (hata) {
                    if ([429, 503].includes(Number(hata?.status))) kota = true;
                    basarisiz++;
                    console.warn("[CalismaKartlari][ders] Metin bölümü işlenemedi", {
                        grup: grup.sira, toplamGrup: kaynak.gruplar.length,
                        status: Number(hata?.status) || 0,
                        kod: String(hata?.kod || "BILINMIYOR").slice(0, 64),
                        sureMs: Date.now() - t0,
                    });
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(2, kalan.length) },
            () => isci()));
        const tamamlandi = kaynak.gruplar.every((g) => islenen.has(g.imza));
        const r = await x.DersModel.updateOne({
            _id: dersId, kullaniciId, kartUretimToken: token,
            temizleniyor: { $ne: true },
        }, {
            $set: {
                kartDersTamamlandi: tamamlandi,
                kartDersToplamGrupSayisi: kaynak.gruplar.length,
            },
        });
        if ((r.matchedCount ?? r.n) !== 1)
            throw new DersKartiHatasi("Kart üretim sonucu kaydedilemedi.", 409);
        const kartlar = await kartGetir(x, kullaniciId, dersId);
        return {
            kartlar, tamamlandi,
            toplamGrupSayisi: kaynak.gruplar.length,
            islenenGrupSayisi: islenen.size,
            yeniKartSayisi: yeniKart,
            gecersizKartSayisi: gecersiz,
            tekrarSayisi: tekrar,
            basarisizGrupSayisi: basarisiz,
            sureMs: Date.now() - bas,
        };
    } finally {
        await kartKilidiniBirak(x.DersModel, kullaniciId, dersId, token);
    }
};

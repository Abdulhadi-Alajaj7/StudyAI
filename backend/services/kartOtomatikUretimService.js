/**
 * Ders kartı üretimi HTTP isteğinden bağımsız çalışan, MongoDB'de durumunu
 * tutan bir iştir. Tek tıklama yeterlidir: gruplar kaydedilerek ilerlenir,
 * geçici hatalar Gemini çağrısında sınırlı yeniden denenir, sunucu açılışında
 * bekleyen işler sürdürülür. Kartlar tamamlanana kadar öğrenciye sunulmaz.
 */
import Ders from "../models/Ders.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { konuKartSurumuGerekliMi } from "./dersKartPlanlama.mjs";
import { dersGeneliKartlariOlustur } from "./dersKartService.js";

const calisanlar = new Set();
const TARAMA_MS = 15_000;
let taramaZamani = null;
let taramaSuruyor = false;

const id = (v) => String(v);
const int = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const hataKodu = (v) => String(v || "KART_URETIM_HATASI").slice(0, 90);

export class KartOtomatikHatasi extends Error {
    constructor(mesaj, status = 422, kod = "KART_OTOMATIK_HATA") {
        super(mesaj); this.status = status; this.kod = kod;
    }
}

/** Tek GET/POST çağrısı MongoDB'de kalıcı kuyruğu başlatır. */
export const kartOtomatikUretiminiBaslat = async ({
    kullaniciId, dersId,
}, d = {}) => {
    const DersModel = d.DersModel || Ders;
    const ders = await DersModel.findOne({
        _id: dersId, kullaniciId, temizleniyor: { $ne: true },
    }).lean();
    if (!ders) throw new KartOtomatikHatasi("Ders bulunamadı.", 404, "DERS_BULUNAMADI");
    if (!ders.materyallerOnaylandi) throw new KartOtomatikHatasi(
        "Önce ders materyallerini onaylayın.");
    const HaritaModel=d.KonuHaritasiModel || (d.DersModel?null:KonuHaritasi);
    const harita=ders.kartDersTamamlandi&&!String(ders.kartDersSurumImzasi||"").startsWith("konu-v2:")
        ? await HaritaModel?.findOne({kullaniciId,dersId,durum:"hazir"}).select("parcaAtamaSurumu").lean():null;
    const yeniKonuKartlariGerekli=konuKartSurumuGerekliMi(ders,harita);
    if (ders.kartDersTamamlandi&&!yeniKonuKartlariGerekli) return { tamamlandi: true, uretimSuruyor: false };
    if (!ders.kartDersOtomatikAktif) {
        await DersModel.updateOne({
            _id: dersId, kullaniciId, kartDersOtomatikAktif: { $ne: true },
            temizleniyor: { $ne: true }, ...(yeniKonuKartlariGerekli?{kartDersSurumImzasi:ders.kartDersSurumImzasi}:{kartDersTamamlandi:{$ne:true}}),
        }, { $set: {
            kartDersOtomatikAktif: true,
            ...(yeniKonuKartlariGerekli?{kartDersTamamlandi:false}:{}),
            kartDersSonrakiDeneme: new Date(),
            kartDersDenemeSayisi: 0,
            kartDersOtomatikHataKodu: "",
        } });
    }
    // Yanıtı Gemini'ye bağlama. İstek bitse/bilgisayar tarayıcısı kapansa
    // bile sunucudaki iş devam eder.
    if (!d.devreDisiBirak) kartOtomatikUretiminiTetikle({ kullaniciId, dersId }, d);
    return { tamamlandi: false, uretimSuruyor: true };
};

export const kartOtomatikUretiminiCalistir = async ({
    kullaniciId, dersId,
}, d = {}) => {
    const DersModel = d.DersModel || Ders;
    const anahtar = id(dersId);
    if (calisanlar.has(anahtar)) return;
    calisanlar.add(anahtar);
    try {
        const ders = await DersModel.findOne({
            _id: dersId, kullaniciId, kartDersOtomatikAktif: true,
            temizleniyor: { $ne: true },
        }).lean();
        if (!ders) return;
        if (ders.kartDersSonrakiDeneme &&
            new Date(ders.kartDersSonrakiDeneme).getTime() > Date.now()) return;
        try {
            const sonuc = await (d.uret || dersGeneliKartlariOlustur)({
                kullaniciId, dersId,
            }, d.uretBagimliliklari || {});
            if (sonuc.tamamlandi) {
                await DersModel.updateOne({
                    _id: dersId, kullaniciId, kartDersOtomatikAktif: true,
                    temizleniyor: { $ne: true },
                }, { $set: {
                    kartDersOtomatikAktif: false,
                    kartDersSonrakiDeneme: null,
                    kartDersDenemeSayisi: 0,
                    kartDersOtomatikHataKodu: "",
                } });
                console.info("[CalismaKartlari][otomatik] Ders kartları tamamlandı", {
                    dersId: anahtar, toplamKart: sonuc.kartlar?.length || 0,
                });
                return;
            }
            throw new KartOtomatikHatasi(
                "Kart üretimi tamamlanamadı.", 502, "KART_URETIM_DOGRULANAMADI"
            );
        } catch (hata) {
            // Gemini geçici hataları kendi sınırlı retry döngüsünde ele alır.
            // Burada ikinci bir üretim/retry katmanı başlatılmaz.
            // Başka sunucu işlem kilidini taşıyorsa yalnız onun sonucunu bekle.
            const cakisma = hata?.kod === "KART_URETIM_DEVAM_EDIYOR";
            const status = Number(hata?.status) || 0;
            const deneme = int(ders.kartDersDenemeSayisi) + (cakisma ? 0 : 1);
            const kalici = !cakisma;
            await DersModel.updateOne({
                _id: dersId, kullaniciId, kartDersOtomatikAktif: true,
                temizleniyor: { $ne: true },
            }, { $set: {
                kartDersOtomatikAktif: !kalici,
                kartDersDenemeSayisi: deneme,
                kartDersSonrakiDeneme: kalici ? null : new Date(Date.now() + 30_000),
                kartDersOtomatikHataKodu: kalici ? hataKodu(hata?.kod) : "",
            } });
            console.warn("[CalismaKartlari][otomatik] İşlem sürdürme durumu", {
                dersId: anahtar, status, kod: hataKodu(hata?.kod),
                deneme, kalici,
            });
        }
    } finally {
        calisanlar.delete(anahtar);
    }
};

export const kartOtomatikUretiminiTetikle = (girdi, d = {}) => {
    // İstemci yanıtının tamamlanmasını beklemeden iş başlatılır.
    void kartOtomatikUretiminiCalistir(girdi, d).catch((hata) => {
        console.error("[CalismaKartlari][otomatik] İş zamanlayıcı hatası", {
            kod: hataKodu(hata?.kod),
        });
    });
};

/** Sunucu yeniden başladıktan sonra bekleyen işlerin otomatik kurtarılması. */
export const kartOtomatikUretimleriniTara = async (d = {}) => {
    if (taramaSuruyor) return;
    taramaSuruyor = true;
    try {
        const DersModel = d.DersModel || Ders;
        const dersler = await DersModel.find({
            kartDersOtomatikAktif: true,
            temizleniyor: { $ne: true },
            $or: [
                { kartDersSonrakiDeneme: null },
                { kartDersSonrakiDeneme: { $lte: new Date() } },
            ],
        }).select("_id kullaniciId").limit(30).lean();
        for (const ders of dersler) {
            kartOtomatikUretiminiTetikle({
                dersId: ders._id, kullaniciId: ders.kullaniciId,
            }, d);
        }
    } finally {
        taramaSuruyor = false;
    }
};

export const kartOtomatikUretimZamanlayicisiniBaslat = () => {
    if (taramaZamani) return;
    void kartOtomatikUretimleriniTara().catch((h) =>
        console.error("[CalismaKartlari][otomatik] Başlangıç taraması", { kod: hataKodu(h?.kod) }));
    taramaZamani = setInterval(() => {
        void kartOtomatikUretimleriniTara().catch((h) =>
            console.error("[CalismaKartlari][otomatik] İş taraması", { kod: hataKodu(h?.kod) }));
    }, TARAMA_MS);
    taramaZamani.unref?.();
};

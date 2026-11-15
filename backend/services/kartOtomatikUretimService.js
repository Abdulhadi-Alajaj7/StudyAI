/**
 * Ders kartı üretimi HTTP isteğinden bağımsız çalışan, MongoDB'de durumunu
 * tutan bir iştir. Tek tıklama yeterlidir: parçalar kaydedilerek ilerlenir,
 * geçici kota/ağ hataları otomatik yeniden denenir, sunucu açılışında
 * bekleyen işler sürdürülür. Kartlar tamamlanana kadar öğrenciye sunulmaz.
 */
import Ders from "../models/Ders.js";
import { dersGeneliKartlariOlustur } from "./dersKartService.js";

const calisanlar = new Set();
const TARAMA_MS = 15_000;
const ILK_BEKLEME_MS = 10_000;
const AZAMI_BEKLEME_MS = 15 * 60_000;
const AZAMI_KALICI_HATA = 4;
let taramaZamani = null;
let taramaSuruyor = false;

const id = (v) => String(v);
const int = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const hataKodu = (v) => String(v || "KART_URETIM_HATASI").slice(0, 90);
const bekleme = (deneme, kota) =>
    Math.min(AZAMI_BEKLEME_MS, (kota ? 60_000 : ILK_BEKLEME_MS) *
        (2 ** Math.min(6, Math.max(0, deneme - 1))));

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
    if (ders.kartDersTamamlandi) return { tamamlandi: true, uretimSuruyor: false };
    if (!ders.kartDersOtomatikAktif) {
        await DersModel.updateOne({
            _id: dersId, kullaniciId, kartDersOtomatikAktif: { $ne: true },
            temizleniyor: { $ne: true }, kartDersTamamlandi: { $ne: true },
        }, { $set: {
            kartDersOtomatikAktif: true,
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
            // Geçici servis sorunlarında backend kendisi kaldığı yerden sürer.
            // Aynı kaynak sürekli geçersiz JSON dönüyorsa kalıcı hatayı
            // sonsuz isteğe dönüştürmeyiz.
            // Bazı gruplar tamamlandıysa hata sayacını sıfırla. Böylece
            // büyük derslerde ilerleme sürerken birkaç aralıklı hata yüzünden
            // üretim durmaz.
            const ilerlemeVar = int(sonuc.islenenGrupSayisi) >
                (ders.kartDersIslenenGrupImzalari || []).length;
            const deneme = ilerlemeVar ? 1 : int(ders.kartDersDenemeSayisi) + 1;
            const kota = Boolean(sonuc.kotaEngeli);
            const kalici = !kota && !ilerlemeVar && deneme >= AZAMI_KALICI_HATA;
            await DersModel.updateOne({
                _id: dersId, kullaniciId, kartDersOtomatikAktif: true,
                temizleniyor: { $ne: true },
            }, { $set: {
                kartDersOtomatikAktif: !kalici,
                kartDersDenemeSayisi: deneme,
                kartDersSonrakiDeneme: kalici ? null
                    : new Date(Date.now() + bekleme(deneme, kota)),
                kartDersOtomatikHataKodu: kalici ? "KART_URETIM_DOGRULANAMADI" : "",
            } });
            console.warn("[CalismaKartlari][otomatik] Kalan kaynaklar yeniden denenecek", {
                dersId: anahtar, deneme, kota, kalici,
                islenen: sonuc.islenenGrupSayisi, toplam: sonuc.toplamGrupSayisi,
            });
        } catch (hata) {
            // Başka sunucu işlem kilidini taşıyorsa onun sonucunu bekle.
            const cakisma = hata?.kod === "KART_URETIM_DEVAM_EDIYOR";
            const status = Number(hata?.status) || 0;
            const gecici = cakisma || status === 429 || status === 503 ||
                status >= 500 || ["ECONNRESET", "ETIMEDOUT", "ENOTFOUND"].includes(hata?.code);
            const deneme = int(ders.kartDersDenemeSayisi) + (cakisma ? 0 : 1);
            const kalici = !gecici || (![429, 503].includes(status) && !cakisma &&
                deneme >= AZAMI_KALICI_HATA);
            await DersModel.updateOne({
                _id: dersId, kullaniciId, kartDersOtomatikAktif: true,
                temizleniyor: { $ne: true },
            }, { $set: {
                kartDersOtomatikAktif: !kalici,
                kartDersDenemeSayisi: deneme,
                kartDersSonrakiDeneme: kalici ? null
                    : new Date(Date.now() + (cakisma ? 30_000 : bekleme(deneme, status === 429))),
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

/**
 * Harita tabanlı kart sistemi:
 * - Konu başına metin seçimi yapılmaz.
 * - Hazır dersin tüm metin parçaları kaynak sırasıyla, yalnızca boyuta göre bölünür.
 * - Bütün konu haritası her Gemini isteğine verilir.
 * - Her kartın konuId'si ve kaynak kodu doğrulanır, konu başına üst sınır 8'dir.
 */
const turkceKucult = (x) => String(x ?? "").toLocaleLowerCase("tr-TR");
const sade = (x) => turkceKucult(x).normalize("NFKC")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
// K1/K2, X/y ve 1/2 gibi ayırt edici kısa terim ve sayıları atlama.
const kelimeKumesi = (x) => new Set(sade(x).split(" ").filter((s) => s.length >= 2 || /^\d+$/.test(s)));
const benzerlik = (a, b) => {
    const sa = kelimeKumesi(a), sb = kelimeKumesi(b);
    if (!sa.size || !sb.size) return 0;
    let ortak = 0;
    for (const s of sa) if (sb.has(s)) ortak += 1;
    return ortak / (sa.size + sb.size - ortak);
};
export const konuHaritasiniOzetle = (harita) => {
    const tum = new Map();
    const agac = (harita?.anaKonular || []).map((ana) => {
        const altlar = Array.isArray(ana.altKonular) ? ana.altKonular : [];
        const item = {
            konuId: String(ana.konuId || ""), baslik: String(ana.baslik || ""),
            aciklama: String(ana.aciklama || ""),
            altKonular: altlar.map((alt) => ({
                konuId: String(alt.konuId || ""), baslik: String(alt.baslik || ""),
                aciklama: String(alt.aciklama || ""),
            })),
        };
        const konular = item.altKonular.length ? item.altKonular : [item];
        for (const konu of konular) {
            if (!konu.konuId || !konu.baslik || tum.has(konu.konuId)) {
                throw new Error("Konu haritasında geçersiz veya yinelenen konu kimliği.");
            }
            tum.set(konu.konuId, { konuId: konu.konuId, baslik: konu.baslik });
        }
        return item;
    });
    if (!agac.length || !tum.size) throw new Error("Hazır konu haritası bulunamadı.");
    return { agac, konular: [...tum.values()] };
};

const bolunebilirSon = (metin, hedef, min) => {
    if (metin.length <= hedef) return metin.length;
    const parcasi = metin.slice(min, hedef);
    const satir = parcasi.lastIndexOf("\n");
    const bosluk = parcasi.lastIndexOf(" ");
    const index = Math.max(satir, bosluk);
    return index >= 0 ? index + min + 1 : hedef;
};

/** Yalnızca metnin boyutuna göre bölme: konu araması veya ön eleme yok. */
export const dersMetniniGrupla = (metinParcalari, materyaller, {
    grupKarakterLimiti = 42000,
    bolumKarakterLimiti = 14000,
} = {}) => {
    if (grupKarakterLimiti < 200 || bolumKarakterLimiti < 100) {
        throw new Error("Metin gruplama limiti geçersiz.");
    }
    const adlar = new Map(materyaller.map((m) => [
        String(m._id), String(m.orijinalDosyaAdi || m.dosyaAdi || "Materyal"),
    ]));
    const kayitlar = [];
    let no = 0;
    for (const parca of metinParcalari) {
        if (!adlar.has(String(parca.materyalId))) continue;
        const icerik = String(parca.icerik ?? "");
        if (!icerik.trim()) continue;
        let bas = 0;
        while (bas < icerik.length) {
            const kalan = icerik.slice(bas);
            const bitis = bolunebilirSon(kalan, Math.min(bolumKarakterLimiti, grupKarakterLimiti - 120), 100);
            const metin = kalan.slice(0, bitis);
            bas += bitis;
            if (!metin.trim()) continue;
            const kod = "K" + (++no);
            kayitlar.push({
                kod, metin, materyalId: parca.materyalId,
                parcaIndex: parca.parcaIndex, dosyaAdi: adlar.get(String(parca.materyalId)),
            });
        }
    }
    const gruplar = [];
    let kaynaklar = [], karakter = 0;
    const ekle = () => {
        if (!kaynaklar.length) return;
        gruplar.push({
            kaynaklar,
            metin: kaynaklar.map((k) => (
                "[" + k.kod + "] DOSYA: " + k.dosyaAdi +
                " | BÖLÜM: " + k.parcaIndex + "\n" + k.metin
            )).join("\n\n"),
        });
        kaynaklar = []; karakter = 0;
    };
    for (const kayit of kayitlar) {
        const gereken = kayit.metin.length + kayit.dosyaAdi.length + 85;
        if (kaynaklar.length && karakter + gereken > grupKarakterLimiti) ekle();
        kaynaklar.push(kayit);
        karakter += gereken;
    }
    ekle();
    return gruplar;
};

/**
 * Gemini'nin önemine göre sıralanan adaylar:
 * gerçek konu ID'si, gerçek kaynak K kodları, mevcut/üretilecek kartlarda
 * konu başına 8 sınırı ve belirgin anlam tekrarları kontrol edilir.
 * Bir kaynağın başka bir konuda kullanılması yasak değildir: modelin görevi
 * tam da dersin bütün metnini okuyarak doğru konuyu seçmektir.
 */
export const haritaKartlariniDogrula = ({ hamKartlar, konular, kaynaklar, oncekiKartlar = [],
    maksimum = 8, ayrinti = false }) => {
    const konularMap = new Map(konular.map((k) => [String(k.konuId), k]));
    const kaynakMap = new Map(kaynaklar.map((k) => [String(k.kod), k]));
    const sayac = new Map();
    const gorulen = [];
    const ekleGorulen = (kart) => {
        const konuId = String(kart.konuId);
        sayac.set(konuId, (sayac.get(konuId) || 0) + 1);
        gorulen.push({
            konuId,
            soru: sade(kart.soru), cevap: sade(kart.cevap),
        });
    };
    for (const kart of oncekiKartlar) ekleGorulen(kart);
    const adaylar = Array.isArray(hamKartlar) ? hamKartlar : [];
    const sirali = adaylar.map((kart, sira) => ({ kart, sira }))
        .sort((a, b) => (Number(b.kart?.onem) || 0) - (Number(a.kart?.onem) || 0) ||
            a.sira - b.sira);
    const sonuc = [];
    let gecersiz = 0, tekrar = 0, limit = 0;
    for (const { kart } of sirali) {
        const id = String(kart?.konuId || "");
        const konu = konularMap.get(id);
        const soru = typeof kart?.soru === "string" ? kart.soru.trim().slice(0, 1000) : "";
        const cevap = typeof kart?.cevap === "string" ? kart.cevap.trim().slice(0, 2000) : "";
        const kodlar = Array.isArray(kart?.kaynakKodlari)
            ? [...new Set(kart.kaynakKodlari.map((k) => String(k)))] : [];
        if (!konu || !soru || !cevap || !kodlar.length ||
            kodlar.some((k) => !kaynakMap.has(k))) {
            gecersiz += 1; continue;
        }
        if ((sayac.get(id) || 0) >= maksimum) { limit += 1; continue; }
        const sq = sade(soru), ca = sade(cevap);
        const muadil = gorulen.some((onceki) => {
            if (onceki.soru === sq) return true;
            if (onceki.konuId !== id) {
                return benzerlik(sq, onceki.soru) >= 0.94 &&
                    benzerlik(ca, onceki.cevap) >= 0.8;
            }
            return benzerlik(sq, onceki.soru) >= 0.82 &&
                benzerlik(ca, onceki.cevap) >= 0.75;
        });
        if (muadil) { tekrar += 1; continue; }
        const kaynakListesi = kodlar.map((kod) => {
            const k = kaynakMap.get(kod);
            return { materyalId: k.materyalId, dosyaAdi: k.dosyaAdi, parcaIndex: k.parcaIndex };
        });
        const yeni = {
            konuId: id, konuBasligi: konu.baslik, soru, cevap,
            kaynaklar: kaynakListesi, uretimYontemi: "gemini",
        };
        sonuc.push(yeni);
        ekleGorulen(yeni);
    }
    return ayrinti ? { kartlar: sonuc, gecersiz, tekrar, limit } : sonuc;
};

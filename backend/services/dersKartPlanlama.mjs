import { createHash } from "node:crypto";

const hash = (v) => createHash("sha256").update(String(v)).digest("hex");
const id = (v) => String(v ?? "");
const parcaAnahtari = (p) => [id(p.materyalId), id(p.islemeId), p.parcaIndex].join(":");

// konuHaritasiService.aktifMateryalMetinleriniTopla ile aynı sıra, P kodları
// ve 80.000 karakterlik metin grupları; mevcut parçalar yeniden bölünmez.
export const konuBaglantiliKartGruplariniOlustur = (parcalar, materyaller, harita) => {
    const konular = (harita?.anaKonular || []).flatMap((ana) => [
        { konuId: ana.konuId, baslik: ana.baslik, aciklama: ana.aciklama, sira: ana.sira },
        ...(ana.altKonular || []).map((alt) => ({
            konuId: alt.konuId, baslik: alt.baslik, aciklama: alt.aciklama,
            sira: alt.sira, anaKonuId: ana.konuId,
        })),
    ]);
    if (!konular.length) throw Object.assign(new Error("Dersin hazır konu haritası bulunamadı."), {
        status: 422, kod: "KART_KONU_HARITASI_YOK",
    });
    const konuIds = new Set(konular.map((konu) => konu.konuId));
    const atamalar = new Map((harita.parcaKonuAtamalari || []).map((a) => [parcaAnahtari(a), a.konuIds]));
    const materyalMap = new Map(materyaller.map((m) => [id(m._id), m]));
    const sirali = parcalar.filter((p) => {
        const materyal = materyalMap.get(id(p.materyalId));
        return materyal && id(materyal.aktifIslemeId) === id(p.islemeId);
    }).sort((a, b) => id(a.materyalId).localeCompare(id(b.materyalId)) || a.parcaIndex - b.parcaIndex);

    const gruplar = [];
    let kaynaklar = [], karakter = 0, sonMateryalId = null;
    const tamamla = () => {
        if (!kaynaklar.length) return;
        const metin = kaynaklar.map((k) =>
            "[PARCA " + k.kod + "] DOSYA: " + k.dosyaAdi + " | BÖLÜM: " + k.parcaIndex +
            " | KONU ID: " + k.konuIds.join(", ") + "\n" + k.icerik
        ).join("\n\n");
        gruplar.push({ sira: gruplar.length + 1, kaynaklar, konular, metin,
            imza: hash("harita-kart-v1:" + JSON.stringify({ konular, kaynaklar })) });
        kaynaklar = []; karakter = 0;
    };
    for (const [index, parca] of sirali.entries()) {
        const baglantilar = atamalar.get(parcaAnahtari(parca));
        if (!Array.isArray(baglantilar) || !baglantilar.length || baglantilar.some((konuId) => !konuIds.has(konuId))) {
            throw Object.assign(new Error("Konu haritasında güncel metin bağlantısı eksik."), {
                status: 422, kod: "KART_KONU_KAYNAGI_EKSIK",
            });
        }
        const materyalId = id(parca.materyalId);
        const materyal = materyalMap.get(materyalId);
        const dosyaAdi = materyal.orijinalDosyaAdi || materyal.dosyaAdi || "Materyal";
        const kod = "P" + (index + 1);
        const icerik = id(parca.icerik);
        let parcaMetni = "[PARCA " + kod + "]\n" + icerik;
        if (sonMateryalId !== materyalId) {
            parcaMetni = "\n=== MATERYAL: " + dosyaAdi + " ===\n" + parcaMetni;
            sonMateryalId = materyalId;
        }
        if (kaynaklar.length && karakter + parcaMetni.length > 80_000) tamamla();
        kaynaklar.push({ kod, icerik, materyalId: parca.materyalId, islemeId: parca.islemeId,
            parcaIndex: parca.parcaIndex, dosyaAdi, konuIds: baglantilar });
        karakter += parcaMetni.length;
    }
    tamamla();
    return gruplar;
};

export const konuKartSurumuGerekliMi = (ders, harita) => harita?.parcaAtamaSurumu === 1 &&
    !String(ders?.kartDersSurumImzasi || "").startsWith("konu-v2:");

// Yalnız alan, kayıt sınırı ve gerçek kimlik kontrolleri. İçerik, kart sayısı
// ve önem değerlendirmesi Gemini'ye aittir; geçersiz yanıt yeniden üretilmez.
export const dersKartlariniDogrula = ({ hamKartlar, kaynaklar, konular }) => {
    const kaynakMap = new Map(kaynaklar.map((k) => [k.kod, k]));
    const konuMap = new Map(konular.map((k) => [k.konuId, k]));
    const hata = (kod) => Object.assign(new Error("Çalışma kartı alanları veya kaynak kimlikleri geçersiz."), {
        status: 502, kod,
    });
    if (!Array.isArray(hamKartlar)) throw hata("KART_GECERSIZ_YANIT");
    return hamKartlar.map((kart) => {
        const soru = typeof kart?.soru === "string" ? kart.soru.trim() : "";
        const cevap = typeof kart?.cevap === "string" ? kart.cevap.trim() : "";
        if (!soru || !cevap || soru.length > 1000 || cevap.length > 2000) throw hata("KART_GECERSIZ_YANIT");
        const konu = konuMap.get(kart.konuId);
        const kodlar = kart.kaynakKodlari;
        if (!konu || !Array.isArray(kodlar) || !kodlar.length ||
            kodlar.some((kod) => !kaynakMap.has(kod))) throw hata("KART_KAYNAK_GECERSIZ");
        return {
            soru, cevap, uretimYontemi: "gemini", konuId: konu.konuId, konuBasligi: konu.baslik,
            kaynaklar: kodlar.map((kod) => {
                const k = kaynakMap.get(kod);
                return { kod, materyalId: k.materyalId, islemeId: k.islemeId,
                    dosyaAdi: k.dosyaAdi, parcaIndex: k.parcaIndex };
            }),
        };
    });
};

export const kartDersKaynakImzasi = (materyaller, parcalar) =>
    hash(JSON.stringify({
        surum: "ders-kart-v1",
        materyaller: materyaller.map((m) => [id(m._id), id(m.aktifIslemeId)])
            .sort((a, b) => a[0].localeCompare(b[0])),
        parcalar: parcalar.map((p) => [
            id(p.materyalId), id(p.islemeId), Number(p.parcaIndex), hash(id(p.icerik)),
        ]).sort((a, b) => a[0].localeCompare(b[0]) || a[2] - b[2]),
    }));

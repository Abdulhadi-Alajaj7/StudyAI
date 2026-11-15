import { createHash } from "node:crypto";
import { kosinusBenzerligi } from "./embeddingService.js";

// Konu haritası -> her alt konu için tekrar kullanılabilir metin bağlantıları.
// Metin parçaları asla silinmez. Eşleştirilemeyenler denetim listesinde saklanır.
export const KONU_PARCA_ALGORITMA_SURUMU = 1;
const sayi = (v, n, alt, ust) => Number.isFinite(Number(v))
    ? Math.min(ust, Math.max(alt, Number(v))) : n;
const kimlik = (v) => String(v ?? "");
const sade = (v) => kimlik(v).toLocaleLowerCase("tr-TR").normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
const durak = new Set(["ve", "ile", "için", "bir", "bu", "gibi", "olan",
    "veri", "bilgi", "temel", "süreç", "yöntem", "analiz", "model",
    "sınıflandırma", "kavram", "türleri", "nedir"]);
const terimler = (s) => [...new Set(sade(s).split(" ")
    .filter((t) => t.length >= 4 && !durak.has(t)))];

const kelimeSkoru = (konu, parca) => {
    const kelimeler = terimler(konu.baslik + " " + (konu.aciklama || ""));
    if (!kelimeler.length) return 0;
    const metin = sade(parca.icerik);
    let eslesen = 0;
    for (const k of kelimeler) {
        if (metin.includes(k)) eslesen++;
    }
    return eslesen / kelimeler.length;
};

export const konuParcaSurumImzasi = ({ agac, materyaller, model, boyut }) => createHash("sha256")
    .update(JSON.stringify({
        algoritma: KONU_PARCA_ALGORITMA_SURUMU,
        model, boyut, agac,
        materyaller: materyaller.map((m) => ({
            id: kimlik(m._id), isleme: kimlik(m.aktifIslemeId),
        })).sort((a, b) => a.id.localeCompare(b.id)),
    }))
    .digest("hex");

const parcaSirasi = (a, b) => kimlik(a.materyalId).localeCompare(kimlik(b.materyalId)) ||
    (a.parcaIndex - b.parcaIndex) || kimlik(a._id).localeCompare(kimlik(b._id));

const yeniKonu = (k) => ({ konuId: kimlik(k.konuId), baslik: kimlik(k.baslik),
    aciklama: kimlik(k.aciklama || ""), kaynaklar: [] });

export const konuParcaBaglantilariniHesapla = ({
    konular, parcalar, sorguVektorleri = [], model, boyut,
    maksParca = 12, maksIlkSecim = 9,
}) => {
    const max = sayi(maksParca, 12, 2, 24);
    const ilk = sayi(maksIlkSecim, 9, 1, max);
    const siraliParcalar = [...parcalar].filter((p) => kimlik(p._id) && kimlik(p.icerik).trim())
        .sort(parcaSirasi);
    const parcaMap = new Map(siraliParcalar.map((p) => [kimlik(p._id), p]));
    const komsuMap = new Map(siraliParcalar.map((p, i) => [
        kimlik(p._id), [
            siraliParcalar[i - 1], siraliParcalar[i + 1],
        ].filter((n) => n && kimlik(n.materyalId) === kimlik(p.materyalId)
            && kimlik(n.islemeId) === kimlik(p.islemeId)
            && Math.abs(Number(n.parcaIndex) - Number(p.parcaIndex)) === 1),
    ]));
    const sonuclar = [];
    for (let index = 0; index < konular.length; index++) {
        const konu = konular[index];
        const vektor = sorguVektorleri[index];
        const adaylar = siraliParcalar.map((parca) => {
            const hazir = parca.embeddingDurumu === "hazir" &&
                parca.embeddingModel === model && parca.embeddingBoyutu === boyut &&
                Array.isArray(vektor) && Array.isArray(parca.embedding) &&
                parca.embedding.length === vektor.length;
            const semantik = hazir ? kosinusBenzerligi(vektor, parca.embedding) : null;
            const kelime = kelimeSkoru(konu, parca);
            const skor = semantik == null ? kelime * 0.85 : semantik * 0.8 + kelime * 0.2;
            return {
                parcaId: kimlik(parca._id), skor: Number(skor.toFixed(6)),
                semantikVar: semantik != null, kelime, yontem: semantik == null ? "kelime" : "karma",
            };
        }).sort((a, b) => b.skor - a.skor || a.parcaId.localeCompare(b.parcaId));
        const baslangic = adaylar[0]?.skor || 0;
        // Sabit "ilk 5 parça" yok: hem semantik hem kelime eşleşmesi; çok düşük
        // güvenli parçayı konuya zorla bağlamak yerine eşleşmeyen listede saklarız.
        const bulunan = adaylar.filter((a) =>
            a.skor >= (a.semantikVar ? 0.27 : 0.19) &&
            a.skor >= Math.max(0.19, baslangic - 0.22)
        ).slice(0, ilk);
        const secilen = new Map();
        const ekle = (a, yontem = a.yontem) => {
            if (secilen.has(a.parcaId) || secilen.size >= max) return;
            secilen.set(a.parcaId, { parcaId: a.parcaId, skor: a.skor, yontem });
        };
        for (const aday of bulunan) ekle(aday);
        // Çok parçaya yayılan tanım/aşamaların komşu satırlarını da koru.
        // Önce bütün doğrudan eşleşmeler, sonra komşular eklenir.
        for (const aday of bulunan) {
            for (const komsu of komsuMap.get(aday.parcaId) || []) {
                const skor = adaylar.find((a) => a.parcaId === kimlik(komsu._id));
                // Komşuluğu körlemesine kullanma: konu dışı komşu metinler
                // yanlış sorulara yol açabilir. Komşunun da makul
                // bir ilişki skoru olmalı.
                if (skor && skor.skor >= Math.max(0.13, aday.skor - 0.35)) {
                    ekle(skor, "komsu");
                }
            }
        }
        sonuclar.push({
            ...yeniKonu(konu),
            kaynaklar: [...secilen.values()].filter((r) => parcaMap.has(r.parcaId)),
        });
    }
    const eslesenler = new Set(sonuclar.flatMap((konu) => konu.kaynaklar.map((k) => k.parcaId)));
    const eslesmeyenParcaIds = siraliParcalar.filter((p) => !eslesenler.has(kimlik(p._id)))
        .map((p) => kimlik(p._id));
    const embeddingiEksikParcaIds = siraliParcalar.filter((p) =>
        p.embeddingDurumu !== "hazir" || p.embeddingModel !== model ||
        p.embeddingBoyutu !== boyut || !Array.isArray(p.embedding) ||
        p.embedding.length !== boyut).map((p) => kimlik(p._id));
    return {
        konular: sonuclar, eslesmeyenParcaIds, embeddingiEksikParcaIds,
        toplamParcaSayisi: siraliParcalar.length,
        eslesenParcaSayisi: eslesenler.size,
        bosKonuIds: sonuclar.filter((k) => !k.kaynaklar.length).map((k) => k.konuId),
    };
};

/** Konuya bağlı kaynaklar tek DB şemasında saklanır; kart/test kaynak okuması ortak. */
export const konuKaynakGruplariniOlustur = ({
    esleme, agac, parcalar, materyaller, grupKonuLimiti = 3,
}) => {
    const adlar = new Map(materyaller.map((m) => [kimlik(m._id),
        kimlik(m.orijinalDosyaAdi || m.dosyaAdi || "Materyal")]));
    const parcaMap = new Map(parcalar.map((p) => [kimlik(p._id), p]));
    const sinir = sayi(grupKonuLimiti, 3, 1, 5);
    const gruplar = [];
    const kuyruk = esleme.konular.filter((k) => k.kaynaklar?.length);
    for (let i = 0; i < kuyruk.length; i += sinir) {
        const konular = kuyruk.slice(i, i + sinir);
        const kaynaklar = [];
        const satirlar = [];
        let kNo = 0;
        for (const konu of konular) {
            satirlar.push("KONU: " + konu.baslik + " | konuId: " + konu.konuId +
                "\nAÇIKLAMA: " + (konu.aciklama || ""));
            for (const eslesme of konu.kaynaklar) {
                const parca = parcaMap.get(kimlik(eslesme.parcaId));
                if (!parca) continue;
                const kod = "K" + (++kNo);
                kaynaklar.push({ kod, materyalId: parca.materyalId,
                    parcaIndex: parca.parcaIndex, parcaId: parca._id,
                    dosyaAdi: adlar.get(kimlik(parca.materyalId)) || "Materyal",
                    konuId: konu.konuId });
                satirlar.push("[" + kod + "] DOSYA: " +
                    (adlar.get(kimlik(parca.materyalId)) || "Materyal") +
                    " | BÖLÜM: " + parca.parcaIndex + "\n" + parca.icerik);
            }
        }
        if (!kaynaklar.length) continue;
        const grupAgaci = konular.map((k) => ({
            konuId: k.konuId, baslik: k.baslik, aciklama: k.aciklama, altKonular: [],
        }));
        gruplar.push({
            metin: satirlar.join("\n\n"), kaynaklar, konuHaritasi: grupAgaci,
            konuIdleri: konular.map((k) => k.konuId), konuKaynakli: true,
        });
    }
    return gruplar;
};

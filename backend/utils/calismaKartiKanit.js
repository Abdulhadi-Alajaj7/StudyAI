import { createHash } from "node:crypto";
import { kartKelimeleri, kartMetniniNormalizeEt, kartlarBenzerMi } from "./calismaKartiDogrulama.js";

// Yalnız açık tanım kalıpları soru-cevaba çevrilir. Serbest model sorusu veya
// yeniden ifade kabul edilmez; koşul/olumsuzluk cevabın özgün aralığında kalır.
export const dogalKartSeceneginiOlustur = metin => {
    const eslesme = metin.match(/^([\p{L}\p{N}][\p{L}\p{N}\s()/'’.-]{1,79}):\s+(.+)$/u)
        || metin.match(/^([\p{L}\p{N}][\p{L}\p{N}\s()/'’.-]{1,79}),\s+(.+?)(?:\s+olarak tanımlanır|\s+anlamına gelir)[.!]?$/u);
    if (!eslesme) return null;
    const terim = eslesme[1].trim(), cevap = eslesme[2].trim();
    if (terim.split(/\s+/u).length > 8 || /^(örnek|not|soru|cevap|uyarı|bölüm|sayfa|kaynak|içindekiler)\b/iu.test(terim) || /[!?]/u.test(cevap) || cevap.length < 5 || cevap.length > 240) return null;
    const baslangic = metin.indexOf(cevap, eslesme[1].length);
    return { metin: cevap, baslangic, bitis: baslangic + cevap.length, terim,
        soru: `${terim} ${/[=∑√]/u.test(cevap) ? "nasıl ifade edilir" : "nedir"}?` };
};

// Alıntı ve cevap modele yazdırılmaz. Kaynak aralıkları sunucuda çıkarılır;
// model yalnızca kanıt kimliğini ve sunucunun belirlediği cevap aralığının indeksini seçer.
export const kartCevapAraliklariniOlustur = metin => {
    const adaylar = [], gorulen = new Set();
    for (const eslesme of metin.matchAll(/[\p{L}\p{N}]+(?:[.,]\p{N}+)*(?:[’'][\p{L}]+)*/gu)) {
        const ifade = eslesme[0], anahtar = ifade.normalize("NFKC").toLocaleLowerCase("tr-TR");
        if (ifade.length > 120 || (!kartKelimeleri(ifade).size && !/^\d+(?:[.,]\d+)*$/u.test(ifade)) || gorulen.has(anahtar)) continue;
        gorulen.add(anahtar);
        adaylar.push({ metin: ifade, baslangic: eslesme.index, bitis: eslesme.index + ifade.length });
    }
    // Prompt metadata'sı da sınırlıdır. Çok sözcüklü cümlede baş/orta/sondan
    // deterministik seçim; yanıt alanına yeni metin yazdırılmaz.
    return adaylar.length <= 12 ? adaylar : Array.from({ length: 12 }, (_, i) => adaylar[Math.floor(i * (adaylar.length - 1) / 11)]);
};

export const kartKanitlariniOlustur = kaynaklar => kaynaklar.flatMap(kaynak => {
    const sonuc = [];
    const cumleler = new Intl.Segmenter("tr", { granularity: "sentence" });
    for (const satir of kaynak.icerik.matchAll(/[^\r\n]+/gu)) {
        for (const cumle of cumleler.segment(satir[0])) {
            const metin = cumle.segment.trim();
            if (metin.length < 10 || metin.length > 320 || kartKelimeleri(metin).size < 2) continue;
            const dogal = dogalKartSeceneginiOlustur(metin);
            const secenekler = [...(dogal ? [dogal] : []), ...kartCevapAraliklariniOlustur(metin)].slice(0, 12);
            if (!secenekler.length) continue;
            const baslangic = satir.index + cumle.index + cumle.segment.indexOf(metin);
            sonuc.push({ kimlik: `${kaynak.anahtar}.E${sonuc.length + 1}`, metin, baslangic,
                bitis: baslangic + metin.length, kaynak, secenekler });
        }
    }
    return sonuc;
});

export const kartKanitiKonuyaUygunMu = (kanit, konu) => {
    if (!konu) return true;
    const hedef = kartKelimeleri(`${konu.baslik} ${konu.aciklama || ""}`), metin = kartKelimeleri(kanit.metin);
    return [...hedef].some(h => [...metin].some(m => m === h || (Math.min(m.length, h.length) >= 5 && (m.startsWith(h) || h.startsWith(m)))));
};

export const kartPartisiniDogrula = (veri, { konuId, konu, kartSayisi, kaynaklar, kanitlar = kartKanitlariniOlustur(kaynaklar), oncekiKartlar = [] }) => {
    const kartlar = [], reddedilenler = [];
    const reddet = (kartIndex, dogrulamaAltKodu) => reddedilenler.push({ kartIndex, dogrulamaAltKodu });
    if (!Array.isArray(veri?.kartlar)) {
        reddet(null, "KART_SAYISI"); return { kartlar, reddedilenler };
    }
    if (veri.kartlar.length !== kartSayisi) reddet(null, "KART_SAYISI");
    // Beklenenden fazla çıktı hedefi büyütemez; sınırsız yanıt dolaşılmaz.
    for (const [index, kart] of veri.kartlar.slice(0, kartSayisi).entries()) {
        if (kart?.konuId !== konuId) { reddet(index, "KONU_KIMLIGI"); continue; }
        if (Object.keys(kart).some(k => !["konuId", "kanitReferansi", "cevapIndex", "tur"].includes(k)) ||
            (kart.tur != null && !["soru_cevap", "bosluk_doldurma"].includes(kart.tur)) ||
            typeof kart.kanitReferansi !== "string") {
            reddet(index, "KART_ALANLARI"); continue;
        }
        const kanit = kanitlar.find(k => k.kimlik === kart.kanitReferansi);
        if (!kanit || !kaynaklar.includes(kanit.kaynak) || !Number.isSafeInteger(kanit.baslangic) ||
            !Number.isSafeInteger(kanit.bitis) || kanit.baslangic < 0 || kanit.bitis <= kanit.baslangic || kanit.bitis > kanit.kaynak.icerik.length ||
            kanit.kaynak.icerik.slice(kanit.baslangic, kanit.bitis) !== kanit.metin) {
            reddet(index, "KANIT_REFERANSI"); continue;
        }
        // Bu kontrol konuya yönlendirme içindir. Cevap doğruluğunun kanıtı,
        // kelime skoru değil aşağıda kurulan aynı cümle/boşluk ilişkisidir.
        if (!kartKanitiKonuyaUygunMu(kanit, konu)) { reddet(index, "KONU_KANIT_ILISKISI"); continue; }
        const secenek = Number.isInteger(kart.cevapIndex) && kart.cevapIndex >= 0 ? kanit.secenekler[kart.cevapIndex] : null;
        if (!secenek || !Number.isSafeInteger(secenek.baslangic) || !Number.isSafeInteger(secenek.bitis) ||
            secenek.baslangic < 0 || secenek.bitis <= secenek.baslangic || secenek.bitis > kanit.metin.length ||
            kanit.metin.slice(secenek.baslangic, secenek.bitis) !== secenek.metin ||
            (secenek.baslangic === 0 && secenek.bitis === kanit.metin.length)) {
            reddet(index, "CEVAP_ARALIGI_GECERSIZ"); continue;
        }
        const { baslangic, bitis } = secenek;
        // Serbest soru/cevap yok: boşluk aynı kaynak cümlesinde açılır. Birkaç
        // ortak sözcükten anlamsal doğruluk sonucu çıkarmaya gerek kalmaz.
        const dogal = kart.tur === "soru_cevap" ? dogalKartSeceneginiOlustur(kanit.metin) : null;
        if (kart.tur === "soru_cevap" && (!dogal || dogal.baslangic !== baslangic || dogal.bitis !== bitis)) {
            reddet(index, "CEVAP_ARALIGI_GECERSIZ"); continue;
        }
        const soru = dogal?.soru || `Boşluğu tamamlayın: ${kanit.metin.slice(0, baslangic)}[…]${kanit.metin.slice(bitis)}`;
        const cevap = kanit.metin.slice(baslangic, bitis);
        const yeni = { konuId, soru, cevap, tur: dogal ? "soru_cevap" : "bosluk_doldurma", kaynak: {
            materyalId: kanit.kaynak.materyalId, islemeId: kanit.kaynak.islemeId,
            parcaIndex: kanit.kaynak.parcaIndex, dosyaAdi: kanit.kaynak.dosyaAdi,
            ...(kanit.kaynak.metinParcasiId ? { metinParcasiId: kanit.kaynak.metinParcasiId } : {}),
            alinti: kanit.metin, kanitBaslangic: kanit.baslangic, kanitBitis: kanit.bitis,
            cevapBaslangic: kanit.baslangic + baslangic, cevapBitis: kanit.baslangic + bitis,
        } };
        if ([...oncekiKartlar, ...kartlar].some(k => kartlarBenzerMi(k, yeni) ||
            (k.kaynak?.alinti && kartMetniniNormalizeEt(k.kaynak.alinti) === kartMetniniNormalizeEt(yeni.kaynak.alinti)))) {
            reddet(index, "TEKRAR_KART"); continue;
        }
        kartlar.push(yeni);
    }
    return { kartlar, reddedilenler };
};

// V3: kavramı ve soruyu model yazar. Cevap serbest açıklama değildir: tam kaynak
// cümlesi veya bu cümledeki açık tanımın TAM cevabı olmalıdır. Böylece bir sözcük
// eşleşmesi, kesilmiş olumsuzluk veya doğru parça kimliği tek başına kanıt olmaz.
export const dogalKartPartisiniDogrula = (kartAdaylari, { konu, kaynaklar, kaynakBaglami, oncekiKartlar = [], maksimumKart = 12 }) => {
    const kartlar = [], reddedilenler = [];
    const reddet = (kartIndex, dogrulamaAltKodu) => reddedilenler.push({ kartIndex, dogrulamaAltKodu });
    if (!Array.isArray(kartAdaylari)) return { kartlar, reddedilenler: [{ kartIndex: null, dogrulamaAltKodu: "KART_ALANLARI" }] };
    if (kartAdaylari.length > maksimumKart) reddet(null, "KART_SAYISI");
    for (const [index, kart] of kartAdaylari.slice(0, maksimumKart).entries()) {
        if (!kart || kart.konuId !== konu.konuId) { reddet(index, "KONU_KIMLIGI"); continue; }
        if (Object.keys(kart).some(k => !["konuId", "metinParcasiId", "kavram", "soru", "cevap", "kanit"].includes(k)) ||
            !["metinParcasiId", "kavram", "soru", "cevap", "kanit"].every(k => typeof kart[k] === "string" && kart[k].trim())) {
            reddet(index, "KART_ALANLARI"); continue;
        }
        const kaynak = kaynaklar.find(k => String(k.metinParcasiId) === kart.metinParcasiId);
        if (!kaynak || !kaynakBaglami?.kullaniciId || !kaynakBaglami?.dersId || !kaynak.islemeId ||
            !Array.isArray(kaynakBaglami.materyaller) || String(kaynak.kullaniciId) !== String(kaynakBaglami.kullaniciId) ||
            String(kaynak.dersId) !== String(kaynakBaglami.dersId) || !konu.kaynakIds.includes(String(kaynak.materyalId)) ||
            !kaynakBaglami.materyaller.some(m => String(m._id) === String(kaynak.materyalId) && String(m.aktifIslemeId) === String(kaynak.islemeId))) {
            reddet(index, "KAYNAK_REFERANSI"); continue;
        }
        const soru = kart.soru.trim(), cevap = kart.cevap.trim(), kanit = kart.kanit.trim(), kavram = kart.kavram.trim();
        if (soru.length < 10 || soru.length > 240 || !soru.endsWith("?") || (soru.match(/\?/g) || []).length !== 1 || /[\r\n]|\[\.\.\.\]|boşluğu tamamla/iu.test(soru)) {
            reddet(index, "SORU_UZUNLUGU"); continue;
        }
        if (cevap.length < 5 || cevap.length > 600 || kavram.length > 120) { reddet(index, "CEVAP_UZUNLUGU"); continue; }
        if (kanit.length < 10 || kanit.length > 700) { reddet(index, "ALINTI_UZUNLUGU"); continue; }
        const baslangic = kaynak.icerik.indexOf(kanit);
        if (baslangic < 0) { reddet(index, "ALINTI_KAYNAKTA_YOK"); continue; }
        // Alıntı tüm bir cümle/satır olmalı; "... değildir" içinden "...dir"
        // veya koşullu bir cümleden koşulsuz sonuç kesilemez.
        const cumleler = [...kaynak.icerik.matchAll(/[^\r\n]+/gu)].flatMap(s => [...new Intl.Segmenter("tr", { granularity: "sentence" }).segment(s[0])].map(c => c.segment.trim()));
        if (!cumleler.includes(kanit)) { reddet(index, "CEVAP_ARALIGI_GECERSIZ"); continue; }
        const tanim = dogalKartSeceneginiOlustur(kanit);
        if (cevap !== kanit && cevap !== tanim?.metin) { reddet(index, "CEVAP_KANITTA_YOK"); continue; }
        const odak = kartMetniniNormalizeEt(kavram), soruMetni = kartMetniniNormalizeEt(soru), kanitMetni = kartMetniniNormalizeEt(kanit);
        if (odak.length < 2 || !(` ${kanitMetni} `).includes(` ${odak} `) || !soruMetni.includes(odak)) {
            reddet(index, "SORU_KAYNAK_ILISKISI"); continue;
        }
        // Sayısal ve özel teknik iddialar soruya da kaynaksız eklenemez.
        const baglam = kartMetniniNormalizeEt(`${kanit} ${konu.baslik} ${konu.aciklama || ""}`);
        const yeniIddia = (soru.match(/\d+(?:[.,]\d+)*|\b[A-Z]{2,}\b/gu) || []).some(t => !(` ${baglam} `).includes(` ${kartMetniniNormalizeEt(t)} `));
        if (yeniIddia) { reddet(index, "SORU_KAYNAK_ILISKISI"); continue; }
        const kavramId = createHash("sha256").update(`${konu.konuId}\0${odak}`).digest("hex").slice(0, 24);
        const cevapBaslangic = baslangic + kanit.indexOf(cevap);
        const yeni = { konuId: konu.konuId, kavram, kavramId, kavramTuru: "model_secimi", soru, cevap, tur: "soru_cevap", kaynak: {
            materyalId: kaynak.materyalId, islemeId: kaynak.islemeId, metinParcasiId: kaynak.metinParcasiId,
            parcaIndex: kaynak.parcaIndex, dosyaAdi: kaynak.dosyaAdi, alinti: kanit,
            kanitBaslangic: baslangic, kanitBitis: baslangic + kanit.length, cevapBaslangic, cevapBitis: cevapBaslangic + cevap.length,
        } };
        if ([...oncekiKartlar, ...kartlar].some(k => k.kavramId === kavramId || kartlarBenzerMi(k, yeni) ||
            kartMetniniNormalizeEt(k.kaynak?.alinti) === kanitMetni)) { reddet(index, "TEKRAR_KART"); continue; }
        kartlar.push(yeni);
    }
    return { kartlar, reddedilenler };
};

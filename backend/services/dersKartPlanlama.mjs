/** ckart ders gruplaması korunur; mevcut konu bağlantıları metne eklenir. */
import { createHash } from "node:crypto";
const hash = (v) => createHash("sha256").update(String(v)).digest("hex");
const id = (v) => String(v ?? "");
const sade = (s) => id(s).toLocaleLowerCase("tr-TR").normalize("NFKC").replace(/\s+/g, " ").trim();

const bol = (metin, limit) => {
    const sonuc = [];
    let bas = 0;
    while (bas < metin.length) {
        let bitis = Math.min(metin.length, bas + limit);
        if (bitis < metin.length) {
            const son = metin.slice(bas + Math.floor(limit * .6), bitis);
            const satir = son.lastIndexOf("\n");
            const bosluk = son.lastIndexOf(" ");
            const kesim = Math.max(satir, bosluk);
            if (kesim >= 0) bitis = bas + Math.floor(limit * .6) + kesim + 1;
        }
        const parca = metin.slice(bas, bitis);
        if (parca.trim()) sonuc.push(parca);
        bas = bitis;
    }
    return sonuc;
};

export const dersKartGruplariniOlustur = (parcalar, materyaller, {
    grupKarakterLimiti = 12000, parcaKarakterLimiti = 5200,
} = {}) => {
    if (grupKarakterLimiti < 300 || parcaKarakterLimiti < 200 ||
        grupKarakterLimiti <= parcaKarakterLimiti + 200)
        throw new Error("Metin gruplama sınırı geçersiz.");
    const adlar = new Map(materyaller.map((m) => [
        id(m._id), id(m.orijinalDosyaAdi || m.dosyaAdi || "Materyal"),
    ]));
    const sirali = [...parcalar].sort((a, b) =>
        id(a.materyalId).localeCompare(id(b.materyalId)) ||
        Number(a.parcaIndex) - Number(b.parcaIndex));
    let kodNo = 0;
    const kaynaklar = [];
    for (const p of sirali) {
        if (!adlar.has(id(p.materyalId))) continue;
        const metin = id(p.icerik);
        for (const icerik of bol(metin, Math.min(parcaKarakterLimiti, grupKarakterLimiti - 500))) {
            const kod = "K" + (++kodNo);
            kaynaklar.push({
                kod, icerik, materyalId: p.materyalId, islemeId: p.islemeId, parcaIndex: p.parcaIndex,
                dosyaAdi: adlar.get(id(p.materyalId)),
            });
        }
    }
    const gruplar = [];
    let aktif = [], karakter = 0;
    const tamamla = () => {
        if (!aktif.length) return;
        const sira = gruplar.length + 1;
        const metin = aktif.map((k) =>
            "[" + k.kod + "] DOSYA: " + k.dosyaAdi + " | BÖLÜM: " +
            k.parcaIndex + "\n" + k.icerik).join("\n\n");
        gruplar.push({ sira, kaynaklar: aktif, metin, imza: hash(metin) });
        aktif = []; karakter = 0;
    };
    for (const kaynak of kaynaklar) {
        const uzunluk = kaynak.icerik.length + kaynak.dosyaAdi.length + 120;
        if (aktif.length && karakter + uzunluk > grupKarakterLimiti) tamamla();
        aktif.push(kaynak);
        karakter += uzunluk;
    }
    tamamla();
    return gruplar;
};

// ckart'ın 12.000/5.200 karakterlik grupları ve kaynak kodları aynen korunur.
export const konuBaglantiliKartGruplariniOlustur = (parcalar, materyaller, harita, secenekler) => {
    const konular = (harita?.anaKonular || []).flatMap(ana => [
        { konuId: ana.konuId, baslik: ana.baslik },
        ...(ana.altKonular || []).map(alt => ({ konuId: alt.konuId, baslik: alt.baslik, anaKonuId: ana.konuId })),
    ]);
    if (!konular.length) throw Object.assign(new Error("Dersin hazır konu haritası bulunamadı."), {status:422,kod:"KART_KONU_HARITASI_YOK"});
    const konuMap = new Map(konular.map(k=>[k.konuId,k]));
    const key = p => [id(p.materyalId),id(p.islemeId),p.parcaIndex].join(":");
    const atamalar = new Map((harita.parcaKonuAtamalari || []).map(a=>[key(a),[...new Set(a.konuIds || [])]]));
    const aktif = new Map(materyaller.map(m=>[id(m._id),id(m.aktifIslemeId)]));
    const bagli = parcalar.filter(p=>aktif.get(id(p.materyalId))===id(p.islemeId));
    if (bagli.some(p=>!atamalar.get(key(p))?.length || atamalar.get(key(p)).some(k=>!konuMap.has(k))))
        throw Object.assign(new Error("Konu haritasında güncel metin bağlantısı eksik."),{status:422,kod:"KART_KONU_KAYNAGI_EKSIK"});
    return dersKartGruplariniOlustur(bagli,materyaller,secenekler).map(grup=>{
        const kaynaklar=grup.kaynaklar.map(k=>({...k,konuIds:atamalar.get(key(k))}));
        const ilgili=[...new Set(kaynaklar.flatMap(k=>k.konuIds))].map(k=>konuMap.get(k));
        const metin=kaynaklar.map(k=>"["+k.kod+"] DOSYA: "+k.dosyaAdi+" | BÖLÜM: "+k.parcaIndex+
            " | KONU ID: "+k.konuIds.join(", ")+"\n"+k.icerik).join("\n\n");
        return {...grup,kaynaklar,konular:ilgili,metin,
            imza:hash("ckart-konu-v1:"+JSON.stringify({konular:ilgili,kaynaklar}))};
    });
};
export const konuKartSurumuGerekliMi = (ders,harita)=>harita?.parcaAtamaSurumu===1 &&
    !String(ders?.kartDersSurumImzasi||"").startsWith("konu-v2:");

export const dersKartlariniDogrula = ({
    hamKartlar, kaynaklar, mevcutKartlar = [], konular = null,
}) => {
    const kaynakMap = new Map(kaynaklar.map((k) => [id(k.kod), k]));
    const konuMap = new Map((konular || []).map(k=>[k.konuId,k]));
    const kartAnahtari = k => konular ? id(k.konuId)+":"+sade(k.soru) : sade(k.soru);
    const gorulen = new Set(mevcutKartlar.map(kartAnahtari));
    const kartlar = [];
    let gecersiz = 0, tekrar = 0;
    for (const kart of Array.isArray(hamKartlar) ? hamKartlar : []) {
        const soru = typeof kart?.soru === "string" ? kart.soru.trim().slice(0, 1000) : "";
        const cevap = typeof kart?.cevap === "string" ? kart.cevap.trim().slice(0, 2000) : "";
        const konu = konular ? konuMap.get(kart?.konuId) : null;
        // Konuya bağlı kaynaklar; kartın birebir alıntı kaynağı değildir.
        const kodlar = konular
            ? kaynaklar.filter(k=>k.konuIds?.includes(kart?.konuId)).map(k=>k.kod)
            : Array.isArray(kart?.kaynakKodlari) ? [...new Set(kart.kaynakKodlari.map(id))] : [];
        if (!soru || !cevap || (konular && !konu) || !kodlar.length ||
            kodlar.some((kod) => !kaynakMap.has(kod))) {
            gecersiz++; continue;
        }
        const anahtar = kartAnahtari({soru,konuId:konu?.konuId});
        if (gorulen.has(anahtar)) { tekrar++; continue; }
        gorulen.add(anahtar);
        kartlar.push({
            soru, cevap, uretimYontemi: "gemini",
            ...(konu ? {konuId:konu.konuId,konuBasligi:konu.baslik} : {}),
            kaynaklar: kodlar.map((kod) => {
                const k = kaynakMap.get(kod);
                return { kod:k.kod, islemeId:k.islemeId, materyalId: k.materyalId, dosyaAdi: k.dosyaAdi,
                    parcaIndex: k.parcaIndex };
            }),
        });
    }
    return { kartlar, gecersiz, tekrar };
};

export const kartDersKaynakImzasi = (materyaller, parcalar) =>
    hash(JSON.stringify({
        surum: "ders-kart-v1",
        materyaller: materyaller.map((m) => [id(m._id), id(m.aktifIslemeId)])
            .sort((a, b) => a[0].localeCompare(b[0])),
        parcalar: parcalar.map((p) => [
            id(p.materyalId), id(p.islemeId), Number(p.parcaIndex),
            hash(id(p.icerik)),
        ]).sort((a, b) => a[0].localeCompare(b[0]) || a[2] - b[2]),
    }));

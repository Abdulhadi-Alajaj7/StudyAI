import crypto from "node:crypto";

export const HARITA_GRUP_KARAKTER = 9000;
export const haritaGrupPlani = (bloklar, limit = HARITA_GRUP_KARAKTER) => {
    const gruplar = [];
    let grup = [], boyut = 0;
    for (const blok of bloklar) {
        const ek = blok.metin.length + (grup.length ? 2 : 0);
        if (grup.length && boyut + ek > limit) {
            gruplar.push(grup); grup = []; boyut = 0;
        }
        boyut += blok.metin.length + (grup.length ? 2 : 0);
        grup.push(blok);
    }
    if (grup.length) gruplar.push(grup);
    return gruplar.map(g => ({metin: g.map(b=>b.metin).join("\n\n"), kodlar: g.map(b=>b.kod)}));
};
export const haritaPlanImzasi = (gruplar, kaynaklar, dersBilgisi) => crypto.createHash("sha256")
    .update(JSON.stringify({surum:1, gruplar, kaynaklar, dersBilgisi})).digest("hex");

export const haritaKodlariniDogrula = (konular, kodlar) => {
    const beklenen = new Set(kodlar), bulunan = new Set();
    if (!Array.isArray(konular) || !konular.length) return false;
    for (const ana of konular) {
        if (!ana?.baslik?.trim()) return false;
        for (const konu of [ana, ...(ana.altKonular || [])]) {
            if (!konu?.baslik?.trim()) return false;
            for (const kod of konu.parcaKodlari || []) {
                if (!beklenen.has(kod)) return false;
                bulunan.add(kod);
            }
        }
    }
    return bulunan.size === beklenen.size;
};

// Yalnız aynı normalize başlık ve aynı üst bağlam birleştirilir.
// Belirsiz eş anlamlıları silmek yerine koru; kaynak kodlarını birleştir.
export const haritaGruplariniBirlestir = (listeler, normalize) => {
    const anaMap = new Map();
    const birlestir = (hedef, konu) => {
        hedef.parcaKodlari = [...new Set([...(hedef.parcaKodlari || []), ...(konu.parcaKodlari || [])])];
        if ((konu.aciklama || "").length > (hedef.aciklama || "").length) hedef.aciklama = konu.aciklama;
    };
    for (const liste of listeler) for (const ana of liste) {
        const key = normalize(ana.baslik);
        if (!anaMap.has(key)) anaMap.set(key,{...ana,parcaKodlari:[],altKonular:[]});
        const hedef = anaMap.get(key);
        birlestir(hedef,ana);
        const altMap = new Map(hedef.altKonular.map(a=>[normalize(a.baslik),a]));
        for (const alt of ana.altKonular || []) {
            const k = normalize(alt.baslik);
            if (!altMap.has(k)) {
                const yeni = {...alt,parcaKodlari:[]};
                altMap.set(k,yeni); hedef.altKonular.push(yeni);
            }
            birlestir(altMap.get(k),alt);
        }
    }
    return [...anaMap.values()].map((a,i)=>({...a,sira:i+1,altKonular:a.altKonular.map((b,j)=>({...b,sira:j+1}))}));
};

export const haritaParcaliAnaliz = async ({gruplar, imza, kontrolNoktasi, analiz, kaydet, dogrula, normalize, logger=console}) => {
    const kayitlar = [];
    if (kontrolNoktasi?.imza === imza && Array.isArray(kontrolNoktasi.sonuclar)) {
        for (const [i,kayit] of kontrolNoktasi.sonuclar.entries()) {
            if (!gruplar[i] || !haritaKodlariniDogrula(kayit?.konular,gruplar[i].kodlar)) break;
            kayitlar.push(kayit);
        }
    }
    for (let i=kayitlar.length;i<gruplar.length;i++) {
        await dogrula();
        const konular = await analiz(gruplar[i]);
        if (!haritaKodlariniDogrula(konular,gruplar[i].kodlar)) {
            throw Object.assign(new Error("Parçalı harita kaynak kapsamı eksik."),{kod:"GEMINI_GECERSIZ_SEMA",status:502});
        }
        kayitlar.push({konular,model:konular.kullanilanModel || ""});
        const nokta = {imza,sonuclar:kayitlar};
        if (JSON.stringify(nokta).length > 1500000) throw new Error("Harita kontrol noktası güvenli boyut sınırını aştı.");
        await dogrula();
        await kaydet(nokta);
        logger.info?.("[KonuHaritasiBatch]",{tamamlanan:i+1,toplam:gruplar.length,model:konular.kullanilanModel});
    }
    const konular = haritaGruplariniBirlestir(kayitlar.map(k=>k.konular),normalize);
    if (!haritaKodlariniDogrula(konular,gruplar.flatMap(g=>g.kodlar))) throw new Error("Birleşik harita kaynakları eksik.");
    return {konular,modeller:[...new Set(kayitlar.map(k=>k.model).filter(Boolean))]};
};

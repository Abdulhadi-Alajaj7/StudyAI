import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
    konuHaritasiniOzetle, dersMetniniGrupla, haritaKartlariniDogrula,
} from "../services/haritaTabanliKartPlanlama.mjs";
import { haritaTabanliKartlariOlustur } from "../services/haritaTabanliKartService.js";
import { geminiIleHaritaTabanliKartUret } from "../services/geminiService.js";


const query = (v) => ({
    select() { return this; }, sort() { return this; },
    lean() { return Promise.resolve(typeof v === "function" ? v() : v); },
});
const harita = {
    anaKonular: [
        { konuId: "ana-1", baslik: "Veri Bilimi", aciklama: "Veri bilimi kavramları", altKonular: [
            { konuId: "a", baslik: "MCAR MAR MNAR", aciklama: "Veri eksikliğinin mekanizmaları" },
            { konuId: "b", baslik: "CRISP-DM", aciklama: "Proje yaşam döngüsü" },
        ] },
        { konuId: "c", baslik: "k-NN", aciklama: "Komşulara dayalı karar" },
    ],
};

test("Haritanın ana/alt hiyerarşisi ve sabit konu kimlikleri korunur", () => {
    const h = konuHaritasiniOzetle(harita);
    assert.deepEqual(h.konular.map((x) => x.konuId), ["a", "b", "c"]);
    assert.equal(h.agac[0].altKonular.length, 2);
    assert.equal(h.agac[1].konuId, "c");
});

test("Metnin tamamı konulara göre filtrelenmeden, yalnızca metin boyutuna göre ayrılır", () => {
    const materyaller = [{ _id: "m1", dosyaAdi: "Hafta_01.pdf" }, { _id: "m2", dosyaAdi: "Hafta_02.pdf" }];
    const parcalar = [
        { materyalId: "m1", parcaIndex: 0, icerik: "Zaman serileri " + "Konu dışı bilgi. ".repeat(30) },
        { materyalId: "m2", parcaIndex: 1, icerik: "Eksik veriler ve analiz. ".repeat(50) },
    ];
    const gruplar = dersMetniniGrupla(parcalar, materyaller, {
        grupKarakterLimiti: 450, bolumKarakterLimiti: 310,
    });
    assert.ok(gruplar.length > 2);
    assert.equal(gruplar.flatMap((g) => g.kaynaklar).map((k) => k.metin).join(""),
        parcalar.map((k) => k.icerik).join(""));
    assert.ok(gruplar.some((g) => g.metin.includes("Konu dışı bilgi")));
    assert.ok(gruplar.some((g) => g.metin.includes("Eksik veriler")));
    assert.ok(gruplar.flatMap((g) => g.kaynaklar).every((k) => /^K\d+$/.test(k.kod)));
});

test("Gemini 1, 2, 3 veya 8 kart seçebilir; zorunlu alt sınır yoktur", () => {
    const topic = [{ konuId: "a", baslik: "MCAR" }, { konuId: "b", baslik: "CRISP-DM" }];
    const kaynaklar = [{ kod: "K1", materyalId: "m1", dosyaAdi: "hafta.pdf", parcaIndex: 0 }];
    const liste = [
        { konuId: "a", soru: "MCAR nedir?", cevap: "Eksiklik mekanizmasıdır.", kaynakKodlari: ["K1"], onem: 5 },
        ...Array.from({ length: 10 }, (_, i) => ({
            konuId: "b", soru: "Aşama " + i + " nedir?",
            cevap: "Farklı açıklama " + i, kaynakKodlari: ["K1"], onem: 3,
        })),
    ];
    const dogrulanan = haritaKartlariniDogrula({ hamKartlar: liste, konular: topic, kaynaklar, ayrinti: true });
    assert.equal(dogrulanan.kartlar.filter((k) => k.konuId === "a").length, 1);
    assert.equal(dogrulanan.kartlar.filter((k) => k.konuId === "b").length, 8);
    assert.equal(dogrulanan.limit, 2);
    assert.ok(dogrulanan.kartlar.every((k) => k.kaynaklar.length === 1));
});

test("Sahte kaynak/yanlış konu reddedilir; eşanlamlı tekrarlar elenir", () => {
    const topic = [{ konuId: "a", baslik: "k-NN" }];
    const kaynaklar = [{ kod: "K1", materyalId: "m1", dosyaAdi: "h.pdf", parcaIndex: 4 }];
    const kartlar = [
        { konuId: "a", soru: "k-NN çoğunluk oylaması nasıl çalışır?",
            cevap: "Komşuların etiketleri oy verir.", kaynakKodlari: ["K1"], onem: 5 },
        { konuId: "a", soru: "k-NN çoğunluk oylaması nasıl çalışır?",
            cevap: "Komşu etiketleri oy verir.", kaynakKodlari: ["K1"], onem: 4 },
        { konuId: "a", soru: "Çok önemli soru?", cevap: "Yanlış kaynağa dayanır.", kaynakKodlari: ["K900"] },
        { konuId: "uydurma", soru: "Farklı konu?", cevap: "Geçersiz.", kaynakKodlari: ["K1"] },
    ];
    const sonuc = haritaKartlariniDogrula({ hamKartlar: kartlar, konular: topic, kaynaklar, ayrinti: true });
    assert.equal(sonuc.kartlar.length, 1);
    assert.equal(sonuc.tekrar, 1);
    assert.equal(sonuc.gecersiz, 2);
});

test("Gemini çağrısına bütün harita ve sadece boyut bazında ayrılmış metin gider", async () => {
    const h = konuHaritasiniOzetle(harita);
    const grup = {
        metin: "[K1] DOSYA: Hafta_03.pdf\nVeri kalitesi, CRISP-DM ve veri türleri.",
        kaynaklar: [{ kod: "K1", materyalId: "m1", dosyaAdi: "Hafta_03.pdf", parcaIndex: 0 }],
    };
    let girdi = null;
    const sonuc = await geminiIleHaritaTabanliKartUret({
        dersAdi: "Uygulamalı Veri Bilimi", konuHaritasi: h.agac, grup,
    }, {
        istekYonetimi: { yerAyir() { return () => {}; } },
        istemci: { models: { async generateContent(args) {
            girdi = args;
            return { text: JSON.stringify({ kartlar: [
                { konuId: "b", soru: "CRISP-DM nedir?", cevap: "Bir veri bilimi sürecidir.", kaynakKodlari: ["K1"], onem: 5 },
            ] }) };
        } } },
    });
    assert.equal(sonuc.kartlar.length, 1);
    assert.ok(girdi.contents.includes("MCAR MAR MNAR"));
    assert.ok(girdi.contents.includes("CRISP-DM"));
    assert.ok(girdi.contents.includes("k-NN"));
    assert.ok(girdi.contents.includes("Veri kalitesi"));
    assert.match(girdi.config.systemInstruction, /EN FAZLA 8/);
    assert.doesNotMatch(girdi.config.systemInstruction, /4.6 kart|hedef 4/);
});

const servisKur = ({ uret } = {}) => {
    const kullaniciId = new mongoose.Types.ObjectId(), dersId = new mongoose.Types.ObjectId();
    const materyalId = new mongoose.Types.ObjectId(), islemeId = new mongoose.Types.ObjectId();
    const ders = {
        _id: dersId, kullaniciId, dersAdi: "Veri Bilimi",
        materyallerOnaylandi: true, kartUretimToken: null,
        kartUretimSonYenileme: null, kartKaynakSurumImzasi: "",
        kartHaritaSurumImzasi: "", kartHaritaToplamGrupSayisi: 0,
        kartHaritaIslenenGrupImzalari: [], kartHaritaTamamlandi: false,
        kartHaritaZenginlestirmeTamamlandi: false,
        kartHaritaKapsamDenetimSurumu: 0,
        kartHaritaEksikKapsamGruplari: [], kartHaritaKapsamTamamlananGrupImzalari: [],
    };
    const materyaller = [{
        _id: materyalId, aktifIslemeId: islemeId, dosyaAdi: "Hafta_01.pdf",
    }];
    const metin = [
        { materyalId, islemeId, parcaIndex: 0, icerik: "MCAR, eksik veri türüdür." },
        { materyalId, islemeId, parcaIndex: 1, icerik: "CRISP-DM proje sürecidir." },
    ];
    const kayitli = [];
    const deps = {
        DersModel: {
            findOne(filtre) {
                if (filtre.kartUretimToken != null &&
                    String(filtre.kartUretimToken) !== String(ders.kartUretimToken)) {
                    return query(null);
                }
                return query(ders);
            },
            async findOneAndUpdate(filtre, islem) {
                if (ders.kartUretimToken) return null;
                Object.assign(ders, islem.$set || {});
                return ders;
            },
            async updateOne(filtre, islem) {
                if (String(filtre.kartUretimToken) !== String(ders.kartUretimToken)) {
                    return { matchedCount: 0 };
                }
                Object.assign(ders, islem.$set || {});
                for (const [key, value] of Object.entries(islem.$addToSet || {})) {
                    ders[key] = [...new Set([...(ders[key] || []), value])];
                }
                for (const [key, value] of Object.entries(islem.$push || {})) {
                    ders[key] = [...(ders[key] || []), value];
                }
                return { matchedCount: 1 };
            },
        },
        HaritaModel: { findOne() { return query(harita); } },
        MateryalModel: { find() { return query(materyaller); } },
        ParcaModel: { find() { return query(metin); } },
        KartModel: {
            find() { return query(() => [...kayitli]); },
            async bulkWrite(islemler) {
                for (const { updateOne } of islemler) {
                    const kart = updateOne.update.$setOnInsert;
                    if (!kayitli.some((k) => k.konuId === kart.konuId &&
                        k.soruKimligi === kart.soruKimligi)) {
                        kayitli.push({ _id: new mongoose.Types.ObjectId(), ...kart });
                    }
                }
            },
        },
        gruplama: (_p, m) => [
            { metin: "[K1] Veri kalitesi.", kaynaklar: [
                { kod: "K1", materyalId: m[0]._id, dosyaAdi: "Hafta_01.pdf", parcaIndex: 0 },
            ] },
            { metin: "[K2] CRISP-DM.", kaynaklar: [
                { kod: "K2", materyalId: m[0]._id, dosyaAdi: "Hafta_01.pdf", parcaIndex: 1 },
            ] },
        ],
        uret: uret || (async ({ grup }) => ({ kartlar: [
            { konuId: grup.kaynaklar[0].kod === "K1" ? "a" : "b",
                soru: "Temel soru " + grup.kaynaklar[0].kod + "?",
                cevap: "Kaynakla desteklenen yanıt.",
                kaynakKodlari: [grup.kaynaklar[0].kod], onem: 4 },
        ] })),
    };
    return { args: { kullaniciId, dersId }, deps, ders, kayitli };
};

test("İki bölümde 2 farklı kart üretir ve tekrardan çalıştırınca yeni kart eklemez", async () => {
    let cagrilar = 0;
    const v = servisKur();
    const temel = v.deps.uret;
    v.deps.uret = async (girdi) => { cagrilar++; return temel(girdi); };
    const ilk = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(ilk.tamamlandi, true);
    assert.equal(ilk.kartlar.length, 2);
    assert.equal(ilk.islenenGrupSayisi, 2);
    assert.equal(cagrilar, 4); // İki ilk tur + iki bağımsız kaynak kontrolü
    const tekrar = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(tekrar.kartlar.length, 2);
    assert.equal(tekrar.yeniKartSayisi, 0);
    assert.equal(cagrilar, 4); // Tamamlanan otomatik kontrol yeniden çalışmaz
});

test("İkinci bölüm hata verirse birinci kaydedilir; yeniden denemede sadece eksik bölüm işlenir", async () => {
    let hatali = true;
    const v = servisKur({ uret: async ({ grup }) => {
        if (grup.kaynaklar[0].kod === "K2" && hatali) {
            throw Object.assign(new Error("Rate limit"), { status: 429, kod: "GEMINI_KOTA_ASIMI" });
        }
        return { kartlar: [{
            konuId: grup.kaynaklar[0].kod === "K1" ? "a" : "b",
            soru: "Kavram " + grup.kaynaklar[0].kod + "?",
            cevap: "Kaynağın açıklaması.",
            kaynakKodlari: [grup.kaynaklar[0].kod], onem: 5,
        }] };
    } });
    const ilk = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(ilk.tamamlandi, false);
    assert.equal(ilk.islenenGrupSayisi, 1);
    assert.equal(ilk.kartlar.length, 1);
    hatali = false;
    const ikinci = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(ikinci.tamamlandi, true);
    assert.equal(ikinci.islenenGrupSayisi, 2);
    assert.equal(ikinci.kartlar.length, 2);
});

test("Gemini boş kart listesi döndürürse konu başına zorunlu alt sayı yoktur", async () => {
    const v = servisKur({ uret: async () => ({ kartlar: [] }) });
    const sonuc = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(sonuc.tamamlandi, true);
    assert.equal(sonuc.kartlar.length, 0);
    assert.equal(sonuc.atlananKonuSayisi, 3);
});


test("Gemini 502 JSON hatasında yalnızca bir kez daha küçük yanıt istenir", async () => {
    let sayi = 0;
    const v = servisKur({ uret: async ({ grup, kartLimiti }) => {
        sayi++;
        if (grup.kaynaklar[0].kod === "K1" && !kartLimiti) {
            throw Object.assign(new Error("Truncated JSON"), { status: 502, kod: "GEMINI_GECERSIZ_YANIT" });
        }
        return { kartlar: [{
            konuId: grup.kaynaklar[0].kod === "K1" ? "a" : "b",
            soru: "Kaynağa dayalı bilgi " + grup.kaynaklar[0].kod + "?",
            cevap: "Tanımlama yapılır.", kaynakKodlari: [grup.kaynaklar[0].kod],
        }] };
    } });
    const result = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(result.tamamlandi, true);
    assert.equal(result.kartlar.length, 2);
    assert.equal(sayi, 5); // İlk tur 3 (502 yeniden deneme dahil) + iki bağımsız kapsam kontrolü
});

test("Gemini 429 sonrasında sıradaki metin gruplarına yeni istek gönderilmez", async () => {
    let sayi = 0;
    const v = servisKur({ uret: async () => {
        sayi++;
        throw Object.assign(new Error("Quota exceeded"), { status: 429, kod: "GEMINI_KOTA_ASIMI" });
    } });
    const m = v.deps.gruplama;
    v.deps.gruplama = (p, mats) => Array.from({ length: 8 }, (_, i) => ({
        metin: "[K" + (i + 1) + "] Veri kavramı " + i,
        kaynaklar: [{
            kod: "K" + (i + 1), materyalId: mats[0]._id,
            dosyaAdi: "Hafta_01.pdf", parcaIndex: i,
        }],
    }));
    const result = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(result.tamamlandi, false);
    assert.ok(sayi <= 2);
    assert.equal(result.islenenGrupSayisi, 0);
    assert.equal(result.toplamGrupSayisi, 8);
});


test("1 kartlı konu önemli yeni bilgi içermiyorsa ikinci inceleme kart eklemez", async () => {
    let cagrilar = 0, kontrol = 0;
    const v = servisKur({ uret: async ({ grup, kapsamKontrolu }) => {
        cagrilar++;
        if (kapsamKontrolu) { kontrol++; return { kartlar: [] }; }
        const kod = grup.kaynaklar[0].kod;
        return { kartlar: [{
            konuId: kod === "K1" ? "a" : "b",
            soru: kod + " ilk temel bilgi nedir?",
            cevap: "Kaynakla desteklenen yanıt.",
            kaynakKodlari: [kod], onem: 5,
        }] };
    } });
    const sonuc = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(sonuc.tamamlandi, true);
    assert.equal(sonuc.kartlar.length, 2);
    assert.equal(cagrilar, 4);
    assert.equal(kontrol, 2);
    assert.equal(sonuc.kapsamKontroluYeniKartSayisi, 0);
    assert.equal(v.ders.kartHaritaZenginlestirmeTamamlandi, true);
    assert.equal(v.ders.kartHaritaKapsamDenetimSurumu, 2);
});

test("4 kartlı bir konuda bağımsız denetim bilgi eksiği görürse yeni kart ekler", async () => {
    const denetlenen = [];
    let cagrilar = 0;
    const v = servisKur({ uret: async ({ grup, kapsamKontrolu, oncekiSorular }) => {
        cagrilar++;
        const kod = grup.kaynaklar[0].kod;
        if (kapsamKontrolu) {
            denetlenen.push(kod);
            assert.ok(oncekiSorular.length >= 5, "Mevcut kartlar kontrol sırasında Gemini'ye gönderilmeli");
            return { kartlar: kod === "K1" ? [{
                konuId: "a",
                soru: "Eksik kalmış başka bir önemli kavramın amacı nedir?",
                cevap: "Kaynakta yer alan farklı bir mekanizmayı açıklar.",
                kaynakKodlari: [kod], onem: 5,
            }] : [] };
        }
        return { kartlar: Array.from({ length: kod === "K1" ? 4 : 1 }, (_, i) => ({
            konuId: kod === "K1" ? "a" : "b",
            soru: kod + " öğretici soru " + (i + 1) + " nedir?",
            cevap: "Farklı açıklama " + (i + 1) + ".",
            kaynakKodlari: [kod], onem: 5,
        })) };
    } });
    const sonuc = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(sonuc.tamamlandi, true);
    assert.equal(sonuc.kartlar.length, 6);
    assert.equal(sonuc.kapsamKontroluYeniKartSayisi, 1);
    assert.deepEqual(denetlenen.sort(), ["K1", "K2"]);
    assert.equal(cagrilar, 4);
    const tekrar = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(tekrar.kartlar.length, 6);
    assert.equal(cagrilar, 4); // Tamamlanan denetim ikinci kez çalışmaz.
});

test("Bağımsız denetim 503 ile durursa kartlar korunur ve yalnız kalan gruplardan sürer", async () => {
    let deneme = 0, ilkTur = 0;
    const v = servisKur({ uret: async ({ grup, kapsamKontrolu }) => {
        const kod = grup.kaynaklar[0].kod;
        if (kapsamKontrolu) {
            if (kod === "K2") return { kartlar: [] };
            deneme++;
            if (deneme === 1) throw Object.assign(new Error("unavailable"), { status: 503 });
            return { kartlar: [{
                konuId: "a",
                soru: "İlk turda sorulmamış başka bir kavramın işlevi nedir?",
                cevap: "Kaynağa dayalı ikinci açıklama.",
                kaynakKodlari: [kod],
            }] };
        }
        ilkTur++;
        return { kartlar: [{
            konuId: kod === "K1" ? "a" : "b",
            soru: "İlk kaynak kavramı " + kod + "?",
            cevap: "Kaynağın ilk açıklaması.",
            kaynakKodlari: [kod],
        }] };
    } });
    const ilk = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(ilk.tamamlandi, false);
    assert.equal(ilk.kartlar.length, 2);
    assert.equal(ilk.islenenGrupSayisi, 2);
    assert.ok(ilk.kapsamKontroluBekleyenGrupSayisi >= 1);
    const son = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(son.tamamlandi, true);
    assert.equal(son.kartlar.length, 3);
    assert.equal(deneme, 2);
    assert.equal(ilkTur, 2); // İlk tur yeniden üretilmedi.
});

test("Eski tamamlandı işaretli ama eksik üretilmiş derslerde yalnız yeni denetim açılır", async () => {
    let ilkTur = 0, denetim = 0;
    let sonradan = false;
    const v = servisKur({ uret: async ({ grup, kapsamKontrolu }) => {
        const kod = grup.kaynaklar[0].kod;
        if (!kapsamKontrolu) {
            ilkTur++;
            return { kartlar: [{
                konuId: kod === "K1" ? "a" : "b",
                soru: "Özgün ilk kart " + kod + "?",
                cevap: "Kaynakta yer alan cevap.", kaynakKodlari: [kod],
            }] };
        }
        denetim++;
        if (!sonradan || kod !== "K1") return { kartlar: [] };
        return { kartlar: [{
            konuId: "a", soru: "Eski derste kaçırılmış önemli bir kavram nedir?",
            cevap: "Yeni incelemede bulunan ek kavramdır.",
            kaynakKodlari: [kod],
        }] };
    } });
    const once = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(once.kartlar.length, 2);
    assert.equal(ilkTur, 2);
    const ilkKartIdleri = v.kayitli.map((k) => String(k._id));
    v.ders.kartHaritaKapsamDenetimSurumu = 1;
    v.ders.kartHaritaZenginlestirmeTamamlandi = true;
    // Eski sürüm kontrol edilmiş grup işaretlerini yeni turda sıfırlamalı.
    v.ders.kartHaritaKapsamTamamlananGrupImzalari = [...v.ders.kartHaritaIslenenGrupImzalari];
    sonradan = true;
    const sonra = await haritaTabanliKartlariOlustur(v.args, v.deps);
    assert.equal(sonra.tamamlandi, true);
    assert.equal(sonra.kartlar.length, 3);
    assert.equal(ilkTur, 2, "Eski kartların üretimi tekrarlanmamalı");
    assert.equal(denetim, 4);
    assert.deepEqual(v.kayitli.slice(0, 2).map((k) => String(k._id)), ilkKartIdleri);
    assert.equal(v.ders.kartHaritaKapsamDenetimSurumu, 2);
    assert.equal(v.ders.kartHaritaZenginlestirmeTamamlandi, true);
});

test("Açık başka konu başlığıyla eşleşen kart yanlış konu altında kaydedilmez", () => {
    const konular = [
        { konuId: "a", baslik: "Naive Bayes", aciklama: "Olasılıksal sınıflandırma" },
        { konuId: "b", baslik: "Görselleştirme ile Veri Keşfi", aciklama: "Histogram ve kutu grafiği" },
    ];
    const kaynaklar = [{ kod: "K1", materyalId: "m1", dosyaAdi: "h.pdf", parcaIndex: 0 }];
    const hamKartlar = [
        { konuId: "a", soru: "Görselleştirme ile Veri Keşfi neden önemlidir?",
            cevap: "Veri dağılımını gösterir.", kaynakKodlari: ["K1"] },
        { konuId: "b", soru: "Görselleştirme ile Veri Keşfi neden önemlidir?",
            cevap: "Veri dağılımını gösterir.", kaynakKodlari: ["K1"] },
        { konuId: "a", soru: "Naive Bayes hangi varsayıma dayanır?",
            cevap: "Koşullu bağımsızlık.", kaynakKodlari: ["K1"] },
    ];
    const sonuc = haritaKartlariniDogrula({ hamKartlar, konular, kaynaklar, ayrinti: true });
    assert.equal(sonuc.gecersiz, 1);
    assert.equal(sonuc.kartlar.length, 2);
    assert.deepEqual(sonuc.kartlar.map(k => k.konuId), ["b", "a"]);
});


test("Gemini ilk turda yalnız kart üretir, ikinci turda mevcut cevaplarla eksik kapsamı inceler", async () => {
    const h = konuHaritasiniOzetle(harita);
    const grup = {
        metin: "[K1] DOSYA: hafta.pdf\nCRISP-DM için Deployment önemli bir aşamadır.",
        kaynaklar: [{ kod: "K1", materyalId: "m1", dosyaAdi: "hafta.pdf", parcaIndex: 0 }],
    };
    const istekler = [];
    const istemci = { models: { async generateContent(args) {
        istekler.push(args);
        return { text: JSON.stringify({ kartlar: [{
            konuId: "b", soru: "CRISP-DM nedir?",
            cevap: "Veri madenciliği süreç çerçevesidir.",
            kaynakKodlari: ["K1"], onem: 5,
        }] }) };
    } } };
    const opts = { istemci, istekYonetimi: { yerAyir() { return () => {}; } } };
    const ilk = await geminiIleHaritaTabanliKartUret({
        dersAdi: "Veri Bilimi", konuHaritasi: h.agac, grup,
    }, opts);
    assert.equal(ilk.kartlar.length, 1);
    assert.doesNotMatch(istekler[0].config.systemInstruction, /eksikOnemliNoktalar/);
    assert.match(istekler[0].config.systemInstruction, /İLK ÜRETİM TURUDUR/);
    const ikinci = await geminiIleHaritaTabanliKartUret({
        dersAdi: "Veri Bilimi", konuHaritasi: h.agac, grup,
        kapsamKontrolu: true, oncekiSorular: ilk.kartlar,
    }, opts);
    assert.equal(ikinci.kartlar.length, 1);
    assert.match(istekler[1].config.systemInstruction, /EKSİK ÖNEMLİ BİLGİLERİ TAMAMLAMAK/);
    assert.match(istekler[1].contents, /KAYDEDİLMİŞ KARTLAR/);
    assert.match(istekler[1].contents, /Veri madenciliği süreç çerçevesidir/);
});

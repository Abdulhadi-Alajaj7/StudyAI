import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import CalismaKarti from "../models/CalismaKarti.js";
import {
    konuListesiOlustur,
    makulKartSayisiniBelirle,
    konuKotalariniBelirle,
    partiKaynaklariniOlustur,
    kartAdaylariniDogrula,
    kaynakMetnindenYedekKartOlustur,
    konuOdakliIcerikSec,
    sinirliParalelKartPartileri,
} from "../services/kartUretimPlanlama.mjs";

test("Alt konu kimlikleri korunur", () => {
    const harita = { anaKonular: [
        { konuId: "a", baslik: "A", altKonular: [{ konuId: "a1", baslik: "A1" }] },
        { konuId: "b", baslik: "B" },
    ] };
    assert.deepEqual(konuListesiOlustur(harita).map(k => k.konuId), ["a1", "b"]);
});

test("Ders genelinde 60 kart sınırı yoktur; konu başına 8 sınırı korunur", () => {
    assert.equal(makulKartSayisiniBelirle({ konuSayisi: 500, karakterSayisi: 1000000 }), 910);
    assert.equal(makulKartSayisiniBelirle({ konuSayisi: 1, karakterSayisi: 50 }), 0);
    const konular = Array.from({ length: 20 }, (_, i) => ({
        konuId: "konu-" + i, parcalar: [{}], karakterSayisi: 100000,
    }));
    const plan = konuKotalariniBelirle(konular, 160);
    assert.equal(plan.reduce((toplam, k) => toplam + k.adet, 0), 160);
    assert.ok(plan.every(k => k.adet <= 8));
});

test("Bir partide kaynak kodları tüm konular arasında benzersizdir", () => {
    const gruplar = [
        { konuId: "a", baslik: "Birinci", adet: 4, parcalar: [{ materyalId: "m1", parcaIndex: 0, icerik: "A".repeat(120) }] },
        { konuId: "b", baslik: "İkinci", adet: 4, parcalar: [{ materyalId: "m2", parcaIndex: 1, icerik: "B".repeat(120) }] },
    ];
    const sonuc = partiKaynaklariniOlustur(gruplar, new Map([["m1", "ilk.pdf"], ["m2", "son.pdf"]]), p => p);
    assert.equal(sonuc.length, 2);
    assert.equal(sonuc[0].kaynaklar[0].kod, "K1");
    assert.equal(sonuc[1].kaynaklar[0].kod, "K2");
});

test("Yabancı konu ve başka konuya ait kanıtlar reddedilir", () => {
    const konular = [
        { konuId: "a", baslik: "Birinci", adet: 2, kaynaklar: [{ kod: "K1", materyalId: "m1", dosyaAdi: "ilk.pdf", parcaIndex: 0 }] },
        { konuId: "b", baslik: "İkinci", adet: 2, kaynaklar: [{ kod: "K2", materyalId: "m2", dosyaAdi: "son.pdf", parcaIndex: 0 }] },
    ];
    const sonuc = kartAdaylariniDogrula({
        konular,
        cevap: { kartlar: [
            { konuId: "a", soru: "A nedir?", cevap: "Tanım A", kaynakKodlari: ["K1"] },
            { konuId: "a", soru: "A nedir?", cevap: "Tekrar", kaynakKodlari: ["K1"] },
            { konuId: "a", soru: "Yanlış kaynak?", cevap: "Yanlış", kaynakKodlari: ["K2"] },
            { konuId: "uydurma", soru: "Yabancı?", cevap: "Olmaz", kaynakKodlari: ["K1"] },
            { konuId: "b", soru: "B nedir?", cevap: "Tanım B", kaynakKodlari: ["K2"] },
        ] },
    });
    assert.deepEqual(sonuc.map(k => k.soru), ["A nedir?", "B nedir?"]);
    assert.equal(sonuc[0].kaynaklar[0].dosyaAdi, "ilk.pdf");
});

test("Yanıtla istenen sayı aşılsa bile konu sınırı korunur", () => {
    const konular = [{ konuId: "a", baslik: "A", adet: 2,
        kaynaklar: [{ kod: "K1", materyalId: "m1", dosyaAdi: "m.pdf", parcaIndex: 1 }] }];
    const cevap = { kartlar: Array.from({ length: 12 }, (_, i) => ({
        konuId: "a", soru: "Soru " + i, cevap: "Cevap " + i, kaynakKodlari: ["K1"],
    })) };
    assert.equal(kartAdaylariniDogrula({ konular, cevap }).length, 2);
});

test("KonuId eksik ama tek doğru kaynak kodu varsa Gemini kartı güvenle kurtarılır", () => {
    const konular = [{
        konuId: "alt-1", baslik: "Eksik Veri", adet: 3,
        kaynaklar: [{ kod: "K7", materyalId: "m1", dosyaAdi: "hafta3.pdf", parcaIndex: 4 }],
    }];
    const kartlar = kartAdaylariniDogrula({
        konular,
        cevap: { kartlar: [{ soru: "Eksik veri nedir?", cevap: "Gözlemdeki boş değer.", kaynakKodlari: ["K7"] }] },
    });
    assert.equal(kartlar.length, 1);
    assert.equal(kartlar[0].konuId, "alt-1");
    assert.equal(kartlar[0].uretimYontemi, "gemini");
});

test("Ders slaytındaki başlığın ardından gelen açıklama yedek kart olur", () => {
    const konu = {
        konuId: "sub-siniflandirma", baslik: "Sınıflandırma", adet: 4,
        kaynaklar: [{
            kod: "K1", materyalId: "m1", dosyaAdi: "hafta5.pdf", parcaIndex: 2,
            icerik: "Sınıflandırma Nedir?\nVeri kümesinde her örneğin bir sınıf etiketi vardır.\nAmaç yeni veya bilinmeyen örneğin sınıfını tahmin etmektir.",
        }],
    };
    const kart = kaynakMetnindenYedekKartOlustur(konu);
    assert.ok(kart);
    assert.equal(kart.uretimYontemi, "kaynak");
    assert.match(kart.cevap, /sınıf etiketi/);
    assert.equal(kart.kaynaklar[0].dosyaAdi, "hafta5.pdf");
});

test("Kaynakta konuya dair sözcük veya yakın açıklama yoksa uydurma kart üretilmez", () => {
    const konu = {
        konuId: "c", baslik: "Naive Bayes", adet: 2,
        kaynaklar: [{
            kod: "K9", materyalId: "m1", dosyaAdi: "not.pdf", parcaIndex: 4,
            icerik: "Yazılım mühendisliğinde tasarım farklı aşamalardan oluşur. Planlama ekip içinde dikkatli bir şekilde sürdürülür.",
        }],
    };
    assert.equal(kaynakMetnindenYedekKartOlustur(konu), null);
});

test("Kısa sınav tekrarı notundaki gerçek bilgi korunarak kart yapılır", () => {
    const kart = kaynakMetnindenYedekKartOlustur({
        konuId: "array", baslik: "Array yapısı ve indeksleme",
        adet: 4,
        kaynaklar: [{
            kod: "K1", materyalId: "m9", dosyaAdi: "09_Sinav_Oncesi_Hizli_Tekrar.txt",
            parcaIndex: 0, icerik: "1. Array: İndeksle erişim hızlıdır. Tipik erişim O(1).\n2. Stack: LIFO - son giren ilk çıkar.",
        }],
    });
    assert.ok(kart);
    assert.match(kart.cevap, /İndeksle erişim hızlıdır/);
    assert.equal(kart.uretimYontemi, "kaynak");
});

test("Yalnızca çalışın/öğrenin diyen tekrar şablonu yanlış bilgi kartına dönüşmez", () => {
    const kart = kaynakMetnindenYedekKartOlustur({
        konuId: "bubble", baslik: "Bubble Sort", adet: 3,
        kaynaklar: [{
            kod: "K1", materyalId: "m7", dosyaAdi: "07_Siralama_Algoritmalari.pptx",
            parcaIndex: 0,
            icerik: "Bubble Sort konusunun tanımını, temel işlemlerini ve kullanım alanlarını öğren. Çalışırken işlem adımlarını küçük bir örnek üzerinde uygula.",
        }],
    });
    assert.equal(kart, null);
});

test("Uzun belgede başta değil, doğru başlığın yanındaki kanıt seçilir", () => {
    const metin = "Başka ders bilgisi. ".repeat(100) +
        "\nBinary Search\nBinary Search sıralı veride uygulanır ve O(log n) erişim sağlar.";
    const secilen = konuOdakliIcerikSec(metin, "Binary Search", 400);
    assert.match(secilen, /Binary Search sıralı veride/);
    assert.ok(secilen.length <= 400);
});

test("Kaynağı olmayan kart yalnızca açıkça genel bilgi olarak etiketlenirse kabul edilir", () => {
    const konular = [{ konuId: "k1", baslik: "Stack", adet: 3, kaynaklar: [{ kod: "K1", materyalId: "m1", dosyaAdi: "dosya.pdf", parcaIndex: 0 }] }];
    const sonuc = kartAdaylariniDogrula({
        konular, cevap: { kartlar: [
            { konuId: "k1", soru: "Kaynak yok 1?", cevap: "A", kaynakKodlari: [] },
            { konuId: "k1", soru: "Genel bilgi nedir?", cevap: "LIFO kuralı.", bilgiTuru: "genel", kaynakKodlari: [] },
            { konuId: "k1", soru: "Uydurma dosya?", cevap: "B", bilgiTuru: "kaynak", kaynakKodlari: ["K999"] },
        ] },
    });
    assert.equal(sonuc.length, 1);
    assert.equal(sonuc[0].uretimYontemi, "genel");
    assert.deepEqual(sonuc[0].kaynaklar, []);
});

test("Mongoose genel bilgi kartını kaynaksız kabul eder, kaynak kartını reddeder", async () => {
    const temel = {
        kullaniciId: new mongoose.Types.ObjectId(),
        dersId: new mongoose.Types.ObjectId(),
        konuId: "k1", konuBasligi: "Stack",
        soru: "LIFO nedir?", cevap: "Son giren ilk çıkar.", kaynaklar: [],
    };
    await new CalismaKarti({ ...temel, uretimYontemi: "genel" }).validate();
    await assert.rejects(new CalismaKarti({ ...temel, uretimYontemi: "gemini" }).validate());
});

test("Hızlı üretim partileri eşzamanlı en fazla iki istek gönderir; hata diğer partileri durdurmaz", async () => {
    const indeksler = Array.from({ length: 11 }, (_, i) => i);
    let aktif = 0;
    let maksimum = 0;
    const sonuc = await sinirliParalelKartPartileri(indeksler, async (sayi) => {
        aktif += 1;
        maksimum = Math.max(maksimum, aktif);
        await new Promise((resolve) => setTimeout(resolve, 3));
        aktif -= 1;
        if (sayi === 4) throw Object.assign(new Error("quota"), { status: 429 });
        return sayi * 2;
    }, 10);
    assert.equal(maksimum, 2);
    assert.equal(sonuc.length, 11);
    assert.equal(sonuc[4].status, "rejected");
    assert.equal(sonuc[10].status, "fulfilled");
    assert.equal(sonuc[10].value, 20);
});

import test from "node:test";
import assert from "node:assert/strict";
import { geminiIleCalismaKartlariUret } from "../services/geminiService.js";
import { kartlarBenzerMi, kartYanitiniDogrula } from "../utils/calismaKartiDogrulama.js";
import { kartKanitlariniOlustur, kartPartisiniDogrula } from "../utils/calismaKartiKanit.js";

const kaynak = { anahtar: "K1", materyalId: "materyal", islemeId: "surum", parcaIndex: 0, dosyaAdi: "ders.pdf", icerik: "Yığın veri yapısı LIFO çalışma ilkesini kullanır. Kuyruk veri yapısı FIFO çalışma ilkesini kullanır." };
const secim = (k, kanitReferansi, metin) => ({ konuId: "yigin", kanitReferansi,
    cevapIndex: kartKanitlariniOlustur([k]).find(e => e.kimlik === kanitReferansi)?.secenekler.findIndex(s => s.metin === metin) ?? -1 });
const kart = secim(kaynak, "K1.E1", "LIFO");
const girdi = { konu: { konuId: "yigin", baslik: "Yığın" }, kartSayisi: 1, kaynaklar: [kaynak] };
const uret = (yanit, ek = {}, g = girdi) => geminiIleCalismaKartlariUret(g, {
    istemci: { models: { generateContent: async () => yanit } }, maxDeneme: 1, bekle: async () => {}, ...ek,
});
const yanit = kartlar => ({ text: JSON.stringify({ kartlar }) });

test("kanıt kimliği ve gerçek aralıkla soru/cevap sunucuda oluşturulur", async () => {
    let istek;
    const sonuc = await uret(null, { istemci: { models: { async generateContent(g) {
        istek = g; return yanit([kart]);
    } } } });
    const [k] = sonuc.kartlar;
    assert.equal(k.konuId, "yigin"); assert.equal(k.kaynak.islemeId, "surum");
    assert.equal(k.cevap, "LIFO"); assert.match(k.soru, /Yığın.*\[.…?\]|Yığın.*\[.*\]/u);
    assert.equal(kaynak.icerik.slice(k.kaynak.cevapBaslangic, k.kaynak.cevapBitis), k.cevap);
    assert.equal(kaynak.icerik.slice(k.kaynak.kanitBaslangic, k.kaynak.kanitBitis), k.kaynak.alinti);
    assert.equal(istek.config.responseJsonSchema.properties.kartlar.maxItems, 1);
    assert.match(istek.config.systemInstruction, /güvenilmeyen/);
    const prompt = JSON.parse(istek.contents);
    assert.ok(prompt.kanitlar.every(k => k.kimlik && k.metin));
    assert.equal(istek.config.responseJsonSchema.properties.kartlar.items.properties.cevap, undefined);
});

test("boş, bozuk ve MAX_TOKENS JSON başarı değildir; otomatik bozuk yanıt tekrarı yoktur", async () => {
    for (const [response, altKod] of [[{ text: "" }, "BOS_YANIT"], [{ text: '{"kartlar":[' }, "JSON_PARSE"],
        [{ ...yanit([kart]), candidates: [{ finishReason: "MAX_TOKENS" }] }, "CIKTI_TOKEN_SINIRI"]]) {
        let sayi = 0;
        await assert.rejects(uret(null, { maxDeneme: 3, istemci: { models: { async generateContent() { sayi++; return response; } } } }), h => {
            assert.equal(h.kod, "GEMINI_GECERSIZ_YANIT"); assert.equal(h.tanilama.dogrulamaAltKodu, altKod); return true;
        });
        assert.equal(sayi, 1);
    }
});

test("yanlış konu, sahte kanıt, ilgisiz alıntı ve uydurma cevap ayrı reddedilir", async () => {
    for (const [degisim, altKod] of [[{ konuId: "kuyruk" }, "KONU_KIMLIGI"], [{ kanitReferansi: "K99.E1" }, "KANIT_REFERANSI"],
        [{ ...secim(kaynak, "K1.E2", "FIFO") }, "KONU_KANIT_ILISKISI"],
        [{ cevapIndex: 99 }, "CEVAP_ARALIGI_GECERSIZ"]]) {
        const r = await uret(yanit([{ ...kart, ...degisim }]));
        assert.equal(r.kartlar.length, 0); assert.equal(r.reddedilenler[0].dogrulamaAltKodu, altKod);
        assert.doesNotMatch(JSON.stringify(r.reddedilenler), /sentetik-gizli/);
    }
});

test("aynı soru ve aynı kanıt tekrarı reddedilir, farklı kavramlar ortak kalıp nedeniyle elenmez", async () => {
    const r = await uret(yanit([kart, kart]), {}, { ...girdi, kartSayisi: 2 });
    assert.equal(r.kartlar.length, 1); assert.equal(r.reddedilenler[0].dogrulamaAltKodu, "TEKRAR_KART");
    const tekrar = await uret(yanit([kart]), {}, { ...girdi, oncekiKartlar: r.kartlar });
    assert.equal(tekrar.kartlar.length, 0); assert.equal(tekrar.reddedilenler[0].dogrulamaAltKodu, "TEKRAR_KART");
    assert.equal(kartlarBenzerMi({ soru: "Yığın veri yapısı elemanlarını hangi çalışma ilkesine göre işler?", cevap: "LIFO" },
        { soru: "Kuyruk veri yapısı elemanlarını hangi çalışma ilkesine göre işler?", cevap: "FIFO" }), false);
    assert.equal(kartlarBenzerMi({ soru: "Yığın nedir?", cevap: "LIFO" }, { soru: "Yığın nedir!", cevap: "FIFO" }), true);
});

test("503 sınırlı backoff ile denenir; gerçek SDK sayısı bütçeye dahil edilir", async () => {
    const beklemeler = [], apiCagriButcesi = { maksimum: 3, kullanilan: 0 }; let sayi = 0;
    const sonuc = await uret(null, { maxDeneme: 3, rastgele: () => 0, bekle: async ms => beklemeler.push(ms),
        istemci: { models: { async generateContent() {
            if (++sayi < 3) throw Object.assign(new Error("sentetik"), { status: 503 });
            return yanit([kart]);
        } } },
    }, { ...girdi, apiCagriButcesi });
    assert.equal(sonuc.kartlar.length, 1); assert.equal(sayi, 3); assert.equal(apiCagriButcesi.kullanilan, 3);
    assert.deepEqual(beklemeler, [1000, 2000]);
});

test("tek çağrılık bütçede 503 kaynak/bütçe hatasıyla karıştırılmaz; ikinci SDK çağrısı yoktur", async () => {
    const apiCagriButcesi = { maksimum: 1, kullanilan: 0 }; let sayi = 0;
    await assert.rejects(uret(null, { maxDeneme: 3, istemci: { models: { async generateContent() {
        sayi++; throw Object.assign(new Error("sentetik-503"), { status: 503 });
    } } } }, { ...girdi, apiCagriButcesi }), h => h.kod === "GEMINI_GECICI_HATA" && h.tanilama.gercekDenemeSayisi === 1 && h.tanilama.orijinalHttpDurumu === 503);
    assert.equal(sayi, 1); assert.equal(apiCagriButcesi.kullanilan, 1);
});

test("günlük kota tekrar edilmez; kaynak, kanıt veya hak yoksa SDK çağrılmaz", async () => {
    let sayi = 0;
    await assert.rejects(uret(null, { maxDeneme: 3, istemci: { models: { async generateContent() {
        sayi++; throw Object.assign(new Error(JSON.stringify({ error: { code: 429, message: "RequestsPerDay quota" } })), { status: 429 });
    } } } }), h => h.kod === "GEMINI_GUNLUK_KOTA");
    assert.equal(sayi, 1);
    for (const g of [{ ...girdi, kartSayisi: 5 }, { ...girdi, kaynaklar: [] },
        { ...girdi, kaynaklar: [{ ...kaynak, icerik: " " }] }, { ...girdi, apiCagriButcesi: { maksimum: 1, kullanilan: 1 } }]) {
        await assert.rejects(uret(null, {}, g), h => [422, 429].includes(h.status));
    }
});

const uzunKaynak = { ...kaynak, icerik: "Yığın veri yapısı LIFO çalışma ilkesini kullanır. Kuyruk elemanları FIFO sırasıyla çıkarılır. Bağlı listenin düğümleri işaretçilerle bağlanır. İkili arama sıralı dizinin ortasını karşılaştırır." };
const dortKart = [secim(uzunKaynak, "K1.E1", "LIFO"), secim(uzunKaynak, "K1.E2", "FIFO"),
    secim(uzunKaynak, "K1.E3", "işaretçilerle"), secim(uzunKaynak, "K1.E4", "ortasını")];

test("dört karttan birinin hatalı olması üç geçerli kartı kaybettirmez", async () => {
    const r = await uret(yanit([...dortKart.slice(0, 3), { ...dortKart[3], kanitReferansi: "sahte" }]), {},
        { ...girdi, konu: { konuId: "yigin", baslik: "Veri Yapıları", aciklama: "Yığın kuyruk bağlı liste ikili arama" }, kartSayisi: 4, kaynaklar: [uzunKaynak] });
    assert.equal(r.kartlar.length, 3);
    assert.deepEqual(r.reddedilenler, [{ kartIndex: 3, dogrulamaAltKodu: "KANIT_REFERANSI" }]);
});

test("eksik sayı geçerli kartı silmez; fazla çıktı hedefi artıramaz", () => {
    const ayar = { konuId: "yigin", kartSayisi: 4, kaynaklar: [uzunKaynak] };
    const eksik = kartPartisiniDogrula({ kartlar: dortKart.slice(0, 3) }, ayar);
    assert.equal(eksik.kartlar.length, 3); assert.equal(eksik.reddedilenler[0].dogrulamaAltKodu, "KART_SAYISI");
    const fazla = kartPartisiniDogrula({ kartlar: [...dortKart, kart] }, ayar);
    assert.equal(fazla.kartlar.length, 4); assert.equal(fazla.reddedilenler[0].dogrulamaAltKodu, "KART_SAYISI");
});

test("Türkçe harfler, gerçek aralıklar ve olumsuzluk korunur; kelimenin yarısı gizlenmez", () => {
    const k = { ...kaynak, icerik: "  YIĞIN veri yapısı FIFO ilkesini kullanmaz.  " };
    const ks = kartKanitlariniOlustur([k]);
    const r = kartPartisiniDogrula({ kartlar: [secim(k, "K1.E1", "FIFO")] }, { konuId: "yigin", kartSayisi: 1, kaynaklar: [k], kanitlar: ks });
    assert.equal(r.kartlar[0].cevap, "FIFO"); assert.match(r.kartlar[0].soru, /kullanmaz/);
    assert.equal(k.icerik.slice(r.kartlar[0].kaynak.cevapBaslangic, r.kartlar[0].kaynak.cevapBitis), "FIFO");
    assert.ok(!ks[0].secenekler.some(s => s.metin === "FIF"));
    const yari = kartPartisiniDogrula({ kartlar: [{ ...kart, cevapIndex: 99 }] }, { konuId: "yigin", kartSayisi: 1, kaynaklar: [k] });
    assert.equal(yari.kartlar.length, 0);
});

test("satır sonundaki noktasız bilgi ve ondalık değerler bozulmadan kanıt olur", () => {
    const k = { ...kaynak, icerik: "Pi yaklaşık 3.14 değerindedir\nYığın verileri LIFO düzeninde işler" };
    const kanitlar = kartKanitlariniOlustur([k]);
    assert.equal(kanitlar.length, 2); assert.match(kanitlar[0].metin, /3\.14/);
    for (const kanit of kanitlar) assert.equal(k.icerik.slice(kanit.baslangic, kanit.bitis), kanit.metin);
});

test("cevap metni modele yazdırılmaz; indeks ve sunucu aralığı doğrulanmadan kart kabul edilmez", async () => {
    let istek;
    await uret(null, { istemci: { models: { async generateContent(g) { istek = g; return yanit([kart]); } } } });
    const kanit = JSON.parse(istek.contents).kanitlar.find(k => k.kimlik === kart.kanitReferansi);
    assert.equal(kanit.cevaplar[kart.cevapIndex], "LIFO");
    const props = istek.config.responseJsonSchema.properties.kartlar.items.properties;
    assert.equal(props.gizlenecekMetin, undefined); assert.equal(props.cevapIndex.type, "integer");
    for (const cevapIndex of [-1, 99, 0.5, "3", null]) {
        const r = await uret(yanit([{ ...kart, cevapIndex }]));
        assert.equal(r.kartlar.length, 0); assert.equal(r.reddedilenler[0].dogrulamaAltKodu, "CEVAP_ARALIGI_GECERSIZ");
    }
    const metin = await uret(yanit([{ ...kart, gizlenecekMetin: "LIFO" }]));
    assert.equal(metin.kartlar.length, 0); assert.equal(metin.reddedilenler[0].dogrulamaAltKodu, "KART_ALANLARI");
    const kanitlar = kartKanitlariniOlustur([kaynak]);
    for (const k of kanitlar) {
        assert.ok(k.secenekler.length > 0 && k.secenekler.length <= 12);
        for (const s of k.secenekler) assert.equal(k.metin.slice(s.baslangic, s.bitis), s.metin);
    }
    kanitlar[0].secenekler[kart.cevapIndex].metin = "sentetik-sahte-metin";
    const bozuk = kartPartisiniDogrula({ kartlar: [kart] }, { konuId: "yigin", kartSayisi: 1, kaynaklar: [kaynak], kanitlar });
    assert.equal(bozuk.kartlar.length, 0); assert.equal(bozuk.reddedilenler[0].dogrulamaAltKodu, "CEVAP_ARALIGI_GECERSIZ");
});

test("doğru yeniden ifade ile uydurma cevap sözcük benzerliğiyle onaylanmaz; kanıttan soru kurulur", async () => {
    // Serbest yeniden ifade için güvenilir anlamsal hakemimiz yok. Yeni protokol
    // cevabı modelden istemez: kaynak cümlesindeki aynı boşluk deterministik doldurulur.
    for (const cevap of ["Son giren ilk çıkar", "Kuyruk yığından hızlıdır"]) {
        const r = await uret(yanit([{ ...kart, cevap }]));
        assert.equal(r.kartlar.length, 0); assert.equal(r.reddedilenler[0].dogrulamaAltKodu, "KART_ALANLARI");
    }
    assert.equal((await uret(yanit([kart]))).kartlar[0].cevap, "LIFO");
});

test("V1 doğrulayıcının eski konu, uzunluk, alıntı ve cevap ret regresyonları korunur", () => {
    const eski = { konuId: "yigin", soru: "Yığın hangi çalışma ilkesini kullanır?", cevap: "LIFO çalışma ilkesini", kaynakReferansi: "K1", alinti: "Yığın veri yapısı LIFO çalışma ilkesini kullanır." };
    const ayar = { konuId: "yigin", kartSayisi: 1, kaynaklar: [kaynak] };
    assert.equal(kartYanitiniDogrula({ kartlar: [eski] }, ayar).length, 1);
    for (const degisim of [{ konuId: "kuyruk" }, { kaynakReferansi: "K99" }, { alinti: "Kaynakta bulunmayan bilgi" }, { cevap: "FIFO" },
        { soru: "Veritabanı transaction nasıl çalışır?" }, { soru: "Yığın ".repeat(100) }, { cevap: "Yığın ".repeat(200) }, { alinti: "Yığın ".repeat(400) }]) {
        assert.throws(() => kartYanitiniDogrula({ kartlar: [{ ...eski, ...degisim }] }, ayar), h => h.kod === "KART_GECERSIZ_YANIT");
    }
    assert.throws(() => kartYanitiniDogrula({ kartlar: [] }, ayar), h => h.tanilama.dogrulamaAltKodu === "KART_SAYISI");
});

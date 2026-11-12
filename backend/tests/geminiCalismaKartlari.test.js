import test from "node:test";
import assert from "node:assert/strict";
import { geminiIleCalismaKartlariUret } from "../services/geminiService.js";
import { kartlarBenzerMi } from "../utils/calismaKartiDogrulama.js";

const kaynak = { anahtar: "K1", materyalId: "materyal", islemeId: "surum", parcaIndex: 0, dosyaAdi: "ders.pdf", icerik: "Yığın veri yapısı LIFO çalışma ilkesini kullanır. Kuyruk veri yapısı FIFO çalışma ilkesini kullanır." };
const kart = { konuId: "yigin", soru: "Yığın hangi çalışma ilkesini kullanır?", cevap: "LIFO çalışma ilkesini", kaynakReferansi: "K1", alinti: "Yığın veri yapısı LIFO çalışma ilkesini kullanır." };
const girdi = { konu: { konuId: "yigin", baslik: "Yığın" }, kartSayisi: 1, kaynaklar: [kaynak] };
const uret = (yanit, ek = {}, g = girdi) => geminiIleCalismaKartlariUret(g, {
    istemci: { models: { generateContent: async () => yanit } }, maxDeneme: 1, bekle: async () => {}, ...ek,
});
test("kaynakla doğrulanan kısa cevap kalıcı konu kimliğiyle normalize edilir", async () => {
    let istek;
    const [sonuc] = await uret(null, { istemci: { models: { async generateContent(g) {
        istek = g; return { text: JSON.stringify({ kartlar: [kart] }) };
    } } } });
    assert.equal(sonuc.konuId, "yigin"); assert.equal(sonuc.kaynak.islemeId, "surum");
    assert.equal(istek.config.responseJsonSchema.properties.kartlar.maxItems, 1);
    assert.match(istek.config.systemInstruction, /güvenilmeyen/);
});
test("boş, bozuk, eksik veya token sınırında kesilmiş JSON başarı sayılmaz", async () => {
    for (const yanit of [{ text: "" }, { text: "{bozuk" }, { text: JSON.stringify({ kartlar: [] }) }, {
        text: JSON.stringify({ kartlar: [kart] }), candidates: [{ finishReason: "MAX_TOKENS" }],
    }]) await assert.rejects(uret(yanit), h => h.status === 502);
});
test("yanlış konu, sahte kaynak, uydurma alıntı ve alıntının desteklemediği cevap reddedilir", async () => {
    for (const degisim of [{ konuId: "kuyruk" }, { kaynakReferansi: "K99" }, { alinti: "Kaynakta bulunmayan bilgi" }, { cevap: "FIFO" }, { soru: "Veritabanı transaction nasıl çalışır?" }]) {
        await assert.rejects(uret({ text: JSON.stringify({ kartlar: [{ ...kart, ...degisim }] }) }), h => h.kod === "KART_GECERSIZ_YANIT");
    }
});
test("aynı veya çok benzer kartlar hem partide hem önceki kalıcı kartlara karşı reddedilir", async () => {
    await assert.rejects(uret({ text: JSON.stringify({ kartlar: [kart, kart] }) }, {}, { ...girdi, kartSayisi: 2 }), h => h.kod === "KART_GECERSIZ_YANIT");
    await assert.rejects(uret({ text: JSON.stringify({ kartlar: [kart] }) }, {}, { ...girdi, oncekiKartlar: [kart] }), h => h.kod === "KART_GECERSIZ_YANIT");
    assert.equal(kartlarBenzerMi(kart, { ...kart, soru: "Yığın hangi çalışma ilkesini kullanır!" }), true);
});
test("503 yalnızca sınırlı backoff ile yeniden denenir; başarı tekrar üretilmez", async () => {
    const beklemeler = []; let sayi = 0;
    const sonuc = await uret(null, { maxDeneme: 3, rastgele: () => 0, bekle: async ms => beklemeler.push(ms),
        istemci: { models: { async generateContent() {
            if (++sayi < 3) throw Object.assign(new Error("sentetik"), { status: 503 });
            return { text: JSON.stringify({ kartlar: [kart] }) };
        } } },
    });
    assert.equal(sonuc.length, 1); assert.equal(sayi, 3); assert.deepEqual(beklemeler, [1000, 2000]);
});
test("günlük kota kısa retry yapmaz; kaynak veya kart sayısı olmadan SDK çağrılmaz", async () => {
    let sayi = 0;
    await assert.rejects(uret(null, { maxDeneme: 3, istemci: { models: { async generateContent() {
        sayi++; throw Object.assign(new Error(JSON.stringify({ error: { code: 429, message: "RequestsPerDay quota" } })), { status: 429 });
    } } } }), h => h.kod === "GEMINI_GUNLUK_KOTA");
    assert.equal(sayi, 1);
    for (const g of [{ ...girdi, kartSayisi: 5 }, { ...girdi, kaynaklar: [] }]) await assert.rejects(uret(null, {}, g), h => h.status === 422);
});

test("kart doğrulaması hangi kuralın reddettiğini güvenli alt kodla bildirir; yeniden SDK çağırmaz", async () => {
    const denemeler = [
        [{ kartlar: [] }, "KART_SAYISI"],
        [{ kartlar: [{ ...kart, konuId: "baska" }] }, "KONU_KIMLIGI"],
        [{ kartlar: [{ ...kart, kaynakReferansi: "K99" }] }, "KAYNAK_REFERANSI"],
        [{ kartlar: [{ ...kart, alinti: "sentetik-gizli-materyal" }] }, "ALINTI_KAYNAKTA_YOK"],
        [{ kartlar: [{ ...kart, cevap: "FIFO" }] }, "CEVAP_ALINTIDA_YOK"],
        [{ kartlar: [{ ...kart, soru: "Transaction atomikliği nedir?" }] }, "SORU_KAYNAK_ILISKISI"],
        [{ kartlar: [{ ...kart, soru: "Yığın ".repeat(100) }] }, "SORU_UZUNLUGU"],
    ];
    for (const [veri, altKod] of denemeler) {
        let cagri = 0;
        await assert.rejects(uret(null, { maxDeneme: 3, istemci: { models: { async generateContent() {
            cagri++; return { text: JSON.stringify(veri) };
        } } } }), h => {
            assert.equal(h.kod, "KART_GECERSIZ_YANIT");
            assert.equal(h.tanilama?.dogrulamaAltKodu, altKod);
            assert.equal(h.tanilama?.asama, "KART_DOGRULAMA");
            assert.doesNotMatch(JSON.stringify(h.tanilama), /sentetik-gizli|LIFO çalışma|Transaction/);
            return true;
        });
        assert.equal(cagri, 1);
    }
});

test("prompt ve JSON şeması doğrulayıcıdaki uzunluk ve soru-alıntı kurallarını açıkça belirtir", async () => {
    let istek;
    await uret(null, { istemci: { models: { async generateContent(g) {
        istek = g; return { text: JSON.stringify({ kartlar: [kart] }) };
    } } } });
    for (const sinir of [400, 800, 1600]) assert.ok(istek.config.systemInstruction.includes(String(sinir)));
    const properties = istek.config.responseJsonSchema.properties.kartlar.items.properties;
    assert.match(properties.soru.description, /400/);
    assert.match(properties.cevap.description, /800/);
    assert.match(properties.alinti.description, /1600/);
    assert.equal(properties.cevap.maxLength, undefined, "Sağlayıcının uygulamadığı maxLength'e güvenilmemeli");
    assert.match(istek.config.systemInstruction, /soruda.*alıntı/i);
});

test("kesilmiş JSON ve MAX_TOKENS ayrı tanılanır; geçersiz çıktı otomatik tekrar denenmez", async () => {
    for (const [yanit, altKod] of [[{ text: '{"kartlar":[' }, "JSON_PARSE"],
        [{ text: "" }, "BOS_YANIT"], [{ text: JSON.stringify({ kartlar: [kart] }), candidates: [{ finishReason: "MAX_TOKENS" }] }, "CIKTI_TOKEN_SINIRI"]]) {
        let sayi = 0;
        await assert.rejects(uret(null, { maxDeneme: 3, istemci: { models: { async generateContent() { sayi++; return yanit; } } } }), h => {
            assert.equal(h.kod, "GEMINI_GECERSIZ_YANIT");
            assert.equal(h.tanilama.asama, "JSON_AYRISTIRMA");
            assert.equal(h.tanilama.dogrulamaAltKodu, altKod);
            return true;
        });
        assert.equal(sayi, 1);
    }
});

test("kaynağın anlamını koruyan noktalama ve satır sonu normalizasyonu geçer; serbest cevap geçmez", async () => {
    const turkce = { ...kaynak, icerik: "YIĞIN\nLIFO ilkesini kullanır. İşlemler üst uçta yapılır." };
    const g = { ...girdi, kaynaklar: [turkce] };
    const k = { ...kart, soru: "Yığın ne kullanır?", cevap: "LIFO ilkesini", alinti: "Yığın LIFO ilkesini kullanır." };
    assert.equal((await uret({ text: JSON.stringify({ kartlar: [k] }) }, {}, g)).length, 1);
    await assert.rejects(uret({ text: JSON.stringify({ kartlar: [{ ...k, cevap: "Son giren ilk çıkar" }] }) }, {}, g),
        h => h.tanilama.dogrulamaAltKodu === "CEVAP_ALINTIDA_YOK");
});

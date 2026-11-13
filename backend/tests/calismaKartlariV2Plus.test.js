import test from "node:test";
import assert from "node:assert/strict";
import { kartKavramPlaniniOlustur, kartBatchleriniPlanla, kartBatchAyarlari } from "../utils/calismaKartiPlanlama.js";
import { kartPartisiniDogrula } from "../utils/calismaKartiKanit.js";
import { kartlarBenzerMi } from "../utils/calismaKartiDogrulama.js";
import { geminiIleKartBatchiUret } from "../services/geminiService.js";
import { konuKartHybridKaynaklariniSec } from "../services/calismaKartlariService.js";
import { ilkEksikKartBatchiniHazirla } from "../scripts/calismaKartiSaltOkunurTani.js";

const metin = ["Yığın: Son giren elemanın ilk çıkarıldığı veri yapısıdır.",
    "Yığın push: Tepeye yeni eleman ekleme işlemidir.", "Yığın pop: Tepedeki elemanı çıkarma işlemidir.",
    "Yığın peek: Tepedeki elemanı çıkarmadan okuma işlemidir.", "Yığın taşması: Kapasitesi dolu yığına eleman ekleme girişimidir.",
    "Yığın alt taşması: Boş yığından eleman çıkarma girişimidir.", "Yığın çağrı belleği: İşlevlerin dönüş bilgilerini saklar.",
    "Yığın kapasitesi: Dizide ayrılan eleman sayısıyla sınırlıdır."].join("\n");
const konu = { konuId: "yigin", anaKonuId: "veri", baslik: "Yığın", anaBaslik: "Veri Yapıları", kaynakIds: ["m"] };
const kaynaklar = [{ anahtar: "yigin:K1", materyalId: "m", islemeId: "v", parcaIndex: 8, dosyaAdi: "sentetik.pdf", icerik: metin }];
const isOlustur = (k = konu, ks = kaynaklar) => ({ konu: k, kaynaklar: ks, kavramlar: kartKavramPlaniniOlustur(k, ks).kavramlar });
const mockSecimler = istek => JSON.parse(istek.contents).konular.flatMap(k => k.kanitlar.map(e => ({ konuId: k.konuId,
    kanitReferansi: e.kimlik, cevapIndex: e.soruCevapIndex >= 0 ? e.soruCevapIndex : 0,
    tur: e.soruCevapIndex >= 0 ? "soru_cevap" : "bosluk_doldurma" })));

test("farklı konudaki ayrı sorular ortak uzun cevap yüzünden birleştirilmez", () => {
    assert.equal(kartlarBenzerMi({ konuId: "a", soru: "Yığın özelliği nedir?", cevap: "Elemanlar ayrılan bellek alanı içinde tutulur." },
        { konuId: "b", soru: "Liste özelliği nedir?", cevap: "Elemanlar ayrılan bellek alanı içinde tutulur." }), false);
});

test("sekiz farklı kavram sekiz kart hedefler; aynı kaynak ve kavram iki kez planlanmaz", () => {
    const plan = kartKavramPlaniniOlustur(konu, [...kaynaklar, { ...kaynaklar[0], anahtar: "K2" }]);
    assert.equal(plan.hedefKartSayisi, 8); assert.equal(new Set(plan.kavramlar.map(k => k.kavramId)).size, 8);
    assert.ok(plan.kavramlar.every(k => k.baglanti.includes("yığın")));
    const r = kartPartisiniDogrula({ kartlar: [{ konuId: "yigin", kanitReferansi: plan.kavramlar[0].kanit.kimlik, cevapIndex: 0, tur: "soru_cevap" }] },
        { konuId: "yigin", konu, kaynaklar, kartSayisi: 1 });
    assert.equal(r.kartlar[0].soru, "Yığın nedir?");
    assert.equal(r.kartlar[0].cevap, "Son giren elemanın ilk çıkarıldığı veri yapısıdır.");
    const devam = kartKavramPlaniniOlustur(konu, kaynaklar, r.kartlar);
    assert.equal(devam.kavramlar.filter(k => !k.tamamlandi).length, 7);
});
test("kavram yok, kaynak yok ve kanıt yetersiz ayrı sıfır nedenleridir", () => {
    assert.equal(kartKavramPlaniniOlustur(konu, []).sifirKartNedeni, "kaynak_yok");
    assert.equal(kartKavramPlaniniOlustur(konu, [{ ...kaynaklar[0], icerik: "Yığın çalışma notları" }]).sifirKartNedeni, "ogrenilebilir_kavram_yok");
    assert.equal(kartKavramPlaniniOlustur(konu, [{ ...kaynaklar[0], icerik: "Yığın" }]).sifirKartNedeni, "kanit_yetersiz");
});
test("doğal kart yalnız sunucunun tanım aralığını kabul eder; serbest soru/cevap ve yanlış aralık reddedilir", () => {
    const is = isOlustur(), kanit = is.kavramlar[0].kanit;
    const secim = { konuId: konu.konuId, kanitReferansi: kanit.kimlik, cevapIndex: 0, tur: "soru_cevap" };
    for (const degisim of [{ soru: "Yığın en hızlı yapı mıdır?" }, { cevap: "Uydurma" }, { cevapIndex: 1 }, { konuId: "baska" }]) {
        const r = kartPartisiniDogrula({ kartlar: [{ ...secim, ...degisim }] }, { konuId: konu.konuId, konu, kaynaklar, kartSayisi: 1 });
        assert.equal(r.kartlar.length, 0);
    }
});
test("batch kart/token/konu/materyal sınırlarına bölünür, kalan kavramları kaybetmez", () => {
    const is = isOlustur();
    const partiler = kartBatchleriniPlanla([is], { ...kartBatchAyarlari(), kart: 3 });
    assert.deepEqual(partiler.map(p => p[0].kavramlar.length), [3, 3, 2]);
    const devam = kartBatchleriniPlanla([{ ...is, kavramlar: is.kavramlar.map((k, i) => ({ ...k, tamamlandi: i < 3 })) }], { ...kartBatchAyarlari(), kart: 3 });
    assert.deepEqual(devam.map(p => p[0].kavramlar.length), [3, 2]);
    assert.throws(() => kartBatchleriniPlanla([is], { ...kartBatchAyarlari(), girdiToken: 5 }), { kod: "KART_BATCH_SINIRI" });
});
test("iki konu tek SDK çağrısında; yanlış konu kanıtı yalnız ilgili kartı reddeder", async () => {
    const is = isOlustur(), kuyruk = { ...konu, konuId: "kuyruk", baslik: "Kuyruk" };
    const ks = [{ ...kaynaklar[0], anahtar: "kuyruk:K1", icerik: "Kuyruk: İlk giren elemanın ilk çıkarıldığı veri yapısıdır." }];
    const diger = isOlustur(kuyruk, ks); let cagri = 0;
    const sonuc = await geminiIleKartBatchiUret({ isler: [is, diger], apiCagriButcesi: { maksimum: 1, kullanilan: 0 } }, {
        istemci: { models: { async generateContent(istek) {
            cagri++; const kartlar = mockSecimler(istek); kartlar[0].kanitReferansi = diger.kavramlar[0].kanit.kimlik;
            return { text: JSON.stringify({ kartlar }) };
        } } }, maxDeneme: 1,
    });
    assert.equal(cagri, 1); assert.equal(sonuc.sonuclar[0].kartlar.length, 7); assert.equal(sonuc.sonuclar[1].kartlar.length, 1);
    for (const kart of sonuc.sonuclar.flatMap(s => s.kartlar)) {
        const kaynak = kart.konuId === "yigin" ? kaynaklar[0] : ks[0];
        assert.equal(kaynak.icerik.slice(kart.kaynak.cevapBaslangic, kart.kaynak.cevapBitis), kart.cevap);
        assert.equal(kart.tur, "soru_cevap"); assert.ok(kart.kavramId);
    }
});

test("ilk eksik konunun tanısı aynı V2+ protokolünü kullanır; kayıtlı kart yeniden seçilmez", async () => {
    const girdi = { konular: [{ ...konu, konuId: "tamamlanan" }, konu],
        parcalar: [{ _id: "p", ...kaynaklar[0] }], materyaller: [{ _id: "m", aktifIslemeId: "v" }],
        deste: { konular: [{ konuId: "tamamlanan", tamamlandi: true, kartlar: [] }, { konuId: konu.konuId, tamamlandi: false, kartlar: [] }] } };
    const hazirlik = ilkEksikKartBatchiniHazirla(girdi);
    assert.equal(hazirlik.konu.konuId, konu.konuId); assert.equal(hazirlik.plan.hedefKartSayisi, 8);
    const sonuc = await geminiIleKartBatchiUret({ isler: hazirlik.parti, apiCagriButcesi: { maksimum: 1, kullanilan: 0 } }, {
        maxDeneme: 1, env: { GEMINI_MODEL_ROUTING_AKTIF: "false" }, istemci: { models: { generateContent: async istek => ({ text: JSON.stringify({ kartlar: mockSecimler(istek) }) }) } },
    });
    assert.ok(sonuc.sonuclar[0].kartlar.length >= 1);
    girdi.deste.konular[1].kartlar = [sonuc.sonuclar[0].kartlar[0]];
    const devam = ilkEksikKartBatchiniHazirla(girdi, { ...kartBatchAyarlari(), kart: 2 });
    assert.equal(devam.plan.kavramlar.filter(k => !k.tamamlandi).length, 7);
    assert.equal(devam.parti[0].kavramlar.length, 2);
    assert.ok(devam.parti[0].kavramlar.every(k => k.kavramId !== girdi.deste.konular[1].kartlar[0].kavramId));
    girdi.deste.konular[1].tamamlandi = true;
    assert.equal(ilkEksikKartBatchiniHazirla(girdi), null);
});

test("doğrudan batch çağrısı da çıktı ve materyal sınırından önce SDK'yı durdurur", async () => {
    const is = isOlustur();
    for (const degisim of [{ ciktiToken: 1 }, { materyal: 0 }]) await assert.rejects(geminiIleKartBatchiUret({ isler: [is] }, {
        batchAyarlari: { ...kartBatchAyarlari(), ...degisim }, istemci: { models: { generateContent() { assert.fail("Bütçe dışında SDK çağrısı"); } } },
    }), { kod: "KART_BATCH_SINIRI" });
});
test("hybrid mevcut kaynak kimliği/sürümünü doğrular; yüksek skorlu başka konu elenir, 503 keyword'e döner", async () => {
    const parcalar = Array.from({ length: 11 }, (_, i) => ({ _id: `p${i}`, materyalId: "m", islemeId: "v", parcaIndex: i,
        icerik: `Yığın işlem${i} elemanları saklar.` }));
    parcalar.push({ _id: "yanlis", materyalId: "m", islemeId: "v", parcaIndex: 99, icerik: "Fotosentez ışık enerjisini kullanır." });
    const g = { girdi: { kullaniciId: "u", dersId: "d" }, konu, parcalar, materyaller: [{ _id: "m", aktifIslemeId: "v" }] };
    const sonuc = await konuKartHybridKaynaklariniSec(g, { semanticArama: async sorgu => {
        assert.deepEqual(sorgu.materyalIds, ["m"]);
        return { sonuclar: [parcalar[10], parcalar[11]].map(p => ({ ...p, metinParcasiId: p._id, skor: 0.99 })) };
    } });
    assert.equal(sonuc.retrievalYontemi, "hybrid"); assert.ok(sonuc.kaynaklar.some(k => k.parcaIndex === 10));
    assert.ok(sonuc.kaynaklar.every(k => k.parcaIndex !== 99));
    const hata = await konuKartHybridKaynaklariniSec(g, { semanticArama: async () => { throw Object.assign(new Error("503"), { kod: "EMBEDDING_SERVIS_HATASI" }); } });
    assert.equal(hata.retrievalYontemi, "keyword_fallback"); assert.equal(hata.retrievalHataKodu, "EMBEDDING_SERVIS_HATASI");
    assert.ok(hata.kaynaklar.length);
    const eski = await konuKartHybridKaynaklariniSec({ ...g, parcalar: parcalar.map(p => ({ ...p, islemeId: "eski" })) }, { semanticArama: async () => ({ sonuclar: [] }) });
    assert.equal(eski.kaynaklar.length, 0);
});

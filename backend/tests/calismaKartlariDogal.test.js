import test from "node:test";
import assert from "node:assert/strict";
import { dogalKartPartisiniDogrula } from "../utils/calismaKartiKanit.js";
import { kartKaynakBatchleriniPlanla, kartBatchAyarlari, dogalKartBatchIsteginiHazirla } from "../utils/calismaKartiPlanlama.js";
import { geminiIleKartBatchiUret } from "../services/geminiService.js";
import { geminiGunSonunaKalanMs, geminiOrtakIstekYonetimiOlustur } from "../utils/geminiOrtakIstekYonetimi.js";
import { konuKartHybridKaynaklariniSec } from "../services/calismaKartlariService.js";

const konu = { konuId: "yigin", anaKonuId: "veri", baslik: "Yığın", aciklama: "Elemanların saklanması", kaynakIds: ["m"] };
const kaynak = { kullaniciId: "u", dersId: "d", materyalId: "m", islemeId: "v", metinParcasiId: "p", parcaIndex: 2,
    dosyaAdi: "ders.pdf", icerik: "Yığın LIFO ilkesiyle çalışan bir veri yapısıdır. Yığın boşken eleman çıkarılamaz." };
const kaynakBaglami = { kullaniciId: "u", dersId: "d", materyaller: [{ _id: "m", aktifIslemeId: "v" }] };
const kart = { konuId: "yigin", metinParcasiId: "p", kavram: "Yığın", soru: "Yığın hangi ilkeyle çalışır?",
    cevap: "Yığın LIFO ilkesiyle çalışan bir veri yapısıdır.", kanit: "Yığın LIFO ilkesiyle çalışan bir veri yapısıdır." };
const dogrula = (kartlar = [kart], ek = {}) => dogalKartPartisiniDogrula(kartlar, { konu, kaynaklar: [kaynak], kaynakBaglami, ...ek });

test("modelin doğal Türkçe sorusu korunur; cevap ve kanıt özgün karakter aralıklarıyla saklanır", () => {
    const r = dogrula(); assert.equal(r.kartlar.length, 1); assert.equal(r.reddedilenler.length, 0);
    const k = r.kartlar[0]; assert.equal(k.soru, kart.soru); assert.equal(k.tur, "soru_cevap");
    assert.equal(k.konuId, konu.konuId); assert.equal(k.kavram, "Yığın"); assert.ok(k.kavramId);
    assert.equal(kaynak.icerik.slice(k.kaynak.kanitBaslangic, k.kaynak.kanitBitis), kart.kanit);
    assert.equal(kaynak.icerik.slice(k.kaynak.cevapBaslangic, k.kaynak.cevapBitis), kart.cevap);
});

test("açık tanımın bütün cevabı kabul edilir; tanımın bir bölümü veya serbest açıklama kabul edilmez", () => {
    const kanit = "Yığın taşması: Kapasitesi dolu yığına eleman ekleme girişimidir.";
    const k = { ...kart, kavram: "Yığın taşması", soru: "Yığın taşması hangi durumda oluşur?", kanit, cevap: kanit.split(": ")[1] };
    const ek = { kaynaklar: [{ ...kaynak, icerik: kanit }] };
    assert.equal(dogrula([k], ek).kartlar.length, 1);
    for (const cevap of ["eleman ekleme", "Yığın belleğin tamamını tükettiğinde taşar."]) assert.equal(dogrula([{ ...k, cevap }], ek).kartlar.length, 0);
});

test("doğru parça kimliği yeterli değildir: uydurma cevap, değiştirilmiş kanıt ve kesilmiş olumsuzluk reddedilir", () => {
    for (const degisim of [
        { cevap: "Yığın FIFO ilkesiyle çalışan bir veri yapısıdır." },
        { kanit: "Yığın LIFO ilkesidir." },
        { kanit: "Yığın boşken eleman", cevap: "Yığın boşken eleman" },
        { kanit: "Yığın boşken eleman çıkarılamaz.", cevap: "Yığın boşken eleman çıkarılabilir." },
        { soru: "Yığın 15 elemanı neden tutar?" }, { soru: "Yığın GPU ile neden hızlanır?" },
        { cevapIndex: 0 }, { soru: "Boşluğu tamamla: Yığın […] kullanır?" },
    ]) assert.equal(dogrula([{ ...kart, ...degisim }]).kartlar.length, 0, JSON.stringify(degisim));
});

test("kullanıcı, ders, konu kaynağı ve aktif sürüm ayrı ayrı doğrulanır", () => {
    for (const degisim of [{ kullaniciId: "baska" }, { dersId: "baska" }, { materyalId: "baska" },
        { islemeId: "eski" }, { metinParcasiId: "baska" }, { kullaniciId: undefined }, { islemeId: undefined }]) {
        const r = dogrula([kart], { kaynaklar: [{ ...kaynak, ...degisim }] });
        assert.equal(r.kartlar.length, 0); assert.equal(r.reddedilenler[0].dogrulamaAltKodu, "KAYNAK_REFERANSI");
    }
    assert.equal(dogrula([kart], { kaynakBaglami: {} }).kartlar.length, 0);
    assert.equal(dogrula([kart], { konu: { ...konu, kaynakIds: [] } }).kartlar.length, 0);
    assert.equal(dogrula([{ ...kart, konuId: "kuyruk" }]).kartlar.length, 0);
});

test("aynı kavram, yeniden yazılmış soru ve aynı kanıt tekrar kart oluşturmaz; eski V2 kartı da korunur", () => {
    const ilk = dogrula().kartlar[0];
    assert.equal(dogrula([{ ...kart, soru: "Yığın nasıl bir veri yapısıdır?" }], { oncekiKartlar: [ilk] }).kartlar.length, 0);
    assert.equal(dogrula([kart, kart]).kartlar.length, 1);
    assert.equal(dogrula([kart], { oncekiKartlar: [{ soru: "Eski soru", cevap: "LIFO", kaynak: { alinti: kart.kanit } }] }).kartlar.length, 0);
});

test("kaynak batch'i ilgili konuları birleştirir; tam kaynak, açıklama ve önceki kavramları gönderir", () => {
    const diger = { ...konu, konuId: "diger" }, ayrik = { ...konu, konuId: "ayrik", anaKonuId: "baska" };
    const isler = [konu, diger, ayrik].map(konu => ({ konu, kaynaklar: [kaynak] }));
    const p = kartKaynakBatchleriniPlanla(isler);
    assert.deepEqual(p.map(b => b.map(i => i.konu.konuId)), [["yigin", "diger"], ["ayrik"]]);
    const istek = dogalKartBatchIsteginiHazirla(p[0], [{ konuId: "yigin", kavram: "Yığın", kaynak: { metinParcasiId: "p" } }]);
    const veri = JSON.parse(istek.prompt);
    assert.equal(veri.konular[0].aciklama, konu.aciklama);
    assert.equal(veri.konular[0].kaynaklar[0].metin, kaynak.icerik);
    assert.deepEqual(veri.konular[0].oncekiKavramlar, ["Yığın"]);
    assert.ok(!("kanitlar" in veri.konular[0]));
    assert.throws(() => kartKaynakBatchleriniPlanla(isler, [], { ...kartBatchAyarlari(), girdiToken: 2 }), { kod: "KART_BATCH_SINIRI" });
});

test("doğal protokol çok konulu tek SDK isteğinde geçerli konuyu korur, yanlış konu kaynağını reddeder", async () => {
    const diger = { ...konu, konuId: "kuyruk", baslik: "Kuyruk" }, ks = { ...kaynak, metinParcasiId: "q", icerik: "Kuyruk FIFO ilkesine göre çalışır." };
    const butce = { maksimum: 1, kullanilan: 0 }; let sayi = 0;
    const r = await geminiIleKartBatchiUret({ isler: [{ konu, kaynaklar: [kaynak] }, { konu: diger, kaynaklar: [ks] }], kaynakBaglami, apiCagriButcesi: butce }, {
        maxDeneme: 1, istemci: { models: { async generateContent(istek) {
            sayi++; assert.equal(JSON.parse(istek.contents).konular.length, 2);
            return { text: JSON.stringify({ konular: [
                { konuId: "yigin", tamamlandi: true, bosNedeni: "", kartlar: [kart] },
                { konuId: "kuyruk", tamamlandi: true, bosNedeni: "", kartlar: [{ ...kart, konuId: "kuyruk" }] },
            ] }) };
        } } },
    });
    assert.equal(sayi, 1); assert.equal(butce.kullanilan, 1);
    assert.equal(r.sonuclar[0].kartlar.length, 1); assert.equal(r.sonuclar[0].kaynaklarTamamlandi, true);
    assert.equal(r.sonuclar[1].kartlar.length, 0); assert.equal(r.sonuclar[1].kaynaklarTamamlandi, false);
});

test("Pasifik günlük kota zamanı yaz/kış saati geçişinde 23 ve 25 saatlik günleri korur", () => {
    for (const [baslangic, bitis] of [["2026-03-08T08:00:00Z", "2026-03-09T07:00:00Z"], ["2026-11-01T07:00:00Z", "2026-11-02T08:00:00Z"]]) {
        const simdi = Date.parse(baslangic), sonuc = geminiGunSonunaKalanMs(simdi);
        assert.ok(Math.abs(sonuc - (Date.parse(bitis) - simdi)) <= 1000);
    }
});

test("tek istek TPM sınırına hiç sığmıyorsa sonsuz bekleme yerine kalıcı boyut hatası döner", () => {
    const yonetim = geminiOrtakIstekYonetimiOlustur({ kotalar: { test: { rpm: 4, tpm: 100, rpd: 10 } } });
    assert.throws(() => yonetim.yerAyir("test", { tahminiToken: 101 }), { kod: "GEMINI_ISTEK_BOYUTU" });
    assert.equal(yonetim.durum("test").rpd, 0);
    yonetim.yerAyir("test", { tahminiToken: 60 })();
    assert.throws(() => yonetim.yerAyir("test", { tahminiToken: 60 }), { kod: "GEMINI_YEREL_TPM" });
});

test("semantik sonuçta yüksek skor yanlış kimlik, sürüm veya metni kaynak olarak kabul ettirmez", async () => {
    const girdi = { girdi: { kullaniciId: "u", dersId: "d" }, konu: { ...konu, baslik: "Son Gelen Önce Ayrılır", aciklama: "" },
        parcalar: [{ ...kaynak, _id: "p" }], materyaller: kaynakBaglami.materyaller };
    for (const degisim of [{ metinParcasiId: "baska" }, { islemeId: "eski" }, { materyalId: "yabanci" }, { icerik: "değiştirilmiş" }]) {
        const r = await konuKartHybridKaynaklariniSec(girdi, { semanticArama: async () => ({ sonuclar: [{ ...kaynak, skor: 0.99, ...degisim }] }) });
        assert.equal(r.kaynaklar.length, 0);
    }
});

test("modelin bilinmeyen konusu ve dayanağı olmayan sıfır kart beyanı başarı sayılmaz", async () => {
    const uret = konular => geminiIleKartBatchiUret({ isler: [{ konu, kaynaklar: [kaynak] }], kaynakBaglami }, {
        maxDeneme: 1, istemci: { models: { generateContent: async () => ({ text: JSON.stringify({ konular }) }) } },
    });
    await assert.rejects(uret([{ konuId: "uydurma", tamamlandi: true, bosNedeni: "", kartlar: [kart] }]), { kod: "KART_GECERSIZ_YANIT" });
    for (const bosNedeni of ["kavramlar_zaten_kapsandi", "gizli-model-yaniti", "kaynak_yetersiz"]) {
        const r = await uret([{ konuId: "yigin", tamamlandi: true, bosNedeni, kartlar: [] }]);
        assert.equal(r.sonuclar[0].kaynaklarTamamlandi, false);
        assert.equal(r.sonuclar[0].sifirKartNedeni, "");
    }
    const r = await uret([{ konuId: "yigin", tamamlandi: true, bosNedeni: "ogrenilebilir_kavram_yok", kartlar: [] }]);
    assert.equal(r.sonuclar[0].kaynaklarTamamlandi, true);
});

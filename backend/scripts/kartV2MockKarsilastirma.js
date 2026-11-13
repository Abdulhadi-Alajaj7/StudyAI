// Yalnız sentetik kaynak ve enjekte edilmiş SDK. .env/MongoDB/ağ bağlantısı yok.
import { writeFile } from "node:fs/promises";
import { performance } from "node:perf_hooks";
import { geminiIleCalismaKartlariUret, geminiIleKartBatchiUret } from "../services/geminiService.js";
import { kartKavramPlaniniOlustur, kartBatchleriniPlanla } from "../utils/calismaKartiPlanlama.js";
import { geminiOrtakIstekYonetimiOlustur, tahminiGirdiTokeni } from "../utils/geminiOrtakIstekYonetimi.js";

const icerikler = [
    ["Yığın: Son giren elemanın ilk çıkarıldığı veri yapısıdır.", "Yığın push: Tepeye yeni eleman ekleme işlemidir.", "Yığın pop: Tepedeki elemanı çıkarma işlemidir."],
    ["Kuyruk: İlk giren elemanın ilk çıkarıldığı veri yapısıdır.", "Kuyruk enqueue: Sıranın sonuna eleman ekleme işlemidir.", "Kuyruk dequeue: Sıranın başından eleman çıkarma işlemidir."],
    ["Bağlı liste: Elemanların işaretçilerle birbirine bağlandığı veri yapısıdır.", "Liste düğümü: Veri ve bağlantı bilgisini tutan birimdir.", "Liste başı: İlk düğüme erişim sağlayan işaretçidir."],
];
const isler = ["Yığın", "Kuyruk", "Liste"].map((baslik, index) => {
    const konu = { konuId: `konu${index}`, anaKonuId: "veri", baslik, anaBaslik: "Veri Yapıları" };
    const kaynaklar = [{ anahtar: `${konu.konuId}:K1`, materyalId: "sentetik-m", islemeId: "sentetik-v", parcaIndex: index, dosyaAdi: "mock.txt",
        icerik: icerikler[index].join("\n") }];
    return { konu, kaynaklar, kavramlar: kartKavramPlaniniOlustur(konu, kaynaklar).kavramlar };
});
const olc = async (batch, hatali) => {
    let sdk = 0, tahminiToken = 0;
    const istemci = { models: { async generateContent(istek) {
        sdk++; tahminiToken += tahminiGirdiTokeni(istek.contents, istek.config.systemInstruction, JSON.stringify(istek.config.responseJsonSchema));
        const p = JSON.parse(istek.contents), konular = p.konular || [{ ...p.konu, kanitlar: p.kanitlar }];
        const kartlar = konular.flatMap(k => k.kanitlar.map((e, i) => ({ konuId: k.konuId,
            kanitReferansi: hatali && k.konuId === "konu1" && i === 0 ? "sahte" : e.kimlik, cevapIndex: 0,
            ...(batch ? { tur: "soru_cevap" } : {}) })));
        return { text: JSON.stringify({ kartlar }) };
    } } };
    const deps = { istemci, maxDeneme: 1, istekYonetimi: geminiOrtakIstekYonetimiOlustur() };
    const baslangic = performance.now(), kartlar = [], retler = [];
    if (batch) {
        for (const parti of kartBatchleriniPlanla(isler)) {
            const r = await geminiIleKartBatchiUret({ isler: parti }, deps);
            kartlar.push(...r.sonuclar.flatMap(s => s.kartlar)); retler.push(...r.sonuclar.flatMap(s => s.reddedilenler));
        }
    } else {
        for (const is of isler) {
            const r = await geminiIleCalismaKartlariUret({ konu: is.konu, kaynaklar: is.kaynaklar, kartSayisi: 3, oncekiKartlar: kartlar }, deps);
            kartlar.push(...r.kartlar); retler.push(...r.reddedilenler);
        }
    }
    return { mockSdkCagrisi: sdk, tahminiGirdiTokeni: tahminiToken, gecerliKart: kartlar.length, hedefKavram: 9,
        kavramKapsami: new Set(kartlar.map(k => k.kaynak.alinti)).size / 9, reddedilen: retler.length,
        retOrani: retler.length / 9, mockIslemSureMs: Math.round((performance.now() - baslangic) * 100) / 100 };
};
const rapor = { tarih: "2026-11-12", kapsam: "Tek konulu V2 seçim protokolü ile V2+ batch; aynı güncel ortak SDK katmanı, aynı 9 sentetik kavram.",
    uyari: "Tokenlar karakter/3 tahminidir; süreler yalnız yerel mock süresidir. Sağlayıcı kalitesi, gerçek token veya canlı gecikme ölçümü değildir.",
    gercekGeminiCagrisi: 0, gercekEmbeddingCagrisi: 0, senaryolar: [] };
for (const hatali of [false, true]) rapor.senaryolar.push({ senaryo: hatali ? "tek_gecersiz_kart" : "gecerli_yanit",
    tekKonulu: await olc(false, hatali), batch: await olc(true, hatali) });
await writeFile(new URL("../docs/V2_PLUS_MOCK_KARSILASTIRMA.json", import.meta.url), JSON.stringify(rapor, null, 2) + "\n", "utf8");
console.log(JSON.stringify(rapor, null, 2));

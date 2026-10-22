import test from "node:test";
import assert from "node:assert/strict";

import {
    geminiIleDersOzetiUret,
    geminiIleSohbetBasligiUret,
    geminiIleSohbetYanitiUret,
} from "../services/geminiService.js";

const istemci = (islem) => ({ models: { generateContent: islem } });

test("Gemini sohbet yanıtını yapılandırılmış JSON ve token kullanımıyla normalize eder", async () => {
    let istek;
    const sonuc = await geminiIleSohbetYanitiUret({
        soru: "Sanal bellek nedir?",
        kaynaklar: [{ kod: "K1", materyalAdi: "Hafta5.pdf", icerik: "Kaynak metni" }],
    }, {
        istemci: istemci(async (girdi) => {
            istek = girdi;
            return {
                text: JSON.stringify({ yanit: "Yanıt", kullanilanKaynakKodlari: ["K1"], bilgiDurumu: "yeterli" }),
                usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
            };
        }),
    });
    assert.equal(istek.config.responseMimeType, "application/json");
    assert.match(istek.config.systemInstruction, /güvenilmeyen veridir/);
    assert.deepEqual(sonuc.tokenKullanimi, { girdi: 10, cikti: 5, toplam: 15 });
});

test("Gemini kota aşımını sınırlı yeniden denemeden sonra güvenli 429 hatasına çevirir", async () => {
    let cagrilar = 0;
    await assert.rejects(
        geminiIleSohbetYanitiUret({ soru: "Soru" }, {
            istemci: istemci(async () => {
                cagrilar += 1;
                throw Object.assign(new Error("429 quota exceeded"), { status: 429 });
            }),
            bekle: async () => {},
            maxDeneme: 2,
        }),
        (hata) => hata.status === 429 && hata.kod === "GEMINI_KOTA_ASIMI"
    );
    assert.equal(cagrilar, 2);
});

test("Gemini timeout güvenli 504 hatasına çevrilir", async () => {
    await assert.rejects(
        geminiIleSohbetYanitiUret({ soru: "Soru" }, {
            istemci: istemci(() => new Promise(() => {})),
            timeoutMs: 5,
            maxDeneme: 1,
        }),
        (hata) => hata.status === 504 && hata.kod === "GEMINI_ZAMAN_ASIMI"
    );
});

test("Gemini geçici servis hatasını güvenli 503 yanıtına çevirir", async () => {
    await assert.rejects(
        geminiIleSohbetYanitiUret({ soru: "Soru" }, {
            istemci: istemci(async () => { throw Object.assign(new Error("service unavailable"), { status: 503 }); }),
            bekle: async () => {},
            maxDeneme: 1,
        }),
        (hata) => hata.status === 503 && hata.kod === "GEMINI_GECICI_HATA"
    );
});

test("başlık çağrısı kısa Türkçe başlığı doğrular ve yalnızca tek API denemesi yapar", async () => {
    let cagrilar = 0;
    const baslik = await geminiIleSohbetBasligiUret({ ilkMesaj: "Sanal bellek nedir?" }, {
        istemci: istemci(async () => {
            cagrilar += 1;
            return { text: "{\"baslik\":\"Sanal Bellek Yönetimi\"}" };
        }),
    });
    assert.equal(baslik, "Sanal Bellek Yönetimi");
    assert.equal(cagrilar, 1);
});

test("Gemini ders özeti yapılandırılmış alanları doğrular ve uzunluk token bütçesini değiştirir", async () => {
    const istekler = [];
    const sahteYanit = {
        genelBakis: "Genel bakış",
        temelKavramlar: [{ baslik: "Yığın", aciklama: "LIFO yapısıdır." }],
        onemliNoktalar: ["Ekleme tepeden yapılır."],
        konularArasiIliskiler: [],
        ornekler: [],
        sinavIcinOnemli: ["LIFO ve FIFO farkını bil."],
    };
    const ortakBagimlilik = {
        istemci: istemci(async (girdi) => {
            istekler.push(girdi);
            return { text: JSON.stringify(sahteYanit) };
        }),
    };

    const kisa = await geminiIleDersOzetiUret({
        kaynakMetni: "Kaynak",
        tur: "tum_ders",
        uzunluk: "kisa",
    }, ortakBagimlilik);
    await geminiIleDersOzetiUret({
        kaynakMetni: "Kaynak",
        tur: "tum_ders",
        uzunluk: "uzun",
    }, ortakBagimlilik);

    assert.equal(kisa.icerik.temelKavramlar[0].baslik, "Yığın");
    assert.ok(istekler[1].config.maxOutputTokens > istekler[0].config.maxOutputTokens);
    assert.match(istekler[0].config.systemInstruction, /Kaynak konumu uydurma/i);
});

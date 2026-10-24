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
                throw Object.assign(new Error(JSON.stringify({
                    error: {
                        code: 429,
                        status: "RESOURCE_EXHAUSTED",
                        message: "Hassas sağlayıcı hata ayrıntısı",
                    },
                })), { name: "ApiError", status: 429 });
            }),
            bekle: async () => {},
            maxDeneme: 2,
        }),
        (hata) => {
            assert.equal(hata.status, 429);
            assert.equal(hata.kod, "GEMINI_KOTA_ASIMI");
            assert.deepEqual(hata.tanilama, {
                orijinalSdkHataSinifi: "ApiError",
                orijinalHttpDurumu: 429,
                saglayiciHataKodu: "RESOURCE_EXHAUSTED",
                agHataKodu: null,
                hataKaynagi: "saglayici_http",
                sdkCagriAsamasi: "models.generateContent",
                retryUygunMu: true,
                retryEdildiMi: true,
                gercekDenemeSayisi: 2,
                maksimumDenemeSayisi: 2,
            });
            return true;
        }
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
        (hata) => {
            assert.equal(hata.status, 504);
            assert.equal(hata.kod, "GEMINI_ZAMAN_ASIMI");
            assert.equal(hata.tanilama?.hataKaynagi, "uygulama_timeout");
            assert.equal(hata.tanilama?.orijinalHttpDurumu, null);
            assert.equal(hata.tanilama?.retryUygunMu, true);
            assert.equal(hata.tanilama?.retryEdildiMi, false);
            assert.equal(hata.tanilama?.gercekDenemeSayisi, 1);
            return true;
        }
    );
});

test("Gemini geçici servis hatasını güvenli 503 yanıtına çevirir", async () => {
    await assert.rejects(
        geminiIleSohbetYanitiUret({ soru: "Soru" }, {
            istemci: istemci(async () => {
                throw Object.assign(new Error(JSON.stringify({
                    error: { status: "UNAVAILABLE", message: "Hassas ayrıntı" },
                })), { name: "ApiError", status: 503 });
            }),
            bekle: async () => {},
            maxDeneme: 1,
        }),
        (hata) => {
            assert.equal(hata.status, 503);
            assert.equal(hata.kod, "GEMINI_GECICI_HATA");
            assert.equal(hata.tanilama?.orijinalSdkHataSinifi, "ApiError");
            assert.equal(hata.tanilama?.orijinalHttpDurumu, 503);
            assert.equal(hata.tanilama?.saglayiciHataKodu, "UNAVAILABLE");
            assert.equal(hata.tanilama?.hataKaynagi, "saglayici_http");
            assert.equal(hata.tanilama?.retryUygunMu, true);
            assert.equal(hata.tanilama?.retryEdildiMi, false);
            assert.equal(hata.tanilama?.gercekDenemeSayisi, 1);
            return true;
        }
    );
});

test("Gemini ağ bağlantı hatasını sağlayıcı HTTP hatasından ayrı tanılar", async () => {
    const agHatasi = new TypeError("fetch failed");
    agHatasi.cause = Object.assign(new Error("socket ayrıntısı"), { code: "ECONNRESET" });
    await assert.rejects(
        geminiIleSohbetYanitiUret({ soru: "Soru" }, {
            istemci: istemci(async () => { throw agHatasi; }),
            bekle: async () => {},
            maxDeneme: 1,
        }),
        (hata) => {
            assert.equal(hata.status, 503);
            assert.equal(hata.kod, "GEMINI_GECICI_HATA");
            assert.equal(hata.tanilama?.orijinalSdkHataSinifi, "TypeError");
            assert.equal(hata.tanilama?.orijinalHttpDurumu, null);
            assert.equal(hata.tanilama?.agHataKodu, "ECONNRESET");
            assert.equal(hata.tanilama?.hataKaynagi, "ag");
            return true;
        }
    );
});

test("Gemini geçici hatadan sonra başarılı olan çağrıyı gerçekten yeniden dener", async () => {
    let cagrilar = 0;
    const sonuc = await geminiIleSohbetYanitiUret({ soru: "Soru" }, {
        istemci: istemci(async () => {
            cagrilar += 1;
            if (cagrilar === 1) {
                throw Object.assign(new Error("geçici hata"), { name: "ApiError", status: 503 });
            }
            return {
                text: JSON.stringify({
                    yanit: "Başarılı yanıt",
                    kullanilanKaynakKodlari: [],
                    bilgiDurumu: "yeterli",
                }),
            };
        }),
        bekle: async () => {},
        maxDeneme: 2,
    });

    assert.equal(cagrilar, 2);
    assert.equal(sonuc.yanit, "Başarılı yanıt");
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

test("Gemini ders özeti uzunluk hedeflerini ayırır ve liste metinlerini güvenle normalize eder", async () => {
    const istekler = [];
    const sahteYanit = {
        genelBakis: "Genel bakış",
        temelKavramlar: [{ baslik: "Yığın", aciklama: "LIFO yapısıdır." }],
        onemliNoktalar: ["• Ekleme tepeden yapılır.", "- Ekleme tepeden yapılır."],
        konularArasiIliskiler: [],
        ornekler: [],
        sinavIcinOnemli: ["- LIFO ve FIFO farkını bil."],
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
    const orta = await geminiIleDersOzetiUret({
        kaynakMetni: "Kaynak",
        tur: "tum_ders",
        uzunluk: "orta",
    }, ortakBagimlilik);
    await geminiIleDersOzetiUret({
        kaynakMetni: "Kaynak",
        tur: "tum_ders",
        uzunluk: "uzun",
    }, ortakBagimlilik);

    assert.equal(kisa.icerik.temelKavramlar[0].baslik, "Yığın");
    assert.deepEqual(kisa.icerik.onemliNoktalar, ["Ekleme tepeden yapılır."]);
    assert.deepEqual(kisa.icerik.sinavIcinOnemli, ["LIFO ve FIFO farkını bil."]);
    assert.ok(istekler[1].config.maxOutputTokens > istekler[0].config.maxOutputTokens);
    assert.ok(istekler[2].config.maxOutputTokens > istekler[1].config.maxOutputTokens);
    assert.match(istekler[0].contents, /Ana kavramları, temel tanımları/i);
    assert.match(istekler[1].contents, /az sayıda formül veya öğretici örneği/i);
    assert.match(istekler[1].contents, /uzun özet düzeyinde ayrıntıya girme/i);
    assert.match(istekler[2].contents, /önemli formülleri, yöntemleri/i);
    assert.match(istekler[0].config.systemInstruction, /Kaynak konumu uydurma/i);
    assert.match(istekler[0].config.systemInstruction, /madde işareti olmadan düz metin/i);
    assert.equal(orta.icerik.genelBakis, "Genel bakış");
});

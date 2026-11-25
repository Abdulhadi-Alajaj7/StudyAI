import test from "node:test";
import assert from "node:assert/strict";
import { geminiIleDersOzetiUret } from "../services/geminiService.js";

const yanit = { text: '{"genelBakis":"Kaynağa dayalı özet"}' };
const calistir = (generateContent, secenekler = {}) => geminiIleDersOzetiUret({
    kaynakMetni: "Dersin mevcut kaynağı", dersBilgisi: { dersAdi: "Veri" }, tur: "tum_ders",
}, { istemci: { models: { generateContent } }, bekle: async () => {}, rastgele: () => 0, ...secenekler });

test("özet başarılıysa tek SDK çağrısı yapar ve beklemez", async () => {
    let adet = 0;
    const sonuc = await calistir(async () => { adet++; return yanit; }, {
        bekle: async () => assert.fail("Başarıda beklenmez"),
    });
    assert.equal(adet, 1);
    assert.equal(sonuc.icerik.genelBakis, "Kaynağa dayalı özet");
});

for (const [ad, hata] of [
    ["503", () => Object.assign(new Error("Service unavailable"), { status: 503 })],
    ["timeout", () => Object.assign(new Error("timed out"), { name: "TimeoutError" })],
    ["bağlantı", () => Object.assign(new Error("fetch failed"), { cause: { code: "ECONNRESET" } })],
]) {
    test("özet " + ad + " sonrasında başarıda durur; sürekli hatada en fazla üç deneme yapar", async () => {
        for (const kurtar of [true, false]) {
            let adet = 0;
            const beklemeler = [];
            const islem = calistir(async () => {
                adet++;
                if (adet === 1 || !kurtar) throw hata();
                return yanit;
            }, { bekle: async (ms) => beklemeler.push(ms) });
            if (kurtar) await islem;
            else await assert.rejects(islem);
            assert.equal(adet, kurtar ? 2 : 3);
            assert.deepEqual(beklemeler, kurtar ? [1000] : [1000, 2000]);
        }
    });
}

test("özet gerçek zaman aşımında ilk isteği iptal eder ve aynı girdilerle yeniden dener", async () => {
    const istekler = [];
    await calistir(async (istek) => {
        istekler.push(istek);
        return istekler.length === 1 ? new Promise(() => {}) : yanit;
    }, { timeoutMs: 10 });
    assert.equal(istekler.length, 2);
    assert.equal(istekler[0].config.abortSignal.aborted, true);
    assert.equal(istekler[0].contents, istekler[1].contents);
    assert.equal(istekler[0].config.systemInstruction, istekler[1].config.systemInstruction);
    assert.equal(istekler[0].model, istekler[1].model);
});

test("özet kalıcı API ve geçersiz JSON hatalarında yeni çağrı yapmaz", async () => {
    for (const durum of [400, 401, 403, 404, "json"]) {
        let adet = 0;
        await assert.rejects(calistir(async () => {
            adet++;
            if (durum === "json") return { text: "{" };
            throw Object.assign(new Error("Kalıcı hata"), { status: durum });
        }, { bekle: async () => assert.fail("Kalıcı hata beklenmez") }));
        assert.equal(adet, 1);
    }
});

import { mock, test } from "node:test";
import assert from "node:assert/strict";

let cagrilar = 0;
let hata;
mock.module("@google/genai", { namedExports: { GoogleGenAI: class {
    constructor() {
        this.models = { generateContent: async () => { cagrilar++; throw hata; } };
    }
} } });
const { geminiIleKonuHaritasiUret } = await import("../services/geminiService.js");
for (const status of [429, 503, 400]) {
    test(`harita HTTP ${status} için sınırlı retry uygular; gerçek API kullanılmaz`, async () => {
        const eski = process.env.GEMINI_API_KEY;
        process.env.GEMINI_API_KEY = "mock-test-key";
        cagrilar = 0;
        hata = Object.assign(new Error("Mock servis yanıtı"), { status });
        try {
            await assert.rejects(geminiIleKonuHaritasiUret("Örnek metin", { dersAdi: "Ders" }), { status });
            assert.equal(cagrilar, status === 400 ? 1 : 2);
        } finally {
            if (eski === undefined) delete process.env.GEMINI_API_KEY;
            else process.env.GEMINI_API_KEY = eski;
        }
    });
}

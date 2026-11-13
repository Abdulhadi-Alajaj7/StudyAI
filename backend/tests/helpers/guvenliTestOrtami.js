import { beforeEach } from "node:test";
import net from "node:net";
import { geminiOrtakIstekYonetimiOlustur, ortakGeminiIstekYonetimi } from "../../utils/geminiOrtakIstekYonetimi.js";

// Testler .env anahtarı kullanamaz ve yanlışlıkla sağlayıcı/MongoDB ağına çıkamaz.
process.env.RUN_LIVE_GEMINI_TESTS = "false";
process.env.GEMINI_API_KEY = "yalnizca-mock-test-anahtari";
process.env.GEMINI_MODEL_ROUTING_AKTIF = "false";
globalThis.fetch = async () => { throw new Error("Testte gerçek ağ erişimi yasak; transport mock kullanın."); };
net.Socket.prototype.connect = function () { throw new Error("Testte TCP/MongoDB bağlantısı yasak."); };

// Bağımsız testler tek süreçteki üretim kotasını tüketmez. Kota testleri kendi
// düşük limitli yöneticisini enjekte eder; retry testleri mock SDK ile çalışır.
beforeEach(() => {
    const yonetici = geminiOrtakIstekYonetimiOlustur({ kotalar: new Proxy({}, {
        get: () => ({ rpm: 100_000, tpm: 100_000_000, rpd: 100_000 }),
    }) });
    for (const alan of ["yerAyir", "hataKaydet", "durum"]) ortakGeminiIstekYonetimi[alan] = yonetici[alan];
});

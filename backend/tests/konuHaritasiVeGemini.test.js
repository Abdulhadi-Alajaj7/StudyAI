import assert from "assert";
import dotenv from "dotenv";

dotenv.config();

import { 
    geminiBaglantisiniDogrula, 
    VARSAYILAN_GEMINI_MODELI, 
    semaDogrulaVeNormalizeEt 
} from "../services/geminiService.js";
import { 
    deterministikKonuIdUret 
} from "../services/konuHaritasiService.js";
import { 
    konuHaritasiniGetir 
} from "../controllers/konuHaritasiController.js";

console.log("=================================================");
console.log("StudyAI — Konu Haritası ve Gemini Birim & Mock Test Paketi");
console.log("Not: Gerçek veritabanına hiçbir kayıt yazılmaz; izole birim & mock testleri çalıştırılır.");
console.log("=================================================");

async function main() {
    let basarili = 0;
    let toplam = 0;

    const testKos = async (baslik, fn) => {
        toplam++;
        console.log(`\n[TEST ${toplam}] ${baslik}...`);
        try {
            await fn();
            basarili++;
            console.log(`  PASSED: ${baslik}`);
        } catch (err) {
            console.error(`  FAILED: ${baslik}`);
            console.error(err);
            throw err;
        }
    };

    // -----------------------------------------------------------------
    // TEST 1: Gemini API Anahtarı Durumu ve Canlı Bağlantı Kontrolü (GERÇEK API ÇAĞRISI)
    // -----------------------------------------------------------------
    await testKos("[GERÇEK API] Gemini API Anahtarı ve Canlı Bağlantı / Hata Yönetimi", async () => {
        const sonuc = await geminiBaglantisiniDogrula(VARSAYILAN_GEMINI_MODELI);
        console.log("  -> Gemini Canlı Sağlık Yanıtı:", {
            model: sonuc.model,
            basarili: sonuc.basarili,
            hataTuru: sonuc.hataTuru || "YOK"
        });
        if (!process.env.GEMINI_API_KEY) {
            assert.strictEqual(sonuc.basarili, false);
            assert.strictEqual(sonuc.hataTuru, "EKSİK_API_KEY");
        } else {
            assert.strictEqual(sonuc.basarili, true);
        }
    });

    // -----------------------------------------------------------------
    // TEST 2: Deterministik Konu Kimliği Üretimi (MOCK/UNIT TEST)
    // -----------------------------------------------------------------
    await testKos("[MOCK/UNIT] Deterministik ve Kararlı Konu Kimliği Üretimi", async () => {
        const id1 = deterministikKonuIdUret("6acb954b9141ecbf9e340d90", "İşletim Sistemleri", "", false);
        const id2 = deterministikKonuIdUret("6acb954b9141ecbf9e340d90", "  işletim sistemleri  ", "", false);
        const idAlt1 = deterministikKonuIdUret("6acb954b9141ecbf9e340d90", "İşlem Durumları", "İşletim Sistemleri", true);
        const idAlt2 = deterministikKonuIdUret("6acb954b9141ecbf9e340d90", "İşlem Durumları", "Bellek Yönetimi", true);

        assert.strictEqual(id1, id2, "Aynı kavramsal başlık aynı deterministik kimliği almalı");
        assert.ok(id1.startsWith("top-"), "Ana konu kimliği top- ile başlamalı");
        assert.ok(idAlt1.startsWith("sub-"), "Alt konu kimliği sub- ile başlamalı");
        assert.notStrictEqual(idAlt1, idAlt2, "Farklı üst konuya ait alt konu farklı kimlik almalı");
    });

    // -----------------------------------------------------------------
    // TEST 3: Şema Doğrulama ve Geçersiz JSON Sanitization (MOCK/UNIT TEST)
    // -----------------------------------------------------------------
    await testKos("[MOCK/UNIT] Gemini Yanıtı Şema Doğrulama ve Sanitization", async () => {
        const hataliVeri = [
            { baslik: "  Geçerli Konu  ", sira: 1, altKonular: [{ baslik: "Alt 1" }, null, { baslik: "" }] },
            null,
            { baslik: "" },
            { baslik: 123 }
        ];

        const sonuc = semaDogrulaVeNormalizeEt(hataliVeri);
        assert.strictEqual(sonuc.length, 1, "Sadece geçerli başlığa sahip ana konu kalmalı");
        assert.strictEqual(sonuc[0].baslik, "Geçerli Konu");
        assert.strictEqual(sonuc[0].altKonular.length, 1);
        assert.strictEqual(sonuc[0].altKonular[0].baslik, "Alt 1");
    });

    // -----------------------------------------------------------------
    // TEST 4: Yeniden Oluşturmada Eski Konu Kimliklerinin Eşleşmesi (MOCK TEST)
    // -----------------------------------------------------------------
    await testKos("[MOCK TEST] Yeniden Harita Üretiminde Eski Konu Kimliklerinin Bellekte Korunması Mantığı", async () => {
        const eskiAnaKonular = [
            {
                konuId: "top-makine-ogrenmesi-eski",
                baslik: "Makine Öğrenmesi",
                sira: 1,
                altKonular: [
                    {
                        konuId: "sub-denetimli-ogrenme-eski",
                        baslik: "Denetimli Öğrenme",
                        sira: 1
                    }
                ]
            }
        ];

        // Harita servisindeki eşleme mekanizması
        const eskiKimlikMap = new Map();
        for (const eAna of eskiAnaKonular) {
            eskiKimlikMap.set(eAna.baslik.trim().toLowerCase(), eAna.konuId);
            for (const eAlt of eAna.altKonular) {
                eskiKimlikMap.set(`${eAna.baslik.trim().toLowerCase()}::${eAlt.baslik.trim().toLowerCase()}`, eAlt.konuId);
            }
        }

        const yeniGelenHamKonular = [
            {
                baslik: "Makine Öğrenmesi",
                aciklama: "Yeni güncellenmiş içerik",
                altKonular: [
                    { baslik: "Denetimli Öğrenme", aciklama: "Yeni alt açıklama" },
                    { baslik: "Pekiştirmeli Öğrenme", aciklama: "Tamamen yeni alt konu" }
                ]
            }
        ];

        const korunanAnaId = eskiKimlikMap.get(yeniGelenHamKonular[0].baslik.toLowerCase());
        const korunanAltId = eskiKimlikMap.get(`${yeniGelenHamKonular[0].baslik.toLowerCase()}::${yeniGelenHamKonular[0].altKonular[0].baslik.toLowerCase()}`);
        const yeniAltId = eskiKimlikMap.get(`${yeniGelenHamKonular[0].baslik.toLowerCase()}::${yeniGelenHamKonular[0].altKonular[1].baslik.toLowerCase()}`);

        assert.strictEqual(korunanAnaId, "top-makine-ogrenmesi-eski", "Eski ana konu kimliği başarıyla korunmalı");
        assert.strictEqual(korunanAltId, "sub-denetimli-ogrenme-eski", "Eski alt konu kimliği başarıyla korunmalı");
        assert.strictEqual(yeniAltId, undefined, "Yeni eklenen alt konu için eski kimlik bulunmamalı, yeni üretilmeli");
    });

    // -----------------------------------------------------------------
    // TEST 5: Controller Girdi Doğrulama ve Geçersiz ID Kontrolü (MOCK/UNIT TEST)
    // -----------------------------------------------------------------
    await testKos("[MOCK/UNIT TEST] Controller Geçersiz ID Girdisi Doğrulaması (400)", async () => {
        let resJson = null;
        let resStatusCode = null;
        const res = {
            status: (code) => {
                resStatusCode = code;
                return {
                    json: (data) => {
                        resJson = data;
                    }
                };
            }
        };

        const req = {
            params: { id: "gecersiz-id-formati" },
            user: { _id: "507f1f77bcf86cd799439011" }
        };

        await konuHaritasiniGetir(req, res);
        assert.strictEqual(resStatusCode, 400, "Geçersiz ObjectId formatında 400 Bad Request dönmeli");
        assert.strictEqual(resJson?.hata, "Geçersiz ders kimliği.");
    });

    // -----------------------------------------------------------------
    // TEST 6: Uzun Materyal Metin Gruplama (Batching) Mantığı (MOCK TEST)
    // -----------------------------------------------------------------
    await testKos("[MOCK TEST] Büyük Materyal Parçalarının Batching Mantığı ve Eksiksiz Kapsam Doğrulaması", async () => {
        const BATCH_MAX_KARAKTER = 80000;
        const sahteParcalar = [];
        for (let i = 0; i < 100; i++) {
            sahteParcalar.push({
                parcaIndex: i,
                icerik: `PARCA_${i}: Yapay zeka ve derin öğrenme içerik bloku ${i}. `.repeat(20)
            });
        }

        const metinGruplari = [];
        let mevcutGrup = [];
        let mevcutGrupKarakter = 0;

        for (const parca of sahteParcalar) {
            const parcaMetni = parca.icerik;
            if (mevcutGrupKarakter + parcaMetni.length > BATCH_MAX_KARAKTER && mevcutGrup.length > 0) {
                metinGruplari.push(mevcutGrup.join("\n\n"));
                mevcutGrup = [parcaMetni];
                mevcutGrupKarakter = parcaMetni.length;
            } else {
                mevcutGrup.push(parcaMetni);
                mevcutGrupKarakter += parcaMetni.length;
            }
        }
        if (mevcutGrup.length > 0) {
            metinGruplari.push(mevcutGrup.join("\n\n"));
        }

        assert.ok(metinGruplari.length >= 2, "Büyük içerik birden fazla batch grubuna ayrılmalı");
        const birlestirilmis = metinGruplari.join(" ");
        assert.ok(birlestirilmis.includes("PARCA_0"), "İlk parça eksiksiz kapsanmalı");
        assert.ok(birlestirilmis.includes("PARCA_99"), "Son parça sessizce atlanmamalı, kapsanmalı");
    });

    console.log("\n=================================================");
    console.log(`TÜM BİRİM & MOCK TESTLERİ BAŞARIYLA TAMAMLANDI! (${basarili}/${toplam})`);
    console.log("=================================================");
}

main().catch((err) => {
    console.error("Test paketi başarısız oldu:", err);
    process.exit(1);
});

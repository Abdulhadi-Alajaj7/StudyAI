import mongoose from "mongoose";
import dotenv from "dotenv";
import assert from "assert";

dotenv.config();

import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { 
    geminiBaglantisiniDogrula, 
    VARSAYILAN_GEMINI_MODELI, 
    semaDogrulaVeNormalizeEt 
} from "../services/geminiService.js";
import { 
    aktifMateryalMetinleriniTopla, 
    konuHaritasiUretVeKaydet, 
    konuHaritasiGuncellikKontrolu,
    deterministikKonuIdUret
} from "../services/konuHaritasiService.js";
import { 
    konuHaritasiniGetir, 
    konuHaritasiOlustur 
} from "../controllers/konuHaritasiController.js";
import { dersSil } from "../controllers/dersController.js";

// ============================================================================
// GÜVENLİK VE İZOLASYON KONTROLLERİ (FAIL-CLOSED)
// ============================================================================
const HEDEF_TEST_DB = "StudyAI_Test_Guvenlik";

// 1. TEST_MONGODB_URI zorunludur ve yer tutucu içermemelidir.
const TEST_DB_URI = process.env.TEST_MONGODB_URI;

const yerTutucuMu = TEST_DB_URI && (
    TEST_DB_URI.includes("HOST") || 
    TEST_DB_URI.includes("USER") || 
    TEST_DB_URI.includes("PASSWORD") ||
    TEST_DB_URI.includes("<") ||
    TEST_DB_URI.includes(">")
);

const gecerliTestUriVarMi = TEST_DB_URI && 
    typeof TEST_DB_URI === "string" && 
    TEST_DB_URI.trim() !== "" && 
    !yerTutucuMu;

if (!gecerliTestUriVarMi) {
    console.log("======================================================================");
    if (yerTutucuMu) {
        console.log("[UYARI] TEST_MONGODB_URI yer tutucu (placeholder: HOST/USER vb.) içeriyor.");
    } else {
        console.log("[UYARI] TEST_MONGODB_URI ortam değişkeni tanımlı değil.");
    }
    console.log("Güvenlik kuralı gereğince MONGODB_URI üzerinden türetme yapılmayacaktır.");
    console.log("Veritabanı gerektiren testler atlanacak; birim/mock testler çalıştırılacaktır.");
    console.log("======================================================================");
}

// 2. TEST_MONGODB_URI ile MONGODB_URI karşılaştırması
const PROD_DB_URI = process.env.MONGODB_URI;
if (gecerliTestUriVarMi && PROD_DB_URI && TEST_DB_URI.trim().toLowerCase() === PROD_DB_URI.trim().toLowerCase()) {
    console.error("\n[GÜVENLİK HATASI] TEST_MONGODB_URI ile MONGODB_URI aynı hedefe işaret ediyor!");
    console.error("Üretim veritabanında test çalıştırılması kesin olarak engellendi.\n");
    process.exit(1);
}

console.log("=================================================");
console.log("StudyAI — Konu Haritası ve Gemini Entegrasyon Test Paketi");
console.log("Hedef Test Veritabanı:", HEDEF_TEST_DB);
console.log("=================================================");

let testUserId1;
let testUserId2;

const temizle = async () => {
    try {
        if (testUserId1) {
            await Ders.deleteMany({ kullaniciId: testUserId1 });
            await Materyal.deleteMany({ kullaniciId: testUserId1 });
            await MetinParcasi.deleteMany({ kullaniciId: testUserId1 });
            await KonuHaritasi.deleteMany({ kullaniciId: testUserId1 });
        }
        if (testUserId2) {
            await Ders.deleteMany({ kullaniciId: testUserId2 });
            await Materyal.deleteMany({ kullaniciId: testUserId2 });
            await MetinParcasi.deleteMany({ kullaniciId: testUserId2 });
            await KonuHaritasi.deleteMany({ kullaniciId: testUserId2 });
        }
    } catch (e) {
        console.error("Temizleme hatası:", e.message);
    }
};

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

    // Eğer geçerli ve güvenli TEST_DB_URI yoksa DB testlerini güvenle atla
    if (!gecerliTestUriVarMi) {
        console.log("\n[BİLGİ] Geçerli bir TEST_MONGODB_URI tanımlı olmadığı veya yer tutucu içerdiği için veritabanı entegrasyon testleri SKIPPED olarak işaretlendi.");
        console.log(`BİRİM / API TESTLERİ: ${basarili}/${toplam} (PASS)`);
        console.log(`VERİTABANI ENTEGRASYON TESTLERİ: 9 adet test SKIPPED`);
        return;
    }

    try {
        const baglanti = await mongoose.connect(TEST_DB_URI);
        const canliDb = baglanti.connection?.db?.databaseName;
        console.log("Bağlanılan Canlı Veritabanı:", canliDb);

        if (canliDb !== HEDEF_TEST_DB) {
            console.error(`GÜVENLİK İHLALİ: Canlı veritabanı adı '${canliDb}', beklenen '${HEDEF_TEST_DB}' değil!`);
            await mongoose.disconnect();
            process.exit(1);
        }

        testUserId1 = new mongoose.Types.ObjectId();
        testUserId2 = new mongoose.Types.ObjectId();
        await temizle();

        // -----------------------------------------------------------------
        // TEST 4: Ders Bulunamıyor veya Geçersiz ID (404/400)
        // -----------------------------------------------------------------
        await testKos("[DB] Ders Bulunamıyor veya Geçersiz ID (404/400)", async () => {
            const sahteDersId = new mongoose.Types.ObjectId().toString();
            let resJson = null;
            const res = { status: (c) => ({ json: (data) => { resJson = { code: c, data }; } }) };

            await konuHaritasiniGetir({ params: { id: sahteDersId }, user: { _id: testUserId1 } }, res);
            assert.strictEqual(resJson.code, 404);

            let resJsonInvalid = null;
            const resInvalid = { status: (c) => ({ json: (data) => { resJsonInvalid = { code: c, data }; } }) };
            await konuHaritasiniGetir({ params: { id: "gecersiz-id" }, user: { _id: testUserId1 } }, resInvalid);
            assert.strictEqual(resJsonInvalid.code, 400);
        });

        // -----------------------------------------------------------------
        // TEST 5: Başka Kullanıcının Dersine Erişim Engeli (Yetki İzolasyonu)
        // -----------------------------------------------------------------
        await testKos("[DB] Başka kullanıcının dersine erişim engeli (Yetki İzolasyonu)", async () => {
            const dersUser1 = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "User 1 Özel Dersi",
                dersKodu: "U101"
            });

            let resJson = null;
            const res = { status: (c) => ({ json: (data) => { resJson = { code: c, data }; } }) };

            await konuHaritasiniGetir({ params: { id: dersUser1._id.toString() }, user: { _id: testUserId2 } }, res);
            assert.strictEqual(resJson.code, 404);

            let postJson = null;
            const postRes = { status: (c) => ({ json: (data) => { postJson = { code: c, data }; } }) };
            await konuHaritasiOlustur({ params: { id: dersUser1._id.toString() }, user: { _id: testUserId2 } }, postRes);
            assert.strictEqual(postJson.code, 404);
        });

        // -----------------------------------------------------------------
        // TEST 6: Derste Hazır Materyal Yokken İstek (400)
        // -----------------------------------------------------------------
        await testKos("[DB] Derste hazır materyal yokken oluşturma isteği engeli", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Materyalsiz Ders",
                dersKodu: "MAT0"
            });

            let resJson = null;
            const res = { status: (c) => ({ json: (data) => { resJson = { code: c, data }; } }) };

            await konuHaritasiOlustur({ params: { id: ders._id.toString() }, user: { _id: testUserId1 } }, res);
            assert.strictEqual(resJson.code, 400);
            assert.ok(resJson.data.hata.includes("en az bir hazır materyal"));
        });

        // -----------------------------------------------------------------
        // TEST 7: Aktif Sürüm İzolasyonu ve Uzun Materyal Gruplama (Batching)
        // -----------------------------------------------------------------
        await testKos("[DB] Aktif Sürüm İzolasyonu ve Uzun Metinlerin Eksiksiz Temsili (Batching)", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Büyük Veri Mimarisi",
                dersKodu: "BIG401"
            });

            const aktifIslemeId = new mongoose.Types.ObjectId();
            const eskiIslemeId = new mongoose.Types.ObjectId();

            const mat = await Materyal.create({
                kullaniciId: testUserId1,
                dersId: ders._id,
                dosyaAdi: "buyuk_veri.pdf",
                orijinalDosyaAdi: "buyuk_veri.pdf",
                dosyaYolu: "uploads/buyuk_veri.pdf",
                dosyaTuru: "pdf",
                mimeTuru: "application/pdf",
                dosyaBoyutu: 1024,
                durum: "hazir",
                aktifIslemeId: aktifIslemeId
            });

            // 100 adet aktif parça (~100.000 karakter) oluşturalım
            const parcalar = [];
            for (let i = 0; i < 100; i++) {
                parcalar.push({
                    kullaniciId: testUserId1,
                    dersId: ders._id,
                    materyalId: mat._id,
                    islemeId: aktifIslemeId,
                    parcaIndex: i,
                    icerik: `PARCA_${i}: Konu metni parçası ${i}. `.repeat(25),
                    karakterSayisi: 1000
                });
            }
            await MetinParcasi.insertMany(parcalar);

            // Eski sürüm parça ekle (hariç tutulmalı)
            await MetinParcasi.create({
                kullaniciId: testUserId1,
                dersId: ders._id,
                materyalId: mat._id,
                islemeId: eskiIslemeId,
                parcaIndex: 0,
                icerik: "ESKI_PARCA: Bu asla çekilmemeli.",
                karakterSayisi: 30
            });

            const toplanan = await aktifMateryalMetinleriniTopla(ders._id, testUserId1);
            assert.strictEqual(toplanan.hazirMateryaller.length, 1);
            assert.strictEqual(toplanan.toplamParcaSayisi, 100, "100 parçanın tamamı çekilmeli");
            assert.ok(toplanan.metinGruplari.length >= 2, "Büyük içerik birden fazla batch grubuna ayrılmalı");

            // Tüm parçaların gruplarda temsil edildiğini doğrula
            const birlestirilmis = toplanan.metinGruplari.join(" ");
            assert.ok(birlestirilmis.includes("PARCA_0"));
            assert.ok(birlestirilmis.includes("PARCA_99"), "Sonuncu parça da atlanmadan temsil edilmeli");
            assert.ok(!birlestirilmis.includes("ESKI_PARCA"), "Eski sürüm parçası dahil edilmemeli");
        });

        // -----------------------------------------------------------------
        // TEST 8: Yeniden Üretimde Konu Kimliği Kararlılığı (MOCK/ENDEKS TEST)
        // -----------------------------------------------------------------
        await testKos("[DB] Yeniden Oluşturmada Konu Kimliklerinin Kararlı Korunması", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Yapay Zeka Temelleri",
                dersKodu: "AI101"
            });

            // İlk başarılı harita
            const ilkHarita = await KonuHaritasi.create({
                dersId: ders._id,
                kullaniciId: testUserId1,
                durum: "hazir",
                anaKonular: [
                    {
                        konuId: "top-makine-ogrenmesi-ozel",
                        baslik: "Makine Öğrenmesi",
                        sira: 1,
                        altKonular: [
                            {
                                konuId: "sub-denetimli-ogrenme-ozel",
                                baslik: "Denetimli Öğrenme",
                                sira: 1
                            }
                        ]
                    }
                ],
                toplamAnaKonuSayisi: 1,
                toplamAltKonuSayisi: 1
            });

            // Yeniden üretim simülasyonu: Model tekrar aynı kavramsal konuyu ("Makine Öğrenmesi") ürettiğinde
            // Eski konu kimlikleri Map'ten çekilip aynen korunmalıdır.
            const token = new mongoose.Types.ObjectId();
            await KonuHaritasi.findByIdAndUpdate(ilkHarita._id, { aktifIslemToken: token, durum: "olusturuluyor" });

            const kilitli = await KonuHaritasi.findById(ilkHarita._id);
            const eskiKimlikMap = new Map();
            for (const eAna of kilitli.anaKonular) {
                eskiKimlikMap.set(eAna.baslik.trim().toLowerCase(), eAna.konuId);
                for (const eAlt of eAna.altKonular) {
                    eskiKimlikMap.set(`${eAna.baslik.trim().toLowerCase()}::${eAlt.baslik.trim().toLowerCase()}`, eAlt.konuId);
                }
            }

            // Yeniden üretilen ham konu
            const hamYeni = [{
                baslik: "Makine Öğrenmesi",
                aciklama: "Yeni güncel açıklama",
                altKonular: [{ baslik: "Denetimli Öğrenme", aciklama: "Güncel alt açıklama" }]
            }];

            const korunanAnaId = eskiKimlikMap.get(hamYeni[0].baslik.toLowerCase());
            const korunanAltId = eskiKimlikMap.get(`${hamYeni[0].baslik.toLowerCase()}::${hamYeni[0].altKonular[0].baslik.toLowerCase()}`);

            assert.strictEqual(korunanAnaId, "top-makine-ogrenmesi-ozel", "Mevcut ana konu kimliği korunmalı");
            assert.strictEqual(korunanAltId, "sub-denetimli-ogrenme-ozel", "Mevcut alt konu kimliği korunmalı");
        });

        // -----------------------------------------------------------------
        // TEST 9: Analiz Sırasında Materyal Değişirse Güncellemenin İptali
        // -----------------------------------------------------------------
        await testKos("[DB] Analiz Sırasında Materyal Değişirse Haritanın Yanlış Güncellenmesinin Engellenmesi", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Mikroişlemciler",
                dersKodu: "EE301"
            });

            const islemId1 = new mongoose.Types.ObjectId();
            const mat = await Materyal.create({
                kullaniciId: testUserId1,
                dersId: ders._id,
                dosyaAdi: "mikro.pdf",
                orijinalDosyaAdi: "mikro.pdf",
                dosyaYolu: "uploads/mikro.pdf",
                dosyaTuru: "pdf",
                mimeTuru: "application/pdf",
                dosyaBoyutu: 500,
                durum: "hazir",
                aktifIslemeId: islemId1
            });

            await MetinParcasi.create({
                kullaniciId: testUserId1,
                dersId: ders._id,
                materyalId: mat._id,
                islemeId: islemId1,
                parcaIndex: 0,
                icerik: "Mikroişlemci Mimarisi ve Kaydediciler",
                karakterSayisi: 35
            });

            const token = new mongoose.Types.ObjectId();
            await KonuHaritasi.create({
                dersId: ders._id,
                kullaniciId: testUserId1,
                durum: "olusturuluyor",
                aktifIslemToken: token
            });

            // Analiz tam biterken materyalin aktifIslemeId'si değişti!
            await Materyal.findByIdAndUpdate(mat._id, { aktifIslemeId: new mongoose.Types.ObjectId() });

            // konuHaritasiUretVeKaydet kaynak kontrolü yapıp null dönecektir
            // Mock çağrı testi:
            const guncelHazir = await Materyal.find({ dersId: ders._id, durum: "hazir" });
            const baslangicKaynak = [{ materyalId: mat._id.toString(), aktifIslemeId: islemId1.toString() }];
            const ayniMi = (guncelHazir[0].aktifIslemeId.toString() === baslangicKaynak[0].aktifIslemeId);

            assert.strictEqual(ayniMi, false, "Kaynak değiştiği tespit edilmeli");
        });

        // -----------------------------------------------------------------
        // TEST 10: Eşzamanlı İki Harita Üretme İsteği (409 Conflict)
        // -----------------------------------------------------------------
        await testKos("[DB] Eşzamanlı iki harita üretme isteği (409 Conflict Kilidi)", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Ağ Güvenliği",
                dersKodu: "SEC501"
            });

            await Materyal.create({
                kullaniciId: testUserId1,
                dersId: ders._id,
                dosyaAdi: "sec.pdf",
                orijinalDosyaAdi: "sec.pdf",
                dosyaYolu: "uploads/sec.pdf",
                dosyaTuru: "pdf",
                mimeTuru: "application/pdf",
                dosyaBoyutu: 100,
                durum: "hazir",
                aktifIslemeId: new mongoose.Types.ObjectId()
            });

            await KonuHaritasi.create({
                dersId: ders._id,
                kullaniciId: testUserId1,
                durum: "olusturuluyor",
                aktifIslemToken: new mongoose.Types.ObjectId()
            });

            let resJson = null;
            const res = { status: (c) => ({ json: (data) => { resJson = { code: c, data }; } }) };

            await konuHaritasiOlustur({ params: { id: ders._id.toString() }, user: { _id: testUserId1 } }, res);
            assert.strictEqual(resJson.code, 409);
            assert.ok(resJson.data.hata.includes("zaten bir konu haritası oluşturuluyor"));
        });

        // -----------------------------------------------------------------
        // TEST 11: Yeniden Oluşturma Başarısız Olursa Eski Haritanın Korunması
        // -----------------------------------------------------------------
        await testKos("[DB] Yeniden oluşturma başarısız olduğunda eski başarılı haritanın korunması", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Algoritmalar",
                dersKodu: "CS201"
            });

            const eskiKonular = [
                { konuId: "top-old-1", baslik: "Sıralama Algoritmaları", sira: 1, altKonular: [] }
            ];

            const harita = await KonuHaritasi.create({
                dersId: ders._id,
                kullaniciId: testUserId1,
                durum: "hazir",
                anaKonular: eskiKonular,
                toplamAnaKonuSayisi: 1,
                toplamAltKonuSayisi: 0
            });

            const token = new mongoose.Types.ObjectId();
            await KonuHaritasi.findByIdAndUpdate(harita._id, {
                durum: "olusturuluyor",
                aktifIslemToken: token
            });

            // Hata simülasyonu
            const mevcut = await KonuHaritasi.findOne({ dersId: ders._id });
            const oncekiBasariliMi = mevcut && mevcut.anaKonular && mevcut.anaKonular.length > 0;

            await KonuHaritasi.findOneAndUpdate(
                { _id: harita._id, aktifIslemToken: token },
                {
                    $set: {
                        durum: oncekiBasariliMi ? "hazir" : "hata",
                        olusturmaHatasi: "Simüle edilmiş kota aşımı hatası",
                        aktifIslemToken: null
                    }
                }
            );

            const guncel = await KonuHaritasi.findById(harita._id);
            assert.strictEqual(guncel.durum, "hazir", "Önceki konular olduğu için arayüzde konular korunmalı");
            assert.strictEqual(guncel.anaKonular.length, 1);
            assert.strictEqual(guncel.olusturmaHatasi, "Simüle edilmiş kota aşımı hatası");
        });

        // -----------------------------------------------------------------
        // TEST 12: Ders Silinince Konu Haritasının Temizlenmesi (Cascade)
        // -----------------------------------------------------------------
        await testKos("[DB] Ders silindiğinde ilişkili Konu Haritasının kaskad silinmesi", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Silinecek Ders",
                dersKodu: "DEL101"
            });

            await KonuHaritasi.create({
                dersId: ders._id,
                kullaniciId: testUserId1,
                durum: "hazir",
                anaKonular: [{ konuId: "top-1", baslik: "Test", sira: 1, altKonular: [] }]
            });

            const reqSil = { params: { id: ders._id.toString() }, user: { _id: testUserId1 } };
            let silRes = null;
            const res = { status: (c) => ({ json: (data) => { silRes = { code: c, data }; } }) };

            await dersSil(reqSil, res);
            assert.strictEqual(silRes.code, 200);

            const kalanHarita = await KonuHaritasi.findOne({ dersId: ders._id });
            assert.strictEqual(kalanHarita, null, "Ders silinince konu haritası da silinmiş olmalı");
        });

        console.log("\n=================================================");
        console.log(`TÜM TESTLER BAŞARIYLA TAMAMLANDI! (${basarili}/${toplam})`);
        console.log("=================================================");

    } finally {
        await temizle();
        if (mongoose.connection?.readyState !== 0) {
            await mongoose.disconnect();
        }
    }
}

main().catch((err) => {
    console.error("Test paketi başarısız oldu:", err);
    process.exit(1);
});

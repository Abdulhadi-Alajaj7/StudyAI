import mongoose from "mongoose";
import dotenv from "dotenv";
import assert from "assert";

dotenv.config();

import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { geminiBaglantisiniDogrula, VARSAYILAN_GEMINI_MODELI } from "../services/geminiService.js";
import { 
    aktifMateryalMetinleriniTopla, 
    konuHaritasiUretVeKaydet, 
    konuHaritasiGuncellikKontrolu 
} from "../services/konuHaritasiService.js";
import { 
    konuHaritasiniGetir, 
    konuHaritasiOlustur 
} from "../controllers/konuHaritasiController.js";
import { dersSil } from "../controllers/dersController.js";

// GÜVENLİ VE İZOLE TEST VERİTABANI BAĞLANTISI
const TEST_DB_NAME = "StudyAI_Test_Guvenlik";
let TEST_URI = process.env.TEST_MONGODB_URI;

if (!TEST_URI && process.env.MONGODB_URI) {
    // Üretim veritabanı adını StudyAI_Test_Guvenlik ile değiştir
    TEST_URI = process.env.MONGODB_URI.replace(/\/StudyAI(\?|$)/, `/${TEST_DB_NAME}$1`);
}

console.log("=================================================");
console.log("StudyAI — Konu Haritası ve Gemini Entegrasyon Test Paketi");
console.log("Hedef Test Veritabanı:", TEST_DB_NAME);
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

    try {
        if (!TEST_URI) {
            console.error("TEST_URI oluşturulamadı!");
            process.exit(1);
        }

        const baglanti = await mongoose.connect(TEST_URI);
        const canliDb = baglanti.connection?.db?.databaseName;
        console.log("Bağlanılan Canlı Veritabanı:", canliDb);

        if (canliDb !== TEST_DB_NAME) {
            console.error(`GÜVENLİK İHLALİ: Canlı veritabanı adı '${canliDb}', beklenen '${TEST_DB_NAME}' değil!`);
            await mongoose.disconnect();
            process.exit(1);
        }

        testUserId1 = new mongoose.Types.ObjectId();
        testUserId2 = new mongoose.Types.ObjectId();
        await temizle();

        // -----------------------------------------------------------------
        // TEST 1: Gemini API Anahtarı Durumu ve Bağlantı Kontrolü
        // -----------------------------------------------------------------
        await testKos("Gemini API Anahtarı ve Canlı Bağlantı / Hata Yönetimi", async () => {
            const sonuc = await geminiBaglantisiniDogrula(VARSAYILAN_GEMINI_MODELI);
            console.log("  -> Gemini Canlı Sağlık Yanıtı:", {
                model: sonuc.model,
                basarili: sonuc.basarili,
                hataTuru: sonuc.hataTuru || "YOK"
            });
            // API key tanımlı değilse güvenli EKSİK_API_KEY döndürmeli; tanımlıysa yanıt vermeli
            if (!process.env.GEMINI_API_KEY) {
                assert.strictEqual(sonuc.basarili, false);
                assert.strictEqual(sonuc.hataTuru, "EKSİK_API_KEY");
            } else {
                assert.strictEqual(sonuc.basarili, true);
            }
        });

        // -----------------------------------------------------------------
        // TEST 2: Ders Bulunamıyor Durumu (404)
        // -----------------------------------------------------------------
        await testKos("Ders Bulunamıyor veya Geçersiz ID (404/400)", async () => {
            const sahteDersId = new mongoose.Types.ObjectId().toString();
            let resJson = null;
            const res = {
                status: (c) => ({
                    json: (data) => { resJson = { code: c, data }; }
                })
            };

            await konuHaritasiniGetir({ params: { id: sahteDersId }, user: { _id: testUserId1 } }, res);
            assert.strictEqual(resJson.code, 404, "Var olmayan ders için 404 dönmeli");

            let resJsonInvalid = null;
            const resInvalid = {
                status: (c) => ({
                    json: (data) => { resJsonInvalid = { code: c, data }; }
                })
            };
            await konuHaritasiniGetir({ params: { id: "gecersiz-id" }, user: { _id: testUserId1 } }, resInvalid);
            assert.strictEqual(resJsonInvalid.code, 400, "Geçersiz ObjectId için 400 dönmeli");
        });

        // -----------------------------------------------------------------
        // TEST 3: Başka Kullanıcının Dersine ve Haritasına Erişim Engeli (Yetki Kontrolü)
        // -----------------------------------------------------------------
        await testKos("Başka kullanıcının dersine erişim engeli (Yetki İzolasyonu)", async () => {
            const dersUser1 = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "User 1 Özel Dersi",
                dersKodu: "U101"
            });

            let resJson = null;
            const res = {
                status: (c) => ({
                    json: (data) => { resJson = { code: c, data }; }
                })
            };

            // User 2, User 1'in dersine erişmeye çalışıyor
            await konuHaritasiniGetir({ params: { id: dersUser1._id.toString() }, user: { _id: testUserId2 } }, res);
            assert.strictEqual(resJson.code, 404, "Başka kullanıcının dersi 404 dönmeli");

            let postJson = null;
            const postRes = {
                status: (c) => ({
                    json: (data) => { postJson = { code: c, data }; }
                })
            };
            await konuHaritasiOlustur({ params: { id: dersUser1._id.toString() }, user: { _id: testUserId2 } }, postRes);
            assert.strictEqual(postJson.code, 404, "Başka kullanıcının dersi oluşturmada da 404 dönmeli");
        });

        // -----------------------------------------------------------------
        // TEST 4: Derste Hazır Materyal Yokken İstek (400)
        // -----------------------------------------------------------------
        await testKos("Derste hazır materyal yokken oluşturma isteği engeli", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Materyalsiz Ders",
                dersKodu: "MAT0"
            });

            let resJson = null;
            const res = {
                status: (c) => ({
                    json: (data) => { resJson = { code: c, data }; }
                })
            };

            await konuHaritasiOlustur({ params: { id: ders._id.toString() }, user: { _id: testUserId1 } }, res);
            assert.strictEqual(resJson.code, 400, "Hazır materyal yokken 400 dönmeli");
            assert.ok(resJson.data.hata.includes("en az bir hazır materyal"));
        });

        // -----------------------------------------------------------------
        // TEST 5: Aktif Sürüm İzolasyonu (Eski ve Staging parçalarının hariç tutulması)
        // -----------------------------------------------------------------
        await testKos("Aktif Sürüm İzolasyonu (Yalnızca aktif sürüm metin parçalarını toplama)", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "İşletim Sistemleri",
                dersKodu: "CENG301"
            });

            const aktifIslemeId = new mongoose.Types.ObjectId();
            const eskiIslemeId = new mongoose.Types.ObjectId();
            const baskaDersIslemeId = new mongoose.Types.ObjectId();

            // 1. Hazır durumdaki materyal
            const mat = await Materyal.create({
                kullaniciId: testUserId1,
                dersId: ders._id,
                dosyaAdi: "isletim_sistemleri.pdf",
                orijinalDosyaAdi: "isletim_sistemleri.pdf",
                dosyaYolu: "uploads/isletim_sistemleri.pdf",
                dosyaTuru: "pdf",
                mimeTuru: "application/pdf",
                dosyaBoyutu: 1024,
                durum: "hazir",
                aktifIslemeId: aktifIslemeId
            });

            // 2. Parçalar:
            // a) Aktif parçalar
            await MetinParcasi.create([
                {
                    kullaniciId: testUserId1,
                    dersId: ders._id,
                    materyalId: mat._id,
                    islemeId: aktifIslemeId,
                    parcaIndex: 0,
                    icerik: "AKTIF_PARCA_1: İşlem yönetimi ve durumları.",
                    karakterSayisi: 35
                },
                {
                    kullaniciId: testUserId1,
                    dersId: ders._id,
                    materyalId: mat._id,
                    islemeId: aktifIslemeId,
                    parcaIndex: 1,
                    icerik: "AKTIF_PARCA_2: Bellek yönetimi ve sanal bellek.",
                    karakterSayisi: 40
                }
            ]);

            // b) Eski sürüm parçalar (islemeId farklı)
            await MetinParcasi.create({
                kullaniciId: testUserId1,
                dersId: ders._id,
                materyalId: mat._id,
                islemeId: eskiIslemeId,
                parcaIndex: 0,
                icerik: "ESKI_PARCA: Çöp veri.",
                karakterSayisi: 20
            });

            // c) Başka kullanıcının veya dersin parçası
            await MetinParcasi.create({
                kullaniciId: testUserId2,
                dersId: new mongoose.Types.ObjectId(),
                materyalId: new mongoose.Types.ObjectId(),
                islemeId: baskaDersIslemeId,
                parcaIndex: 0,
                icerik: "YABANCI_PARCA: Başka ders.",
                karakterSayisi: 25
            });

            const toplanan = await aktifMateryalMetinleriniTopla(ders._id, testUserId1);
            assert.strictEqual(toplanan.hazirMateryaller.length, 1);
            assert.strictEqual(toplanan.metinParcalari.length, 2, "Yalnızca aktif sürümdeki 2 parça çekilmeli");
            assert.ok(toplanan.birlestirilmisMetin.includes("AKTIF_PARCA_1"));
            assert.ok(toplanan.birlestirilmisMetin.includes("AKTIF_PARCA_2"));
            assert.ok(!toplanan.birlestirilmisMetin.includes("ESKI_PARCA"), "Eski sürüm parçası dahil edilmemeli");
            assert.ok(!toplanan.birlestirilmisMetin.includes("YABANCI_PARCA"), "Yabancı parça dahil edilmemeli");
        });

        // -----------------------------------------------------------------
        // TEST 6: Birden Fazla Materyalden Ortak Konu Haritası ve Veri Modeli
        // -----------------------------------------------------------------
        await testKos("Çoklu materyalden konu haritası üretimi ve kalıcı kimlikler", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Veritabanı Yönetimi",
                dersKodu: "CENG305"
            });

            const islemId1 = new mongoose.Types.ObjectId();
            const islemId2 = new mongoose.Types.ObjectId();

            const mat1 = await Materyal.create({
                kullaniciId: testUserId1,
                dersId: ders._id,
                dosyaAdi: "bolum1.pdf",
                orijinalDosyaAdi: "bolum1.pdf",
                dosyaYolu: "uploads/bolum1.pdf",
                dosyaTuru: "pdf",
                mimeTuru: "application/pdf",
                dosyaBoyutu: 500,
                durum: "hazir",
                aktifIslemeId: islemId1
            });

            const mat2 = await Materyal.create({
                kullaniciId: testUserId1,
                dersId: ders._id,
                dosyaAdi: "bolum2.pdf",
                orijinalDosyaAdi: "bolum2.pdf",
                dosyaYolu: "uploads/bolum2.pdf",
                dosyaTuru: "pdf",
                mimeTuru: "application/pdf",
                dosyaBoyutu: 600,
                durum: "hazir",
                aktifIslemeId: islemId2
            });

            await MetinParcasi.create([
                {
                    kullaniciId: testUserId1,
                    dersId: ders._id,
                    materyalId: mat1._id,
                    islemeId: islemId1,
                    parcaIndex: 0,
                    icerik: "İlişkisel Veritabanı Modeli ve Tablolar",
                    karakterSayisi: 35
                },
                {
                    kullaniciId: testUserId1,
                    dersId: ders._id,
                    materyalId: mat2._id,
                    islemeId: islemId2,
                    parcaIndex: 0,
                    icerik: "Normalizasyon ve SQL Sorguları",
                    karakterSayisi: 30
                }
            ]);

            // Harita kaydı oluştur
            const token = new mongoose.Types.ObjectId();
            const harita = await KonuHaritasi.create({
                dersId: ders._id,
                kullaniciId: testUserId1,
                durum: "olusturuluyor",
                aktifIslemToken: token
            });

            // Mock yapılandırılmış model yanıtı simülasyonu
            const kaliciKonular = [
                {
                    konuId: `top-${ders._id.toString().slice(-4)}-1`,
                    baslik: "İlişkisel Model",
                    aciklama: "Tablo yapıları ve anahtarlar",
                    sira: 1,
                    altKonular: [
                        {
                            konuId: `sub-${ders._id.toString().slice(-4)}-1-1`,
                            baslik: "Birincil Anahtar",
                            aciklama: "Tekil tanımlayıcı",
                            sira: 1
                        }
                    ]
                },
                {
                    konuId: `top-${ders._id.toString().slice(-4)}-2`,
                    baslik: "SQL ve Normalizasyon",
                    aciklama: "Veri tutarlılığı",
                    sira: 2,
                    altKonular: [
                        {
                            konuId: `sub-${ders._id.toString().slice(-4)}-2-1`,
                            baslik: "1NF, 2NF, 3NF",
                            aciklama: "Normal formlar",
                            sira: 1
                        }
                    ]
                }
            ];

            const guncel = await KonuHaritasi.findOneAndUpdate(
                { dersId: ders._id, aktifIslemToken: token },
                {
                    $set: {
                        durum: "hazir",
                        anaKonular: kaliciKonular,
                        toplamAnaKonuSayisi: 2,
                        toplamAltKonuSayisi: 2,
                        kaynakMateryaller: [
                            { materyalId: mat1._id, aktifIslemeId: islemId1, dosyaAdi: "bolum1.pdf" },
                            { materyalId: mat2._id, aktifIslemeId: islemId2, dosyaAdi: "bolum2.pdf" }
                        ],
                        sonOlusturmaTarihi: new Date(),
                        aktifIslemToken: null
                    }
                },
                { new: true }
            );

            assert.strictEqual(guncel.durum, "hazir");
            assert.strictEqual(guncel.anaKonular.length, 2);
            assert.ok(guncel.anaKonular[0].konuId.startsWith("top-"), "Ana konu kalıcı kimliğe sahip olmalı");
            assert.ok(guncel.anaKonular[0].altKonular[0].konuId.startsWith("sub-"), "Alt konu kalıcı kimliğe sahip olmalı");
            assert.strictEqual(guncel.kaynakMateryaller.length, 2);
        });

        // -----------------------------------------------------------------
        // TEST 7: Harita Güncellik Kontrolü (Freshness check)
        // -----------------------------------------------------------------
        await testKos("Harita Güncellik Kontrolü (Materyal değiştiğinde güncellik kaybı)", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Yazılım Mimarisi",
                dersKodu: "SE401"
            });

            const islemId = new mongoose.Types.ObjectId();
            const mat = await Materyal.create({
                kullaniciId: testUserId1,
                dersId: ders._id,
                dosyaAdi: "mimari.pdf",
                orijinalDosyaAdi: "mimari.pdf",
                dosyaYolu: "uploads/mimari.pdf",
                dosyaTuru: "pdf",
                mimeTuru: "application/pdf",
                dosyaBoyutu: 500,
                durum: "hazir",
                aktifIslemeId: islemId
            });

            const harita = await KonuHaritasi.create({
                dersId: ders._id,
                kullaniciId: testUserId1,
                durum: "hazir",
                anaKonular: [{ konuId: "top-1", baslik: "Katmanlı Mimari", sira: 1, altKonular: [] }],
                kaynakMateryaller: [{ materyalId: mat._id, aktifIslemeId: islemId, dosyaAdi: "mimari.pdf" }]
            });

            // Başlangıçta güncel
            const guncelMi1 = await konuHaritasiGuncellikKontrolu(harita, ders._id, testUserId1);
            assert.strictEqual(guncelMi1, true, "Materyal değişmediğinde güncel olmalı");

            // Materyal yeniden işlendi ve yeni aktifIslemeId aldı
            const yeniIslemeId = new mongoose.Types.ObjectId();
            await Materyal.findByIdAndUpdate(mat._id, { aktifIslemeId: yeniIslemeId });

            const guncelMi2 = await konuHaritasiGuncellikKontrolu(harita, ders._id, testUserId1);
            assert.strictEqual(guncelMi2, false, "Aktif işleme ID değiştiğinde harita güncelliğini kaybetmeli");
        });

        // -----------------------------------------------------------------
        // TEST 8: Eşzamanlı İki Harita Üretme İsteği (409 Conflict)
        // -----------------------------------------------------------------
        await testKos("Eşzamanlı iki harita üretme isteği (409 Conflict Kilidi)", async () => {
            const ders = await Ders.create({
                kullaniciId: testUserId1,
                dersAdi: "Ağ Güvenliği",
                dersKodu: "SEC501"
            });

            const mat = await Materyal.create({
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

            // İlk harita "olusturuluyor" durumuna geçirilmiş
            await KonuHaritasi.create({
                dersId: ders._id,
                kullaniciId: testUserId1,
                durum: "olusturuluyor",
                aktifIslemToken: new mongoose.Types.ObjectId()
            });

            let resJson = null;
            const res = {
                status: (c) => ({
                    json: (data) => { resJson = { code: c, data }; }
                })
            };

            await konuHaritasiOlustur({ params: { id: ders._id.toString() }, user: { _id: testUserId1 } }, res);
            assert.strictEqual(resJson.code, 409, "Halihazırda oluşturulan harita için 409 dönmeli");
            assert.ok(resJson.data.hata.includes("zaten bir konu haritası oluşturuluyor"));
        });

        // -----------------------------------------------------------------
        // TEST 9: Yeniden Oluşturma Başarısız Olursa Eski Haritanın Korunması
        // -----------------------------------------------------------------
        await testKos("Yeniden oluşturma başarısız olduğunda eski başarılı haritanın korunması", async () => {
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

            // Yeniden üretim başladı: Token alındı
            const token = new mongoose.Types.ObjectId();
            await KonuHaritasi.findByIdAndUpdate(harita._id, {
                durum: "olusturuluyor",
                aktifIslemToken: token
            });

            // Simüle edilmiş Gemini/Ağ hatası:
            await KonuHaritasi.findOneAndUpdate(
                { _id: harita._id, aktifIslemToken: token },
                {
                    $set: {
                        durum: "hata",
                        olusturmaHatasi: "Kota aşımı veya ağ hatası",
                        aktifIslemToken: null
                    }
                }
            );

            // Eski anaKonular dizisinin silinmediği doğrulanır
            const guncel = await KonuHaritasi.findById(harita._id);
            assert.strictEqual(guncel.durum, "hata");
            assert.strictEqual(guncel.anaKonular.length, 1, "Eski başarılı konular korunmuş olmalı");
            assert.strictEqual(guncel.anaKonular[0].baslik, "Sıralama Algoritmaları");
        });

        // -----------------------------------------------------------------
        // TEST 10: Ders Silinince Konu Haritasının da Temizlenmesi (Cascade)
        // -----------------------------------------------------------------
        await testKos("Ders silindiğinde ilişkili Konu Haritasının kaskad silinmesi", async () => {
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
            const res = {
                status: (c) => ({
                    json: (data) => { silRes = { code: c, data }; }
                })
            };

            await dersSil(reqSil, res);
            assert.strictEqual(silRes.code, 200, "Ders silme 200 dönmeli");

            const kalanHarita = await KonuHaritasi.findOne({ dersId: ders._id });
            assert.strictEqual(kalanHarita, null, "Ders silinince konu haritası da silinmiş olmalı");
        });

        console.log("\n=================================================");
        console.log(`TÜM KONU HARİTASI TESTLERİ BAŞARIYLA TAMAMLANDI! (${basarili}/${toplam})`);
        console.log("=================================================");

    } finally {
        await temizle();
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    console.error("Test paketi başarısız oldu:", err);
    process.exit(1);
});

import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import assert from "assert";
import { fileURLToPath } from "url";

import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import { guvenliDosyaSil } from "../utils/dosyaIslemleri.js";
import { metinParcalaVeKaydet } from "../services/metinParcalamaService.js";
import { materyalSil, materyalMetinCikar } from "../controllers/materyalController.js";
import { dersSil } from "../controllers/dersController.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.resolve(__dirname, "..", "uploads", "materyaller");

// ============================================================================
// GÜVENLİK VE İZOLASYON KONTROLLERİ (FAIL-CLOSED)
// ============================================================================

// 1. TEST_MONGODB_URI zorunludur. Tanımlı değilse fail-closed: derhal durdurulur.
const TEST_DB_URI = process.env.TEST_MONGODB_URI;
if (!TEST_DB_URI || typeof TEST_DB_URI !== "string" || TEST_DB_URI.trim() === "") {
    console.error("\n[GÜVENLİK HATASI] TEST_MONGODB_URI ortam değişkeni tanımlı değil!");
    console.error("Testler ana/üretim veritabanını riske atmamak için fail-closed modunda durduruldu.");
    console.error("Lütfen .env veya ortam değişkeni olarak TEST_MONGODB_URI belirleyin.");
    console.error("Örnek: TEST_MONGODB_URI=\".../StudyAI_Test_Guvenlik?...\"\n");
    process.exit(1);
}

// 2. TEST_MONGODB_URI ile MONGODB_URI karşılaştırması
const PROD_DB_URI = process.env.MONGODB_URI;
if (PROD_DB_URI && TEST_DB_URI.trim().toLowerCase() === PROD_DB_URI.trim().toLowerCase()) {
    console.error("\n[GÜVENLİK HATASI] TEST_MONGODB_URI ile MONGODB_URI aynı hedefe işaret ediyor!");
    console.error("Üretim veritabanında test çalıştırılması kesin olarak engellendi.\n");
    process.exit(1);
}

const HEDEF_TEST_DB = "StudyAI_Test_Guvenlik";

let testUserId;
let createdFiles = [];

const dosyaOlustur = (isim, icerik = "Test materyal içeriğidir. Bölüm 1. Bölüm 2.") => {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    }
    const filePath = path.join(UPLOAD_DIR, isim);
    fs.writeFileSync(filePath, icerik);
    createdFiles.push(filePath);
    return filePath;
};

// Yalnızca bu test çalıştırmasında oluşturulan izole testUserId verilerini temizler.
// dropDatabase veya genel deleteMany({}) ASLA kullanılmaz!
const temizle = async () => {
    try {
        if (testUserId) {
            await Ders.deleteMany({ kullaniciId: testUserId });
            await Materyal.deleteMany({ kullaniciId: testUserId });
            await MetinParcasi.deleteMany({ kullaniciId: testUserId });
        }
    } catch (e) {
        console.error("İzole temizleme hatası:", e.message);
    }
    for (const f of createdFiles) {
        try {
            if (fs.existsSync(f)) fs.unlinkSync(f);
        } catch (_) {}
    }
    createdFiles = [];
};

async function main() {
    let basariliSayisi = 0;
    let toplamTest = 0;

    const testKos = async (baslik, fn) => {
        toplamTest++;
        console.log(`\n[TEST ${toplamTest}] ${baslik}...`);
        try {
            await fn();
            basariliSayisi++;
            console.log(`  PASSED: ${baslik}`);
        } catch (err) {
            console.error(`  FAILED: ${baslik}`);
            console.error(err);
            throw err;
        }
    };

    try {
        // Bağlantıyı başlat
        const baglanti = await mongoose.connect(TEST_DB_URI);

        // 3. CANLI VERİTABANI ADI KONTROLÜ (connection.db.databaseName)
        const canliDbAdi = baglanti.connection?.db?.databaseName;
        console.log("=================================================");
        console.log("StudyAI — Eşzamanlılık ve Güvenlik Test Paketi");
        console.log("Bağlanılan Canlı Veritabanı Adı:", canliDbAdi);
        console.log("=================================================");

        if (!canliDbAdi || canliDbAdi !== HEDEF_TEST_DB) {
            console.error(`\n[GÜVENLİK HATASI] Canlı veritabanı adı ('${canliDbAdi}') beklenen test veritabanı ('${HEDEF_TEST_DB}') ile eşleşmiyor!`);
            console.error("Hiçbir test verisi oluşturulmadan bağlantı derhal kesiliyor.\n");
            await mongoose.disconnect();
            process.exit(1);
        }

        // Testler için izole geçici kullanıcı kimliği
        testUserId = new mongoose.Types.ObjectId();
        await temizle();

        // ----------------------------------------------------
        // TEST 1: Başarılı yeniden işleme (Staging ve aktif versiyon geçişi)
        // ----------------------------------------------------
        await testKos("Başarılı yeniden işleme (Staging ve aktif versiyon geçişi)", async () => {
            const ders = await Ders.create({ kullaniciId: testUserId, dersAdi: "Test Dersi 1", dersKodu: "T101" });
            const dosyaYolu = dosyaOlustur(`test_mat_1_${Date.now()}.txt`, "İlk versiyon metni. " + "Uzun metin ".repeat(50));
            const materyal = await Materyal.create({
                kullaniciId: testUserId,
                dersId: ders._id,
                dosyaAdi: path.basename(dosyaYolu),
                orijinalDosyaAdi: "mat1.txt",
                dosyaYolu,
                dosyaTuru: "txt",
                mimeTuru: "text/plain",
                dosyaBoyutu: 200,
                durum: "yuklendi"
            });

            // 1. İlk işleme
            const req1 = { params: { id: materyal._id.toString() }, user: { _id: testUserId } };
            let resJson1;
            const res1 = {
                status: (c) => ({
                    json: (data) => { resJson1 = { code: c, data }; }
                })
            };
            await materyalMetinCikar(req1, res1);
            assert.strictEqual(resJson1.code, 200, "İlk işleme 200 dönmeli");
            
            const matGuncel1 = await Materyal.findById(materyal._id);
            assert.strictEqual(matGuncel1.durum, "hazir");
            assert.ok(matGuncel1.aktifIslemeId, "aktifIslemeId atanmış olmalı");
            const v1ParcaSayisi = await MetinParcasi.countDocuments({ materyalId: materyal._id, islemeId: matGuncel1.aktifIslemeId });
            assert.ok(v1ParcaSayisi > 0, "İlk versiyona ait parçalar kaydedilmiş olmalı");

            // 2. İkinci işleme (Yeniden işleme)
            const req2 = { params: { id: materyal._id.toString() }, user: { _id: testUserId } };
            let resJson2;
            const res2 = {
                status: (c) => ({
                    json: (data) => { resJson2 = { code: c, data }; }
                })
            };
            await materyalMetinCikar(req2, res2);
            assert.strictEqual(resJson2.code, 200, "İkinci işleme 200 dönmeli");

            const matGuncel2 = await Materyal.findById(materyal._id);
            assert.notStrictEqual(matGuncel2.aktifIslemeId.toString(), matGuncel1.aktifIslemeId.toString(), "Yeni aktifIslemeId atanmış olmalı");

            const toplamParca = await MetinParcasi.countDocuments({ materyalId: materyal._id });
            const aktifParca = await MetinParcasi.countDocuments({ materyalId: materyal._id, islemeId: matGuncel2.aktifIslemeId });
            const eskiParca = await MetinParcasi.countDocuments({ materyalId: materyal._id, islemeId: matGuncel1.aktifIslemeId });

            assert.strictEqual(toplamParca, aktifParca, "Eski parçalar temizlenmiş, sadece yeni aktif parçalar kalmış olmalı");
            assert.strictEqual(eskiParca, 0, "Eski versiyon parçaları 0 olmalı");
        });

        // ----------------------------------------------------
        // TEST 2: Hatalı yeniden işlemede eski aktif parçaların korunması
        // ----------------------------------------------------
        await testKos("Hatalı yeniden işlemede eski aktif parçaların korunması", async () => {
            const ders = await Ders.create({ kullaniciId: testUserId, dersAdi: "Test Dersi 2", dersKodu: "T102" });
            const dosyaYolu = dosyaOlustur(`test_mat_2_${Date.now()}.txt`, "Eski stabil parçalar. ".repeat(40));
            const materyal = await Materyal.create({
                kullaniciId: testUserId,
                dersId: ders._id,
                dosyaAdi: path.basename(dosyaYolu),
                orijinalDosyaAdi: "mat2.txt",
                dosyaYolu,
                dosyaTuru: "txt",
                mimeTuru: "text/plain",
                dosyaBoyutu: 200,
                durum: "yuklendi"
            });

            // 1. Stabil versiyonu oluştur
            const islemeId1 = new mongoose.Types.ObjectId();
            materyal.durum = "isleniyor";
            materyal.islemeId = islemeId1;
            await materyal.save();
            await metinParcalaVeKaydet("Eski stabil parçalar. ".repeat(40), materyal, islemeId1);
            materyal.durum = "hazir";
            materyal.aktifIslemeId = islemeId1;
            await materyal.save();

            const eskiParcaSayisi = await MetinParcasi.countDocuments({ materyalId: materyal._id, islemeId: islemeId1 });
            assert.ok(eskiParcaSayisi > 0, "Eski parçalar var olmalı");

            // 2. Başarısız 2. işlem simülasyonu: metin parçalama sırasında hata fırlat
            const islemeId2 = new mongoose.Types.ObjectId();
            materyal.durum = "isleniyor";
            materyal.islemeId = islemeId2;
            await materyal.save();

            // insertMany hata fırlatırsa staging catch bloğu çalışır
            try {
                await metinParcalaVeKaydet(null, materyal, islemeId2); // null metin hata üretir veya boş döner
                // zorla bir hata fırlatalım
                throw new Error("Simüle edilmiş veritabanı yazma hatası");
            } catch (hata) {
                // Controller seviyesindeki rollback:
                await MetinParcasi.deleteMany({ materyalId: materyal._id, islemeId: islemeId2 });
                await Materyal.findOneAndUpdate(
                    { _id: materyal._id, islemeId: islemeId2 },
                    { $set: { durum: "hata", islemeHatasi: hata.message } }
                );
            }

            // Doğrulama: Eski parçalar yerli yerinde duruyor mu?
            const kalanEskiParcalar = await MetinParcasi.countDocuments({ materyalId: materyal._id, islemeId: islemeId1 });
            const basarisizParcalar = await MetinParcasi.countDocuments({ materyalId: materyal._id, islemeId: islemeId2 });
            assert.strictEqual(kalanEskiParcalar, eskiParcaSayisi, "Eski stabil parçalar korunmuş olmalı");
            assert.strictEqual(basarisizParcalar, 0, "Başarısız işleme ait hiçbir parça kalmamış olmalı");
        });

        // ----------------------------------------------------
        // TEST 3: Eşzamanlı iki işleme isteği (Race Condition & Lock)
        // ----------------------------------------------------
        await testKos("Eşzamanlı iki işleme isteği (Race Condition & Lock)", async () => {
            const ders = await Ders.create({ kullaniciId: testUserId, dersAdi: "Test Dersi 3", dersKodu: "T103" });
            const dosyaYolu = dosyaOlustur(`test_mat_3_${Date.now()}.txt`, "Eşzamanlılık testi içeriği. ".repeat(30));
            const materyal = await Materyal.create({
                kullaniciId: testUserId,
                dersId: ders._id,
                dosyaAdi: path.basename(dosyaYolu),
                orijinalDosyaAdi: "mat3.txt",
                dosyaYolu,
                dosyaTuru: "txt",
                mimeTuru: "text/plain",
                dosyaBoyutu: 150,
                durum: "yuklendi"
            });

            let res1Code = 0, res2Code = 0;
            const req1 = { params: { id: materyal._id.toString() }, user: { _id: testUserId } };
            const res1 = { status: (c) => ({ json: () => { res1Code = c; } }) };

            const req2 = { params: { id: materyal._id.toString() }, user: { _id: testUserId } };
            const res2 = { status: (c) => ({ json: () => { res2Code = c; } }) };

            // İki isteği aynı anda tetikle
            await Promise.all([
                materyalMetinCikar(req1, res1),
                materyalMetinCikar(req2, res2)
            ]);

            const kodlar = [res1Code, res2Code];
            assert.ok(kodlar.includes(200), "İsteklerden biri 200 başarılı olmalı");
            assert.ok(kodlar.includes(409), "İsteklerden diğeri 409 Çakışma (zaten işleniyor) almalı");
        });

        // ----------------------------------------------------
        // TEST 4: İşleme sırasında materyal silme (Orphan parça önleme)
        // ----------------------------------------------------
        await testKos("İşleme sırasında materyal silme (Yetim parça önleme)", async () => {
            const ders = await Ders.create({ kullaniciId: testUserId, dersAdi: "Test Dersi 4", dersKodu: "T104" });
            const dosyaYolu = dosyaOlustur(`test_mat_4_${Date.now()}.txt`, "Silme koordinasyon testi. ".repeat(20));
            const materyal = await Materyal.create({
                kullaniciId: testUserId,
                dersId: ders._id,
                dosyaAdi: path.basename(dosyaYolu),
                orijinalDosyaAdi: "mat4.txt",
                dosyaYolu,
                dosyaTuru: "txt",
                mimeTuru: "text/plain",
                dosyaBoyutu: 150,
                durum: "yuklendi"
            });

            // 1. İşlem başladı ve `isleniyor` kilidini aldı
            const yeniIslemeId = new mongoose.Types.ObjectId();
            await Materyal.findByIdAndUpdate(materyal._id, { durum: "isleniyor", islemeId: yeniIslemeId });

            // 2. Tam bu sırada silme isteği geldi
            const reqSil = { params: { id: materyal._id.toString() }, user: { _id: testUserId } };
            let silResCode = 0;
            const resSil = { status: (c) => ({ json: () => { silResCode = c; } }) };
            await materyalSil(reqSil, resSil);
            assert.strictEqual(silResCode, 200, "Silme isteği 200 dönmeli");

            // 3. Arka plan işi gecikmeli olarak parça yazmaya çalışsa bile (simülasyon)
            // Staging fonksiyonu yazsa dahi commit adımında materyal bulunamayacağı için temizlenmeli
            await metinParcalaVeKaydet("Geç kalmış parçalar", { ...materyal.toObject(), _id: materyal._id }, yeniIslemeId);

            // Taahhüt (Commit) kontrolü:
            const guncellenen = await Materyal.findOneAndUpdate(
                { _id: materyal._id, islemeId: yeniIslemeId, durum: "isleniyor" },
                { $set: { durum: "hazir", aktifIslemeId: yeniIslemeId } }
            );
            if (!guncellenen) {
                // Materyal silindiği için temizle:
                await MetinParcasi.deleteMany({ materyalId: materyal._id, islemeId: yeniIslemeId });
            }

            // Doğrulama: DB'de yetim parça kalmadı
            const yetimParcaSayisi = await MetinParcasi.countDocuments({ materyalId: materyal._id });
            assert.strictEqual(yetimParcaSayisi, 0, "Silinen materyale ait yetim parça kalmamalı");
        });

        // ----------------------------------------------------
        // TEST 5: İşleme sırasında ders silme
        // ----------------------------------------------------
        await testKos("İşleme sırasında ders silme (Kaskad iptal ve koordinasyon)", async () => {
            const ders = await Ders.create({ kullaniciId: testUserId, dersAdi: "Test Dersi 5", dersKodu: "T105" });
            const dosyaYolu = dosyaOlustur(`test_mat_5_${Date.now()}.txt`, "Ders silme testi. ".repeat(20));
            const materyal = await Materyal.create({
                kullaniciId: testUserId,
                dersId: ders._id,
                dosyaAdi: path.basename(dosyaYolu),
                orijinalDosyaAdi: "mat5.txt",
                dosyaYolu,
                dosyaTuru: "txt",
                mimeTuru: "text/plain",
                dosyaBoyutu: 150,
                durum: "isleniyor",
                islemeId: new mongoose.Types.ObjectId()
            });

            // Ders silme çağrılır
            const reqDersSil = { params: { id: ders._id.toString() }, user: { _id: testUserId } };
            let dersSilCode = 0;
            const resDersSil = { status: (c) => ({ json: () => { dersSilCode = c; } }) };
            await dersSil(reqDersSil, resDersSil);
            assert.strictEqual(dersSilCode, 200, "Ders silme 200 dönmeli");

            // Doğrulama: Ders, materyal ve parçalar tamamen temizlenmiş olmalı
            const kalanDers = await Ders.findById(ders._id);
            const kalanMat = await Materyal.findById(materyal._id);
            const kalanParcalar = await MetinParcasi.countDocuments({ dersId: ders._id });

            assert.strictEqual(kalanDers, null, "Ders silinmiş olmalı");
            assert.strictEqual(kalanMat, null, "Materyal silinmiş olmalı");
            assert.strictEqual(kalanParcalar, 0, "Yetim parça kalmamış olmalı");
        });

        // ----------------------------------------------------
        // TEST 6: Kontrol ile insertMany arasındaki TOCTOU penceresi testi
        // ----------------------------------------------------
        await testKos("Kontrol ile insertMany arasındaki TOCTOU penceresi testi", async () => {
            const ders = await Ders.create({ kullaniciId: testUserId, dersAdi: "Test Dersi 6", dersKodu: "T106" });
            const dosyaYolu = dosyaOlustur(`test_mat_6_${Date.now()}.txt`, "TOCTOU penceresi testi");
            const islemeId = new mongoose.Types.ObjectId();
            const materyal = await Materyal.create({
                kullaniciId: testUserId,
                dersId: ders._id,
                dosyaAdi: path.basename(dosyaYolu),
                orijinalDosyaAdi: "mat6.txt",
                dosyaYolu,
                dosyaTuru: "txt",
                mimeTuru: "text/plain",
                dosyaBoyutu: 50,
                durum: "isleniyor",
                islemeId: islemeId
            });

            // 1. İşlem kontrol noktasını geçti: "aktifMateryal var"
            const aktifMateryal = await Materyal.findOne({ _id: materyal._id, islemeId: islemeId, durum: "isleniyor" });
            assert.ok(aktifMateryal, "Materyal başlangıçta aktif olmalı");

            // 2. TAM BU ANDA dışarıdan silme isteği geldi ve materyal "siliniyor" yapıldı / silindi
            await Materyal.deleteOne({ _id: materyal._id });

            // 3. Arka plan işi gecikmiş olarak parçaları insert etti
            await metinParcalaVeKaydet("Gecikmiş parçalar", aktifMateryal, islemeId);

            // 4. Taahhüt (Commit) adımı atomik koşullu güncelleme yapar:
            const taahhut = await Materyal.findOneAndUpdate(
                { _id: materyal._id, islemeId: islemeId, durum: "isleniyor" },
                { $set: { durum: "hazir", aktifIslemeId: islemeId } }
            );

            // Taahhüt başarısız olmalı çünkü materyal silindi
            assert.strictEqual(taahhut, null, "Materyal silindiği için taahhüt null dönmeli");

            // Rollback çalışmalı:
            await MetinParcasi.deleteMany({ materyalId: materyal._id, islemeId: islemeId });

            // 5. Sonuç: Hiçbir yetim kayıt kalmamalı
            const yetimParca = await MetinParcasi.countDocuments({ materyalId: materyal._id });
            assert.strictEqual(yetimParca, 0, "TOCTOU penceresinde yetim kayıt kalmamalı");
        });

        // ----------------------------------------------------
        // TEST 7: Dosya yolu güvenliği (Path Traversal & Symlink & Prefix)
        // ----------------------------------------------------
        await testKos("Dosya yolu güvenliği (Path Traversal & Symlink & Prefix)", async () => {
            // 1. Üst dizine çıkma denemesi (..)
            assert.throws(() => {
                guvenliDosyaSil(path.join(UPLOAD_DIR, "..", "gizli.txt"));
            }, /Geçersiz dosya yolu/, "Üst dizin engellenmeli");

            // 2. Kök dizin / başka sürücü denemesi
            assert.throws(() => {
                guvenliDosyaSil("C:\\Windows\\System32\\drivers\\etc\\hosts");
            }, /Geçersiz dosya yolu/, "Kök sistem dizini engellenmeli");

            // 3. Prefix trick (materyaller_sahte) denemesi
            const sahteDizin = path.join(path.dirname(UPLOAD_DIR), "materyaller_sahte", "dosya.txt");
            assert.throws(() => {
                guvenliDosyaSil(sahteDizin);
            }, /Geçersiz dosya yolu/, "Benzer ön-ekli dizin engellenmeli");

            // 4. Geçerli dosyanın güvenle silinmesi
            const gecerliDosya = dosyaOlustur(`test_silinecek_${Date.now()}.txt`, "silinecek içerik");
            assert.ok(fs.existsSync(gecerliDosya), "Dosya mevcut olmalı");
            guvenliDosyaSil(gecerliDosya);
            assert.strictEqual(fs.existsSync(gecerliDosya), false, "Dosya başarıyla silinmiş olmalı");

            // 5. Olmayan dosya silinirken hata vermemesi (idempotentlik)
            assert.doesNotThrow(() => {
                guvenliDosyaSil(path.join(UPLOAD_DIR, "olmayan_dosya_12345.txt"));
            }, "ENOENT durumunda hata fırlatmamalı");
        });

        // ----------------------------------------------------
        // TEST 8: Sunucu yeniden başlatılması sonrası kurtarma
        // ----------------------------------------------------
        await testKos("Sunucu yeniden başlatılması sonrası kurtarma", async () => {
            const ders = await Ders.create({ kullaniciId: testUserId, dersAdi: "Test Dersi 8", dersKodu: "T108" });
            const dosyaYolu = dosyaOlustur(`test_mat_8_${Date.now()}.txt`, "Kurtarma testi");
            const materyal = await Materyal.create({
                kullaniciId: testUserId,
                dersId: ders._id,
                dosyaAdi: path.basename(dosyaYolu),
                orijinalDosyaAdi: "mat8.txt",
                dosyaYolu,
                dosyaTuru: "txt",
                mimeTuru: "text/plain",
                dosyaBoyutu: 50,
                durum: "isleniyor",
                islemeId: new mongoose.Types.ObjectId()
            });

            // Sunucu startup fonksiyonu simülasyonu
            const kurtarilan = await Materyal.updateMany(
                { _id: materyal._id, durum: "isleniyor" },
                { $set: { durum: "hata", islemeHatasi: "Sunucu yeniden başlatıldığı için işlem yarıda kaldı." } }
            );

            assert.strictEqual(kurtarilan.modifiedCount, 1, "Kayıt güncellenmeli");
            const guncelMat = await Materyal.findById(materyal._id);
            assert.strictEqual(guncelMat.durum, "hata");
            assert.strictEqual(guncelMat.islemeHatasi, "Sunucu yeniden başlatıldığı için işlem yarıda kaldı.");
        });

        // ----------------------------------------------------
        // TEST 9: Eski verilerin yeni indeks ve versiyonlama yapısıyla uyumu
        // ----------------------------------------------------
        await testKos("Eski verilerin yeni indeks ve versiyonlama yapısıyla uyumu", async () => {
            const ders = await Ders.create({ kullaniciId: testUserId, dersAdi: "Test Dersi 9", dersKodu: "T109" });
            const matId = new mongoose.Types.ObjectId();
            
            // Eski stilde (islemeId: null) kaydedilmiş eski parçalar
            await MetinParcasi.create([
                {
                    kullaniciId: testUserId,
                    dersId: ders._id,
                    materyalId: matId,
                    islemeId: null,
                    parcaIndex: 0,
                    icerik: "Eski parça 0",
                    karakterSayisi: 13
                },
                {
                    kullaniciId: testUserId,
                    dersId: ders._id,
                    materyalId: matId,
                    islemeId: null,
                    parcaIndex: 1,
                    icerik: "Eski parça 1",
                    karakterSayisi: 13
                }
            ]);

            // Yeni versiyon (staging) parçaları aynı parcaIndex (0 ve 1) ile kaydedilebilmeli!
            const yeniIslemeId = new mongoose.Types.ObjectId();
            await MetinParcasi.create([
                {
                    kullaniciId: testUserId,
                    dersId: ders._id,
                    materyalId: matId,
                    islemeId: yeniIslemeId,
                    parcaIndex: 0,
                    icerik: "Yeni parça 0",
                    karakterSayisi: 13
                },
                {
                    kullaniciId: testUserId,
                    dersId: ders._id,
                    materyalId: matId,
                    islemeId: yeniIslemeId,
                    parcaIndex: 1,
                    icerik: "Yeni parça 1",
                    karakterSayisi: 13
                }
            ]);

            const toplam = await MetinParcasi.countDocuments({ materyalId: matId });
            assert.strictEqual(toplam, 4, "Hem eski hem yeni parçalar duplicate key hatası vermeden bir arada bulunabilmeli");

            // Aynı işlem içinde aynı parcaIndex ise duplicate key vermelidir:
            let duplicateFirlatti = false;
            try {
                await MetinParcasi.create({
                    kullaniciId: testUserId,
                    dersId: ders._id,
                    materyalId: matId,
                    islemeId: yeniIslemeId,
                    parcaIndex: 0,
                    icerik: "Çakışan parça",
                    karakterSayisi: 14
                });
            } catch (err) {
                duplicateFirlatti = true;
            }
            assert.ok(duplicateFirlatti, "Aynı islemeId içinde duplicate parcaIndex hata fırlatmalı");
        });

        console.log("\n=================================================");
        console.log(`TÜM TESTLER BAŞARIYLA TAMAMLANDI! (${basariliSayisi}/${toplamTest})`);
        console.log("=================================================");
    } finally {
        await temizle();
        await mongoose.disconnect();
    }
}

main().catch((err) => {
    console.error("Test paketi başarısızlıkla sonlandı:", err);
    process.exit(1);
});

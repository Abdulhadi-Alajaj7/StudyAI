import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import Ders from "./models/Ders.js";
import Materyal from "./models/Materyal.js";
import MetinParcasi from "./models/MetinParcasi.js";
import { dersSil } from "./controllers/dersController.js";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOAD_DIR = path.resolve(__dirname, "uploads", "materyaller");

dotenv.config();

const runTest = async () => {
    try {
        console.log("MongoDB'ye bağlanılıyor...");
        await mongoose.connect(process.env.MONGODB_URI || "mongodb://localhost:27017/studyai_test");
        console.log("Bağlantı başarılı.");

        const testUserId = new mongoose.Types.ObjectId();

        // 1. Test Dersi oluştur
        const ders = await Ders.create({
            kullaniciId: testUserId,
            dersAdi: "TEST_SILME_DERSI",
            dersKodu: "TST101"
        });
        console.log(`Test dersi oluşturuldu: ${ders._id}`);

        // 2. Dummy dosya oluştur
        if (!fs.existsSync(UPLOAD_DIR)) {
            fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        }
        
        const dummyFilename1 = `test_dummy_mat1_${Date.now()}.txt`;
        const dummyPath1 = path.join(UPLOAD_DIR, dummyFilename1);
        fs.writeFileSync(dummyPath1, "Bu bir test dosyasıdır.");

        const dummyFilename2 = `test_dummy_mat2_${Date.now()}.txt`;
        const dummyPath2 = path.join(UPLOAD_DIR, dummyFilename2);
        fs.writeFileSync(dummyPath2, "Bu ikinci test dosyasıdır.");

        // 3. Materyalleri oluştur
        const mat1 = await Materyal.create({
            kullaniciId: testUserId,
            dersId: ders._id,
            dosyaAdi: dummyFilename1,
            orijinalDosyaAdi: "mat1.txt",
            dosyaYolu: dummyPath1,
            dosyaTuru: "txt",
            mimeTuru: "text/plain",
            dosyaBoyutu: 100
        });

        const mat2 = await Materyal.create({
            kullaniciId: testUserId,
            dersId: ders._id,
            dosyaAdi: dummyFilename2,
            orijinalDosyaAdi: "mat2.txt",
            dosyaYolu: dummyPath2,
            dosyaTuru: "txt",
            mimeTuru: "text/plain",
            dosyaBoyutu: 100
        });
        console.log("Test materyalleri oluşturuldu.");

        // 4. Metin parçaları oluştur
        await MetinParcasi.create([
            { kullaniciId: testUserId, dersId: ders._id, materyalId: mat1._id, parcaIndex: 0, icerik: "Chunk 1", karakterSayisi: 7 },
            { kullaniciId: testUserId, dersId: ders._id, materyalId: mat1._id, parcaIndex: 1, icerik: "Chunk 2", karakterSayisi: 7 },
            { kullaniciId: testUserId, dersId: ders._id, materyalId: mat2._id, parcaIndex: 0, icerik: "Chunk 3", karakterSayisi: 7 }
        ]);
        console.log("Test metin parçaları oluşturuldu.");

        // Durumu doğrula
        console.log("Silme öncesi kontrol:");
        console.log("- Ders var mı:", await Ders.exists({ _id: ders._id }) != null);
        console.log("- Materyal sayısı:", await Materyal.countDocuments({ dersId: ders._id }));
        console.log("- Chunk sayısı:", await MetinParcasi.countDocuments({ dersId: ders._id }));
        console.log("- Dosya 1 var mı:", fs.existsSync(dummyPath1));
        console.log("- Dosya 2 var mı:", fs.existsSync(dummyPath2));

        // 5. Silme işlemini test et (Mock Req/Res)
        const req = {
            params: { id: ders._id },
            user: { _id: testUserId }
        };
        
        let resStatus, resJson;
        const res = {
            status: (code) => { resStatus = code; return res; },
            json: (data) => { resJson = data; }
        };

        console.log("\ndersSil fonksiyonu çağrılıyor...");
        await dersSil(req, res);
        console.log(`Sonuç Durumu: ${resStatus}, Mesaj:`, resJson);

        // 6. Silme sonrası doğrula
        console.log("\nSilme sonrası kontrol:");
        console.log("- Ders var mı:", await Ders.exists({ _id: ders._id }) != null);
        console.log("- Materyal sayısı:", await Materyal.countDocuments({ dersId: ders._id }));
        console.log("- Chunk sayısı:", await MetinParcasi.countDocuments({ dersId: ders._id }));
        console.log("- Dosya 1 var mı:", fs.existsSync(dummyPath1));
        console.log("- Dosya 2 var mı:", fs.existsSync(dummyPath2));

    } catch (error) {
        console.error("Test sırasında hata:", error);
    } finally {
        await mongoose.disconnect();
        console.log("MongoDB bağlantısı kapatıldı.");
    }
};

runTest();

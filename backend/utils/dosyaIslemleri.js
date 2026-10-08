import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// `utils` klasörü `backend` içinde, uploads ise backend'in hemen altında.
const UPLOAD_DIR = path.resolve(__dirname, "..", "uploads", "materyaller");

/**
 * Dosyanın belirtilen upload dizininde olduğundan emin olarak, dosyayı güvenli şekilde siler.
 * @param {string} dosyaYolu - Silinecek dosyanın yolu
 * @throws Hata durumunda (ENOENT hariç) fırlatır.
 */
export const guvenliDosyaSil = (dosyaYolu) => {
    if (!dosyaYolu) return;

    try {
        const absolutePath = path.resolve(dosyaYolu);

        // Path Traversal saldırılarını önlemek için dosyanın upload dizini altında olduğunu kontrol et
        if (!absolutePath.startsWith(UPLOAD_DIR)) {
            console.error(`Güvenlik ihlali şüphesi: ${absolutePath} silinmek istendi.`);
            throw new Error("Geçersiz dosya yolu.");
        }

        if (fs.existsSync(absolutePath)) {
            fs.unlinkSync(absolutePath);
        }
    } catch (error) {
        // ENOENT (dosya zaten yok) ise yoksay, diğer hataları fırlat
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
};

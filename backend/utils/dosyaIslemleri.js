import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// `utils` klasörü `backend` içinde, uploads ise backend'in hemen altında.
const UPLOAD_DIR = path.resolve(__dirname, "..", "uploads", "materyaller");

/**
 * Dosyanın belirtilen upload dizininde olduğundan emin olarak, dosyayı güvenli şekilde siler.
 * Path traversal, symlink ve benzer ön-ekli sahte klasör açıklarına karşı korumalıdır.
 * @param {string} dosyaYolu - Silinecek dosyanın yolu
 * @throws Hata durumunda (ENOENT hariç) fırlatır.
 */
export const guvenliDosyaSil = (dosyaYolu) => {
    if (!dosyaYolu) return;

    try {
        const hedefYol = path.normalize(path.resolve(dosyaYolu));
        const anaDizin = path.normalize(path.resolve(UPLOAD_DIR));
        
        // Göreli yol hesaplayarak ana dizin sınırları içinde kalındığını garanti et
        const goreceliYol = path.relative(anaDizin, hedefYol);

        const dizinIcinde = goreceliYol && 
            !goreceliYol.startsWith("..") && 
            !path.isAbsolute(goreceliYol);

        if (!dizinIcinde) {
            console.error(`Güvenlik ihlali şüphesi: ${hedefYol} silinmek istendi.`);
            throw new Error("Geçersiz dosya yolu: Güvenlik ihlali şüphesi.");
        }

        if (fs.existsSync(hedefYol)) {
            // Sembolik link kontrolü - ana dizin dışını hedefleyen linkleri engelle
            const lstat = fs.lstatSync(hedefYol);
            if (lstat.isSymbolicLink()) {
                console.error(`Güvenlik ihlali: Sembolik link tespit edildi (${hedefYol}).`);
                throw new Error("Sembolik link silinemez: Güvenlik ihlali.");
            }

            fs.unlinkSync(hedefYol);
        }
    } catch (error) {
        // ENOENT (dosya zaten yok) ise idempotent kabul et ve yoksay, diğer hataları fırlat
        if (error.code !== "ENOENT") {
            throw error;
        }
    }
};

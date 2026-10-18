import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadDir = path.join(__dirname, "..", "uploads", "materyaller");
export const MAKSIMUM_DOSYA_BOYUTU = 50 * 1024 * 1024;
export const MAKSIMUM_DOSYA_SAYISI = 10;

if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
        const ext = path.extname(file.originalname);
        cb(null, "materyal-" + uniqueSuffix + ext);
    },
});

const fileFilter = (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const mimetype = file.mimetype;

    if (ext === ".pdf" && mimetype === "application/pdf") {
        return cb(null, true);
    }
    if (ext === ".docx" && mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        return cb(null, true);
    }
    if (ext === ".pptx" && mimetype === "application/vnd.openxmlformats-officedocument.presentationml.presentation") {
        return cb(null, true);
    }
    if (ext === ".txt" && mimetype === "text/plain") {
        return cb(null, true);
    }

    const hata = new Error("Sadece PDF, DOCX, PPTX ve TXT dosyaları desteklenir.");
    hata.code = "DESTEKLENMEYEN_DOSYA_TURU";
    cb(hata, false);
};

const upload = multer({
    storage,
    fileFilter,
    limits: { fileSize: MAKSIMUM_DOSYA_BOYUTU },
});

export default upload;

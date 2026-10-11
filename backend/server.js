import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";

import veritabaninaBaglan from "./config/db.js";
import Materyal from "./models/Materyal.js";
import authRoutes from "./routes/authRoutes.js";
import dersRoutes from "./routes/dersRoutes.js";
import materyalRoutes from "./routes/materyalRoutes.js";
const app = express();

// MongoDB bağlantısı ve sunucu yeniden başlatma kurtarması (Zombie Lock Recovery)
veritabaninaBaglan().then(async () => {
    try {
        const kurtarilan = await Materyal.updateMany(
            { durum: "isleniyor" },
            { 
                $set: { 
                    durum: "hata", 
                    islemeHatasi: "Sunucu yeniden başlatıldığı için işlem yarıda kaldı." 
                } 
            }
        );
        if (kurtarilan.modifiedCount > 0) {
            console.log(`Sunucu başlangıcı: ${kurtarilan.modifiedCount} adet yarıda kalmış materyal işlemi 'hata' olarak güncellendi.`);
        }

        // Konu Haritası yarıda kalmış kilit kurtarması
        const { default: KonuHaritasi } = await import("./models/KonuHaritasi.js");
        const kurtarilanHaritalar = await KonuHaritasi.updateMany(
            { durum: "olusturuluyor" },
            {
                $set: {
                    durum: "hata",
                    olusturmaHatasi: "Sunucu yeniden başlatıldığı için konu haritası üretimi yarıda kaldı.",
                    aktifIslemToken: null
                }
            }
        );
        if (kurtarilanHaritalar.modifiedCount > 0) {
            console.log(`Sunucu başlangıcı: ${kurtarilanHaritalar.modifiedCount} adet 'olusturuluyor' durumundaki konu haritası 'hata' olarak güncellendi.`);
        }
    } catch (hata) {
        console.error("Başlangıç kurtarma hatası:", hata.message);
    }
});

// Middleware
app.use(compression());

app.use(
    cors({
        origin: "http://localhost:5173",
        credentials: true,
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use("/auth", authRoutes);
app.use("/dersler", dersRoutes);
app.use("/materyaller", materyalRoutes);

// Ana route
app.get("/", (req, res) => {
    res.json({
        mesaj: "StudyAI API çalışıyor",
    });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`StudyAI sunucusu ${PORT} portunda çalışıyor`);
});
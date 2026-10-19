
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";

import veritabaninaBaglan from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import dersRoutes from "./routes/dersRoutes.js";
import materyalRoutes from "./routes/materyalRoutes.js";
import sohbetRoutes from "./routes/sohbetRoutes.js";

import { geciciDersleriTemizle } from "./services/geciciDersTemizlemeService.js";
import { baslangicIslemleriniKurtar } from "./services/baslangicKurtarmaService.js";
import { kullanilmayanMetinParcalariniTemizle } from "./services/metinParcasiTemizlemeService.js";

const app = express();

// Middleware
app.use(compression());

app.use(
    cors({
        origin: process.env.FRONTEND_URL || "http://localhost:5173",
        credentials: true,
    })
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

// Routes
app.use("/auth", authRoutes);
app.use("/dersler", dersRoutes);
app.use("/dersler", sohbetRoutes);
app.use("/materyaller", materyalRoutes);

// Ana route
app.get("/", (req, res) => {
    res.json({
        mesaj: "StudyAI API çalışıyor",
    });
});

const PORT = process.env.PORT || 5000;

const sunucuyuBaslat = async () => {
    await veritabaninaBaglan();

    try {
        await baslangicIslemleriniKurtar();
        await kullanilmayanMetinParcalariniTemizle();
    } catch (hata) {
        console.error("Başlangıç kurtarma veya metin parçası temizleme hatası:", hata.message);
        process.exitCode = 1;
        return;
    }

    await geciciDersleriTemizle();

    setInterval(() => {
        void geciciDersleriTemizle();
    }, 10 * 60 * 1000);

    app.listen(PORT, () => {
        console.log(`StudyAI sunucusu ${PORT} portunda çalışıyor`);
    });
};

void sunucuyuBaslat();

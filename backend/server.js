import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import compression from "compression";

import veritabaninaBaglan from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import dersRoutes from "./routes/dersRoutes.js";
const app = express();

// MongoDB bağlantısı
veritabaninaBaglan();

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
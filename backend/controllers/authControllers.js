import jwt from "jsonwebtoken";
import Kullanici from "../models/Kullanici.js";

const tokenOlustur = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: "7d",
  });
};

const tokenCevabiGonder = (res, token) => {
  res.cookie("token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
};

/* =========================
   Kayıt Ol
========================= */
export const kayitOl = async (req, res) => {
  try {
    const { kullaniciAdi, email, sifre } = req.body;

    if (!kullaniciAdi || !email || !sifre) {
      return res.status(400).json({
        hata: "Tüm zorunlu alanları doldurunuz",
      });
    }

    const mevcutKullanici = await Kullanici.findOne({ email });

    if (mevcutKullanici) {
      return res.status(400).json({
        hata: "Bu e-posta adresi ile kayıtlı bir kullanıcı zaten var",
      });
    }

    const kullanici = await Kullanici.create({
      kullaniciAdi,
      email,
      sifre,
    });

    const token = tokenOlustur(kullanici._id);

    tokenCevabiGonder(res, token);

    res.status(201).json({
      basarili: true,
      token,
      kullanici: {
        id: kullanici._id,
        kullaniciAdi: kullanici.kullaniciAdi,
        email: kullanici.email,
      },
    });
  } catch (hata) {
    res.status(500).json({
      hata: hata.message,
    });
  }
};

/* =========================
   Giriş Yap
========================= */
export const girisYap = async (req, res) => {
  try {
    const { email, sifre } = req.body;

    if (!email || !sifre) {
      return res.status(400).json({
        hata: "E-posta ve şifre zorunludur",
      });
    }

    const kullanici = await Kullanici.findOne({ email }).select("+sifre");

    if (!kullanici) {
      return res.status(401).json({
        hata: "E-posta veya şifre hatalı",
      });
    }

    const sifreDogruMu = await kullanici.sifreEslesiyorMu(sifre);

    if (!sifreDogruMu) {
      return res.status(401).json({
        hata: "E-posta veya şifre hatalı",
      });
    }

    const token = tokenOlustur(kullanici._id);

    tokenCevabiGonder(res, token);

    res.status(200).json({
      basarili: true,
      kullanici: {
        id: kullanici._id,
        kullaniciAdi: kullanici.kullaniciAdi,
        email: kullanici.email,
      },
      token,
    });
  } catch (hata) {
    res.status(500).json({
      hata: hata.message,
    });
  }
};

/* =========================
   Profil Getir
========================= */
export const profilGetir = async (req, res) => {
  res.json({
    basarili: true,
    kullanici: req.user,
  });
};

/* =========================
   Profil Güncelle
========================= */
export const profilGuncelle = async (req, res) => {
  try {
    const { kullaniciAdi, email, sifre } = req.body;

    const kullanici = await Kullanici.findById(req.user.id);

    if (!kullanici) {
      return res.status(404).json({
        hata: "Kullanıcı bulunamadı",
      });
    }

    kullanici.kullaniciAdi = kullaniciAdi || kullanici.kullaniciAdi;
    kullanici.email = email || kullanici.email;

    if (sifre) {
      return res.status(400).json({
        hata: "Şifre buradan değiştirilemez. Şifre değiştirme işlemini kullanınız.",
      });
    }

    const guncellenenKullanici = await kullanici.save();

    res.json({
      basarili: true,
      kullanici: {
        id: guncellenenKullanici._id,
        kullaniciAdi: guncellenenKullanici.kullaniciAdi,
        email: guncellenenKullanici.email,
      },
    });
  } catch (hata) {
    res.status(500).json({
      hata: hata.message,
    });
  }
};

/* =========================
   Şifre Değiştir
========================= */
export const sifreDegistir = async (req, res, next) => {
  try {
    const { mevcutSifre, yeniSifre } = req.body;

    const kullanici = await Kullanici.findById(req.user.id).select("+sifre");

    if (
      !kullanici ||
      !(await kullanici.sifreEslesiyorMu(mevcutSifre))
    ) {
      const hata = new Error("Mevcut şifre hatalı");
      hata.statusCode = 401;
      throw hata;
    }

    kullanici.sifre = yeniSifre;

    await kullanici.save();

    res.json({
      basarili: true,
      mesaj: "Şifre başarıyla güncellendi",
    });
  } catch (hata) {
    next(hata);
  }
};

/* =========================
   Çıkış Yap
========================= */
export const cikisYap = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: process.env.NODE_ENV === "production" ? "none" : "lax",
  });

  res.status(200).json({
    basarili: true,
    mesaj: "Çıkış başarıyla yapıldı",
  });
};
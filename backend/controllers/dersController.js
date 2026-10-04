import Ders from "../models/Ders.js";

/* =========================
   Ders Oluştur
========================= */
export const dersOlustur = async (req, res) => {
  try {
    const { dersAdi, aciklama, donem } = req.body;

    if (!dersAdi) {
      return res.status(400).json({
        hata: "Ders adı zorunludur",
      });
    }

    const ders = await Ders.create({
      kullaniciId: req.user._id,
      dersAdi,
      aciklama,
      donem,
    });

    res.status(201).json({
      basarili: true,
      mesaj: "Ders başarıyla oluşturuldu",
      ders,
    });
  } catch (hata) {
    res.status(500).json({
      hata: hata.message,
    });
  }
};

/* =========================
   Dersleri Getir
========================= */
export const dersleriGetir = async (req, res) => {
  try {
    const dersler = await Ders.find({
      kullaniciId: req.user._id,
    }).sort({ createdAt: -1 });

    res.status(200).json({
      basarili: true,
      dersSayisi: dersler.length,
      dersler,
    });
  } catch (hata) {
    res.status(500).json({
      hata: hata.message,
    });
  }
};

/* =========================
   Tek Ders Getir
========================= */
export const dersGetir = async (req, res) => {
  try {
    const ders = await Ders.findOne({
      _id: req.params.id,
      kullaniciId: req.user._id,
    });

    if (!ders) {
      return res.status(404).json({
        hata: "Ders bulunamadı",
      });
    }

    res.status(200).json({
      basarili: true,
      ders,
    });
  } catch (hata) {
    res.status(500).json({
      hata: hata.message,
    });
  }
};

/* =========================
   Ders Güncelle
========================= */
export const dersGuncelle = async (req, res) => {
  try {
    const { dersAdi, aciklama, donem } = req.body;

    const ders = await Ders.findOne({
      _id: req.params.id,
      kullaniciId: req.user._id,
    });

    if (!ders) {
      return res.status(404).json({
        hata: "Ders bulunamadı",
      });
    }

    if (dersAdi !== undefined) {
      ders.dersAdi = dersAdi;
    }

    if (aciklama !== undefined) {
      ders.aciklama = aciklama;
    }

    if (donem !== undefined) {
      ders.donem = donem;
    }

    await ders.save();

    res.status(200).json({
      basarili: true,
      mesaj: "Ders başarıyla güncellendi",
      ders,
    });
  } catch (hata) {
    res.status(500).json({
      hata: hata.message,
    });
  }
};

/* =========================
   Ders Sil
========================= */
export const dersSil = async (req, res) => {
  try {
    const ders = await Ders.findOne({
      _id: req.params.id,
      kullaniciId: req.user._id,
    });

    if (!ders) {
      return res.status(404).json({
        hata: "Ders bulunamadı",
      });
    }

    await ders.deleteOne();

    res.status(200).json({
      basarili: true,
      mesaj: "Ders başarıyla silindi",
    });
  } catch (hata) {
    res.status(500).json({
      hata: hata.message,
    });
  }
};
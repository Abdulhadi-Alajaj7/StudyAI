
import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import { guvenliDosyaSil } from "../utils/dosyaIslemleri.js";

/* =========================
   Ders Oluştur
========================= */
export const dersOlustur = async (req, res) => {
  try {
    const { dersAdi, aciklama, donem, dersKodu, renk, simge } = req.body;

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
      dersKodu,
      renk,
      simge,
    });

    return res.status(201).json({
      basarili: true,
      mesaj: "Ders başarıyla oluşturuldu",
      ders,
    });
  } catch (hata) {
    return res.status(500).json({
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
      materyallerOnaylandi: true,
      temizleniyor: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .lean();

    const dersIds = dersler.map((ders) => ders._id);

    const materyalCounts = dersIds.length
      ? await Materyal.aggregate([
          {
            $match: {
              kullaniciId: req.user._id,
              dersId: { $in: dersIds },
            },
          },
          {
            $group: {
              _id: "$dersId",
              count: { $sum: 1 },
            },
          },
        ])
      : [];

    const materyalSayilari = new Map(
      materyalCounts.map((m) => [String(m._id), m.count])
    );

    const derslerWithCount = dersler.map((ders) => ({
      ...ders,
      materyalSayisi: materyalSayilari.get(String(ders._id)) || 0,
    }));

    return res.status(200).json({
      basarili: true,
      dersSayisi: derslerWithCount.length,
      dersler: derslerWithCount,
    });
  } catch (hata) {
    console.error("Dersleri getirme hatası:", hata);
    return res.status(500).json({
      hata: "Dersler getirilirken bir sunucu hatası oluştu.",
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
      temizleniyor: { $ne: true },
    });

    if (!ders) {
      return res.status(404).json({
        hata: "Ders bulunamadı",
      });
    }

    return res.status(200).json({
      basarili: true,
      ders,
    });
  } catch (hata) {
    return res.status(500).json({
      hata: hata.message,
    });
  }
};

/* =========================
   Ders Güncelle
========================= */
export const dersGuncelle = async (req, res) => {
  try {
    const { dersAdi, aciklama, donem, dersKodu, renk, simge } = req.body;

    const degisiklikler = {};

    if (dersAdi !== undefined) degisiklikler.dersAdi = dersAdi;
    if (aciklama !== undefined) degisiklikler.aciklama = aciklama;
    if (donem !== undefined) degisiklikler.donem = donem;
    if (dersKodu !== undefined) degisiklikler.dersKodu = dersKodu;
    if (renk !== undefined) degisiklikler.renk = renk;
    if (simge !== undefined) degisiklikler.simge = simge;

    const ders = await Ders.findOneAndUpdate(
      {
        _id: req.params.id,
        kullaniciId: req.user._id,
        temizleniyor: { $ne: true },
      },
      { $set: degisiklikler },
      {
        new: true,
        runValidators: true,
      }
    );

    if (!ders) {
      return res.status(404).json({
        hata: "Ders bulunamadı veya temizleniyor.",
      });
    }

    return res.status(200).json({
      basarili: true,
      mesaj: "Ders başarıyla güncellendi",
      ders,
    });
  } catch (hata) {
    return res.status(500).json({
      hata: hata.message,
    });
  }
};

/* =========================
   Materyalleri Onayla
========================= */
export const materyalleriOnayla = async (req, res) => {
  const dersId = req.params.id;
  const kullaniciId = req.user._id;

  if (!mongoose.Types.ObjectId.isValid(dersId)) {
    return res.status(400).json({
      hata: "Geçersiz ders kimliği.",
    });
  }

  const session = await mongoose.startSession();

  try {
    let onaylananDers;
    let zatenOnaylandi = false;

    await session.withTransaction(async () => {
      const ders = await Ders.findOne({
        _id: dersId,
        kullaniciId,
      }).session(session);

      if (!ders) {
        const hata = new Error("Ders bulunamadı veya yetkiniz yok.");
        hata.status = 404;
        throw hata;
      }

      if (ders.temizleniyor === true) {
        const hata = new Error("Bu ders temizleniyor. Onaylanamaz.");
        hata.status = 409;
        throw hata;
      }

      if (ders.materyallerOnaylandi === true) {
        zatenOnaylandi = true;
        onaylananDers = ders;
        return;
      }

      if ((ders.aktifMateryalIslemSayisi ?? 0) !== 0) {
        const hata = new Error(
          "Materyal işlemleri devam ediyor. Lütfen tamamlanmasını bekleyin."
        );
        hata.status = 409;
        throw hata;
      }

      const toplamMateryalSayisi = await Materyal.countDocuments({
        dersId,
        kullaniciId,
      }).session(session);

      if (toplamMateryalSayisi === 0) {
        const hata = new Error(
          "Onaylamak için en az bir materyal yüklemelisiniz."
        );
        hata.status = 409;
        throw hata;
      }

      const hazirMateryalSayisi = await Materyal.countDocuments({
        dersId,
        kullaniciId,
        durum: "hazir",
        aktifIslemeId: { $ne: null },
      }).session(session);

      if (hazirMateryalSayisi !== toplamMateryalSayisi) {
        const hata = new Error(
          "Tüm materyaller hazır olmadan onay verilemez."
        );
        hata.status = 409;
        throw hata;
      }

      const konuHaritasi = await KonuHaritasi.findOne({
        dersId,
        kullaniciId,
      }).session(session);

      if (!konuHaritasi || konuHaritasi.durum !== "hazir") {
        const hata = new Error("Konu haritası henüz hazır değil.");
        hata.status = 409;
        throw hata;
      }

      const hazirMateryaller = await Materyal.find({
        dersId,
        kullaniciId,
        durum: "hazir",
        aktifIslemeId: { $ne: null },
      })
        .select("_id aktifIslemeId")
        .session(session)
        .lean();

      const kaynaklar = konuHaritasi.kaynakMateryaller || [];

      const kaynaklarGuncel =
        kaynaklar.length === hazirMateryaller.length &&
        hazirMateryaller.every((materyal) =>
          kaynaklar.some(
            (kaynak) =>
              String(kaynak.materyalId) === String(materyal._id) &&
              String(kaynak.aktifIslemeId) ===
                String(materyal.aktifIslemeId)
          )
        );

      if (!kaynaklarGuncel) {
        const hata = new Error(
          "Konu haritası güncel değil. Lütfen analizin tamamlanmasını bekleyin."
        );
        hata.status = 409;
        throw hata;
      }

      const sonuc = await Ders.findOneAndUpdate(
        {
          _id: dersId,
          kullaniciId,
          materyallerOnaylandi: { $ne: true },
          temizleniyor: { $ne: true },
          aktifMateryalIslemSayisi: 0,
        },
        {
          $set: {
            materyallerOnaylandi: true,
          },
        },
        {
          new: true,
          session,
        }
      );

      if (!sonuc) {
        const hata = new Error(
          "Materyal durumu değişti. Lütfen tekrar deneyin."
        );
        hata.status = 409;
        throw hata;
      }

      onaylananDers = sonuc;
    });

    return res.status(200).json({
      basarili: true,
      mesaj: zatenOnaylandi
        ? "Bu dersin materyalleri zaten onaylanmış."
        : "Materyaller başarıyla onaylandı.",
      ders: onaylananDers,
    });
  } catch (hata) {
    console.error("Materyal onaylama hatası:", hata);

    return res.status(hata.status || 500).json({
      hata: hata.status
        ? hata.message
        : "Materyaller onaylanırken bir sunucu hatası oluştu.",
    });
  } finally {
    await session.endSession();
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
      temizleniyor: { $ne: true },
    });

    if (!ders) {
      return res.status(404).json({
        hata: "Ders bulunamadı veya temizleniyor.",
      });
    }

    const materyaller = await Materyal.find({
      dersId: ders._id,
    }).select("_id dosyaYolu");

    await Materyal.updateMany(
      { dersId: ders._id },
      { $set: { durum: "siliniyor" } }
    );

    await Promise.all([
      MetinParcasi.deleteMany({ dersId: ders._id }),
      KonuHaritasi.deleteMany({ dersId: ders._id }),
      Materyal.deleteMany({ dersId: ders._id }),
    ]);

    for (const mat of materyaller) {
      guvenliDosyaSil(mat.dosyaYolu);
    }

    await ders.deleteOne();

    return res.status(200).json({
      basarili: true,
      mesaj: "Ders başarıyla silindi",
    });
  } catch (hata) {
    console.error("Ders silme hatası:", hata);

    return res.status(500).json({
      hata: hata.message,
    });
  }
};

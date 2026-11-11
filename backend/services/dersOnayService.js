import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import MetinParcasi from "../models/MetinParcasi.js";

// Mevcut onay transaction'ı: harita ve ders aynı anda kalıcı kilitlenir.
export const dersOnayiniTamamla = async (dersId, kullaniciId, islemToken) => {
  const session = await mongoose.startSession();
  try {
    let onaylananDers;
    let zatenOnaylandi = false;

    await session.withTransaction(async () => {
      const ders = await Ders.findOne({
        _id: dersId,
        kullaniciId,
      }).select("+hazirlamaToken").session(session);

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

      if (ders.hazirlamaDurumu !== "isleniyor" || !islemToken ||
          String(ders.hazirlamaToken) !== String(islemToken)) {
        throw Object.assign(new Error("Hazırlama işlem sahipliği doğrulanamadı."), { status: 409 });
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

      const indeksliMateryalSayisi = await Materyal.countDocuments({
        dersId, kullaniciId, durum: "hazir", aktifIslemeId: { $ne: null }, embeddingDurumu: "hazir",
      }).session(session);
      if (indeksliMateryalSayisi !== toplamMateryalSayisi) {
        throw Object.assign(new Error("Anlamsal arama henüz hazır değil."), { status: 409 });
      }

      const konuHaritasi = await KonuHaritasi.findOne({
        dersId,
        kullaniciId,
      }).session(session);

      if (
        !konuHaritasi ||
        konuHaritasi.durum !== "hazir" ||
        konuHaritasi.aktifIslemToken != null
      ) {
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

      for (const materyal of hazirMateryaller) {
        const filtre = { dersId, kullaniciId, materyalId: materyal._id, islemeId: materyal.aktifIslemeId };
        const toplam = await MetinParcasi.countDocuments(filtre).session(session);
        const indeksli = await MetinParcasi.countDocuments({ ...filtre, embeddingDurumu: "hazir" }).session(session);
        if (!toplam || indeksli !== toplam) {
          throw Object.assign(new Error("Anlamsal arama parçaları henüz hazır değil."), { status: 409 });
        }
      }

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

      const kilitlenenHarita = await KonuHaritasi.findOneAndUpdate(
        {
          _id: konuHaritasi._id,
          dersId,
          kullaniciId,
          durum: "hazir",
          aktifIslemToken: null,
          degisikliklereKilitli: { $ne: true },
          updatedAt: konuHaritasi.updatedAt,
        },
        {
          $set: {
            degisikliklereKilitli: true,
            kilitSonYenilemeTarihi: null,
          },
        },
        { new: true, session }
      );

      if (!kilitlenenHarita) {
        const hata = new Error(
          "Konu haritası onay sırasında değişti. Lütfen tekrar deneyin."
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
          hazirlamaDurumu: "isleniyor",
          hazirlamaToken: islemToken,
          $expr: { $gt: ["$hazirlamaSonYenileme", { $subtract: ["$$NOW", 300000] }] },
        },
        {
          $set: {
            materyallerOnaylandi: true,
            hazirlamaDurumu: "tamamlandi",
            hazirlamaAsamasi: "tamamlandi",
            hazirlamaToken: null,
            hazirlamaHatasi: "",
            hazirlamaHataKodu: "",
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

    return { ders: onaylananDers, zatenOnaylandi };
  } finally {
    await session.endSession();
  }
};

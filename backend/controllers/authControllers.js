import Kullanici from "../models/Kullanici.js";

import { oturumTokeniOlustur, oturumCookieGonder, oturumCookieAyarlari, kullaniciyiSun, oturumSurumuFiltresi } from "../utils/authGuvenligi.js";
import { sifreSifirlamaServisi } from "../services/sifreSifirlamaService.js";
import { emailDegisimServisi } from "../services/emailDegisimService.js";

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

    const token = oturumTokeniOlustur(kullanici);

    oturumCookieGonder(res, token);

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
      hata: "İşlem tamamlanamadı. Lütfen daha sonra tekrar deneyin.",
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

    const kullanici = await Kullanici.findOne({ email }).select("+sifre +oturumSurumu");

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

    const token = oturumTokeniOlustur(kullanici);

    oturumCookieGonder(res, token);

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
      hata: "İşlem tamamlanamadı. Lütfen daha sonra tekrar deneyin.",
    });
  }
};

/* =========================
   Profil Getir
========================= */
export const profilGetir = async (req, res) => {
  res.json({
    basarili: true,
    kullanici: kullaniciyiSun(req.user),
  });
};

/* =========================
   Profil Güncelle
========================= */
export const profilGuncelle = async (req, res) => {
  try {
    const { kullaniciAdi, email, sifre } = req.body;
    if (sifre) {
      return res.status(409).json({ kod: "PROFIL_DOGRULAMA_GEREKLI", hata: "E-posta değişikliği doğrulama gerektirir. Mevcut adresiniz korundu; şifre için şifre değiştirme işlemini kullanın." });
    }
    if (email !== undefined && email !== req.user.email) {
      const kullanici = await emailDegisimServisi.iste({ kullanici: req.user, email, kullaniciAdi, authTime: req.authTime });
      return res.json({ basarili: true, kullanici: kullaniciyiSun(kullanici),
        mesaj: "Doğrulama bağlantısı yeni adresinize gönderilmek üzere alındı. Onaylayana kadar mevcut adresiniz korunacak." });
    }
    const kullanici = await Kullanici.findOneAndUpdate({ _id: req.user.id,
      ...oturumSurumuFiltresi(req.user.oturumSurumu ?? 0) }, { $set: { kullaniciAdi: kullaniciAdi ?? req.user.kullaniciAdi } }, { new: true, runValidators: true }).select("+bekleyenEmail +emailDegisimSonTarih");
    if (!kullanici) return res.status(401).json({ hata: "Oturumunuz geçersiz. Yeniden giriş yapın." });
    res.json({ basarili: true, kullanici: kullaniciyiSun(kullanici) });
  } catch (hata) {
    const izinli = ["AUTH_YENIDEN_GIRIS", "EMAIL_KULLANILAMIYOR", "EMAIL_DEGISIM_BEKLE", "EPOSTA_YAPILANDIRMA", "AUTH_GECICI_HATA"].includes(hata.kod);
    res.status(izinli ? hata.status : 500).json({ kod: izinli ? hata.kod : "AUTH_GECICI_HATA", hata: izinli ? hata.message : "Profil güncellenemedi." });
  }
};

export const emailDegisiminiDogrula = async (req, res) => {
  try {
    const kullanici = await emailDegisimServisi.dogrula({ kullanici: req.user, token: req.body.token });
    oturumCookieGonder(res, oturumTokeniOlustur(kullanici));
    res.json({ basarili: true, kullanici: kullaniciyiSun(kullanici), mesaj: "E-posta adresiniz doğrulandı ve güncellendi." });
  } catch (hata) {
    const izinli = ["EMAIL_BAGLANTISI_GECERSIZ", "EMAIL_KULLANILAMIYOR"].includes(hata.kod);
    res.status(izinli ? hata.status : 503).json({ kod: izinli ? hata.kod : "AUTH_GECICI_HATA", hata: izinli ? hata.message : "E-posta adresi şu anda doğrulanamıyor." });
  }
};

/* =========================
   Şifre Değiştir
========================= */
export const sifreDegistir = async (req, res) => {
  try {
    const { mevcutSifre, yeniSifre } = req.body;
    const kullanici = await Kullanici.findById(req.user.id).select("+sifre +oturumSurumu");
    if (!kullanici || !(await kullanici.sifreEslesiyorMu(mevcutSifre))) {
      return res.status(401).json({ kod: "MEVCUT_SIFRE_HATALI", hata: "Mevcut şifre hatalı." });
    }
    const sifre = await Kullanici.sifreyiHashle(yeniSifre);
    const guncel = await Kullanici.findOneAndUpdate({ _id: kullanici._id, sifre: kullanici.sifre,
      ...oturumSurumuFiltresi(req.user.oturumSurumu ?? 0) }, {
      $set: { sifre }, $inc: { oturumSurumu: 1 },
      $unset: { sifirlamaTokenHash: 1, sifirlamaSonTarih: 1, sifirlamaSonIstek: 1,
        bekleyenEmail: 1, emailDegisimTokenHash: 1, emailDegisimSonTarih: 1, emailDegisimSonIstek: 1 },
    }, { new: true }).select("+oturumSurumu");
    if (!guncel) return res.status(409).json({ hata: "Hesap güvenlik bilgileri değişti. Yeniden giriş yapın." });
    const token = oturumTokeniOlustur(guncel);
    oturumCookieGonder(res, token);
    res.json({ basarili: true, mesaj: "Şifre güncellendi. Diğer oturumlar kapatıldı.", token });
  } catch {
    res.status(500).json({ hata: "Şifre güncellenemedi." });
  }
};

const SIFIRLAMA_GENEL_MESAJI = "E-posta adresi kayıtlıysa şifre sıfırlama bağlantısı gönderilecektir.";
export const sifremiUnuttum = async (req, res) => {
  const baslangic = Date.now();
  res.set("Cache-Control", "no-store");
  try {
    await sifreSifirlamaServisi.iste(req.body.email);
    await new Promise(r => setTimeout(r, Math.max(0, 250 - (Date.now() - baslangic))));
    res.json({ basarili: true, mesaj: SIFIRLAMA_GENEL_MESAJI });
  } catch (hata) {
    if (hata.kod === "EPOSTA_YAPILANDIRMA") return res.status(503).json({ kod: "AUTH_GECICI_HATA", hata: "İşlem şu anda tamamlanamıyor. Lütfen daha sonra tekrar deneyin." });
    // Hesaba özel gönderim/kayıt hataları hesap varlığını açığa çıkarmamalıdır.
    console.error("[Auth] SIFIRLAMA_ISTEGI_TAMAMLANAMADI");
    await new Promise(r => setTimeout(r, Math.max(0, 250 - (Date.now() - baslangic))));
    res.json({ basarili: true, mesaj: SIFIRLAMA_GENEL_MESAJI });
  }
};

export const sifreSifirla = async (req, res) => {
  res.set("Cache-Control", "no-store");
  try {
    await sifreSifirlamaServisi.sifirla(req.params.token, req.body.yeniSifre);
    res.clearCookie("token", oturumCookieAyarlari());
    res.json({ basarili: true, mesaj: "Şifreniz sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz." });
  } catch (hata) {
    const gecersiz = hata.kod === "SIFIRLAMA_BAGLANTISI_GECERSIZ";
    res.status(gecersiz ? 400 : 503).json({ kod: gecersiz ? hata.kod : "AUTH_GECICI_HATA",
      hata: gecersiz ? hata.message : "Şifre şu anda sıfırlanamıyor. Lütfen daha sonra tekrar deneyin." });
  }
};

/* =========================
   Çıkış Yap
========================= */
export const cikisYap = async (req, res) => {
  res.clearCookie("token", oturumCookieAyarlari());

  res.status(200).json({
    basarili: true,
    mesaj: "Çıkış başarıyla yapıldı",
  });
};

import { randomBytes } from "node:crypto";
import Kullanici from "../models/Kullanici.js";
import { epostaServisi } from "./epostaService.js";
import { emailDegisimDogrulamaEpostasi } from "./epostaSablonlari.js";
import { oturumSurumuFiltresi, tokenHashle, sifirlamaTokeniGecerliMi } from "../utils/authGuvenligi.js";

const hata = (mesaj, kod, status = 400) => Object.assign(new Error(mesaj), { kod, status });
export const emailDegisimServisiOlustur = ({ Model = Kullanici, eposta = epostaServisi, simdi = Date.now,
    tokenUret = () => randomBytes(32).toString("hex") } = {}) => ({
    async iste({ kullanici, email, kullaniciAdi, authTime }) {
        const zaman = simdi();
        if (!Number.isFinite(authTime) || authTime * 1000 < zaman - 15 * 60_000 || authTime * 1000 > zaman + 60_000)
            throw hata("E-posta değişikliği için yeniden giriş yapın.", "AUTH_YENIDEN_GIRIS", 401);
        const ayar = eposta.ayarlariGetir();
        if (await Model.findOne({ email }).select("_id")) throw hata("Bu e-posta adresi kullanılamıyor.", "EMAIL_KULLANILAMIYOR", 409);
        const token = tokenUret(), hash = tokenHashle(`email-degisim-v2:${token}`);
        const guncel = await Model.findOneAndUpdate({ _id: kullanici._id, email: kullanici.email,
            ...oturumSurumuFiltresi(kullanici.oturumSurumu ?? 0),
            $and: [{ $or: [{ emailDegisimSonIstek: { $exists: false } }, { emailDegisimSonIstek: { $lte: new Date(zaman - 60_000) } }] }],
        }, { $set: { kullaniciAdi: kullaniciAdi ?? kullanici.kullaniciAdi, bekleyenEmail: email,
            emailDegisimTokenHash: hash, emailDegisimSonTarih: new Date(zaman + 60_000), emailDegisimSonIstek: new Date(zaman) } },
        { new: true, runValidators: true }).select("+bekleyenEmail +emailDegisimSonTarih");
        if (!guncel) throw hata("Hesap bilgileriniz değişmiş veya kısa süre önce bağlantı istenmiş. Sayfayı yenileyip bir dakika sonra tekrar deneyin.", "EMAIL_DEGISIM_BEKLE", 409);
        const temizle = () => Model.updateOne({ _id: kullanici._id, emailDegisimTokenHash: hash },
            { $unset: { bekleyenEmail: 1, emailDegisimTokenHash: 1, emailDegisimSonTarih: 1 } });
        const link = `${ayar.clientUrl}/eposta-dogrula/${token}`;
        const icerik = emailDegisimDogrulamaEpostasi(link);
        if (!eposta.sirayaAl({ to: email, subject: "StudyAI — E-posta Değişikliği Onayı",
            ...icerik,
        }, temizle)) {
            await temizle(); throw hata("E-posta servisi şu anda yoğun. Daha sonra tekrar deneyin.", "AUTH_GECICI_HATA", 503);
        }
        return guncel;
    },
    async dogrula({ token }) {
        if (!sifirlamaTokeniGecerliMi(token)) throw hata("Bağlantı geçersiz veya süresi dolmuş.", "EMAIL_BAGLANTISI_GECERSIZ");
        // Gelen kutusundaki tek kullanımlık token, oturum olmadan yeni adresin sahipliğini kanıtlar.
        const hash = tokenHashle(`email-degisim-v2:${token}`);
        const filtre = { emailDegisimTokenHash: hash, emailDegisimSonTarih: { $gt: new Date(simdi()) } };
        const aday = await Model.findOne(filtre).select("+bekleyenEmail +oturumSurumu");
        if (!aday?.bekleyenEmail) throw hata("Bağlantı geçersiz, kullanılmış veya süresi dolmuş.", "EMAIL_BAGLANTISI_GECERSIZ");
        try {
            // Şifre veya oturum güvenlik sürümü değişirse ve yarış olursa atomik yazım reddedilir.
            const guncel = await Model.findOneAndUpdate({
                _id: aday._id, email: aday.email, bekleyenEmail: aday.bekleyenEmail,
                ...oturumSurumuFiltresi(aday.oturumSurumu ?? 0),
                emailDegisimTokenHash: hash, emailDegisimSonTarih: { $gt: new Date(simdi()) },
            }, { $set: { email: aday.bekleyenEmail },
                $inc: { oturumSurumu: 1 },
                $unset: { bekleyenEmail: 1, emailDegisimTokenHash: 1, emailDegisimSonTarih: 1,
                    emailDegisimSonIstek: 1, sifirlamaTokenHash: 1, sifirlamaSonTarih: 1, sifirlamaSonIstek: 1 },
            }, { new: true, runValidators: true }).select("+oturumSurumu");
            if (!guncel) throw hata("Bağlantı artık geçerli değil. Yeni bir doğrulama bağlantısı isteyin.", "EMAIL_BAGLANTISI_GECERSIZ");
            return guncel;
        } catch (e) {
            if (e.code === 11000) throw hata("Bu e-posta adresi kullanılamıyor. Mevcut adresiniz korundu.", "EMAIL_KULLANILAMIYOR", 409);
            throw e;
        }
    },
});
export const emailDegisimServisi = emailDegisimServisiOlustur();

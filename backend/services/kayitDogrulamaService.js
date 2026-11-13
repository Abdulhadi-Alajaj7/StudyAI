import { randomBytes } from "node:crypto";
import Kullanici from "../models/Kullanici.js";
import { epostaServisi } from "./epostaService.js";
import { kayitDogrulamaEpostasi } from "./epostaSablonlari.js";
import { tokenHashle, sifirlamaTokeniGecerliMi } from "../utils/authGuvenligi.js";

export const KAYIT_DOGRULAMA_MESAJI = "Hesabınızı aktifleştirmek için e-posta adresinize gönderilen doğrulama bağlantısına tıklayın.";
export const kayitTokenHashle = token => tokenHashle(`kayit-dogrulama:${token}`);
const gecersiz = () => Object.assign(new Error("Bağlantı geçersiz, kullanılmış veya süresi dolmuş. Gerekirse yeniden kayıt olun."), { kod: "KAYIT_DOGRULAMA_GECERSIZ", status: 400 });

export const kayitDogrulamaServisiOlustur = ({ Model = Kullanici, eposta = epostaServisi,
    simdi = Date.now, tokenUret = () => randomBytes(32).toString("hex") } = {}) => {
    const gonder = (email, token) => {
        try {
            const { clientUrl } = eposta.ayarlariGetir();
            return eposta.sirayaAl({ to: email, subject: "StudyAI — E-posta Adresinizi Doğrulayın",
                ...kayitDogrulamaEpostasi(`${clientUrl}/hesap-dogrula/${token}`) });
        } catch { return false; } // Hesap korunur; bekleme ekranından tekrar istenebilir.
    };
    return {
        async kaydet({ kullaniciAdi, email, sifre }) {
            const token = tokenUret(), zaman = simdi();
            await Model.create({ kullaniciAdi, email, sifre, createdAt: new Date(zaman), emailDogrulandi: false, emailDogrulamaZorunluKayit: true,
                kayitDogrulamaTokenHash: kayitTokenHashle(token), kayitDogrulamaSonTarih: new Date(zaman + 3600_000),
                kayitDogrulamaSonIstek: new Date(zaman) });
            return { epostaGonderildi: gonder(email, token) };
        },
        async yenidenGonder(email) {
            const token = tokenUret(), zaman = simdi();
            const k = await Model.findOneAndUpdate({ email, emailDogrulandi: false, emailDogrulamaZorunluKayit: true,
                kayitDogrulamaSonTarih: { $gt: new Date(zaman) }, hesapTemizlemeToken: { $exists: false },
                $or: [{ kayitDogrulamaSonIstek: { $exists: false } }, { kayitDogrulamaSonIstek: { $lte: new Date(zaman - 60_000) } }],
            }, { $set: { kayitDogrulamaTokenHash: kayitTokenHashle(token), kayitDogrulamaSonIstek: new Date(zaman) } }, { new: true });
            // Sabit son tarih ve createdAt değişmez. Bilinmeyen/doğrulanmış hesaplar aynı yanıtı alır.
            return { epostaGonderildi: k ? gonder(k.email, token) : true };
        },
        async dogrula(token) {
            if (!sifirlamaTokeniGecerliMi(token)) throw gecersiz();
            const k = await Model.findOneAndUpdate({ kayitDogrulamaTokenHash: kayitTokenHashle(token),
                emailDogrulandi: false, emailDogrulamaZorunluKayit: true, hesapTemizlemeToken: { $exists: false },
                kayitDogrulamaSonTarih: { $gt: new Date(simdi()) } }, {
                $set: { emailDogrulandi: true }, $inc: { oturumSurumu: 1 },
                $unset: { kayitDogrulamaTokenHash: 1, kayitDogrulamaSonIstek: 1 },
            }, { new: true });
            if (!k) throw gecersiz();
        },
    };
};
export const kayitDogrulamaServisi = kayitDogrulamaServisiOlustur();

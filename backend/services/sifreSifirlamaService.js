import { randomBytes } from "node:crypto";
import Kullanici from "../models/Kullanici.js";
import { epostaServisi } from "./epostaService.js";
import { sifirlamaTokeniGecerliMi, tokenHashle, oturumSurumuFiltresi } from "../utils/authGuvenligi.js";

export const sifreSifirlamaServisiOlustur = ({ Model = Kullanici, eposta = epostaServisi,
    simdi = Date.now, tokenUret = () => randomBytes(32).toString("hex") } = {}) => ({
    async iste(email) {
        // Yapılandırma hatası hesap aramasından önce kontrol edilir; hesap varlığı sızmaz.
        const ayar = eposta.ayarlariGetir();
        const kullanici = await Model.findOne({ email }).select("+oturumSurumu");
        if (!kullanici) return;
        const token = tokenUret(), hash = tokenHashle(token), zaman = simdi();
        const sonuc = await Model.updateOne({ _id: kullanici._id, email,
            ...oturumSurumuFiltresi(kullanici.oturumSurumu ?? 0),
            $and: [{ $or: [{ sifirlamaSonIstek: { $exists: false } }, { sifirlamaSonIstek: { $lte: new Date(zaman - 60_000) } }] }],
        }, { $set: { sifirlamaTokenHash: hash, sifirlamaSonTarih: new Date(zaman + 15 * 60_000), sifirlamaSonIstek: new Date(zaman) } });
        if (sonuc.matchedCount !== 1) return;
        const temizle = () => Model.updateOne({ _id: kullanici._id, sifirlamaTokenHash: hash },
            { $unset: { sifirlamaTokenHash: 1, sifirlamaSonTarih: 1 } });
        const link = `${ayar.clientUrl}/reset-password/${token}`;
        const alindi = eposta.sirayaAl({ to: kullanici.email, subject: "StudyAI — Şifre Sıfırlama",
            text: `Şifrenizi sıfırlamak için: ${link}\nBağlantı 15 dakika geçerlidir. İsteği siz yapmadıysanız dikkate almayın.`,
            html: `<p>Şifrenizi sıfırlamak için bağlantıyı açın:</p><p><a href="${link}">Şifreyi Sıfırla</a></p><p>Bağlantı 15 dakika geçerlidir. İsteği siz yapmadıysanız dikkate almayın.</p>`,
        }, temizle);
        if (!alindi) await temizle();
    },
    async sifirla(token, yeniSifre) {
        const gecersiz = () => Object.assign(new Error("Bağlantı geçersiz, kullanılmış veya süresi dolmuş. Yeni bir bağlantı isteyin."), { status: 400, kod: "SIFIRLAMA_BAGLANTISI_GECERSIZ" });
        if (!sifirlamaTokeniGecerliMi(token)) throw gecersiz();
        const hash = tokenHashle(token);
        // Pahalı hash yalnız geçerli adaya uygulanır; tüketim yine atomik son sorgudadır.
        const aday = await Model.findOne({ sifirlamaTokenHash: hash, sifirlamaSonTarih: { $gt: new Date(simdi()) } }).select("_id");
        if (!aday) throw gecersiz();
        const sifre = await Model.sifreyiHashle(yeniSifre);
        // Tek belge: standalone MongoDB'de de şifre/token/oturum sürümü birlikte değişir.
        const sonuc = await Model.updateOne({ _id: aday._id, sifirlamaTokenHash: hash, sifirlamaSonTarih: { $gt: new Date(simdi()) } }, {
            $set: { sifre }, $inc: { oturumSurumu: 1 },
            $unset: { sifirlamaTokenHash: 1, sifirlamaSonTarih: 1, sifirlamaSonIstek: 1,
                bekleyenEmail: 1, emailDegisimTokenHash: 1, emailDegisimSonTarih: 1, emailDegisimSonIstek: 1 },
        });
        if (sonuc.matchedCount !== 1) throw gecersiz();
    },
});
export const sifreSifirlamaServisi = sifreSifirlamaServisiOlustur();

import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import KimlikFormDuzeni from "../components/KimlikFormDuzeni.jsx";
import authApi from "../services/authApi.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";

export function DogrulamaBekleniyor() {
    const { state } = useLocation();
    const [email, setEmail] = useState(state?.email || "");
    const [hata, setHata] = useState(state?.epostaGonderildi === false ? "E-posta gönderimi tamamlanamadı. Bir dakika sonra yeni bağlantı isteyebilirsiniz." : "");
    const [mesaj, setMesaj] = useState(""), [mesgul, setMesgul] = useState(false);
    const kilit = useRef(false), istek = useRef(null);
    useEffect(() => () => istek.current?.abort(), []);
    const gonder = async e => {
        e.preventDefault(); if (kilit.current) return;
        kilit.current = true; setMesgul(true); setHata(""); setMesaj("");
        const c = new AbortController(); istek.current = c;
        try { const r = await authApi.kayitYenidenGonder(email.trim(), c.signal); if (!c.signal.aborted) setMesaj(r.data.mesaj); }
        catch (err) { if (!c.signal.aborted) setHata(kullaniciHataMesaji(err)); }
        finally { kilit.current = false; if (!c.signal.aborted) setMesgul(false); }
    };
    return <KimlikFormDuzeni baslik="E-postanı doğrula" aciklama="Hesabınızı aktifleştirmek için e-posta adresinize gönderilen doğrulama bağlantısına tıklayın.">
        <p className="mt-6 text-sm leading-6 text-slate-500">Bağlantı kayıt anından itibaren 1 saat geçerlidir. Spam klasörünü de kontrol edin. Yeniden gönderim bu süreyi uzatmaz. Süre dolduysa hesabın temizlenmesinin ardından yeniden kayıt olabilirsiniz.</p>
        <form onSubmit={gonder} className="mt-7 space-y-4">
            <label htmlFor="email" className="block text-[15px] font-semibold">E-posta Adresi</label>
            <input id="email" name="email" type="email" autoComplete="email" required maxLength={254} disabled={mesgul} value={email} onChange={e => setEmail(e.target.value)} className="h-[54px] w-full rounded-xl border border-[#E2E8F0] px-4 outline-none focus:border-blue-600 focus:ring-2 focus:ring-blue-100" />
            {hata && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{hata}</p>}
            {mesaj && <p role="status" className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">{mesaj}</p>}
            <button disabled={mesgul} className="min-h-[54px] w-full rounded-xl bg-blue-600 p-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-60">{mesgul ? "İsteniyor..." : "Doğrulama Bağlantısını Yeniden Gönder"}</button>
        </form>
        <Link to="/kayit" className="mt-4 inline-block text-sm font-semibold text-blue-600 underline">Yeniden kayıt ol</Link>
    </KimlikFormDuzeni>;
}

export default function KayitDogrulama() {
    const { token } = useParams();
    return <DogrulamaFormu key={token} token={token} />;
}
function DogrulamaFormu({ token }) {
    const navigate = useNavigate();
    const [durum, setDurum] = useState("bekliyor"), [hata, setHata] = useState("");
    const [tekrar, setTekrar] = useState(0);
    const bozuk = !/^[a-f0-9]{64}$/.test(token || "");
    useEffect(() => {
        if (bozuk) return;
        const c = new AbortController(); let yonlendirme;
        // StrictMode'un ilk effect temizliği API'ye ikinci tüketim isteği üretmez.
        const baslat = setTimeout(() => {
            authApi.kayitDogrula(token, c.signal).then(() => {
                if (c.signal.aborted) return;
                setDurum("basarili");
                yonlendirme = setTimeout(() => navigate("/", { replace: true, state: { hesapDogrulandi: true } }), 1500);
            }).catch(err => { if (!c.signal.aborted) { setDurum(err.response?.data?.kod === "KAYIT_DOGRULAMA_GECERSIZ" ? "gecersiz" : "hata"); setHata(kullaniciHataMesaji(err)); } });
        }, 0);
        return () => { clearTimeout(baslat); clearTimeout(yonlendirme); c.abort(); };
    }, [token, tekrar, bozuk, navigate]);
    return <KimlikFormDuzeni baslik="Hesap Doğrulama" aciklama="E-posta adresini doğrulayarak StudyAI hesabını aktifleştir.">
        {bozuk || durum === "gecersiz" ? <div role="alert" className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-600">Bağlantı geçersiz, kullanılmış veya süresi dolmuş. Yeni bağlantı isteyebilir veya süre dolduysa yeniden kayıt olabilirsiniz.</div>
            : durum === "basarili" ? <p role="status" className="mt-8 rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">E-posta adresiniz doğrulandı. Giriş sayfasına yönlendiriliyorsunuz...</p>
                : durum === "hata" ? <div className="mt-8"><p role="alert" className="text-sm text-red-600">{hata}</p><button className="mt-4 rounded-lg bg-blue-600 px-5 py-3 text-white" onClick={() => { setDurum("bekliyor"); setTekrar(v => v + 1); }}>Yeniden Dene</button></div>
                    : <p role="status" className="mt-8 text-sm text-slate-500">E-posta adresiniz doğrulanıyor...</p>}
        {(bozuk || durum === "gecersiz") && <Link to="/dogrulama-bekleniyor" className="mt-5 inline-block font-semibold text-blue-600 underline">Yeni doğrulama bağlantısı iste</Link>}
    </KimlikFormDuzeni>;
}

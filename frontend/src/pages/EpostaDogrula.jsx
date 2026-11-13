import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import HesapFormKabugu from "../components/HesapFormKabugu.jsx";
import authApi from "../services/authApi.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";

export default function EpostaDogrula() {
    const { token } = useParams();
    const [durum, setDurum] = useState("kontrol"), [hata, setHata] = useState("");
    const istek = useRef(null), kilit = useRef(false);
    const bozuk = !/^[a-f0-9]{64}$/.test(token || "");
    useEffect(() => {
        if (bozuk) return;
        const c = new AbortController(); istek.current = c;
        authApi.profil(c.signal).then(() => { if (!c.signal.aborted) setDurum("hazir"); })
            .catch(err => { if (!c.signal.aborted) { setDurum(err.response?.status === 401 ? "giris" : "hata"); setHata(kullaniciHataMesaji(err)); } });
        return () => c.abort();
    }, [token, bozuk]);
    useEffect(() => () => istek.current?.abort(), []);
    const dogrula = async () => {
        if (kilit.current) return; kilit.current = true; setDurum("gonderiliyor"); setHata("");
        const c = new AbortController(); istek.current = c;
        try { await authApi.emailDogrula(token, c.signal); if (!c.signal.aborted) setDurum("basarili"); }
        catch (err) { if (!c.signal.aborted) { setDurum(err.response?.status === 401 ? "giris" : "hata"); setHata(kullaniciHataMesaji(err)); } }
        finally { kilit.current = false; }
    };
    return <HesapFormKabugu baslik="E-posta Adresini Doğrula" aciklama="Yeni adresini kullanmaya başlamak için değişikliği onayla.">
        <div className="mt-6 space-y-4 text-sm">
            {bozuk ? <p role="alert" className="text-red-600">Doğrulama bağlantısı geçersiz.</p> : durum === "kontrol" ? <p role="status">Oturum kontrol ediliyor...</p> : durum === "basarili" ? <p role="status" className="text-emerald-700">E-posta adresiniz doğrulandı ve güncellendi.</p> : <>
                {hata && <p role="alert" className="text-red-600">{hata}</p>}
                {durum === "giris" ? <><p>Bağlantının ait olduğu hesapla giriş yapıp doğrulamayı tamamlayın.</p><Link to="/" state={{ donusYolu: `/eposta-dogrula/${token}` }} className="inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white">Giriş Yap ve Devam Et</Link></>
                    : <><p>Onayladığınızda mevcut adresiniz değişecek ve diğer oturumlarınız kapatılacak.</p><button onClick={dogrula} disabled={durum === "gonderiliyor"} className="w-full rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{durum === "gonderiliyor" ? "Doğrulanıyor..." : "E-posta Adresini Doğrula"}</button></>}
            </>}
            <Link to="/panel/profil" className="inline-block text-blue-600 underline">Profil sayfasına dön</Link>
        </div>
    </HesapFormKabugu>;
}

import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import HesapFormKabugu from "../components/HesapFormKabugu.jsx";
import authApi from "../services/authApi.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";

export default function EpostaDogrula() {
    const { token } = useParams();
    const [durum, setDurum] = useState("kontrol"), [hata, setHata] = useState("");
    const bozuk = !/^[a-f0-9]{64}$/.test(token || "");

    useEffect(() => {
        if (bozuk) return undefined;
        const c = new AbortController();
        // GET bağlantıyı tüketmez. E-posta linki açıldıktan sonra POST yapılır.
        // İlk React StrictMode effect temizliğinde çift token tüketimini önler.
        const baslat = setTimeout(() => {
            setDurum("gonderiliyor");
            authApi.emailDogrula(token, c.signal).then(() => {
                if (!c.signal.aborted) setDurum("basarili");
            }).catch(err => {
                if (!c.signal.aborted) {
                    setDurum("hata");
                    setHata(kullaniciHataMesaji(err));
                }
            });
        }, 0);
        return () => { clearTimeout(baslat); c.abort(); };
    }, [token, bozuk]);

    return <HesapFormKabugu baslik="E-posta Adresini Doğrula" aciklama="Yeni e-posta adresiniz güvenli şekilde doğrulanıyor.">
        <div className="mt-6 space-y-4 text-sm">
            {bozuk ? <p role="alert" className="text-red-600">Doğrulama bağlantısı geçersiz.</p>
                : durum === "kontrol" || durum === "gonderiliyor"
                    ? <p role="status">E-posta adresiniz doğrulanıyor...</p>
                    : durum === "basarili"
                        ? <><p role="status" className="text-emerald-700">E-posta adresiniz doğrulandı ve güncellendi.</p>
                            <p>Güvenliğiniz için önceki oturumlar kapatıldı. Yeni e-posta adresinizle giriş yapabilirsiniz.</p>
                            <Link to="/" className="inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white">Giriş Yap</Link></>
                        : <><p role="alert" className="text-red-600">{hata}</p>
                            <p>Bağlantı geçersiz veya süresi dolmuş olabilir. Eski e-posta adresiniz korunur; profil sayfasından yeni bağlantı isteyebilirsiniz.</p>
                            <Link to="/" className="inline-block text-blue-600 underline">Giriş Yap</Link></>}
        </div>
    </HesapFormKabugu>;
}

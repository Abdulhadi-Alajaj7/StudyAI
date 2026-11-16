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
        const controller = new AbortController();
        const dogrula = async () => {
            try {
                // Linkin GET isteği e-postayı değiştirmez. Oturum kontrolünden sonra
                // yalnızca uygulamamızın POST isteği doğrulama tokenını tüketir.
                await authApi.profil(controller.signal);
                if (controller.signal.aborted) return;
                setDurum("gonderiliyor");
                await authApi.emailDogrula(token, controller.signal);
                if (!controller.signal.aborted) setDurum("basarili");
            } catch (err) {
                if (controller.signal.aborted) return;
                setDurum(err.response?.status === 401 ? "giris" : "hata");
                setHata(kullaniciHataMesaji(err));
            }
        };
        void dogrula();
        return () => controller.abort();
    }, [token, bozuk]);

    return <HesapFormKabugu baslik="E-posta Adresini Doğrula" aciklama="Yeni e-posta adresiniz güvenli şekilde doğrulanıyor.">
        <div className="mt-6 space-y-4 text-sm">
            {bozuk ? <p role="alert" className="text-red-600">Doğrulama bağlantısı geçersiz.</p>
                : durum === "kontrol" ? <p role="status">Oturum kontrol ediliyor...</p>
                : durum === "gonderiliyor" ? <p role="status">E-posta adresiniz doğrulanıyor...</p>
                : durum === "basarili" ? <p role="status" className="text-emerald-700">E-posta adresiniz doğrulandı ve güncellendi.</p>
                : <>
                    {hata && <p role="alert" className="text-red-600">{hata}</p>}
                    {durum === "giris"
                        ? <><p>Güvenliğiniz için mevcut hesabınızla giriş yapın. Ardından onay otomatik tamamlanacak.</p>
                            <Link to="/" state={{ donusYolu: `/eposta-dogrula/${token}` }} className="inline-block rounded-lg bg-blue-600 px-5 py-3 font-semibold text-white">Giriş Yap ve Devam Et</Link></>
                        : <p>Bağlantı geçersiz veya süresi dolmuş olabilir. Eski e-posta adresiniz korunur; profil sayfasından yeni bağlantı isteyebilirsiniz.</p>}
                </>}
            <Link to="/panel/profil" className="inline-block text-blue-600 underline">Profil sayfasına dön</Link>
        </div>
    </HesapFormKabugu>;
}

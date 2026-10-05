import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import axios from "axios";

function KorumaliRoute() {
    const [dogrulaniyor, setDogrulaniyor] = useState(true);
    const [girisYapildi, setGirisYapildi] = useState(false);

    useEffect(() => {
        const oturumuKontrolEt = async () => {
            try {
                await axios.get(
                    "http://localhost:5000/auth/profil",
                    {
                        withCredentials: true,
                    }
                );

                setGirisYapildi(true);
            } catch {
                setGirisYapildi(false);
            } finally {
                setDogrulaniyor(false);
            }
        };

        oturumuKontrolEt();
    }, []);

    if (dogrulaniyor) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <p className="text-[#64748B]">
                    Oturum kontrol ediliyor...
                </p>
            </div>
        );
    }

    if (!girisYapildi) {
        return <Navigate to="/" replace />;
    }

    return <Outlet />;
}

export default KorumaliRoute;
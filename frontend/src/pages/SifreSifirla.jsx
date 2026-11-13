import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import KimlikFormDuzeni from "../components/KimlikFormDuzeni.jsx";
import SifreAlani from "../components/SifreAlani.jsx";
import authApi from "../services/authApi.mjs";
import { yeniSifreHatasi } from "../utils/authYardimcilari.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";

export default function SifreSifirla() {
    const { token } = useParams();
    return <SifreFormu key={token} token={token} />;
}

function SifreFormu({ token }) {
    const [sifre, setSifre] = useState(""), [tekrar, setTekrar] = useState("");
    const [hata, setHata] = useState(""), [basarili, setBasarili] = useState(false), [mesgul, setMesgul] = useState(false), [gecersiz, setGecersiz] = useState(false);
    const istek = useRef(null), kilit = useRef(false);
    useEffect(() => () => istek.current?.abort(), []);
    const bozuk = !/^[a-f0-9]{64}$/.test(token || "");
    const gonder = async e => {
        e.preventDefault(); if (kilit.current || bozuk || gecersiz) return;
        const sorun = yeniSifreHatasi(sifre, tekrar); setHata(sorun); if (sorun) return;
        kilit.current = true; setMesgul(true); const c = new AbortController(); istek.current = c;
        try { await authApi.sifreSifirla(token, { yeniSifre: sifre, yeniSifreTekrar: tekrar }, c.signal); if (!c.signal.aborted) { setBasarili(true); setSifre(""); setTekrar(""); } }
        catch (err) { if (!c.signal.aborted) { setHata(kullaniciHataMesaji(err)); setGecersiz(err.response?.data?.kod === "SIFIRLAMA_BAGLANTISI_GECERSIZ"); } }
        finally { kilit.current = false; if (!c.signal.aborted) setMesgul(false); }
    };
    const input = "h-[54px] w-full rounded-[12px] border border-[#E2E8F0] bg-white px-4 text-[16px] text-[#0F172A] outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-60";
    return <KimlikFormDuzeni key={token} baslik="Şifre Sıfırla" aciklama="Hesabın için yeni bir şifre belirle.">
        {basarili ? <p role="status" className="mt-10 rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-700">Şifreniz sıfırlandı. Yeni şifrenizle giriş yapabilirsiniz.</p>
            : bozuk || gecersiz ? <div role="alert" className="mt-10 rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-600"><p>Bağlantı geçersiz, kullanılmış veya süresi dolmuş.</p><Link to="/sifremi-unuttum" className="mt-3 inline-block font-semibold text-blue-600 underline">Yeni bağlantı iste</Link></div>
                : <form onSubmit={gonder} className="mt-10 space-y-6 [&_label]:text-[15px] [&_label]:font-semibold">
                    <SifreAlani id="yeniSifre" baslik="Yeni Şifre" className={input} autoComplete="new-password" minLength={6} value={sifre} onChange={e => setSifre(e.target.value)} disabled={mesgul} />
                    <SifreAlani id="yeniSifreTekrar" baslik="Yeni Şifre Tekrar" className={input} autoComplete="new-password" minLength={6} value={tekrar} onChange={e => setTekrar(e.target.value)} disabled={mesgul} />
                    {hata && <p role="alert" className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-600">{hata}</p>}<button disabled={mesgul} className="h-[54px] w-full rounded-[12px] bg-[#2563EB] text-[16px] font-semibold text-white hover:bg-[#1D4ED8] disabled:opacity-60 disabled:cursor-not-allowed transition active:scale-[0.99]">{mesgul ? "Sıfırlanıyor..." : "Şifreyi Sıfırla"}</button>
                </form>}
    </KimlikFormDuzeni>;
}

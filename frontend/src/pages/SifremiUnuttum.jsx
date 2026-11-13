import { useEffect, useRef, useState } from "react";
import authApi from "../services/authApi.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import { EnvelopeIcon } from "@heroicons/react/24/outline";
import KimlikFormDuzeni from "../components/KimlikFormDuzeni.jsx";

function SifremiUnuttum() {
    const [email, setEmail] = useState(""), [hata, setHata] = useState(""), [mesaj, setMesaj] = useState(""), [mesgul, setMesgul] = useState(false);
    const kilit = useRef(false), istek = useRef(null);
    useEffect(() => () => istek.current?.abort(), []);
    const gonder = async e => {
        e.preventDefault(); if (kilit.current) return;
        kilit.current = true; setMesgul(true); setHata(""); setMesaj("");
        const c = new AbortController(); istek.current = c;
        try { const r = await authApi.sifremiUnuttum(email.trim(), c.signal); if (!c.signal.aborted) setMesaj(r.data.mesaj); }
        catch (err) { if (!c.signal.aborted) setHata(kullaniciHataMesaji(err)); }
        finally { kilit.current = false; if (!c.signal.aborted) setMesgul(false); }
    };
    return <KimlikFormDuzeni baslik="Şifreni mi unuttun?" aciklama="Hesabına bağlı e-posta adresini gir. Şifreni yenilemek için sana bir bağlantı gönderelim.">
        <form className="mt-10 space-y-6" onSubmit={gonder}>
            <div>
                <label htmlFor="email" className="block text-[15px] font-semibold text-[#0F172A] mb-2">E-posta Adresi</label>
                <div className="relative">
                    <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />
                    <input id="email" name="email" autoComplete="email" maxLength={254} value={email}
                        onChange={e => setEmail(e.target.value)} disabled={mesgul} type="email" required placeholder="ornek@email.com"
                        className="w-full h-[54px] pl-12 pr-4 bg-white border border-[#E2E8F0] rounded-[12px] text-[16px] text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#2563EB] focus:ring-2 focus:ring-[#2563EB]/20 disabled:opacity-60" />
                </div>
            </div>
            {hata && <p role="alert" className="rounded-[10px] border border-red-200 bg-red-50 px-4 py-3 text-[14px] text-red-600">{hata}</p>}
            {mesaj && <p role="status" className="rounded-[10px] border border-emerald-200 bg-emerald-50 px-4 py-3 text-[14px] text-emerald-700">{mesaj}</p>}
            <button type="submit" disabled={mesgul} className="w-full min-h-[54px] px-4 py-3 rounded-[12px] bg-[#2563EB] hover:bg-[#1D4ED8] disabled:opacity-60 disabled:cursor-not-allowed text-white text-[16px] font-semibold transition active:scale-[0.99]">
                {mesgul ? "Gönderiliyor..." : "Sıfırlama Bağlantısı Gönder"}
            </button>
        </form>
    </KimlikFormDuzeni>;
}

export default SifremiUnuttum;

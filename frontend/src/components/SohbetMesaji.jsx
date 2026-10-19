import { useEffect, useState } from "react";
import {
    CheckIcon,
    ClipboardDocumentIcon,
    ExclamationCircleIcon,
    SparklesIcon,
} from "@heroicons/react/24/outline";

import GuvenliMarkdown from "./GuvenliMarkdown";
import { kaynakMateryalAdlari, mesajSaati } from "../utils/sohbetYardimcilari.mjs";

function SohbetMesaji({ mesaj, isDark }) {
    const kullaniciMesaji = mesaj.rol === "user";
    const [kopyalandi, setKopyalandi] = useState(false);

    useEffect(() => {
        if (!kopyalandi) return undefined;
        const zamanlayici = setTimeout(() => setKopyalandi(false), 1_600);
        return () => clearTimeout(zamanlayici);
    }, [kopyalandi]);

    const kopyala = async () => {
        try {
            await navigator.clipboard.writeText(mesaj.icerik);
            setKopyalandi(true);
        } catch {
            setKopyalandi(false);
        }
    };

    const kaynakAdlari = kaynakMateryalAdlari(mesaj.kaynaklar);
    const saat = mesajSaati(mesaj.createdAt);

    if (kullaniciMesaji) {
        return (
            <article className="flex justify-end gap-2 sm:gap-3" aria-label="Sizin mesajınız">
                <div className="max-w-[88%] sm:max-w-[76%]">
                    <div className={`rounded-2xl rounded-br-md px-4 py-3 text-[14px] leading-6 sm:px-5 sm:text-[15px] ${
                        mesaj.yanitDurumu === "hata"
                            ? isDark
                                ? "border border-red-400/30 bg-red-500/10 text-red-100"
                                : "border border-red-200 bg-red-50 text-red-900"
                            : "bg-gradient-to-br from-[#4F46E5] to-[#6D5DFB] text-white shadow-sm shadow-indigo-950/10"
                    }`}>
                        <p className="whitespace-pre-wrap break-words">{mesaj.icerik}</p>
                    </div>
                    <div className="mt-1.5 flex items-center justify-end gap-1.5 px-1 text-[11px]">
                        {mesaj.yanitDurumu === "hata" && <ExclamationCircleIcon className="h-3.5 w-3.5 text-red-500" />}
                        <time className={isDark ? "text-[#7F8AA3]" : "text-[#94A3B8]"}>{saat}</time>
                    </div>
                </div>
                <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#4F46E5] text-[11px] font-bold text-white sm:h-9 sm:w-9">
                    Siz
                </div>
            </article>
        );
    }

    return (
        <article className="flex items-start gap-2 sm:gap-3" aria-label="Ders Asistanı mesajı">
            <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#22C1DC] text-white shadow-sm sm:h-9 sm:w-9">
                <SparklesIcon className="h-5 w-5" />
            </div>
            <div className="min-w-0 max-w-[calc(100%-2.75rem)] sm:max-w-[84%]">
                <div className={`rounded-2xl rounded-tl-md border px-4 py-3 text-[14px] leading-7 sm:px-5 sm:py-4 sm:text-[15px] ${
                    isDark
                        ? "border-[#26334A] bg-[#162137] text-[#E6EBF4]"
                        : "border-[#E7E5EF] bg-white text-[#243047] shadow-sm"
                }`}>
                    <GuvenliMarkdown icerik={mesaj.icerik} />

                    {kaynakAdlari.length > 0 && (
                        <div className={`mt-4 border-t pt-3 ${isDark ? "border-[#2C3A54]" : "border-[#ECEAF2]"}`}>
                            <p className={`mb-2 text-[10px] font-bold uppercase tracking-[0.12em] ${isDark ? "text-indigo-300" : "text-indigo-600"}`}>
                                Kullanılan kaynaklar
                            </p>
                            <div className="flex flex-wrap gap-2">
                                {kaynakAdlari.map((ad) => (
                                    <span
                                        key={ad}
                                        className={`inline-flex max-w-full items-center rounded-lg border px-2.5 py-1.5 text-[11px] font-medium ${
                                            isDark
                                                ? "border-[#3B4B69] bg-[#10192C] text-[#CAD3E3]"
                                                : "border-[#DCD9E7] bg-[#F8F7FC] text-[#475569]"
                                        }`}
                                        title={ad}
                                    >
                                        <span className="truncate">{ad}</span>
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
                <div className="mt-1.5 flex items-center gap-2 px-1">
                    <time className={`text-[11px] ${isDark ? "text-[#7F8AA3]" : "text-[#94A3B8]"}`}>{saat}</time>
                    <button
                        type="button"
                        onClick={kopyala}
                        className={`inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium transition-colors ${
                            isDark ? "text-[#8F9BB2] hover:bg-white/5 hover:text-white" : "text-[#64748B] hover:bg-slate-100 hover:text-[#0F172A]"
                        }`}
                        aria-label={kopyalandi ? "Yanıt kopyalandı" : "Yanıtı kopyala"}
                    >
                        {kopyalandi ? <CheckIcon className="h-3.5 w-3.5" /> : <ClipboardDocumentIcon className="h-3.5 w-3.5" />}
                        {kopyalandi ? "Kopyalandı" : "Kopyala"}
                    </button>
                </div>
            </div>
        </article>
    );
}

export default SohbetMesaji;

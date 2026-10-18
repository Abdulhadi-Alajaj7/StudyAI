import { useState } from "react";
import {
    DocumentTextIcon,
    MagnifyingGlassIcon,
    SparklesIcon,
} from "@heroicons/react/24/outline";
import api from "../api";

function SemantikAramaBolumu({ dersId, isDark, hazirMateryalSayisi = 0 }) {
    const [sorgu, setSorgu] = useState("");
    const [sonuclar, setSonuclar] = useState([]);
    const [meta, setMeta] = useState(null);
    const [araniyor, setAraniyor] = useState(false);
    const [hata, setHata] = useState("");
    const [aramaYapildi, setAramaYapildi] = useState(false);

    const ara = async (event) => {
        event.preventDefault();
        const temizSorgu = sorgu.trim();
        if (temizSorgu.length < 2 || araniyor) return;

        setAraniyor(true);
        setHata("");
        try {
            const yanit = await api.post(
                `/dersler/${dersId}/semantic-arama`,
                { sorgu: temizSorgu, limit: 8 },
                { withCredentials: true }
            );
            setSonuclar(yanit.data.sonuclar || []);
            setMeta(yanit.data.meta || null);
            setAramaYapildi(true);
        } catch (istekHatasi) {
            setSonuclar([]);
            setMeta(null);
            setAramaYapildi(true);
            setHata(
                istekHatasi.response?.data?.hata ||
                istekHatasi.kullaniciMesaji ||
                "Semantik arama şu anda kullanılamıyor."
            );
        } finally {
            setAraniyor(false);
        }
    };

    const cerceve = isDark
        ? "bg-[#10192C] border-[#26334A]"
        : "bg-white border-[#E7E5EF]";
    const anaMetin = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const ikincilMetin = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";

    return (
        <section className={`p-5 rounded-2xl border ${cerceve}`} aria-labelledby="semantik-arama-baslik">
            <div className="flex items-start gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl bg-indigo-500/10 text-[#4F46E5] flex items-center justify-center shrink-0">
                    <SparklesIcon className="w-5 h-5" />
                </div>
                <div>
                    <h3 id="semantik-arama-baslik" className={`text-[16px] font-bold ${anaMetin}`}>
                        Materyallerde Anlamsal Arama
                    </h3>
                    <p className={`text-[12px] ${ikincilMetin} mt-0.5`}>
                        Aynı ifadeyi yazmasan bile dersindeki ilgili bölümleri bul.
                    </p>
                </div>
            </div>

            <form onSubmit={ara} className="flex flex-col sm:flex-row gap-2">
                <label htmlFor="semantik-arama-sorgu" className="sr-only">Arama sorgusu</label>
                <div className="relative flex-1">
                    <MagnifyingGlassIcon className={`w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 ${ikincilMetin}`} />
                    <input
                        id="semantik-arama-sorgu"
                        type="search"
                        value={sorgu}
                        onChange={(event) => setSorgu(event.target.value)}
                        maxLength={500}
                        disabled={hazirMateryalSayisi === 0 || araniyor}
                        placeholder="Örn. ağaçlarda arama nasıl çalışır?"
                        className={`w-full pl-9 pr-3 py-2.5 rounded-xl border text-[13px] outline-none focus:ring-2 focus:ring-indigo-500/30 disabled:opacity-60 ${
                            isDark
                                ? "bg-[#0B1120] border-[#26334A] text-white placeholder:text-[#64748B]"
                                : "bg-[#F8F7FC] border-[#E7E5EF] text-[#0F172A] placeholder:text-[#94A3B8]"
                        }`}
                    />
                </div>
                <button
                    type="submit"
                    disabled={sorgu.trim().length < 2 || hazirMateryalSayisi === 0 || araniyor}
                    className="px-5 py-2.5 rounded-xl bg-[#4F46E5] text-white text-[13px] font-semibold disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#4338CA] transition-colors"
                >
                    {araniyor ? "Aranıyor..." : "Ara"}
                </button>
            </form>

            {hazirMateryalSayisi === 0 && (
                <p className={`mt-3 text-[12px] ${ikincilMetin}`}>Arama için önce en az bir materyalin hazırlanması gerekir.</p>
            )}

            {hata && (
                <div role="alert" className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 text-[12px]">
                    {hata}
                </div>
            )}

            {!hata && aramaYapildi && sonuclar.length === 0 && (
                <div className={`mt-4 p-4 rounded-xl border border-dashed text-center ${isDark ? "border-[#26334A]" : "border-[#D8D5E2]"}`}>
                    <p className={`text-[13px] font-semibold ${anaMetin}`}>İlgili bir bölüm bulunamadı.</p>
                    <p className={`text-[12px] ${ikincilMetin} mt-1`}>
                        Sorguyu farklı sözcüklerle deneyebilir veya semantik indeksin hazırlanmasını bekleyebilirsin.
                    </p>
                </div>
            )}

            {sonuclar.length > 0 && (
                <div className="mt-4 space-y-3">
                    <div className="flex items-center justify-between gap-3">
                        <p className={`text-[12px] font-semibold ${anaMetin}`}>{sonuclar.length} ilgili bölüm</p>
                        {meta?.eksikIndeksSayisi > 0 && (
                            <span className="text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                {meta.eksikIndeksSayisi} materyalin indeksi bekleniyor
                            </span>
                        )}
                    </div>
                    {sonuclar.map((sonuc) => (
                        <article
                            key={`${sonuc.materyalId}-${sonuc.parcaIndex}`}
                            className={`p-4 rounded-xl border ${isDark ? "bg-[#0B1120] border-[#26334A]" : "bg-[#F8F7FC] border-[#E7E5EF]"}`}
                        >
                            <div className="flex items-center justify-between gap-3 mb-2">
                                <div className="flex items-center gap-2 min-w-0">
                                    <DocumentTextIcon className="w-4 h-4 text-[#4F46E5] shrink-0" />
                                    <span className={`text-[12px] font-semibold truncate ${anaMetin}`}>{sonuc.materyalAdi}</span>
                                </div>
                                <span className="text-[10px] font-bold text-[#4F46E5] shrink-0">
                                    %{Math.round(Math.max(0, Math.min(1, sonuc.skor)) * 100)} eşleşme
                                </span>
                            </div>
                            <p className={`text-[12px] leading-relaxed whitespace-pre-line ${ikincilMetin}`}>{sonuc.icerik}</p>
                        </article>
                    ))}
                </div>
            )}
        </section>
    );
}

export default SemantikAramaBolumu;


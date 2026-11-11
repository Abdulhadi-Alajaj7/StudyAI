import { useEffect, useRef } from "react";
import { ArrowPathIcon, BookOpenIcon, CheckIcon, ClockIcon, CpuChipIcon, ExclamationCircleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { hazirlamaAdimlariniGetir } from "../utils/dersHazirlamaSunumu.mjs";

const adimGorunumu = {
    tamamlandi: {
        acik: "border-emerald-200 bg-emerald-50/70", koyu: "border-emerald-500/20 bg-emerald-500/5",
        ikon: "bg-emerald-500 text-white", yaziAcik: "text-emerald-800", yaziKoyu: "text-emerald-300",
        etiket: "Tamamlandı", Icon: CheckIcon,
    },
    isleniyor: {
        acik: "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-100", koyu: "border-indigo-400/50 bg-indigo-400/10 ring-1 ring-indigo-400/10",
        ikon: "bg-[#4F46E5] text-white", yaziAcik: "text-indigo-700", yaziKoyu: "text-indigo-300",
        etiket: "İşleniyor", Icon: ArrowPathIcon,
    },
    hata: {
        acik: "border-red-200 bg-red-50", koyu: "border-red-400/35 bg-red-400/10",
        ikon: "bg-red-500 text-white", yaziAcik: "text-red-700", yaziKoyu: "text-red-300",
        etiket: "Tamamlanamadı", Icon: ExclamationCircleIcon,
    },
    bekliyor: {
        acik: "border-[#E7E5EF] bg-[#F8F7FC]/70", koyu: "border-[#26334A] bg-[#10192C]",
        ikon: "bg-slate-200 text-slate-500", yaziAcik: "text-slate-500", yaziKoyu: "text-[#A7B0C2]",
        etiket: "Bekliyor", Icon: ClockIcon,
    },
};

export default function DersHazirlamaEkrani({ ders, isDark, baslatiliyor, hata, yenidenDene, materyalleriKontrolEt }) {
    const modalRef = useRef(null);
    useEffect(() => {
        const oncekiOdak = document.activeElement;
        const oncekiOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        modalRef.current?.focus({ preventScroll: true });

        const klavyeyiKontrolEt = (event) => {
            if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                return;
            }
            if (event.key !== "Tab") return;
            const butonlar = [...(modalRef.current?.querySelectorAll("button:not([disabled])") || [])];
            const ilk = butonlar[0];
            const son = butonlar[butonlar.length - 1];
            if (!ilk) {
                event.preventDefault();
                modalRef.current?.focus({ preventScroll: true });
            } else if (!butonlar.includes(document.activeElement)) {
                event.preventDefault();
                (event.shiftKey ? son : ilk).focus();
            } else if (event.shiftKey && document.activeElement === ilk) {
                event.preventDefault();
                son.focus();
            } else if (!event.shiftKey && document.activeElement === son) {
                event.preventDefault();
                ilk.focus();
            }
        };
        document.addEventListener("keydown", klavyeyiKontrolEt, true);
        return () => {
            document.body.style.overflow = oncekiOverflow;
            document.removeEventListener("keydown", klavyeyiKontrolEt, true);
            if (oncekiOdak?.isConnected) oncekiOdak.focus({ preventScroll: true });
        };
    }, []);

    const basarisiz = !baslatiliyor && ders?.hazirlamaDurumu === "hata";
    const adimlar = hazirlamaAdimlariniGetir(ders, baslatiliyor);
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    const hataMesaji = ders?.hazirlamaHatasi || hata || "Hazırlama tamamlanamadı. Yeniden deneyebilirsiniz.";

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <section ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="ders-hazirlama-baslik"
                aria-describedby="ders-hazirlama-aciklama" tabIndex={-1}
                className={`hazirlama-modal-scroll max-h-[calc(100dvh-2rem)] w-full min-w-0 max-w-xl overflow-y-auto overscroll-contain rounded-2xl border shadow-2xl outline-none ${isDark ? "border-[#26334A] bg-[#162137]" : "border-[#E7E5EF] bg-white"}`}>
                <div className={`h-1 ${basarisiz ? "bg-red-500" : "bg-[#4F46E5]"}`} />
                <div className="p-4 sm:p-5">
                    <header className="mb-4 text-center">
                        <div className={`relative mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl border ${basarisiz
                            ? isDark ? "border-red-400/25 bg-red-400/10 text-red-300" : "border-red-100 bg-red-50 text-red-600"
                            : isDark ? "border-indigo-400/25 bg-indigo-400/10 text-indigo-300" : "border-indigo-100 bg-indigo-50 text-[#4F46E5]"}`}>
                            {basarisiz ? <ExclamationCircleIcon className="h-8 w-8" aria-hidden="true" /> : <CpuChipIcon className="h-8 w-8" aria-hidden="true" />}
                            {!basarisiz && <span aria-hidden="true" className={`absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full ${isDark ? "bg-[#162137]" : "bg-white"}`}>
                                <span className="h-2.5 w-2.5 rounded-full bg-[#4F46E5] motion-safe:animate-pulse" />
                            </span>}
                        </div>
                        <h1 id="ders-hazirlama-baslik" className={`text-[24px] font-bold tracking-tight sm:text-[26px] ${textPrimary}`}>
                            {basarisiz ? "Ders hazırlanamadı" : "Dersiniz Hazırlanıyor"}
                        </h1>
                        <p id="ders-hazirlama-aciklama" className={`mx-auto mt-2 max-w-md text-[13px] leading-6 ${textSecondary}`}>
                            {basarisiz ? "Hazırlama durduruldu. Tamamlanan işlemleriniz ve dosyalarınız korundu."
                                : "Materyalleriniz işleniyor ve dersiniz öğrenmeye hazır hâle getiriliyor."}
                        </p>
                        {ders?.dersAdi && <div className={`mx-auto mt-3 inline-flex max-w-full items-center gap-2 rounded-full border px-3 py-1.5 ${isDark ? "border-[#26334A] bg-[#10192C]" : "border-[#E7E5EF] bg-[#F8F7FC]"}`}>
                            <BookOpenIcon className={`h-4 w-4 shrink-0 ${textSecondary}`} aria-hidden="true" />
                            <span className={`truncate text-[12px] font-medium ${textPrimary}`}>{ders.dersAdi}</span>
                        </div>}
                    </header>

                    <ol className="space-y-3" aria-label="Ders hazırlama aşamaları" aria-live="polite" aria-atomic="true">
                        {adimlar.map((adim, index) => {
                            const gorunum = adimGorunumu[adim.durum];
                            const Icon = gorunum.Icon;
                            const durumYazisi = isDark ? gorunum.yaziKoyu : gorunum.yaziAcik;
                            return <li key={adim.kod} aria-current={adim.durum === "isleniyor" || adim.durum === "hata" ? "step" : undefined}
                                data-durum={adim.durum} className="relative">
                                {index < adimlar.length - 1 && <div aria-hidden="true" className={`absolute left-[35px] top-12 h-[calc(100%-1rem)] w-px ${adim.durum === "tamamlandi" ? "bg-emerald-500/40" : isDark ? "bg-[#33415C]" : "bg-[#E2E8F0]"}`} />}
                                <div className={`relative flex items-start gap-3 rounded-xl border p-4 ${isDark ? gorunum.koyu : gorunum.acik}`}>
                                    <div className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${adim.durum === "bekliyor" && isDark ? "bg-[#26334A] text-[#7F8AA3]" : gorunum.ikon}`}>
                                        <Icon aria-hidden="true" className={`h-5 w-5 ${adim.durum === "isleniyor" ? "motion-safe:animate-spin" : ""}`} />
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                                            <h2 className={`text-[13px] font-semibold leading-5 sm:text-[14px] ${adim.durum === "bekliyor" ? textSecondary : textPrimary}`}>{adim.baslik}</h2>
                                            <span className={`text-[10px] font-semibold leading-5 sm:text-[11px] ${durumYazisi}`}>{gorunum.etiket}</span>
                                        </div>
                                        <p className={`mt-1 text-[12px] leading-5 ${textSecondary}`}>{adim.aciklama}</p>
                                    </div>
                                </div>
                            </li>;
                        })}
                    </ol>

                    {basarisiz ? <div className="mt-6">
                        <div role="alert" className={`flex items-start gap-3 rounded-xl border p-4 ${isDark ? "border-red-400/25 bg-red-400/10 text-red-200" : "border-red-200 bg-red-50 text-red-800"}`}>
                            <ExclamationCircleIcon className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
                            <p className="min-w-0 break-words text-[13px] leading-6">{hataMesaji}</p>
                        </div>
                        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                            <button type="button" onClick={yenidenDene}
                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#4F46E5] px-5 py-3 text-[14px] font-medium text-white transition-colors hover:bg-[#4338CA] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500">
                                <ArrowPathIcon className="h-4 w-4" aria-hidden="true" />Yeniden Dene
                            </button>
                            <button type="button" onClick={materyalleriKontrolEt}
                                className={`flex-1 rounded-xl border px-5 py-3 text-[14px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${isDark ? "border-[#33415C] text-[#F8FAFC] hover:bg-white/5" : "border-[#E7E5EF] text-[#0F172A] hover:bg-[#F8F7FC]"}`}>
                                Materyalleri Kontrol Et
                            </button>
                        </div>
                    </div> : <div className={`mt-6 rounded-xl border px-4 py-3 ${isDark ? "border-[#26334A] bg-[#10192C]" : "border-[#E7E5EF] bg-[#F8F7FC]"}`}>
                        <p role="status" className={`flex items-center justify-center gap-2 text-[12px] font-medium ${isDark ? "text-indigo-300" : "text-[#4F46E5]"}`}>
                            <ArrowPathIcon aria-hidden="true" className="h-4 w-4 shrink-0 motion-safe:animate-spin" />
                            {baslatiliyor ? "Hazırlama başlatılıyor…" : "Hazırlama işlemi devam ediyor…"}
                        </p>
                        <p className={`mt-1.5 text-center text-[12px] leading-5 ${textSecondary}`}>
                            Tamamlandığında dersinize otomatik olarak yönlendirileceksiniz.
                        </p>
                        {hata && <p role="alert" className={`mt-3 break-words text-[12px] leading-5 ${isDark ? "text-red-300" : "text-red-700"}`}>{hata}</p>}
                    </div>}
                    <p className={`mt-5 flex items-start justify-center gap-2 text-center text-[11px] leading-5 ${textSecondary}`}>
                        <ShieldCheckIcon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                        {basarisiz ? "Hazır işlemleriniz yeniden denemede kullanılmak üzere korunur."
                            : "Hazırlama boyunca materyalleriniz güvenle korunur ve değiştirilemez."}
                    </p>
                </div>
            </section>
        </div>
    );
}

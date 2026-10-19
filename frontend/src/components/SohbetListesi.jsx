import { useEffect, useRef, useState } from "react";
import {
    ArrowPathIcon,
    ChatBubbleLeftIcon,
    EllipsisVerticalIcon,
    PencilSquareIcon,
    PlusIcon,
    TrashIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";

function SohbetListesi({
    isDark,
    sohbetler,
    seciliSohbetId,
    yukleniyor,
    hata,
    devamCursor,
    islemDevamEdiyor,
    mobil = false,
    onKapat,
    onYeniSohbet,
    onSohbetSec,
    onYenidenAdlandir,
    onSil,
    onDahaFazla,
    onYenile,
}) {
    const [acikMenu, setAcikMenu] = useState(null);
    const listeRef = useRef(null);

    useEffect(() => {
        if (mobil) listeRef.current?.querySelector("button")?.focus();
    }, [mobil]);

    useEffect(() => {
        const kapat = (event) => {
            if (!listeRef.current?.contains(event.target)) setAcikMenu(null);
        };
        const klavye = (event) => {
            if (event.key === "Escape") {
                if (acikMenu) setAcikMenu(null);
                else if (mobil) onKapat?.();
                return;
            }
            if (event.key === "Tab" && mobil && listeRef.current) {
                const odaklanabilirler = [...listeRef.current.querySelectorAll(
                    'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
                )];
                if (odaklanabilirler.length === 0) return;
                const ilk = odaklanabilirler[0];
                const son = odaklanabilirler[odaklanabilirler.length - 1];
                if (event.shiftKey && document.activeElement === ilk) {
                    event.preventDefault();
                    son.focus();
                } else if (!event.shiftKey && document.activeElement === son) {
                    event.preventDefault();
                    ilk.focus();
                }
            }
        };
        document.addEventListener("pointerdown", kapat);
        document.addEventListener("keydown", klavye);
        return () => {
            document.removeEventListener("pointerdown", kapat);
            document.removeEventListener("keydown", klavye);
        };
    }, [acikMenu, mobil, onKapat]);

    return (
        <aside
            ref={listeRef}
            aria-label="Sohbet geçmişi"
            role={mobil ? "dialog" : undefined}
            aria-modal={mobil ? "true" : undefined}
            className={`flex h-full min-h-0 flex-col ${
                isDark ? "bg-[#10192C]" : "bg-white"
            } ${mobil ? "w-[min(88vw,340px)] shadow-2xl" : "w-full"}`}
        >
            <div className="flex items-center gap-2 p-4 pb-3">
                <button
                    type="button"
                    onClick={() => {
                        setAcikMenu(null);
                        onYeniSohbet();
                    }}
                    disabled={islemDevamEdiyor}
                    className="inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#4F46E5] to-[#6D5DFB] px-4 text-[14px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                    <PlusIcon className="h-5 w-5" />
                    Yeni Sohbet
                </button>
                {mobil && (
                    <button
                        type="button"
                        onClick={onKapat}
                        aria-label="Sohbet geçmişini kapat"
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                            isDark ? "text-[#A7B0C2] hover:bg-white/5" : "text-[#64748B] hover:bg-slate-100"
                        }`}
                    >
                        <XMarkIcon className="h-6 w-6" />
                    </button>
                )}
            </div>

            <div className="flex items-center justify-between px-5 pb-2 pt-1">
                <h3 className={`text-[11px] font-bold uppercase tracking-[0.12em] ${isDark ? "text-[#8390A8]" : "text-[#64748B]"}`}>
                    Sohbetler
                </h3>
                <button
                    type="button"
                    onClick={onYenile}
                    disabled={yukleniyor || islemDevamEdiyor}
                    aria-label="Sohbet listesini yenile"
                    className={`rounded-lg p-1.5 transition-colors ${isDark ? "text-[#8390A8] hover:bg-white/5 hover:text-white" : "text-[#64748B] hover:bg-slate-100 hover:text-slate-900"}`}
                >
                    <ArrowPathIcon className={`h-4 w-4 ${yukleniyor ? "animate-spin" : ""}`} />
                </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4" data-testid="sohbet-listesi">
                {yukleniyor && sohbetler.length === 0 && (
                    <div className="space-y-2 px-1 py-2" aria-label="Sohbetler yükleniyor">
                        {[0, 1, 2].map((deger) => (
                            <div key={deger} className={`h-12 animate-pulse rounded-xl ${isDark ? "bg-white/5" : "bg-slate-100"}`} />
                        ))}
                    </div>
                )}

                {!yukleniyor && sohbetler.length === 0 && !hata && (
                    <div className={`mx-1 mt-5 rounded-xl px-4 py-6 text-center text-[13px] leading-5 ${isDark ? "bg-white/[0.03] text-[#8F9BB2]" : "bg-slate-50 text-[#64748B]"}`}>
                        Henüz kayıtlı bir sohbet yok. İlk sorunuzu yazarak başlayabilirsiniz.
                    </div>
                )}

                {hata && sohbetler.length === 0 && (
                    <div className="mx-1 mt-4 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-center">
                        <p className="text-[13px] leading-5 text-red-500">{hata}</p>
                        <button type="button" onClick={onYenile} className="mt-3 text-[12px] font-semibold text-indigo-500 hover:underline">
                            Yeniden dene
                        </button>
                    </div>
                )}

                <div className="space-y-1.5">
                    {sohbetler.map((sohbet) => {
                        const aktif = String(sohbet._id) === String(seciliSohbetId);
                        return (
                            <div key={sohbet._id} className="group relative">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setAcikMenu(null);
                                        onSohbetSec(sohbet);
                                    }}
                                    disabled={islemDevamEdiyor}
                                    aria-current={aktif ? "page" : undefined}
                                    className={`flex min-h-12 w-full items-center gap-3 rounded-xl py-2.5 pl-3 pr-11 text-left text-[13px] font-medium transition-colors disabled:cursor-not-allowed ${
                                        aktif
                                            ? isDark
                                                ? "bg-indigo-500/20 text-indigo-100 ring-1 ring-inset ring-indigo-400/30"
                                                : "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200"
                                            : isDark
                                                ? "text-[#C3CCDC] hover:bg-white/5 hover:text-white"
                                                : "text-[#334155] hover:bg-[#F6F5FA] hover:text-[#111827]"
                                    }`}
                                >
                                    <ChatBubbleLeftIcon className={`h-[18px] w-[18px] shrink-0 ${aktif ? "text-indigo-500" : isDark ? "text-[#71809B]" : "text-[#94A3B8]"}`} />
                                    <span className="line-clamp-2 break-words">{sohbet.baslik || "Yeni Sohbet"}</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        setAcikMenu((onceki) => onceki === sohbet._id ? null : sohbet._id);
                                    }}
                                    disabled={islemDevamEdiyor}
                                    aria-label={`${sohbet.baslik || "Sohbet"} seçenekleri`}
                                    aria-expanded={acikMenu === sohbet._id}
                                    className={`absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg opacity-70 transition hover:opacity-100 focus:opacity-100 disabled:hidden ${
                                        isDark ? "text-[#A7B0C2] hover:bg-white/10" : "text-[#64748B] hover:bg-white"
                                    }`}
                                >
                                    <EllipsisVerticalIcon className="h-5 w-5" />
                                </button>

                                {acikMenu === sohbet._id && (
                                    <div className={`absolute right-2 top-[calc(100%-3px)] z-20 w-44 rounded-xl border p-1.5 shadow-xl ${
                                        isDark ? "border-[#33415C] bg-[#162137]" : "border-[#E2E0E9] bg-white"
                                    }`} role="menu">
                                        <button
                                            type="button"
                                            onClick={() => { setAcikMenu(null); onYenidenAdlandir(sohbet); }}
                                            className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-[13px] font-medium ${isDark ? "text-[#D6DEEB] hover:bg-white/5" : "text-[#334155] hover:bg-slate-50"}`}
                                            role="menuitem"
                                        >
                                            <PencilSquareIcon className="h-4 w-4" /> Yeniden Adlandır
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => { setAcikMenu(null); onSil(sohbet); }}
                                            className={`flex h-10 w-full items-center gap-2 rounded-lg px-3 text-[13px] font-medium text-red-500 ${isDark ? "hover:bg-red-500/10" : "hover:bg-red-50"}`}
                                            role="menuitem"
                                        >
                                            <TrashIcon className="h-4 w-4" /> Sil
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {devamCursor && (
                    <button
                        type="button"
                        onClick={onDahaFazla}
                        disabled={yukleniyor}
                        className={`mt-3 h-10 w-full rounded-xl text-[12px] font-semibold transition-colors ${
                            isDark ? "bg-white/5 text-[#AAB5C8] hover:bg-white/10" : "bg-slate-50 text-[#64748B] hover:bg-slate-100"
                        }`}
                    >
                        {yukleniyor ? "Yükleniyor..." : "Daha fazla sohbet yükle"}
                    </button>
                )}
            </div>
        </aside>
    );
}

export default SohbetListesi;

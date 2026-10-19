import { useEffect, useRef, useState } from "react";
import { ExclamationTriangleIcon, XMarkIcon } from "@heroicons/react/24/outline";

function SohbetIslemModal({ tur, sohbet, isDark, yukleniyor, hata, onKapat, onOnayla }) {
    const [baslik, setBaslik] = useState(sohbet?.baslik || "");
    const ilkOdakRef = useRef(null);
    const modalRef = useRef(null);

    useEffect(() => {
        ilkOdakRef.current?.focus();
        const oncekiOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        const klavye = (event) => {
            if (event.key === "Escape" && !yukleniyor) onKapat();
            if (event.key !== "Tab" || !modalRef.current) return;
            const odaklanabilirler = [...modalRef.current.querySelectorAll(
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
        };
        document.addEventListener("keydown", klavye);
        return () => {
            document.body.style.overflow = oncekiOverflow;
            document.removeEventListener("keydown", klavye);
        };
    }, [onKapat, yukleniyor]);

    const yenidenAdlandirma = tur === "yeniden-adlandir";
    const gecerli = !yenidenAdlandirma || (baslik.trim().length >= 1 && baslik.trim().length <= 100);

    return (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-[2px]" role="presentation" onMouseDown={(event) => {
            if (event.target === event.currentTarget && !yukleniyor) onKapat();
        }}>
            <div
                ref={modalRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="sohbet-modal-baslik"
                className={`w-full max-w-md rounded-2xl border p-5 shadow-2xl sm:p-6 ${isDark ? "border-[#33415C] bg-[#111B2F]" : "border-[#E2E0E9] bg-white"}`}
            >
                <div className="flex items-start gap-3">
                    {!yenidenAdlandirma && (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-500/10 text-red-500">
                            <ExclamationTriangleIcon className="h-5 w-5" />
                        </div>
                    )}
                    <div className="min-w-0 flex-1">
                        <h2 id="sohbet-modal-baslik" className={`text-lg font-bold ${isDark ? "text-white" : "text-[#0F172A]"}`}>
                            {yenidenAdlandirma ? "Sohbeti yeniden adlandır" : "Sohbeti sil"}
                        </h2>
                        {!yenidenAdlandirma && (
                            <p className={`mt-1.5 text-sm leading-6 ${isDark ? "text-[#A7B0C2]" : "text-[#64748B]"}`}>
                                “{sohbet?.baslik}” ve tüm mesajları kalıcı olarak silinecek. Bu işlem geri alınamaz.
                            </p>
                        )}
                    </div>
                    <button type="button" onClick={onKapat} disabled={yukleniyor} aria-label="Pencereyi kapat" className={`rounded-lg p-1.5 ${isDark ? "text-[#8F9BB2] hover:bg-white/5" : "text-[#64748B] hover:bg-slate-100"}`}>
                        <XMarkIcon className="h-5 w-5" />
                    </button>
                </div>

                {yenidenAdlandirma && (
                    <form className="mt-5" onSubmit={(event) => {
                        event.preventDefault();
                        if (gecerli && !yukleniyor) onOnayla(baslik.trim());
                    }}>
                        <label htmlFor="sohbet-basligi" className={`mb-2 block text-[13px] font-semibold ${isDark ? "text-[#CAD3E3]" : "text-[#334155]"}`}>
                            Sohbet başlığı
                        </label>
                        <input
                            id="sohbet-basligi"
                            ref={ilkOdakRef}
                            value={baslik}
                            onChange={(event) => setBaslik(event.target.value)}
                            maxLength={100}
                            className={`h-11 w-full rounded-xl border px-3 text-sm outline-none ring-indigo-500/20 focus:border-indigo-500 focus:ring-4 ${isDark ? "border-[#33415C] bg-[#0C1424] text-white" : "border-[#D8D5E2] bg-white text-[#0F172A]"}`}
                        />
                        <p className={`mt-1.5 text-right text-[11px] ${isDark ? "text-[#7F8AA3]" : "text-[#94A3B8]"}`}>{baslik.trim().length}/100</p>
                    </form>
                )}

                {hata && <p role="alert" className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-[13px] text-red-500">{hata}</p>}

                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" onClick={onKapat} disabled={yukleniyor} className={`h-10 rounded-xl px-4 text-sm font-semibold ${isDark ? "text-[#CAD3E3] hover:bg-white/5" : "text-[#475569] hover:bg-slate-100"}`}>
                        Vazgeç
                    </button>
                    <button
                        ref={yenidenAdlandirma ? undefined : ilkOdakRef}
                        type={yenidenAdlandirma ? "submit" : "button"}
                        onClick={yenidenAdlandirma ? () => onOnayla(baslik.trim()) : () => onOnayla()}
                        disabled={!gecerli || yukleniyor}
                        className={`h-10 rounded-xl px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-60 ${yenidenAdlandirma ? "bg-[#4F46E5] hover:bg-[#4338CA]" : "bg-red-500 hover:bg-red-600"}`}
                    >
                        {yukleniyor ? "İşleniyor..." : yenidenAdlandirma ? "Kaydet" : "Sohbeti Sil"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SohbetIslemModal;

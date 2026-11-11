import { useEffect, useRef } from "react";
import { ArrowPathIcon } from "@heroicons/react/24/outline";

export default function SilmeGostergesi({ isDark, materyal = false }) {
    const ref = useRef(null);
    useEffect(() => {
        const oncekiOdak = document.activeElement;
        const oncekiOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        ref.current?.focus({ preventScroll: true });
        const klavye = event => {
            if (["Tab", "Escape"].includes(event.key)) {
                event.preventDefault();
                event.stopPropagation();
                ref.current?.focus({ preventScroll: true });
            }
        };
        document.addEventListener("keydown", klavye, true);
        return () => {
            document.body.style.overflow = oncekiOverflow;
            document.removeEventListener("keydown", klavye, true);
            if (oncekiOdak?.isConnected) oncekiOdak.focus({ preventScroll: true });
        };
    }, []);

    return <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
        <section ref={ref} role="dialog" aria-modal="true" aria-labelledby="silme-gostergesi-baslik" tabIndex={-1}
            className={`w-full max-w-sm rounded-2xl border p-8 text-center shadow-2xl outline-none ${isDark ? "border-[#26334A] bg-[#162137] text-[#F8FAFC]" : "border-[#E7E5EF] bg-white text-[#0F172A]"}`}>
            <div className={`mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl ${isDark ? "bg-indigo-400/10 text-indigo-300" : "bg-indigo-50 text-[#4F46E5]"}`}>
                <ArrowPathIcon aria-hidden="true" className="h-7 w-7 motion-safe:animate-spin" />
            </div>
            <h2 id="silme-gostergesi-baslik" role="status" className="text-[22px] font-bold">{materyal ? "Materyal Siliniyor..." : "Ders Siliniyor..."}</h2>
            <p className={`mt-3 text-[13px] leading-6 ${isDark ? "text-[#A7B0C2]" : "text-[#64748B]"}`}>İşlemin tamamlanması bekleniyor.</p>
        </section>
    </div>;
}

import { ArrowPathIcon, CheckIcon, ClockIcon, ExclamationCircleIcon } from "@heroicons/react/24/outline";

const renkler = {
    hazir: {
        acik: "border-emerald-200 bg-emerald-50 text-emerald-800",
        koyu: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
        Icon: CheckIcon,
    },
    isleniyor: {
        acik: "border-indigo-200 bg-indigo-50 text-indigo-700",
        koyu: "border-indigo-400/25 bg-indigo-400/10 text-indigo-300",
        Icon: ArrowPathIcon,
    },
    hata: {
        acik: "border-red-200 bg-red-50 text-red-700",
        koyu: "border-red-400/25 bg-red-400/10 text-red-300",
        Icon: ExclamationCircleIcon,
    },
    bekliyor: {
        acik: "border-slate-200 bg-slate-50 text-slate-600",
        koyu: "border-[#33415C] bg-[#1B2942] text-[#A7B0C2]",
        Icon: ClockIcon,
    },
};

export default function DersDurumRozeti({ durum, baslik, isDark, detay }) {
    const renk = renkler[durum] || renkler.bekliyor;
    const Icon = renk.Icon;
    return (
        <div className={`flex min-w-0 items-start gap-2.5 border ${detay ? "rounded-xl p-3.5" : "rounded-full px-3 py-1.5"} ${isDark ? renk.koyu : renk.acik}`}>
            <Icon aria-hidden="true" className={`shrink-0 ${detay ? "mt-0.5 h-5 w-5" : "h-4 w-4"} ${durum === "isleniyor" ? "motion-safe:animate-spin" : ""}`} />
            <div className="min-w-0">
                <p className={`${detay ? "text-[13px]" : "text-[12px]"} font-semibold leading-5`}>{baslik}</p>
                {detay && <p className="mt-1 break-words text-[12px] leading-5">{detay}</p>}
            </div>
        </div>
    );
}

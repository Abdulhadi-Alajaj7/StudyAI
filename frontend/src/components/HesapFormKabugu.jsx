import { Link } from "react-router-dom";
import { ArrowLeftIcon, BookOpenIcon, LockClosedIcon } from "@heroicons/react/24/outline";

export default function HesapFormKabugu({ baslik, aciklama, children }) {
    return <main className="flex min-h-screen items-center justify-center bg-[#F7F9FC] px-6 py-10 text-[#0F172A]">
        <div className="w-full max-w-[460px]">
            <div className="mb-8 flex items-center justify-center gap-3"><div className="flex h-11 w-11 items-center justify-center rounded-[10px] bg-[#0B1739]"><BookOpenIcon className="h-6 w-6 text-white" /></div>
                <div><p className="text-[22px] font-bold text-[#0B1739]">StudyAI</p><p className="text-sm text-[#64748B]">Akıllı Öğrenme Platformu</p></div></div>
            <div className="rounded-2xl border border-[#E2E8F0] bg-white p-7 sm:p-9">
                <div className="mb-6 flex h-12 w-12 items-center justify-center rounded-xl bg-[#EFF6FF]"><LockClosedIcon className="h-6 w-6 text-[#2563EB]" /></div>
                <h1 className="text-[28px] font-semibold tracking-tight">{baslik}</h1><p className="mt-3 text-[15px] leading-6 text-[#64748B]">{aciklama}</p>
                {children}<Link to="/" className="mt-6 flex items-center justify-center gap-2 text-sm font-semibold text-[#64748B] hover:text-[#2563EB]"><ArrowLeftIcon className="h-4 w-4" />Giriş sayfasına dön</Link>
            </div>
        </div>
    </main>;
}

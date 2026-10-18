import { useEffect, useState } from "react";
import {
    NavLink,
    Outlet,
    useNavigate,
    useOutletContext,
    useParams,
} from "react-router-dom";
import {
    AcademicCapIcon,
    BeakerIcon,
    BookOpenIcon,
    ChatBubbleLeftRightIcon,
    CircleStackIcon,
    ClipboardDocumentCheckIcon,
    CodeBracketIcon,
    ComputerDesktopIcon,
    DocumentTextIcon,
    ListBulletIcon,
    PencilSquareIcon,
    RectangleStackIcon,
    Squares2X2Icon,
    CalculatorIcon,
} from "@heroicons/react/24/outline";

import api from "../api";
import { dersDetayTablari, dersDetayYolu } from "../utils/dersDetayYollari.mjs";

const simgeler = {
    book: BookOpenIcon,
    desktop: ComputerDesktopIcon,
    code: CodeBracketIcon,
    database: CircleStackIcon,
    calc: CalculatorIcon,
    science: BeakerIcon,
};

const tabSimgeleri = {
    "genel-bakis": Squares2X2Icon,
    konular: ListBulletIcon,
    ozet: DocumentTextIcon,
    sohbet: ChatBubbleLeftRightIcon,
    testler: ClipboardDocumentCheckIcon,
    "calisma-kartlari": RectangleStackIcon,
};

const renkler = {
    indigo: "bg-indigo-500/10 text-indigo-500",
    cyan: "bg-cyan-500/10 text-cyan-500",
    emerald: "bg-emerald-500/10 text-emerald-500",
    amber: "bg-amber-500/10 text-amber-500",
    rose: "bg-rose-500/10 text-rose-500",
};

function DersDetayLayout() {
    const { isDark } = useOutletContext();
    const { dersId } = useParams();
    const navigate = useNavigate();
    const [ders, setDers] = useState(null);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [hata, setHata] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        const dersiGetir = async () => {
            setYukleniyor(true);
            setHata("");
            try {
                const yanit = await api.get(`/dersler/${dersId}`, {
                    withCredentials: true,
                    signal: controller.signal,
                });
                setDers(yanit.data.ders);
            } catch (istekHatasi) {
                if (istekHatasi.code === "ERR_CANCELED") return;
                setHata(
                    istekHatasi.response?.data?.hata ||
                    "Ders bilgileri yüklenirken bir hata oluştu."
                );
            } finally {
                if (!controller.signal.aborted) setYukleniyor(false);
            }
        };

        dersiGetir();
        return () => controller.abort();
    }, [dersId]);

    const metinAna = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const metinIkincil = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    const kenarlik = isDark ? "border-[#26334A]" : "border-[#E7E5EF]";
    const Icon = simgeler[ders?.simge] || AcademicCapIcon;
    const iconRengi = renkler[ders?.renk] || renkler.indigo;
    const altBilgiler = [ders?.dersKodu, ders?.donem].filter(Boolean);

    if (yukleniyor) {
        return (
            <div className="max-w-[1440px] mx-auto animate-pulse" aria-label="Ders yükleniyor">
                <div className={`h-40 rounded-2xl border ${kenarlik} ${isDark ? "bg-[#10192C]" : "bg-white"}`} />
            </div>
        );
    }

    if (hata || !ders) {
        return (
            <div className="max-w-[1440px] mx-auto">
                <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
                    <p className="text-[15px] font-medium text-red-500">{hata || "Ders bulunamadı."}</p>
                    <button
                        type="button"
                        onClick={() => navigate("/panel/dersler")}
                        className="mt-4 rounded-xl bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#4338CA]"
                    >
                        Derslerime Dön
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-[1440px] mx-auto pb-10">
            <header className={`mb-7 border-b ${kenarlik}`}>
                <div className="flex flex-col gap-5 pb-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-4">
                        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl ${iconRengi}`}>
                            <Icon className="h-7 w-7" />
                        </div>

                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-3">
                                <h1 className={`text-[26px] font-bold tracking-tight sm:text-[32px] ${metinAna}`}>
                                    {ders.dersAdi}
                                </h1>
                                <span
                                    className={`rounded-full border px-3 py-1 text-[11px] font-semibold ${
                                        isDark
                                            ? "border-indigo-400/30 bg-indigo-500/10 text-indigo-300"
                                            : "border-indigo-200 bg-indigo-50 text-[#4F46E5]"
                                    }`}
                                >
                                    Genel Hâkimiyet: Veri yok
                                </span>
                            </div>

                            {altBilgiler.length > 0 && (
                                <p className={`mt-1.5 text-[14px] sm:text-[15px] ${metinIkincil}`}>
                                    {altBilgiler.join(" · ")}
                                </p>
                            )}
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => navigate("/panel/dersler", {
                            state: { duzenlenecekDersId: ders._id },
                        })}
                        className={`inline-flex h-11 shrink-0 items-center justify-center gap-2 self-start rounded-xl border px-4 text-[14px] font-semibold transition-colors sm:self-center ${
                            isDark
                                ? "border-[#33415C] text-[#F8FAFC] hover:bg-[#162137]"
                                : "border-[#D8D5E2] text-[#0F172A] hover:bg-[#F8F7FC]"
                        }`}
                    >
                        <PencilSquareIcon className="h-5 w-5" />
                        Dersi Düzenle
                    </button>
                </div>

                <nav aria-label="Ders bölümleri" className="-mb-px overflow-x-auto">
                    <div className="flex min-w-max gap-1 sm:gap-3">
                        {dersDetayTablari.map((tab) => {
                            const TabIcon = tabSimgeleri[tab.anahtar];
                            return (
                                <NavLink
                                    key={tab.anahtar}
                                    to={dersDetayYolu(dersId, tab.segment)}
                                    end={!tab.segment}
                                    className={({ isActive }) => `
                                        relative inline-flex h-12 items-center gap-2 px-3 text-[13px] font-semibold transition-colors sm:px-4 sm:text-[14px]
                                        ${isActive
                                            ? "text-[#5B5CE2] after:absolute after:inset-x-2 after:bottom-0 after:h-0.5 after:rounded-full after:bg-[#5B5CE2]"
                                            : `${metinIkincil} hover:text-[#5B5CE2]`
                                        }
                                    `}
                                >
                                    <TabIcon className="h-[19px] w-[19px]" />
                                    {tab.etiket}
                                </NavLink>
                            );
                        })}
                    </div>
                </nav>
            </header>

            <Outlet context={{ isDark, ders }} />
        </div>
    );
}

export default DersDetayLayout;

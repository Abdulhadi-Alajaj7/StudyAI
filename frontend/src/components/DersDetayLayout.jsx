import { useEffect, useRef, useState } from "react";
import {
    NavLink,
    Outlet,
    useLocation,
    useNavigate,
    useOutletContext,
    useParams,
} from "react-router-dom";
import {
    ChatBubbleLeftRightIcon,
    ClipboardDocumentCheckIcon,
    DocumentTextIcon,
    ListBulletIcon,
    PencilSquareIcon,
    RectangleStackIcon,
    Squares2X2Icon,
} from "@heroicons/react/24/outline";

import api from "../api";
import DersGorunumSimgesi from "./DersGorunumSimgesi";
import {
    dersDetayTablari,
    dersDetayYolu,
    dersDuzenlemeYolu,
    gecerliDersKimligiMi,
} from "../utils/dersDetayYollari.mjs";

const tabSimgeleri = {
    "genel-bakis": Squares2X2Icon,
    konular: ListBulletIcon,
    ozet: DocumentTextIcon,
    sohbet: ChatBubbleLeftRightIcon,
    testler: ClipboardDocumentCheckIcon,
    "calisma-kartlari": RectangleStackIcon,
};

function DersDetayLayout() {
    const { isDark } = useOutletContext();
    const { dersId } = useParams();
    const navigate = useNavigate();
    const location = useLocation();
    const gecisDersi = String(location.state?.ders?._id || "") === dersId
        ? location.state.ders
        : null;
    const locationStateRef = useRef(location.state);
    locationStateRef.current = location.state;
    const [ders, setDers] = useState(gecisDersi);
    const [yukleniyor, setYukleniyor] = useState(!gecisDersi);
    const [hata, setHata] = useState("");

    useEffect(() => {
        const controller = new AbortController();

        const dersiGetir = async () => {
            if (!gecerliDersKimligiMi(dersId)) {
                setDers(null);
                setHata("Geçersiz ders bağlantısı.");
                setYukleniyor(false);
                return;
            }

            const gecistekiDers = String(locationStateRef.current?.ders?._id || "") === dersId
                ? locationStateRef.current.ders
                : null;
            if (gecistekiDers) setDers(gecistekiDers);
            setYukleniyor(!gecistekiDers);
            setHata("");
            try {
                const yanit = await api.get(`/dersler/${dersId}`, {
                    withCredentials: true,
                    signal: controller.signal,
                });
                if (!yanit.data.ders) {
                    setDers(null);
                    setHata("Ders bulunamadı.");
                    return;
                }
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
    const altBilgiler = [ders?.dersKodu, ders?.donem].filter(Boolean);

    if (yukleniyor) {
        return (
            <div
                className="mx-auto flex min-h-[420px] max-w-[1440px] items-center justify-center"
                role="status"
                aria-live="polite"
            >
                <div className="flex flex-col items-center gap-3 text-center">
                    <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#4F46E5]/20 border-t-[#4F46E5]" />
                    <p className={`text-[14px] font-medium ${metinIkincil}`}>Ders bilgileri yükleniyor...</p>
                </div>
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
                <div className="flex flex-col gap-4 pb-5 sm:flex-row sm:items-center sm:justify-between sm:gap-5 sm:pb-6">
                    <div className="flex min-w-0 items-start gap-3 sm:gap-4">
                        <DersGorunumSimgesi
                            renk={ders.renk}
                            simge={ders.simge}
                            isDark={isDark}
                            className="h-12 w-12 sm:h-14 sm:w-14"
                            iconClassName="h-6 w-6 sm:h-7 sm:w-7"
                        />

                        <div className="min-w-0">
                            <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
                                <h1 className={`max-w-full break-words text-[23px] font-bold leading-tight tracking-tight sm:text-[32px] ${metinAna}`}>
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
                        onClick={() => navigate(dersDuzenlemeYolu(ders._id, "detay"))}
                        className={`inline-flex h-11 w-full shrink-0 items-center justify-center gap-2 rounded-xl border px-4 text-[14px] font-semibold transition-colors sm:w-auto ${
                            isDark
                                ? "border-[#33415C] text-[#F8FAFC] hover:bg-[#162137]"
                                : "border-[#D8D5E2] text-[#0F172A] hover:bg-[#F8F7FC]"
                        }`}
                    >
                        <PencilSquareIcon className="h-5 w-5" />
                        Dersi Düzenle
                    </button>
                </div>

                <nav aria-label="Ders bölümleri" className="pb-4 lg:-mb-px lg:pb-0">
                    <div className="grid grid-cols-3 gap-2 lg:flex lg:gap-3">
                        {dersDetayTablari.map((tab) => {
                            const TabIcon = tabSimgeleri[tab.anahtar];
                            return (
                                <NavLink
                                    key={tab.anahtar}
                                    to={dersDetayYolu(dersId, tab.segment)}
                                    end={!tab.segment}
                                    className={({ isActive }) => `
                                        relative inline-flex min-h-[68px] min-w-0 flex-col items-center justify-center gap-1 rounded-xl border px-1.5 py-2 text-center text-[11px] font-semibold leading-tight transition-colors sm:px-3 sm:text-[13px]
                                        lg:h-12 lg:min-h-0 lg:flex-row lg:justify-start lg:gap-2 lg:rounded-none lg:border-0 lg:bg-transparent lg:px-4 lg:py-0 lg:text-[14px]
                                        ${isActive
                                            ? `${isDark ? "border-indigo-400/40 bg-indigo-500/10" : "border-indigo-200 bg-indigo-50"} text-[#5B5CE2] lg:after:absolute lg:after:inset-x-2 lg:after:bottom-0 lg:after:h-0.5 lg:after:rounded-full lg:after:bg-[#5B5CE2]`
                                            : `${kenarlik} ${isDark ? "bg-[#10192C]" : "bg-white"} ${metinIkincil} hover:border-[#5B5CE2]/40 hover:text-[#5B5CE2] lg:bg-transparent`
                                        }
                                    `}
                                >
                                    <TabIcon className="h-5 w-5 shrink-0 lg:h-[19px] lg:w-[19px]" />
                                    <span className="max-w-full whitespace-normal break-words">{tab.etiket}</span>
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

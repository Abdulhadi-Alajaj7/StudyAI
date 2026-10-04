import { NavLink, Outlet } from "react-router-dom";
import {
    AcademicCapIcon,
    Bars3Icon,
    BookOpenIcon,
    CalendarDaysIcon,
    ChartBarIcon,
    HomeIcon,
    UserCircleIcon,
} from "@heroicons/react/24/outline";

const menu = [
    {
        isim: "Kontrol Paneli",
        yol: "/panel",
        icon: HomeIcon,
        end: true,
    },
    {
        isim: "Derslerim",
        yol: "/panel/dersler",
        icon: AcademicCapIcon,
    },
    {
        isim: "Çalışma Planı",
        yol: "/panel/calisma-plani",
        icon: CalendarDaysIcon,
    },
    {
        isim: "İlerleme",
        yol: "/panel/ilerleme",
        icon: ChartBarIcon,
    },
    {
        isim: "Profil",
        yol: "/panel/profil",
        icon: UserCircleIcon,
    },
];

function PanelLayout() {
    return (
        <div className="min-h-screen bg-[#F7F9FC] text-[#0F172A]">

            {/* Sidebar */}
            <aside className="fixed left-0 top-0 hidden lg:flex h-screen w-[260px] flex-col bg-[#0B1739]">

                {/* Logo */}
                <div className="h-[76px] flex items-center px-6 border-b border-white/10">
                    <div className="w-10 h-10 rounded-[10px] bg-white/10 flex items-center justify-center">
                        <BookOpenIcon className="w-6 h-6 text-white" />
                    </div>

                    <div className="ml-3">
                        <p className="text-[20px] font-bold text-white">
                            StudyAI
                        </p>

                        <p className="text-[12px] text-slate-400">
                            Akıllı Öğrenme
                        </p>
                    </div>
                </div>

                {/* Menü */}
                <nav className="flex-1 px-3 py-6 space-y-1">
                    {menu.map((item) => {
                        const Icon = item.icon;

                        return (
                            <NavLink
                                key={item.yol}
                                to={item.yol}
                                end={item.end}
                                className={({ isActive }) =>
                                    `flex items-center gap-3 px-4 h-[46px] rounded-[9px] text-[14px] font-medium transition ${isActive
                                        ? "bg-[#2563EB] text-white"
                                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                                    }`
                                }
                            >
                                <Icon className="w-5 h-5" />
                                {item.isim}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Alt Profil */}
                <div className="p-4 border-t border-white/10">
                    <div className="flex items-center gap-3 p-2">
                        <div className="w-10 h-10 rounded-full bg-[#2563EB] flex items-center justify-center text-white font-semibold">
                            S
                        </div>

                        <div className="min-w-0">
                            <p className="text-[14px] font-semibold text-white truncate">
                                StudyAI Kullanıcısı
                            </p>

                            <p className="text-[12px] text-slate-400 truncate">
                                Öğrenci
                            </p>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Ana Alan */}
            <div className="lg:ml-[260px]">

                {/* Topbar */}
                <header className="h-[76px] sticky top-0 z-30 bg-white/95 border-b border-[#E2E8F0] flex items-center justify-between px-5 sm:px-8 lg:px-10">

                    <button
                        type="button"
                        className="lg:hidden w-10 h-10 flex items-center justify-center rounded-lg border border-[#E2E8F0]"
                    >
                        <Bars3Icon className="w-6 h-6" />
                    </button>

                    <div className="hidden lg:block">
                        <p className="text-[14px] text-[#64748B]">
                            StudyAI
                        </p>
                    </div>

                    <div className="flex items-center gap-3 ml-auto">
                        <div className="text-right hidden sm:block">
                            <p className="text-[14px] font-semibold text-[#0F172A]">
                                StudyAI Kullanıcısı
                            </p>

                            <p className="text-[12px] text-[#64748B]">
                                Hesabım
                            </p>
                        </div>

                        <div className="w-10 h-10 rounded-full bg-[#EFF6FF] flex items-center justify-center">
                            <UserCircleIcon className="w-6 h-6 text-[#2563EB]" />
                        </div>
                    </div>
                </header>

                {/* Sayfalar */}
                <div className="px-5 py-7 sm:px-8 lg:px-10 lg:py-9">
                    <Outlet />
                </div>
            </div>
        </div>
    );
}

export default PanelLayout;
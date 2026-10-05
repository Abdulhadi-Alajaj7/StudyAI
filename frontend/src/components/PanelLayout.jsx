import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import axios from "axios";

import {
    AcademicCapIcon,
    Bars3Icon,
    CalendarDaysIcon,
    ChartBarIcon,
    HomeIcon,
    UserCircleIcon,
    SparklesIcon,
    MoonIcon,
    SunIcon,
    BellIcon,
    MagnifyingGlassIcon,
    ExclamationCircleIcon,
    CheckBadgeIcon,
    ChevronDownIcon,
    ChevronLeftIcon,
    ChevronRightIcon,
    ArrowRightStartOnRectangleIcon
} from "@heroicons/react/24/outline";

const menu = [
    { isim: "Kontrol Paneli", yol: "/panel", icon: HomeIcon, end: true },
    { isim: "Derslerim", yol: "/panel/dersler", icon: AcademicCapIcon },
    { isim: "Çalışma Planım", yol: "/panel/calisma-plani", icon: CalendarDaysIcon },
    { isim: "Yanlışlarım", yol: "/panel/yanlislarim", icon: ExclamationCircleIcon },
    { isim: "Sınavlarım", yol: "/panel/sinavlarim", icon: CheckBadgeIcon },
    { isim: "İlerleme", yol: "/panel/ilerleme", icon: ChartBarIcon },
    { isim: "Profil", yol: "/panel/profil", icon: UserCircleIcon },
];

function PanelLayout() {
    const [isDark, setIsDark] = useState(false);
    const [profilMenuAcik, setProfilMenuAcik] = useState(false);
    const [sidebarAcik, setSidebarAcik] = useState(true);

    const navigate = useNavigate();

    const cikisYap = async () => {
        try {
            await axios.post(
                "http://localhost:5000/auth/cikis",
                {},
                {
                    withCredentials: true,
                }
            );

            navigate("/", { replace: true });
        } catch (error) {
            console.error("Çıkış yapılırken hata oluştu:", error);
        }
    };

    // Theme
    const themeBg = isDark ? "bg-[#080D18]" : "bg-[#F8F7FC]";
    const themeText = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const sidebarBg = isDark ? "bg-[#10192C]" : "bg-[#FFFFFF]";
    const sidebarBorder = isDark ? "border-[#26334A]" : "border-[#E7E5EF]";
    const topbarBg = isDark ? "bg-[#0F182A]" : "bg-white";
    const topbarBorder = isDark ? "border-[#26334A]" : "border-[#E7E5EF]";

    return (
        <div
            className={`min-h-screen ${themeBg} ${themeText} transition-colors duration-200`}
        >

            {/* Sidebar */}
            <aside
                className={`
                    fixed left-0 top-0 hidden lg:flex h-screen
                    ${sidebarAcik ? "w-[260px]" : "w-[80px]"}
                    flex-col
                    ${sidebarBg}
                    border-r ${sidebarBorder}
                    transition-[width] duration-300 ease-in-out
                    z-40
                `}
            >

                {/* Logo */}
                <div
                    className={`
                        h-[80px] flex items-center
                        border-b ${sidebarBorder}
                        transition-all duration-300
                        ${sidebarAcik ? "px-6" : "px-3 justify-center"}
                    `}
                >
                    {sidebarAcik ? (
                        <div
                            className={`
                                ${isDark ? "bg-white/10" : "bg-transparent"}
                                px-3 py-2 rounded-[12px]
                                flex items-center justify-start w-full
                            `}
                        >
                            <img
                                src="/images/studyai-logo.png"
                                alt="StudyAI Logo"
                                className="object-contain h-auto w-[200px]"
                            />
                        </div>
                    ) : (
                        <div
                            className={`
                                w-[46px] h-[46px]
                                flex items-center justify-center
                                rounded-[12px]
                                overflow-hidden
                                ${isDark ? "bg-white/10" : "bg-transparent"}
                            `}
                        >
                            <AcademicCapIcon
                                className={`w-7 h-7 ${
                                    isDark
                                        ? "text-[#818CF8]"
                                        : "text-[#4F46E5]"
                                }`}
                            />
                        </div>
                    )}
                </div>

                {/* Menu */}
                <nav
                    className={`
                        flex-1 py-6 space-y-1.5 overflow-y-auto
                        transition-all duration-300
                        ${sidebarAcik ? "px-4" : "px-3"}
                    `}
                >
                    {menu.map((item) => {
                        const Icon = item.icon;

                        return (
                            <NavLink
                                key={item.yol}
                                to={item.yol}
                                end={item.end}
                                title={!sidebarAcik ? item.isim : undefined}
                                className={({ isActive }) =>
                                    `
                                    flex items-center h-[52px]
                                    rounded-[10px]
                                    text-[16px] font-medium
                                    transition-colors

                                    ${
                                        sidebarAcik
                                            ? "gap-3.5 px-4"
                                            : "justify-center px-0"
                                    }

                                    ${
                                        isActive
                                            ? isDark
                                                ? "bg-[#4F46E5] text-white shadow-md shadow-[#4F46E5]/20"
                                                : "bg-[#EEF2FF] text-[#4F46E5]"
                                            : isDark
                                                ? "text-[#A7B0C2] hover:bg-[#162137] hover:text-[#F8FAFC]"
                                                : "text-[#64748B] hover:bg-[#F8F7FC] hover:text-[#0F172A]"
                                    }
                                    `
                                }
                            >
                                <Icon className="w-[22px] h-[22px] shrink-0" />

                                {sidebarAcik && (
                                    <span className="whitespace-nowrap">
                                        {item.isim}
                                    </span>
                                )}
                            </NavLink>
                        );
                    })}
                </nav>

                {/* Assistant Card */}
                <div
                    className={`
                        mt-auto
                        transition-all duration-300
                        ${sidebarAcik ? "p-5" : "p-3"}
                    `}
                >
                    {sidebarAcik ? (
                        <div
                            className={`
                                ${
                                    isDark
                                        ? "bg-[#162137] border-[#26334A]"
                                        : "bg-[#F8F7FC] border-[#E7E5EF]"
                                }
                                border rounded-[14px] p-4
                                relative overflow-hidden
                                transition-colors duration-200
                            `}
                        >
                            <div
                                className={`
                                    flex items-center gap-2
                                    font-semibold text-[14px]
                                    mb-2 relative z-10
                                    ${
                                        isDark
                                            ? "text-[#06B6D4]"
                                            : "text-[#4F46E5]"
                                    }
                                `}
                            >
                                <SparklesIcon className="w-5 h-5" />
                                StudyAI Asistanı
                            </div>

                            <p
                                className={`
                                    text-[13px] leading-relaxed relative z-10
                                    ${
                                        isDark
                                            ? "text-[#A7B0C2]"
                                            : "text-[#64748B]"
                                    }
                                `}
                            >
                                Öğrenme sürecin için kişisel öneriler hazır.
                            </p>
                        </div>
                    ) : (
                        <button
                            type="button"
                            title="StudyAI Asistanı"
                            className={`
                                w-full h-[52px]
                                rounded-[12px]
                                border
                                flex items-center justify-center
                                transition-colors

                                ${
                                    isDark
                                        ? "bg-[#162137] border-[#26334A] text-[#06B6D4] hover:bg-[#1B2942]"
                                        : "bg-[#F8F7FC] border-[#E7E5EF] text-[#4F46E5] hover:bg-[#EEF2FF]"
                                }
                            `}
                        >
                            <SparklesIcon className="w-[22px] h-[22px]" />
                        </button>
                    )}
                </div>
            </aside>


            {/* Sidebar Toggle Button */}
            <button
                type="button"
                onClick={() => setSidebarAcik(!sidebarAcik)}
                aria-label={sidebarAcik ? "Menüyü daralt" : "Menüyü genişlet"}
                title={sidebarAcik ? "Menüyü daralt" : "Menüyü genişlet"}
                className={`
                    hidden lg:flex
                    fixed top-[24px]
                    z-50
                    w-[32px] h-[32px]
                    items-center justify-center
                    rounded-full
                    border
                    shadow-sm
                    transition-all duration-300 ease-in-out

                    ${
                        sidebarAcik
                            ? "left-[244px]"
                            : "left-[64px]"
                    }

                    ${
                        isDark
                            ? "bg-[#10192C] border-[#26334A] text-[#A7B0C2] hover:bg-[#162137] hover:text-white"
                            : "bg-white border-[#E7E5EF] text-[#64748B] hover:bg-[#F8F7FC] hover:text-[#4F46E5]"
                    }
                `}
            >
                {sidebarAcik ? (
                    <ChevronLeftIcon className="w-[17px] h-[17px]" />
                ) : (
                    <ChevronRightIcon className="w-[17px] h-[17px]" />
                )}
            </button>


            {/* Main Area */}
            <div
                className={`
                    flex flex-col min-h-screen
                    transition-[margin] duration-300 ease-in-out

                    ${
                        sidebarAcik
                            ? "lg:ml-[260px]"
                            : "lg:ml-[80px]"
                    }
                `}
            >

                {/* Topbar */}
                <header
                    className={`
                        h-[80px]
                        sticky top-0 z-30
                        ${topbarBg}
                        border-b ${topbarBorder}
                        flex items-center justify-between
                        px-6 sm:px-8 lg:px-10
                        transition-colors duration-200
                    `}
                >

                    {/* Mobile Menu Button */}
                    <button
                        type="button"
                        className={`
                            lg:hidden
                            w-10 h-10
                            flex items-center justify-center
                            rounded-lg border

                            ${
                                isDark
                                    ? "border-[#26334A] text-[#A7B0C2]"
                                    : "border-[#E7E5EF] text-[#64748B]"
                            }
                        `}
                    >
                        <Bars3Icon className="w-6 h-6" />
                    </button>


                    {/* Search */}
                    <div className="hidden lg:flex flex-1 items-center">
                        <div className="relative w-full max-w-[420px]">

                            <MagnifyingGlassIcon
                                className={`
                                    absolute left-3.5 top-1/2
                                    -translate-y-1/2
                                    w-5 h-5

                                    ${
                                        isDark
                                            ? "text-[#7F8AA3]"
                                            : "text-[#94A3B8]"
                                    }
                                `}
                            />

                            <input
                                type="text"
                                placeholder="Ders, konu veya soru ara..."
                                className={`
                                    w-full h-[44px]
                                    pl-10 pr-4
                                    rounded-[10px]
                                    text-[15px]
                                    outline-none
                                    transition-colors

                                    ${
                                        isDark
                                            ? "bg-[#162137] border border-[#26334A] text-white placeholder:text-[#7F8AA3] focus:border-[#4F46E5]"
                                            : "bg-[#F8F7FC] border border-[#E7E5EF] text-[#0F172A] placeholder:text-[#94A3B8] focus:border-[#4F46E5]"
                                    }
                                `}
                            />
                        </div>
                    </div>


                    {/* Right Actions */}
                    <div className="flex items-center gap-3 sm:gap-4 ml-auto">

                        {/* Theme */}
                        <button
                            type="button"
                            onClick={() => setIsDark(!isDark)}
                            className={`
                                w-10 h-10
                                rounded-full
                                flex items-center justify-center
                                transition-colors

                                ${
                                    isDark
                                        ? "hover:bg-[#162137] text-[#A7B0C2]"
                                        : "hover:bg-[#F8F7FC] text-[#64748B]"
                                }
                            `}
                            aria-label="Tema Değiştir"
                        >
                            {isDark ? (
                                <SunIcon className="w-[22px] h-[22px]" />
                            ) : (
                                <MoonIcon className="w-[22px] h-[22px]" />
                            )}
                        </button>


                        {/* Notification */}
                        <button
                            type="button"
                            className={`
                                relative
                                w-10 h-10
                                rounded-full
                                flex items-center justify-center
                                transition-colors

                                ${
                                    isDark
                                        ? "hover:bg-[#162137] text-[#A7B0C2]"
                                        : "hover:bg-[#F8F7FC] text-[#64748B]"
                                }
                            `}
                        >
                            <BellIcon className="w-[22px] h-[22px]" />

                            <span
                                className={`
                                    absolute top-2.5 right-2.5
                                    w-2 h-2
                                    rounded-full
                                    bg-[#EF4444]
                                    border-2

                                    ${
                                        isDark
                                            ? "border-[#0F182A]"
                                            : "border-white"
                                    }
                                `}
                            />
                        </button>


                        {/* Separator */}
                        <div
                            className={`
                                w-[1px] h-8 mx-1 sm:mx-2

                                ${
                                    isDark
                                        ? "bg-[#26334A]"
                                        : "bg-[#E7E5EF]"
                                }
                            `}
                        />


                        {/* User Menu */}
                        <div className="relative">

                            {/* User Button */}
                            <button
                                type="button"
                                onClick={() =>
                                    setProfilMenuAcik(!profilMenuAcik)
                                }
                                className={`
                                    flex items-center gap-3
                                    rounded-[10px]
                                    px-2 py-1.5
                                    transition-colors

                                    ${
                                        isDark
                                            ? "hover:bg-[#162137]"
                                            : "hover:bg-[#F8F7FC]"
                                    }
                                `}
                            >

                                {/* Avatar */}
                                <div
                                    className="
                                        w-[44px] h-[44px]
                                        rounded-full
                                        bg-[#4F46E5]
                                        flex items-center justify-center
                                        text-white
                                        text-[16px]
                                        font-bold
                                    "
                                >
                                    AY
                                </div>


                                {/* User Info */}
                                <div className="hidden sm:block text-left">
                                    <p
                                        className={`
                                            text-[15px] font-semibold

                                            ${
                                                isDark
                                                    ? "text-white"
                                                    : "text-[#0F172A]"
                                            }
                                        `}
                                    >
                                        Ahmet Yılmaz
                                    </p>

                                    <p
                                        className={`
                                            text-[13px]

                                            ${
                                                isDark
                                                    ? "text-[#7F8AA3]"
                                                    : "text-[#64748B]"
                                            }
                                        `}
                                    >
                                        Öğrenci
                                    </p>
                                </div>


                                {/* Dropdown Arrow */}
                                <ChevronDownIcon
                                    className={`
                                        hidden sm:block
                                        w-4 h-4
                                        transition-transform duration-200

                                        ${
                                            profilMenuAcik
                                                ? "rotate-180"
                                                : ""
                                        }

                                        ${
                                            isDark
                                                ? "text-[#7F8AA3]"
                                                : "text-[#94A3B8]"
                                        }
                                    `}
                                />
                            </button>


                            {/* Dropdown */}
                            {profilMenuAcik && (
                                <div
                                    className={`
                                        absolute right-0 top-[58px]
                                        w-[190px]
                                        rounded-[12px]
                                        border
                                        p-2
                                        shadow-lg
                                        z-50

                                        ${
                                            isDark
                                                ? "bg-[#10192C] border-[#26334A]"
                                                : "bg-white border-[#E7E5EF]"
                                        }
                                    `}
                                >

                                    {/* Logout */}
                                    <button
                                        type="button"
                                        onClick={cikisYap}
                                        className={`
                                            w-full h-[44px]
                                            flex items-center gap-3
                                            px-3
                                            rounded-[8px]
                                            text-[14px]
                                            font-medium
                                            transition-colors

                                            ${
                                                isDark
                                                    ? "text-[#F87171] hover:bg-[#162137]"
                                                    : "text-[#DC2626] hover:bg-[#FEF2F2]"
                                            }
                                        `}
                                    >
                                        <ArrowRightStartOnRectangleIcon className="w-5 h-5" />
                                        Çıkış Yap
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </header>


                {/* Page Content */}
                <div className="flex-1 px-4 sm:px-6 lg:px-10 py-8 pb-20">
                    <Outlet context={{ isDark }} />
                </div>

            </div>
        </div>
    );
}

export default PanelLayout;
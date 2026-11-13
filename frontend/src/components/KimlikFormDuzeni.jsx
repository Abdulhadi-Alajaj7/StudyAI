import { Link } from "react-router-dom";
import { ArrowLeftIcon, BookOpenIcon, ChartBarIcon, LockClosedIcon, SparklesIcon } from "@heroicons/react/24/outline";

export default function KimlikFormDuzeni({ baslik, aciklama, children }) {
    return <main className="min-h-screen w-full flex bg-white text-[#0F172A]">
            {/* SOL PANEL */}
            <section className="hidden lg:flex lg:w-1/2 flex-col justify-between bg-[#F7F9FC] px-12 xl:px-24 py-12 relative overflow-hidden border-r border-[#E2E8F0]">

                {/* ARKA PLAN */}
                <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-[#F7F9FC] to-[#F1F5F9] z-0 pointer-events-none" />

                {/* SOL PANEL ANA İÇERİK */}
                <div className="relative z-10 flex flex-col items-center w-full">

                    {/* LOGO */}
                    <header className="w-full">
                        <img
                            src="/images/studyai-logo.png"
                            alt="StudyAI Logo"
                            className="object-contain h-auto w-[210px]"
                        />
                    </header>

                    {/* BAŞLIK + AÇIKLAMA + DIAGRAM */}
                    <div className="mt-16 xl:mt-20 w-full max-w-[480px]">

                        <h1 className="text-[44px] xl:text-[52px] leading-[1.1] font-bold text-[#0F172A] tracking-tight">
                            Daha akıllı çalış.
                            <br />
                            <span className="text-[#2563EB]">
                                Daha iyi öğren.
                            </span>
                        </h1>

                        <p className="mt-6 text-[17px] leading-relaxed text-[#64748B] max-w-[480px]">
                            Yapay zekâ destekli kişiselleştirilmiş öğrenme deneyimiyle
                            çalışma sürecini düzenle, gelişimini takip et ve sana uygun
                            öğrenme araçlarını kullan.
                        </p>

                        {/* DIAGRAM */}
                        <div className="mt-14 w-full max-w-[480px] aspect-[4/3] bg-white rounded-[20px] border border-[#E2E8F0] shadow-sm flex items-center justify-center relative">

                            {/* BAĞLANTI ÇİZGİLERİ */}
                            <svg
                                className="absolute inset-0 w-full h-full text-[#E2E8F0] z-0"
                                style={{ strokeDasharray: "6 6" }}
                            >
                                <line
                                    x1="50%"
                                    y1="50%"
                                    x2="22%"
                                    y2="28%"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                />

                                <line
                                    x1="50%"
                                    y1="50%"
                                    x2="78%"
                                    y2="28%"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                />

                                <line
                                    x1="50%"
                                    y1="50%"
                                    x2="22%"
                                    y2="72%"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                />

                                <line
                                    x1="50%"
                                    y1="50%"
                                    x2="78%"
                                    y2="72%"
                                    stroke="currentColor"
                                    strokeWidth="2"
                                />
                            </svg>

                            {/* YAPAY ZEKÂ */}
                            <div className="relative z-10 w-[90px] h-[90px] rounded-[20px] bg-[#2563EB] text-white flex flex-col items-center justify-center shadow-lg shadow-[#2563EB]/20">
                                <SparklesIcon className="w-8 h-8 mb-1.5" />

                                <span className="text-[13px] font-semibold">
                                    Yapay Zekâ
                                </span>
                            </div>

                            {/* DERSLER */}
                            <div className="absolute z-10 top-[18%] left-[12%] bg-white border border-[#E2E8F0] rounded-[12px] px-3.5 py-2.5 flex items-center gap-2.5 shadow-sm">
                                <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] flex items-center justify-center">
                                    <BookOpenIcon className="w-4 h-4 text-[#2563EB]" />
                                </div>

                                <span className="text-[14px] font-semibold text-[#0F172A]">
                                    Dersler
                                </span>
                            </div>

                            {/* MATERYALLER */}
                            <div className="absolute z-10 top-[18%] right-[12%] bg-white border border-[#E2E8F0] rounded-[12px] px-3.5 py-2.5 flex items-center gap-2.5 shadow-sm">
                                <div className="w-7 h-7 rounded-lg bg-[#ECFEFF] flex items-center justify-center">
                                    <svg
                                        className="w-4 h-4 text-[#06B6D4]"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M12 16V4m0 0L8 8m4-4 4 4M5 15v4h14v-4"
                                        />
                                    </svg>
                                </div>

                                <span className="text-[14px] font-semibold text-[#0F172A]">
                                    Materyaller
                                </span>
                            </div>

                            {/* TESTLER */}
                            <div className="absolute z-10 bottom-[18%] left-[12%] bg-white border border-[#E2E8F0] rounded-[12px] px-3.5 py-2.5 flex items-center gap-2.5 shadow-sm">
                                <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] flex items-center justify-center">
                                    <svg
                                        className="w-4 h-4 text-[#2563EB]"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M9 11l2 2 4-4m-6 8a9 9 0 110-18 9 9 0 010 18z"
                                        />
                                    </svg>
                                </div>

                                <span className="text-[14px] font-semibold text-[#0F172A]">
                                    Testler
                                </span>
                            </div>

                            {/* GELİŞİM */}
                            <div className="absolute z-10 bottom-[18%] right-[12%] bg-white border border-[#E2E8F0] rounded-[12px] px-3.5 py-2.5 flex items-center gap-2.5 shadow-sm">
                                <div className="w-7 h-7 rounded-lg bg-[#EFF6FF] flex items-center justify-center">
                                    <ChartBarIcon className="w-4 h-4 text-[#2563EB]" />
                                </div>

                                <span className="text-[14px] font-semibold text-[#0F172A]">
                                    Gelişim
                                </span>
                            </div>

                        </div>
                    </div>
                </div>

                {/* ALT ÖZELLİKLER */}
                <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 mt-12">

                    <div className="flex items-center gap-2.5 bg-white px-4 py-2.5 rounded-full border border-[#E2E8F0] shadow-sm">
                        <div className="w-2 h-2 rounded-full bg-[#2563EB]" />

                        <span className="text-[14.5px] font-medium text-[#0F172A]">
                            Akıllı Analiz
                        </span>
                    </div>

                    <div className="flex items-center gap-2.5 bg-white px-4 py-2.5 rounded-full border border-[#E2E8F0] shadow-sm">
                        <div className="w-2 h-2 rounded-full bg-[#06B6D4]" />

                        <span className="text-[14.5px] font-medium text-[#0F172A]">
                            Kişisel Çalışma Planı
                        </span>
                    </div>

                    <div className="flex items-center gap-2.5 bg-white px-4 py-2.5 rounded-full border border-[#E2E8F0] shadow-sm">
                        <div className="w-2 h-2 rounded-full bg-[#3B82F6]" />

                        <span className="text-[14.5px] font-medium text-[#0F172A]">
                            Adaptif Öğrenme
                        </span>
                    </div>

                </div>

            </section>

        <section className="w-full lg:w-1/2 relative bg-white px-6 sm:px-12 md:px-20 lg:px-24">
            <div className="lg:hidden absolute top-8 left-6 sm:left-12">
                <img src="/images/studyai-logo.png" alt="StudyAI Logo" className="object-contain h-auto w-[180px]" />
            </div>
            <div className="min-h-screen w-full flex items-center justify-center py-32 lg:py-12">
                <div className="w-full max-w-[480px]">
                    <h2 className="text-[36px] lg:text-[40px] leading-tight font-bold tracking-tight text-[#0F172A]">{baslik}</h2>
                    <p className="text-[16px] leading-relaxed text-[#64748B] mt-3">{aciklama}</p>
                    {children}
                    <Link to="/" className="mt-7 flex items-center justify-center gap-2 text-[15px] font-semibold text-[#2563EB] hover:underline">
                        <ArrowLeftIcon className="h-4 w-4" />Giriş sayfasına dön
                    </Link>
                    <div className="mt-16 pt-6 border-t border-[#E2E8F0] flex flex-col sm:flex-row justify-between items-center gap-4 text-[14px] text-[#94A3B8]">
                        <span className="flex items-center gap-1.5"><LockClosedIcon className="w-4 h-4" />Güvenli hesap erişimi</span>
                        <span>© 2026 StudyAI</span>
                    </div>
                </div>
            </div>
        </section>
    </main>;
}

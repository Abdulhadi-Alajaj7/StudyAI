import {
    AcademicCapIcon,
    ArrowRightIcon,
    CalendarDaysIcon,
    ChartBarIcon,
    SparklesIcon,
} from "@heroicons/react/24/outline";

function KontrolPaneli() {
    return (
        <div className="max-w-[1400px] mx-auto">

            {/* Başlık */}
            <div>
                <p className="text-[14px] font-semibold text-[#2563EB]">
                    Kontrol Paneli
                </p>

                <h1 className="mt-1 text-[30px] lg:text-[34px] font-semibold tracking-tight text-[#0F172A]">
                    Tekrar hoş geldin
                </h1>

                <p className="mt-2 text-[16px] text-[#64748B]">
                    Derslerini ve öğrenme sürecini buradan takip edebilirsin.
                </p>
            </div>

            {/* Hızlı Alanlar */}
            <div className="grid md:grid-cols-3 gap-4 mt-8">

                <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-5">
                    <div className="w-10 h-10 rounded-[10px] bg-[#EFF6FF] flex items-center justify-center">
                        <AcademicCapIcon className="w-5 h-5 text-[#2563EB]" />
                    </div>

                    <p className="mt-5 text-[14px] text-[#64748B]">
                        Dersler
                    </p>

                    <p className="mt-1 text-[20px] font-semibold text-[#0F172A]">
                        Derslerini yönet
                    </p>

                    <button className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-[#2563EB]">
                        Derslere git
                        <ArrowRightIcon className="w-4 h-4" />
                    </button>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-5">
                    <div className="w-10 h-10 rounded-[10px] bg-[#EFF6FF] flex items-center justify-center">
                        <CalendarDaysIcon className="w-5 h-5 text-[#2563EB]" />
                    </div>

                    <p className="mt-5 text-[14px] text-[#64748B]">
                        Çalışma
                    </p>

                    <p className="mt-1 text-[20px] font-semibold text-[#0F172A]">
                        Planını görüntüle
                    </p>

                    <button className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-[#2563EB]">
                        Planı aç
                        <ArrowRightIcon className="w-4 h-4" />
                    </button>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-[14px] p-5">
                    <div className="w-10 h-10 rounded-[10px] bg-[#ECFEFF] flex items-center justify-center">
                        <ChartBarIcon className="w-5 h-5 text-[#06B6D4]" />
                    </div>

                    <p className="mt-5 text-[14px] text-[#64748B]">
                        İlerleme
                    </p>

                    <p className="mt-1 text-[20px] font-semibold text-[#0F172A]">
                        Gelişimini incele
                    </p>

                    <button className="mt-4 flex items-center gap-2 text-[14px] font-semibold text-[#2563EB]">
                        Analizi aç
                        <ArrowRightIcon className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Ana İçerik */}
            <div className="grid xl:grid-cols-[1.5fr_1fr] gap-5 mt-5">

                {/* Dersler */}
                <section className="bg-white border border-[#E2E8F0] rounded-[14px] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h2 className="text-[20px] font-semibold text-[#0F172A]">
                                Derslerin
                            </h2>

                            <p className="text-[14px] text-[#64748B] mt-1">
                                Çalışmaya devam etmek istediğin dersi seç.
                            </p>
                        </div>
                    </div>

                    <div className="mt-8 py-10 text-center">
                        <AcademicCapIcon className="w-10 h-10 text-[#94A3B8] mx-auto" />

                        <p className="mt-4 text-[16px] font-semibold text-[#0F172A]">
                            Derslerin burada görünecek
                        </p>

                        <p className="text-[14px] text-[#64748B] mt-2">
                            İlk dersini oluşturduğunda buradan hızlıca erişebilirsin.
                        </p>
                    </div>
                </section>

                {/* StudyAI */}
                <section className="bg-[#0B1739] rounded-[14px] p-6 text-white relative overflow-hidden">
                    <div className="absolute -right-16 -top-16 w-48 h-48 rounded-full bg-[#06B6D4]/10" />

                    <div className="relative">
                        <div className="w-10 h-10 rounded-[10px] bg-white/10 flex items-center justify-center">
                            <SparklesIcon className="w-5 h-5 text-[#67E8F9]" />
                        </div>

                        <h2 className="mt-5 text-[20px] font-semibold">
                            StudyAI
                        </h2>

                        <p className="mt-2 text-[14px] leading-6 text-slate-300">
                            Ders ve çalışma verilerin oluştukça kişiselleştirilmiş
                            önerilerini burada göreceksin.
                        </p>

                        <div className="mt-6 pt-5 border-t border-white/10">
                            <p className="text-[13px] text-slate-400">
                                Öğrenme verileri oluştukça aktifleşir.
                            </p>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

export default KontrolPaneli;
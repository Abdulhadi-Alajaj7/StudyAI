import { useOutletContext } from "react-router-dom";
import {
    ArrowRightIcon,
    ArrowTrendingUpIcon,
    CalendarDaysIcon,
    SparklesIcon,
    ExclamationTriangleIcon,
    BookOpenIcon,
    ChartBarIcon,
    CheckCircleIcon
} from "@heroicons/react/24/outline";

function KontrolPaneli() {
    const { isDark } = useOutletContext();

    // Theme values matching exact specification
    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#111827]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    const textMuted = isDark ? "text-[#7F8AA3]" : "text-[#94A3B8]";
    
    return (
        <div className="max-w-[1440px] mx-auto">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                <div>
                    <h1 className={`text-[34px] lg:text-[38px] font-bold tracking-tight ${textPrimary} flex items-center gap-2`}>
                        Günaydın, Ahmet 
                        <span className="inline-block origin-bottom-right hover:rotate-12 transition-transform cursor-default">👋</span>
                    </h1>
                    <p className={`mt-1.5 text-[16px] ${textSecondary}`}>
                        Bugünkü öğrenme planın ve gelişimin burada.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button className={`px-5 h-[48px] rounded-[10px] font-semibold text-[15px] border transition-colors ${isDark ? 'border-[#26334A] text-[#F8FAFC] hover:bg-[#101A2D]' : 'border-[#E7E5EF] text-[#111827] hover:bg-[#F8F7FC]'}`}>
                        Derslerime Git
                    </button>
                    <button className="px-6 h-[48px] rounded-[10px] font-semibold text-[15px] bg-[#4F46E5] text-white hover:bg-[#4338CA] flex items-center gap-2 transition-colors">
                        Çalışmaya Başla
                        <ArrowRightIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Top Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-8">
                
                {/* Genel Başarı */}
                <div className={`p-6 rounded-[20px] border ${cardBg}`}>
                    <div className="flex items-start justify-between">
                        <p className={`text-[13px] font-semibold tracking-wide uppercase ${textMuted}`}>
                            Genel Başarı
                        </p>
                        <div className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#10B981]/15 text-[#10B981] text-[13px] font-bold">
                            <ArrowTrendingUpIcon className="w-4 h-4" />
                            +%6 bu hafta
                        </div>
                    </div>
                    <div className={`mt-3 text-[42px] font-bold ${textPrimary}`}>
                        %72
                    </div>
                    <div className={`mt-5 w-full h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-[#101A2D]' : 'bg-[#EEF2FF]'}`}>
                        <div className="h-full bg-[#4F46E5] rounded-full" style={{ width: '72%' }}></div>
                    </div>
                </div>

                {/* Haftalık Gelişim */}
                <div className={`p-6 rounded-[20px] border ${cardBg}`}>
                    <div className="flex items-start justify-between">
                        <p className={`text-[13px] font-semibold tracking-wide uppercase ${textMuted}`}>
                            Haftalık Gelişim
                        </p>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isDark ? 'bg-[#101A2D]' : 'bg-[#EEF2FF]'}`}>
                            <ChartBarIcon className="w-4 h-4 text-[#4F46E5]" />
                        </div>
                    </div>
                    <div className={`mt-3 text-[42px] font-bold ${textPrimary}`}>
                        +%8
                    </div>
                    <div className={`mt-2.5 text-[14px] ${textSecondary}`}>
                        Geçen haftaya göre
                    </div>
                </div>

                {/* En Güçlü Konu */}
                <div className={`p-6 rounded-[20px] border ${cardBg}`}>
                    <div className="flex items-start justify-between">
                        <p className={`text-[13px] font-semibold tracking-wide uppercase ${textMuted}`}>
                            En Güçlü Konu
                        </p>
                        <div className="px-3 py-1.5 rounded-full bg-[#10B981]/15 text-[#10B981] text-[13px] font-bold">
                            %88 hakimiyet
                        </div>
                    </div>
                    <div className={`mt-4 text-[22px] leading-tight font-bold ${textPrimary}`}>
                        İşlemler
                    </div>
                    <div className={`mt-1.5 text-[14px] ${textSecondary}`}>
                        İşletim Sistemleri
                    </div>
                </div>

                {/* En Zayıf Konu */}
                <div className={`p-6 rounded-[20px] border ${cardBg}`}>
                    <div className="flex items-start justify-between">
                        <p className={`text-[13px] font-semibold tracking-wide uppercase ${textMuted}`}>
                            En Zayıf Konu
                        </p>
                        <div className="px-3 py-1.5 rounded-full bg-[#F59E0B]/15 text-[#F59E0B] text-[13px] font-bold">
                            %32 hakimiyet
                        </div>
                    </div>
                    <div className={`mt-4 text-[22px] leading-tight font-bold ${textPrimary}`}>
                        Sanal Bellek
                    </div>
                    <div className="mt-2 flex items-center gap-1.5 text-[#EF4444] text-[13px] font-semibold">
                        <ExclamationTriangleIcon className="w-4 h-4" />
                        Öncelikli çalışma tavsiye edilir
                    </div>
                </div>

            </div>

            {/* Main Grid Area */}
            <div className="grid xl:grid-cols-[1.8fr_1fr] gap-6 mt-6">
                
                {/* Bugünkü Çalışma Planı */}
                <div className={`p-7 rounded-[20px] border flex flex-col ${cardBg}`}>
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-2">
                        <div>
                            <h2 className={`text-[22px] lg:text-[24px] font-bold ${textPrimary}`}>
                                Bugünkü Çalışma Planı
                            </h2>
                            <p className={`text-[15px] mt-1 ${textSecondary}`}>
                                Performansına ve yaklaşan sınavlarına göre hazırlandı.
                            </p>
                        </div>
                        <div className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[13px] font-bold self-start ${isDark ? 'bg-[#4F46E5]/20 text-[#4F46E5]' : 'bg-[#EEF2FF] text-[#4F46E5]'}`}>
                            <SparklesIcon className="w-4.5 h-4.5" />
                            Yapay zekâ destekli plan
                        </div>
                    </div>

                    <div className="mt-8 space-y-4 flex-1">
                        
                        {/* Task Card 1 */}
                        <div className={`p-5 lg:p-6 rounded-[16px] border ${isDark ? 'border-[#26334A] bg-[#101A2D]' : 'border-[#FCA5A5] bg-white'}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-3">
                                        <h3 className={`text-[18px] font-bold ${textPrimary}`}>Sanal Bellek</h3>
                                        <span className="px-2.5 py-1 rounded-md bg-[#FEE2E2] text-[#DC2626] text-[12px] font-bold uppercase tracking-wide">Yüksek Öncelik</span>
                                    </div>
                                    <p className={`text-[14px] ${textSecondary}`}>
                                        Hakimiyet %32 <span className="mx-1.5">•</span> Sınava 5 gün
                                    </p>
                                </div>
                                <button className="px-6 h-[44px] rounded-[10px] font-semibold text-[14px] bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors w-full sm:w-auto">
                                    Çalışmaya Başla
                                </button>
                            </div>
                            
                            <div className="mt-6 space-y-3">
                                {['Konu özetini incele', '8 çalışma kartını tekrar et', '5 adaptif soru çöz'].map(task => (
                                    <div key={task} className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded border ${isDark ? 'border-[#26334A]' : 'border-[#E7E5EF]'}`}></div>
                                        <span className={`text-[15px] ${textPrimary}`}>{task}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                        
                        {/* Task Card 2 */}
                        <div className={`p-5 lg:p-6 rounded-[16px] border ${isDark ? 'border-[#26334A] bg-transparent' : 'border-[#E7E5EF] bg-[#F8F7FC]'}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-3">
                                        <h3 className={`text-[18px] font-bold ${textPrimary}`}>Kilitlenme</h3>
                                        <span className="px-2.5 py-1 rounded-md bg-[#FEF3C7] text-[#D97706] text-[12px] font-bold uppercase tracking-wide">Orta Öncelik</span>
                                    </div>
                                    <p className={`text-[14px] ${textSecondary}`}>Hakimiyet %57</p>
                                </div>
                                <button className={`px-6 h-[44px] rounded-[10px] font-semibold text-[14px] border transition-colors w-full sm:w-auto ${isDark ? 'border-[#26334A] text-[#F8FAFC] hover:bg-[#101A2D]' : 'border-[#E7E5EF] text-[#111827] bg-white hover:bg-[#F8F7FC]'}`}>
                                    İncele
                                </button>
                            </div>
                            
                            <div className="mt-6 space-y-3">
                                {['5 soru çöz', '3 yanlış soruyu tekrar incele'].map(task => (
                                    <div key={task} className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded border ${isDark ? 'border-[#26334A]' : 'border-[#E7E5EF] bg-white'}`}></div>
                                        <span className={`text-[15px] ${textPrimary}`}>{task}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Task Card 3 */}
                        <div className={`p-5 lg:p-6 rounded-[16px] border ${isDark ? 'border-[#26334A] bg-transparent' : 'border-[#E7E5EF] bg-[#F8F7FC]'}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-3">
                                        <h3 className={`text-[18px] font-bold ${textPrimary}`}>İşlemler</h3>
                                        <span className={`px-2.5 py-1 rounded-md text-[12px] font-bold uppercase tracking-wide ${isDark ? 'bg-[#101A2D] text-[#A7B0C2]' : 'bg-[#E7E5EF] text-[#64748B]'}`}>Düşük Öncelik</span>
                                    </div>
                                    <p className={`text-[14px] ${textSecondary}`}>Hakimiyet %89</p>
                                </div>
                                <button className={`px-6 h-[44px] rounded-[10px] font-semibold text-[14px] border transition-colors w-full sm:w-auto ${isDark ? 'border-[#26334A] text-[#F8FAFC] hover:bg-[#101A2D]' : 'border-[#E7E5EF] text-[#111827] bg-white hover:bg-[#F8F7FC]'}`}>
                                    Tekrar Et
                                </button>
                            </div>
                            
                            <div className="mt-6 space-y-3">
                                <div className="flex items-center gap-3">
                                    <div className={`w-5 h-5 rounded border ${isDark ? 'border-[#26334A]' : 'border-[#E7E5EF] bg-white'}`}></div>
                                    <span className={`text-[15px] ${textPrimary}`}>3 çalışma kartını tekrar et</span>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Right Side Cards */}
                <div className="flex flex-col gap-6">
                    
                    {/* Yaklaşan Sınav */}
                    <div className={`p-7 rounded-[20px] border ${cardBg}`}>
                        <div className="flex items-center justify-between mb-5">
                            <p className={`text-[13px] font-semibold tracking-wide uppercase ${textMuted}`}>YAKLAŞAN SINAV</p>
                            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#FEF3C7] text-[#D97706] text-[13px] font-bold">
                                <CalendarDaysIcon className="w-4.5 h-4.5" />
                                5 gün kaldı
                            </div>
                        </div>
                        <h3 className={`text-[22px] lg:text-[24px] font-bold ${textPrimary}`}>
                            İşletim Sistemleri
                        </h3>
                        <p className={`text-[15px] mt-2 ${textSecondary}`}>
                            <span className="font-semibold text-[#4F46E5]">Vize Sınavı</span> <span className="mx-1.5">•</span> 20 Kasım Çarşamba
                        </p>
                        
                        <div className={`mt-6 pt-6 border-t ${isDark ? 'border-[#26334A]' : 'border-[#E7E5EF]'} flex items-center justify-between`}>
                            <span className={`text-[14px] ${textSecondary}`}>
                                Hazırlık: <strong className={`font-bold ml-1 ${textPrimary}`}>%68</strong>
                            </span>
                            <button className={`px-5 h-[40px] rounded-[10px] font-semibold text-[14px] border transition-colors ${isDark ? 'border-[#26334A] text-[#F8FAFC] hover:bg-[#101A2D]' : 'border-[#E7E5EF] text-[#111827] hover:bg-[#F8F7FC]'}`}>
                                Sınavı Görüntüle
                            </button>
                        </div>
                    </div>

                    {/* Bugün Tekrar Edilecek */}
                    <div className={`p-7 rounded-[20px] border flex-1 flex flex-col ${cardBg}`}>
                        <p className={`text-[13px] font-semibold tracking-wide uppercase ${textMuted} mb-2`}>
                            BUGÜN TEKRAR EDİLECEK
                        </p>
                        <h3 className={`text-[36px] font-bold ${textPrimary}`}>
                            18 Çalışma Kartı
                        </h3>
                        <p className={`text-[15px] mt-1 ${textSecondary}`}>
                            Tekrar zamanı gelen kartların hazır.
                        </p>
                        
                        <div className="mt-8 space-y-4 flex-1">
                            {[
                                { n: 'İşletim Sistemleri', c: 8 },
                                { n: 'Veri Yapıları', c: 6 },
                                { n: 'Bilgisayar Organizasyonu', c: 4 },
                            ].map(item => (
                                <div key={item.n} className="flex items-center justify-between">
                                    <span className={`text-[15px] ${textPrimary}`}>
                                        {item.n}
                                    </span>
                                    <span className={`w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-bold ${isDark ? 'bg-[#101A2D] text-[#F8FAFC]' : 'bg-[#F8F7FC] text-[#64748B]'}`}>
                                        {item.c}
                                    </span>
                                </div>
                            ))}
                        </div>

                        <button className="w-full mt-8 h-[48px] rounded-[10px] font-semibold text-[15px] bg-[#4F46E5] text-white hover:bg-[#4338CA] transition-colors">
                            Tekrara Başla
                        </button>
                    </div>
                </div>
            </div>

            {/* Analytics Lower Area */}
            <div className="grid xl:grid-cols-[1fr_1fr] gap-6 mt-6 pb-10">
                
                {/* Öğrenme Gelişimi */}
                <div className={`p-7 rounded-[20px] border flex flex-col ${cardBg}`}>
                    <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-4">
                        <div>
                            <h3 className={`text-[22px] font-bold ${textPrimary}`}>Öğrenme Gelişimi</h3>
                            <div className="flex items-center gap-1.5 mt-1.5 text-[#10B981] text-[14px] font-semibold">
                                <ArrowTrendingUpIcon className="w-4 h-4" />
                                Bu hafta %6 gelişme gösterdin.
                            </div>
                        </div>
                        <div className={`flex items-center p-1 rounded-xl self-start ${isDark ? 'bg-[#101A2D]' : 'bg-[#F8F7FC]'}`}>
                            <button className="px-5 py-2 rounded-[10px] bg-[#4F46E5] text-white text-[13px] font-bold shadow-sm">7 Gün</button>
                            <button className={`px-5 py-2 rounded-[10px] text-[13px] font-semibold transition-colors ${isDark ? 'text-[#A7B0C2] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#111827]'}`}>30 Gün</button>
                            <button className={`px-5 py-2 rounded-[10px] text-[13px] font-semibold transition-colors ${isDark ? 'text-[#A7B0C2] hover:text-[#F8FAFC]' : 'text-[#64748B] hover:text-[#111827]'}`}>3 Ay</button>
                        </div>
                    </div>

                    <div className="mt-8 flex-1 min-h-[220px] relative flex items-end">
                        <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                            <defs>
                                <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#4F46E5" stopOpacity="0.4"/>
                                    <stop offset="100%" stopColor="#4F46E5" stopOpacity="0"/>
                                </linearGradient>
                            </defs>
                            <path d="M0,80 Q25,75 50,55 T100,20 L100,100 L0,100 Z" fill="url(#chartGrad)"/>
                            <path d="M0,80 Q25,75 50,55 T100,20" fill="none" stroke="#4F46E5" strokeWidth="3" strokeLinecap="round" />
                            <circle cx="100" cy="20" r="4.5" fill="#06B6D4" stroke={isDark ? "#162137" : "white"} strokeWidth="2" />
                            <circle cx="0" cy="80" r="4.5" fill="#4F46E5" stroke={isDark ? "#162137" : "white"} strokeWidth="2" />
                        </svg>
                        <div className="absolute left-0 right-0 bottom-0 flex justify-between px-1 translate-y-6">
                            {['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'].map(day => (
                                <span key={day} className={`text-[13px] ${textMuted}`}>{day}</span>
                            ))}
                            <span className={`text-[13px] font-bold ${textPrimary}`}>Paz (Bugün)</span>
                        </div>
                    </div>
                </div>

                {/* Konu Durumu */}
                <div className={`p-7 rounded-[20px] border ${cardBg}`}>
                    <div className="flex items-center justify-between mb-8">
                        <div>
                            <h3 className={`text-[22px] font-bold ${textPrimary}`}>Konu Durumu</h3>
                            <p className={`text-[15px] mt-1 ${textSecondary}`}>İşletim Sistemleri Dersi</p>
                        </div>
                        <button className={`text-[14px] font-semibold text-[#4F46E5] hover:underline flex items-center gap-1.5`}>
                            Tüm Analizi Gör <ArrowRightIcon className="w-4 h-4"/>
                        </button>
                    </div>

                    <div className="space-y-6">
                        {[
                            { name: 'İşlemler', val: 88, color: 'bg-[#10B981]' },
                            { name: 'İşlem Zamanlama', val: 76, color: 'bg-[#8B5CF6]' },
                            { name: 'Kilitlenme', val: 64, color: 'bg-[#4F46E5]' },
                            { name: 'Bellek Yönetimi', val: 43, color: 'bg-[#F59E0B]' },
                            { name: 'Sanal Bellek', val: 32, color: 'bg-[#EF4444]' },
                        ].map(item => (
                            <div key={item.name}>
                                <div className="flex justify-between text-[14px] mb-2">
                                    <span className={`font-semibold ${textPrimary}`}>{item.name}</span>
                                    <span className={`font-bold ${textPrimary}`}>%{item.val}</span>
                                </div>
                                <div className={`w-full h-2.5 rounded-full overflow-hidden ${isDark ? 'bg-[#101A2D]' : 'bg-[#EEF2FF]'}`}>
                                    <div className={`h-full rounded-full ${item.color}`} style={{ width: `${item.val}%` }}></div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

            </div>
        </div>
    );
}

export default KontrolPaneli;
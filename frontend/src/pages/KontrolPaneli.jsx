import { useOutletContext, Link } from "react-router-dom";
import {
    ChartBarIcon
} from "@heroicons/react/24/outline";

function KontrolPaneli() {
    const { isDark, kullanici } = useOutletContext();

    const gorunenIsim = kullanici?.kullaniciAdi || "Kullanıcı";

    // Theme values matching exact specification
    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#111827]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    
    return (
        <div className="max-w-[1440px] mx-auto">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8">
                <div>
                    <h1 className={`text-[34px] lg:text-[38px] font-bold tracking-tight ${textPrimary} flex items-center gap-2`}>
                        Hoş geldin, {gorunenIsim} 
                        <span className="inline-block origin-bottom-right hover:rotate-12 transition-transform cursor-default">👋</span>
                    </h1>
                    <p className={`mt-1.5 text-[16px] ${textSecondary}`}>
                        Öğrenme alanına hoş geldin.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <Link 
                        to="/panel/dersler" 
                        className={`flex items-center justify-center px-5 h-[48px] rounded-[10px] font-semibold text-[15px] border transition-colors ${isDark ? 'border-[#26334A] text-[#F8FAFC] hover:bg-[#101A2D]' : 'border-[#E7E5EF] text-[#111827] hover:bg-[#F8F7FC]'}`}
                    >
                        Derslerime Git
                    </Link>
                </div>
            </div>

            {/* Empty State */}
            <div className={`mt-8 p-10 rounded-[20px] border flex flex-col items-center justify-center text-center ${cardBg}`}>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mb-5 ${isDark ? 'bg-[#101A2D]' : 'bg-[#EEF2FF]'}`}>
                    <ChartBarIcon className="w-8 h-8 text-[#4F46E5]" />
                </div>
                <h2 className={`text-[22px] font-bold ${textPrimary} mb-2`}>
                    Henüz analiz verisi yok
                </h2>
                <p className={`text-[16px] max-w-md ${textSecondary}`}>
                    Derslerini ve öğrenme materyallerini ekledikçe gelişimin burada görüntülenecek.
                </p>
            </div>

        </div>
    );
}

export default KontrolPaneli;
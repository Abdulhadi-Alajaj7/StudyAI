import React from "react";
import { CheckIcon } from "@heroicons/react/24/outline";

function DersOlusturmaAdimlari({ aktifAdim, isDark }) {
    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    
    // Active colors
    const activeCircleBg = "bg-[#4F46E5] text-white";
    
    // Completed colors
    const completedCircleBg = isDark ? "bg-[#10B981]/20 text-[#10B981]" : "bg-[#10B981]/10 text-[#10B981]";
    
    // Inactive colors
    const inactiveCircleBg = isDark ? "bg-[#1B2942] text-[#7F8AA3]" : "bg-[#F1F5F9] text-[#94A3B8]";
    const inactiveText = isDark ? "text-[#7F8AA3]" : "text-[#94A3B8]";

    const adimlar = [
        { no: 1, baslik: "1. Ders Bilgileri", aciklama: "Temel tanım ve görsel kimlik" },
        { no: 2, baslik: "2. Materyal Ekle", aciklama: "Slayt, PDF ve ders notları" },
        { no: 3, baslik: "3. Hazır", aciklama: "Ders kullanıma hazır" },
    ];

    return (
        <div className="flex flex-col md:flex-row items-center gap-4 mb-8">
            {adimlar.map((adim) => {
                const durum = adim.no < aktifAdim ? "tamamlandi" : adim.no === aktifAdim ? "aktif" : "pasif";
                
                // Card styling per state
                let cardStyle = "";
                let circleStyle = "";
                let textTitleStyle = "";
                let textSubStyle = "";

                if (durum === "aktif") {
                    cardStyle = isDark ? "bg-[#162137] border-[#4F46E5]" : "bg-white border-[#4F46E5] shadow-sm";
                    circleStyle = "bg-[#4F46E5] text-white";
                    textTitleStyle = isDark ? "text-white" : "text-[#0F172A]";
                    textSubStyle = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
                } else if (durum === "tamamlandi") {
                    cardStyle = isDark ? "bg-[#10192C] border-[#26334A]" : "bg-[#F8F7FC] border-[#E7E5EF]";
                    circleStyle = isDark ? "bg-[#4F46E5]/20 text-[#818CF8]" : "bg-[#4F46E5]/10 text-[#4F46E5]";
                    textTitleStyle = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
                    textSubStyle = isDark ? "text-[#7F8AA3]" : "text-[#94A3B8]";
                } else {
                    cardStyle = isDark ? "bg-[#10192C] border-[#26334A]" : "bg-[#F8F7FC] border-[#E7E5EF]";
                    circleStyle = isDark ? "bg-[#1B2942] text-[#7F8AA3]" : "bg-[#F1F5F9] text-[#94A3B8]";
                    textTitleStyle = isDark ? "text-[#7F8AA3]" : "text-[#94A3B8]";
                    textSubStyle = isDark ? "text-[#475569] opacity-50" : "text-[#94A3B8] opacity-70";
                }

                return (
                    <div key={adim.no} className={`flex-1 w-full flex items-center gap-4 p-4 rounded-xl border ${cardStyle} transition-all`}>
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 text-[15px] font-bold ${circleStyle}`}>
                            {durum === "tamamlandi" ? <CheckIcon className="w-5 h-5" /> : adim.no}
                        </div>
                        <div className="flex flex-col">
                            <span className={`text-[15px] font-bold ${textTitleStyle} flex items-center gap-2`}>
                                {adim.baslik}
                                {durum === "tamamlandi" && (
                                    <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-500/10 text-[#4F46E5] font-bold tracking-wider">Tamamlandı</span>
                                )}
                            </span>
                            <span className={`text-[13px] ${textSubStyle}`}>{adim.aciklama}</span>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

export default DersOlusturmaAdimlari;

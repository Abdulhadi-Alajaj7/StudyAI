import React from "react";
import { 
    BookOpenIcon, 
    EllipsisVerticalIcon,
    PencilSquareIcon,
    TrashIcon,
    ArrowRightIcon
} from "@heroicons/react/24/outline";
import DersGorunumSimgesi from "./DersGorunumSimgesi";
import { dersRengiGetir } from "../utils/dersGorunumu";

function DersKarti({ 
    ders, 
    isDark, 
    isMenuOpen, 
    onToggleMenu, 
    onEdit, 
    onDelete, 
    onClick 
}) {
    if (!ders) return null;

    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    
    const renkSiniflari = dersRengiGetir(ders.renk);
    const iconColor = isDark ? renkSiniflari.metinKoyu : renkSiniflari.metin;

    return (
        <div className={`flex flex-col p-6 rounded-2xl border ${cardBg} transition-colors relative`}>
            {/* Card Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                    <DersGorunumSimgesi renk={ders.renk} simge={ders.simge} isDark={isDark} />
                    <div>
                        <div className="flex gap-1.5 mb-1">
                            {ders.dersKodu && (
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isDark ? 'bg-white/10 text-white' : 'bg-black/5 text-[#0F172A]'}`}>
                                    {ders.dersKodu}
                                </span>
                            )}
                            {ders.donem && (
                                <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${renkSiniflari.zemin} ${iconColor}`}>
                                    {ders.donem}
                                </span>
                            )}
                        </div>
                        <h3 className={`text-[18px] font-bold line-clamp-1 ${textPrimary}`}>{ders.dersAdi || "İsimsiz Ders"}</h3>
                    </div>
                </div>
                
                {onToggleMenu && (
                    <div className="relative">
                        <button 
                            onClick={(e) => { e.stopPropagation(); onToggleMenu(); }}
                            className={`p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${textSecondary}`}
                        >
                            <EllipsisVerticalIcon className="w-5 h-5" />
                        </button>
                        
                        {isMenuOpen && (
                            <div className={`absolute right-0 mt-1 w-36 rounded-xl border shadow-lg overflow-hidden z-10 ${cardBg}`}>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onEdit(); }}
                                    className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${textPrimary}`}
                                >
                                    <PencilSquareIcon className="w-4 h-4" />
                                    Düzenle
                                </button>
                                <button 
                                    onClick={(e) => { e.stopPropagation(); onDelete(); }}
                                    className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left text-red-500 hover:bg-red-500/10 transition-colors"
                                >
                                    <TrashIcon className="w-4 h-4" />
                                    Sil
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>
            
            {/* Description */}
            <div className="flex-1 mb-4 h-10">
                <p className={`text-[13px] line-clamp-2 ${textSecondary}`}>
                    {ders.aciklama || "Açıklama eklenmemiş."}
                </p>
            </div>
            
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed mb-5 ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-[#F8F7FC]'}`}>
                <BookOpenIcon className={`w-4 h-4 ${textSecondary}`} />
                <span className={`text-[12px] font-medium ${textSecondary}`}>
                    {ders.materyalSayisi === 0 || !ders.materyalSayisi ? "Henüz materyal yok" : `${ders.materyalSayisi} materyal`}
                </span>
            </div>

            <div className="mb-4">
                <div className="flex items-center justify-between text-[12px] font-medium mb-1.5">
                    <span className={textSecondary}>Müfredat İlerlemesi</span>
                    <span className={textPrimary}>%0</span>
                </div>
                <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-[#26334A]' : 'bg-[#E7E5EF]'}`}></div>
            </div>

            <div className={`grid grid-cols-3 gap-2 mb-4 pt-4 border-t ${isDark ? 'border-[#26334A]' : 'border-[#E7E5EF]'}`}>
                <div className="text-center">
                    <p className={`text-[11px] uppercase ${textSecondary} mb-0.5`}>Konu</p>
                    <p className={`text-[14px] font-bold ${textPrimary}`}>0</p>
                </div>
                <div className="text-center">
                    <p className={`text-[11px] uppercase ${textSecondary} mb-0.5`}>Kart</p>
                    <p className={`text-[14px] font-bold ${textPrimary}`}>0</p>
                </div>
                <div className="text-center">
                    <p className={`text-[11px] uppercase ${textSecondary} mb-0.5`}>Test</p>
                    <p className={`text-[14px] font-bold ${textPrimary}`}>0</p>
                </div>
            </div>

            {/* Actions */}
            <div className={`pt-4 border-t ${isDark ? 'border-[#26334A]' : 'border-[#E7E5EF]'} flex items-center justify-between`}>
                <span className={`text-[11px] ${textSecondary}`}>
                    Son çalışma: Henüz yok
                </span>
                <button onClick={onClick} disabled={!onClick} className={`flex items-center gap-1.5 text-[14px] font-medium ${onClick ? 'hover:text-[#4338CA] text-[#4F46E5]' : 'text-gray-400 cursor-not-allowed'} transition-colors`}>
                    Derse Git <ArrowRightIcon className="w-4 h-4" />
                </button>
            </div>
        </div>
    );
}

export default DersKarti;

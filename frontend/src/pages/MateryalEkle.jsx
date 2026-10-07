import React from "react";
import { useOutletContext, useNavigate, useLocation } from "react-router-dom";
import DersOlusturmaAdimlari from "../components/DersOlusturmaAdimlari";
import { CloudArrowUpIcon, ArrowRightIcon, CpuChipIcon } from "@heroicons/react/24/outline";

function MateryalEkle() {
    const { isDark } = useOutletContext();
    const navigate = useNavigate();
    const location = useLocation();
    
    // Get created course from state
    const ders = location.state?.ders;

    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    const buttonPrimary = "bg-[#4F46E5] hover:bg-[#4338CA] text-white";

    const handleNext = () => {
        navigate("/panel/dersler/yeni/hazir", { state: { ders } });
    };

    return (
        <div className="max-w-[1200px] mx-auto pb-10">
            <div className="mb-8">
                <h1 className={`text-[32px] md:text-[38px] font-bold tracking-tight ${textPrimary}`}>Ders Materyallerini Ekle</h1>
                {ders && (
                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-[#4F46E5]/10 text-[#4F46E5]">
                        <span className="w-2 h-2 rounded-full bg-[#4F46E5]"></span>
                        {ders.dersAdi} {ders.donem ? `— ${ders.donem}` : ""}
                    </div>
                )}
            </div>

            <DersOlusturmaAdimlari aktifAdim={2} isDark={isDark} />

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
                {/* Upload Area - Left (Takes 2 columns on extra large screens) */}
                <div className="xl:col-span-2 flex flex-col gap-6">
                    <div className={`p-8 md:p-12 rounded-2xl border ${cardBg}`}>
                        <div className={`border-2 border-dashed rounded-2xl p-10 md:p-16 flex flex-col items-center justify-center text-center ${isDark ? 'border-[#26334A] bg-[#0B1120]/50' : 'border-[#CBD5E1] bg-[#F8F7FC]/50'} transition-all`}>
                            <div className="w-16 h-16 rounded-full bg-[#4F46E5]/10 flex items-center justify-center mb-6">
                                <CloudArrowUpIcon className="w-8 h-8 text-[#4F46E5]" />
                            </div>
                            
                            <h3 className={`text-[20px] md:text-[24px] font-bold ${textPrimary} mb-2`}>Dosyalarını buraya sürükle ve bırak</h3>
                            <p className={`text-[15px] ${textSecondary} mb-8`}>veya bilgisayarından dosya seç</p>
                            
                            <button className={`px-8 py-3 rounded-xl font-medium border-2 border-[#4F46E5] text-[#4F46E5] hover:bg-[#4F46E5]/10 transition-colors mb-6`}>
                                Dosya Seç
                            </button>
                            
                            <div className={`text-[13px] ${textSecondary}`}>
                                <p>PDF, DOCX, PPTX ve TXT desteklenir. (Maks. 50 MB / dosya)</p>
                                <p className="mt-1">Birden fazla dosyayı aynı anda yükleyebilirsiniz.</p>
                            </div>
                        </div>
                    </div>

                    <div className={`p-5 md:p-6 rounded-2xl border ${isDark ? 'bg-[#10192C] border-[#4F46E5]/30' : 'bg-[#EEF2FF] border-[#4F46E5]/20'} flex items-start gap-4`}>
                        <div className="w-8 h-8 rounded-full bg-[#4F46E5]/10 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[#4F46E5] font-bold">i</span>
                        </div>
                        <div>
                            <h4 className={`text-[15px] font-bold ${textPrimary} mb-1.5`}>Materyaller nasıl kullanılacak?</h4>
                            <p className={`text-[14px] ${textSecondary} leading-relaxed`}>
                                Yüklediğin materyaller daha sonra içerik analizi, konu çıkarımı, özet hazırlama, soru üretme ve çalışma kartları oluşturmak için kullanılacak.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Info Area - Right */}
                <div className="xl:col-span-1">
                    <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#10192C] border-[#26334A]' : 'bg-[#F8F7FC] border-[#E7E5EF]'} h-full flex flex-col`}>
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                                <CpuChipIcon className="w-5 h-5 text-[#4F46E5]" />
                            </div>
                            <h3 className={`text-[16px] md:text-[18px] font-bold ${textPrimary}`}>Yapay Zekâ Analiz Motoru Devrede</h3>
                        </div>
                        
                        <p className={`text-[13px] ${textSecondary} mb-6 leading-relaxed`}>
                            Materyaller hazırlanıyor: Dosyalarındaki içerikler çıkarılıyor ve ders analizi için hazırlanıyor.
                        </p>

                        <div className="mb-6">
                            <div className="flex items-center justify-between text-[12px] font-bold mb-2">
                                <span className={textSecondary}>Analiz Durumu</span>
                                <span className={textPrimary}>- / - materyal hazır (--%)</span>
                            </div>
                            <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-[#1B2942]' : 'bg-[#E2E8F0]'}`}>
                                {/* Empty progress bar */}
                            </div>
                        </div>

                        <div className="flex-1">
                            <h4 className={`text-[11px] font-bold uppercase tracking-widest ${textSecondary} mb-3`}>İŞLEM AŞAMALARI</h4>
                            
                            <div className="space-y-2">
                                {/* Step 1 - Placeholder */}
                                <div className={`flex items-center gap-3 p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isDark ? 'border-[#475569]' : 'border-[#CBD5E1]'}`}></div>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>Dosyalar yüklenmesi bekleniyor</span>
                                </div>
                                
                                {/* Step 2 - Placeholder */}
                                <div className={`flex items-center gap-3 p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isDark ? 'border-[#475569]' : 'border-[#CBD5E1]'}`}></div>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>Metinler çıkarılıyor</span>
                                </div>
                                
                                {/* Step 3 - Placeholder */}
                                <div className={`flex items-center gap-3 p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isDark ? 'border-[#475569]' : 'border-[#CBD5E1]'}`}></div>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>İçerikler analiz ediliyor</span>
                                </div>
                                
                                {/* Step 4 - Placeholder */}
                                <div className={`flex items-center gap-3 p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isDark ? 'border-[#475569]' : 'border-[#CBD5E1]'}`}></div>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>Konu haritası hazırlanıyor</span>
                                </div>
                            </div>
                        </div>

                        <div className={`mt-6 pt-4 border-t flex items-center justify-between text-[11px] font-medium ${isDark ? 'border-[#26334A] text-[#7F8AA3]' : 'border-[#E7E5EF] text-[#94A3B8]'}`}>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Sinir Ağı Motoru: Çevrimiçi
                            </div>
                            <span>Gecikme: --ms</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`p-6 md:p-8 rounded-2xl border ${cardBg}`}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className={`text-[20px] font-bold ${textPrimary}`}>Yüklenen Materyaller</h3>
                    <span className={`px-3 py-1 rounded-lg text-sm font-medium ${isDark ? 'bg-[#10192C] text-[#A7B0C2]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>0 Materyal</span>
                </div>
                
                <div className={`py-12 flex flex-col items-center justify-center text-center rounded-xl border border-dashed ${isDark ? 'border-[#26334A] bg-[#0B1120]/30' : 'border-[#E7E5EF] bg-white'}`}>
                    <p className={`text-[15px] ${textSecondary}`}>Henüz materyal eklenmedi.</p>
                </div>
            </div>

            <div className="mt-8 pt-6 border-t border-[#E7E5EF] dark:border-[#26334A] flex flex-col sm:flex-row items-center justify-between gap-4">
                <button 
                    onClick={handleNext}
                    className={`w-full sm:w-auto px-6 py-3 rounded-xl font-medium border ${isDark ? 'border-[#26334A] hover:bg-white/5 text-[#F8FAFC]' : 'border-[#E7E5EF] hover:bg-black/5 text-[#0F172A]'} transition-colors`}
                >
                    Daha Sonra Ekle
                </button>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <button 
                        onClick={handleNext}
                        className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${buttonPrimary}`}
                    >
                        Devam Et
                        <ArrowRightIcon className="w-5 h-5" />
                    </button>
                </div>
            </div>
        </div>
    );
}

export default MateryalEkle;

import React, { useState, useEffect, useRef } from "react";
import { useOutletContext, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from "axios";
import DersOlusturmaAdimlari from "../components/DersOlusturmaAdimlari";
import { CloudArrowUpIcon, ArrowRightIcon, CpuChipIcon, DocumentIcon, TrashIcon } from "@heroicons/react/24/outline";

function MateryalEkle() {
    const { isDark } = useOutletContext();
    const navigate = useNavigate();
    const location = useLocation();
    const { dersId } = useParams();
    
    // Get created course and uiPrefs from state if available
    const [ders, setDers] = useState(location.state?.ders || null);
    const uiPrefs = location.state?.uiPrefs || { renk: "indigo", simge: "desktop", dersKodu: "" };

    const [materyaller, setMateryaller] = useState([]);
    const [yukleniyor, setYukleniyor] = useState(false);
    const [hata, setHata] = useState("");
    const fileInputRef = useRef(null);

    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    const buttonPrimary = "bg-[#4F46E5] hover:bg-[#4338CA] text-white";

    useEffect(() => {
        materyalleriGetir();
        if (!ders) {
            dersGetir();
        }
    }, [dersId]);

    const dersGetir = async () => {
        try {
            const res = await axios.get(`http://localhost:5000/dersler/${dersId}`, { withCredentials: true });
            if (res.data.ders) {
                setDers(res.data.ders);
            }
        } catch (err) {
            console.error("Ders bilgisi getirilemedi", err);
        }
    };

    const materyalleriGetir = async () => {
        try {
            const res = await axios.get(`http://localhost:5000/materyaller/ders/${dersId}`, { withCredentials: true });
            setMateryaller(res.data.materyaller || []);
        } catch (err) {
            console.error("Materyaller getirilemedi", err);
        }
    };

    const handleDosyaSec = () => {
        fileInputRef.current.click();
    };

    const handleDosyaYukle = async (e) => {
        const dosyalar = e.target.files;
        if (!dosyalar || dosyalar.length === 0) return;

        const formData = new FormData();
        for (let i = 0; i < dosyalar.length; i++) {
            formData.append("dosyalar", dosyalar[i]);
        }

        setYukleniyor(true);
        setHata("");

        try {
            await axios.post(`http://localhost:5000/materyaller/ders/${dersId}`, formData, {
                withCredentials: true
            });
            // Yukleme sonrasi dosyaları tekrar getir
            materyalleriGetir();
        } catch (err) {
            setHata(err.response?.data?.hata || "Dosya yüklenirken bir hata oluştu.");
        } finally {
            setYukleniyor(false);
            e.target.value = null; // Reset input
        }
    };

    const materyalSil = async (id) => {
        if (!window.confirm("Bu materyali silmek istediğinize emin misiniz?")) return;
        
        try {
            await axios.delete(`http://localhost:5000/materyaller/${id}`, { withCredentials: true });
            setMateryaller(materyaller.filter(m => m._id !== id));
        } catch (err) {
            alert("Materyal silinirken bir hata oluştu.");
        }
    };

    const formatBytes = (bytes, decimals = 2) => {
        if (!+bytes) return '0 Bytes';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
    };

    const handleNext = () => {
        navigate(`/panel/dersler/${dersId}/hazir`, { state: { ders, uiPrefs } });
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
                {/* Upload Area - Left */}
                <div className="xl:col-span-2 flex flex-col gap-6">
                    <div className={`p-8 md:p-12 rounded-2xl border ${cardBg}`}>
                        {hata && (
                            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                                {hata}
                            </div>
                        )}
                        <div className={`border-2 border-dashed rounded-2xl p-10 md:p-16 flex flex-col items-center justify-center text-center ${isDark ? 'border-[#26334A] bg-[#0B1120]/50' : 'border-[#CBD5E1] bg-[#F8F7FC]/50'} transition-all`}>
                            <div className="w-16 h-16 rounded-full bg-[#4F46E5]/10 flex items-center justify-center mb-6">
                                <CloudArrowUpIcon className="w-8 h-8 text-[#4F46E5]" />
                            </div>
                            
                            <h3 className={`text-[20px] md:text-[24px] font-bold ${textPrimary} mb-2`}>Dosyalarını buraya sürükle ve bırak</h3>
                            <p className={`text-[15px] ${textSecondary} mb-8`}>veya bilgisayarından dosya seç</p>
                            
                            <input 
                                type="file" 
                                multiple 
                                ref={fileInputRef} 
                                onChange={handleDosyaYukle}
                                className="hidden" 
                                accept=".pdf,.docx,.pptx,.txt"
                            />
                            
                            <button 
                                onClick={handleDosyaSec}
                                disabled={yukleniyor}
                                className={`px-8 py-3 rounded-xl font-medium border-2 border-[#4F46E5] text-[#4F46E5] hover:bg-[#4F46E5]/10 transition-colors mb-6 ${yukleniyor ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                {yukleniyor ? 'Yükleniyor...' : 'Dosya Seç'}
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
                            <h3 className={`text-[16px] md:text-[18px] font-bold ${textPrimary}`}>İçerik Analizi</h3>
                        </div>
                        
                        <p className={`text-[13px] ${textSecondary} mb-6 leading-relaxed`}>
                            {materyaller.length > 0 
                                ? "Materyaller yüklendi. Analiz sistemi sonraki aşamada etkinleştirilecek." 
                                : "Materyaller hazırlanıyor: Dosyalarındaki içerikler analiz için hazırlanıyor."}
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
                                <div className={`flex items-center gap-3 p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isDark ? 'border-[#475569]' : 'border-[#CBD5E1]'}`}></div>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>Dosyalar yüklenmesi bekleniyor</span>
                                </div>
                                <div className={`flex items-center gap-3 p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isDark ? 'border-[#475569]' : 'border-[#CBD5E1]'}`}></div>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>Metinler çıkarılıyor</span>
                                </div>
                                <div className={`flex items-center gap-3 p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isDark ? 'border-[#475569]' : 'border-[#CBD5E1]'}`}></div>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>İçerikler analiz ediliyor</span>
                                </div>
                                <div className={`flex items-center gap-3 p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isDark ? 'border-[#475569]' : 'border-[#CBD5E1]'}`}></div>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>Konu haritası hazırlanıyor</span>
                                </div>
                            </div>
                        </div>

                        <div className={`mt-6 pt-4 border-t flex items-center justify-between text-[11px] font-medium ${isDark ? 'border-[#26334A] text-[#7F8AA3]' : 'border-[#E7E5EF] text-[#94A3B8]'}`}>
                            <div className="flex items-center gap-1.5">
                                <span className="w-1.5 h-1.5 rounded-full bg-gray-500"></span>
                                Analiz sistemi sonraki aşamada etkinleştirilecek.
                            </div>
                            <span>Bekliyor</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className={`p-6 md:p-8 rounded-2xl border ${cardBg}`}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className={`text-[20px] font-bold ${textPrimary}`}>Yüklenen Materyaller</h3>
                    <span className={`px-3 py-1 rounded-lg text-sm font-medium ${isDark ? 'bg-[#10192C] text-[#A7B0C2]' : 'bg-[#F1F5F9] text-[#64748B]'}`}>{materyaller.length} Materyal</span>
                </div>
                
                {materyaller.length === 0 ? (
                    <div className={`py-12 flex flex-col items-center justify-center text-center rounded-xl border border-dashed ${isDark ? 'border-[#26334A] bg-[#0B1120]/30' : 'border-[#E7E5EF] bg-white'}`}>
                        <p className={`text-[15px] ${textSecondary}`}>Henüz materyal eklenmedi.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {materyaller.map((materyal) => (
                            <div key={materyal._id} className={`flex items-center justify-between p-4 rounded-xl border ${isDark ? 'border-[#26334A] bg-[#162137]' : 'border-[#E7E5EF] bg-white'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${
                                        materyal.dosyaTuru === 'pdf' ? 'bg-red-500/10 text-red-500' :
                                        materyal.dosyaTuru === 'docx' ? 'bg-blue-500/10 text-blue-500' :
                                        materyal.dosyaTuru === 'pptx' ? 'bg-orange-500/10 text-orange-500' :
                                        'bg-gray-500/10 text-gray-500'
                                    }`}>
                                        <DocumentIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <h4 className={`text-[14px] font-bold ${textPrimary} mb-0.5 line-clamp-1`}>{materyal.orijinalDosyaAdi}</h4>
                                        <div className={`flex items-center gap-2 text-[12px] ${textSecondary}`}>
                                            <span className="uppercase">{materyal.dosyaTuru}</span>
                                            <span>•</span>
                                            <span>{formatBytes(materyal.dosyaBoyutu)}</span>
                                            <span>•</span>
                                            <span className="capitalize">{materyal.durum}</span>
                                        </div>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => materyalSil(materyal._id)}
                                    className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                                    title="Sil"
                                >
                                    <TrashIcon className="w-5 h-5" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-8 pt-6 border-t border-[#E7E5EF] dark:border-[#26334A] flex flex-col sm:flex-row items-center justify-between gap-4">
                <button 
                    onClick={handleNext}
                    className={`w-full sm:w-auto px-6 py-3 rounded-xl font-medium border ${isDark ? 'border-[#26334A] hover:bg-white/5 text-[#F8FAFC]' : 'border-[#E7E5EF] hover:bg-black/5 text-[#0F172A]'} transition-colors`}
                >
                    {materyaller.length > 0 ? "Geç" : "Daha Sonra Ekle"}
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

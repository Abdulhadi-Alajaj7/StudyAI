import React, { useState, useEffect } from "react";
import { useOutletContext, useNavigate, useLocation, useParams } from "react-router-dom";
import axios from "axios";
import DersOlusturmaAdimlari from "../components/DersOlusturmaAdimlari";
import { CheckBadgeIcon, ArrowRightIcon, BookOpenIcon, DocumentTextIcon, CheckIcon, CpuChipIcon, ListBulletIcon, ChatBubbleBottomCenterTextIcon, PuzzlePieceIcon, SparklesIcon, ComputerDesktopIcon, CodeBracketIcon, CircleStackIcon, CalculatorIcon, BeakerIcon } from "@heroicons/react/24/outline";

function DersHazir() {
    const { isDark } = useOutletContext();
    const navigate = useNavigate();
    const location = useLocation();
    const { dersId } = useParams();
    
    const [materyalSayisi, setMateryalSayisi] = useState(0);
    const [ders, setDers] = useState(location.state?.ders || null);
    const uiPrefs = location.state?.uiPrefs || { renk: "indigo", simge: "desktop", dersKodu: "" };

    useEffect(() => {
        const materyalleriGetir = async () => {
            try {
                const res = await axios.get(`http://localhost:5000/materyaller/ders/${dersId}`, { withCredentials: true });
                setMateryalSayisi(res.data.materyaller?.length || 0);
            } catch (err) {
                console.error("Materyaller alınamadı", err);
            }
        };
        const dersGetir = async () => {
            try {
                const res = await axios.get(`http://localhost:5000/dersler/${dersId}`, { withCredentials: true });
                if (res.data.ders) {
                    setDers(res.data.ders);
                }
            } catch (err) {
                console.error("Ders bilgisi alınamadı", err);
            }
        };
        if (dersId) {
            materyalleriGetir();
            if (!ders) {
                dersGetir();
            }
        }
    }, [dersId]);

    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    
    const renkler = [
        { id: "indigo", bg: "bg-[#4F46E5]", text: "text-[#4F46E5]" },
        { id: "cyan", bg: "bg-[#06B6D4]", text: "text-[#06B6D4]" },
        { id: "emerald", bg: "bg-[#10B981]", text: "text-[#10B981]" },
        { id: "amber", bg: "bg-[#F59E0B]", text: "text-[#F59E0B]" },
        { id: "rose", bg: "bg-[#F43F5E]", text: "text-[#F43F5E]" }
    ];

    const simgeler = [
        { id: "book", icon: BookOpenIcon },
        { id: "desktop", icon: ComputerDesktopIcon },
        { id: "code", icon: CodeBracketIcon },
        { id: "database", icon: CircleStackIcon },
        { id: "calc", icon: CalculatorIcon },
        { id: "science", icon: BeakerIcon }
    ];
    
    const seciliRenk = renkler.find(r => r.id === uiPrefs.renk) || renkler[0];
    const SeciliSimge = simgeler.find(s => s.id === uiPrefs.simge)?.icon || ComputerDesktopIcon;

    return (
        <div className="max-w-[1200px] mx-auto pb-10">
            <div className="mb-8 flex items-center justify-between">
                <div>
                    <h1 className={`text-[32px] md:text-[38px] font-bold tracking-tight ${textPrimary}`}>Yeni Ders Oluştur</h1>
                    <p className={`mt-1.5 text-[16px] ${textSecondary}`}>
                        Dersin oluşturuldu, materyallerin analiz edildi ve öğrenmeye hazırsın.
                    </p>
                </div>
            </div>

            <DersOlusturmaAdimlari aktifAdim={3} isDark={isDark} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Sol Ana İçerik */}
                <div className="lg:col-span-8 flex flex-col gap-6">
                    
                    {/* Başarı Banner'ı */}
                    <div className={`p-6 rounded-2xl border ${isDark ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-emerald-50 border-emerald-200'} flex items-start gap-4`}>
                        <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                            <CheckIcon className="w-6 h-6 text-white font-bold" />
                        </div>
                        <div>
                            <div className="flex items-center gap-3 mb-1">
                                <h2 className={`text-[20px] font-bold ${isDark ? 'text-white' : 'text-emerald-900'}`}>Dersin Hazır!</h2>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest ${isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-200 text-emerald-800'}`}>KURULUM TAMAM</span>
                            </div>
                            <p className={`text-[14px] ${isDark ? 'text-emerald-100/70' : 'text-emerald-700'} leading-relaxed`}>
                                <strong className={isDark ? 'text-white' : 'text-emerald-900'}>{ders?.dersAdi || "Ders"}</strong> başarıyla oluşturuldu. Dersine giderek öğrenme özelliklerini kullanmaya başlayabilirsin.
                            </p>
                        </div>
                    </div>

                    {/* Ders Kartı Banner */}
                    <div className={`p-6 rounded-2xl border ${isDark ? 'bg-[#10192C] border-[#26334A]' : 'bg-indigo-50 border-indigo-100'} flex items-center justify-between`}>
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${seciliRenk.bg} bg-opacity-10`}>
                                <SeciliSimge className={`w-6 h-6 ${seciliRenk.text}`} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2 mb-1">
                                    <h3 className={`text-[18px] font-bold ${textPrimary}`}>{ders?.dersAdi || "Ders Adı"}</h3>
                                    {uiPrefs.dersKodu && <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isDark ? 'bg-white/10 text-[#A7B0C2]' : 'bg-indigo-200 text-indigo-800'}`}>{uiPrefs.dersKodu}</span>}
                                </div>
                                <p className={`text-[13px] ${textSecondary}`}>Dönem: {ders?.donem || "Belirtilmedi"}</p>
                            </div>
                        </div>
                        <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium ${isDark ? 'bg-[#1B2942] text-[#A7B0C2]' : 'bg-indigo-100 text-indigo-700'}`}>
                            <span className="w-1.5 h-1.5 rounded-full bg-gray-400"></span>
                            Analiz bekleniyor
                        </div>
                    </div>

                    {/* DERS KURULUM ÖZETİ */}
                    <div>
                        <h3 className={`text-[13px] font-bold tracking-wider uppercase ${textSecondary} mb-4`}>DERS KURULUM ÖZETİ</h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div className={`p-4 rounded-xl border ${cardBg} flex items-center justify-between`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                                        <BookOpenIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className={`text-[14px] font-bold ${textPrimary}`}>Ders Bilgileri</p>
                                        <p className={`text-[12px] ${textSecondary}`}>Bilgiler kaydedildi</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-1 px-2.5 py-1 rounded bg-green-500/10 text-green-600 text-[11px] font-bold">
                                    <CheckIcon className="w-3 h-3" />
                                    Tamamlandı
                                </div>
                            </div>

                            <div className={`p-4 rounded-xl border ${cardBg} flex items-center justify-between`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-[#4F46E5]">
                                        <DocumentTextIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className={`text-[14px] font-bold ${textPrimary}`}>Materyaller</p>
                                        <p className={`text-[12px] ${textSecondary}`}>İşlenecek materyaller</p>
                                    </div>
                                </div>
                                <div className={`px-2.5 py-1 rounded text-[11px] font-bold ${isDark ? 'bg-[#1B2942] text-[#7F8AA3]' : 'bg-[#E2E8F0] text-[#64748B]'}`}>
                                    {materyalSayisi} Materyal
                                </div>
                            </div>

                            <div className={`p-4 rounded-xl border ${cardBg} flex items-center justify-between`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-500">
                                        <ListBulletIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className={`text-[14px] font-bold ${textPrimary}`}>Konu Analizi</p>
                                        <p className={`text-[12px] ${textSecondary}`}>Ana ve alt başlıklar</p>
                                    </div>
                                </div>
                                <div className={`px-2.5 py-1 rounded text-[11px] font-bold ${isDark ? 'bg-[#1B2942] text-[#7F8AA3]' : 'bg-[#E2E8F0] text-[#64748B]'}`}>
                                    -- Konu
                                </div>
                            </div>

                            <div className={`p-4 rounded-xl border ${cardBg} flex items-center justify-between`}>
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                                        <CpuChipIcon className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <p className={`text-[14px] font-bold ${textPrimary}`}>Yapay Zekâ Kaynakları</p>
                                        <p className={`text-[12px] ${textSecondary}`}>Özet, test ve sohbet</p>
                                    </div>
                                </div>
                                <div className={`px-2.5 py-1 rounded text-[11px] font-bold ${isDark ? 'bg-[#1B2942] text-[#7F8AA3]' : 'bg-[#E2E8F0] text-[#64748B]'}`}>
                                    Bekliyor
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Yapay Zeka Analiz Hattı */}
                    <div className={`p-5 rounded-xl border ${isDark ? 'bg-[#0B1120]/50 border-[#26334A]' : 'bg-[#F8F7FC] border-[#E7E5EF]'}`}>
                        <div className="flex items-center justify-between mb-4">
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-4 h-4 text-[#4F46E5]" />
                                <h4 className={`text-[14px] font-bold ${textPrimary}`}>Yapay Zekâ Analiz Hattı</h4>
                            </div>
                            <span className={`px-2 py-1 rounded text-[10px] font-bold ${isDark ? 'bg-[#1B2942] text-[#A7B0C2]' : 'bg-[#E2E8F0] text-[#64748B]'}`}>
                                İşlem Bekliyor
                            </span>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#162137] border-[#26334A]' : 'bg-white border-[#E7E5EF]'} text-center opacity-50`}>
                                <p className={`text-[12px] font-bold ${textPrimary}`}>Materyaller Okundu</p>
                                <p className={`text-[10px] ${textSecondary} mt-0.5`}>PDF & Notlar</p>
                            </div>
                            <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#162137] border-[#26334A]' : 'bg-white border-[#E7E5EF]'} text-center opacity-50`}>
                                <p className={`text-[12px] font-bold ${textPrimary}`}>İçerik Analiz Edildi</p>
                                <p className={`text-[10px] ${textSecondary} mt-0.5`}>Semantik Tarama</p>
                            </div>
                            <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#162137] border-[#26334A]' : 'bg-white border-[#E7E5EF]'} text-center opacity-50`}>
                                <p className={`text-[12px] font-bold ${textPrimary}`}>Konular Belirlendi</p>
                                <p className={`text-[10px] ${textSecondary} mt-0.5`}>Taksonomi</p>
                            </div>
                            <div className={`p-3 rounded-lg border ${isDark ? 'bg-[#162137] border-[#26334A]' : 'bg-white border-[#E7E5EF]'} text-center opacity-50`}>
                                <p className={`text-[12px] font-bold ${textPrimary}`}>Ders Hazırlandı</p>
                                <p className={`text-[10px] ${textSecondary} mt-0.5`}>Kullanıma Açık</p>
                            </div>
                        </div>
                    </div>

                    {/* Belirlenen Konular */}
                    <div>
                        <div className="flex items-center justify-between mb-4">
                            <h4 className={`text-[15px] font-bold ${textPrimary}`}>Belirlenen Konular <span className={`text-[12px] font-normal ${textSecondary}`}>(Otomatik Haritalanan)</span></h4>
                            <button disabled className={`text-[13px] font-medium text-[#4F46E5] flex items-center gap-1 opacity-50`}>Konu Haritasını Gör <ArrowRightIcon className="w-3 h-3" /></button>
                        </div>
                        <div className={`p-6 rounded-xl border border-dashed flex flex-col items-center justify-center text-center ${isDark ? 'border-[#26334A] bg-[#0B1120]/30' : 'border-[#E7E5EF] bg-white'}`}>
                            <p className={`text-[14px] ${textSecondary}`}>Materyaller analiz edildiğinde konular burada görüntülenecek.</p>
                        </div>
                    </div>

                    {/* Artık Neler Yapabilirsin? */}
                    <div className="mb-6">
                        <h4 className={`text-[15px] font-bold ${textPrimary} mb-4`}>Artık Neler Yapabilirsin?</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className={`p-4 rounded-xl border ${cardBg} flex items-start gap-4`}>
                                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-[#4F46E5] shrink-0">
                                    <DocumentTextIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h5 className={`text-[14px] font-bold ${textPrimary} mb-1`}>Özet Oluştur</h5>
                                    <p className={`text-[12px] ${textSecondary}`}>Dersin, materyallerin veya belirlediğin konunun özetini oluştur.</p>
                                </div>
                            </div>
                            <div className={`p-4 rounded-xl border ${cardBg} flex items-start gap-4`}>
                                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-500 shrink-0">
                                    <ChatBubbleBottomCenterTextIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h5 className={`text-[14px] font-bold ${textPrimary} mb-1`}>Yapay Zekâya Sor</h5>
                                    <p className={`text-[12px] ${textSecondary}`}>Ders materyallerine dayalı kaynaklı yanıtlar al.</p>
                                </div>
                            </div>
                            <div className={`p-4 rounded-xl border ${cardBg} flex items-start gap-4`}>
                                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                                    <CheckBadgeIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h5 className={`text-[14px] font-bold ${textPrimary} mb-1`}>Test Çöz</h5>
                                    <p className={`text-[12px] ${textSecondary}`}>Konularına ve seviyene uygun sorularla bilgini ölç.</p>
                                </div>
                            </div>
                            <div className={`p-4 rounded-xl border ${cardBg} flex items-start gap-4`}>
                                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center text-purple-500 shrink-0">
                                    <PuzzlePieceIcon className="w-5 h-5" />
                                </div>
                                <div>
                                    <h5 className={`text-[14px] font-bold ${textPrimary} mb-1`}>Çalışma Kartları</h5>
                                    <p className={`text-[12px] ${textSecondary}`}>Önemli kavramları aralıklı tekrarlarla pekiştir.</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Actions */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-[#E7E5EF] dark:border-[#26334A]">
                        <p className={`text-[14px] ${textSecondary} hidden sm:block`}>Ders genel bakışına geçerek öğrenmeye başlayabilirsin.</p>
                        <div className="flex items-center gap-4 w-full sm:w-auto">
                            <button 
                                onClick={() => navigate("/panel/dersler")}
                                className={`w-full sm:w-auto px-6 py-3 rounded-xl font-medium border ${isDark ? 'border-[#26334A] hover:bg-white/5 text-[#F8FAFC]' : 'border-[#E7E5EF] hover:bg-black/5 text-[#0F172A]'} transition-colors`}
                            >
                                Derslerime Dön
                            </button>
                            <button 
                                disabled
                                className={`w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-medium transition-colors bg-[#4F46E5] text-white opacity-50 cursor-not-allowed`}
                            >
                                Derse Git
                                <ArrowRightIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sağ Alan - Önizleme ve İpuçları */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="sticky top-28 space-y-6">
                        
                        {/* Önizleme Kartı */}
                        <div>
                            <div className="mb-4">
                                <h3 className={`text-[18px] font-bold ${textPrimary} flex items-center gap-2`}>
                                    Önizleme 
                                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[11px] font-bold tracking-wide uppercase">Canlı</span>
                                </h3>
                                <p className={`text-[13px] ${textSecondary} mt-1`}>Ders kartının Derslerim sayfasındaki görünümü</p>
                            </div>
                            
                            <div className={`p-5 rounded-2xl border ${cardBg}`}>
                                <div className="flex flex-col">
                                    <div className="flex items-start justify-between mb-4">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${seciliRenk.bg} bg-opacity-10`}>
                                                <SeciliSimge className={`w-6 h-6 ${seciliRenk.text}`} />
                                            </div>
                                            <div>
                                                <div className="flex gap-1.5 mb-1">
                                                    {uiPrefs.dersKodu && (
                                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isDark ? 'bg-white/10 text-white' : 'bg-black/5 text-[#0F172A]'}`}>
                                                            {uiPrefs.dersKodu}
                                                        </span>
                                                    )}
                                                    {ders?.donem && (
                                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isDark ? 'bg-indigo-500/10 text-[#818CF8]' : 'bg-indigo-500/10 text-[#4F46E5]'}`}>
                                                            {ders.donem}
                                                        </span>
                                                    )}
                                                </div>
                                                <h3 className={`text-[18px] font-bold line-clamp-1 ${textPrimary}`}>{ders?.dersAdi || "Ders Adı"}</h3>
                                            </div>
                                        </div>
                                    </div>
                                    
                                    <p className={`text-[13px] line-clamp-2 ${textSecondary} mb-5 h-10`}>
                                        {ders?.aciklama || "Ders açıklaması burada görüntülenecek."}
                                    </p>
                                    
                                    <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed mb-5 ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-[#F8F7FC]'}`}>
                                        <BookOpenIcon className={`w-4 h-4 ${textSecondary}`} />
                                        <span className={`text-[12px] font-medium ${textSecondary}`}>
                                            {materyalSayisi > 0 ? `${materyalSayisi} Materyal eklendi` : "Henüz materyal eklenmedi"}
                                        </span>
                                    </div>
                                    
                                    <div className="mb-4">
                                        <div className="flex items-center justify-between text-[12px] font-medium mb-1.5">
                                            <span className={textSecondary}>Müfredat İlerlemesi</span>
                                            <span className={textPrimary}>%0</span>
                                        </div>
                                        <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-[#26334A]' : 'bg-[#E7E5EF]'}`}></div>
                                    </div>
                                    
                                    <button disabled className={`w-full py-2.5 rounded-xl text-[13px] font-medium border flex items-center justify-center gap-1.5 ${isDark ? 'border-[#26334A] text-[#7F8AA3] bg-[#0B1120]' : 'border-[#E7E5EF] text-[#94A3B8] bg-[#F8F7FC]'} opacity-70 cursor-not-allowed`}>
                                        Derse Git <ArrowRightIcon className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Sonraki Adım */}
                        <div className={`p-5 rounded-2xl border ${isDark ? 'bg-[#10192C] border-[#26334A]' : 'bg-[#F8F7FC] border-[#E7E5EF]'}`}>
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-full bg-[#4F46E5]/10 flex items-center justify-center text-[#4F46E5]">
                                    <SparklesIcon className="w-3.5 h-3.5" />
                                </div>
                                <h4 className={`text-[15px] font-bold ${textPrimary}`}>Sonraki Adım</h4>
                            </div>
                            <p className={`text-[13px] ${textSecondary} leading-relaxed mb-4`}>
                                Dersine girerek konu haritanı inceleyebilir, özet oluşturabilir, yapay zekâya soru sorabilir ve ilk testini çözebilirsin. (Materyaller yüklendikten sonra)
                            </p>
                            <button disabled className={`text-[13px] font-medium text-[#4F46E5] flex items-center gap-1 opacity-50`}>
                                Konu Haritasını İncele <ArrowRightIcon className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Biliyor muydun? */}
                        <div className={`p-5 rounded-2xl border ${isDark ? 'bg-[#0B1120]/50 border-[#26334A]' : 'bg-white border-[#E7E5EF]'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[14px]">💡</span>
                                <h4 className={`text-[13px] font-bold ${textPrimary}`}>Biliyor muydun?</h4>
                            </div>
                            <p className={`text-[12px] ${textSecondary} leading-relaxed`}>
                                Dilediğin zaman "Ders Ayarları" ekranından yeni PDF ve ders slaytları ekleyebilir, yapay zekânın konu haritasını güncel tutmasını sağlayabilirsin.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default DersHazir;

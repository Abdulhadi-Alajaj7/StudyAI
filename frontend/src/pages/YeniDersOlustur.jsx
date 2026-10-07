import React, { useState } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import axios from "axios";
import DersOlusturmaAdimlari from "../components/DersOlusturmaAdimlari";
import { ArrowRightIcon, Bars3BottomLeftIcon, BookOpenIcon, ComputerDesktopIcon, CodeBracketIcon, CircleStackIcon, CalculatorIcon, BeakerIcon } from "@heroicons/react/24/outline";

function YeniDersOlustur() {
    const { isDark } = useOutletContext();
    const navigate = useNavigate();

    const [form, setForm] = useState({
        dersAdi: "",
        aciklama: "",
        donem: "",
        dersKodu: "",
        renk: "indigo",
        simge: "desktop"
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    const inputBg = isDark ? "bg-[#0B1120] border-[#26334A] text-[#F8FAFC]" : "bg-white border-[#E7E5EF] text-[#0F172A]";
    const buttonPrimary = "bg-[#4F46E5] hover:bg-[#4338CA] text-white";

    const renkler = [
        { id: "indigo", bg: "bg-[#4F46E5]" },
        { id: "cyan", bg: "bg-[#06B6D4]" },
        { id: "emerald", bg: "bg-[#10B981]" },
        { id: "amber", bg: "bg-[#F59E0B]" },
        { id: "rose", bg: "bg-[#F43F5E]" }
    ];

    const simgeler = [
        { id: "book", icon: BookOpenIcon, label: "Kitap" },
        { id: "desktop", icon: ComputerDesktopIcon, label: "Bilgisayar" },
        { id: "code", icon: CodeBracketIcon, label: "Kod" },
        { id: "database", icon: CircleStackIcon, label: "Veritabanı" },
        { id: "calc", icon: CalculatorIcon, label: "Hesap" },
        { id: "science", icon: BeakerIcon, label: "Bilim" }
    ];

    const handleNext = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        
        try {
            // Sadece backend'in desteklediği alanları gönderiyoruz
            const payload = {
                dersAdi: form.dersAdi,
                aciklama: form.aciklama,
                donem: form.donem
            };
            
            const res = await axios.post("http://localhost:5000/dersler", payload, { withCredentials: true });
            const yeniDers = res.data.ders;
            
            // Seçilen renk ve simge (frontend state) de sonraki sayfaya aktarılabilir
            navigate("/panel/dersler/yeni/materyal", { state: { ders: yeniDers, uiPrefs: { renk: form.renk, simge: form.simge, dersKodu: form.dersKodu } } });
        } catch (err) {
            setError(err.response?.data?.hata || "Ders oluşturulurken bir hata meydana geldi.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-[1200px] mx-auto pb-10">
            <div className="mb-8">
                <h1 className={`text-[32px] md:text-[38px] font-bold tracking-tight ${textPrimary}`}>Yeni Ders Oluştur</h1>
                <p className={`mt-1.5 text-[16px] ${textSecondary}`}>
                    Dersini oluştur, materyallerini ekle ve öğrenme alanını hazırla.
                </p>
            </div>

            <DersOlusturmaAdimlari aktifAdim={1} isDark={isDark} />

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Form Section - Left */}
                <div className={`lg:col-span-8 p-6 md:p-8 rounded-2xl border ${cardBg}`}>
                    <div className="flex items-center gap-3 mb-8 pb-6 border-b border-[#E7E5EF] dark:border-[#26334A]">
                        <Bars3BottomLeftIcon className={`w-6 h-6 ${textSecondary}`} />
                        <div>
                            <h2 className={`text-[20px] font-bold ${textPrimary}`}>Ders Bilgileri</h2>
                            <p className={`text-[14px] ${textSecondary} mt-1`}>Dersini tanımlamak için temel bilgileri gir.</p>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                            {error}
                        </div>
                    )}

                    <form onSubmit={handleNext} className="space-y-6">
                        <div>
                            <label className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Ders Adı <span className="text-red-500">*</span></label>
                            <input 
                                type="text"
                                required
                                value={form.dersAdi}
                                onChange={(e) => setForm({...form, dersAdi: e.target.value})}
                                className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#4F46E5] transition-all ${inputBg}`}
                                placeholder="Örn: İşletim Sistemleri"
                            />
                        </div>

                        <div>
                            <label className={`block text-sm font-medium mb-1.5 flex justify-between ${textPrimary}`}>
                                <span>Ders Açıklaması</span>
                                <span className={textSecondary}>{form.aciklama.length} / 300</span>
                            </label>
                            <textarea 
                                rows="4"
                                maxLength="300"
                                value={form.aciklama}
                                onChange={(e) => setForm({...form, aciklama: e.target.value})}
                                className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#4F46E5] resize-none transition-all ${inputBg}`}
                                placeholder="İşletim sistemlerinin temel yapıları, süreç yönetimi, bellek yönetimi ve dosya sistemleri."
                            ></textarea>
                            <p className={`text-[13px] ${textSecondary} mt-2`}>Bu açıklama yapay zekânın konu ağırlıklarını önceliklendirmesine rehberlik eder.</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                                <label className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Ders Dönemi</label>
                                <select
                                    value={form.donem}
                                    onChange={(e) => setForm({...form, donem: e.target.value})}
                                    className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#4F46E5] transition-all appearance-none ${inputBg}`}
                                >
                                    <option value="">Dönem Seçin...</option>
                                    <option value="2026-2027 Güz Dönemi">2026-2027 Güz Dönemi</option>
                                    <option value="2026-2027 Bahar Dönemi">2026-2027 Bahar Dönemi</option>
                                </select>
                            </div>
                            <div>
                                <label className={`block text-sm font-medium mb-1.5 flex items-center gap-2 ${textPrimary}`}>
                                    Ders Kodu <span className={`text-[11px] font-normal px-1.5 py-0.5 rounded ${isDark ? 'bg-white/10 text-[#A7B0C2]' : 'bg-black/5 text-[#64748B]'}`}>Opsiyonel</span>
                                </label>
                                <input 
                                    type="text"
                                    value={form.dersKodu}
                                    onChange={(e) => setForm({...form, dersKodu: e.target.value})}
                                    className={`w-full px-4 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#4F46E5] transition-all ${inputBg}`}
                                    placeholder="Örn: BIL301"
                                />
                            </div>
                        </div>

                        {/* Ders Görünümü Bölümü (Tasarım Amaçlı) */}
                        <div className={`mt-8 p-6 rounded-xl border ${isDark ? 'bg-[#0B1120]/50 border-[#26334A]' : 'bg-[#F8F7FC] border-[#E7E5EF]'}`}>
                            <div className="mb-4">
                                <h3 className={`text-[15px] font-bold flex items-center gap-2 ${textPrimary}`}>
                                    Ders Görünümü <span className={`text-[11px] font-normal px-1.5 py-0.5 rounded ${isDark ? 'bg-white/10 text-[#A7B0C2]' : 'bg-black/5 text-[#64748B]'}`}>Opsiyonel</span>
                                </h3>
                                <p className={`text-[13px] ${textSecondary} mt-1`}>Dersini diğer derslerden kolayca ayırt etmek için renk ve simge seçebilirsin.</p>
                            </div>

                            <div className="space-y-6">
                                <div>
                                    <label className={`block text-[13px] font-medium mb-3 ${textPrimary}`}>Ders Rengi</label>
                                    <div className="flex flex-wrap items-center gap-3">
                                        {renkler.map(r => (
                                            <button
                                                key={r.id}
                                                type="button"
                                                onClick={() => setForm({...form, renk: r.id})}
                                                className={`w-10 h-10 rounded-full flex items-center justify-center ${r.bg} ${form.renk === r.id ? 'ring-2 ring-offset-2 ring-[#4F46E5] dark:ring-offset-[#0B1120]' : 'opacity-80 hover:opacity-100'} transition-all`}
                                            >
                                                {form.renk === r.id && <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                
                                <div>
                                    <label className={`block text-[13px] font-medium mb-3 ${textPrimary}`}>Ders Simgesi</label>
                                    <div className="flex flex-wrap items-center gap-3">
                                        {simgeler.map(s => {
                                            const Icon = s.icon;
                                            const isSelected = form.simge === s.id;
                                            return (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => setForm({...form, simge: s.id})}
                                                    className={`flex flex-col items-center justify-center w-20 h-20 rounded-xl border transition-all
                                                        ${isSelected 
                                                            ? (isDark ? 'bg-[#4F46E5]/10 border-[#4F46E5] text-[#4F46E5]' : 'bg-[#EEF2FF] border-[#4F46E5] text-[#4F46E5]') 
                                                            : (isDark ? 'border-[#26334A] hover:border-[#7F8AA3] text-[#A7B0C2]' : 'border-[#E7E5EF] hover:border-[#94A3B8] text-[#64748B]')
                                                        }
                                                    `}
                                                >
                                                    <Icon className="w-6 h-6 mb-2" />
                                                    <span className="text-[11px] font-medium">{s.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-8 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <button 
                                type="button"
                                onClick={() => navigate("/panel/dersler")}
                                className={`w-full sm:w-auto px-6 py-3 rounded-xl font-medium border ${isDark ? 'border-[#26334A] hover:bg-white/5 text-[#F8FAFC]' : 'border-[#E7E5EF] hover:bg-black/5 text-[#0F172A]'} transition-colors`}
                            >
                                İptal
                            </button>
                            <button 
                                type="submit"
                                disabled={loading}
                                className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${buttonPrimary} ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                {loading ? 'Oluşturuluyor...' : 'Dersi Oluştur ve Devam Et'}
                                {!loading && <ArrowRightIcon className="w-5 h-5" />}
                            </button>
                        </div>
                    </form>
                </div>
                
                {/* Preview Section - Right */}
                <div className="lg:col-span-4">
                    <div className="sticky top-28">
                        <div className="mb-4">
                            <h3 className={`text-[18px] font-bold ${textPrimary} flex items-center gap-2`}>
                                Önizleme 
                                <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[11px] font-bold tracking-wide uppercase">Canlı</span>
                            </h3>
                            <p className={`text-[13px] ${textSecondary} mt-1`}>Ders kartının Derslerim sayfasındaki görünümü</p>
                        </div>
                        
                        <div className={`p-5 rounded-2xl border ${cardBg}`}>
                            {/* Fake Course Card */}
                            <div className="flex flex-col">
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${renkler.find(r => r.id === form.renk)?.bg || 'bg-[#4F46E5]'} bg-opacity-10`}>
                                            {(() => {
                                                const Icon = simgeler.find(s => s.id === form.simge)?.icon || ComputerDesktopIcon;
                                                const colorClass = isDark ? `text-${form.renk}-400` : `text-${form.renk}-600`;
                                                return <Icon className={`w-6 h-6 ${colorClass}`} style={{ color: form.renk === 'indigo' ? '#4F46E5' : form.renk === 'cyan' ? '#06B6D4' : form.renk === 'emerald' ? '#10B981' : form.renk === 'amber' ? '#F59E0B' : '#F43F5E' }} />;
                                            })()}
                                        </div>
                                        <div>
                                            <div className="flex gap-1.5 mb-1">
                                                {form.dersKodu && (
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isDark ? 'bg-white/10 text-white' : 'bg-black/5 text-[#0F172A]'}`}>
                                                        {form.dersKodu}
                                                    </span>
                                                )}
                                                {form.donem && (
                                                    <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${isDark ? 'bg-indigo-500/10 text-[#818CF8]' : 'bg-indigo-500/10 text-[#4F46E5]'}`}>
                                                        {form.donem}
                                                    </span>
                                                )}
                                            </div>
                                            <h3 className={`text-[18px] font-bold line-clamp-1 ${textPrimary}`}>{form.dersAdi || "Ders Adı"}</h3>
                                        </div>
                                    </div>
                                </div>
                                
                                <p className={`text-[13px] line-clamp-2 ${textSecondary} mb-5 h-10`}>
                                    {form.aciklama || "Ders açıklaması burada görüntülenecek."}
                                </p>
                                
                                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed mb-5 ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-[#F8F7FC]'}`}>
                                    <BookOpenIcon className={`w-4 h-4 ${textSecondary}`} />
                                    <span className={`text-[12px] font-medium ${textSecondary}`}>Henüz materyal eklenmedi</span>
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

                        <div className={`mt-4 p-4 rounded-xl border flex items-start gap-3 ${isDark ? 'border-[#4F46E5]/30 bg-indigo-500/5' : 'border-[#4F46E5]/20 bg-indigo-500/5'}`}>
                            <div className="mt-0.5">💡</div>
                            <div>
                                <h4 className={`text-[13px] font-bold ${textPrimary} mb-1`}>İpucu</h4>
                                <p className={`text-[12px] ${textSecondary} leading-relaxed`}>Dersi oluşturduktan sonraki adımda PDF, slayt veya ders notlarını ekleyerek öğrenme materyallerini hazırlayabileceksin.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

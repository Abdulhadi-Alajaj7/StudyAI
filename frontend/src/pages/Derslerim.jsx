import React, { useState, useEffect } from "react";
import { useOutletContext, useNavigate } from "react-router-dom";
import axios from "axios";
import { 
    PlusIcon, 
    MagnifyingGlassIcon, 
    EllipsisVerticalIcon, 
    BookOpenIcon, 
    XMarkIcon,
    ChartPieIcon,
    CalendarDaysIcon,
    PencilSquareIcon,
    TrashIcon,
    ArrowRightIcon
} from "@heroicons/react/24/outline";

function Derslerim() {
    const { isDark } = useOutletContext();
    const navigate = useNavigate();
    
    const [dersler, setDersler] = useState([]);
    const [loading, setLoading] = useState(true);
    const [hata, setHata] = useState(null);
    const [aramaMetni, setAramaMetni] = useState("");

    const [modalAcik, setModalAcik] = useState(false);
    const [modalModu, setModalModu] = useState("olustur"); // "olustur" | "duzenle"
    const [seciliDers, setSeciliDers] = useState(null);
    const [form, setForm] = useState({ dersAdi: "", aciklama: "", donem: "" });

    const [silModalAcik, setSilModalAcik] = useState(false);
    const [silinecekDers, setSilinecekDers] = useState(null);

    const [aktifMenuId, setAktifMenuId] = useState(null);

    // Theme Variables
    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    const inputBg = isDark ? "bg-[#0B1120] border-[#26334A] text-[#F8FAFC]" : "bg-white border-[#E7E5EF] text-[#0F172A]";
    const modalOverlay = isDark ? "bg-black/60" : "bg-black/40";
    const buttonPrimary = "bg-[#4F46E5] hover:bg-[#4338CA] text-white";

    const dersleriGetir = async () => {
        setLoading(true);
        try {
            const res = await axios.get("http://localhost:5000/dersler", { withCredentials: true });
            setDersler(res.data.dersler);
            setHata(null);
        } catch (err) {
            setHata(err.response?.data?.hata || "Dersler yüklenirken bir hata oluştu.");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        dersleriGetir();
    }, []);

    const filtreliDersler = dersler.filter(d => 
        d.dersAdi.toLowerCase().includes(aramaMetni.toLowerCase())
    );

    const modalAc = (mod, ders = null) => {
        setModalModu(mod);
        if (mod === "duzenle" && ders) {
            setSeciliDers(ders);
            setForm({ dersAdi: ders.dersAdi, aciklama: ders.aciklama, donem: ders.donem });
        } else {
            setSeciliDers(null);
            setForm({ dersAdi: "", aciklama: "", donem: "" });
        }
        setModalAcik(true);
        setAktifMenuId(null);
    };

    const modalKapat = () => {
        setModalAcik(false);
        setForm({ dersAdi: "", aciklama: "", donem: "" });
        setSeciliDers(null);
    };

    const handleFormSubmit = async (e) => {
        e.preventDefault();
        try {
            if (modalModu === "olustur") {
                await axios.post("http://localhost:5000/dersler", form, { withCredentials: true });
            } else {
                await axios.put(`http://localhost:5000/dersler/${seciliDers._id}`, form, { withCredentials: true });
            }
            modalKapat();
            dersleriGetir();
        } catch (err) {
            alert(err.response?.data?.hata || "Bir hata oluştu.");
        }
    };

    const silOnayAc = (ders) => {
        setSilinecekDers(ders);
        setSilModalAcik(true);
        setAktifMenuId(null);
    };

    const handleSil = async () => {
        if (!silinecekDers) return;
        try {
            await axios.delete(`http://localhost:5000/dersler/${silinecekDers._id}`, { withCredentials: true });
            setSilModalAcik(false);
            setSilinecekDers(null);
            dersleriGetir();
        } catch (err) {
            alert(err.response?.data?.hata || "Silme işlemi başarısız.");
        }
    };

    const toggleMenu = (id) => {
        if (aktifMenuId === id) setAktifMenuId(null);
        else setAktifMenuId(id);
    };

    return (
        <div className="max-w-[1440px] mx-auto pb-10">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
                <div>
                    <h1 className={`text-[32px] md:text-[38px] font-bold tracking-tight ${textPrimary}`}>Derslerim</h1>
                    <p className={`mt-1.5 text-[16px] ${textSecondary}`}>
                        Tüm derslerini yönet, öğrenme materyallerini düzenle ve çalışmaya devam et.
                    </p>
                </div>
                <button 
                    onClick={() => navigate("/panel/dersler/yeni")}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-colors ${buttonPrimary}`}
                >
                    <PlusIcon className="w-5 h-5" />
                    Yeni Ders Oluştur
                </button>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                {/* 1. Aktif Dersler */}
                <div className={`p-6 rounded-2xl border ${cardBg} flex items-center gap-5 transition-colors`}>
                    <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center shrink-0">
                        <BookOpenIcon className="w-6 h-6 text-[#4F46E5]" />
                    </div>
                    <div>
                        <p className={`text-[13px] font-semibold tracking-wide uppercase ${textSecondary} mb-1`}>Kayıtlı Dersler</p>
                        <p className={`text-[24px] font-bold ${textPrimary}`}>
                            {loading ? "-" : dersler.length} Aktif Ders
                        </p>
                    </div>
                </div>

                {/* 2. Ortalama Hakimiyet */}
                <div className={`p-6 rounded-2xl border ${cardBg} flex items-center gap-5 transition-colors`}>
                    <div className="w-12 h-12 rounded-xl bg-cyan-500/10 flex items-center justify-center shrink-0">
                        <ChartPieIcon className="w-6 h-6 text-cyan-500" />
                    </div>
                    <div>
                        <p className={`text-[13px] font-semibold tracking-wide uppercase ${textSecondary} mb-1`}>Ortalama Hakimiyet</p>
                        <p className={`text-[24px] font-bold ${textPrimary}`}>Henüz veri yok</p>
                    </div>
                </div>

                {/* 3. Yaklaşan Sınavlar */}
                <div className={`p-6 rounded-2xl border ${cardBg} flex items-center gap-5 transition-colors`}>
                    <div className="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center shrink-0">
                        <CalendarDaysIcon className="w-6 h-6 text-orange-500" />
                    </div>
                    <div>
                        <p className={`text-[13px] font-semibold tracking-wide uppercase ${textSecondary} mb-1`}>Takvim Durumu</p>
                        <p className={`text-[24px] font-bold ${textPrimary}`}>Henüz veri yok</p>
                    </div>
                </div>
            </div>

            {/* Toolbar */}
            <div className={`p-4 rounded-2xl border ${cardBg} mb-8 flex flex-col md:flex-row gap-4 items-center justify-between`}>
                <div className="relative w-full md:w-[350px]">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <MagnifyingGlassIcon className={`w-5 h-5 ${textSecondary}`} />
                    </div>
                    <input
                        type="text"
                        placeholder="Derslerde ara..."
                        value={aramaMetni}
                        onChange={(e) => setAramaMetni(e.target.value)}
                        className={`w-full pl-10 pr-4 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#4F46E5] focus:border-transparent transition-all ${inputBg}`}
                    />
                </div>
            </div>

            {/* Main Content */}
            {loading ? (
                <div className="py-20 flex justify-center">
                    <div className="w-10 h-10 border-4 border-[#4F46E5]/30 border-t-[#4F46E5] rounded-full animate-spin"></div>
                </div>
            ) : hata ? (
                <div className={`p-6 rounded-2xl border border-red-500/20 bg-red-500/5 text-red-500 text-center`}>
                    {hata}
                </div>
            ) : dersler.length === 0 ? (
                <div className={`py-20 flex flex-col items-center justify-center text-center rounded-2xl border border-dashed ${isDark ? 'border-[#26334A]' : 'border-[#CBD5E1]'}`}>
                    <div className="w-16 h-16 rounded-full bg-indigo-500/10 flex items-center justify-center mb-4">
                        <BookOpenIcon className="w-8 h-8 text-[#4F46E5]" />
                    </div>
                    <h3 className={`text-[20px] font-bold ${textPrimary} mb-2`}>Henüz ders eklemedin</h3>
                    <p className={`${textSecondary} max-w-md mb-6`}>İlk dersini oluşturarak öğrenme alanını hazırlamaya başla.</p>
                    <button 
                        onClick={() => navigate("/panel/dersler/yeni")}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-colors ${buttonPrimary}`}
                    >
                        <PlusIcon className="w-5 h-5" />
                        İlk Dersini Oluştur
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filtreliDersler.map(ders => (
                        <div key={ders._id} className={`flex flex-col p-6 rounded-2xl border ${cardBg} transition-colors relative`}>
                            {/* Card Header */}
                            <div className="flex items-start justify-between mb-4">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                                        <BookOpenIcon className="w-5 h-5 text-[#4F46E5]" />
                                    </div>
                                    <div>
                                        {ders.donem && (
                                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-indigo-500/10 text-[#4F46E5] mb-1">
                                                {ders.donem}
                                            </span>
                                        )}
                                        <h3 className={`text-[18px] font-bold line-clamp-1 ${textPrimary}`}>{ders.dersAdi}</h3>
                                    </div>
                                </div>
                                
                                <div className="relative">
                                    <button 
                                        onClick={() => toggleMenu(ders._id)}
                                        className={`p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${textSecondary}`}
                                    >
                                        <EllipsisVerticalIcon className="w-5 h-5" />
                                    </button>
                                    
                                    {aktifMenuId === ders._id && (
                                        <div className={`absolute right-0 mt-1 w-36 rounded-xl border shadow-lg overflow-hidden z-10 ${cardBg}`}>
                                            <button 
                                                onClick={() => modalAc("duzenle", ders)}
                                                className={`w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left hover:bg-black/5 dark:hover:bg-white/5 transition-colors ${textPrimary}`}
                                            >
                                                <PencilSquareIcon className="w-4 h-4" />
                                                Düzenle
                                            </button>
                                            <button 
                                                onClick={() => silOnayAc(ders)}
                                                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-left text-red-500 hover:bg-red-500/10 transition-colors"
                                            >
                                                <TrashIcon className="w-4 h-4" />
                                                Sil
                                            </button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            
                            {/* Description */}
                            <div className="flex-1 mb-6">
                                <p className={`text-[14px] line-clamp-2 ${textSecondary}`}>
                                    {ders.aciklama || "Bu ders için açıklama eklenmemiş."}
                                </p>
                            </div>
                            
                            {/* Actions */}
                            <div className={`pt-4 border-t ${isDark ? 'border-[#26334A]' : 'border-[#E7E5EF]'} flex items-center justify-end`}>
                                <button className={`flex items-center gap-1.5 text-[14px] font-medium hover:text-[#4338CA] transition-colors text-[#4F46E5]`}>
                                    Derse Git <ArrowRightIcon className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                    {filtreliDersler.length === 0 && (
                        <div className={`col-span-full py-10 text-center ${textSecondary}`}>
                            Aramanızla eşleşen ders bulunamadı.
                        </div>
                    )}
                </div>
            )}

            {/* Create / Edit Modal */}
            {modalAcik && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${modalOverlay}`}>
                    <div className={`w-full max-w-md rounded-2xl border shadow-xl overflow-hidden ${cardBg}`} onClick={e => e.stopPropagation()}>
                        <div className={`px-6 py-4 flex items-center justify-between border-b ${isDark ? 'border-[#26334A]' : 'border-[#E7E5EF]'}`}>
                            <h3 className={`text-[18px] font-bold ${textPrimary}`}>
                                {modalModu === "olustur" ? "Yeni Ders Oluştur" : "Dersi Düzenle"}
                            </h3>
                            <button onClick={modalKapat} className={`p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${textSecondary}`}>
                                <XMarkIcon className="w-5 h-5" />
                            </button>
                        </div>
                        <form onSubmit={handleFormSubmit} className="p-6">
                            <div className="space-y-4">
                                <div>
                                    <label className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Ders Adı *</label>
                                    <input 
                                        type="text"
                                        required
                                        value={form.dersAdi}
                                        onChange={e => setForm({...form, dersAdi: e.target.value})}
                                        className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#4F46E5] ${inputBg}`}
                                        placeholder="Örn: İşletim Sistemleri"
                                    />
                                </div>
                                <div>
                                    <label className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Dönem (İsteğe Bağlı)</label>
                                    <input 
                                        type="text"
                                        value={form.donem}
                                        onChange={e => setForm({...form, donem: e.target.value})}
                                        className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#4F46E5] ${inputBg}`}
                                        placeholder="Örn: Güz 2024"
                                    />
                                </div>
                                <div>
                                    <label className={`block text-sm font-medium mb-1.5 ${textPrimary}`}>Açıklama (İsteğe Bağlı)</label>
                                    <textarea 
                                        rows="3"
                                        value={form.aciklama}
                                        onChange={e => setForm({...form, aciklama: e.target.value})}
                                        className={`w-full px-3 py-2 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#4F46E5] resize-none ${inputBg}`}
                                        placeholder="Ders hakkında kısa bir bilgi..."
                                    ></textarea>
                                </div>
                            </div>
                            <div className="mt-8 flex items-center justify-end gap-3">
                                <button 
                                    type="button" 
                                    onClick={modalKapat}
                                    className={`px-4 py-2 rounded-xl font-medium ${isDark ? 'hover:bg-white/5' : 'hover:bg-black/5'} ${textSecondary}`}
                                >
                                    İptal
                                </button>
                                <button 
                                    type="submit"
                                    className={`px-5 py-2 rounded-xl font-medium transition-colors ${buttonPrimary}`}
                                >
                                    {modalModu === "olustur" ? "Oluştur" : "Kaydet"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {silModalAcik && (
                <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 ${modalOverlay}`}>
                    <div className={`w-full max-w-sm rounded-2xl border shadow-xl p-6 ${cardBg}`} onClick={e => e.stopPropagation()}>
                        <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4 mx-auto">
                            <TrashIcon className="w-6 h-6 text-red-500" />
                        </div>
                        <h3 className={`text-[18px] font-bold text-center mb-2 ${textPrimary}`}>Dersi Sil</h3>
                        <p className={`text-center text-[14px] mb-6 ${textSecondary}`}>
                            <strong className={textPrimary}>{silinecekDers?.dersAdi}</strong> dersini silmek istediğinize emin misiniz? Bu işlem geri alınamaz.
                        </p>
                        <div className="flex items-center gap-3">
                            <button 
                                onClick={() => { setSilModalAcik(false); setSilinecekDers(null); }}
                                className={`flex-1 px-4 py-2.5 rounded-xl font-medium border ${isDark ? 'border-[#26334A] hover:bg-white/5' : 'border-[#E7E5EF] hover:bg-black/5'} ${textPrimary}`}
                            >
                                İptal
                            </button>
                            <button 
                                onClick={handleSil}
                                className="flex-1 px-4 py-2.5 rounded-xl font-medium bg-red-500 hover:bg-red-600 text-white transition-colors"
                            >
                                Sil
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default Derslerim;
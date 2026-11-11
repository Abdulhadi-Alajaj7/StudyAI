import SilmeGostergesi from "../components/SilmeGostergesi";
import React, { useState, useEffect, useRef, useCallback } from "react";
import { useOutletContext, useNavigate, useLocation, useParams } from "react-router-dom";
import api from "../api";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import { materyalDosyalariniDogrula } from "../utils/materyalDosyalari.mjs";
import DersOlusturmaAdimlari from "../components/DersOlusturmaAdimlari";
import DersHazirlamaEkrani from "../components/DersHazirlamaEkrani";
import { CloudArrowUpIcon, ArrowRightIcon, CpuChipIcon, DocumentIcon, TrashIcon, ArrowPathIcon } from "@heroicons/react/24/outline";

function MateryalEkle() {
    const { isDark } = useOutletContext();
    const navigate = useNavigate();
    const location = useLocation();
    const { dersId } = useParams();

    // Get created course and uiPrefs from state if available
    const [ders, setDers] = useState(location.state?.ders || null);
    const uiPrefsRef = useRef(
        location.state?.uiPrefs || { renk: "indigo", simge: "desktop", dersKodu: "" }
    );
    const uiPrefs = uiPrefsRef.current;

    const [materyaller, setMateryaller] = useState([]);
    const [siliniyor, setSiliniyor] = useState(false);
    const silmeIstekRef = useRef(false);
    const silmeSurumuRef = useRef(0);
    const [yukleniyor, setYukleniyor] = useState(false);
    const [hata, setHata] = useState("");
    const [bilgi, setBilgi] = useState("");
    const [surukleniyor, setSurukleniyor] = useState(false);
    const fileInputRef = useRef(null);
    const yuklemeDevamEdiyorRef = useRef(false);
    const suruklemeDerinligiRef = useRef(0);
    const [metinModalAcik, setMetinModalAcik] = useState(false);
    const [seciliMetin, setSeciliMetin] = useState("");
    const [metinYukleniyor, setMetinYukleniyor] = useState(false);
    const [durumYuklendi, setDurumYuklendi] = useState(false);
    const [materyalKontrol, setMateryalKontrol] = useState(false);
    const onayIstekRef = useRef(false);
    const [onayModalAcik, setOnayModalAcik] = useState(false);
    const [onaylaniyor, setOnaylaniyor] = useState(false);
    const hazirlaniyor = onaylaniyor || ders?.hazirlamaDurumu === "isleniyor";
    const tumMateryallerHazir = materyaller.length > 0 &&
        materyaller.every(m => m.durum === "hazir" && m.aktifIslemeId);
    const devamButonuAktif = durumYuklendi && !hazirlaniyor && !siliniyor && !yukleniyor && tumMateryallerHazir;

    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    const buttonPrimary = "bg-[#4F46E5] hover:bg-[#4338CA] text-white";

    const dersGetir = useCallback(async () => {
        try {
            const res = await api.get(
                `/dersler/${dersId}/hazirlama`,
                { withCredentials: true }
            );

            const guncelDers = res.data.ders;

            if (!guncelDers) {
                setHata("Ders bulunamadı.");
                return;
            }

            if (guncelDers.materyallerOnaylandi === true) {
                navigate(`/panel/dersler/${dersId}/hazir`, {
                    replace: true,
                    state: { ders: guncelDers, uiPrefs }
                });
                return;
            }

            setDers(guncelDers);
            setDurumYuklendi(true);
        } catch (err) {
            console.error("Ders bilgisi getirilemedi:", err);
            setHata(kullaniciHataMesaji(err, "Ders bilgileri alınamadı."));
        }
    }, [dersId, navigate, uiPrefs]);

    const materyalleriGetir = useCallback(async () => {
        if (silmeIstekRef.current) return;
        const sorguSurumu = silmeSurumuRef.current;
        try {
            const res = await api.get(`/materyaller/ders/${dersId}`, { withCredentials: true });
            if (sorguSurumu === silmeSurumuRef.current && !silmeIstekRef.current) {
                setMateryaller(res.data.materyaller || []);
            }
        } catch (err) {
            console.error("Materyaller getirilemedi", err);
        }
    }, [dersId]);


    useEffect(() => {
        let aktif = true;
        let timer;
        const yenile = async () => {
            await Promise.all([dersGetir(), materyalleriGetir()]);
            if (aktif) timer = setTimeout(yenile, 3000);
        };
        void yenile();
        return () => { aktif = false; clearTimeout(timer); };
    }, [dersGetir, materyalleriGetir]);

    const handleDosyaSec = () => {
        if (durumYuklendi && !hazirlaniyor && !silmeIstekRef.current && !yuklemeDevamEdiyorRef.current) {
            fileInputRef.current?.click();
        }
    };

    const dosyalariYukle = async (dosyaListesi) => {
        if (!durumYuklendi || hazirlaniyor || silmeIstekRef.current || yuklemeDevamEdiyorRef.current) return;

        const { gecerliDosyalar, hatalar: dogrulamaHatalari } =
            materyalDosyalariniDogrula(dosyaListesi);
        if (gecerliDosyalar.length === 0) {
            setBilgi("");
            setHata(dogrulamaHatalari.join("\n"));
            return;
        }

        yuklemeDevamEdiyorRef.current = true;
        setYukleniyor(true);
        setHata("");
        setBilgi("");

        const basariliDosyalar = [];
        const basarisizDosyalar = [...dogrulamaHatalari];

        try {
            for (const dosya of gecerliDosyalar) {
                const formData = new FormData();
                formData.append("dosyalar", dosya);

                try {
                    await api.post(`/materyaller/ders/${dersId}`, formData, {
                        withCredentials: true
                    });
                    basariliDosyalar.push(dosya.name);
                } catch (err) {
                    basarisizDosyalar.push(
                        `${dosya.name}: ${kullaniciHataMesaji(err, "Dosya yüklenemedi. Lütfen tekrar deneyin.")}`
                    );
                }
            }

            await materyalleriGetir();

            if (basariliDosyalar.length > 0) {
                setBilgi(`${basariliDosyalar.length} dosya başarıyla yüklendi ve işlemeye alındı.`);
            }
            if (basarisizDosyalar.length > 0) {
                setHata(
                    `Bazı dosyalar yüklenemedi. Başarısız dosyaları kontrol edin:\n${basarisizDosyalar.join("\n")}`
                );
            }
        } finally {
            yuklemeDevamEdiyorRef.current = false;
            setYukleniyor(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    const handleDosyaYukle = (e) => {
        void dosyalariYukle(e.target.files);
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        e.stopPropagation();
        suruklemeDerinligiRef.current += 1;
        if (!yukleniyor) setSurukleniyor(true);
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer) e.dataTransfer.dropEffect = yukleniyor ? "none" : "copy";
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        suruklemeDerinligiRef.current = Math.max(0, suruklemeDerinligiRef.current - 1);
        if (suruklemeDerinligiRef.current === 0) setSurukleniyor(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        suruklemeDerinligiRef.current = 0;
        setSurukleniyor(false);

        if (yuklemeDevamEdiyorRef.current) {
            setHata("Dosya yükleme devam ediyor. Lütfen işlem tamamlandıktan sonra tekrar deneyin.");
            return;
        }
        void dosyalariYukle(e.dataTransfer.files);
    };

    const materyalSil = async (id) => {
        if (!durumYuklendi || hazirlaniyor || silmeIstekRef.current) return;
        if (!window.confirm("Bu materyali silmek istediğinize emin misiniz?")) return;
        silmeIstekRef.current = true;
        silmeSurumuRef.current++;
        setSiliniyor(true);
        setHata("");
        try {
            await api.delete(`/materyaller/${id}`, { withCredentials: true });
            setMateryaller(onceki => onceki.filter(m => m._id !== id));
        } catch (err) {
            setHata(kullaniciHataMesaji(err, "Materyal silinirken bir hata oluştu. Materyaliniz korundu."));
        } finally {
            silmeIstekRef.current = false;
            setSiliniyor(false);
        }
    };

    const handleMetinCikarYenidenDene = async (id) => {
        if (!durumYuklendi || hazirlaniyor) return;
        try {
            await api.post(`/materyaller/${id}/metin-cikar`, {}, { withCredentials: true });
            materyalleriGetir();
        } catch (err) {
            setHata(kullaniciHataMesaji(err, "Yeniden deneme başarısız."));
        }
    };

    const handleMetinGor = async (id) => {
        setMetinModalAcik(true);
        setMetinYukleniyor(true);
        setSeciliMetin("");
        try {
            const res = await api.get(`/materyaller/${id}`, { withCredentials: true });
            setSeciliMetin(res.data.materyal.cikarilanMetin || "Bu dosyadan metin çıkarılamamış veya boş.");
        } catch {
            setSeciliMetin("Metin getirilirken hata oluştu.");
        } finally {
            setMetinYukleniyor(false);
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
        if (devamButonuAktif) setOnayModalAcik(true);
    };
    const handleOnayla = async () => {
        if (onayIstekRef.current || hazirlaniyor || silmeIstekRef.current) return;
        onayIstekRef.current = true;
        setOnaylaniyor(true);
        setMateryalKontrol(false);
        setOnayModalAcik(false);
        setHata("");
        try {
            const res = await api.post(`/dersler/${dersId}/materyaller/onayla`, {}, { withCredentials: true });
            setDers(res.data.ders);
            await dersGetir();
        } catch (err) {
            setHata(kullaniciHataMesaji(err, "Hazırlama başlatılamadı. Durumu kontrol edip yeniden deneyin."));
            // Yanıt kaybında sunucu işlemi sürüyor olabilir: yeniden üretim isteme.
            await dersGetir();
        } finally {
            onayIstekRef.current = false;
            setOnaylaniyor(false);
        }
    };

    const hazirlamaModalAcik = hazirlaniyor || (ders?.hazirlamaDurumu === "hata" && !materyalKontrol);


    return (
        <>
        <div className="max-w-[1200px] mx-auto pb-10" inert={hazirlamaModalAcik || siliniyor || undefined} aria-hidden={hazirlamaModalAcik || siliniyor || undefined}>
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
                            <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm whitespace-pre-line" role="alert">
                                {hata}
                            </div>
                        )}
                        {bilgi && (
                            <div className="mb-6 p-4 rounded-xl bg-green-500/10 border border-green-500/20 text-green-600 dark:text-green-400 text-sm" role="status">
                                {bilgi}
                            </div>
                        )}
                        <div
                            onDragEnter={handleDragEnter}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            aria-disabled={yukleniyor || !durumYuklendi}
                            className={`border-2 border-dashed rounded-2xl p-10 md:p-16 flex flex-col items-center justify-center text-center transition-all ${surukleniyor && !yukleniyor
                                ? 'border-[#4F46E5] bg-[#4F46E5]/10 scale-[1.01]'
                                : isDark
                                    ? 'border-[#26334A] bg-[#0B1120]/50'
                                    : 'border-[#CBD5E1] bg-[#F8F7FC]/50'
                                } ${yukleniyor ? 'opacity-70' : ''}`}
                        >
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
                                disabled={yukleniyor || !durumYuklendi}
                                className="hidden"
                                accept=".pdf,.docx,.pptx,.txt"
                            />

                            <button
                                type="button"
                                onClick={handleDosyaSec}
                                disabled={yukleniyor || !durumYuklendi}
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
                                <span className={textPrimary}>{materyaller.filter(m => m.durum === "hazir").length} / {materyaller.length} materyalin metni hazır</span>
                            </div>
                            <div className={`w-full h-1.5 rounded-full ${isDark ? 'bg-[#1B2942]' : 'bg-[#E2E8F0]'}`}>
                                {/* Empty progress bar */}
                            </div>
                        </div>

                        <div className="flex-1">
                            <h4 className={`text-[11px] font-bold uppercase tracking-widest ${textSecondary} mb-3`}>İŞLEM DURUMLARI</h4>

                            <div className="space-y-2">
                                <div className={`flex items-center justify-between p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>İşleniyor / Yükleniyor</span>
                                    <span className="font-bold text-[#4F46E5]">{materyaller.filter(m => m.durum === 'isleniyor' || m.durum === 'yuklendi').length}</span>
                                </div>
                                <div className={`flex items-center justify-between p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>Hazır</span>
                                    <span className="font-bold text-green-500">{materyaller.filter(m => m.durum === 'hazir').length}</span>
                                </div>
                                <div className={`flex items-center justify-between p-3 rounded-lg border ${isDark ? 'border-[#26334A] bg-[#0B1120]' : 'border-[#E7E5EF] bg-white'}`}>
                                    <span className={`text-[13px] font-medium ${isDark ? 'text-[#7F8AA3]' : 'text-[#94A3B8]'}`}>Hata</span>
                                    <span className="font-bold text-red-500">{materyaller.filter(m => m.durum === 'hata').length}</span>
                                </div>
                            </div>
                        </div>

                        <div className={`mt-6 pt-4 border-t flex items-center justify-between text-[11px] font-medium ${isDark ? 'border-[#26334A] text-[#7F8AA3]' : 'border-[#E7E5EF] text-[#94A3B8]'}`}>
                            <div className="flex items-center gap-1.5">
                                <span className={`w-1.5 h-1.5 rounded-full ${materyaller.some(m => m.durum === 'isleniyor' || m.durum === 'yuklendi') ? 'bg-[#4F46E5] animate-pulse' : 'bg-green-500'}`}></span>
                                {materyaller.some(m => m.durum === 'isleniyor' || m.durum === 'yuklendi') ? 'İşlemler devam ediyor...' : 'Metin hazırlama durumu güncel.'}
                            </div>
                            <span>{materyaller.some(m => m.durum === 'isleniyor' || m.durum === 'yuklendi') ? 'Aktif' : 'Beklemede'}</span>
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
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${materyal.dosyaTuru === 'pdf' ? 'bg-red-500/10 text-red-500' :
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
                                            <span className={`capitalize ${materyal.durum === 'hazir' ? 'text-green-500' : materyal.durum === 'hata' ? 'text-red-500' : 'text-yellow-500'}`}>
                                                {materyal.durum === 'hazir' ? 'Hazır' : materyal.durum === 'isleniyor' ? 'İşleniyor' : materyal.durum === 'hata' ? 'Hata' : materyal.durum}
                                            </span>
                                            {materyal.durum === 'isleniyor' || materyal.durum === 'yuklendi' ? (
                                                <ArrowPathIcon className="w-3 h-3 animate-spin text-yellow-500" />
                                            ) : null}
                                        </div>
                                        {materyal.durum === 'hata' && (
                                            <div className="text-[11px] text-red-500 mt-1">
                                                {materyal.islemeHatasi}
                                            </div>
                                        )}
                                    </div>
                                </div>
                                <div className="flex items-center gap-2">
                                    {materyal.durum === 'hazir' && (
                                        <button
                                            onClick={() => handleMetinGor(materyal._id)}
                                            className="px-3 py-1.5 rounded-lg border border-green-500 text-green-500 hover:bg-green-500/10 transition-colors text-[12px] font-medium"
                                        >
                                            Çıkarılan Metni Gör
                                        </button>
                                    )}
                                    {materyal.durum === 'hata' && (
                                        <button
                                            onClick={() => handleMetinCikarYenidenDene(materyal._id)}
                                            className="px-3 py-1.5 rounded-lg border border-[#4F46E5] text-[#4F46E5] hover:bg-[#4F46E5]/10 transition-colors text-[12px] font-medium"
                                        >
                                            Yeniden Dene
                                        </button>
                                    )}
                                    <button
                                        onClick={() => materyalSil(materyal._id)}
                                        className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors"
                                        title="Sil"
                                    >
                                        <TrashIcon className="w-5 h-5" />
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="mt-8 pt-6 border-t border-[#E7E5EF] dark:border-[#26334A] flex flex-col sm:flex-row items-center justify-between gap-4">
                <button
                    type="button"
                    disabled
                    className={`w-full sm:w-auto px-6 py-3 rounded-xl font-medium border opacity-50 cursor-not-allowed ${isDark
                        ? "border-[#26334A] text-[#F8FAFC]"
                        : "border-[#E7E5EF] text-[#0F172A]"
                        }`}
                >
                    Daha Sonra Ekle
                    {/* */}
                </button>
                <div className="flex items-center gap-4 w-full sm:w-auto">
                    <button
                        onClick={handleNext}
                        disabled={!devamButonuAktif}
                        className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${devamButonuAktif
                            ? buttonPrimary
                            : "bg-gray-400 text-white opacity-60 cursor-not-allowed"
                            }`}
                    >
                        {!durumYuklendi ? "Durum Kontrol Ediliyor..." : yukleniyor ? "Materyaller Yükleniyor..." :
                            materyaller.length === 0 ? "Materyal Yükleyin" : !tumMateryallerHazir ? "Materyalleri Kontrol Edin" : "Devam"}

                        {devamButonuAktif && (
                            <ArrowRightIcon className="w-5 h-5" />
                        )}
                    </button>
                </div>
            </div>

            {/* Metin Görüntüleme Modalı */}
            {/* Materyal Onay Modalı */}
            {onayModalAcik && !hazirlamaModalAcik && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="materyal-onay-baslik"
                        className={`w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border shadow-2xl ${cardBg}`}
                    >
                        {/* Başlık */}
                        <div className={`px-6 py-5 border-b ${isDark ? "border-[#26334A]" : "border-[#E7E5EF]"
                            }`}>
                            <div className="flex items-start gap-3">
                                <div className="w-11 h-11 rounded-xl bg-[#4F46E5]/10 flex items-center justify-center shrink-0">
                                    <span className="text-[#4F46E5] text-xl font-bold">
                                        ✓
                                    </span>
                                </div>

                                <div className="flex-1">
                                    <h3
                                        id="materyal-onay-baslik"
                                        className={`text-[19px] font-bold ${textPrimary}`}
                                    >
                                        Materyallerinizi Onaylıyor musunuz?
                                    </h3>

                                    <p className={`text-[13px] mt-2 leading-relaxed ${textSecondary}`}>
                                        Yüklediğiniz materyallerden yapay zekâ destekli bir konu haritası oluşturulacaktır.
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => setOnayModalAcik(false)}
                                    aria-label="Kapat"
                                    className={`text-[22px] leading-none transition-opacity hover:opacity-70 ${textSecondary}`}
                                >
                                    ×
                                </button>
                            </div>
                        </div>

                        {/* İçerik */}
                        <div className="p-6">
                            <div className={`rounded-xl border p-4 ${isDark
                                ? "bg-[#0B1120]/50 border-[#26334A]"
                                : "bg-[#F8F7FC] border-[#E7E5EF]"
                                }`}>
                                <div className="flex items-start gap-3">
                                    <span className="text-green-500 font-bold text-lg">
                                        ✓
                                    </span>

                                    <div>
                                        <p className={`text-[14px] font-bold ${textPrimary}`}>
                                            Materyallerinizi kontrol edin
                                        </p>

                                        <p className={`text-[13px] mt-1 ${textSecondary}`}>
                                            Hazırlama işlemi sırasında dosyalarınız değiştirilemeyecektir.
                                        </p>
                                    </div>
                                </div>

                                <div className={`my-4 border-t ${isDark ? "border-[#26334A]" : "border-[#E7E5EF]"
                                    }`} />

                                <div className="flex items-start gap-3">
                                    <span className="text-amber-500 text-lg">
                                        !
                                    </span>

                                    <div>
                                        <p className={`text-[14px] font-bold ${textPrimary}`}>
                                            Önemli Bilgilendirme
                                        </p>

                                        <p className={`text-[13px] mt-1 leading-relaxed ${textSecondary}`}>
                                            Devam etmeden önce tüm dosyalarınızı kontrol edin. Ders oluşturma işlemi tamamlandıktan sonra materyal ekleyemez, silemez veya değiştiremezsiniz.
                                        </p>
                                    </div>
                                </div>
                            </div>

                            <p className={`mt-5 text-[14px] font-medium ${textPrimary}`}>
                                Tüm materyallerinizin doğru ve eksiksiz olduğundan
                                emin misiniz?
                            </p>
                        </div>

                        {/* Butonlar */}
                        <div className={`px-6 py-4 border-t flex flex-col-reverse sm:flex-row justify-end gap-3 ${isDark
                            ? "border-[#26334A] bg-[#0B1120]/30"
                            : "border-[#E7E5EF] bg-[#F8F7FC]"
                            }`}>
                            <button
                                type="button"
                                onClick={() => setOnayModalAcik(false)}
                                className={`px-5 py-3 rounded-xl border font-medium transition-colors ${isDark
                                    ? "border-[#26334A] text-[#F8FAFC] hover:bg-white/5"
                                    : "border-[#E7E5EF] text-[#0F172A] hover:bg-black/5"
                                    }`}
                            >
                                Geri Dön ve Kontrol Et
                            </button>

                            <button
                                type="button"
                                onClick={handleOnayla}
                                disabled={onaylaniyor}
                                className={`px-5 py-3 rounded-xl font-medium transition-colors ${buttonPrimary} ${onaylaniyor ? "opacity-60 cursor-not-allowed" : ""
                                    }`}
                            >
                                {onaylaniyor ? "Hazırlama Başlatılıyor..." : "Onayla ve Dersi Hazırla"}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {metinModalAcik && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div className={`w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border shadow-xl overflow-hidden ${cardBg}`} onClick={e => e.stopPropagation()}>
                        <div className={`px-6 py-4 flex items-center justify-between border-b ${isDark ? 'border-[#26334A]' : 'border-[#E7E5EF]'}`}>
                            <h3 className={`text-[18px] font-bold ${textPrimary}`}>Çıkarılan Metin</h3>
                            <button onClick={() => setMetinModalAcik(false)} className={`p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/5 ${textSecondary}`}>
                                Kapat
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto">
                            {metinYukleniyor ? (
                                <div className="py-10 flex justify-center">
                                    <div className="w-8 h-8 border-4 border-[#4F46E5]/30 border-t-[#4F46E5] rounded-full animate-spin"></div>
                                </div>
                            ) : (
                                <pre className={`whitespace-pre-wrap text-[13px] font-mono leading-relaxed ${textPrimary}`}>
                                    {seciliMetin}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
        {siliniyor && <SilmeGostergesi isDark={isDark} materyal />}
        {hazirlamaModalAcik && <DersHazirlamaEkrani
            ders={ders}
            isDark={isDark}
            baslatiliyor={onaylaniyor && ders?.hazirlamaDurumu !== "isleniyor"}
            hata={hata}
            yenidenDene={handleOnayla}
            materyalleriKontrolEt={() => setMateryalKontrol(true)}
        />}
        </>
    );
}

export default MateryalEkle;

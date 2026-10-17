
import React, { useState } from "react";
import {
    SparklesIcon,
    ArrowPathIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ExclamationTriangleIcon,
    BookOpenIcon
} from "@heroicons/react/24/outline";

/**
 * Ders Konu Haritası Bileşeni
 *
 * Durumları destekler:
 * - Henüz harita oluşturulmadı
 * - Hazır materyal bulunmuyor
 * - Harita oluşturuluyor (yükleniyor / animasyon)
 * - Harita başarıyla oluşturuldu
 * - Harita oluşturma başarısız
 * - Daha önce oluşturulmuş harita mevcut
 * - Materyaller değiştiği için harita güncelliğini kaybetti
 *
 * saltOkunur:
 * true olduğunda harita görüntülenir, oluşturma butonları gizlenir.
 */
function KonuHaritasiBolumu({
    isDark,
    konuHaritasi,
    yukleniyor,
    olusturuluyor,
    hata,
    guncelMi,
    hazirMateryalSayisi,
    onOlustur,
    saltOkunur = false
}) {
    // Açık/kapalı ana konular state'i (tümü başlangıçta açık olsun)
    const [acikKonular, setAcikKonular] = useState({});

    const toggleKonu = (konuId) => {
        setAcikKonular(prev => ({
            ...prev,
            [konuId]: prev[konuId] === undefined ? false : !prev[konuId]
        }));
    };

    const cardBg = isDark ? "bg-[#162137] border-[#26334A]" : "bg-white border-[#E7E5EF]";
    const textPrimary = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const textSecondary = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    const itemBg = isDark ? "bg-[#0B1120]/60 border-[#26334A]" : "bg-[#F8F7FC] border-[#E7E5EF]";

    const anaKonular = konuHaritasi?.anaKonular || [];

    return (
        <div className={`p-6 rounded-2xl border ${cardBg} transition-all`}>
            {/* Başlık ve Eylem Alanı */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <SparklesIcon className="w-5 h-5 text-[#4F46E5]" />
                        <h3 className={`text-[18px] font-bold ${textPrimary}`}>Ders Konu Haritası</h3>
                        {konuHaritasi?.durum === "hazir" && (
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                guncelMi
                                    ? (isDark ? "bg-emerald-500/20 text-emerald-400" : "bg-emerald-100 text-emerald-700")
                                    : (isDark ? "bg-amber-500/20 text-amber-400" : "bg-amber-100 text-amber-700")
                            }`}>
                                {guncelMi ? "Güncel" : "Güncelleme Gerekli"}
                            </span>
                        )}
                    </div>
                    <p className={`text-[13px] ${textSecondary}`}>
                        Ders materyallerinden Gemini yapay zekâsı ile çıkarılan hiyerarşik ana ve alt konu taksonomisi.
                    </p>
                </div>

                {/* Butonlar */}
                {!saltOkunur && (
                    <div className="flex items-center gap-3">
                        {hazirMateryalSayisi > 0 && (
                            <button
                                onClick={onOlustur}
                                disabled={olusturuluyor || yukleniyor}
                                className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-[13px] transition-all shadow-sm ${
                                    olusturuluyor
                                        ? "bg-[#4F46E5]/60 text-white cursor-wait"
                                        : "bg-[#4F46E5] hover:bg-[#4338CA] text-white active:scale-95"
                                }`}
                            >
                                {olusturuluyor ? (
                                    <>
                                        <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                        <span>Yapay Zekâ Analiz Ediyor...</span>
                                    </>
                                ) : anaKonular.length > 0 ? (
                                    <>
                                        <ArrowPathIcon className="w-4 h-4" />
                                        <span>{guncelMi ? "Yeniden Oluştur" : "Haritayı Güncelle"}</span>
                                    </>
                                ) : (
                                    <>
                                        <SparklesIcon className="w-4 h-4" />
                                        <span>Konu Haritası Oluştur</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}
            </div>

            {/* Güncellik Uyarısı (Materyaller değiştiyse) */}
            {konuHaritasi?.durum === "hazir" && !guncelMi && !olusturuluyor && (
                <div className={`p-4 rounded-xl border mb-5 flex items-start gap-3 ${
                    isDark ? "bg-amber-500/10 border-amber-500/30 text-amber-200" : "bg-amber-50 border-amber-200 text-amber-800"
                }`}>
                    <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="text-[13px]">
                        <p className="font-bold">Yeni veya değişen materyal tespit edildi!</p>
                        <p className="opacity-90 mt-0.5">
                            {saltOkunur
                                ? "Dersin konu haritası güncel görünmüyor. Onaylanmış dersin konu haritası bu ekrandan yeniden oluşturulamaz."
                                : 'Dersteki hazır materyaller veya sürümler değiştiği için bu konu haritası güncelliğini kaybetmiş olabilir. Yukarıdaki "Haritayı Güncelle" butonuyla yeni haritayı oluşturabilirsiniz.'}
                        </p>
                    </div>
                </div>
            )}

            {/* Hata Bildirimi */}
            {hata && !olusturuluyor && (
                <div className={`p-4 rounded-xl border mb-5 flex items-start gap-3 ${
                    isDark ? "bg-rose-500/10 border-rose-500/30 text-rose-200" : "bg-rose-50 border-rose-200 text-rose-800"
                }`}>
                    <ExclamationTriangleIcon className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div className="text-[13px]">
                        <p className="font-bold">Konu haritası oluşturulamadı</p>
                        <p className="opacity-90 mt-0.5">{hata}</p>
                    </div>
                </div>
            )}

            {/* İÇERİK DURUMLARI */}
            {yukleniyor ? (
                <div className="py-16 flex flex-col items-center justify-center text-center">
                    <div className="w-9 h-9 border-3 border-[#4F46E5]/30 border-t-[#4F46E5] rounded-full animate-spin mb-3"></div>
                    <p className={`text-[13px] ${textSecondary}`}>Konu haritası bilgileri yükleniyor...</p>
                </div>
            ) : olusturuluyor ? (
                <div className="py-16 flex flex-col items-center justify-center text-center">
                    <div className="relative mb-4">
                        <div className="w-14 h-14 rounded-full bg-[#4F46E5]/10 flex items-center justify-center text-[#4F46E5] animate-pulse">
                            <SparklesIcon className="w-7 h-7" />
                        </div>
                        <ArrowPathIcon className="w-5 h-5 text-[#4F46E5] animate-spin absolute -bottom-1 -right-1 bg-white dark:bg-[#162137] rounded-full" />
                    </div>
                    <h4 className={`text-[16px] font-bold ${textPrimary} mb-1`}>Gemini Konuları Haritalıyor</h4>
                    <p className={`text-[13px] ${textSecondary} max-w-md`}>
                        Yüklenen bütün materyallerin aktif metin parçaları taranıyor, ana başlıklar ve alt konular hiyerarşik olarak oluşturuluyor. Lütfen bekleyin...
                    </p>
                </div>
            ) : hazirMateryalSayisi === 0 ? (
                <div className={`p-8 rounded-xl border border-dashed text-center flex flex-col items-center justify-center ${
                    isDark ? "border-[#26334A] bg-[#0B1120]/30" : "border-[#E7E5EF] bg-[#F8F7FC]"
                }`}>
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-[#4F46E5] mb-3">
                        <BookOpenIcon className="w-6 h-6" />
                    </div>
                    <h4 className={`text-[15px] font-bold ${textPrimary} mb-1`}>Hazır Materyal Bulunmuyor</h4>
                    <p className={`text-[13px] ${textSecondary} max-w-sm`}>
                        Konu haritası oluşturabilmek için derse en az bir materyal (PDF, DOCX vb.) eklemeniz ve metin çıkarımının tamamlanması gerekir.
                    </p>
                </div>
            ) : anaKonular.length === 0 ? (
                <div className={`p-8 rounded-xl border border-dashed text-center flex flex-col items-center justify-center ${
                    isDark ? "border-[#26334A] bg-[#0B1120]/30" : "border-[#E7E5EF] bg-[#F8F7FC]"
                }`}>
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-[#4F46E5] mb-3">
                        <SparklesIcon className="w-6 h-6" />
                    </div>
                    <h4 className={`text-[15px] font-bold ${textPrimary} mb-1`}>Henüz Konu Haritası Oluşturulmadı</h4>
                    <p className={`text-[13px] ${textSecondary} max-w-md mb-4`}>
                        {saltOkunur
                            ? "Bu ders için görüntülenebilecek bir konu haritası bulunmuyor."
                            : `${hazirMateryalSayisi} adet hazır materyaliniz mevcut. Yapay zekâ destekli konu hiyerarşisini çıkarmak için oluşturma işlemini başlatabilirsiniz.`}
                    </p>
                    {!saltOkunur && (
                        <button
                            onClick={onOlustur}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-[13px] bg-[#4F46E5] hover:bg-[#4338CA] text-white transition-all shadow-sm active:scale-95"
                        >
                            <SparklesIcon className="w-4 h-4" />
                            Konu Haritası Oluştur
                        </button>
                    )}
                </div>
            ) : (
                /* BAŞARILI KONU LİSTESİ */
                <div className="space-y-3">
                    <div className="flex items-center justify-between text-[12px] px-1 mb-2">
                        <span className={`${textSecondary}`}>
                            Toplam <strong>{anaKonular.length}</strong> Ana Konu, <strong>{konuHaritasi?.toplamAltKonuSayisi || 0}</strong> Alt Konu
                        </span>
                        {konuHaritasi?.sonOlusturmaTarihi && (
                            <span className={`${textSecondary}`}>
                                Son analiz: {new Date(konuHaritasi.sonOlusturmaTarihi).toLocaleDateString("tr-TR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                            </span>
                        )}
                    </div>

                    {anaKonular.map((ana, index) => {
                        const isAcik = acikKonular[ana.konuId] !== false;
                        const altSayisi = ana.altKonular?.length || 0;

                        return (
                            <div
                                key={ana.konuId || index}
                                className={`rounded-xl border overflow-hidden transition-all ${itemBg}`}
                            >
                                {/* Ana Konu Başlığı */}
                                <div
                                    onClick={() => toggleKonu(ana.konuId)}
                                    className="p-4 flex items-center justify-between cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-lg bg-[#4F46E5]/10 flex items-center justify-center text-[#4F46E5] font-bold text-[13px] shrink-0">
                                            {ana.sira || index + 1}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className={`text-[15px] font-bold ${textPrimary}`}>{ana.baslik}</h4>
                                                <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                                    isDark ? "bg-[#1E293B] text-[#94A3B8]" : "bg-[#E2E8F0] text-[#64748B]"
                                                }`}>
                                                    {altSayisi} Alt Konu
                                                </span>
                                            </div>
                                            {ana.aciklama && (
                                                <p className={`text-[12px] ${textSecondary} mt-0.5 line-clamp-1`}>
                                                    {ana.aciklama}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 text-gray-400">
                                        {isAcik ? (
                                            <ChevronDownIcon className="w-4 h-4" />
                                        ) : (
                                            <ChevronRightIcon className="w-4 h-4" />
                                        )}
                                    </div>
                                </div>

                                {/* Alt Konular */}
                                {isAcik && altSayisi > 0 && (
                                    <div className={`px-4 pb-3 pt-1 border-t space-y-2 ${
                                        isDark ? "border-[#26334A]/60 bg-[#0B1120]/40" : "border-[#E7E5EF]/60 bg-white"
                                    }`}>
                                        {ana.altKonular.map((alt, sIndex) => (
                                            <div
                                                key={alt.konuId || sIndex}
                                                className={`p-2.5 rounded-lg border flex items-start gap-2.5 transition-colors ${
                                                    isDark ? "bg-[#162137]/60 border-[#26334A]/80" : "bg-[#F8F7FC] border-[#E7E5EF]"
                                                }`}
                                            >
                                                <div className="w-1.5 h-1.5 rounded-full bg-[#4F46E5] mt-1.5 shrink-0"></div>
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center justify-between">
                                                        <p className={`text-[13px] font-medium ${textPrimary}`}>
                                                            {alt.baslik}
                                                        </p>
                                                        <span className="text-[10px] font-mono text-gray-400">
                                                            {alt.konuId}
                                                        </span>
                                                    </div>
                                                    {alt.aciklama && (
                                                        <p className={`text-[11px] ${textSecondary} mt-0.5`}>
                                                            {alt.aciklama}
                                                        </p>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

export default KonuHaritasiBolumu;

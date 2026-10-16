
import React, { useState } from "react";

import {
    SparklesIcon,
    ArrowPathIcon,
    ChevronDownIcon,
    ChevronRightIcon,
    ExclamationTriangleIcon,
    BookOpenIcon,
    LockClosedIcon,
    CheckCircleIcon,
} from "@heroicons/react/24/outline";

/**
 * Ders konu haritasını görüntüler.
 *
 * Onaylanan derslerde konu haritası salt okunurdur.
 * Eski derslerde, izin verilmişse harita oluşturma
 * ve güncelleme işlemleri kullanılabilir.
 */
function KonuHaritasiBolumu({
    dersId,
    isDark,
    konuHaritasi,
    yukleniyor = false,
    olusturuluyor = false,
    hata = "",
    guncelMi = true,
    hazirMateryalSayisi = 0,
    onOlustur,
    materyallerKilitli = false,
}) {
    const [acikKonular, setAcikKonular] = useState({});

    const cardBg = isDark
        ? "bg-[#162137] border-[#26334A]"
        : "bg-white border-[#E7E5EF]";

    const textPrimary = isDark
        ? "text-[#F8FAFC]"
        : "text-[#0F172A]";

    const textSecondary = isDark
        ? "text-[#A7B0C2]"
        : "text-[#64748B]";

    const itemBg = isDark
        ? "bg-[#0B1120]/60 border-[#26334A]"
        : "bg-[#F8F7FC] border-[#E7E5EF]";

    const anaKonular = Array.isArray(
        konuHaritasi?.anaKonular
    )
        ? konuHaritasi.anaKonular
        : [];

    const toplamAltKonuSayisi = anaKonular.reduce(
        (toplam, anaKonu) =>
            toplam +
            (Array.isArray(anaKonu.altKonular)
                ? anaKonu.altKonular.length
                : 0),
        0
    );

    const haritaHazir =
        konuHaritasi?.durum === "hazir" &&
        anaKonular.length > 0;

    // Yeni derslerde onaydan sonra hiçbir üretim
    // veya güncelleme butonu gösterilmez.
    const haritaDegistirilebilir =
        !materyallerKilitli &&
        typeof onOlustur === "function";

    const olusturmaButonuGoster =
        haritaDegistirilebilir &&
        hazirMateryalSayisi > 0;

    const haritaGuncel =
        materyallerKilitli && haritaHazir
            ? true
            : guncelMi;

    const toggleKonu = (konuId) => {
        setAcikKonular((onceki) => ({
            ...onceki,
            [konuId]:
                onceki[konuId] === undefined
                    ? false
                    : !onceki[konuId],
        }));
    };

    const konuAcikMi = (konuId) =>
        acikKonular[konuId] !== false;

    const olusturmayiBaslat = () => {
        if (
            !haritaDegistirilebilir ||
            yukleniyor ||
            olusturuluyor
        ) {
            return;
        }

        onOlustur();
    };

    const analizTarihi = konuHaritasi?.sonOlusturmaTarihi
        ? new Date(
            konuHaritasi.sonOlusturmaTarihi
        )
        : null;

    const tarihGecerli =
        analizTarihi &&
        !Number.isNaN(analizTarihi.getTime());

    return (
        <div
            id="konu-haritasi-bolumu"
            className={`p-6 rounded-2xl border ${cardBg} transition-all`}
        >
            {/* Başlık ve İşlem Alanı */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                <div>
                    <div className="flex flex-wrap items-center gap-2 mb-1">
                        <SparklesIcon className="w-5 h-5 text-[#4F46E5]" />

                        <h3
                            className={`text-[18px] font-bold ${textPrimary}`}
                        >
                            Ders Konu Haritası
                        </h3>

                        {haritaHazir && (
                            <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                                    haritaGuncel
                                        ? isDark
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : "bg-emerald-100 text-emerald-700"
                                        : isDark
                                            ? "bg-amber-500/20 text-amber-400"
                                            : "bg-amber-100 text-amber-700"
                                }`}
                            >
                                {haritaGuncel
                                    ? "Güncel"
                                    : "Güncelleme Gerekli"}
                            </span>
                        )}

                        {materyallerKilitli && (
                            <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                    isDark
                                        ? "bg-indigo-500/20 text-indigo-300"
                                        : "bg-indigo-100 text-indigo-700"
                                }`}
                            >
                                <LockClosedIcon className="w-3 h-3" />
                                Onaylandı
                            </span>
                        )}
                    </div>

                    <p
                        className={`text-[13px] ${textSecondary}`}
                    >
                        Ders materyallerinden Gemini yapay
                        zekâsı ile çıkarılan hiyerarşik ana
                        ve alt konu haritası.
                    </p>
                </div>

                {/* Yalnızca değiştirilebilir derslerde */}
                {olusturmaButonuGoster && (
                    <button
                        type="button"
                        onClick={olusturmayiBaslat}
                        disabled={
                            olusturuluyor || yukleniyor
                        }
                        className={`flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-medium text-[13px] transition-all shadow-sm ${
                            olusturuluyor
                                ? "bg-[#4F46E5]/60 text-white cursor-wait"
                                : "bg-[#4F46E5] hover:bg-[#4338CA] text-white active:scale-95"
                        }`}
                    >
                        {olusturuluyor ? (
                            <>
                                <ArrowPathIcon className="w-4 h-4 animate-spin" />
                                <span>
                                    Yapay Zekâ Analiz Ediyor...
                                </span>
                            </>
                        ) : anaKonular.length > 0 ? (
                            <>
                                <ArrowPathIcon className="w-4 h-4" />
                                <span>
                                    {haritaGuncel
                                        ? "Yeniden Oluştur"
                                        : "Haritayı Güncelle"}
                                </span>
                            </>
                        ) : (
                            <>
                                <SparklesIcon className="w-4 h-4" />
                                <span>
                                    Konu Haritası Oluştur
                                </span>
                            </>
                        )}
                    </button>
                )}
            </div>

            {/* Onaylanan Ders Bilgilendirmesi */}
            {materyallerKilitli && haritaHazir && (
                <div
                    className={`mb-5 p-4 rounded-xl border flex items-start gap-3 ${
                        isDark
                            ? "bg-emerald-500/5 border-emerald-500/20"
                            : "bg-emerald-50 border-emerald-200"
                    }`}
                >
                    <CheckCircleIcon className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />

                    <div>
                        <p
                            className={`text-[13px] font-bold ${
                                isDark
                                    ? "text-emerald-400"
                                    : "text-emerald-800"
                            }`}
                        >
                            Konu haritası onaylandı
                        </p>

                        <p
                            className={`text-[12px] mt-1 ${textSecondary}`}
                        >
                            Bu konu haritası ders oluşturulmadan
                            önce Gemini tarafından hazırlandı
                            ve onayınızla kaydedildi.
                            Materyaller ve konu haritası artık
                            değiştirilemez.
                        </p>
                    </div>
                </div>
            )}

            {/* Eski Derslerde Güncellik Uyarısı */}
            {haritaDegistirilebilir &&
                haritaHazir &&
                !haritaGuncel &&
                !olusturuluyor && (
                    <div
                        className={`p-4 rounded-xl border mb-5 flex items-start gap-3 ${
                            isDark
                                ? "bg-amber-500/10 border-amber-500/30 text-amber-200"
                                : "bg-amber-50 border-amber-200 text-amber-800"
                        }`}
                    >
                        <ExclamationTriangleIcon className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />

                        <div className="text-[13px]">
                            <p className="font-bold">
                                Yeni veya değişen materyal
                                tespit edildi!
                            </p>

                            <p className="opacity-90 mt-0.5">
                                Materyaller değiştiği için
                                konu haritası güncelliğini
                                kaybetmiş olabilir.
                                Haritayı Güncelle butonuyla
                                yeniden analiz edebilirsiniz.
                            </p>
                        </div>
                    </div>
                )}

            {/* Hata Bildirimi */}
            {hata && !olusturuluyor && (
                <div
                    className={`p-4 rounded-xl border mb-5 flex items-start gap-3 ${
                        isDark
                            ? "bg-rose-500/10 border-rose-500/30 text-rose-200"
                            : "bg-rose-50 border-rose-200 text-rose-800"
                    }`}
                >
                    <ExclamationTriangleIcon className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />

                    <div className="text-[13px]">
                        <p className="font-bold">
                            Konu haritası yüklenemedi
                        </p>

                        <p className="opacity-90 mt-0.5">
                            {hata}
                        </p>
                    </div>
                </div>
            )}

            {/* Yüklenme Durumu */}
            {yukleniyor ? (
                <div className="py-16 flex flex-col items-center justify-center text-center">
                    <div className="w-9 h-9 border-[3px] border-[#4F46E5]/30 border-t-[#4F46E5] rounded-full animate-spin mb-3" />

                    <p
                        className={`text-[13px] ${textSecondary}`}
                    >
                        Konu haritası bilgileri yükleniyor...
                    </p>
                </div>
            ) : olusturuluyor ? (
                <div className="py-16 flex flex-col items-center justify-center text-center">
                    <div className="relative mb-4">
                        <div className="w-14 h-14 rounded-full bg-[#4F46E5]/10 flex items-center justify-center text-[#4F46E5] animate-pulse">
                            <SparklesIcon className="w-7 h-7" />
                        </div>

                        <ArrowPathIcon className="w-5 h-5 text-[#4F46E5] animate-spin absolute -bottom-1 -right-1" />
                    </div>

                    <h4
                        className={`text-[16px] font-bold ${textPrimary} mb-1`}
                    >
                        Gemini Konuları Haritalıyor
                    </h4>

                    <p
                        className={`text-[13px] ${textSecondary} max-w-md`}
                    >
                        Materyaller analiz ediliyor ve
                        konu hiyerarşisi oluşturuluyor.
                        Lütfen bekleyin...
                    </p>
                </div>
            ) : haritaHazir ? (
                /* Hazır Konu Haritası */
                <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] px-1 mb-2">
                        <span className={textSecondary}>
                            Toplam{" "}
                            <strong>
                                {anaKonular.length}
                            </strong>{" "}
                            Ana Konu,{" "}
                            <strong>
                                {toplamAltKonuSayisi}
                            </strong>{" "}
                            Alt Konu
                        </span>

                        {tarihGecerli && (
                            <span className={textSecondary}>
                                Son analiz:{" "}
                                {analizTarihi.toLocaleDateString(
                                    "tr-TR",
                                    {
                                        day: "numeric",
                                        month: "short",
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    }
                                )}
                            </span>
                        )}
                    </div>

                    {anaKonular.map((ana, index) => {
                        const konuId =
                            ana.konuId ||
                            `ana-konu-${index}`;

                        const acik =
                            konuAcikMi(konuId);

                        const altKonular =
                            Array.isArray(ana.altKonular)
                                ? ana.altKonular
                                : [];

                        return (
                            <div
                                key={konuId}
                                className={`rounded-xl border overflow-hidden transition-all ${itemBg}`}
                            >
                                {/* Ana Konu */}
                                <button
                                    type="button"
                                    onClick={() =>
                                        toggleKonu(konuId)
                                    }
                                    aria-expanded={acik}
                                    className="w-full p-4 flex items-center justify-between gap-3 text-left cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 transition-colors"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-8 h-8 rounded-lg bg-[#4F46E5]/10 flex items-center justify-center text-[#4F46E5] font-bold text-[13px] shrink-0">
                                            {ana.sira ||
                                                index + 1}
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex flex-wrap items-center gap-2">
                                                <h4
                                                    className={`text-[15px] font-bold ${textPrimary}`}
                                                >
                                                    {ana.baslik}
                                                </h4>

                                                <span
                                                    className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                                        isDark
                                                            ? "bg-[#1E293B] text-[#94A3B8]"
                                                            : "bg-[#E2E8F0] text-[#64748B]"
                                                    }`}
                                                >
                                                    {altKonular.length}{" "}
                                                    Alt Konu
                                                </span>
                                            </div>

                                            {ana.aciklama && (
                                                <p
                                                    className={`text-[12px] ${textSecondary} mt-0.5 line-clamp-2`}
                                                >
                                                    {ana.aciklama}
                                                </p>
                                            )}
                                        </div>
                                    </div>

                                    <div className="shrink-0 text-gray-400">
                                        {acik ? (
                                            <ChevronDownIcon className="w-4 h-4" />
                                        ) : (
                                            <ChevronRightIcon className="w-4 h-4" />
                                        )}
                                    </div>
                                </button>

                                {/* Alt Konular */}
                                {acik &&
                                    altKonular.length > 0 && (
                                        <div
                                            className={`px-4 pb-3 pt-3 border-t space-y-2 ${
                                                isDark
                                                    ? "border-[#26334A]/60 bg-[#0B1120]/40"
                                                    : "border-[#E7E5EF]/60 bg-white"
                                            }`}
                                        >
                                            {altKonular.map(
                                                (alt, altIndex) => (
                                                    <div
                                                        key={
                                                            alt.konuId ||
                                                            `${konuId}-alt-${altIndex}`
                                                        }
                                                        className={`p-2.5 rounded-lg border flex items-start gap-2.5 ${
                                                            isDark
                                                                ? "bg-[#162137]/60 border-[#26334A]/80"
                                                                : "bg-[#F8F7FC] border-[#E7E5EF]"
                                                        }`}
                                                    >
                                                        <div className="w-1.5 h-1.5 rounded-full bg-[#4F46E5] mt-1.5 shrink-0" />

                                                        <div className="flex-1 min-w-0">
                                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                                <p
                                                                    className={`text-[13px] font-medium ${textPrimary}`}
                                                                >
                                                                    {alt.baslik}
                                                                </p>

                                                                {alt.konuId && (
                                                                    <span className="text-[10px] font-mono text-gray-400 break-all">
                                                                        {alt.konuId}
                                                                    </span>
                                                                )}
                                                            </div>

                                                            {alt.aciklama && (
                                                                <p
                                                                    className={`text-[11px] ${textSecondary} mt-0.5`}
                                                                >
                                                                    {alt.aciklama}
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                )
                                            )}
                                        </div>
                                    )}
                            </div>
                        );
                    })}
                </div>
            ) : hazirMateryalSayisi === 0 ? (
                /* Materyal Bulunmuyor */
                <div
                    className={`p-8 rounded-xl border border-dashed text-center flex flex-col items-center justify-center ${
                        isDark
                            ? "border-[#26334A] bg-[#0B1120]/30"
                            : "border-[#E7E5EF] bg-[#F8F7FC]"
                    }`}
                >
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-[#4F46E5] mb-3">
                        <BookOpenIcon className="w-6 h-6" />
                    </div>

                    <h4
                        className={`text-[15px] font-bold ${textPrimary} mb-1`}
                    >
                        Hazır Materyal Bulunmuyor
                    </h4>

                    <p
                        className={`text-[13px] ${textSecondary} max-w-sm`}
                    >
                        Bu derste henüz işlenmiş materyal
                        bulunmuyor.
                    </p>
                </div>
            ) : (
                /* Harita Henüz Oluşturulmadı */
                <div
                    className={`p-8 rounded-xl border border-dashed text-center flex flex-col items-center justify-center ${
                        isDark
                            ? "border-[#26334A] bg-[#0B1120]/30"
                            : "border-[#E7E5EF] bg-[#F8F7FC]"
                    }`}
                >
                    <div className="w-12 h-12 rounded-full bg-indigo-500/10 flex items-center justify-center text-[#4F46E5] mb-3">
                        <SparklesIcon className="w-6 h-6" />
                    </div>

                    <h4
                        className={`text-[15px] font-bold ${textPrimary} mb-1`}
                    >
                        Henüz Konu Haritası Oluşturulmadı
                    </h4>

                    <p
                        className={`text-[13px] ${textSecondary} max-w-md mb-4`}
                    >
                        {materyallerKilitli
                            ? "Onaylanan dersin konu haritası bulunamadı. Lütfen sistem yöneticisiyle iletişime geçin."
                            : "Hazır materyalleriniz mevcut. Konu haritası oluşturma işlemini başlatabilirsiniz."}
                    </p>

                    {olusturmaButonuGoster && (
                        <button
                            type="button"
                            onClick={olusturmayiBaslat}
                            className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-[13px] bg-[#4F46E5] hover:bg-[#4338CA] text-white transition-all shadow-sm"
                        >
                            <SparklesIcon className="w-4 h-4" />
                            Konu Haritası Oluştur
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

export default KonuHaritasiBolumu;


import React, { useState, useEffect, useRef } from "react";
import {
    useOutletContext,
    useNavigate,
    useLocation,
    useParams,
} from "react-router-dom";
import axios from "axios";

import DersOlusturmaAdimlari from "../components/DersOlusturmaAdimlari";
import KonuHaritasiBolumu from "../components/KonuHaritasiBolumu";

import {
    CheckBadgeIcon,
    ArrowRightIcon,
    BookOpenIcon,
    DocumentTextIcon,
    CheckIcon,
    CpuChipIcon,
    ListBulletIcon,
    ChatBubbleBottomCenterTextIcon,
    PuzzlePieceIcon,
    SparklesIcon,
    ComputerDesktopIcon,
    CodeBracketIcon,
    CircleStackIcon,
    CalculatorIcon,
    BeakerIcon,
} from "@heroicons/react/24/outline";

const API_URL = "http://localhost:5000";

const RENKLER = [
    {
        id: "indigo",
        bg: "bg-[#4F46E5]",
        text: "text-[#4F46E5]",
    },
    {
        id: "cyan",
        bg: "bg-[#06B6D4]",
        text: "text-[#06B6D4]",
    },
    {
        id: "emerald",
        bg: "bg-[#10B981]",
        text: "text-[#10B981]",
    },
    {
        id: "amber",
        bg: "bg-[#F59E0B]",
        text: "text-[#F59E0B]",
    },
    {
        id: "rose",
        bg: "bg-[#F43F5E]",
        text: "text-[#F43F5E]",
    },
];

const SIMGELER = [
    { id: "book", icon: BookOpenIcon },
    { id: "desktop", icon: ComputerDesktopIcon },
    { id: "code", icon: CodeBracketIcon },
    { id: "database", icon: CircleStackIcon },
    { id: "calc", icon: CalculatorIcon },
    { id: "science", icon: BeakerIcon },
];

function DersHazir() {
    const { isDark } = useOutletContext();
    const navigate = useNavigate();
    const location = useLocation();
    const { dersId } = useParams();

    const [ders, setDers] = useState(
        location.state?.ders || null
    );

    const [materyalSayisi, setMateryalSayisi] =
        useState(0);

    const [konuHaritasi, setKonuHaritasi] =
        useState(null);

    const [haritaYukleniyor, setHaritaYukleniyor] =
        useState(true);

    const [haritaHatasi, setHaritaHatasi] =
        useState("");

    const [guncelMi, setGuncelMi] =
        useState(true);

    const [sayfaHatasi, setSayfaHatasi] =
        useState("");

    const [dersYukleniyor, setDersYukleniyor] =
        useState(true);

    const [haritaDurumu, setHaritaDurumu] =
        useState("yok");

    const [materyallerKilitli, setMateryallerKilitli] =
        useState(false);

    const pollSayisiRef = useRef(0);
    const hataSayisiRef = useRef(0);

    const uiPrefs = {
        renk:
            ders?.renk ||
            location.state?.uiPrefs?.renk ||
            "indigo",
        simge:
            ders?.simge ||
            location.state?.uiPrefs?.simge ||
            "desktop",
        dersKodu:
            ders?.dersKodu ||
            location.state?.uiPrefs?.dersKodu ||
            "",
    };

    const seciliRenk =
        RENKLER.find(
            (renk) => renk.id === uiPrefs.renk
        ) || RENKLER[0];

    const SeciliSimge =
        SIMGELER.find(
            (simge) => simge.id === uiPrefs.simge
        )?.icon || ComputerDesktopIcon;

    const cardBg = isDark
        ? "bg-[#162137] border-[#26334A]"
        : "bg-white border-[#E7E5EF]";

    const textPrimary = isDark
        ? "text-[#F8FAFC]"
        : "text-[#0F172A]";

    const textSecondary = isDark
        ? "text-[#A7B0C2]"
        : "text-[#64748B]";

    const haritaHazir =
        konuHaritasi?.durum === "hazir" &&
        Array.isArray(konuHaritasi?.anaKonular) &&
        konuHaritasi.anaKonular.length > 0;

    const anaKonuSayisi =
        konuHaritasi?.anaKonular?.length || 0;

    const altKonuSayisi =
        konuHaritasi?.toplamAltKonuSayisi ??
        konuHaritasi?.anaKonular?.reduce(
            (toplam, anaKonu) =>
                toplam +
                (anaKonu.altKonular?.length || 0),
            0
        ) ??
        0;

    const analizTamamlandi =
        haritaHazir &&
        (materyallerKilitli || guncelMi);

    useEffect(() => {
        if (!dersId) return;

        let aktif = true;

        pollSayisiRef.current = 0;
        hataSayisiRef.current = 0;

        const verileriGetir = async (ilkYukleme = false) => {
            if (ilkYukleme) {
                setDersYukleniyor(true);
                setHaritaYukleniyor(true);
                setSayfaHatasi("");
            }

            const sonuclar = await Promise.allSettled([
                axios.get(
                    `${API_URL}/dersler/${dersId}`,
                    { withCredentials: true }
                ),
                axios.get(
                    `${API_URL}/materyaller/ders/${dersId}`,
                    { withCredentials: true }
                ),
                axios.get(
                    `${API_URL}/dersler/${dersId}/konu-haritasi`,
                    { withCredentials: true }
                ),
            ]);

            if (!aktif) return;

            const [dersSonucu, materyalSonucu, haritaSonucu] =
                sonuclar;

            if (dersSonucu.status === "fulfilled") {
                const gelenDers =
                    dersSonucu.value.data.ders;

                if (gelenDers) {
                    setDers(gelenDers);
                    setMateryallerKilitli(
                        gelenDers.materyallerKilitli === true
                    );
                }

                setSayfaHatasi("");
            } else if (ilkYukleme) {
                setSayfaHatasi(
                    dersSonucu.reason?.response?.data?.hata ||
                    "Ders bilgileri alınamadı."
                );
            }

            if (materyalSonucu.status === "fulfilled") {
                const materyaller =
                    materyalSonucu.value.data.materyaller || [];

                setMateryalSayisi(
                    materyaller.filter(
                        (materyal) =>
                            materyal.durum === "hazir"
                    ).length
                );
            }

            if (haritaSonucu.status === "fulfilled") {
                const veri = haritaSonucu.value.data;

                setKonuHaritasi(veri.harita || null);
                setHaritaDurumu(veri.durum || "yok");
                setGuncelMi(veri.guncelMi === true);
                setHaritaHatasi(
                    veri.olusturmaHatasi || ""
                );

                if (
                    typeof veri.materyallerKilitli ===
                    "boolean"
                ) {
                    setMateryallerKilitli(
                        veri.materyallerKilitli
                    );
                }

                hataSayisiRef.current = 0;
            } else {
                hataSayisiRef.current += 1;

                setHaritaHatasi(
                    haritaSonucu.reason?.response?.data?.hata ||
                    "Konu haritası yüklenemedi."
                );
            }

            setDersYukleniyor(false);
            setHaritaYukleniyor(false);
        };

        verileriGetir(true);

        const interval = setInterval(() => {
            if (
                pollSayisiRef.current >= 40 ||
                hataSayisiRef.current >= 3
            ) {
                return;
            }

            pollSayisiRef.current += 1;

            // Hazır ve onaylı dersler için yeniden
            // analiz veya sürekli sorgulama yapılmaz.
            if (
                haritaHazirRef.current &&
                kilitliRef.current
            ) {
                return;
            }

            verileriGetir(false);
        }, 3000);

        return () => {
            aktif = false;
            clearInterval(interval);
        };
    }, [dersId]);

    const haritaHazirRef = useRef(false);
    const kilitliRef = useRef(false);

    useEffect(() => {
        haritaHazirRef.current = haritaHazir;
        kilitliRef.current = materyallerKilitli;
    }, [haritaHazir, materyallerKilitli]);

    const analizDurumYazisi = analizTamamlandi
        ? "Analiz Tamamlandı"
        : haritaDurumu === "olusturuluyor"
            ? "Analiz Devam Ediyor"
            : haritaDurumu === "hata"
                ? "Analiz Hatası"
                : "Kontrol Ediliyor";

    const analizAdimlari = [
        {
            baslik: "Materyaller Okundu",
            aciklama: "PDF & Notlar",
        },
        {
            baslik: "İçerik Analiz Edildi",
            aciklama: "Semantik Tarama",
        },
        {
            baslik: "Konular Belirlendi",
            aciklama: "Taksonomi",
        },
        {
            baslik: "Ders Hazırlandı",
            aciklama: "Kullanıma Açık",
        },
    ];

    return (
        <div className="max-w-[1200px] mx-auto pb-10">
            <div className="mb-8">
                <h1
                    className={`text-[32px] md:text-[38px] font-bold tracking-tight ${textPrimary}`}
                >
                    Yeni Ders Oluştur
                </h1>

                <p
                    className={`mt-1.5 text-[16px] ${textSecondary}`}
                >
                    Dersin oluşturuldu, materyallerin analiz
                    edildi ve öğrenmeye hazırsın.
                </p>
            </div>

            <DersOlusturmaAdimlari
                aktifAdim={3}
                isDark={isDark}
            />

            {sayfaHatasi && (
                <div className="mb-6 p-4 rounded-xl border border-red-500/20 bg-red-500/10 text-red-500 text-sm">
                    {sayfaHatasi}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-8 flex flex-col gap-6">
                    {/* Ders Oluşturma Başarısı */}
                    <div
                        className={`p-6 rounded-2xl border ${
                            isDark
                                ? "bg-emerald-500/5 border-emerald-500/20"
                                : "bg-emerald-50 border-emerald-200"
                        } flex items-start gap-4`}
                    >
                        <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                            <CheckIcon className="w-6 h-6 text-white" />
                        </div>

                        <div>
                            <div className="flex flex-wrap items-center gap-3 mb-1">
                                <h2
                                    className={`text-[20px] font-bold ${
                                        isDark
                                            ? "text-white"
                                            : "text-emerald-900"
                                    }`}
                                >
                                    Dersin Hazır!
                                </h2>

                                <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-widest ${
                                        isDark
                                            ? "bg-emerald-500/20 text-emerald-400"
                                            : "bg-emerald-200 text-emerald-800"
                                    }`}
                                >
                                    KURULUM TAMAM
                                </span>
                            </div>

                            <p
                                className={`text-[14px] leading-relaxed ${
                                    isDark
                                        ? "text-emerald-100/70"
                                        : "text-emerald-700"
                                }`}
                            >
                                <strong>
                                    {ders?.dersAdi || "Ders"}
                                </strong>{" "}
                                başarıyla oluşturuldu.
                                Dersine giderek öğrenme
                                özelliklerini kullanmaya
                                başlayabilirsin.
                            </p>
                        </div>
                    </div>

                    {/* Ders Bilgisi */}
                    <div
                        className={`p-6 rounded-2xl border ${
                            isDark
                                ? "bg-[#10192C] border-[#26334A]"
                                : "bg-indigo-50 border-indigo-100"
                        } flex items-center justify-between gap-4`}
                    >
                        <div className="flex items-center gap-4 min-w-0">
                            <div
                                className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${seciliRenk.bg} bg-opacity-10`}
                            >
                                <SeciliSimge
                                    className={`w-6 h-6 ${seciliRenk.text}`}
                                />
                            </div>

                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <h3
                                        className={`text-[18px] font-bold ${textPrimary}`}
                                    >
                                        {ders?.dersAdi || "Ders Adı"}
                                    </h3>

                                    {uiPrefs.dersKodu && (
                                        <span
                                            className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                isDark
                                                    ? "bg-white/10 text-[#A7B0C2]"
                                                    : "bg-indigo-200 text-indigo-800"
                                            }`}
                                        >
                                            {uiPrefs.dersKodu}
                                        </span>
                                    )}
                                </div>

                                <p
                                    className={`text-[13px] ${textSecondary}`}
                                >
                                    Dönem:{" "}
                                    {ders?.donem || "Belirtilmedi"}
                                </p>
                            </div>
                        </div>

                        <div
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium shrink-0 ${
                                analizTamamlandi
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : isDark
                                        ? "bg-[#1B2942] text-[#A7B0C2]"
                                        : "bg-indigo-100 text-indigo-700"
                            }`}
                        >
                            <span
                                className={`w-1.5 h-1.5 rounded-full ${
                                    analizTamamlandi
                                        ? "bg-emerald-500"
                                        : "bg-amber-500"
                                }`}
                            />

                            {analizDurumYazisi}
                        </div>
                    </div>

                    {/* Ders Kurulum Özeti */}
                    <div>
                        <h3
                            className={`text-[13px] font-bold tracking-wider uppercase ${textSecondary} mb-4`}
                        >
                            DERS KURULUM ÖZETİ
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div
                                className={`p-4 rounded-xl border ${cardBg} flex items-center justify-between gap-3`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center text-green-500">
                                        <BookOpenIcon className="w-5 h-5" />
                                    </div>

                                    <div>
                                        <p
                                            className={`text-[14px] font-bold ${textPrimary}`}
                                        >
                                            Ders Bilgileri
                                        </p>

                                        <p
                                            className={`text-[12px] ${textSecondary}`}
                                        >
                                            Bilgiler kaydedildi
                                        </p>
                                    </div>
                                </div>

                                <span className="px-2.5 py-1 rounded bg-green-500/10 text-green-600 text-[11px] font-bold">
                                    Tamamlandı
                                </span>
                            </div>

                            <div
                                className={`p-4 rounded-xl border ${cardBg} flex items-center justify-between gap-3`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center text-[#4F46E5]">
                                        <DocumentTextIcon className="w-5 h-5" />
                                    </div>

                                    <div>
                                        <p
                                            className={`text-[14px] font-bold ${textPrimary}`}
                                        >
                                            Materyaller
                                        </p>

                                        <p
                                            className={`text-[12px] ${textSecondary}`}
                                        >
                                            Analiz edilen materyaller
                                        </p>
                                    </div>
                                </div>

                                <span
                                    className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                                        isDark
                                            ? "bg-[#1B2942] text-[#A7B0C2]"
                                            : "bg-indigo-100 text-indigo-700"
                                    }`}
                                >
                                    {materyalSayisi} Materyal
                                </span>
                            </div>

                            <div
                                className={`p-4 rounded-xl border ${cardBg} flex items-center justify-between gap-3`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-500">
                                        <ListBulletIcon className="w-5 h-5" />
                                    </div>

                                    <div>
                                        <p
                                            className={`text-[14px] font-bold ${textPrimary}`}
                                        >
                                            Konu Analizi
                                        </p>

                                        <p
                                            className={`text-[12px] ${textSecondary}`}
                                        >
                                            Ana ve alt başlıklar
                                        </p>
                                    </div>
                                </div>

                                <span className="px-2.5 py-1 rounded bg-[#4F46E5]/10 text-[#4F46E5] text-[11px] font-bold">
                                    {anaKonuSayisi} Ana Konu
                                </span>
                            </div>

                            <div
                                className={`p-4 rounded-xl border ${cardBg} flex items-center justify-between gap-3`}
                            >
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center text-orange-500">
                                        <CpuChipIcon className="w-5 h-5" />
                                    </div>

                                    <div>
                                        <p
                                            className={`text-[14px] font-bold ${textPrimary}`}
                                        >
                                            Yapay Zekâ Kaynakları
                                        </p>

                                        <p
                                            className={`text-[12px] ${textSecondary}`}
                                        >
                                            Özet, test ve sohbet
                                        </p>
                                    </div>
                                </div>

                                <span
                                    className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                                        isDark
                                            ? "bg-[#1B2942] text-[#A7B0C2]"
                                            : "bg-indigo-100 text-indigo-700"
                                    }`}
                                >
                                    Kullanıma Hazır
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Yapay Zekâ Analiz Hattı */}
                    <div
                        className={`p-5 rounded-xl border ${
                            isDark
                                ? "bg-[#0B1120]/50 border-[#26334A]"
                                : "bg-[#F8F7FC] border-[#E7E5EF]"
                        }`}
                    >
                        <div className="flex items-center justify-between mb-4 gap-3">
                            <div className="flex items-center gap-2">
                                <SparklesIcon className="w-4 h-4 text-[#4F46E5]" />

                                <h4
                                    className={`text-[14px] font-bold ${textPrimary}`}
                                >
                                    Yapay Zekâ Analiz Hattı
                                </h4>
                            </div>

                            <span
                                className={`px-2 py-1 rounded text-[10px] font-bold ${
                                    analizTamamlandi
                                        ? "bg-emerald-500/10 text-emerald-500"
                                        : isDark
                                            ? "bg-[#1B2942] text-[#A7B0C2]"
                                            : "bg-[#E2E8F0] text-[#64748B]"
                                }`}
                            >
                                {analizDurumYazisi}
                            </span>
                        </div>

                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {analizAdimlari.map(
                                (adim, index) => (
                                    <div
                                        key={index}
                                        className={`p-3 rounded-lg border text-center ${
                                            isDark
                                                ? "bg-[#162137] border-[#26334A]"
                                                : "bg-white border-[#E7E5EF]"
                                        } ${
                                            analizTamamlandi
                                                ? ""
                                                : "opacity-60"
                                        }`}
                                    >
                                        <div className="flex justify-center mb-2">
                                            {analizTamamlandi ? (
                                                <CheckIcon className="w-4 h-4 text-emerald-500" />
                                            ) : (
                                                <SparklesIcon className="w-4 h-4 text-[#4F46E5]" />
                                            )}
                                        </div>

                                        <p
                                            className={`text-[12px] font-bold ${textPrimary}`}
                                        >
                                            {adim.baslik}
                                        </p>

                                        <p
                                            className={`text-[10px] ${textSecondary} mt-0.5`}
                                        >
                                            {adim.aciklama}
                                        </p>
                                    </div>
                                )
                            )}
                        </div>
                    </div>

                    {/* Kaydedilmiş Konu Haritası */}
                    <KonuHaritasiBolumu
                        dersId={dersId}
                        isDark={isDark}
                        konuHaritasi={konuHaritasi}
                        yukleniyor={haritaYukleniyor}
                        olusturuluyor={false}
                        hata={haritaHatasi}
                        guncelMi={
                            materyallerKilitli
                                ? haritaHazir
                                : guncelMi
                        }
                        hazirMateryalSayisi={materyalSayisi}
                        onOlustur={undefined}
                        materyallerKilitli={materyallerKilitli}
                    />

                    {/* Öğrenme Özellikleri */}
                    <div className="mb-6">
                        <h4
                            className={`text-[15px] font-bold ${textPrimary} mb-4`}
                        >
                            Artık Neler Yapabilirsin?
                        </h4>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            {[
                                {
                                    baslik: "Özet Oluştur",
                                    aciklama:
                                        "Dersin veya belirlediğin konunun özetini oluştur.",
                                    icon: DocumentTextIcon,
                                    renk: "text-[#4F46E5]",
                                    bg: "bg-indigo-500/10",
                                },
                                {
                                    baslik: "Yapay Zekâya Sor",
                                    aciklama:
                                        "Ders materyallerine dayalı yanıtlar al.",
                                    icon: ChatBubbleBottomCenterTextIcon,
                                    renk: "text-cyan-500",
                                    bg: "bg-cyan-500/10",
                                },
                                {
                                    baslik: "Test Çöz",
                                    aciklama:
                                        "Konularına uygun sorularla bilgini ölç.",
                                    icon: CheckBadgeIcon,
                                    renk: "text-emerald-500",
                                    bg: "bg-emerald-500/10",
                                },
                                {
                                    baslik: "Çalışma Kartları",
                                    aciklama:
                                        "Önemli kavramları tekrarlarla pekiştir.",
                                    icon: PuzzlePieceIcon,
                                    renk: "text-purple-500",
                                    bg: "bg-purple-500/10",
                                },
                            ].map((ozellik) => {
                                const Icon = ozellik.icon;

                                return (
                                    <div
                                        key={ozellik.baslik}
                                        className={`p-4 rounded-xl border ${cardBg} flex items-start gap-4`}
                                    >
                                        <div
                                            className={`w-10 h-10 rounded-lg ${ozellik.bg} flex items-center justify-center ${ozellik.renk} shrink-0`}
                                        >
                                            <Icon className="w-5 h-5" />
                                        </div>

                                        <div>
                                            <h5
                                                className={`text-[14px] font-bold ${textPrimary} mb-1`}
                                            >
                                                {ozellik.baslik}
                                            </h5>

                                            <p
                                                className={`text-[12px] ${textSecondary}`}
                                            >
                                                {ozellik.aciklama}
                                            </p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Alt İşlemler */}
                    <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-6 border-t border-[#E7E5EF] dark:border-[#26334A]">
                        <p
                            className={`text-[14px] ${textSecondary} hidden sm:block`}
                        >
                            Ders genel bakışına geçerek
                            öğrenmeye başlayabilirsin.
                        </p>

                        <div className="flex items-center gap-4 w-full sm:w-auto">
                            <button
                                type="button"
                                onClick={() =>
                                    navigate("/panel/dersler")
                                }
                                className={`w-full sm:w-auto px-6 py-3 rounded-xl font-medium border ${
                                    isDark
                                        ? "border-[#26334A] hover:bg-white/5 text-[#F8FAFC]"
                                        : "border-[#E7E5EF] hover:bg-black/5 text-[#0F172A]"
                                } transition-colors`}
                            >
                                Derslerime Dön
                            </button>

                            <button
                                type="button"
                                disabled
                                className="w-full sm:w-auto flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-medium bg-[#4F46E5] text-white opacity-50 cursor-not-allowed"
                            >
                                Derse Git
                                <ArrowRightIcon className="w-5 h-5" />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Sağ Önizleme */}
                <div className="lg:col-span-4 flex flex-col gap-6">
                    <div className="sticky top-28 space-y-6">
                        <div>
                            <div className="mb-4">
                                <h3
                                    className={`text-[18px] font-bold ${textPrimary} flex items-center gap-2`}
                                >
                                    Önizleme

                                    <span className="px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 text-[11px] font-bold tracking-wide uppercase">
                                        Canlı
                                    </span>
                                </h3>

                                <p
                                    className={`text-[13px] ${textSecondary} mt-1`}
                                >
                                    Ders kartının Derslerim
                                    sayfasındaki görünümü
                                </p>
                            </div>

                            <div
                                className={`p-5 rounded-2xl border ${cardBg}`}
                            >
                                <div className="flex flex-col">
                                    <div className="flex items-start gap-3 mb-4">
                                        <div
                                            className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${seciliRenk.bg} bg-opacity-10`}
                                        >
                                            <SeciliSimge
                                                className={`w-6 h-6 ${seciliRenk.text}`}
                                            />
                                        </div>

                                        <div className="min-w-0">
                                            <div className="flex flex-wrap gap-1.5 mb-1">
                                                {uiPrefs.dersKodu && (
                                                    <span
                                                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                                            isDark
                                                                ? "bg-white/10 text-white"
                                                                : "bg-black/5 text-[#0F172A]"
                                                        }`}
                                                    >
                                                        {uiPrefs.dersKodu}
                                                    </span>
                                                )}

                                                {ders?.donem && (
                                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-[#4F46E5]">
                                                        {ders.donem}
                                                    </span>
                                                )}
                                            </div>

                                            <h3
                                                className={`text-[18px] font-bold line-clamp-1 ${textPrimary}`}
                                            >
                                                {ders?.dersAdi ||
                                                    "Ders Adı"}
                                            </h3>
                                        </div>
                                    </div>

                                    <p
                                        className={`text-[13px] line-clamp-2 ${textSecondary} mb-5 min-h-10`}
                                    >
                                        {ders?.aciklama ||
                                            "Ders açıklaması bulunmuyor."}
                                    </p>

                                    <div
                                        className={`flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed mb-5 ${
                                            isDark
                                                ? "border-[#26334A] bg-[#0B1120]"
                                                : "border-[#E7E5EF] bg-[#F8F7FC]"
                                        }`}
                                    >
                                        <BookOpenIcon
                                            className={`w-4 h-4 ${textSecondary}`}
                                        />

                                        <span
                                            className={`text-[12px] font-medium ${textSecondary}`}
                                        >
                                            {materyalSayisi} Materyal
                                            eklendi
                                        </span>
                                    </div>

                                    <div className="mb-4">
                                        <div className="flex items-center justify-between text-[12px] font-medium mb-1.5">
                                            <span className={textSecondary}>
                                                Konu Haritası
                                            </span>

                                            <span className={textPrimary}>
                                                {anaKonuSayisi} Ana Konu
                                            </span>
                                        </div>

                                        <div
                                            className={`w-full h-1.5 rounded-full overflow-hidden ${
                                                isDark
                                                    ? "bg-[#26334A]"
                                                    : "bg-[#E7E5EF]"
                                            }`}
                                        >
                                            <div
                                                className={`h-full ${
                                                    analizTamamlandi
                                                        ? "bg-emerald-500"
                                                        : "bg-[#4F46E5]"
                                                }`}
                                                style={{
                                                    width:
                                                        analizTamamlandi
                                                            ? "100%"
                                                            : "0%",
                                                }}
                                            />
                                        </div>
                                    </div>

                                    <div
                                        className={`w-full py-2.5 rounded-xl text-[13px] font-medium border flex items-center justify-center gap-1.5 ${
                                            isDark
                                                ? "border-[#26334A] text-[#A7B0C2]"
                                                : "border-[#E7E5EF] text-[#64748B]"
                                        }`}
                                    >
                                        {altKonuSayisi} Alt Konu
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Sonraki Adım */}
                        <div
                            className={`p-5 rounded-2xl border ${
                                isDark
                                    ? "bg-[#10192C] border-[#26334A]"
                                    : "bg-[#F8F7FC] border-[#E7E5EF]"
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-3">
                                <div className="w-6 h-6 rounded-full bg-[#4F46E5]/10 flex items-center justify-center text-[#4F46E5]">
                                    <SparklesIcon className="w-3.5 h-3.5" />
                                </div>

                                <h4
                                    className={`text-[15px] font-bold ${textPrimary}`}
                                >
                                    Sonraki Adım
                                </h4>
                            </div>

                            <p
                                className={`text-[13px] ${textSecondary} leading-relaxed mb-4`}
                            >
                                Dersine girerek konu haritanı
                                inceleyebilir, özet oluşturabilir,
                                yapay zekâya soru sorabilir ve
                                testlerini çözebilirsin.
                            </p>

                            <button
                                type="button"
                                onClick={() =>
                                    document
                                        .querySelector(
                                            "#konu-haritasi-bolumu"
                                        )
                                        ?.scrollIntoView({
                                            behavior: "smooth",
                                        })
                                }
                                className="text-[13px] font-medium text-[#4F46E5] flex items-center gap-1"
                            >
                                Konu Haritasını İncele
                                <ArrowRightIcon className="w-3 h-3" />
                            </button>
                        </div>

                        {/* Bilgilendirme */}
                        <div
                            className={`p-5 rounded-2xl border ${
                                isDark
                                    ? "bg-[#0B1120]/50 border-[#26334A]"
                                    : "bg-white border-[#E7E5EF]"
                            }`}
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <span className="text-[14px]">
                                    💡
                                </span>

                                <h4
                                    className={`text-[13px] font-bold ${textPrimary}`}
                                >
                                    Biliyor muydun?
                                </h4>
                            </div>

                            <p
                                className={`text-[12px] ${textSecondary} leading-relaxed`}
                            >
                                Onaylanan dersin materyalleri ve
                                konu haritası korunur. Yeni materyal
                                ekleme, silme ve konu haritasını
                                yeniden oluşturma işlemleri kapalıdır.
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {dersYukleniyor && (
                <span className="sr-only">
                    Ders bilgileri yükleniyor.
                </span>
            )}
        </div>
    );
}

export default DersHazir;

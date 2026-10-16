
import React, {
    useCallback,
    useEffect,
    useRef,
    useState,
} from "react";

import {
    useOutletContext,
    useNavigate,
    useLocation,
    useParams,
} from "react-router-dom";

import axios from "axios";
import DersOlusturmaAdimlari from "../components/DersOlusturmaAdimlari";

import {
    CloudArrowUpIcon,
    ArrowRightIcon,
    ArrowLeftIcon,
    CpuChipIcon,
    DocumentIcon,
    TrashIcon,
    ArrowPathIcon,
    CheckCircleIcon,
    ExclamationTriangleIcon,
    XMarkIcon,
} from "@heroicons/react/24/outline";

const API = "http://localhost:5000";
const OTURUM_ANAHTARI = "studyai_ders_taslagi";

const istekAyarlari = {
    withCredentials: true,
};

const dosyaBoyutuYaz = (boyut) => {
    if (!boyut) return "0 Bytes";

    const birimler = ["Bytes", "KB", "MB", "GB"];
    const sira = Math.min(
        Math.floor(Math.log(boyut) / Math.log(1024)),
        birimler.length - 1
    );

    return `${(boyut / 1024 ** sira).toFixed(2)} ${birimler[sira]}`;
};

function MateryalEkle() {
    const { isDark } = useOutletContext();
    const navigate = useNavigate();
    const location = useLocation();
    const { dersId: taslakId } = useParams();

    const [taslak, setTaslak] = useState(
        location.state?.taslak ||
        location.state?.ders ||
        null
    );

    const [materyaller, setMateryaller] = useState([]);
    const [yukleniyor, setYukleniyor] = useState(false);
    const [analizEdiliyor, setAnalizEdiliyor] = useState(false);
    const [onaylaniyor, setOnaylaniyor] = useState(false);
    const [ilkYukleme, setIlkYukleme] = useState(true);
    const [hata, setHata] = useState("");
    const [bilgi, setBilgi] = useState("");
    const [onayModalAcik, setOnayModalAcik] = useState(false);

    const [metinModalAcik, setMetinModalAcik] = useState(false);
    const [seciliMetin, setSeciliMetin] = useState("");
    const [metinYukleniyor, setMetinYukleniyor] = useState(false);

    const fileInputRef = useRef(null);
    const islemRef = useRef(false);
    const sayfaAktifRef = useRef(true);

    const cardBg = isDark
        ? "bg-[#162137] border-[#26334A]"
        : "bg-white border-[#E7E5EF]";

    const textPrimary = isDark
        ? "text-[#F8FAFC]"
        : "text-[#0F172A]";

    const textSecondary = isDark
        ? "text-[#A7B0C2]"
        : "text-[#64748B]";

    const buttonPrimary =
        "bg-[#4F46E5] hover:bg-[#4338CA] text-white";

    const hazirSayisi = materyaller.filter(
        (m) => m.durum === "hazir"
    ).length;

    const hataliSayisi = materyaller.filter(
        (m) => m.durum === "hata"
    ).length;

    const islenenSayisi = materyaller.filter(
        (m) =>
            m.durum === "isleniyor" ||
            m.durum === "yuklendi"
    ).length;

    const tumMateryallerHazir =
        materyaller.length > 0 &&
        materyaller.every(
            (m) => m.durum === "hazir"
        );

    const analizGuncel =
        taslak?.durum === "onaya_hazir" &&
        taslak?.analizSurumu ===
            taslak?.materyalSurumu &&
        Array.isArray(
            taslak?.hazirKonuHaritasi?.anaKonular
        ) &&
        taslak.hazirKonuHaritasi.anaKonular.length > 0;

    const analizDevamEdiyor =
        taslak?.durum === "analiz_ediliyor";

    const islemlerKilitli =
        yukleniyor ||
        analizEdiliyor ||
        analizDevamEdiyor ||
        onaylaniyor ||
        taslak?.durum === "tamamlaniyor" ||
        taslak?.durum === "tamamlandi";

    const analizBaslatilabilir =
        !islemlerKilitli &&
        tumMateryallerHazir &&
        !analizGuncel;

    const onayAcilebilir =
        !islemlerKilitli &&
        tumMateryallerHazir &&
        analizGuncel;

    const ilerleme =
        materyaller.length > 0
            ? Math.round(
                (hazirSayisi / materyaller.length) * 100
            )
            : 0;

    const verileriYenile = useCallback(
        async (sessiz = false) => {
            try {
                const [taslakRes, materyalRes] =
                    await Promise.all([
                        axios.get(
                            `${API}/ders-taslaklari/${taslakId}`,
                            istekAyarlari
                        ),
                        axios.get(
                            `${API}/materyaller/taslak/${taslakId}`,
                            istekAyarlari
                        ),
                    ]);

                if (!sayfaAktifRef.current) return;

                const yeniTaslak =
                    taslakRes.data.taslak || null;

                setTaslak(yeniTaslak);
                setMateryaller(
                    materyalRes.data.materyaller || []
                );

                if (
                    yeniTaslak?.durum === "tamamlandi" &&
                    yeniTaslak.olusturulanDersId
                ) {
                    sessionStorage.removeItem(
                        OTURUM_ANAHTARI
                    );

                    navigate(
                        `/panel/dersler/${yeniTaslak.olusturulanDersId}/hazir`,
                        {
                            replace: true,
                            state: {
                                dersId:
                                    yeniTaslak.olusturulanDersId,
                            },
                        }
                    );
                }
            } catch (err) {
                if (!sessiz && sayfaAktifRef.current) {
                    setHata(
                        err.response?.data?.hata ||
                        "Taslak bilgileri alınamadı."
                    );
                }
            } finally {
                if (sayfaAktifRef.current) {
                    setIlkYukleme(false);
                }
            }
        },
        [taslakId, navigate]
    );

    useEffect(() => {
        sayfaAktifRef.current = true;

        verileriYenile();

        const interval = setInterval(() => {
            verileriYenile(true);
        }, 3000);

        return () => {
            sayfaAktifRef.current = false;
            clearInterval(interval);
        };
    }, [verileriYenile]);

    useEffect(() => {
        const cikisUyarisi = (event) => {
            if (
                taslak?.durum !== "tamamlandi" &&
                taslak?.durum !== "tamamlaniyor"
            ) {
                event.preventDefault();
                event.returnValue = "";
            }
        };

        window.addEventListener(
            "beforeunload",
            cikisUyarisi
        );

        return () => {
            window.removeEventListener(
                "beforeunload",
                cikisUyarisi
            );
        };
    }, [taslak?.durum]);

    const dosyaYukle = async (event) => {
        const dosyalar = Array.from(
            event.target.files || []
        );

        event.target.value = "";

        if (!dosyalar.length || islemlerKilitli) {
            return;
        }

        const formData = new FormData();

        dosyalar.forEach((dosya) => {
            formData.append("dosyalar", dosya);
        });

        setYukleniyor(true);
        setHata("");
        setBilgi("");
        setOnayModalAcik(false);

        try {
            await axios.post(
                `${API}/materyaller/taslak/${taslakId}`,
                formData,
                istekAyarlari
            );

            setBilgi(
                "Dosyalar yüklendi. Metin çıkarma işlemi takip ediliyor."
            );

            await verileriYenile();
        } catch (err) {
            setHata(
                err.response?.data?.hata ||
                "Dosyalar yüklenemedi."
            );

            await verileriYenile(true);
        } finally {
            setYukleniyor(false);
        }
    };

    const materyalSil = async (materyalId) => {
        if (islemlerKilitli) return;

        if (
            !window.confirm(
                "Bu materyali silmek istediğinize emin misiniz?"
            )
        ) {
            return;
        }

        setHata("");
        setBilgi("");
        setOnayModalAcik(false);

        try {
            await axios.delete(
                `${API}/materyaller/${materyalId}`,
                istekAyarlari
            );

            await verileriYenile();
        } catch (err) {
            setHata(
                err.response?.data?.hata ||
                "Materyal silinemedi."
            );
        }
    };

    const metinCikarmayiYenidenDene = async (
        materyalId
    ) => {
        if (islemlerKilitli) return;

        setHata("");
        setBilgi("");

        try {
            await axios.post(
                `${API}/materyaller/${materyalId}/metin-cikar`,
                {},
                istekAyarlari
            );

            await verileriYenile();
        } catch (err) {
            setHata(
                err.response?.data?.hata ||
                "Metin çıkarma işlemi başlatılamadı."
            );
        }
    };

    const metinGor = async (materyalId) => {
        setMetinModalAcik(true);
        setMetinYukleniyor(true);
        setSeciliMetin("");

        try {
            const response = await axios.get(
                `${API}/materyaller/${materyalId}`,
                istekAyarlari
            );

            setSeciliMetin(
                response.data.materyal?.cikarilanMetin ||
                "Bu dosyadan metin çıkarılamadı."
            );
        } catch {
            setSeciliMetin(
                "Metin getirilirken hata oluştu."
            );
        } finally {
            setMetinYukleniyor(false);
        }
    };

    const analizBaslat = async () => {
        if (
            islemRef.current ||
            !analizBaslatilabilir
        ) {
            return;
        }

        islemRef.current = true;
        setAnalizEdiliyor(true);
        setHata("");
        setBilgi(
            "Gemini tüm materyalleri analiz ediyor. Lütfen bekleyin."
        );

        try {
            await axios.post(
                `${API}/ders-taslaklari/${taslakId}/analiz`,
                {},
                {
                    ...istekAyarlari,
                    timeout: 0,
                }
            );

            setBilgi(
                "Gemini analizi tamamlandı. Materyallerinizi kontrol ederek dersi onaylayabilirsiniz."
            );
        } catch (err) {
            setHata(
                err.response?.data?.hata ||
                "Gemini analizi tamamlanamadı. Tekrar deneyebilirsiniz."
            );
            setBilgi("");
        } finally {
            await verileriYenile(true);
            setAnalizEdiliyor(false);
            islemRef.current = false;
        }
    };

    const onayModaliniAc = async () => {
        if (!onayAcilebilir) return;

        setHata("");

        try {
            const [taslakRes, materyalRes] =
                await Promise.all([
                    axios.get(
                        `${API}/ders-taslaklari/${taslakId}`,
                        istekAyarlari
                    ),
                    axios.get(
                        `${API}/materyaller/taslak/${taslakId}`,
                        istekAyarlari
                    ),
                ]);

            const guncelTaslak =
                taslakRes.data.taslak;

            const guncelMateryaller =
                materyalRes.data.materyaller || [];

            setTaslak(guncelTaslak);
            setMateryaller(guncelMateryaller);

            const hazir =
                guncelTaslak?.durum ===
                    "onaya_hazir" &&
                guncelTaslak.analizSurumu ===
                    guncelTaslak.materyalSurumu &&
                guncelMateryaller.length > 0 &&
                guncelMateryaller.every(
                    (m) => m.durum === "hazir"
                ) &&
                guncelTaslak.hazirKonuHaritasi
                    ?.anaKonular?.length > 0;

            if (!hazir) {
                setHata(
                    "Materyaller veya Gemini analizi değişmiş. Lütfen durumu kontrol edin."
                );
                return;
            }

            setOnayModalAcik(true);
        } catch (err) {
            setHata(
                err.response?.data?.hata ||
                "Onay öncesi kontrol yapılamadı."
            );
        }
    };

    const dersiOnayla = async () => {
        if (islemRef.current || onaylaniyor) {
            return;
        }

        islemRef.current = true;
        setOnaylaniyor(true);
        setHata("");

        try {
            const response = await axios.post(
                `${API}/ders-taslaklari/${taslakId}/onayla`,
                {},
                {
                    ...istekAyarlari,
                    timeout: 0,
                }
            );

            const yeniDersId =
                response.data.dersId ||
                response.data.ders?._id;

            if (!yeniDersId) {
                throw new Error(
                    "Oluşturulan ders kimliği alınamadı."
                );
            }

            sessionStorage.removeItem(
                OTURUM_ANAHTARI
            );

            setOnayModalAcik(false);

            navigate(
                `/panel/dersler/${yeniDersId}/hazir`,
                {
                    replace: true,
                    state: {
                        dersId: yeniDersId,
                        ders: response.data.ders || null,
                    },
                }
            );
        } catch (err) {
            setHata(
                err.response?.data?.hata ||
                err.message ||
                "Ders oluşturulamadı."
            );

            setOnayModalAcik(false);
            await verileriYenile(true);
        } finally {
            setOnaylaniyor(false);
            islemRef.current = false;
        }
    };

    const oncekiAdimaDon = () => {
        navigate("/panel/dersler/yeni", {
            state: {
                taslak,
                taslakId,
            },
        });
    };

    const analizDurumMetni = () => {
        if (analizEdiliyor || analizDevamEdiyor) {
            return "Gemini analizi devam ediyor...";
        }

        if (analizGuncel) {
            return "Konu haritası hazır. Onay bekleniyor.";
        }

        if (taslak?.durum === "analiz_hatasi") {
            return (
                taslak.analizHatasi ||
                "Gemini analizi başarısız oldu."
            );
        }

        if (islenenSayisi > 0) {
            return "Dosyalar işleniyor...";
        }

        if (hataliSayisi > 0) {
            return "Hatalı materyalleri yeniden deneyin veya silin.";
        }

        if (tumMateryallerHazir) {
            return "Materyaller hazır. Gemini analizini başlatabilirsiniz.";
        }

        return "Analiz için en az bir materyal ekleyin.";
    };

    return (
        <div className="max-w-[1200px] mx-auto pb-10">
            <div className="mb-8">
                <h1
                    className={`text-[32px] md:text-[38px] font-bold tracking-tight ${textPrimary}`}
                >
                    Ders Materyallerini Ekle
                </h1>

                {taslak && (
                    <div className="mt-3 inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium bg-[#4F46E5]/10 text-[#4F46E5]">
                        <span className="w-2 h-2 rounded-full bg-[#4F46E5]" />
                        {taslak.dersAdi}
                        {taslak.donem
                            ? ` — ${taslak.donem}`
                            : ""}
                    </div>
                )}
            </div>

            <DersOlusturmaAdimlari
                aktifAdim={2}
                isDark={isDark}
            />

            {hata && (
                <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-500 text-sm">
                    {hata}
                </div>
            )}

            {bilgi && (
                <div className="mb-6 p-4 rounded-xl bg-[#4F46E5]/10 border border-[#4F46E5]/20 text-[#4F46E5] text-sm">
                    {bilgi}
                </div>
            )}

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8">
                <div className="xl:col-span-2 flex flex-col gap-6">
                    <div
                        className={`p-8 md:p-12 rounded-2xl border ${cardBg}`}
                    >
                        <div
                            className={`border-2 border-dashed rounded-2xl p-10 md:p-16 flex flex-col items-center justify-center text-center ${
                                isDark
                                    ? "border-[#26334A] bg-[#0B1120]/50"
                                    : "border-[#CBD5E1] bg-[#F8F7FC]/50"
                            }`}
                            onDragOver={(e) => {
                                e.preventDefault();
                            }}
                            onDrop={(e) => {
                                e.preventDefault();

                                if (islemlerKilitli) return;

                                dosyaYukle({
                                    target: {
                                        files: e.dataTransfer.files,
                                        value: "",
                                    },
                                });
                            }}
                        >
                            <div className="w-16 h-16 rounded-full bg-[#4F46E5]/10 flex items-center justify-center mb-6">
                                <CloudArrowUpIcon className="w-8 h-8 text-[#4F46E5]" />
                            </div>

                            <h3
                                className={`text-[20px] md:text-[24px] font-bold ${textPrimary} mb-2`}
                            >
                                Dosyalarını buraya sürükle ve bırak
                            </h3>

                            <p
                                className={`text-[15px] ${textSecondary} mb-8`}
                            >
                                veya bilgisayarından dosya seç
                            </p>

                            <input
                                type="file"
                                multiple
                                ref={fileInputRef}
                                onChange={dosyaYukle}
                                className="hidden"
                                accept=".pdf,.docx,.pptx,.txt"
                            />

                            <button
                                type="button"
                                onClick={() =>
                                    fileInputRef.current?.click()
                                }
                                disabled={islemlerKilitli}
                                className={`px-8 py-3 rounded-xl font-medium border-2 border-[#4F46E5] text-[#4F46E5] hover:bg-[#4F46E5]/10 transition-colors mb-6 ${
                                    islemlerKilitli
                                        ? "opacity-50 cursor-not-allowed"
                                        : ""
                                }`}
                            >
                                {yukleniyor
                                    ? "Yükleniyor..."
                                    : "Dosya Seç"}
                            </button>

                            <div
                                className={`text-[13px] ${textSecondary}`}
                            >
                                <p>
                                    PDF, DOCX, PPTX ve TXT
                                    desteklenir. (Maks. 50 MB / dosya)
                                </p>
                                <p className="mt-1">
                                    Birden fazla dosya seçebilirsiniz.
                                </p>
                            </div>
                        </div>
                    </div>

                    <div
                        className={`p-5 md:p-6 rounded-2xl border ${
                            isDark
                                ? "bg-[#10192C] border-[#4F46E5]/30"
                                : "bg-[#EEF2FF] border-[#4F46E5]/20"
                        } flex items-start gap-4`}
                    >
                        <div className="w-8 h-8 rounded-full bg-[#4F46E5]/10 flex items-center justify-center shrink-0 mt-0.5">
                            <span className="text-[#4F46E5] font-bold">
                                i
                            </span>
                        </div>

                        <div>
                            <h4
                                className={`text-[15px] font-bold ${textPrimary} mb-1.5`}
                            >
                                Materyaller nasıl kullanılacak?
                            </h4>

                            <p
                                className={`text-[14px] ${textSecondary} leading-relaxed`}
                            >
                                Materyalleriniz önce metne dönüştürülür.
                                Ardından Gemini, tüm materyalleri
                                analiz ederek dersin ortak konu
                                haritasını oluşturur. Ders yalnızca
                                onayınızdan sonra kaydedilir.
                            </p>
                        </div>
                    </div>
                </div>

                <div className="xl:col-span-1">
                    <div
                        className={`p-6 rounded-2xl border ${
                            isDark
                                ? "bg-[#10192C] border-[#26334A]"
                                : "bg-[#F8F7FC] border-[#E7E5EF]"
                        } h-full flex flex-col`}
                    >
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                                <CpuChipIcon className="w-5 h-5 text-[#4F46E5]" />
                            </div>

                            <h3
                                className={`text-[16px] md:text-[18px] font-bold ${textPrimary}`}
                            >
                                İçerik Analizi
                            </h3>
                        </div>

                        <p
                            className={`text-[13px] ${textSecondary} mb-6 leading-relaxed`}
                        >
                            {analizDurumMetni()}
                        </p>

                        <div className="mb-6">
                            <div className="flex items-center justify-between text-[12px] font-bold mb-2">
                                <span className={textSecondary}>
                                    Materyal Durumu
                                </span>

                                <span className={textPrimary}>
                                    {hazirSayisi} / {materyaller.length}
                                    {" "}materyal hazır ({ilerleme}%)
                                </span>
                            </div>

                            <div
                                className={`w-full h-1.5 rounded-full overflow-hidden ${
                                    isDark
                                        ? "bg-[#1B2942]"
                                        : "bg-[#E2E8F0]"
                                }`}
                            >
                                <div
                                    className="h-full bg-[#4F46E5] transition-all duration-300"
                                    style={{
                                        width: `${ilerleme}%`,
                                    }}
                                />
                            </div>
                        </div>

                        <div className="flex-1">
                            <h4
                                className={`text-[11px] font-bold uppercase tracking-widest ${textSecondary} mb-3`}
                            >
                                İŞLEM DURUMLARI
                            </h4>

                            <div className="space-y-2">
                                {[
                                    {
                                        baslik: "İşleniyor / Yükleniyor",
                                        sayi: islenenSayisi,
                                        renk: "text-[#4F46E5]",
                                    },
                                    {
                                        baslik: "Hazır",
                                        sayi: hazirSayisi,
                                        renk: "text-green-500",
                                    },
                                    {
                                        baslik: "Hata",
                                        sayi: hataliSayisi,
                                        renk: "text-red-500",
                                    },
                                ].map((item) => (
                                    <div
                                        key={item.baslik}
                                        className={`flex items-center justify-between p-3 rounded-lg border ${
                                            isDark
                                                ? "border-[#26334A] bg-[#0B1120]"
                                                : "border-[#E7E5EF] bg-white"
                                        }`}
                                    >
                                        <span
                                            className={`text-[13px] font-medium ${textSecondary}`}
                                        >
                                            {item.baslik}
                                        </span>

                                        <span
                                            className={`font-bold ${item.renk}`}
                                        >
                                            {item.sayi}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div
                            className={`mt-6 pt-4 border-t ${
                                isDark
                                    ? "border-[#26334A]"
                                    : "border-[#E7E5EF]"
                            }`}
                        >
                            {analizGuncel ? (
                                <div className="flex items-center gap-2 text-green-500 text-[13px] font-medium mb-4">
                                    <CheckCircleIcon className="w-5 h-5" />
                                    Gemini analizi tamamlandı
                                </div>
                            ) : analizDevamEdiyor ||
                              analizEdiliyor ? (
                                <div className="flex items-center gap-2 text-[#4F46E5] text-[13px] font-medium mb-4">
                                    <ArrowPathIcon className="w-5 h-5 animate-spin" />
                                    Gemini analiz ediyor...
                                </div>
                            ) : (
                                <div
                                    className={`text-[12px] ${textSecondary} mb-4`}
                                >
                                    Materyaller hazır olduğunda
                                    analizi başlatabilirsiniz.
                                </div>
                            )}

                            <button
                                type="button"
                                onClick={analizBaslat}
                                disabled={!analizBaslatilabilir}
                                className={`w-full px-4 py-3 rounded-xl font-medium transition-colors ${
                                    analizBaslatilabilir
                                        ? buttonPrimary
                                        : "bg-gray-500/20 text-gray-400 cursor-not-allowed"
                                }`}
                            >
                                {analizEdiliyor ||
                                analizDevamEdiyor
                                    ? "Analiz Ediliyor..."
                                    : taslak?.durum === "analiz_hatasi"
                                        ? "Analizi Yeniden Dene"
                                        : analizGuncel
                                            ? "Analiz Tamamlandı"
                                            : "Gemini Analizini Başlat"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div
                className={`p-6 md:p-8 rounded-2xl border ${cardBg}`}
            >
                <div className="flex items-center justify-between mb-6">
                    <h3
                        className={`text-[20px] font-bold ${textPrimary}`}
                    >
                        Yüklenen Materyaller
                    </h3>

                    <span
                        className={`px-3 py-1 rounded-lg text-sm font-medium ${
                            isDark
                                ? "bg-[#10192C] text-[#A7B0C2]"
                                : "bg-[#F1F5F9] text-[#64748B]"
                        }`}
                    >
                        {materyaller.length} Materyal
                    </span>
                </div>

                {ilkYukleme ? (
                    <div
                        className={`py-12 text-center ${textSecondary}`}
                    >
                        Materyaller yükleniyor...
                    </div>
                ) : materyaller.length === 0 ? (
                    <div
                        className={`py-12 text-center rounded-xl border border-dashed ${
                            isDark
                                ? "border-[#26334A] bg-[#0B1120]/30"
                                : "border-[#E7E5EF] bg-white"
                        }`}
                    >
                        <p
                            className={`text-[15px] ${textSecondary}`}
                        >
                            Henüz materyal eklenmedi.
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {materyaller.map((materyal) => (
                            <div
                                key={materyal._id}
                                className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border ${
                                    isDark
                                        ? "border-[#26334A] bg-[#162137]"
                                        : "border-[#E7E5EF] bg-white"
                                }`}
                            >
                                <div className="flex items-center gap-4 min-w-0">
                                    <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0 bg-[#4F46E5]/10 text-[#4F46E5]">
                                        <DocumentIcon className="w-5 h-5" />
                                    </div>

                                    <div className="min-w-0">
                                        <h4
                                            className={`text-[14px] font-bold ${textPrimary} mb-0.5 truncate`}
                                        >
                                            {materyal.orijinalDosyaAdi}
                                        </h4>

                                        <div
                                            className={`flex flex-wrap items-center gap-2 text-[12px] ${textSecondary}`}
                                        >
                                            <span className="uppercase">
                                                {materyal.dosyaTuru}
                                            </span>
                                            <span>•</span>
                                            <span>
                                                {dosyaBoyutuYaz(
                                                    materyal.dosyaBoyutu
                                                )}
                                            </span>
                                            <span>•</span>

                                            <span
                                                className={
                                                    materyal.durum === "hazir"
                                                        ? "text-green-500"
                                                        : materyal.durum === "hata"
                                                            ? "text-red-500"
                                                            : "text-yellow-500"
                                                }
                                            >
                                                {materyal.durum === "hazir"
                                                    ? "Hazır"
                                                    : materyal.durum === "hata"
                                                        ? "Hata"
                                                        : "İşleniyor"}
                                            </span>

                                            {[
                                                "isleniyor",
                                                "yuklendi",
                                            ].includes(
                                                materyal.durum
                                            ) && (
                                                <ArrowPathIcon className="w-3 h-3 animate-spin" />
                                            )}
                                        </div>

                                        {materyal.durum === "hata" && (
                                            <p className="text-[11px] text-red-500 mt-1">
                                                {materyal.islemeHatasi}
                                            </p>
                                        )}
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 shrink-0">
                                    {materyal.durum === "hazir" && (
                                        <button
                                            type="button"
                                            onClick={() =>
                                                metinGor(
                                                    materyal._id
                                                )
                                            }
                                            className="px-3 py-1.5 rounded-lg border border-green-500 text-green-500 hover:bg-green-500/10 text-[12px] font-medium"
                                        >
                                            Çıkarılan Metni Gör
                                        </button>
                                    )}

                                    {materyal.durum === "hata" && (
                                        <button
                                            type="button"
                                            disabled={islemlerKilitli}
                                            onClick={() =>
                                                metinCikarmayiYenidenDene(
                                                    materyal._id
                                                )
                                            }
                                            className="px-3 py-1.5 rounded-lg border border-[#4F46E5] text-[#4F46E5] hover:bg-[#4F46E5]/10 text-[12px] font-medium disabled:opacity-50"
                                        >
                                            Yeniden Dene
                                        </button>
                                    )}

                                    <button
                                        type="button"
                                        disabled={islemlerKilitli}
                                        onClick={() =>
                                            materyalSil(
                                                materyal._id
                                            )
                                        }
                                        className="p-2 rounded-lg hover:bg-red-500/10 text-red-500 transition-colors disabled:opacity-40"
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
                    onClick={oncekiAdimaDon}
                    disabled={onaylaniyor}
                    className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium border ${
                        isDark
                            ? "border-[#26334A] hover:bg-white/5 text-[#F8FAFC]"
                            : "border-[#E7E5EF] hover:bg-black/5 text-[#0F172A]"
                    } disabled:opacity-50`}
                >
                    <ArrowLeftIcon className="w-5 h-5" />
                    Geri Dön
                </button>

                <button
                    type="button"
                    onClick={onayModaliniAc}
                    disabled={!onayAcilebilir}
                    className={`w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium transition-colors ${
                        onayAcilebilir
                            ? buttonPrimary
                            : "bg-gray-500/20 text-gray-400 cursor-not-allowed"
                    }`}
                >
                    Materyalleri Kontrol Et
                    <ArrowRightIcon className="w-5 h-5" />
                </button>
            </div>

            {/* Materyal Onay Modalı */}
            {onayModalAcik && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60">
                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="materyal-onay-baslik"
                        className={`w-full max-w-xl rounded-2xl border shadow-2xl overflow-hidden ${cardBg}`}
                    >
                        <div
                            className={`px-6 py-5 flex items-center justify-between border-b ${
                                isDark
                                    ? "border-[#26334A]"
                                    : "border-[#E7E5EF]"
                            }`}
                        >
                            <h3
                                id="materyal-onay-baslik"
                                className={`text-[20px] font-bold ${textPrimary}`}
                            >
                                Materyallerinizi Kontrol Edin
                            </h3>

                            <button
                                type="button"
                                disabled={onaylaniyor}
                                onClick={() =>
                                    setOnayModalAcik(false)
                                }
                                className={textSecondary}
                            >
                                <XMarkIcon className="w-6 h-6" />
                            </button>
                        </div>

                        <div className="p-6">
                            <div className="flex items-start gap-3 mb-5">
                                <ExclamationTriangleIcon className="w-6 h-6 text-amber-500 shrink-0" />

                                <p
                                    className={`text-[14px] leading-relaxed ${textSecondary}`}
                                >
                                    Onaydan sonra ders oluşturulur.
                                    Materyal ekleme, silme ve konu
                                    haritasını yeniden oluşturma
                                    işlemleri kapatılır. Lütfen
                                    dosyalarınızı kontrol edin.
                                </p>
                            </div>

                            <div
                                className={`rounded-xl border p-4 mb-5 ${
                                    isDark
                                        ? "border-[#26334A] bg-[#0B1120]"
                                        : "border-[#E7E5EF] bg-[#F8F7FC]"
                                }`}
                            >
                                <h4
                                    className={`font-bold ${textPrimary} mb-3`}
                                >
                                    {taslak?.dersAdi}
                                </h4>

                                <div className="space-y-2 max-h-48 overflow-y-auto">
                                    {materyaller.map((m) => (
                                        <div
                                            key={m._id}
                                            className={`flex items-center justify-between gap-2 text-[13px] ${textSecondary}`}
                                        >
                                            <span className="truncate">
                                                {m.orijinalDosyaAdi}
                                            </span>

                                            <CheckCircleIcon className="w-4 h-4 text-green-500 shrink-0" />
                                        </div>
                                    ))}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 text-green-500 text-[13px] font-medium">
                                <CheckCircleIcon className="w-5 h-5" />
                                Gemini konu haritası hazır.
                            </div>
                        </div>

                        <div
                            className={`px-6 py-5 border-t flex flex-col sm:flex-row gap-3 justify-end ${
                                isDark
                                    ? "border-[#26334A]"
                                    : "border-[#E7E5EF]"
                            }`}
                        >
                            <button
                                type="button"
                                disabled={onaylaniyor}
                                onClick={() =>
                                    setOnayModalAcik(false)
                                }
                                className={`px-5 py-3 rounded-xl border font-medium ${
                                    isDark
                                        ? "border-[#26334A] text-white"
                                        : "border-[#E7E5EF] text-[#0F172A]"
                                }`}
                            >
                                Geri Dön
                            </button>

                            <button
                                type="button"
                                disabled={
                                    onaylaniyor ||
                                    !onayAcilebilir
                                }
                                onClick={dersiOnayla}
                                className={`px-5 py-3 rounded-xl font-medium ${buttonPrimary} disabled:opacity-50`}
                            >
                                {onaylaniyor
                                    ? "Ders Oluşturuluyor..."
                                    : "Onayla ve Dersi Oluştur"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Çıkarılan Metin Modalı */}
            {metinModalAcik && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
                    <div
                        role="dialog"
                        aria-modal="true"
                        className={`w-full max-w-2xl max-h-[80vh] flex flex-col rounded-2xl border shadow-xl overflow-hidden ${cardBg}`}
                    >
                        <div
                            className={`px-6 py-4 flex items-center justify-between border-b ${
                                isDark
                                    ? "border-[#26334A]"
                                    : "border-[#E7E5EF]"
                            }`}
                        >
                            <h3
                                className={`text-[18px] font-bold ${textPrimary}`}
                            >
                                Çıkarılan Metin
                            </h3>

                            <button
                                type="button"
                                onClick={() =>
                                    setMetinModalAcik(false)
                                }
                                className={textSecondary}
                            >
                                Kapat
                            </button>
                        </div>

                        <div className="p-6 overflow-y-auto">
                            {metinYukleniyor ? (
                                <div className="py-10 flex justify-center">
                                    <ArrowPathIcon className="w-8 h-8 text-[#4F46E5] animate-spin" />
                                </div>
                            ) : (
                                <pre
                                    className={`whitespace-pre-wrap text-[13px] font-mono leading-relaxed ${textPrimary}`}
                                >
                                    {seciliMetin}
                                </pre>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MateryalEkle;

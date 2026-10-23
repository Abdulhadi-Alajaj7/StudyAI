import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowPathIcon,
    CalendarDaysIcon,
    CheckCircleIcon,
    ChevronRightIcon,
    ClipboardDocumentCheckIcon,
    ClockIcon,
    DocumentTextIcon,
    ExclamationTriangleIcon,
    EyeIcon,
    PlayIcon,
    PlusCircleIcon,
    SparklesIcon,
} from "@heroicons/react/24/outline";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";

import OzetSecimDropdown from "../components/OzetSecimDropdown.jsx";
import testlerApi from "../services/testlerApi.mjs";
import {
    konuSecenekleriniOlustur,
    kullanilabilirMateryalleriSec,
} from "../utils/dersOzetiYardimcilari.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import {
    basariOraniniGetir,
    tarihiBicimlendir,
    testCozmeYolu,
    testHedefBilgisi,
    testIlerlemeBilgisi,
    testKapsamEtiketi,
    testOlusturmaGirdisiOlustur,
    testSonucYolu,
    testZorlukEtiketi,
} from "../utils/testlerYardimcilari.mjs";

const kapsamlar = [
    { deger: "tum_ders", etiket: "Tüm Ders" },
    { deger: "materyal", etiket: "Materyal" },
    { deger: "konu", etiket: "Konu" },
];
const soruSayilari = [5, 10, 15, 20];
const zorluklar = [
    { deger: "kolay", etiket: "Kolay" },
    { deger: "orta", etiket: "Orta" },
    { deger: "zor", etiket: "Zor" },
    { deger: "karisik", etiket: "Karışık" },
];

const istekIptalEdildiMi = (hata) => (
    hata?.code === "ERR_CANCELED" ||
    hata?.name === "CanceledError" ||
    hata?.name === "AbortError"
);

const testIslemiHataMesaji = (hata, varsayilanMesaj) => {
    const durum = hata?.response?.status;
    const sunucuMesaji = hata?.response?.data?.hata;
    if ([404, 409, 422, 502].includes(durum) && typeof sunucuMesaji === "string" && sunucuMesaji.trim()) {
        return sunucuMesaji;
    }
    return kullaniciHataMesaji(hata, varsayilanMesaj);
};

function YuklemeSatirlari({ isDark, adet = 2 }) {
    return (
        <div className="space-y-3" role="status" aria-label="Testler yükleniyor">
            {Array.from({ length: adet }, (_, index) => (
                <div
                    key={index}
                    className={`h-[78px] animate-pulse rounded-xl border ${
                        isDark
                            ? "border-white/[0.05] bg-white/[0.035]"
                            : "border-slate-100 bg-slate-50"
                    }`}
                />
            ))}
        </div>
    );
}

function BosDurum({ isDark, baslik, aciklama }) {
    return (
        <div className={`rounded-xl border border-dashed px-5 py-8 text-center ${
            isDark ? "border-[#2A3B58] bg-[#0C1728]/60" : "border-[#DDE2EA] bg-[#F8FAFC]"
        }`}>
            <ClipboardDocumentCheckIcon className={`mx-auto h-8 w-8 ${
                isDark ? "text-[#6E7D96]" : "text-[#94A3B8]"
            }`} />
            <p className={`mt-3 text-[13px] font-bold ${
                isDark ? "text-[#DDE5F2]" : "text-[#334155]"
            }`}>{baslik}</p>
            <p className={`mx-auto mt-1 max-w-lg text-[12px] leading-5 ${
                isDark ? "text-[#8794A8]" : "text-[#64748B]"
            }`}>{aciklama}</p>
        </div>
    );
}

function HataBildirimi({ isDark, mesaj, onRetry }) {
    return (
        <div className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-[12px] sm:flex-row sm:items-center sm:justify-between ${
            isDark
                ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
                : "border-rose-200 bg-rose-50 text-rose-700"
        }`} role="alert">
            <span className="flex items-start gap-2">
                <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{mesaj}</span>
            </span>
            {onRetry && (
                <button
                    type="button"
                    onClick={onRetry}
                    className="shrink-0 self-start font-bold underline underline-offset-4 sm:self-auto"
                >
                    Yeniden dene
                </button>
            )}
        </div>
    );
}

function DersTestler() {
    const { isDark, ders } = useOutletContext();
    const { dersId } = useParams();
    const navigate = useNavigate();

    const [kapsamTuru, setKapsamTuru] = useState("tum_ders");
    const [soruSayisi, setSoruSayisi] = useState(10);
    const [zorluk, setZorluk] = useState("karisik");
    const [materyalId, setMateryalId] = useState("");
    const [konuId, setKonuId] = useState("");

    const [materyaller, setMateryaller] = useState([]);
    const [konuHaritasi, setKonuHaritasi] = useState(null);
    const [devamEdenTestler, setDevamEdenTestler] = useState([]);
    const [tamamlananTestler, setTamamlananTestler] = useState([]);
    const [sayfaYukleniyor, setSayfaYukleniyor] = useState(true);
    const [listelerYenileniyor, setListelerYenileniyor] = useState(false);
    const [secenekHatalari, setSecenekHatalari] = useState({ materyal: "", konu: "" });
    const [listeHatalari, setListeHatalari] = useState({ devam: "", tamamlanan: "" });
    const [yenilemeAnahtari, setYenilemeAnahtari] = useState(0);

    const [olusturuluyor, setOlusturuluyor] = useState(false);
    const [olusturmaHatasi, setOlusturmaHatasi] = useState("");
    const [olusturulanTest, setOlusturulanTest] = useState(null);
    const [eylemdekiTestId, setEylemdekiTestId] = useState("");
    const [eylemHatasi, setEylemHatasi] = useState("");

    const monteRef = useRef(true);
    const aktifDersRef = useRef(dersId);
    const olusturuluyorRef = useRef(false);
    const listeControllerRef = useRef(null);
    const olusturmaControllerRef = useRef(null);
    const eylemControllerRef = useRef(null);
    aktifDersRef.current = dersId;

    useEffect(() => () => {
        monteRef.current = false;
        listeControllerRef.current?.abort();
        olusturmaControllerRef.current?.abort();
        eylemControllerRef.current?.abort();
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        const istekDersId = dersId;
        listeControllerRef.current?.abort();
        listeControllerRef.current = controller;

        setSayfaYukleniyor(true);
        setListelerYenileniyor(false);
        setMateryaller([]);
        setKonuHaritasi(null);
        setDevamEdenTestler([]);
        setTamamlananTestler([]);
        setSecenekHatalari({ materyal: "", konu: "" });
        setListeHatalari({ devam: "", tamamlanan: "" });
        setOlusturulanTest(null);
        setOlusturmaHatasi("");
        setEylemHatasi("");
        setMateryalId("");
        setKonuId("");

        const verileriGetir = async () => {
            const sonuclar = await Promise.allSettled([
                testlerApi.materyalleriGetir(istekDersId, controller.signal),
                testlerApi.konuHaritasiniGetir(istekDersId, controller.signal),
                testlerApi.devamEdenTestleriGetir(istekDersId, controller.signal),
                testlerApi.tamamlananTestleriGetir(istekDersId, controller.signal),
            ]);
            if (
                controller.signal.aborted ||
                !monteRef.current ||
                aktifDersRef.current !== istekDersId
            ) return;

            const [materyalSonucu, konuSonucu, devamSonucu, tamamlananSonucu] = sonuclar;
            if (materyalSonucu.status === "fulfilled") {
                setMateryaller(materyalSonucu.value.data?.materyaller || []);
            } else if (!istekIptalEdildiMi(materyalSonucu.reason)) {
                setSecenekHatalari((mevcut) => ({
                    ...mevcut,
                    materyal: kullaniciHataMesaji(
                        materyalSonucu.reason,
                        "Materyaller yüklenemedi."
                    ),
                }));
            }

            if (konuSonucu.status === "fulfilled") {
                setKonuHaritasi(konuSonucu.value.data?.harita || null);
            } else if (!istekIptalEdildiMi(konuSonucu.reason)) {
                setSecenekHatalari((mevcut) => ({
                    ...mevcut,
                    konu: kullaniciHataMesaji(konuSonucu.reason, "Konular yüklenemedi."),
                }));
            }

            if (devamSonucu.status === "fulfilled") {
                setDevamEdenTestler(devamSonucu.value.data?.testler || []);
            } else if (!istekIptalEdildiMi(devamSonucu.reason)) {
                setListeHatalari((mevcut) => ({
                    ...mevcut,
                    devam: kullaniciHataMesaji(
                        devamSonucu.reason,
                        "Devam eden testler yüklenemedi."
                    ),
                }));
            }

            if (tamamlananSonucu.status === "fulfilled") {
                setTamamlananTestler(tamamlananSonucu.value.data?.testler || []);
            } else if (!istekIptalEdildiMi(tamamlananSonucu.reason)) {
                setListeHatalari((mevcut) => ({
                    ...mevcut,
                    tamamlanan: kullaniciHataMesaji(
                        tamamlananSonucu.reason,
                        "Geçmiş testler yüklenemedi."
                    ),
                }));
            }
            setSayfaYukleniyor(false);
        };

        void verileriGetir();
        return () => controller.abort();
    }, [dersId, yenilemeAnahtari]);

    const listeleriYenile = useCallback(async () => {
        const istekDersId = dersId;
        const controller = new AbortController();
        listeControllerRef.current?.abort();
        listeControllerRef.current = controller;
        if (monteRef.current) {
            setListelerYenileniyor(true);
            setListeHatalari({ devam: "", tamamlanan: "" });
        }

        const [devamSonucu, tamamlananSonucu] = await Promise.allSettled([
            testlerApi.devamEdenTestleriGetir(istekDersId, controller.signal),
            testlerApi.tamamlananTestleriGetir(istekDersId, controller.signal),
        ]);
        if (
            controller.signal.aborted ||
            !monteRef.current ||
            aktifDersRef.current !== istekDersId
        ) return;

        if (devamSonucu.status === "fulfilled") {
            setDevamEdenTestler(devamSonucu.value.data?.testler || []);
        } else if (!istekIptalEdildiMi(devamSonucu.reason)) {
            setListeHatalari((mevcut) => ({
                ...mevcut,
                devam: kullaniciHataMesaji(devamSonucu.reason, "Devam eden testler yenilenemedi."),
            }));
        }
        if (tamamlananSonucu.status === "fulfilled") {
            setTamamlananTestler(tamamlananSonucu.value.data?.testler || []);
        } else if (!istekIptalEdildiMi(tamamlananSonucu.reason)) {
            setListeHatalari((mevcut) => ({
                ...mevcut,
                tamamlanan: kullaniciHataMesaji(tamamlananSonucu.reason, "Geçmiş testler yenilenemedi."),
            }));
        }
        setListelerYenileniyor(false);
    }, [dersId]);

    const kullanilabilirMateryaller = useMemo(
        () => kullanilabilirMateryalleriSec(materyaller),
        [materyaller]
    );
    const konuSecenekleri = useMemo(
        () => konuSecenekleriniOlustur(konuHaritasi),
        [konuHaritasi]
    );
    const materyalDropdownSecenekleri = useMemo(
        () => kullanilabilirMateryaller.map((materyal) => ({
            value: String(materyal._id),
            label: materyal.orijinalDosyaAdi || materyal.dosyaAdi || "Adsız materyal",
        })),
        [kullanilabilirMateryaller]
    );
    const konuDropdownSecenekleri = useMemo(
        () => konuSecenekleri.map((konu) => ({
            value: konu.konuId,
            label: konu.baslik,
            tamEtiket: konu.etiket,
            seviye: konu.tur,
            ustBaslik: konu.tur === "alt_konu"
                ? konu.etiket.split(" — ")[0]
                : "",
        })),
        [konuSecenekleri]
    );

    const olusturmaGirdisi = useMemo(() => testOlusturmaGirdisiOlustur({
        kapsamTuru,
        soruSayisi,
        zorluk,
        materyalId,
        konuId,
    }), [kapsamTuru, soruSayisi, zorluk, materyalId, konuId]);

    const secimiDegistir = (degistirici, deger) => {
        degistirici(deger);
        setOlusturulanTest(null);
        setOlusturmaHatasi("");
    };

    const kapsamiDegistir = (yeniKapsam) => {
        if (olusturuluyor) return;
        setKapsamTuru(yeniKapsam);
        setMateryalId("");
        setKonuId("");
        setOlusturulanTest(null);
        setOlusturmaHatasi("");
    };

    const testiOlustur = async () => {
        if (!olusturmaGirdisi || olusturuluyorRef.current) return;
        const istekDersId = dersId;
        const controller = new AbortController();
        olusturmaControllerRef.current?.abort();
        olusturmaControllerRef.current = controller;
        olusturuluyorRef.current = true;
        setOlusturuluyor(true);
        setOlusturmaHatasi("");
        setOlusturulanTest(null);

        try {
            const yanit = await testlerApi.testOlustur(
                istekDersId,
                olusturmaGirdisi,
                controller.signal
            );
            const yeniTest = yanit.data?.test;
            if (!yeniTest?._id) throw new Error("Test yanıtı eksik döndü.");
            if (
                controller.signal.aborted ||
                !monteRef.current ||
                aktifDersRef.current !== istekDersId
            ) return;
            setOlusturulanTest(yeniTest);
            void listeleriYenile();
        } catch (hata) {
            if (
                !istekIptalEdildiMi(hata) &&
                monteRef.current &&
                aktifDersRef.current === istekDersId
            ) {
                setOlusturmaHatasi(testIslemiHataMesaji(
                    hata,
                    "Test oluşturulamadı. Lütfen tekrar deneyin."
                ));
            }
        } finally {
            olusturuluyorRef.current = false;
            if (monteRef.current && aktifDersRef.current === istekDersId) {
                setOlusturuluyor(false);
            }
        }
    };

    const testeGit = async (test) => {
        const testId = String(test?._id || "");
        if (!testId || eylemdekiTestId) return;
        setEylemHatasi("");
        if (test.durum === "devam_ediyor") {
            navigate(testCozmeYolu(dersId, testId), { state: { test } });
            return;
        }

        const istekDersId = dersId;
        const controller = new AbortController();
        eylemControllerRef.current?.abort();
        eylemControllerRef.current = controller;
        setEylemdekiTestId(testId);
        try {
            const yanit = await testlerApi.testiBaslat(istekDersId, testId, controller.signal);
            const baslatilanTest = yanit.data?.test;
            if (!baslatilanTest?._id) throw new Error("Test başlatma yanıtı eksik döndü.");
            if (
                !controller.signal.aborted &&
                monteRef.current &&
                aktifDersRef.current === istekDersId
            ) {
                navigate(testCozmeYolu(istekDersId, testId), {
                    state: { test: baslatilanTest },
                });
            }
        } catch (hata) {
            if (
                !istekIptalEdildiMi(hata) &&
                monteRef.current &&
                aktifDersRef.current === istekDersId
            ) {
                setEylemHatasi(testIslemiHataMesaji(
                    hata,
                    "Test başlatılamadı. Lütfen tekrar deneyin."
                ));
            }
        } finally {
            if (monteRef.current && aktifDersRef.current === istekDersId) {
                setEylemdekiTestId("");
            }
        }
    };

    const kart = isDark ? "border-[#22324A] bg-[#0F1A2D]" : "border-[#E4E7EF] bg-white";
    const metinAna = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const metinIkincil = isDark ? "text-[#9EABC0]" : "text-[#64748B]";
    const altKenarlik = isDark ? "border-white/[0.06]" : "border-[#EDF0F5]";
    const ortakButon = isDark
        ? "border-[#31435F] bg-[#14213A] text-[#D7DEFF] hover:border-violet-400/60 hover:bg-[#192947]"
        : "border-[#D9DDE8] bg-white text-[#4B5563] hover:border-violet-300 hover:bg-violet-50";

    const hedefUyarisi = kapsamTuru === "materyal"
        ? (secenekHatalari.materyal || (
            !sayfaYukleniyor && kullanilabilirMateryaller.length === 0
                ? "Test oluşturulabilecek hazır materyal bulunmuyor."
                : ""
        ))
        : kapsamTuru === "konu"
            ? (secenekHatalari.konu || (
                !sayfaYukleniyor && konuSecenekleri.length === 0
                    ? "Test oluşturulabilecek hazır konu bulunmuyor."
                    : ""
            ))
            : "";

    return (
        <div className="space-y-5 sm:space-y-6">
            <header>
                <h1 className={`text-[27px] font-extrabold tracking-tight sm:text-[32px] ${metinAna}`}>
                    Testler
                </h1>
                <p className={`mt-1 text-[13px] sm:text-[14px] ${metinIkincil}`}>
                    Bilgini ölç, konuları pekiştir ve test geçmişini takip et.
                </p>
            </header>

            <section className={`overflow-hidden rounded-2xl border shadow-sm ${kart}`}>
                <div className={`flex items-center gap-3 border-b px-4 py-4 sm:px-5 ${altKenarlik}`}>
                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                        isDark ? "bg-violet-400/10 text-violet-300" : "bg-violet-50 text-violet-600"
                    }`}>
                        <PlusCircleIcon className="h-6 w-6" />
                    </span>
                    <div>
                        <h2 className={`text-[16px] font-bold sm:text-[17px] ${metinAna}`}>
                            Yeni Test Oluştur
                        </h2>
                        <p className={`mt-0.5 text-[11px] sm:text-[12px] ${metinIkincil}`}>
                            Kapsamı ve zorluk seviyesini seçerek kaynaklarına dayalı bir test hazırla.
                        </p>
                    </div>
                </div>

                <div className="grid gap-5 px-4 py-5 sm:px-5 xl:grid-cols-12 xl:items-end">
                    <fieldset className="xl:col-span-4">
                        <legend className={`mb-2 text-[12px] font-bold ${metinAna}`}>Kapsam</legend>
                        <div className={`grid h-[46px] grid-cols-3 rounded-xl border p-1 ${
                            isDark ? "border-[#2A3B59] bg-[#0C1728]" : "border-[#DCE1EA] bg-[#F8FAFC]"
                        }`}>
                            {kapsamlar.map((secenek) => {
                                const secili = kapsamTuru === secenek.deger;
                                return (
                                    <button
                                        key={secenek.deger}
                                        type="button"
                                        aria-pressed={secili}
                                        disabled={olusturuluyor}
                                        onClick={() => kapsamiDegistir(secenek.deger)}
                                        className={`rounded-lg px-1 text-[11px] font-semibold transition-colors sm:text-[12px] ${
                                            secili
                                                ? "bg-[#6558E8] text-white shadow-sm"
                                                : isDark
                                                    ? "text-[#AEB8CA] hover:text-white"
                                                    : "text-[#64748B] hover:text-[#111827]"
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                    >
                                        {secenek.etiket}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    <fieldset className="xl:col-span-3">
                        <legend className={`mb-2 text-[12px] font-bold ${metinAna}`}>Soru Sayısı</legend>
                        <div className="grid h-[46px] grid-cols-4 gap-1.5">
                            {soruSayilari.map((sayi) => {
                                const secili = soruSayisi === sayi;
                                return (
                                    <button
                                        key={sayi}
                                        type="button"
                                        aria-pressed={secili}
                                        disabled={olusturuluyor}
                                        onClick={() => secimiDegistir(setSoruSayisi, sayi)}
                                        className={`rounded-xl border text-[12px] font-bold transition-colors ${
                                            secili
                                                ? "border-[#8277F2] bg-[#6558E8]/20 text-[#B9B1FF]"
                                                : ortakButon
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                    >
                                        {sayi}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    <fieldset className="xl:col-span-3">
                        <legend className={`mb-2 text-[12px] font-bold ${metinAna}`}>Zorluk Seviyesi</legend>
                        <div className="grid h-[46px] grid-cols-4 gap-1.5">
                            {zorluklar.map((secenek) => {
                                const secili = zorluk === secenek.deger;
                                return (
                                    <button
                                        key={secenek.deger}
                                        type="button"
                                        aria-pressed={secili}
                                        disabled={olusturuluyor}
                                        onClick={() => secimiDegistir(setZorluk, secenek.deger)}
                                        className={`rounded-xl border px-0.5 text-[10px] font-bold transition-colors sm:text-[11px] ${
                                            secili
                                                ? "border-[#8277F2] bg-[#6558E8]/20 text-[#B9B1FF]"
                                                : ortakButon
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                    >
                                        {secenek.etiket}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    <button
                        type="button"
                        onClick={testiOlustur}
                        disabled={sayfaYukleniyor || olusturuluyor || !olusturmaGirdisi}
                        className="inline-flex h-[46px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6555F3] to-[#8270FF] px-3 text-[12px] font-bold text-white shadow-lg shadow-indigo-950/20 transition-all hover:from-[#5948E7] hover:to-[#7461F4] disabled:cursor-not-allowed disabled:opacity-55 xl:col-span-2"
                    >
                        {olusturuluyor ? (
                            <>
                                <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                <span>Test Hazırlanıyor...</span>
                            </>
                        ) : (
                            <>
                                <SparklesIcon className="h-4 w-4" />
                                <span>Test Oluştur</span>
                            </>
                        )}
                    </button>
                </div>

                {(kapsamTuru === "materyal" || kapsamTuru === "konu") && (
                    <div className={`border-t px-4 py-4 sm:px-5 ${altKenarlik}`}>
                        <div className="max-w-xl">
                            <label className={`mb-2 block text-[12px] font-bold ${metinAna}`}>
                                {kapsamTuru === "materyal" ? "Materyal Seçimi" : "Konu Seçimi"}
                            </label>
                            {kapsamTuru === "materyal" ? (
                                <OzetSecimDropdown
                                    id="test-materyal"
                                    value={materyalId}
                                    onChange={(deger) => secimiDegistir(setMateryalId, deger)}
                                    options={materyalDropdownSecenekleri}
                                    disabled={olusturuluyor || sayfaYukleniyor || materyalDropdownSecenekleri.length === 0}
                                    emptyLabel={sayfaYukleniyor ? "Materyaller yükleniyor..." : "Hazır materyal yok"}
                                    tur="materyal"
                                    isDark={isDark}
                                />
                            ) : (
                                <OzetSecimDropdown
                                    id="test-konu"
                                    value={konuId}
                                    onChange={(deger) => secimiDegistir(setKonuId, deger)}
                                    options={konuDropdownSecenekleri}
                                    disabled={olusturuluyor || sayfaYukleniyor || konuDropdownSecenekleri.length === 0}
                                    emptyLabel={sayfaYukleniyor ? "Konular yükleniyor..." : "Hazır konu yok"}
                                    tur="konu"
                                    isDark={isDark}
                                />
                            )}
                            {hedefUyarisi && (
                                <p className={`mt-2 text-[11px] leading-5 ${
                                    (secenekHatalari.materyal || secenekHatalari.konu)
                                        ? "text-rose-400"
                                        : metinIkincil
                                }`}>
                                    {hedefUyarisi}
                                </p>
                            )}
                        </div>
                    </div>
                )}

                {olusturmaHatasi && (
                    <div className="px-4 pb-4 sm:px-5">
                        <HataBildirimi isDark={isDark} mesaj={olusturmaHatasi} />
                    </div>
                )}

                {olusturulanTest && (
                    <div className={`border-t px-4 py-4 sm:px-5 ${altKenarlik}`} aria-live="polite">
                        <div className={`flex flex-col gap-4 rounded-xl border px-4 py-4 sm:flex-row sm:items-center ${
                            isDark
                                ? "border-emerald-400/20 bg-emerald-400/[0.07]"
                                : "border-emerald-200 bg-emerald-50"
                        }`}>
                            <CheckCircleIcon className="h-8 w-8 shrink-0 text-emerald-400" />
                            <div className="min-w-0 flex-1">
                                <p className={`text-[14px] font-extrabold ${
                                    isDark ? "text-emerald-100" : "text-emerald-800"
                                }`}>Testiniz Hazır!</p>
                                <p className={`mt-1 text-[12px] ${metinIkincil}`}>
                                    {(olusturulanTest.sorular?.length || olusturulanTest.soruSayisi)} soru
                                    {" · "}{testKapsamEtiketi(olusturulanTest.kapsamTuru)}
                                    {" · "}{testZorlukEtiketi(olusturulanTest.zorluk)}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => testeGit(olusturulanTest)}
                                disabled={Boolean(eylemdekiTestId)}
                                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 text-[12px] font-bold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                                {eylemdekiTestId === String(olusturulanTest._id) ? (
                                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                ) : (
                                    <PlayIcon className="h-4 w-4" />
                                )}
                                Testi Başlat
                            </button>
                        </div>
                    </div>
                )}
            </section>

            <section className={`overflow-hidden rounded-2xl border shadow-sm ${kart}`}>
                <div className={`flex items-center gap-3 border-b px-4 py-4 sm:px-5 ${altKenarlik}`}>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        isDark ? "bg-amber-400/10 text-amber-300" : "bg-amber-50 text-amber-600"
                    }`}>
                        <ClockIcon className="h-5 w-5" />
                    </span>
                    <h2 className={`text-[16px] font-bold ${metinAna}`}>
                        Devam Eden Testler
                        {!sayfaYukleniyor && ` (${devamEdenTestler.length})`}
                    </h2>
                    {listelerYenileniyor && (
                        <ArrowPathIcon className={`ml-auto h-4 w-4 animate-spin ${metinIkincil}`} />
                    )}
                </div>
                <div className="space-y-3 p-4 sm:p-5">
                    {eylemHatasi && <HataBildirimi isDark={isDark} mesaj={eylemHatasi} />}
                    {sayfaYukleniyor ? (
                        <YuklemeSatirlari isDark={isDark} />
                    ) : listeHatalari.devam ? (
                        <HataBildirimi
                            isDark={isDark}
                            mesaj={listeHatalari.devam}
                            onRetry={() => setYenilemeAnahtari((deger) => deger + 1)}
                        />
                    ) : devamEdenTestler.length === 0 ? (
                        <BosDurum
                            isDark={isDark}
                            baslik="Devam eden test bulunmuyor"
                            aciklama="Yeni bir test oluşturduğunuzda burada görüntülenir."
                        />
                    ) : devamEdenTestler.map((test) => {
                        const hedef = testHedefBilgisi(test, {
                            materyaller,
                            konular: konuSecenekleri,
                            dersAdi: ders?.dersAdi,
                        });
                        const ilerleme = testIlerlemeBilgisi(test);
                        const eylemde = eylemdekiTestId === String(test._id);
                        return (
                            <article
                                key={String(test._id)}
                                className={`grid gap-4 rounded-xl border px-4 py-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(240px,1fr)_auto] lg:items-center ${
                                    isDark
                                        ? "border-white/[0.055] bg-[#0C1728]/65"
                                        : "border-[#EEF1F5] bg-[#FBFCFE]"
                                }`}
                            >
                                <div className="flex min-w-0 items-start gap-3">
                                    <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${
                                        test.durum === "hazirlandi"
                                            ? isDark ? "bg-sky-400/10 text-sky-300" : "bg-sky-50 text-sky-600"
                                            : isDark ? "bg-amber-400/10 text-amber-300" : "bg-amber-50 text-amber-600"
                                    }`}>
                                        <DocumentTextIcon className="h-5 w-5" />
                                    </span>
                                    <div className="min-w-0">
                                        <h3 className={`truncate text-[13px] font-bold sm:text-[14px] ${metinAna}`} title={hedef.baslik}>
                                            {hedef.baslik}
                                        </h3>
                                        <p className={`mt-1 flex flex-wrap gap-x-2 gap-y-1 text-[11px] ${metinIkincil}`}>
                                            <span>{hedef.kapsam}</span>
                                            <span aria-hidden="true">•</span>
                                            <span>{test.soruSayisi} soru</span>
                                            <span aria-hidden="true">•</span>
                                            <span>{testZorlukEtiketi(test.zorluk)}</span>
                                        </p>
                                        <p className={`mt-1.5 flex items-center gap-1 text-[10px] ${metinIkincil}`}>
                                            <CalendarDaysIcon className="h-3.5 w-3.5" />
                                            {test.baslamaTarihi
                                                ? `Başlangıç: ${tarihiBicimlendir(test.baslamaTarihi)}`
                                                : `Oluşturulma: ${tarihiBicimlendir(test.createdAt)}`}
                                        </p>
                                    </div>
                                </div>

                                <div>
                                    <div className={`flex items-center justify-between gap-3 text-[10px] ${metinIkincil}`}>
                                        <span>İlerleme Durumu</span>
                                        <span className={`font-bold ${metinAna}`}>
                                            {ilerleme?.biliniyor
                                                ? `${ilerleme.cevaplanan} / ${ilerleme.toplam} (%${ilerleme.yuzde})`
                                                : "Yanıt sayısı kullanılamıyor"}
                                        </span>
                                    </div>
                                    {ilerleme?.biliniyor ? (
                                        <div className={`mt-2 h-2 overflow-hidden rounded-full ${
                                            isDark ? "bg-[#223149]" : "bg-[#E5E9F0]"
                                        }`}>
                                            <div
                                                className="h-full rounded-full bg-gradient-to-r from-[#7168F3] to-[#9C91FF]"
                                                style={{ width: `${ilerleme.yuzde}%` }}
                                            />
                                        </div>
                                    ) : (
                                        <p className={`mt-2 text-[10px] leading-4 ${metinIkincil}`}>
                                            Liste API’si cevaplanan soru sayısını sağlamıyor; son görüntülenen soru ilerleme olarak kullanılmadı.
                                        </p>
                                    )}
                                </div>

                                <button
                                    type="button"
                                    onClick={() => testeGit(test)}
                                    disabled={Boolean(eylemdekiTestId)}
                                    className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[12px] font-bold transition-colors ${ortakButon} disabled:cursor-not-allowed disabled:opacity-55`}
                                >
                                    {eylemde ? (
                                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    ) : (
                                        <PlayIcon className="h-4 w-4" />
                                    )}
                                    {test.durum === "hazirlandi" ? "Testi Başlat" : "Devam Et"}
                                    {!eylemde && <ChevronRightIcon className="h-3.5 w-3.5" />}
                                </button>
                            </article>
                        );
                    })}
                </div>
            </section>

            <section className={`overflow-hidden rounded-2xl border shadow-sm ${kart}`}>
                <div className={`flex items-center gap-3 border-b px-4 py-4 sm:px-5 ${altKenarlik}`}>
                    <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${
                        isDark ? "bg-violet-400/10 text-violet-300" : "bg-violet-50 text-violet-600"
                    }`}>
                        <ArrowPathIcon className="h-5 w-5 -scale-x-100" />
                    </span>
                    <h2 className={`text-[16px] font-bold ${metinAna}`}>Geçmiş Testler</h2>
                </div>
                <div className="p-4 sm:p-5">
                    {sayfaYukleniyor ? (
                        <YuklemeSatirlari isDark={isDark} adet={3} />
                    ) : listeHatalari.tamamlanan ? (
                        <HataBildirimi
                            isDark={isDark}
                            mesaj={listeHatalari.tamamlanan}
                            onRetry={() => setYenilemeAnahtari((deger) => deger + 1)}
                        />
                    ) : tamamlananTestler.length === 0 ? (
                        <BosDurum
                            isDark={isDark}
                            baslik="Henüz tamamlanmış test yok"
                            aciklama="Tamamladığınız testlerin sonuçları burada salt okunur olarak listelenir."
                        />
                    ) : (
                        <>
                            <div className="space-y-3 md:hidden">
                                {tamamlananTestler.map((test) => {
                                    const hedef = testHedefBilgisi(test, {
                                        materyaller,
                                        konular: konuSecenekleri,
                                        dersAdi: ders?.dersAdi,
                                    });
                                    const oran = basariOraniniGetir(test);
                                    return (
                                        <article key={String(test._id)} className={`rounded-xl border p-4 ${
                                            isDark ? "border-white/[0.06] bg-[#0C1728]/65" : "border-[#EDF0F5] bg-[#FBFCFE]"
                                        }`}>
                                            <h3 className={`text-[13px] font-bold ${metinAna}`}>{hedef.baslik}</h3>
                                            <p className={`mt-1 text-[11px] ${metinIkincil}`}>
                                                {hedef.kapsam} · {test.soruSayisi} soru · {tarihiBicimlendir(test.tamamlanmaTarihi)}
                                            </p>
                                            <div className="mt-4 grid grid-cols-3 gap-2 text-center text-[11px]">
                                                <span className="rounded-lg bg-emerald-500/10 px-2 py-2 text-emerald-500">{test.sonuc?.dogruSayisi ?? "—"} Doğru</span>
                                                <span className="rounded-lg bg-rose-500/10 px-2 py-2 text-rose-500">{test.sonuc?.yanlisSayisi ?? "—"} Yanlış</span>
                                                <span className={`rounded-lg px-2 py-2 ${isDark ? "bg-white/5 text-[#AAB5C8]" : "bg-slate-100 text-slate-600"}`}>{test.sonuc?.bosSayisi ?? "—"} Boş</span>
                                            </div>
                                            <div className="mt-4 flex items-center justify-between gap-3">
                                                <span className={`text-[12px] font-bold ${metinAna}`}>
                                                    Başarı: {oran === null ? "—" : `%${oran}`}
                                                </span>
                                                <button
                                                    type="button"
                                                    onClick={() => navigate(testSonucYolu(dersId, test._id), { state: { test } })}
                                                    className={`inline-flex h-9 items-center gap-2 rounded-xl border px-3 text-[11px] font-bold ${ortakButon}`}
                                                >
                                                    <EyeIcon className="h-4 w-4" />
                                                    İncele
                                                </button>
                                            </div>
                                        </article>
                                    );
                                })}
                            </div>

                            <div className={`hidden overflow-x-auto rounded-xl border md:block ${
                                isDark ? "border-white/[0.06]" : "border-[#EDF0F5]"
                            }`}>
                                <div className={`grid grid-cols-[minmax(210px,1.5fr)_100px_110px_170px_150px_145px_100px] gap-3 border-b px-4 py-3 text-[9px] font-bold uppercase tracking-[0.12em] ${
                                    isDark ? "border-white/[0.06] bg-[#0C1728] text-[#7F8DA4]" : "border-[#EDF0F5] bg-[#F8FAFC] text-[#64748B]"
                                }`}>
                                    <span>Test</span>
                                    <span>Kapsam</span>
                                    <span>Soru Sayısı</span>
                                    <span>Doğru / Yanlış / Boş</span>
                                    <span>Başarı Oranı</span>
                                    <span>Tamamlanma</span>
                                    <span className="sr-only">Eylem</span>
                                </div>
                                {tamamlananTestler.map((test) => {
                                    const hedef = testHedefBilgisi(test, {
                                        materyaller,
                                        konular: konuSecenekleri,
                                        dersAdi: ders?.dersAdi,
                                    });
                                    const oran = basariOraniniGetir(test);
                                    return (
                                        <div
                                            key={String(test._id)}
                                            className={`grid grid-cols-[minmax(210px,1.5fr)_100px_110px_170px_150px_145px_100px] items-center gap-3 border-b px-4 py-3.5 text-[11px] last:border-b-0 ${altKenarlik}`}
                                        >
                                            <span className={`truncate font-bold ${metinAna}`} title={hedef.baslik}>{hedef.baslik}</span>
                                            <span className={metinIkincil}>{hedef.kapsam}</span>
                                            <span className={metinAna}>{test.soruSayisi}</span>
                                            <span className={metinAna}>
                                                <b className="text-emerald-400">{test.sonuc?.dogruSayisi ?? "—"}</b>
                                                {" / "}<b className="text-rose-400">{test.sonuc?.yanlisSayisi ?? "—"}</b>
                                                {" / "}<b className={metinIkincil}>{test.sonuc?.bosSayisi ?? "—"}</b>
                                            </span>
                                            <span className="flex items-center gap-2">
                                                <span className={`h-1.5 w-20 overflow-hidden rounded-full ${
                                                    isDark ? "bg-[#223149]" : "bg-[#E5E9F0]"
                                                }`}>
                                                    <span
                                                        className={`block h-full rounded-full ${
                                                            oran !== null && oran >= 70 ? "bg-emerald-400" : "bg-amber-400"
                                                        }`}
                                                        style={{ width: `${oran ?? 0}%` }}
                                                    />
                                                </span>
                                                <b className={metinAna}>{oran === null ? "—" : `%${oran}`}</b>
                                            </span>
                                            <span className={metinIkincil}>{tarihiBicimlendir(test.tamamlanmaTarihi)}</span>
                                            <button
                                                type="button"
                                                onClick={() => navigate(testSonucYolu(dersId, test._id), { state: { test } })}
                                                className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-3 font-bold ${ortakButon}`}
                                            >
                                                İncele
                                                <EyeIcon className="h-4 w-4" />
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        </>
                    )}
                </div>
            </section>
        </div>
    );
}

export default DersTestler;

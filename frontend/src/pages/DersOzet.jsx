import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import {
    AcademicCapIcon,
    ArrowPathIcon,
    ArrowRightIcon,
    BookOpenIcon,
    CheckCircleIcon,
    ClockIcon,
    DocumentTextIcon,
    ExclamationTriangleIcon,
    FolderIcon,
    LightBulbIcon,
    LinkIcon,
    ListBulletIcon,
    RectangleStackIcon,
    SparklesIcon,
} from "@heroicons/react/24/outline";

import dersOzetiApi from "../services/dersOzetiApi.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import {
    kaynakAdlariniGetir,
    konuSecenekleriniOlustur,
    kullanilabilirMateryalleriSec,
    ozetGirdisiOlustur,
    ozetSecimAnahtari,
    ozetSonucDurumunuBelirle,
} from "../utils/dersOzetiYardimcilari.mjs";

const ozetTurleri = [
    {
        deger: "tum_ders",
        etiket: "Tüm Ders",
        aciklama: "Tüm materyaller",
        ikon: BookOpenIcon,
    },
    {
        deger: "materyal",
        etiket: "Materyal",
        aciklama: "Belirli bir dosya",
        ikon: DocumentTextIcon,
    },
    {
        deger: "konu",
        etiket: "Konu",
        aciklama: "Belirli bir konu",
        ikon: ListBulletIcon,
    },
];

const uzunluklar = [
    { deger: "kisa", etiket: "Kısa" },
    { deger: "orta", etiket: "Orta" },
    { deger: "uzun", etiket: "Uzun" },
];

const metinVarMi = (deger) => typeof deger === "string" && Boolean(deger.trim());
const doluDizi = (deger) => Array.isArray(deger) && deger.length > 0;

const dosyaTuru = (dosyaAdi) => {
    const uzanti = dosyaAdi?.split(".").pop()?.toUpperCase();
    if (!uzanti || uzanti === dosyaAdi?.toUpperCase() || uzanti.length > 5) return "DOSYA";
    return uzanti;
};

function BolumBasligi({ baslik, ikon, isDark, renk = "violet" }) {
    const Ikon = ikon;
    const ikonRengi = renk === "amber"
        ? "text-amber-400"
        : renk === "cyan"
            ? "text-cyan-400"
            : "text-[#8B7CFF]";

    return (
        <div className="mb-3 flex items-center gap-2.5">
            <Ikon className={`h-[19px] w-[19px] ${ikonRengi}`} />
            <h3 className={`text-[16px] font-bold ${isDark ? "text-[#F7F8FC]" : "text-[#111827]"}`}>
                {baslik}
            </h3>
        </div>
    );
}

function OzetListeBolumu({ baslik, ikon, ogeler, isDark, vurgu = "violet" }) {
    if (!doluDizi(ogeler)) return null;
    const nokta = vurgu === "amber" ? "bg-amber-400" : vurgu === "cyan" ? "bg-cyan-400" : "bg-[#7668FF]";

    return (
        <section>
            <BolumBasligi baslik={baslik} ikon={ikon} isDark={isDark} renk={vurgu} />
            <ul className="space-y-2">
                {ogeler.map((oge, index) => (
                    <li
                        key={`${baslik}-${index}`}
                        className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-[13px] leading-6 ${
                            isDark
                                ? "border-[#22324C] bg-[#111D31] text-[#C7D0DF]"
                                : "border-[#E4E7EF] bg-[#F8FAFC] text-[#475569]"
                        }`}
                    >
                        <span className={`mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full shadow-[0_0_8px_currentColor] ${nokta}`} />
                        <span className="whitespace-pre-line">{oge}</span>
                    </li>
                ))}
            </ul>
        </section>
    );
}

function OzetIcerigi({ ozet, baslik, isDark }) {
    const icerik = ozet?.icerik || {};
    const kaynakAdlari = kaynakAdlariniGetir(ozet?.kullanilanKaynaklar);
    const uzunlukEtiketi = uzunluklar.find((secenek) => secenek.deger === ozet?.uzunluk)?.etiket;
    const tarih = ozet?.olusturulmaTarihi
        ? new Date(ozet.olusturulmaTarihi).toLocaleString("tr-TR", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        })
        : "";

    return (
        <article className="px-4 py-5 sm:px-6 sm:py-6 lg:px-7">
            <header className={`flex flex-col gap-3 border-b pb-5 sm:flex-row sm:items-start sm:justify-between ${
                isDark ? "border-[#23324A]" : "border-[#E5E7EB]"
            }`}>
                <div className="flex min-w-0 items-center gap-3">
                    <BookOpenIcon className="h-7 w-7 shrink-0 text-[#25B9F1]" />
                    <h2 className={`break-words text-[23px] font-bold leading-tight ${
                        isDark ? "text-white" : "text-[#111827]"
                    }`}>
                        {baslik}
                    </h2>
                </div>
                {(uzunlukEtiketi || tarih) && (
                    <div className={`flex shrink-0 flex-wrap items-center gap-2 text-[11px] font-medium ${
                        isDark ? "text-[#97A5BA]" : "text-[#64748B]"
                    }`}>
                        {uzunlukEtiketi && (
                            <span className={`rounded-full border px-2.5 py-1 ${
                                isDark
                                    ? "border-violet-400/25 bg-violet-400/10 text-violet-300"
                                    : "border-violet-200 bg-violet-50 text-violet-700"
                            }`}>
                                {uzunlukEtiketi} özet
                            </span>
                        )}
                        {tarih && (
                            <span className="inline-flex items-center gap-1.5">
                                <ClockIcon className="h-3.5 w-3.5" />
                                {tarih}
                            </span>
                        )}
                    </div>
                )}
            </header>

            <div className="mt-5 space-y-6">
                {metinVarMi(icerik.genelBakis) && (
                    <section>
                        <BolumBasligi baslik="Genel Bakış" ikon={SparklesIcon} isDark={isDark} />
                        <div className={`rounded-xl border px-4 py-3.5 text-[13px] leading-6 sm:px-5 ${
                            isDark
                                ? "border-[#22324C] bg-[#111D31] text-[#D0D7E4]"
                                : "border-[#E4E7EF] bg-[#F8FAFC] text-[#475569]"
                        }`}>
                            <p className="whitespace-pre-line">{icerik.genelBakis}</p>
                        </div>
                    </section>
                )}

                {doluDizi(icerik.temelKavramlar) && (
                    <section>
                        <BolumBasligi baslik="Temel Kavramlar" ikon={LightBulbIcon} isDark={isDark} />
                        <div className="grid gap-3 md:grid-cols-2">
                            {icerik.temelKavramlar.map((kavram, index) => (
                                <div
                                    key={`${kavram?.baslik || "kavram"}-${index}`}
                                    className={`flex gap-3 rounded-xl border p-4 ${
                                        isDark
                                            ? "border-[#253653] bg-[#111D31]"
                                            : "border-[#E4E7EF] bg-[#F8FAFC]"
                                    }`}
                                >
                                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                                        isDark ? "bg-[#192B4A]" : "bg-violet-100"
                                    }`}>
                                        <AcademicCapIcon className="h-5 w-5 text-[#9A7CFF]" />
                                    </span>
                                    <div className="min-w-0">
                                        <h4 className={`break-words text-[13px] font-bold ${
                                            isDark ? "text-[#B79CFF]" : "text-violet-700"
                                        }`}>
                                            {kavram?.baslik}
                                        </h4>
                                        {metinVarMi(kavram?.aciklama) && (
                                            <p className={`mt-1 whitespace-pre-line text-[12px] leading-5 ${
                                                isDark ? "text-[#AAB6C8]" : "text-[#64748B]"
                                            }`}>
                                                {kavram.aciklama}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <OzetListeBolumu
                    baslik="Önemli Noktalar"
                    ikon={CheckCircleIcon}
                    ogeler={icerik.onemliNoktalar}
                    isDark={isDark}
                />

                {doluDizi(icerik.konularArasiIliskiler) && (
                    <section>
                        <BolumBasligi baslik="Konular Arası İlişkiler" ikon={LinkIcon} isDark={isDark} renk="cyan" />
                        <div className={`flex flex-wrap items-center gap-2 rounded-xl border p-3 ${
                            isDark ? "border-[#22324C] bg-[#111D31]" : "border-[#E4E7EF] bg-[#F8FAFC]"
                        }`}>
                            {icerik.konularArasiIliskiler.map((iliski, index) => (
                                <div key={`iliski-${index}`} className="contents">
                                    <span className={`min-w-0 flex-1 basis-[210px] rounded-lg border px-3.5 py-2.5 text-center text-[12px] leading-5 ${
                                        isDark
                                            ? "border-[#2B4161] bg-[#172641] text-[#D0D7E4]"
                                            : "border-[#DCE2EC] bg-white text-[#475569]"
                                    }`}>
                                        {iliski}
                                    </span>
                                    {index < icerik.konularArasiIliskiler.length - 1 && (
                                        <ArrowRightIcon className="hidden h-4 w-4 shrink-0 text-[#8976FF] sm:block" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </section>
                )}

                <OzetListeBolumu
                    baslik="Örnekler"
                    ikon={RectangleStackIcon}
                    ogeler={icerik.ornekler}
                    isDark={isDark}
                    vurgu="cyan"
                />

                {doluDizi(icerik.sinavIcinOnemli) && (
                    <section className={`rounded-xl border px-4 py-4 ${
                        isDark
                            ? "border-amber-400/35 bg-amber-400/[0.07]"
                            : "border-amber-300 bg-amber-50"
                    }`}>
                        <BolumBasligi baslik="Sınav İçin Önemli" ikon={ExclamationTriangleIcon} isDark={isDark} renk="amber" />
                        <ul className={`space-y-1.5 text-[13px] leading-6 ${isDark ? "text-[#D7DCE6]" : "text-[#475569]"}`}>
                            {icerik.sinavIcinOnemli.map((oge, index) => (
                                <li key={`sinav-${index}`} className="flex gap-2">
                                    <span className="text-amber-400">•</span>
                                    <span className="whitespace-pre-line">{oge}</span>
                                </li>
                            ))}
                        </ul>
                    </section>
                )}

                {kaynakAdlari.length > 0 && (
                    <section className={`border-t pt-5 ${isDark ? "border-[#23324A]" : "border-[#E5E7EB]"}`}>
                        <BolumBasligi baslik="Kullanılan Kaynaklar" ikon={FolderIcon} isDark={isDark} />
                        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                            {kaynakAdlari.map((dosyaAdi) => (
                                <div
                                    key={dosyaAdi}
                                    className={`flex min-w-0 items-center gap-3 rounded-xl border px-3 py-3 ${
                                        isDark
                                            ? "border-[#253653] bg-[#111D31] text-[#D3DAE6]"
                                            : "border-[#E4E7EF] bg-[#F8FAFC] text-[#475569]"
                                    }`}
                                >
                                    <span className={`rounded-md px-2 py-1 text-[10px] font-extrabold ${
                                        isDark ? "bg-[#253B62] text-[#67C9FF]" : "bg-sky-100 text-sky-700"
                                    }`}>
                                        {dosyaTuru(dosyaAdi)}
                                    </span>
                                    <span className="min-w-0 truncate text-[12px] font-semibold" title={dosyaAdi}>
                                        {dosyaAdi}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </section>
                )}
            </div>
        </article>
    );
}

function DersOzet() {
    const { isDark, ders } = useOutletContext();
    const { dersId } = useParams();
    const [tur, setTur] = useState("tum_ders");
    const [uzunluk, setUzunluk] = useState("orta");
    const [materyalId, setMateryalId] = useState("");
    const [konuId, setKonuId] = useState("");
    const [materyaller, setMateryaller] = useState([]);
    const [konuHaritasi, setKonuHaritasi] = useState(null);
    const [materyalHatasi, setMateryalHatasi] = useState("");
    const [konuHatasi, setKonuHatasi] = useState("");
    const [seceneklerYukleniyor, setSeceneklerYukleniyor] = useState(true);
    const [ozet, setOzet] = useState(null);
    const [kayitliOzetYukleniyor, setKayitliOzetYukleniyor] = useState(false);
    const [olusturuluyor, setOlusturuluyor] = useState(false);
    const [hata, setHata] = useState("");
    const kayitliIstekSirasiRef = useRef(0);
    const olusturuluyorRef = useRef(false);
    const secimAnahtariRef = useRef("");
    const monteRef = useRef(true);

    const kullanilabilirMateryaller = useMemo(
        () => kullanilabilirMateryalleriSec(materyaller),
        [materyaller]
    );
    const konuSecenekleri = useMemo(
        () => konuSecenekleriniOlustur(konuHaritasi),
        [konuHaritasi]
    );
    const secimGirdisi = useMemo(() => ozetGirdisiOlustur({
        tur,
        uzunluk,
        materyalId,
        konuId,
    }), [konuId, materyalId, tur, uzunluk]);
    const secimAnahtari = ozetSecimAnahtari(dersId, secimGirdisi);
    secimAnahtariRef.current = secimAnahtari;

    useEffect(() => {
        monteRef.current = true;
        return () => {
            monteRef.current = false;
        };
    }, []);

    useEffect(() => {
        const controller = new AbortController();
        setSeceneklerYukleniyor(true);
        setMateryalHatasi("");
        setKonuHatasi("");

        const secenekleriGetir = async () => {
            const [materyalSonucu, konuSonucu] = await Promise.allSettled([
                dersOzetiApi.materyalleriGetir(dersId, controller.signal),
                dersOzetiApi.konuHaritasiniGetir(dersId, controller.signal),
            ]);
            if (controller.signal.aborted) return;

            if (materyalSonucu.status === "fulfilled") {
                setMateryaller(materyalSonucu.value.data.materyaller || []);
            } else if (materyalSonucu.reason?.code !== "ERR_CANCELED") {
                setMateryaller([]);
                setMateryalHatasi(kullaniciHataMesaji(
                    materyalSonucu.reason,
                    "Materyaller yüklenemedi. Lütfen tekrar deneyin."
                ));
            }

            if (konuSonucu.status === "fulfilled") {
                setKonuHaritasi(konuSonucu.value.data.harita || null);
            } else if (konuSonucu.reason?.code !== "ERR_CANCELED") {
                setKonuHaritasi(null);
                setKonuHatasi(kullaniciHataMesaji(
                    konuSonucu.reason,
                    "Konu haritası yüklenemedi. Lütfen tekrar deneyin."
                ));
            }
            setSeceneklerYukleniyor(false);
        };

        void secenekleriGetir();
        return () => controller.abort();
    }, [dersId]);

    useEffect(() => {
        if (kullanilabilirMateryaller.length === 0) {
            setMateryalId("");
            return;
        }
        if (!kullanilabilirMateryaller.some((materyal) => String(materyal._id) === materyalId)) {
            setMateryalId(String(kullanilabilirMateryaller[0]._id));
        }
    }, [kullanilabilirMateryaller, materyalId]);

    useEffect(() => {
        if (konuSecenekleri.length === 0) {
            setKonuId("");
            return;
        }
        if (!konuSecenekleri.some((konu) => konu.konuId === konuId)) {
            setKonuId(konuSecenekleri[0].konuId);
        }
    }, [konuId, konuSecenekleri]);

    useEffect(() => {
        const istekSirasi = ++kayitliIstekSirasiRef.current;
        setHata("");
        setOzet(null);

        if (!secimGirdisi) {
            setKayitliOzetYukleniyor(false);
            return undefined;
        }

        const controller = new AbortController();
        setKayitliOzetYukleniyor(true);

        const kayitliOzetiGetir = async () => {
            try {
                const yanit = await dersOzetiApi.kayitliOzetiGetir(
                    dersId,
                    secimGirdisi,
                    controller.signal
                );
                if (istekSirasi !== kayitliIstekSirasiRef.current) return;
                setOzet(yanit.data.ozet || null);
            } catch (istekHatasi) {
                if (controller.signal.aborted || istekSirasi !== kayitliIstekSirasiRef.current) return;
                if (
                    istekHatasi.response?.status === 404 &&
                    istekHatasi.response?.data?.kod === "OZET_BULUNAMADI"
                ) {
                    setOzet(null);
                    return;
                }
                setHata(kullaniciHataMesaji(
                    istekHatasi,
                    "Kayıtlı özet kontrol edilirken bir sorun oluştu."
                ));
            } finally {
                if (istekSirasi === kayitliIstekSirasiRef.current) {
                    setKayitliOzetYukleniyor(false);
                }
            }
        };

        void kayitliOzetiGetir();
        return () => controller.abort();
    }, [dersId, secimAnahtari, secimGirdisi]);

    const seciliMateryal = kullanilabilirMateryaller.find(
        (materyal) => String(materyal._id) === materyalId
    );
    const seciliKonu = konuSecenekleri.find((konu) => konu.konuId === konuId);
    const ozetBasligi = tur === "materyal"
        ? `${seciliMateryal?.orijinalDosyaAdi || seciliMateryal?.dosyaAdi || "Materyal"} Özeti`
        : tur === "konu"
            ? `${seciliKonu?.baslik || ozet?.konuBasligi || "Konu"} Özeti`
            : `${ders?.dersAdi || "Ders"} Özeti`;

    const hedefUyarisi = tur === "materyal"
        ? (seceneklerYukleniyor
            ? "Materyaller yükleniyor..."
            : materyalHatasi || (!seciliMateryal ? "Özetlenebilecek hazır materyal bulunmuyor." : ""))
        : tur === "konu"
            ? (seceneklerYukleniyor
                ? "Konular yükleniyor..."
                : konuHatasi || (!seciliKonu ? "Özetlenebilecek hazır konu bulunmuyor." : ""))
            : "";
    const hedefHatasi = tur === "materyal" ? materyalHatasi : (tur === "konu" ? konuHatasi : "");

    const ozetIsleminiBaslat = async () => {
        if (olusturuluyorRef.current || kayitliOzetYukleniyor || !secimGirdisi) return;

        const istekAnahtari = secimAnahtari;
        const yenidenOlustur = Boolean(ozet);
        olusturuluyorRef.current = true;
        setOlusturuluyor(true);
        setHata("");

        try {
            const yanit = yenidenOlustur
                ? await dersOzetiApi.ozetYenidenOlustur(dersId, secimGirdisi)
                : await dersOzetiApi.ozetOlustur(dersId, secimGirdisi);
            const yeniOzet = yanit.data?.ozet;
            if (!yeniOzet) throw new Error("Özet yanıtı boş döndü.");
            if (monteRef.current && secimAnahtariRef.current === istekAnahtari) {
                setOzet(yeniOzet);
            }
        } catch (istekHatasi) {
            if (monteRef.current && secimAnahtariRef.current === istekAnahtari) {
                setHata(kullaniciHataMesaji(
                    istekHatasi,
                    yenidenOlustur
                        ? "Özet yeniden oluşturulamadı. Önceki özet korunuyor."
                        : "Özet oluşturulamadı. Lütfen tekrar deneyin."
                ));
            }
        } finally {
            olusturuluyorRef.current = false;
            if (monteRef.current) setOlusturuluyor(false);
        }
    };

    const kart = isDark ? "border-[#22324A] bg-[#0F1A2D]" : "border-[#E4E7EF] bg-white";
    const metinAna = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const metinIkincil = isDark ? "text-[#9EABC0]" : "text-[#64748B]";
    const secimAlani = isDark
        ? "border-[#2B3C59] bg-[#111E33] text-[#F8FAFC] focus:border-[#7567FF]"
        : "border-[#D8DDE8] bg-white text-[#0F172A] focus:border-[#635BDB]";
    const sonucDurumu = ozetSonucDurumunuBelirle({ ozet, olusturuluyor, kayitliOzetYukleniyor });

    return (
        <div className="space-y-5 sm:space-y-6">
            <header>
                <h1 className={`text-[27px] font-extrabold tracking-tight sm:text-[32px] ${metinAna}`}>
                    Ders Özeti
                </h1>
                <p className={`mt-1 text-[13px] sm:text-[14px] ${metinIkincil}`}>
                    Ders materyallerinden yapay zekâ destekli özetler oluştur ve önemli bilgileri hızlıca tekrar et.
                </p>
            </header>

            <section className={`relative overflow-hidden rounded-2xl border shadow-sm ${
                isDark
                    ? "border-[#2B3C63] bg-[radial-gradient(circle_at_88%_20%,rgba(64,93,213,0.25),transparent_28%),linear-gradient(115deg,#162044_0%,#101C35_50%,#0B2140_100%)]"
                    : "border-indigo-200 bg-[radial-gradient(circle_at_88%_20%,rgba(99,102,241,0.12),transparent_28%),linear-gradient(115deg,#F5F3FF_0%,#EEF2FF_55%,#ECFEFF_100%)]"
            }`}>
                <div className={`flex items-start gap-3 border-b px-4 py-4 sm:px-5 ${
                    isDark ? "border-white/[0.06]" : "border-indigo-100"
                }`}>
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4D5EFF] to-[#7857F8] text-white shadow-lg shadow-indigo-600/25">
                        <BookOpenIcon className="h-6 w-6" />
                    </span>
                    <div>
                        <h2 className={`text-[20px] font-bold ${metinAna}`}>Özet Oluştur</h2>
                        <p className={`mt-0.5 text-[12px] leading-5 sm:text-[13px] ${metinIkincil}`}>
                            İçeriği ve uzunluğu seç; kaynaklara dayalı, kapsamlı bir ders özeti oluştur.
                        </p>
                    </div>
                    <SparklesIcon className="ml-auto hidden h-16 w-16 -rotate-6 text-violet-400/25 md:block" />
                </div>

                <div className="grid gap-4 px-4 py-4 sm:px-5 lg:grid-cols-12 lg:items-end">
                    <fieldset className="lg:col-span-5 xl:col-span-5">
                        <legend className={`mb-2 text-[12px] font-bold ${metinAna}`}>Özet Türü</legend>
                        <div className="grid grid-cols-3 gap-2">
                            {ozetTurleri.map(({ deger, etiket, aciklama, ikon }) => {
                                const secili = tur === deger;
                                const Ikon = ikon;
                                return (
                                    <button
                                        key={deger}
                                        type="button"
                                        aria-pressed={secili}
                                        disabled={olusturuluyor}
                                        onClick={() => setTur(deger)}
                                        className={`flex min-h-[70px] items-center gap-2 rounded-xl border px-2.5 py-2 text-left transition-colors sm:px-3 ${
                                            secili
                                                ? "border-[#725CFF] bg-gradient-to-br from-[#5947E9] to-[#6854F4] text-white shadow-lg shadow-indigo-950/25"
                                                : isDark
                                                    ? "border-[#2A3B59] bg-[#122038]/85 text-[#CAD2E1] hover:border-violet-400/50"
                                                    : "border-[#DCE1EA] bg-white/75 text-[#475569] hover:border-violet-300"
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                    >
                                        <Ikon className={`h-5 w-5 shrink-0 ${secili ? "text-white" : "text-[#9B8CFF]"}`} />
                                        <span className="min-w-0">
                                            <span className="block text-[12px] font-bold sm:text-[13px]">{etiket}</span>
                                            <span className={`mt-0.5 hidden truncate text-[9px] sm:block sm:text-[10px] ${
                                                secili ? "text-indigo-100" : metinIkincil
                                            }`}>
                                                {aciklama}
                                            </span>
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    <div className="lg:col-span-3 xl:col-span-3">
                        {tur === "materyal" ? (
                            <>
                                <label htmlFor="ozet-materyal" className={`mb-2 block text-[12px] font-bold ${metinAna}`}>
                                    Materyal Seçimi
                                </label>
                                <select
                                    id="ozet-materyal"
                                    value={materyalId}
                                    onChange={(event) => setMateryalId(event.target.value)}
                                    disabled={olusturuluyor || seceneklerYukleniyor || kullanilabilirMateryaller.length === 0}
                                    className={`h-[46px] w-full rounded-xl border px-3 text-[12px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${secimAlani}`}
                                >
                                    {kullanilabilirMateryaller.length === 0 && <option value="">Hazır materyal yok</option>}
                                    {kullanilabilirMateryaller.map((materyal) => (
                                        <option key={materyal._id} value={materyal._id}>
                                            {materyal.orijinalDosyaAdi || materyal.dosyaAdi}
                                        </option>
                                    ))}
                                </select>
                            </>
                        ) : tur === "konu" ? (
                            <>
                                <label htmlFor="ozet-konu" className={`mb-2 block text-[12px] font-bold ${metinAna}`}>
                                    Konu Seçimi
                                </label>
                                <select
                                    id="ozet-konu"
                                    value={konuId}
                                    onChange={(event) => setKonuId(event.target.value)}
                                    disabled={olusturuluyor || seceneklerYukleniyor || konuSecenekleri.length === 0}
                                    className={`h-[46px] w-full rounded-xl border px-3 text-[12px] outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${secimAlani}`}
                                >
                                    {konuSecenekleri.length === 0 && <option value="">Hazır konu yok</option>}
                                    {konuSecenekleri.map((konu) => (
                                        <option key={konu.konuId} value={konu.konuId}>
                                            {konu.etiket}
                                        </option>
                                    ))}
                                </select>
                            </>
                        ) : (
                            <>
                                <span className={`mb-2 block text-[12px] font-bold ${metinAna}`}>Kapsam</span>
                                <div className={`flex h-[46px] items-center gap-2 rounded-xl border px-3 text-[12px] ${secimAlani}`}>
                                    <FolderIcon className="h-4 w-4 shrink-0 text-[#9B8CFF]" />
                                    <span className="truncate">Tüm uygun materyaller</span>
                                </div>
                            </>
                        )}
                    </div>

                    <fieldset className="lg:col-span-2 xl:col-span-2">
                        <legend className={`mb-2 text-[12px] font-bold ${metinAna}`}>Özet Uzunluğu</legend>
                        <div className={`grid h-[46px] grid-cols-3 rounded-xl border p-1 ${
                            isDark ? "border-[#2A3B59] bg-[#122038]/85" : "border-[#DCE1EA] bg-white/75"
                        }`}>
                            {uzunluklar.map((secenek) => {
                                const secili = uzunluk === secenek.deger;
                                return (
                                    <button
                                        key={secenek.deger}
                                        type="button"
                                        aria-pressed={secili}
                                        disabled={olusturuluyor}
                                        onClick={() => setUzunluk(secenek.deger)}
                                        className={`rounded-lg text-[11px] font-semibold transition-colors ${
                                            secili
                                                ? "bg-[#5947E9] text-white shadow-sm"
                                                : isDark
                                                    ? "text-[#A8B2C4] hover:text-white"
                                                    : "text-[#64748B] hover:text-[#111827]"
                                        } disabled:cursor-not-allowed disabled:opacity-60`}
                                    >
                                        {secenek.etiket}
                                    </button>
                                );
                            })}
                        </div>
                    </fieldset>

                    <div className="lg:col-span-2 xl:col-span-2">
                        <button
                            type="button"
                            onClick={ozetIsleminiBaslat}
                            disabled={olusturuluyor || kayitliOzetYukleniyor || !secimGirdisi}
                            className="inline-flex h-[46px] w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#614CF5] to-[#7658FA] px-3 text-[12px] font-bold text-white shadow-lg shadow-indigo-950/25 transition-colors hover:from-[#5540E8] hover:to-[#684AEF] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {olusturuluyor ? (
                                <>
                                    <ArrowPathIcon className="h-4 w-4 animate-spin" />
                                    <span>Hazırlanıyor...</span>
                                </>
                            ) : ozet ? (
                                <>
                                    <ArrowPathIcon className="h-4 w-4" />
                                    <span>Yeniden Oluştur</span>
                                </>
                            ) : (
                                <>
                                    <SparklesIcon className="h-4 w-4" />
                                    <span>Özet Oluştur</span>
                                    <ArrowRightIcon className="h-4 w-4" />
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {hedefUyarisi && (
                    <p className={`px-4 pb-4 text-[11px] leading-5 sm:px-5 ${
                        hedefHatasi ? "text-rose-300" : metinIkincil
                    }`}>
                        {hedefUyarisi}
                    </p>
                )}

                {hata && (
                    <div className={`mx-4 mb-4 flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-[12px] leading-5 sm:mx-5 ${
                        isDark
                            ? "border-rose-400/25 bg-rose-400/10 text-rose-200"
                            : "border-rose-200 bg-rose-50 text-rose-700"
                    }`} role="alert">
                        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{hata}</span>
                    </div>
                )}
            </section>

            <section className={`min-h-[360px] overflow-hidden rounded-2xl border shadow-sm ${kart}`} aria-live="polite">
                {olusturuluyor && ozet && (
                    <div className={`flex items-center gap-2 border-b px-5 py-3 text-[12px] font-medium sm:px-7 ${
                        isDark
                            ? "border-violet-400/20 bg-violet-400/10 text-violet-200"
                            : "border-violet-100 bg-violet-50 text-violet-700"
                    }`} role="status">
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        Yeni özet hazırlanıyor. Mevcut özet işlem tamamlanana kadar korunuyor.
                    </div>
                )}

                {sonucDurumu === "icerik" ? (
                    <OzetIcerigi ozet={ozet} baslik={ozetBasligi} isDark={isDark} />
                ) : sonucDurumu === "olusturuluyor" ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center" role="status">
                        <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-400/20 border-t-[#7567FF]" />
                        <h2 className={`mt-5 text-[18px] font-bold ${metinAna}`}>Özet hazırlanıyor</h2>
                        <p className={`mt-2 max-w-md text-[13px] leading-6 ${metinIkincil}`}>
                            Kaynaklar inceleniyor ve seçtiğiniz uzunlukta özet oluşturuluyor. Bu işlem biraz sürebilir.
                        </p>
                    </div>
                ) : sonucDurumu === "kayitli_yukleniyor" ? (
                    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 text-center" role="status">
                        <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-indigo-400/20 border-t-[#6366F1]" />
                        <p className={`mt-4 text-[13px] font-medium ${metinIkincil}`}>
                            Kayıtlı özet kontrol ediliyor...
                        </p>
                    </div>
                ) : (
                    <div className="flex min-h-[360px] flex-col items-center justify-center px-6 py-12 text-center">
                        <div className={`flex h-16 w-16 items-center justify-center rounded-2xl border ${
                            isDark
                                ? "border-indigo-400/20 bg-gradient-to-br from-indigo-500/15 to-cyan-400/10"
                                : "border-indigo-100 bg-gradient-to-br from-indigo-50 to-cyan-50"
                        }`}>
                            <DocumentTextIcon className="h-8 w-8 text-[#6D5DF6]" />
                        </div>
                        <h2 className={`mt-5 text-[19px] font-bold ${metinAna}`}>
                            {secimGirdisi ? "Henüz özet oluşturulmadı" : "Özet hedefi seçin"}
                        </h2>
                        <p className={`mt-2 max-w-md text-[13px] leading-6 ${metinIkincil}`}>
                            {secimGirdisi
                                ? "Seçtiğiniz tür ve uzunluk için kayıtlı bir özet bulunmuyor. Özet Oluştur butonuyla işlemi başlatabilirsiniz."
                                : hedefUyarisi || "Özet oluşturmak için kullanılabilir bir materyal veya konu seçin."}
                        </p>
                    </div>
                )}
            </section>
        </div>
    );
}

export default DersOzet;

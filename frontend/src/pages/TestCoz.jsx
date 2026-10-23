import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    ArrowLeftIcon,
    ArrowPathIcon,
    ArrowRightIcon,
    CheckCircleIcon,
    ClipboardDocumentCheckIcon,
    CloudArrowUpIcon,
    ExclamationCircleIcon,
    FlagIcon,
    InformationCircleIcon,
    Squares2X2Icon,
    XMarkIcon,
} from "@heroicons/react/24/outline";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";

import testlerApi from "../services/testlerApi.mjs";
import { dersDetayYolu } from "../utils/dersDetayYollari.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import { testKayitKuyruguOlustur } from "../utils/testKayitKuyrugu.mjs";
import {
    soruIndeksiniSinirla,
    testCozumOzetiniGetir,
    testHedefBilgisi,
    testKapsamEtiketi,
    testSonucYolu,
    testZorlukEtiketi,
} from "../utils/testlerYardimcilari.mjs";

const istekIptalEdildiMi = (hata) => (
    hata?.code === "ERR_CANCELED" || hata?.name === "CanceledError" || hata?.name === "AbortError"
);

const testHataMesaji = (hata, varsayilanMesaj) => {
    const durum = hata?.response?.status;
    const sunucuMesaji = hata?.response?.data?.hata;
    if ([404, 409, 422, 502].includes(durum) && typeof sunucuMesaji === "string" && sunucuMesaji.trim()) {
        return sunucuMesaji;
    }
    return kullaniciHataMesaji(hata, varsayilanMesaj);
};

function TestCoz() {
    const { isDark, ders } = useOutletContext();
    const { dersId, testId } = useParams();
    const navigate = useNavigate();
    const testlerYolu = dersDetayYolu(dersId, "testler");
    const istekAnahtari = `${dersId}:${testId}`;

    const [test, setTest] = useState(null);
    const [aktifIndeks, setAktifIndeks] = useState(0);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [hata, setHata] = useState("");
    const [islemHatasi, setIslemHatasi] = useState("");
    const [kayitBilgisi, setKayitBilgisi] = useState({ durum: "kaydedildi", hata: "" });
    const [bitirmeOnayiAcik, setBitirmeOnayiAcik] = useState(false);
    const [tamamlaniyor, setTamamlaniyor] = useState(false);
    const [ayriliniyor, setAyriliniyor] = useState(false);

    const aktifAnahtarRef = useRef(istekAnahtari);
    const testRef = useRef(test);
    const aktifIndeksRef = useRef(aktifIndeks);
    const kayitKuyruguRef = useRef(null);
    const tamamlaniyorRef = useRef(false);
    const modalIptalRef = useRef(null);
    const soruKartiRef = useRef(null);
    aktifAnahtarRef.current = istekAnahtari;
    testRef.current = test;
    aktifIndeksRef.current = aktifIndeks;

    useEffect(() => {
        const controller = new AbortController();
        const buIstek = istekAnahtari;
        kayitKuyruguRef.current?.bildirimiKapat();
        const kuyruk = testKayitKuyruguOlustur({
            onDurumDegisti(bilgi) {
                if (aktifAnahtarRef.current !== buIstek) return;
                setKayitBilgisi({
                    durum: bilgi.durum,
                    hata: bilgi.sonHata
                        ? testHataMesaji(bilgi.sonHata, "Değişiklikler kaydedilemedi.")
                        : "",
                });
            },
        });
        kayitKuyruguRef.current = kuyruk;

        setTest(null);
        setYukleniyor(true);
        setHata("");
        setIslemHatasi("");
        setKayitBilgisi({ durum: "kaydedildi", hata: "" });
        setBitirmeOnayiAcik(false);

        const testiYukle = async () => {
            try {
                const detayYaniti = await testlerApi.testDetayiniGetir(dersId, testId, controller.signal);
                let yuklenenTest = detayYaniti.data?.test;
                if (!yuklenenTest?._id) throw new Error("Test detayı boş döndü.");

                if (yuklenenTest.durum === "tamamlandi") {
                    navigate(testSonucYolu(dersId, testId), { replace: true, state: { test: yuklenenTest } });
                    return;
                }
                if (yuklenenTest.durum === "hazirlandi") {
                    const baslatmaYaniti = await testlerApi.testiBaslat(dersId, testId, controller.signal);
                    yuklenenTest = baslatmaYaniti.data?.test;
                }
                if (yuklenenTest?.durum !== "devam_ediyor" || !Array.isArray(yuklenenTest.sorular)) {
                    throw new Error("Test çözme verisi geçersiz döndü.");
                }
                if (controller.signal.aborted || aktifAnahtarRef.current !== buIstek) return;

                const baslangicIndeksi = soruIndeksiniSinirla(
                    yuklenenTest.sonGoruntulenenSoru,
                    yuklenenTest.sorular.length
                );
                setTest(yuklenenTest);
                setAktifIndeks(baslangicIndeksi);
                aktifIndeksRef.current = baslangicIndeksi;
            } catch (istekHatasi) {
                if (!istekIptalEdildiMi(istekHatasi) && aktifAnahtarRef.current === buIstek) {
                    setHata(testHataMesaji(
                        istekHatasi,
                        "Test yüklenemedi. Lütfen tekrar deneyin."
                    ));
                }
            } finally {
                if (!controller.signal.aborted && aktifAnahtarRef.current === buIstek) {
                    setYukleniyor(false);
                }
            }
        };

        void testiYukle();
        return () => {
            controller.abort();
            kuyruk.bildirimiKapat();
        };
    }, [dersId, testId, istekAnahtari, navigate]);

    useEffect(() => {
        const ayrilmayiUyar = (event) => {
            const durum = kayitKuyruguRef.current?.durum();
            if (!durum || (durum.bekleyen === 0 && durum.basarisizAnahtarlar.length === 0)) return;
            event.preventDefault();
            event.returnValue = "";
        };
        window.addEventListener("beforeunload", ayrilmayiUyar);
        return () => window.removeEventListener("beforeunload", ayrilmayiUyar);
    }, []);

    useEffect(() => {
        if (!bitirmeOnayiAcik) return undefined;
        modalIptalRef.current?.focus();
        const escapeIleKapat = (event) => {
            if (event.key === "Escape" && !tamamlaniyor) setBitirmeOnayiAcik(false);
        };
        document.addEventListener("keydown", escapeIleKapat);
        return () => document.removeEventListener("keydown", escapeIleKapat);
    }, [bitirmeOnayiAcik, tamamlaniyor]);

    const sorular = test?.sorular || [];
    const aktifSoru = sorular[aktifIndeks] || null;
    const ozet = useMemo(() => testCozumOzetiniGetir(test), [test]);
    const hedef = useMemo(() => testHedefBilgisi(test, { dersAdi: ders?.dersAdi }), [test, ders?.dersAdi]);

    const soruyuYereldeGuncelle = (soruId, degisiklik) => {
        setTest((mevcut) => {
            if (!mevcut || String(mevcut._id) !== String(testId)) return mevcut;
            return {
                ...mevcut,
                sorular: mevcut.sorular.map((soru) => (
                    String(soru._id) === String(soruId) ? { ...soru, ...degisiklik } : soru
                )),
            };
        });
    };

    const cevabiSec = (soru, cevap) => {
        if (!soru?._id || test?.durum !== "devam_ediyor" || tamamlaniyor) return;
        soruyuYereldeGuncelle(soru._id, { ogrenciCevabi: cevap });
        kayitKuyruguRef.current?.ekle(
            `cevap:${soru._id}`,
            () => testlerApi.cevabiKaydet(dersId, testId, soru._id, cevap)
        );
    };

    const isaretiDegistir = (soru) => {
        if (!soru?._id || test?.durum !== "devam_ediyor" || tamamlaniyor) return;
        const yeniDeger = !soru.isaretli;
        soruyuYereldeGuncelle(soru._id, { isaretli: yeniDeger });
        kayitKuyruguRef.current?.ekle(
            `isaret:${soru._id}`,
            () => testlerApi.soruIsaretiniGuncelle(dersId, testId, soru._id, yeniDeger)
        );
    };

    const soruyaGit = (hedefIndeks) => {
        const yeniIndeks = soruIndeksiniSinirla(hedefIndeks, sorular.length);
        if (yeniIndeks === aktifIndeks || tamamlaniyor) return;
        setAktifIndeks(yeniIndeks);
        aktifIndeksRef.current = yeniIndeks;
        kayitKuyruguRef.current?.ekle(
            "son-soru",
            () => testlerApi.sonSoruyuKaydet(dersId, testId, yeniIndeks)
        );
        soruKartiRef.current?.scrollIntoView({ block: "start" });
    };

    const kayitlariGuvenleTamamla = useCallback(async () => {
        const kuyruk = kayitKuyruguRef.current;
        if (!kuyruk) return true;
        kuyruk.ekle(
            "son-soru",
            () => testlerApi.sonSoruyuKaydet(dersId, testId, aktifIndeksRef.current)
        );
        let sonuc = await kuyruk.bekle();
        if (sonuc.basarisizAnahtarlar.length > 0) sonuc = await kuyruk.yenidenDene();
        if (sonuc.basarisizAnahtarlar.length > 0) {
            setIslemHatasi("Kaydedilemeyen değişiklikler var. Bağlantınızı kontrol edip kaydı yeniden deneyin.");
            return false;
        }
        return true;
    }, [dersId, testId]);

    const kaydiYenidenDene = async () => {
        setIslemHatasi("");
        const sonuc = await kayitKuyruguRef.current?.yenidenDene();
        if (sonuc?.basarisizAnahtarlar.length > 0) {
            setIslemHatasi("Değişiklikler hâlâ kaydedilemedi. Lütfen bağlantınızı kontrol edin.");
        }
    };

    const dahaSonraDevamEt = async () => {
        if (ayriliniyor || tamamlaniyor) return;
        setAyriliniyor(true);
        setIslemHatasi("");
        const basarili = await kayitlariGuvenleTamamla();
        if (basarili) navigate(testlerYolu);
        else setAyriliniyor(false);
    };

    const testiTamamla = async () => {
        if (tamamlaniyorRef.current) return;
        tamamlaniyorRef.current = true;
        setTamamlaniyor(true);
        setIslemHatasi("");
        try {
            const kayitlarTamam = await kayitlariGuvenleTamamla();
            if (!kayitlarTamam) return;
            const yanit = await testlerApi.testiTamamla(dersId, testId);
            const tamamlananTest = yanit.data?.test;
            if (!tamamlananTest?._id || tamamlananTest.durum !== "tamamlandi") {
                throw new Error("Tamamlama yanıtı geçersiz döndü.");
            }
            navigate(testSonucYolu(dersId, testId), {
                replace: true,
                state: { test: tamamlananTest, zatenTamamlandi: yanit.data?.zatenTamamlandi === true },
            });
        } catch (tamamlamaHatasi) {
            setIslemHatasi(testHataMesaji(
                tamamlamaHatasi,
                "Test tamamlanamadı. Cevaplarınız korunuyor; lütfen tekrar deneyin."
            ));
        } finally {
            tamamlaniyorRef.current = false;
            setTamamlaniyor(false);
        }
    };

    useEffect(() => {
        const dahiliBaglantiyiGuvenleAc = (event) => {
            if (
                event.defaultPrevented ||
                event.button !== 0 ||
                event.metaKey ||
                event.ctrlKey ||
                event.shiftKey ||
                event.altKey ||
                !(event.target instanceof Element)
            ) return;
            const baglanti = event.target.closest("a[href]");
            if (!baglanti || baglanti.target === "_blank") return;
            const hedef = new URL(baglanti.href, window.location.href);
            if (hedef.origin !== window.location.origin) return;
            const kayitDurumu = kayitKuyruguRef.current?.durum();
            if (!kayitDurumu || (kayitDurumu.bekleyen === 0 && kayitDurumu.basarisizAnahtarlar.length === 0)) return;

            event.preventDefault();
            event.stopPropagation();
            if (ayriliniyor || tamamlaniyor) return;
            setAyriliniyor(true);
            setIslemHatasi("");
            void (async () => {
                const basarili = await kayitlariGuvenleTamamla();
                if (basarili) navigate(`${hedef.pathname}${hedef.search}${hedef.hash}`);
                else setAyriliniyor(false);
            })();
        };
        document.addEventListener("click", dahiliBaglantiyiGuvenleAc, true);
        return () => document.removeEventListener("click", dahiliBaglantiyiGuvenleAc, true);
    }, [ayriliniyor, tamamlaniyor, navigate, kayitlariGuvenleTamamla]);

    const kart = isDark ? "border-[#22324A] bg-[#0F1A2D]" : "border-[#E4E7EF] bg-white";
    const metinAna = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const metinIkincil = isDark ? "text-[#9EABC0]" : "text-[#64748B]";
    const altKenarlik = isDark ? "border-white/[0.06]" : "border-[#EDF0F5]";

    if (yukleniyor) {
        return (
            <div className="flex min-h-[420px] flex-col items-center justify-center" role="status">
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-400/20 border-t-[#7567FF]" />
                <p className={`mt-4 text-[13px] font-semibold ${metinIkincil}`}>Test yükleniyor...</p>
            </div>
        );
    }

    if (hata || !test || !aktifSoru) {
        return (
            <section className={`rounded-2xl border p-7 text-center ${kart}`}>
                <ExclamationCircleIcon className="mx-auto h-10 w-10 text-rose-400" />
                <h1 className={`mt-4 text-[19px] font-bold ${metinAna}`}>Test açılamadı</h1>
                <p className={`mx-auto mt-2 max-w-lg text-[13px] leading-6 ${metinIkincil}`}>
                    {hata || "Testte görüntülenecek soru bulunmuyor."}
                </p>
                <button
                    type="button"
                    onClick={() => navigate(testlerYolu, { replace: true })}
                    className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl bg-[#5B50E6] px-4 text-[12px] font-bold text-white"
                >
                    <ArrowLeftIcon className="h-4 w-4" /> Testlere Dön
                </button>
            </section>
        );
    }

    return (
        <div className="space-y-5">
            <section className={`rounded-2xl border px-4 py-4 shadow-sm sm:px-5 ${kart}`}>
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                            isDark ? "bg-violet-400/10 text-violet-300" : "bg-violet-50 text-violet-600"
                        }`}>
                            <ClipboardDocumentCheckIcon className="h-6 w-6" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7567FF]">Test Çözülüyor</p>
                            <h1 className={`mt-1 truncate text-[17px] font-extrabold sm:text-[20px] ${metinAna}`} title={hedef.baslik}>
                                {hedef.baslik}
                            </h1>
                            <p className={`mt-1 flex flex-wrap gap-x-2 text-[11px] sm:text-[12px] ${metinIkincil}`}>
                                <span>{ders?.dersAdi}</span><span>•</span>
                                <span>{testKapsamEtiketi(test.kapsamTuru)}</span><span>•</span>
                                <span>{test.soruSayisi} soru</span><span>•</span>
                                <span>{testZorlukEtiketi(test.zorluk)}</span>
                            </p>
                        </div>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                        <button
                            type="button"
                            onClick={dahaSonraDevamEt}
                            disabled={ayriliniyor || tamamlaniyor}
                            className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-[12px] font-bold transition-colors disabled:opacity-55 ${
                                isDark ? "border-[#334660] bg-[#132139] text-[#D6DDEA]" : "border-[#DDE2EA] bg-white text-[#475569]"
                            }`}
                        >
                            {ayriliniyor ? <ArrowPathIcon className="h-4 w-4 animate-spin" /> : <FlagIcon className="h-4 w-4" />}
                            Daha Sonra Devam Et
                        </button>
                        <button
                            type="button"
                            onClick={() => setBitirmeOnayiAcik(true)}
                            disabled={tamamlaniyor || ayriliniyor}
                            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-rose-400/45 bg-rose-500/10 px-4 text-[12px] font-bold text-rose-400 transition-colors hover:bg-rose-500/15 disabled:opacity-55"
                        >
                            <FlagIcon className="h-4 w-4" /> Testi Bitir
                        </button>
                    </div>
                </div>
            </section>

            {(islemHatasi || kayitBilgisi.hata) && (
                <div className={`flex flex-col gap-3 rounded-xl border px-4 py-3 text-[12px] sm:flex-row sm:items-center sm:justify-between ${
                    isDark ? "border-rose-400/25 bg-rose-400/10 text-rose-200" : "border-rose-200 bg-rose-50 text-rose-700"
                }`} role="alert">
                    <span className="flex items-start gap-2"><ExclamationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />{islemHatasi || kayitBilgisi.hata}</span>
                    <button type="button" onClick={kaydiYenidenDene} className="shrink-0 font-bold underline underline-offset-4">Kaydı Yeniden Dene</button>
                </div>
            )}

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <main className="space-y-3" ref={soruKartiRef}>
                    <section className={`rounded-2xl border px-4 py-4 shadow-sm sm:px-5 ${kart}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            <strong className={`text-[19px] sm:text-[22px] ${metinAna}`}>Soru {aktifIndeks + 1} / {sorular.length}</strong>
                            <div className={`h-2 flex-1 overflow-hidden rounded-full ${isDark ? "bg-[#223149]" : "bg-[#E6EAF0]"}`}>
                                <div className="h-full rounded-full bg-gradient-to-r from-[#7168F3] to-[#A095FF]" style={{ width: `${ozet.yuzde}%` }} />
                            </div>
                            <span className={`text-[11px] font-bold ${metinIkincil}`}>%{ozet.yuzde} cevaplandı</span>
                        </div>
                    </section>

                    <section className={`rounded-2xl border p-4 shadow-sm sm:p-6 ${kart}`}>
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <span className={`self-start rounded-lg px-3 py-1.5 text-[11px] font-semibold ${
                                isDark ? "bg-indigo-400/10 text-indigo-200" : "bg-indigo-50 text-indigo-700"
                            }`}>
                                {aktifSoru.konuBasligi ? `Konu: ${aktifSoru.konuBasligi}` : testKapsamEtiketi(test.kapsamTuru)}
                            </span>
                            <button
                                type="button"
                                aria-pressed={aktifSoru.isaretli === true}
                                onClick={() => isaretiDegistir(aktifSoru)}
                                className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[11px] font-bold transition-colors ${
                                    aktifSoru.isaretli
                                        ? "border-amber-400/50 bg-amber-400/10 text-amber-400"
                                        : isDark
                                            ? "border-[#334660] text-[#C6D0DF] hover:border-amber-400/45 hover:text-amber-300"
                                            : "border-[#DDE2EA] text-[#475569] hover:border-amber-400 hover:text-amber-600"
                                }`}
                            >
                                <FlagIcon className={`h-4 w-4 ${aktifSoru.isaretli ? "fill-current" : ""}`} />
                                {aktifSoru.isaretli ? "İşareti Kaldır" : "Soruyu İşaretle"}
                            </button>
                        </div>

                        <h2 className={`mt-5 text-[17px] font-bold leading-7 sm:text-[20px] ${metinAna}`}>
                            {aktifSoru.metin}
                        </h2>

                        <div className="mt-5 space-y-3" role="radiogroup" aria-label={`${aktifIndeks + 1}. sorunun seçenekleri`}>
                            {aktifSoru.secenekler.map((secenek) => {
                                const secili = aktifSoru.ogrenciCevabi === secenek.anahtar;
                                return (
                                    <button
                                        key={secenek.anahtar}
                                        type="button"
                                        role="radio"
                                        aria-checked={secili}
                                        onClick={() => cevabiSec(aktifSoru, secenek.anahtar)}
                                        className={`flex w-full items-center gap-3 rounded-xl border px-3.5 py-3 text-left transition-colors sm:px-4 sm:py-4 ${
                                            secili
                                                ? isDark
                                                    ? "border-[#9A8DFF] bg-violet-400/10 text-white shadow-[0_0_0_1px_rgba(154,141,255,0.25)]"
                                                    : "border-violet-500 bg-violet-50 text-[#312E81] shadow-[0_0_0_1px_rgba(139,92,246,0.12)]"
                                                : isDark
                                                    ? "border-[#273750] bg-[#0C1728]/55 text-[#D8E0EC] hover:border-[#465A78]"
                                                    : "border-[#E1E6EE] bg-[#FBFCFE] text-[#334155] hover:border-violet-300"
                                        }`}
                                    >
                                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-[13px] font-extrabold ${
                                            secili ? "bg-gradient-to-br from-[#8173F5] to-[#B4AAFF] text-white" : isDark ? "bg-[#1A2940] text-[#DCE4F0]" : "bg-slate-100 text-[#475569]"
                                        }`}>{secenek.anahtar}</span>
                                        <span className="min-w-0 flex-1 text-[12px] font-medium leading-5 sm:text-[14px] sm:leading-6">{secenek.metin}</span>
                                        <span className={`h-4 w-4 shrink-0 rounded-full border ${secili ? "border-[5px] border-[#8D80F4]" : isDark ? "border-[#40516A]" : "border-[#CBD5E1]"}`} />
                                    </button>
                                );
                            })}
                        </div>

                        <div className={`mt-5 flex flex-col gap-3 rounded-xl border px-4 py-3 text-[11px] sm:flex-row sm:items-center sm:justify-between ${
                            isDark ? "border-indigo-400/20 bg-indigo-400/[0.06] text-[#B7C1D2]" : "border-indigo-100 bg-indigo-50/60 text-[#64748B]"
                        }`}>
                            <span className="flex items-start gap-2"><InformationCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-indigo-400" />Cevaplarınızı test bitene kadar değiştirebilirsiniz. Değişiklikler otomatik kaydedilir.</span>
                            {aktifSoru.ogrenciCevabi != null && (
                                <button type="button" onClick={() => cevabiSec(aktifSoru, null)} className="shrink-0 font-bold text-[#7567FF] underline underline-offset-4">Cevabı Temizle</button>
                            )}
                        </div>

                        <div className={`mt-5 flex flex-col gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between ${altKenarlik}`}>
                            <button
                                type="button"
                                onClick={() => soruyaGit(aktifIndeks - 1)}
                                disabled={aktifIndeks === 0 || tamamlaniyor}
                                className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-5 text-[12px] font-bold disabled:cursor-not-allowed disabled:opacity-35 ${
                                    isDark ? "border-[#334660] bg-[#14213A] text-[#D7DEEA]" : "border-[#DDE2EA] bg-white text-[#475569]"
                                }`}
                            >
                                <ArrowLeftIcon className="h-4 w-4" /> Önceki Soru
                            </button>

                            <div className={`flex min-h-10 items-center justify-center gap-2 rounded-full px-4 text-[11px] font-bold ${
                                kayitBilgisi.durum === "hata"
                                    ? "bg-rose-500/10 text-rose-400"
                                    : kayitBilgisi.durum === "kaydediliyor"
                                        ? "bg-amber-400/10 text-amber-400"
                                        : "bg-emerald-400/10 text-emerald-400"
                            }`} role="status" aria-live="polite">
                                {kayitBilgisi.durum === "kaydediliyor" ? <CloudArrowUpIcon className="h-4 w-4 animate-pulse" /> : kayitBilgisi.durum === "hata" ? <ExclamationCircleIcon className="h-4 w-4" /> : <CheckCircleIcon className="h-4 w-4" />}
                                {kayitBilgisi.durum === "kaydediliyor" ? "Kaydediliyor..." : kayitBilgisi.durum === "hata" ? "Kaydedilemedi" : "Kaydedildi"}
                            </div>

                            <button
                                type="button"
                                onClick={() => soruyaGit(aktifIndeks + 1)}
                                disabled={aktifIndeks === sorular.length - 1 || tamamlaniyor}
                                className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7567FF] to-[#A497FF] px-5 text-[12px] font-extrabold text-white shadow-lg shadow-indigo-950/20 disabled:cursor-not-allowed disabled:opacity-35"
                            >
                                Sonraki Soru <ArrowRightIcon className="h-4 w-4" />
                            </button>
                        </div>
                    </section>
                </main>

                <aside className={`self-start rounded-2xl border p-4 shadow-sm xl:sticky xl:top-4 sm:p-5 ${kart}`}>
                    <div className={`flex items-center gap-2 border-b pb-4 ${altKenarlik}`}>
                        <Squares2X2Icon className="h-5 w-5 text-[#8D80F4]" />
                        <h2 className={`text-[16px] font-extrabold ${metinAna}`}>Soru Haritası</h2>
                    </div>
                    <div className={`mt-4 grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl border p-3 text-[10px] ${
                        isDark ? "border-white/[0.05] bg-[#0C1728]/55 text-[#AAB5C7]" : "border-[#EDF0F5] bg-[#F8FAFC] text-[#64748B]"
                    }`}>
                        <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-[#9C91FF]" />Aktif soru</span>
                        <span className="flex items-center gap-2"><i className="h-3 w-3 rounded-full bg-emerald-400" />Cevaplandı</span>
                        <span className="flex items-center gap-2"><i className={`h-3 w-3 rounded-full ${isDark ? "bg-[#273750]" : "bg-slate-300"}`} />Boş</span>
                        <span className="flex items-center gap-2"><FlagIcon className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />İşaretli</span>
                    </div>
                    <div className="mt-4 grid grid-cols-5 gap-2 sm:grid-cols-8 xl:grid-cols-5">
                        {sorular.map((soru, index) => {
                            const aktif = index === aktifIndeks;
                            const cevaplandi = soru.ogrenciCevabi != null;
                            return (
                                <button
                                    key={String(soru._id)}
                                    type="button"
                                    aria-current={aktif ? "step" : undefined}
                                    aria-label={`${index + 1}. soru${cevaplandi ? ", cevaplandı" : ", boş"}${soru.isaretli ? ", işaretli" : ""}`}
                                    onClick={() => soruyaGit(index)}
                                    className={`relative flex aspect-square items-center justify-center rounded-xl border text-[13px] font-extrabold transition-colors ${
                                        aktif
                                            ? "border-[#A69CFF] bg-gradient-to-br from-[#8578F4] to-[#B8B0FF] text-white shadow-md shadow-violet-900/20"
                                            : cevaplandi
                                                ? "border-emerald-400/55 bg-emerald-400/10 text-emerald-400"
                                                : isDark
                                                    ? "border-[#2B3B55] bg-[#142139] text-[#C6D0DF] hover:border-violet-400/50"
                                                    : "border-[#DDE2EA] bg-[#F8FAFC] text-[#475569] hover:border-violet-300"
                                    }`}
                                >
                                    {index + 1}
                                    {soru.isaretli && <FlagIcon className="absolute right-1 top-1 h-3 w-3 fill-amber-400 text-amber-400" />}
                                    {cevaplandi && !aktif && <CheckCircleIcon className="absolute bottom-0.5 right-0.5 h-3 w-3" />}
                                </button>
                            );
                        })}
                    </div>
                    <div className={`mt-5 rounded-xl border p-4 ${
                        isDark ? "border-white/[0.05] bg-[#0C1728]/55" : "border-[#EDF0F5] bg-[#F8FAFC]"
                    }`}>
                        <p className={`text-[11px] font-bold ${metinIkincil}`}>Test Durum Özeti</p>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[10px] font-bold">
                            <span className="rounded-lg bg-emerald-400/10 px-2 py-2 text-emerald-400">{ozet.cevaplanan}<small className="mt-0.5 block font-medium">Cevaplandı</small></span>
                            <span className={`rounded-lg px-2 py-2 ${isDark ? "bg-white/5 text-[#AAB5C7]" : "bg-slate-100 text-slate-600"}`}>{ozet.bos}<small className="mt-0.5 block font-medium">Boş</small></span>
                            <span className="rounded-lg bg-amber-400/10 px-2 py-2 text-amber-400">{ozet.isaretli}<small className="mt-0.5 block font-medium">İşaretli</small></span>
                        </div>
                    </div>
                </aside>
            </div>

            {bitirmeOnayiAcik && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/75 px-4 py-6 backdrop-blur-sm" role="presentation" onMouseDown={(event) => {
                    if (event.target === event.currentTarget && !tamamlaniyor) setBitirmeOnayiAcik(false);
                }}>
                    <section
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="test-bitir-baslik"
                        className={`w-full max-w-lg rounded-2xl border p-5 shadow-2xl sm:p-6 ${kart}`}
                    >
                        <div className="flex items-start justify-between gap-4">
                            <div>
                                <h2 id="test-bitir-baslik" className={`text-[20px] font-extrabold ${metinAna}`}>Testi bitirmek istiyor musunuz?</h2>
                                <p className={`mt-1.5 text-[12px] leading-5 ${metinIkincil}`}>Tamamlanan testin cevapları daha sonra değiştirilemez.</p>
                            </div>
                            <button ref={modalIptalRef} type="button" aria-label="Pencereyi kapat" disabled={tamamlaniyor} onClick={() => setBitirmeOnayiAcik(false)} className={`rounded-lg p-2 ${metinIkincil}`}><XMarkIcon className="h-5 w-5" /></button>
                        </div>
                        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            {[
                                ["Toplam", ozet.toplam, "text-violet-400"],
                                ["Cevaplanan", ozet.cevaplanan, "text-emerald-400"],
                                ["Boş", ozet.bos, "text-slate-400"],
                                ["İşaretli", ozet.isaretli, "text-amber-400"],
                            ].map(([etiket, deger, renk]) => (
                                <div key={etiket} className={`rounded-xl border px-3 py-3 text-center ${altKenarlik}`}>
                                    <strong className={`block text-[22px] ${renk}`}>{deger}</strong>
                                    <span className={`mt-1 block text-[10px] ${metinIkincil}`}>{etiket}</span>
                                </div>
                            ))}
                        </div>
                        {ozet.bos > 0 && (
                            <div className={`mt-4 flex gap-2 rounded-xl border px-3.5 py-3 text-[11px] leading-5 ${
                                isDark ? "border-amber-400/25 bg-amber-400/10 text-amber-200" : "border-amber-200 bg-amber-50 text-amber-800"
                            }`}><ExclamationCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />{ozet.bos} soruyu boş bıraktınız. İsterseniz yine de testi tamamlayabilirsiniz.</div>
                        )}
                        {islemHatasi && <p className="mt-4 text-[11px] leading-5 text-rose-400" role="alert">{islemHatasi}</p>}
                        <div className="mt-6 grid gap-2 sm:grid-cols-2">
                            <button type="button" disabled={tamamlaniyor} onClick={() => setBitirmeOnayiAcik(false)} className={`h-11 rounded-xl border text-[12px] font-bold ${isDark ? "border-[#334660] text-[#D7DEEA]" : "border-[#DDE2EA] text-[#475569]"}`}>Teste Dön</button>
                            <button type="button" disabled={tamamlaniyor} onClick={testiTamamla} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-rose-500 px-4 text-[12px] font-extrabold text-white disabled:opacity-60">
                                {tamamlaniyor && <ArrowPathIcon className="h-4 w-4 animate-spin" />}
                                {tamamlaniyor ? "Tamamlanıyor..." : "Testi Bitir"}
                            </button>
                        </div>
                    </section>
                </div>
            )}
        </div>
    );
}

export default TestCoz;

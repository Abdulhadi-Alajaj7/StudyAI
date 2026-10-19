import { useCallback, useEffect, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import {
    ArrowPathIcon,
    Bars3BottomLeftIcon,
    ChatBubbleLeftRightIcon,
    PaperAirplaneIcon,
    SparklesIcon,
} from "@heroicons/react/24/outline";

import sohbetApi from "../services/sohbetApi.mjs";
import SohbetIslemModal from "../components/SohbetIslemModal";
import SohbetListesi from "../components/SohbetListesi";
import SohbetMesaji from "../components/SohbetMesaji";
import {
    geciciMesajiSunucuMesajiylaDegistir,
    istemciIstekIdOlustur,
    kaydirmaSondaMi,
    kullaniciDostuSohbetHatasi,
    mesajlariBirlestir,
    sohbetleriBirlestir,
} from "../utils/sohbetYardimcilari.mjs";

const secimAnahtari = (dersId) => `studyai-sohbet-secimi:${dersId}`;

function DersSohbet() {
    const { isDark, ders } = useOutletContext();
    const { dersId } = useParams();
    const [sohbetler, setSohbetler] = useState([]);
    const [seciliSohbetId, setSeciliSohbetId] = useState(null);
    const [mesajlar, setMesajlar] = useState([]);
    const [sohbetCursor, setSohbetCursor] = useState(null);
    const [mesajCursor, setMesajCursor] = useState(null);
    const [sohbetlerYukleniyor, setSohbetlerYukleniyor] = useState(true);
    const [mesajlarYukleniyor, setMesajlarYukleniyor] = useState(false);
    const [eskiMesajlarYukleniyor, setEskiMesajlarYukleniyor] = useState(false);
    const [gonderiliyor, setGonderiliyor] = useState(false);
    const [girdi, setGirdi] = useState("");
    const [listeHatasi, setListeHatasi] = useState("");
    const [mesajHatasi, setMesajHatasi] = useState("");
    const [yenidenDenenecek, setYenidenDenenecek] = useState(null);
    const [mobilListeAcik, setMobilListeAcik] = useState(false);
    const [modal, setModal] = useState(null);
    const [modalYukleniyor, setModalYukleniyor] = useState(false);
    const [modalHatasi, setModalHatasi] = useState("");
    const [sohbetYuksekligi, setSohbetYuksekligi] = useState(null);

    const sohbetKabuguRef = useRef(null);
    const mesajAlaniRef = useRef(null);
    const metinAlaniRef = useRef(null);
    const mobilListeButonuRef = useRef(null);
    const drawerOncekiOdakRef = useRef(null);
    const seciliSohbetRef = useRef(null);
    const gonderiliyorRef = useRef(false);
    const sohbetIstegiRef = useRef(0);
    const mesajIstegiRef = useRef(0);
    const baslikZamanlayicilariRef = useRef(new Set());
    const monteRef = useRef(true);

    const mobilListeyiAc = useCallback(() => {
        drawerOncekiOdakRef.current = document.activeElement;
        setMobilListeAcik(true);
    }, []);

    const mobilListeyiKapat = useCallback(() => {
        setMobilListeAcik(false);
    }, []);

    useEffect(() => {
        monteRef.current = true;
        const zamanlayicilar = baslikZamanlayicilariRef.current;
        return () => {
            monteRef.current = false;
            for (const zamanlayici of zamanlayicilar) clearTimeout(zamanlayici);
        };
    }, []);

    useEffect(() => {
        if (!mobilListeAcik) return undefined;
        const oncekiOverflow = document.body.style.overflow;
        const oncekiOverscroll = document.documentElement.style.overscrollBehavior;
        const oncekiOdak = drawerOncekiOdakRef.current;
        const mobilListeButonu = mobilListeButonuRef.current;
        document.body.style.overflow = "hidden";
        document.documentElement.style.overscrollBehavior = "none";
        return () => {
            document.body.style.overflow = oncekiOverflow;
            document.documentElement.style.overscrollBehavior = oncekiOverscroll;
            requestAnimationFrame(() => {
                const hedef = oncekiOdak?.isConnected ? oncekiOdak : mobilListeButonu;
                hedef?.focus();
            });
        };
    }, [mobilListeAcik]);

    useEffect(() => {
        const masaustuSorgusu = window.matchMedia("(min-width: 1024px)");
        const ekranDegisiminiYakala = (event) => {
            if (event.matches) setMobilListeAcik(false);
        };
        masaustuSorgusu.addEventListener("change", ekranDegisiminiYakala);
        return () => masaustuSorgusu.removeEventListener("change", ekranDegisiminiYakala);
    }, []);

    useEffect(() => {
        let animasyonKaresi;
        let iptalEdildi = false;

        const yuksekligiHesapla = () => {
            cancelAnimationFrame(animasyonKaresi);
            animasyonKaresi = requestAnimationFrame(() => {
                const kabuk = sohbetKabuguRef.current;
                if (!kabuk || iptalEdildi) return;

                const gorunenAlan = window.visualViewport;
                const gorunenYukseklik = gorunenAlan?.height || window.innerHeight;
                const gorunenUst = gorunenAlan?.offsetTop || 0;
                const kabukUst = Math.max(0, kabuk.getBoundingClientRect().top - gorunenUst);
                const altBosluk = window.innerWidth < 640 ? 4 : 8;
                const asgariYukseklik = gorunenYukseklik < 600 ? 280 : window.innerWidth >= 1024 ? 420 : 340;
                const yeniYukseklik = Math.max(
                    asgariYukseklik,
                    Math.floor(gorunenYukseklik - kabukUst - altBosluk)
                );
                setSohbetYuksekligi((onceki) => onceki === yeniYukseklik ? onceki : yeniYukseklik);
            });
        };

        yuksekligiHesapla();
        window.addEventListener("resize", yuksekligiHesapla);
        window.visualViewport?.addEventListener("resize", yuksekligiHesapla);
        window.visualViewport?.addEventListener("scroll", yuksekligiHesapla);
        document.fonts?.ready.then(yuksekligiHesapla);

        return () => {
            iptalEdildi = true;
            cancelAnimationFrame(animasyonKaresi);
            window.removeEventListener("resize", yuksekligiHesapla);
            window.visualViewport?.removeEventListener("resize", yuksekligiHesapla);
            window.visualViewport?.removeEventListener("scroll", yuksekligiHesapla);
        };
    }, []);

    const altaKaydir = useCallback((davranis = "smooth") => {
        requestAnimationFrame(() => {
            mesajAlaniRef.current?.scrollTo({
                top: mesajAlaniRef.current.scrollHeight,
                behavior: davranis,
            });
        });
    }, []);

    const mesajlariYukle = useCallback(async (sohbetId, { cursor = null } = {}) => {
        const istekSirasi = ++mesajIstegiRef.current;
        const eskiMesajlar = Boolean(cursor);
        const alan = mesajAlaniRef.current;
        const oncekiYukseklik = alan?.scrollHeight || 0;
        if (eskiMesajlar) setEskiMesajlarYukleniyor(true);
        else {
            setMesajlarYukleniyor(true);
            setMesajlar([]);
            setMesajCursor(null);
        }
        setMesajHatasi("");

        try {
            const yanit = await sohbetApi.mesajlariGetir(dersId, sohbetId, { cursor, limit: 50 });
            if (istekSirasi !== mesajIstegiRef.current || String(seciliSohbetRef.current) !== String(sohbetId)) return;
            const gelenMesajlar = yanit.data.mesajlar || [];
            setMesajlar((onceki) => mesajlariBirlestir(onceki, gelenMesajlar, { basaEkle: eskiMesajlar }));
            setMesajCursor(yanit.data.sonrakiCursor || null);
            if (eskiMesajlar) {
                requestAnimationFrame(() => {
                    if (mesajAlaniRef.current) {
                        mesajAlaniRef.current.scrollTop += mesajAlaniRef.current.scrollHeight - oncekiYukseklik;
                    }
                });
            } else {
                altaKaydir("auto");
            }
        } catch (hata) {
            if (istekSirasi !== mesajIstegiRef.current) return;
            setMesajHatasi(kullaniciDostuSohbetHatasi(hata));
        } finally {
            if (istekSirasi === mesajIstegiRef.current) {
                setMesajlarYukleniyor(false);
                setEskiMesajlarYukleniyor(false);
            }
        }
    }, [altaKaydir, dersId]);

    const sohbetSec = useCallback((sohbet, { mobilKapat = true } = {}) => {
        if (gonderiliyorRef.current) return;
        const sohbetId = String(sohbet._id);
        seciliSohbetRef.current = sohbetId;
        setSeciliSohbetId(sohbetId);
        setMesajHatasi("");
        setYenidenDenenecek(null);
        sessionStorage.setItem(secimAnahtari(dersId), sohbetId);
        if (mobilKapat) setMobilListeAcik(false);
        void mesajlariYukle(sohbetId);
    }, [dersId, mesajlariYukle]);

    const sohbetleriYukle = useCallback(async ({ cursor = null, ilkYukleme = false } = {}) => {
        const istekSirasi = ++sohbetIstegiRef.current;
        setSohbetlerYukleniyor(true);
        setListeHatasi("");
        try {
            const yanit = await sohbetApi.sohbetleriListele(dersId, { cursor, limit: 20 });
            if (istekSirasi !== sohbetIstegiRef.current) return;
            const gelenler = yanit.data.sohbetler || [];
            setSohbetler((onceki) => sohbetleriBirlestir(cursor ? onceki : [], gelenler));
            setSohbetCursor(yanit.data.sonrakiCursor || null);

            if (ilkYukleme && gelenler.length > 0) {
                const kayitliId = sessionStorage.getItem(secimAnahtari(dersId));
                const secilecek = gelenler.find((sohbet) => String(sohbet._id) === kayitliId) || gelenler[0];
                sohbetSec(secilecek, { mobilKapat: false });
            } else if (ilkYukleme && gelenler.length === 0) {
                seciliSohbetRef.current = null;
                setSeciliSohbetId(null);
                setMesajlar([]);
            }
        } catch (hata) {
            if (istekSirasi !== sohbetIstegiRef.current) return;
            setListeHatasi(kullaniciDostuSohbetHatasi(hata));
        } finally {
            if (istekSirasi === sohbetIstegiRef.current) setSohbetlerYukleniyor(false);
        }
    }, [dersId, sohbetSec]);

    useEffect(() => {
        seciliSohbetRef.current = null;
        setSeciliSohbetId(null);
        setMesajlar([]);
        void sohbetleriYukle({ ilkYukleme: true });
    }, [sohbetleriYukle]);

    const basligiTakipEt = useCallback((sohbetId, deneme = 0) => {
        if (deneme >= 5) return;
        const zamanlayici = setTimeout(async () => {
            baslikZamanlayicilariRef.current.delete(zamanlayici);
            if (!monteRef.current) return;
            try {
                const yanit = await sohbetApi.sohbetGetir(dersId, sohbetId);
                const sohbet = yanit.data.sohbet;
                if (!sohbet) return;
                setSohbetler((onceki) => sohbetleriBirlestir(onceki, [sohbet]));
                if (["bekliyor", "isleniyor"].includes(sohbet.baslikUretimDurumu)) {
                    basligiTakipEt(sohbetId, deneme + 1);
                }
            } catch {
                // Başlık yenilemesi ana sohbet deneyimini etkilemez.
            }
        }, 1_500 + deneme * 1_000);
        baslikZamanlayicilariRef.current.add(zamanlayici);
    }, [dersId]);

    const yeniSohbetGorunumu = useCallback(() => {
        if (gonderiliyorRef.current) return;
        mesajIstegiRef.current += 1;
        seciliSohbetRef.current = null;
        setSeciliSohbetId(null);
        setMesajlar([]);
        setMesajCursor(null);
        setMesajHatasi("");
        setYenidenDenenecek(null);
        setGirdi("");
        setMobilListeAcik(false);
        sessionStorage.removeItem(secimAnahtari(dersId));
        requestAnimationFrame(() => metinAlaniRef.current?.focus());
    }, [dersId]);

    const mesajGonder = async ({ icerik, istemciIstekId, tekrar = false }) => {
        const temizIcerik = String(icerik || "").trim();
        if (!temizIcerik || gonderiliyorRef.current || temizIcerik.length > 4_000) return;

        const istekSohbetId = seciliSohbetRef.current;
        const geciciId = `gecici-${istemciIstekId}`;
        gonderiliyorRef.current = true;
        setGonderiliyor(true);
        setMesajHatasi("");
        if (!tekrar) {
            setMesajlar((onceki) => mesajlariBirlestir(onceki, [{
                _id: geciciId,
                rol: "user",
                icerik: temizIcerik,
                istemciIstekId,
                yanitDurumu: "yanit_bekliyor",
                createdAt: new Date().toISOString(),
            }]));
        } else {
            setMesajlar((onceki) => onceki.map((mesaj) => (
                String(mesaj._id) === geciciId ? { ...mesaj, yanitDurumu: "yanit_bekliyor" } : mesaj
            )));
        }
        altaKaydir();

        try {
            const yanit = istekSohbetId
                ? await sohbetApi.mesajGonder(dersId, istekSohbetId, { icerik: temizIcerik, istemciIstekId })
                : await sohbetApi.sohbetOlustur(dersId, { ilkMesaj: temizIcerik, istemciIstekId });
            const sunucuKullaniciMesaji = yanit.data.kullaniciMesaji || yanit.data.mesaj;
            const asistanMesaji = yanit.data.asistanMesaji;
            const sondaydi = kaydirmaSondaMi(mesajAlaniRef.current);

            setMesajlar((onceki) => {
                const kullaniciGuncellenmis = geciciMesajiSunucuMesajiylaDegistir(
                    onceki,
                    istemciIstekId,
                    sunucuKullaniciMesaji
                );
                return mesajlariBirlestir(kullaniciGuncellenmis, asistanMesaji ? [asistanMesaji] : []);
            });

            const sohbet = yanit.data.sohbet;
            if (!istekSohbetId && sohbet?._id) {
                const yeniId = String(sohbet._id);
                seciliSohbetRef.current = yeniId;
                setSeciliSohbetId(yeniId);
                sessionStorage.setItem(secimAnahtari(dersId), yeniId);
                setSohbetler((onceki) => sohbetleriBirlestir(onceki, [sohbet]));
                basligiTakipEt(yeniId);
            } else if (istekSohbetId) {
                setSohbetler((onceki) => sohbetleriBirlestir(onceki, [{
                    _id: istekSohbetId,
                    sonMesajTarihi: asistanMesaji?.createdAt || new Date().toISOString(),
                }]));
            }

            setYenidenDenenecek(null);
            setGirdi((mevcut) => mevcut.trim() === temizIcerik ? "" : mevcut);
            if (sondaydi) altaKaydir();
        } catch (hata) {
            setMesajlar((onceki) => onceki.map((mesaj) => (
                String(mesaj._id) === geciciId ? { ...mesaj, yanitDurumu: "hata" } : mesaj
            )));
            setMesajHatasi(kullaniciDostuSohbetHatasi(hata));
            setYenidenDenenecek({
                icerik: temizIcerik,
                istemciIstekId,
                sohbetId: istekSohbetId,
            });
        } finally {
            gonderiliyorRef.current = false;
            setGonderiliyor(false);
            requestAnimationFrame(() => metinAlaniRef.current?.focus());
        }
    };

    const formuGonder = (event) => {
        event.preventDefault();
        if (!girdi.trim() || gonderiliyorRef.current) return;
        void mesajGonder({
            icerik: girdi,
            istemciIstekId: istemciIstekIdOlustur(),
        });
    };

    const yenidenDene = () => {
        if (!yenidenDenenecek || gonderiliyorRef.current) return;
        if (String(yenidenDenenecek.sohbetId || "") !== String(seciliSohbetRef.current || "")) return;
        void mesajGonder({ ...yenidenDenenecek, tekrar: true });
    };

    const modalOnayla = async (yeniBaslik) => {
        if (!modal?.sohbet || modalYukleniyor) return;
        setModalYukleniyor(true);
        setModalHatasi("");
        try {
            if (modal.tur === "yeniden-adlandir") {
                const yanit = await sohbetApi.baslikGuncelle(dersId, modal.sohbet._id, yeniBaslik);
                setSohbetler((onceki) => sohbetleriBirlestir(onceki, [yanit.data.sohbet]));
            } else {
                await sohbetApi.sohbetSil(dersId, modal.sohbet._id);
                const silinenId = String(modal.sohbet._id);
                setSohbetler((onceki) => onceki.filter((sohbet) => String(sohbet._id) !== silinenId));
                if (String(seciliSohbetRef.current) === silinenId) yeniSohbetGorunumu();
            }
            setModal(null);
        } catch (hata) {
            setModalHatasi(kullaniciDostuSohbetHatasi(hata));
        } finally {
            setModalYukleniyor(false);
        }
    };

    const listeProps = {
        isDark,
        sohbetler,
        seciliSohbetId,
        yukleniyor: sohbetlerYukleniyor,
        hata: listeHatasi,
        devamCursor: sohbetCursor,
        islemDevamEdiyor: gonderiliyor || modalYukleniyor,
        onYeniSohbet: yeniSohbetGorunumu,
        onSohbetSec: sohbetSec,
        onYenidenAdlandir: (sohbet) => { setModalHatasi(""); setModal({ tur: "yeniden-adlandir", sohbet }); },
        onSil: (sohbet) => { setModalHatasi(""); setModal({ tur: "sil", sohbet }); },
        onDahaFazla: () => void sohbetleriYukle({ cursor: sohbetCursor }),
        onYenile: () => void sohbetleriYukle(),
    };

    return (
        <section
            ref={sohbetKabuguRef}
            style={{ height: sohbetYuksekligi ? `${sohbetYuksekligi}px` : "calc(100dvh - 280px)" }}
            className={`relative min-h-[280px] w-full max-w-full overflow-hidden rounded-2xl border ${isDark ? "border-[#26334A] bg-[#0C1424]" : "border-[#E2E0E9] bg-[#F8F9FC]"}`}
            aria-label="Ders sohbeti"
        >
            <div
                className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)] xl:grid-cols-[272px_minmax(0,1fr)]"
                inert={mobilListeAcik ? "" : undefined}
            >
                <div className={`hidden min-h-0 border-r lg:block ${isDark ? "border-[#26334A]" : "border-[#E7E5EF]"}`}>
                    <SohbetListesi {...listeProps} />
                </div>

                <div className="flex min-h-0 min-w-0 flex-col">
                    <header className={`flex min-h-[68px] items-center gap-3 border-b px-3 py-2.5 sm:px-5 ${isDark ? "border-[#26334A] bg-[#10192C]" : "border-[#E7E5EF] bg-white"}`}>
                        <button
                            ref={mobilListeButonuRef}
                            type="button"
                            onClick={mobilListeyiAc}
                            aria-label="Sohbet geçmişini aç"
                            aria-controls="mobil-sohbet-listesi"
                            aria-expanded={mobilListeAcik}
                            aria-haspopup="dialog"
                            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl lg:hidden ${isDark ? "text-[#A7B0C2] hover:bg-white/5" : "text-[#64748B] hover:bg-slate-100"}`}
                        >
                            <Bars3BottomLeftIcon className="h-6 w-6" />
                        </button>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-500">
                            <SparklesIcon className="h-5 w-5" />
                        </div>
                        <div className="min-w-0">
                            <h2 className={`text-[15px] font-bold sm:text-base ${isDark ? "text-white" : "text-[#0F172A]"}`}>Ders Asistanı</h2>
                            <p className={`truncate text-[12px] sm:text-[13px] ${isDark ? "text-[#8F9BB2]" : "text-[#64748B]"}`}>
                                {ders?.dersAdi} materyalleri ve genel bilgilerle sorularınızı yanıtlar.
                            </p>
                        </div>
                    </header>

                    <div
                        ref={mesajAlaniRef}
                        className={`sohbet-mesaj-scrollbar min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-3 py-4 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-indigo-500 sm:px-5 sm:py-5 lg:px-6 ${isDark ? "sohbet-mesaj-scrollbar--dark" : "sohbet-mesaj-scrollbar--light"}`}
                        aria-label="Mesaj geçmişi"
                        aria-live="polite"
                        tabIndex={0}
                    >
                        {mesajCursor && !mesajlarYukleniyor && (
                            <div className="mb-5 text-center">
                                <button
                                    type="button"
                                    onClick={() => void mesajlariYukle(seciliSohbetId, { cursor: mesajCursor })}
                                    disabled={eskiMesajlarYukleniyor}
                                    className={`rounded-full px-4 py-2 text-[12px] font-semibold ${isDark ? "bg-white/5 text-[#AAB5C8] hover:bg-white/10" : "bg-white text-[#64748B] shadow-sm hover:bg-slate-50"}`}
                                >
                                    {eskiMesajlarYukleniyor ? "Yükleniyor..." : "Daha eski mesajları yükle"}
                                </button>
                            </div>
                        )}

                        {mesajlarYukleniyor && (
                            <div className="flex h-full items-center justify-center" role="status">
                                <div className="text-center">
                                    <div className="mx-auto h-8 w-8 animate-spin rounded-full border-[3px] border-indigo-500/20 border-t-indigo-500" />
                                    <p className={`mt-3 text-sm ${isDark ? "text-[#8F9BB2]" : "text-[#64748B]"}`}>Mesajlar yükleniyor...</p>
                                </div>
                            </div>
                        )}

                        {!mesajlarYukleniyor && mesajlar.length === 0 && (
                            <div className="flex h-full min-h-[300px] items-center justify-center">
                                <div className="max-w-md px-3 text-center">
                                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500/15 to-cyan-500/15 text-indigo-500">
                                        <ChatBubbleLeftRightIcon className="h-8 w-8" />
                                    </div>
                                    <h3 className={`mt-5 text-xl font-bold ${isDark ? "text-white" : "text-[#0F172A]"}`}>
                                        {seciliSohbetId ? "Bu sohbette henüz mesaj yok" : "Ders hakkında ne öğrenmek istersiniz?"}
                                    </h3>
                                    <p className={`mx-auto mt-2 max-w-sm text-sm leading-6 ${isDark ? "text-[#8F9BB2]" : "text-[#64748B]"}`}>
                                        Sorunuzu yazın; asistan ilgili ders materyallerini tarayıp doğrulanmış kaynak adlarıyla yanıtlasın.
                                    </p>
                                </div>
                            </div>
                        )}

                        {!mesajlarYukleniyor && mesajlar.length > 0 && (
                            <div className="mx-auto w-full max-w-5xl space-y-5 sm:space-y-6">
                                {mesajlar.map((mesaj) => <SohbetMesaji key={mesaj._id} mesaj={mesaj} isDark={isDark} />)}
                                {gonderiliyor && (
                                    <div className="flex items-start gap-3" role="status" aria-label="Ders Asistanı yanıt hazırlıyor">
                                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#22C1DC] text-white">
                                            <SparklesIcon className="h-5 w-5" />
                                        </div>
                                        <div className={`flex h-12 items-center gap-1 rounded-2xl rounded-tl-md border px-5 ${isDark ? "border-[#26334A] bg-[#162137]" : "border-[#E7E5EF] bg-white"}`}>
                                            {[0, 1, 2].map((deger) => <span key={deger} className="h-2 w-2 animate-bounce rounded-full bg-indigo-400" style={{ animationDelay: `${deger * 120}ms` }} />)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    <div className={`border-t p-3 sm:p-4 ${isDark ? "border-[#26334A] bg-[#10192C]" : "border-[#E7E5EF] bg-white"}`}>
                        {mesajHatasi && (
                            <div role="alert" className="mx-auto mb-3 flex max-w-5xl flex-col gap-2 rounded-xl border border-red-500/20 bg-red-500/5 px-3 py-2.5 text-[13px] text-red-500 sm:flex-row sm:items-center sm:justify-between">
                                <span>{mesajHatasi}</span>
                                {yenidenDenenecek && (
                                    <button type="button" onClick={yenidenDene} disabled={gonderiliyor} className="inline-flex shrink-0 items-center gap-1.5 font-semibold hover:underline disabled:opacity-60">
                                        <ArrowPathIcon className="h-4 w-4" /> Aynı istekle yeniden dene
                                    </button>
                                )}
                            </div>
                        )}
                        <form onSubmit={formuGonder} className={`mx-auto flex min-w-0 max-w-5xl items-end gap-2 rounded-2xl border p-2 transition-shadow focus-within:ring-4 focus-within:ring-indigo-500/10 ${isDark ? "border-[#33415C] bg-[#0C1424] focus-within:border-indigo-500" : "border-[#D8D5E2] bg-white focus-within:border-indigo-500"}`}>
                            <textarea
                                ref={metinAlaniRef}
                                value={girdi}
                                onChange={(event) => setGirdi(event.target.value.slice(0, 4_000))}
                                onKeyDown={(event) => {
                                    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                                        event.preventDefault();
                                        formuGonder(event);
                                    }
                                }}
                                rows={1}
                                maxLength={4_000}
                                disabled={gonderiliyor}
                                placeholder={`${ders?.dersAdi || "Ders"} hakkında bir şey sorun...`}
                                aria-label="Mesajınız"
                                className={`max-h-32 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-3 py-2.5 text-[14px] leading-6 outline-none disabled:cursor-not-allowed sm:text-[15px] ${isDark ? "text-white placeholder:text-[#71809B]" : "text-[#0F172A] placeholder:text-[#94A3B8]"}`}
                            />
                            <button
                                type="submit"
                                disabled={gonderiliyor || !girdi.trim()}
                                aria-label="Mesajı gönder"
                                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[#4F46E5] to-[#6D5DFB] text-white shadow-sm transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-45"
                            >
                                {gonderiliyor
                                    ? <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                                    : <PaperAirplaneIcon className="h-5 w-5" />}
                            </button>
                        </form>
                        <p className={`mx-auto mt-2 hidden max-w-5xl text-center text-[11px] sm:block ${isDark ? "text-[#66738B]" : "text-[#94A3B8]"}`}>
                            Enter ile gönderin · Shift+Enter ile yeni satır ekleyin · Yanıtları önemli bilgiler için doğrulayın.
                        </p>
                    </div>
                </div>
            </div>

            {mobilListeAcik && (
                <div id="mobil-sohbet-listesi" className="fixed inset-0 z-[80] overflow-hidden lg:hidden">
                    <button
                        type="button"
                        className="absolute inset-0 cursor-default bg-slate-950/60 backdrop-blur-[2px]"
                        onClick={mobilListeyiKapat}
                        aria-hidden="true"
                        tabIndex={-1}
                    />
                    <div className="absolute inset-y-0 left-0 max-w-full">
                        <SohbetListesi {...listeProps} mobil onKapat={mobilListeyiKapat} />
                    </div>
                </div>
            )}

            {modal && (
                <SohbetIslemModal
                    tur={modal.tur}
                    sohbet={modal.sohbet}
                    isDark={isDark}
                    yukleniyor={modalYukleniyor}
                    hata={modalHatasi}
                    onKapat={() => { if (!modalYukleniyor) setModal(null); }}
                    onOnayla={modalOnayla}
                />
            )}
        </section>
    );
}

export default DersSohbet;

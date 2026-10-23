import { useEffect, useMemo, useState } from "react";
import {
    ArrowLeftIcon,
    CheckCircleIcon,
    ChevronDownIcon,
    ClipboardDocumentListIcon,
    DocumentTextIcon,
    ExclamationCircleIcon,
    MinusCircleIcon,
    XCircleIcon,
} from "@heroicons/react/24/outline";
import { useNavigate, useOutletContext, useParams } from "react-router-dom";

import testlerApi from "../services/testlerApi.mjs";
import { dersDetayYolu } from "../utils/dersDetayYollari.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import {
    basariOraniniGetir,
    soruKaynakAdlariniGetir,
    soruSonucDurumunuGetir,
    tarihiBicimlendir,
    testCozmeYolu,
    testHedefBilgisi,
    testKapsamEtiketi,
    testZorlukEtiketi,
} from "../utils/testlerYardimcilari.mjs";

const istekIptalEdildiMi = (hata) => (
    hata?.code === "ERR_CANCELED" || hata?.name === "CanceledError" || hata?.name === "AbortError"
);

const sonucHataMesaji = (hata) => {
    const sunucuMesaji = hata?.response?.data?.hata;
    if ([404, 409].includes(hata?.response?.status) && typeof sunucuMesaji === "string" && sunucuMesaji.trim()) {
        return sunucuMesaji;
    }
    return kullaniciHataMesaji(hata, "Test sonucu yüklenemedi. Lütfen tekrar deneyin.");
};

const durumSunumu = {
    dogru: {
        etiket: "Doğru",
        Ikon: CheckCircleIcon,
        rozet: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400",
    },
    yanlis: {
        etiket: "Yanlış",
        Ikon: XCircleIcon,
        rozet: "border-rose-400/30 bg-rose-400/10 text-rose-400",
    },
    bos: {
        etiket: "Boş",
        Ikon: MinusCircleIcon,
        rozet: "border-slate-400/25 bg-slate-400/10 text-slate-400",
    },
};

function TestSonucu() {
    const { isDark, ders } = useOutletContext();
    const { dersId, testId } = useParams();
    const navigate = useNavigate();
    const [test, setTest] = useState(null);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [hata, setHata] = useState("");
    const [hataKodu, setHataKodu] = useState("");
    const [acikSorular, setAcikSorular] = useState(() => new Set());
    const testlerYolu = dersDetayYolu(dersId, "testler");

    useEffect(() => {
        const controller = new AbortController();
        const istekAnahtari = `${dersId}:${testId}`;
        let aktif = true;
        setTest(null);
        setYukleniyor(true);
        setHata("");
        setHataKodu("");
        setAcikSorular(new Set());

        const sonucuGetir = async () => {
            try {
                const yanit = await testlerApi.testSonucunuGetir(dersId, testId, controller.signal);
                const sonucTesti = yanit.data?.test;
                if (
                    !sonucTesti?._id ||
                    sonucTesti.durum !== "tamamlandi" ||
                    !sonucTesti.sonuc ||
                    !Array.isArray(sonucTesti.sorular)
                ) {
                    throw new Error("Test sonucu yanıtı geçersiz döndü.");
                }
                if (!aktif || controller.signal.aborted || `${dersId}:${testId}` !== istekAnahtari) return;
                setTest(sonucTesti);
                const ilkOncelikli = sonucTesti.sorular?.findIndex(
                    (soru) => soruSonucDurumunuGetir(soru) !== "dogru"
                );
                setAcikSorular(new Set([
                    ilkOncelikli >= 0 ? ilkOncelikli : 0,
                ]));
            } catch (istekHatasi) {
                if (!istekIptalEdildiMi(istekHatasi) && aktif) {
                    setHata(sonucHataMesaji(istekHatasi));
                    setHataKodu(istekHatasi?.response?.data?.kod || "");
                }
            } finally {
                if (aktif && !controller.signal.aborted) setYukleniyor(false);
            }
        };
        void sonucuGetir();
        return () => {
            aktif = false;
            controller.abort();
        };
    }, [dersId, testId]);

    const hedef = useMemo(() => testHedefBilgisi(test, { dersAdi: ders?.dersAdi }), [test, ders?.dersAdi]);
    const oran = basariOraniniGetir(test) ?? 0;
    const kart = isDark ? "border-[#22324A] bg-[#0F1A2D]" : "border-[#E4E7EF] bg-white";
    const metinAna = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const metinIkincil = isDark ? "text-[#9EABC0]" : "text-[#64748B]";
    const altKenarlik = isDark ? "border-white/[0.06]" : "border-[#EDF0F5]";

    const kartiDegistir = (indeks) => {
        setAcikSorular((mevcut) => {
            const yeni = new Set(mevcut);
            if (yeni.has(indeks)) yeni.delete(indeks);
            else yeni.add(indeks);
            return yeni;
        });
    };

    if (yukleniyor) {
        return (
            <div className="flex min-h-[420px] flex-col items-center justify-center" role="status">
                <div className="h-10 w-10 animate-spin rounded-full border-[3px] border-violet-400/20 border-t-[#7567FF]" />
                <p className={`mt-4 text-[13px] font-semibold ${metinIkincil}`}>Test sonucu yükleniyor...</p>
            </div>
        );
    }

    if (hata || !test) {
        const tamamlanmadi = hataKodu === "TEST_TAMAMLANMADI";
        return (
            <section className={`rounded-2xl border p-7 text-center ${kart}`}>
                <ExclamationCircleIcon className="mx-auto h-10 w-10 text-rose-400" />
                <h1 className={`mt-4 text-[19px] font-bold ${metinAna}`}>Sonuç görüntülenemedi</h1>
                <p className={`mx-auto mt-2 max-w-lg text-[13px] leading-6 ${metinIkincil}`}>{hata || "Test sonucu bulunamadı."}</p>
                <div className="mt-5 flex flex-col justify-center gap-2 sm:flex-row">
                    <button type="button" onClick={() => navigate(testlerYolu, { replace: true })} className={`inline-flex h-10 items-center justify-center gap-2 rounded-xl border px-4 text-[12px] font-bold ${isDark ? "border-[#334660] text-[#D7DEEA]" : "border-[#DDE2EA] text-[#475569]"}`}><ArrowLeftIcon className="h-4 w-4" />Testlere Dön</button>
                    {tamamlanmadi && <button type="button" onClick={() => navigate(testCozmeYolu(dersId, testId), { replace: true })} className="h-10 rounded-xl bg-[#5B50E6] px-4 text-[12px] font-bold text-white">Teste Devam Et</button>}
                </div>
            </section>
        );
    }

    return (
        <div className="space-y-5">
            <section className={`rounded-2xl border px-4 py-4 shadow-sm sm:px-5 ${kart}`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex min-w-0 items-start gap-3">
                        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${isDark ? "bg-violet-400/10 text-violet-300" : "bg-violet-50 text-violet-600"}`}>
                            <ClipboardDocumentListIcon className="h-6 w-6" />
                        </span>
                        <div className="min-w-0">
                            <p className="text-[10px] font-extrabold uppercase tracking-[0.16em] text-[#7567FF]">Test Sonucu</p>
                            <h1 className={`mt-1 truncate text-[17px] font-extrabold sm:text-[20px] ${metinAna}`} title={hedef.baslik}>{hedef.baslik}</h1>
                            <p className={`mt-1 flex flex-wrap gap-x-2 text-[11px] sm:text-[12px] ${metinIkincil}`}>
                                <span>{ders?.dersAdi}</span><span>•</span><span>{testKapsamEtiketi(test.kapsamTuru)}</span><span>•</span><span>{test.soruSayisi} soru</span><span>•</span><span>{testZorlukEtiketi(test.zorluk)}</span>
                            </p>
                        </div>
                    </div>
                    <button type="button" onClick={() => navigate(testlerYolu)} className={`inline-flex h-11 items-center justify-center gap-2 rounded-xl border px-4 text-[12px] font-bold ${isDark ? "border-[#334660] bg-[#132139] text-[#D6DDEA]" : "border-[#DDE2EA] bg-white text-[#475569]"}`}><ArrowLeftIcon className="h-4 w-4" />Testlere Geri Dön</button>
                </div>
            </section>

            <section className="grid gap-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(3,minmax(150px,0.6fr))]">
                <div className={`flex flex-col gap-5 rounded-2xl border p-5 shadow-sm sm:flex-row sm:items-center ${kart}`}>
                    <div
                        className="relative flex h-32 w-32 shrink-0 items-center justify-center rounded-full p-3"
                        style={{ background: `conic-gradient(#34D399 ${oran}%, ${isDark ? "#213149" : "#E2E8F0"} 0)` }}
                        role="img"
                        aria-label={`Başarı oranı yüzde ${oran}`}
                    >
                        <div className={`flex h-full w-full flex-col items-center justify-center rounded-full ${isDark ? "bg-[#0F1A2D]" : "bg-white"}`}>
                            <strong className="text-[28px] font-black text-emerald-400">%{oran}</strong>
                            <span className={`text-[10px] font-semibold ${metinIkincil}`}>Başarı Oranı</span>
                        </div>
                    </div>
                    <div className="min-w-0">
                        <p className="flex items-center gap-2 text-[17px] font-extrabold text-emerald-400"><CheckCircleIcon className="h-5 w-5" />Test tamamlandı</p>
                        <p className={`mt-2 text-[12px] leading-5 ${metinIkincil}`}>Backend tarafından hesaplanan sonucunuzu ve bütün cevapları aşağıda inceleyebilirsiniz.</p>
                        <p className={`mt-3 text-[11px] ${metinIkincil}`}>{tarihiBicimlendir(test.tamamlanmaTarihi)}</p>
                    </div>
                </div>
                {[
                    ["Doğru", test.sonuc.dogruSayisi, CheckCircleIcon, "border-emerald-400/25 bg-emerald-400/[0.08] text-emerald-400"],
                    ["Yanlış", test.sonuc.yanlisSayisi, XCircleIcon, "border-rose-400/25 bg-rose-400/[0.08] text-rose-400"],
                    ["Boş", test.sonuc.bosSayisi, MinusCircleIcon, "border-slate-400/20 bg-slate-400/[0.07] text-slate-400"],
                ].map(([etiket, deger, _Ikon, sinif]) => (
                    <div key={etiket} className={`flex min-h-36 flex-col items-center justify-center rounded-2xl border p-4 shadow-sm ${sinif}`}>
                        <_Ikon className="h-8 w-8" />
                        <strong className="mt-2 text-[31px] font-black">{deger}</strong>
                        <span className="text-[12px] font-bold">{etiket}</span>
                    </div>
                ))}
            </section>

            <section>
                <div className="mb-3">
                    <h2 className={`flex items-center gap-2 text-[19px] font-extrabold ${metinAna}`}><DocumentTextIcon className="h-5 w-5 text-[#8D80F4]" />Cevapları İncele ({test.sorular.length} Soru)</h2>
                    <p className={`mt-1 text-[12px] ${metinIkincil}`}>Cevaplar, doğru seçenekler ve kaynak açıklamaları salt okunur olarak gösterilir.</p>
                </div>
                <div className="space-y-2.5">
                    {test.sorular.map((soru, indeks) => {
                        const durum = soruSonucDurumunuGetir(soru);
                        const sunum = durumSunumu[durum];
                        const DurumIkonu = sunum.Ikon;
                        const acik = acikSorular.has(indeks);
                        const kaynaklar = soruKaynakAdlariniGetir(soru);
                        const ogrenciSecenegi = soru.secenekler.find((secenek) => secenek.anahtar === soru.ogrenciCevabi);
                        const dogruSecenek = soru.secenekler.find((secenek) => secenek.anahtar === soru.dogruCevap);
                        return (
                            <article key={String(soru._id)} className={`overflow-hidden rounded-2xl border shadow-sm ${kart}`}>
                                <button
                                    type="button"
                                    aria-expanded={acik}
                                    aria-controls={`sonuc-soru-${indeks}`}
                                    onClick={() => kartiDegistir(indeks)}
                                    className="flex w-full items-center gap-3 px-4 py-3.5 text-left sm:px-5"
                                >
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-extrabold ${sunum.rozet}`}>{indeks + 1}</span>
                                    <span className={`min-w-0 flex-1 truncate text-[12px] font-bold sm:text-[13px] ${metinAna}`}>Soru {indeks + 1}: {soru.metin}</span>
                                    <span className={`hidden items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold sm:inline-flex ${sunum.rozet}`}><DurumIkonu className="h-3.5 w-3.5" />{sunum.etiket}</span>
                                    <ChevronDownIcon className={`h-4 w-4 shrink-0 transition-transform ${metinIkincil} ${acik ? "rotate-180" : ""}`} />
                                </button>

                                {acik && (
                                    <div id={`sonuc-soru-${indeks}`} className={`grid gap-4 border-t p-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(270px,0.65fr)] sm:p-5 ${altKenarlik}`}>
                                        <div>
                                            <h3 className={`text-[14px] font-extrabold leading-6 ${metinAna}`}>{soru.metin}</h3>
                                            <div className="mt-4 space-y-2">
                                                {soru.secenekler.map((secenek) => {
                                                    const dogruCevap = secenek.anahtar === soru.dogruCevap;
                                                    const ogrenciCevabi = secenek.anahtar === soru.ogrenciCevabi;
                                                    const yanlisSecim = ogrenciCevabi && !dogruCevap;
                                                    return (
                                                        <div key={secenek.anahtar} className={`flex items-center gap-3 rounded-xl border px-3 py-3 text-[11px] sm:text-[12px] ${
                                                            dogruCevap
                                                                ? "border-emerald-400/45 bg-emerald-400/10 text-emerald-300"
                                                                : yanlisSecim
                                                                    ? "border-rose-400/45 bg-rose-400/10 text-rose-300"
                                                                    : isDark ? "border-[#293A54] text-[#CBD5E1]" : "border-[#E2E8F0] text-[#475569]"
                                                        }`}>
                                                            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full font-extrabold ${dogruCevap ? "bg-emerald-400 text-emerald-950" : yanlisSecim ? "bg-rose-400 text-white" : isDark ? "bg-[#1B2A41]" : "bg-slate-100"}`}>{secenek.anahtar}</span>
                                                            <span className="min-w-0 flex-1 leading-5">{secenek.metin}</span>
                                                            {dogruCevap && <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-wide">Doğru cevap</span>}
                                                            {yanlisSecim && <span className="shrink-0 text-[9px] font-extrabold uppercase tracking-wide">Senin cevabın</span>}
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>

                                        <div className={`overflow-hidden rounded-xl border ${altKenarlik}`}>
                                            <div className={`p-3.5 ${durum === "yanlis" ? "bg-rose-400/[0.06]" : isDark ? "bg-[#0C1728]/45" : "bg-[#F8FAFC]"}`}>
                                                <p className={`flex items-center gap-1.5 text-[10px] font-extrabold ${durum === "yanlis" ? "text-rose-400" : metinIkincil}`}><DurumIkonu className="h-3.5 w-3.5" />Senin Cevabın</p>
                                                <p className={`mt-2 text-[11px] leading-5 ${metinAna}`}>{ogrenciSecenegi ? `${ogrenciSecenegi.anahtar}) ${ogrenciSecenegi.metin}` : "Bu soru boş bırakıldı."}</p>
                                            </div>
                                            <div className={`border-t p-3.5 ${altKenarlik}`}>
                                                <p className="flex items-center gap-1.5 text-[10px] font-extrabold text-emerald-400"><CheckCircleIcon className="h-3.5 w-3.5" />Doğru Cevap</p>
                                                <p className={`mt-2 text-[11px] leading-5 ${metinAna}`}>{dogruSecenek ? `${dogruSecenek.anahtar}) ${dogruSecenek.metin}` : "Doğru cevap bilgisi bulunamadı."}</p>
                                            </div>
                                            <div className={`border-t p-3.5 ${altKenarlik}`}>
                                                <p className="flex items-center gap-1.5 text-[10px] font-extrabold text-violet-400"><ExclamationCircleIcon className="h-3.5 w-3.5" />Açıklama</p>
                                                <p className={`mt-2 text-[11px] leading-5 ${metinIkincil}`}>{soru.aciklama || "Açıklama bulunmuyor."}</p>
                                                {kaynaklar.length > 0 && (
                                                    <p className={`mt-3 flex items-start gap-1.5 text-[10px] leading-4 ${metinIkincil}`}><DocumentTextIcon className="mt-0.5 h-3.5 w-3.5 shrink-0" />Kaynak: {kaynaklar.join(", ")}</p>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </article>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

export default TestSonucu;

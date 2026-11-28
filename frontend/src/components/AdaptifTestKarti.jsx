import { useEffect, useRef, useState } from "react";
import { InformationCircleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useLocation, useNavigate } from "react-router-dom";
import testlerApi from "../services/testlerApi.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import { testCozmeYolu, testZorlukEtiketi } from "../utils/testlerYardimcilari.mjs";

const seviyeler = {
    yeterli_veri_yok: ["Yeterli Veri Yok", "text-slate-600", "text-slate-300"],
    zayif: ["Zayıf", "text-rose-700", "text-rose-300"],
    gelistirilmeli: ["Geliştirilmeli", "text-amber-800", "text-amber-300"],
    iyi: ["İyi", "text-emerald-700", "text-emerald-300"],
};
const yuzdeBicimi = new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 1 });

export default function AdaptifTestKarti({ dersId, isDark }) {
    const navigate = useNavigate();
    const { hash } = useLocation();
    const kartRef = useRef(null);
    const baslatmaIstegi = useRef(null);
    const [veri, setVeri] = useState(null);
    const [baslatiliyor, setBaslatiliyor] = useState(false);
    const [baslatmaHatasi, setBaslatmaHatasi] = useState("");

    useEffect(() => {
        const controller = new AbortController();
        testlerApi.adaptifOneriGetir(dersId, controller.signal)
            .then(({ data }) => { if (!controller.signal.aborted) setVeri({ oneri: data.oneri }); })
            .catch(hata => {
                if (!controller.signal.aborted) {
                    setVeri({ hata: kullaniciHataMesaji(hata, "Adaptif test önerisi yüklenemedi.") });
                }
            });
        return () => {
            controller.abort();
            baslatmaIstegi.current?.abort();
        };
    }, [dersId]);

    useEffect(() => {
        if (hash === "#adaptif-test") kartRef.current?.scrollIntoView({ block: "start" });
    }, [hash]);

    const baslat = async () => {
        if (!veri?.oneri || baslatmaIstegi.current) return;
        const controller = new AbortController();
        baslatmaIstegi.current = controller;
        setBaslatiliyor(true);
        setBaslatmaHatasi("");
        try {
            const { data } = await testlerApi.adaptifTestBaslat(dersId, controller.signal);
            if (!controller.signal.aborted) navigate(testCozmeYolu(dersId, data.testId));
        } catch (hata) {
            if (!controller.signal.aborted) {
                setBaslatmaHatasi(kullaniciHataMesaji(hata, "Adaptif test başlatılamadı."));
            }
        } finally {
            baslatmaIstegi.current = null;
            if (!controller.signal.aborted) setBaslatiliyor(false);
        }
    };

    const ikincil = isDark ? "text-[#AAB5C8]" : "text-[#64748B]";
    const oneri = veri?.oneri;
    const [seviye, acikRenk, koyuRenk] = seviyeler[oneri?.hakimiyet.durum] || [];
    return <section id="adaptif-test" ref={kartRef} aria-labelledby="adaptif-test-baslik"
        className={`scroll-mt-24 rounded-2xl border p-4 shadow-sm sm:p-5 ${isDark ? "border-violet-500/60 bg-[#111C2E] text-slate-100" : "border-violet-300 bg-white text-slate-900"}`}>
        <header className={`flex items-center gap-3 border-b pb-4 ${isDark ? "border-white/15" : "border-slate-200"}`}>
            <span className={`grid size-11 shrink-0 place-items-center rounded-xl ${isDark ? "bg-violet-500/15 text-violet-300" : "bg-violet-100 text-violet-700"}`}>
                <svg className="size-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 5a2.5 2.5 0 0 0-4.9-.7A3 3 0 0 0 4.5 8a3 3 0 0 0-1 4.8 3 3 0 0 0 2 4.7A3.3 3.3 0 0 0 12 18m0-13a2.5 2.5 0 0 1 4.9-.7A3 3 0 0 1 19.5 8a3 3 0 0 1 1 4.8 3 3 0 0 1-2 4.7A3.3 3.3 0 0 1 12 18m0-13v13M7 9a2 2 0 0 0 2-2m8 2a2 2 0 0 1-2-2M6 14a2 2 0 0 1 2 2m10-2a2 2 0 0 0-2 2" />
                </svg>
            </span>
            <div>
                <h2 id="adaptif-test-baslik" className="text-lg font-bold">Adaptif Test</h2>
                <p className={`text-sm ${ikincil}`}>Performansına göre sana özel test oluştur.</p>
            </div>
        </header>
        {oneri ? <>
            <div className="mt-4">
                <p className={`text-sm ${ikincil}`}>Önerilen Konu</p>
                <p className="mt-1 text-lg font-bold break-words">{oneri.konuBasligi}</p>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
                <div><dt className={`text-sm ${ikincil}`}>Konu Hâkimiyeti</dt>
                    <dd className={`mt-1 font-bold ${isDark ? koyuRenk : acikRenk}`}>
                        {seviye}{oneri.hakimiyet.yuzde !== null && ` · ${yuzdeBicimi.format(oneri.hakimiyet.yuzde / 100)}`}
                    </dd>
                </div>
                <div><dt className={`text-sm ${ikincil}`}>Zorluk Seviyesi</dt>
                    <dd className={`mt-1 font-bold ${oneri.zorluk === "kolay" ? isDark ? "text-emerald-300" : "text-emerald-700" : ""}`}>{testZorlukEtiketi(oneri.zorluk)}</dd>
                </div>
                <div><dt className={`text-sm ${ikincil}`}>Soru Sayısı</dt><dd className="mt-1 font-bold">{oneri.soruSayisi} soru</dd></div>
            </dl>
            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                <p className={`flex min-w-0 flex-1 basis-64 items-start gap-2 text-sm ${ikincil}`}>
                    <InformationCircleIcon className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
                    {oneri.tanilayici
                        ? "Bu konu için yeterli performans verisi bulunmuyor. Seviyeni belirlemek için kısa bir tanılayıcı test öneriyoruz."
                        : "Bu konu, performans analizine göre seçildi."}
                </p>
                <button type="button" disabled={baslatiliyor} onClick={baslat}
                    className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-65">
                    {baslatiliyor ? "Adaptif test hazırlanıyor…" : "Adaptif Test Başlat"}
                    <SparklesIcon className="size-4" aria-hidden="true" />
                </button>
            </div>
            {baslatmaHatasi && <p role="alert" className={`mt-3 text-sm ${isDark ? "text-rose-300" : "text-rose-700"}`}>{baslatmaHatasi}</p>}
        </> : <p role={veri?.hata ? "alert" : "status"} className={`mt-4 text-sm ${ikincil}`}>
            {veri?.hata || (veri ? "Adaptif test için hazır konu haritasında uygun bir alt konu bulunamadı." : "Adaptif test önerisi yükleniyor…")}
        </p>}
    </section>;
}

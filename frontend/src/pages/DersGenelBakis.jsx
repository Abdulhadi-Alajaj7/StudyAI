import { lazy, Suspense } from "react";
import { Link, useOutletContext } from "react-router-dom";
import {
    AcademicCapIcon, ArrowPathIcon, ArrowTrendingUpIcon, ChartBarIcon, ChevronRightIcon,
    ClipboardDocumentListIcon, ClockIcon, InformationCircleIcon, RectangleStackIcon,
    SparklesIcon
} from "@heroicons/react/24/outline";
import { dersDetayYolu } from "../utils/dersDetayYollari.mjs";
import { performansYuzdesi, performansTarihi, performansSayisi as sayiBicimi } from "../utils/dersPerformansSunumu.mjs";
import { testHedefBilgisi, testSonucYolu } from "../utils/testlerYardimcilari.mjs";

const durumlar = {
    iyi: { ad: "İyi", acik: "text-emerald-700", koyu: "text-emerald-300", bar: "bg-emerald-500" },
    gelistirilmeli: { ad: "Geliştirilmeli", acik: "text-amber-800", koyu: "text-amber-300", bar: "bg-amber-400" },
    zayif: { ad: "Zayıf", acik: "text-rose-700", koyu: "text-rose-300", bar: "bg-rose-500" },
    yeterli_veri_yok: { ad: "Yeterli Veri Yok", acik: "text-slate-600", koyu: "text-slate-300" }
};
const turler = { normal: "Normal Test", adaptif: "Adaptif Test", tekrar: "Tekrar Testi" };
const basariRengi = (yuzde, isDark) => durumRengi(yuzde === null ? "yeterli_veri_yok"
    : yuzde < 50 ? "zayif" : yuzde < 80 ? "gelistirilmeli" : "iyi", isDark);
const durumRengi = (durum, isDark) => durumlar[durum][isDark ? "koyu" : "acik"];

function KisaBaglanti({ to, children, vurgu }) {
    return <Link to={to} className={`inline-flex items-center gap-1 rounded-sm text-sm font-semibold hover:underline ${vurgu}`}>
        {children}<ChevronRightIcon aria-hidden="true" className="size-4 shrink-0" />
    </Link>;
}

function BosDurum({ children, ikincil, isDark }) {
    return <div className={`grid min-h-24 place-content-center rounded-xl border border-dashed p-5 text-center text-sm ${ikincil} ${isDark ? "border-[#324562]" : "border-slate-200"}`}>
        {children}
    </div>;
}

const DersPerformansGrafikleri = lazy(() => import("../components/DersPerformansGrafikleri.jsx"));

export default function DersGenelBakis() {
    const { isDark, ders, performans, performansiYenile } = useOutletContext();
    const veri = performans?.veri;
    const ikincil = isDark ? "text-[#B4C2D8]" : "text-slate-600";
    const vurgu = isDark ? "text-violet-300" : "text-violet-700";
    const kart = `min-w-0 rounded-2xl border p-4 sm:p-5 ${isDark ? "border-[#324866] bg-[#111C2E]" : "border-slate-200 bg-white"}`;
    const ayirici = isDark ? "border-[#324562]" : "border-slate-200";
    const zemin = isDark ? "bg-[#0B1526]" : "bg-slate-50";
    const kanal = isDark ? "bg-[#304361]" : "bg-slate-200";
    const yol = segment => dersDetayYolu(ders._id, segment);
    const testSunumu = test => ({
        ...test, tur: turler[test.kaynak] || turler.normal,
        ad: testHedefBilgisi(test, { ...veri.testHedefleri, dersAdi: ders.dersAdi }).baslik
    });
    const genel = veri?.genelHakimiyet;
    const grafik = veri?.basariGelisimi.map((test, index, liste) => ({
        ...testSunumu(test), etiket: `#${veri.tamamlananTestSayisi - liste.length + index + 1}`
    }));
    const ozetler = veri && [
        ["Genel Hâkimiyet", genel.yuzde === null ? "Yeterli Veri Yok" : performansYuzdesi(genel.yuzde),
            `${genel.degerlendirilen} / ${genel.toplam} alt konu değerlendirildi`, AcademicCapIcon, vurgu],
        ["Test Başarısı", performansYuzdesi(veri.testBasarisi), "Doğru cevapların payı", ArrowTrendingUpIcon,
            isDark ? "text-emerald-300" : "text-emerald-700"],
        ["Çözülen Sorular", sayiBicimi.format(veri.soruAnalizi.toplam),
            `Tamamlanan test: ${sayiBicimi.format(veri.tamamlananTestSayisi)}`, ClipboardDocumentListIcon,
            isDark ? "text-sky-300" : "text-sky-700"],
        ["Bugünkü Tekrarlar", sayiBicimi.format(veri.kartlar.bekleyenTekrar), "Bekleyen kart", ClockIcon,
            isDark ? "text-amber-300" : "text-amber-800"]
    ];

    return <section aria-labelledby="ders-performansi" className={`space-y-4 ${isDark ? "text-slate-100" : "text-slate-900"}`}>
        <header className="flex items-start justify-between gap-4">
            <div><h2 id="ders-performansi" className="text-2xl font-extrabold tracking-tight sm:text-3xl">Ders Performansı</h2>
                <p className={`mt-1 text-sm sm:text-base ${ikincil}`}>Öğrenme sürecini analiz et, gelişimini takip et.</p>
            </div>
            <ChartBarIcon aria-hidden="true" className={`mt-1 size-7 shrink-0 ${vurgu}`} />
        </header>
        {performans?.hata ? <div role="alert" className={kart}>
            <p className="font-semibold">{performans.hata}</p>
            <button type="button" onClick={performansiYenile} className={`mt-3 inline-flex items-center gap-2 text-sm font-semibold ${vurgu}`}>
                <ArrowPathIcon className="size-4" aria-hidden="true" /> Yeniden Dene
            </button>
        </div> : !veri ? <div role="status" aria-label="Ders performansı yükleniyor" className="space-y-4">
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                {Array.from({ length: 4 }, (_, index) => <div key={index} className={`h-28 motion-safe:animate-pulse ${kart}`} />)}
            </div>
            <div className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
                <div className={`h-60 motion-safe:animate-pulse ${kart}`} /><div className={`h-60 motion-safe:animate-pulse ${kart}`} />
            </div>
        </div> : <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Ders istatistikleri">
                {ozetler.map(ozet => {
                    const [ad, deger, detay, Icon, renk] = ozet;
                    return <div key={ad} className={kart}>
                    <Icon aria-hidden="true" className={`size-5 ${renk}`} />
                    <p className={`mt-2 text-xs font-medium sm:text-sm ${ikincil}`}>{ad}</p>
                    <p className={`mt-1 break-words font-extrabold tracking-tight tabular-nums ${typeof deger === "string" && deger.endsWith("Yok") ? "text-lg" : "text-2xl sm:text-3xl"} ${renk}`}>{deger}</p>
                    <p className={`mt-1 text-xs ${ikincil}`}>{detay}</p>
                    </div>;
                })}
            </div>
            <Suspense fallback={<div role="status" aria-label="Grafikler yükleniyor" className={`h-60 motion-safe:animate-pulse ${kart}`} />}>
                <DersPerformansGrafikleri kayitlar={grafik} analiz={veri.soruAnalizi} isDark={isDark} kart={kart} ikincil={ikincil}
                    bosDurum={mesaj => <BosDurum ikincil={ikincil} isDark={isDark}>{mesaj}</BosDurum>} />
            </Suspense>
            <section className={kart} aria-labelledby="konu-analizi">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id="konu-analizi" className="text-lg font-bold">Konu Hâkimiyeti Analizi</h3>
                    <KisaBaglanti to={yol("konular")} vurgu={vurgu}>Tüm Konular</KisaBaglanti>
                </div>
                <dl className="my-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {Object.entries(durumlar).map(([kod, durum]) => <div key={kod} className={`flex flex-col-reverse rounded-xl p-2.5 text-center sm:p-3 ${zemin} ${durumRengi(kod, isDark)}`}>
                        <dt className="text-xs font-medium">{durum.ad}</dt>
                        <dd className="text-2xl font-bold tabular-nums">{sayiBicimi.format(veri.konuDurumlari[kod])}</dd>
                    </div>)}
                </dl>
                {veri.oncelikliKonular.length ? <ul className="space-y-3">
                    {veri.oncelikliKonular.map(konu => <li key={konu.konuId}>
                        <div className="flex flex-wrap justify-between gap-x-2 text-sm font-semibold">
                            <span className="min-w-0 break-words">{konu.baslik || "Alt konu"}</span>
                            <span className={durumRengi(konu.durum, isDark)}>
                                {konu.yuzde === null ? durumlar[konu.durum].ad : performansYuzdesi(konu.yuzde)}
                            </span>
                        </div>
                        {konu.yuzde !== null && <div aria-hidden="true" className={`mt-1.5 h-1.5 overflow-hidden rounded-full ${kanal}`}>
                            <div className={`h-full rounded-full ${durumlar[konu.durum].bar}`} style={{ width: `${konu.yuzde}%` }} />
                        </div>}
                    </li>)}
                </ul> : <BosDurum ikincil={ikincil} isDark={isDark}>Konu hâkimiyeti için henüz alt konu bulunmuyor.</BosDurum>}
            </section>
            <div className="grid gap-4 lg:grid-cols-2">
                <section aria-labelledby="adaptif-oneri" className={`flex flex-col ${kart} ${isDark ? "!border-violet-500/65 !bg-[#171A32]" : "!border-violet-200 !bg-violet-50/45"}`}>
                    <h3 id="adaptif-oneri" className="flex items-center gap-2 text-lg font-bold">
                        <SparklesIcon className={`size-5 ${vurgu}`} aria-hidden="true" /> Sana Özel Öneri
                    </h3>
                    {veri.adaptifOneri ? <>
                        <p className={`mt-3 text-sm ${ikincil}`}>Öncelikli çalışman konusu</p>
                        <p className="mt-1 text-lg font-bold break-words">{veri.adaptifOneri.konuBasligi}</p>
                        <p className={`mt-1 text-sm font-medium ${durumRengi(veri.adaptifOneri.hakimiyet.durum, isDark)}`}>
                            Konu Hâkimiyeti · {durumlar[veri.adaptifOneri.hakimiyet.durum].ad}
                            {veri.adaptifOneri.hakimiyet.yuzde !== null && ` · ${performansYuzdesi(veri.adaptifOneri.hakimiyet.yuzde)}`}
                        </p>
                        <p className={`mb-4 mt-2 text-sm ${ikincil}`}>{veri.adaptifOneri.tanilayici
                            ? "Seviyeni belirlemek için bu konuda kısa bir tanılayıcı test çözebilirsin."
                            : "Bu konuyu pekiştirmek için performansına uygun bir adaptif test çözebilirsin."}</p>
                        <Link to={`${yol("testler")}#adaptif-test`} className="mt-auto rounded-xl bg-violet-700 px-4 py-2.5 text-center text-sm font-bold text-white hover:bg-violet-800">Adaptif Test Başlat</Link>
                    </> : <p className={`mt-3 flex items-start gap-2 text-sm ${ikincil}`}>
                        <InformationCircleIcon className="size-5 shrink-0" aria-hidden="true" /> Adaptif öneri, konu haritası hazır olduğunda burada görünecek.
                    </p>}
                </section>
                <section aria-labelledby="kart-ilerlemesi" className={`flex flex-col ${kart}`}>
                    <h3 id="kart-ilerlemesi" className="flex items-center gap-2 text-lg font-bold">
                        <RectangleStackIcon className={`size-5 ${isDark ? "text-sky-300" : "text-sky-700"}`} aria-hidden="true" /> Kart İlerlemesi
                    </h3>
                    <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-2">
                        <p className={`text-sm ${ikincil}`}><b className={`mr-1 text-2xl ${isDark ? "text-slate-100" : "text-slate-900"}`}>{sayiBicimi.format(veri.kartlar.gorulen)}</b> / {sayiBicimi.format(veri.kartlar.toplam)} kart görüntülendi</p>
                        {veri.kartlar.gorulmeYuzdesi !== null && <span className="text-sm font-bold">{performansYuzdesi(veri.kartlar.gorulmeYuzdesi)}</span>}
                    </div>
                    {veri.kartlar.toplam > 0 && <div aria-hidden="true" className={`mt-2 h-2 overflow-hidden rounded-full ${kanal}`}>
                        <div className="h-full rounded-full bg-sky-500" style={{ width: `${veri.kartlar.gorulmeYuzdesi}%` }} />
                    </div>}
                    <dl className="my-3 space-y-1.5 text-sm">
                        {[["Görülmeyen", veri.kartlar.gorulmeyen], ["Yıldızlı", veri.kartlar.yildizli], ["Bekleyen tekrar", veri.kartlar.bekleyenTekrar]].map(([ad, adet]) =>
                            <div className="flex justify-between gap-2" key={ad}><dt className={ikincil}>{ad}</dt><dd className="font-bold">{sayiBicimi.format(adet)}</dd></div>)}
                    </dl>
                    <div className="mt-auto flex flex-wrap gap-2">
                        <Link to={yol("calisma-kartlari")} className={`flex-1 rounded-xl border border-violet-500/60 px-3 py-2.5 text-center text-sm font-bold hover:bg-violet-500/10 ${vurgu}`}>Kartları İncele</Link>
                        {veri.kartlar.bekleyenTekrar > 0 &&
                            <Link to={yol("tekrarlar")} className={`rounded-xl border px-3 py-2.5 text-sm font-semibold hover:underline ${ayirici}`}>Bugünkü Tekrarlar</Link>}
                    </div>
                </section>
            </div>
            <section className={kart} aria-labelledby="son-test-sonuclari">
                <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                    <h3 id="son-test-sonuclari" className="text-lg font-bold">Son Test Sonuçları</h3>
                    <KisaBaglanti to={yol("testler")} vurgu={vurgu}>Tüm Testler</KisaBaglanti>
                </div>
                {veri.sonTestler.length ? <table aria-labelledby="son-test-sonuclari" className="w-full table-fixed text-left text-xs sm:text-sm">
                    <thead className={ikincil}><tr className={`border-b ${ayirici}`}>
                        <th scope="col" className="w-[35%] pb-2 pr-2">Test Adı</th>
                        <th scope="col" className="w-[22%] pb-2 pr-2"><span className="sm:hidden">Tür</span><span className="hidden sm:inline">Test Türü</span></th>
                        <th scope="col" className="w-[25%] break-words pb-2 pr-2"><span className="sm:hidden">Tarih</span><span className="hidden sm:inline">Tamamlanma Tarihi</span></th>
                        <th scope="col" className="pb-2 text-right"><span className="sm:hidden">Başarı</span><span className="hidden sm:inline">Başarı Oranı</span></th>
                    </tr></thead>
                    <tbody>{veri.sonTestler.map(testSunumu).map(test => <tr key={test._id} className={`border-b last:border-0 ${ayirici}`}>
                        <td className="py-3 pr-2 font-semibold break-words"><Link to={testSonucYolu(ders._id, test._id)} className="hover:underline">{test.ad}</Link></td>
                        <td className={`py-3 pr-2 ${ikincil}`}>{test.tur}</td>
                        <td className={`py-3 pr-2 ${ikincil}`}>{performansTarihi(test.tamamlanmaTarihi)}</td>
                        <td className={`py-3 text-right font-bold tabular-nums ${basariRengi(test.basari, isDark)}`}>{performansYuzdesi(test.basari)}</td>
                    </tr>)}</tbody>
                </table> : <BosDurum ikincil={ikincil} isDark={isDark}>Bu derste henüz tamamlanmış test yok.</BosDurum>}
            </section>
        </>}
    </section>;
}

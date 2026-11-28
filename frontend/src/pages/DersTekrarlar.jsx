import { useEffect, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, MinusCircleIcon } from "@heroicons/react/24/outline";
import CalismaKartiYuzleri from "../components/CalismaKartiYuzleri.jsx";
import api from "../services/calismaKartlariApi.mjs";
import { dersDetayYolu } from "../utils/dersDetayYollari.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";

const zorluklar = [
    ["zor", "Zor", "border-rose-400/65 text-rose-700 hover:bg-rose-50", "border-rose-400/65 text-rose-300 hover:bg-rose-500/10"],
    ["orta", "Orta", "border-amber-500/65 text-amber-800 hover:bg-amber-50", "border-amber-400/65 text-amber-300 hover:bg-amber-500/10"],
    ["kolay", "Kolay", "border-emerald-500/65 text-emerald-700 hover:bg-emerald-50", "border-emerald-400/65 text-emerald-300 hover:bg-emerald-500/10"],
];

function TekrarOturumu({ dersId, isDark }) {
    const [veri, setVeri] = useState(null);
    const [index, setIndex] = useState(0);
    const [cevapAcik, setCevapAcik] = useState(false);
    const [hata, setHata] = useState("");
    const [yenileme, setYenileme] = useState(0);
    const [kaydediliyor, setKaydediliyor] = useState(false);
    const istekRef = useRef(null);
    const panel = isDark ? "border-[#263653] bg-[#111D31]" : "border-[#E2E8F0] bg-white";
    const ikincil = isDark ? "text-[#92A7C5]" : "text-[#64748B]";

    useEffect(() => {
        const controller = new AbortController();
        api.tekrarlariGetir(dersId, controller.signal)
            .then(({ data }) => { if (!controller.signal.aborted) setVeri(data); })
            .catch(e => {
                if (!controller.signal.aborted) setHata(kullaniciHataMesaji(e, "Tekrarlar yüklenemedi."));
            });
        return () => {
            controller.abort();
            istekRef.current?.abort();
        };
    }, [dersId, yenileme]);

    const kartlar = veri?.kartlar ?? [];
    const aktif = kartlar[index];

    const ilerle = () => {
        if (istekRef.current || !aktif) return;
        setIndex((index + 1) % kartlar.length);
        setCevapAcik(false);
        setHata("");
    };

    const kaydet = async (degisiklik, islem) => {
        if (!aktif || istekRef.current) return false;
        const controller = new AbortController();
        istekRef.current = controller;
        setKaydediliyor(true);
        setHata("");
        const surum = aktif.__v ?? 0;
        const siradakiId = kartlar[(index + 1) % kartlar.length]?._id;
        const listeyiUygula = data => {
            setVeri(data);
            setIndex(Math.max(0, data.kartlar.findIndex(kart => kart._id === siradakiId)));
            setCevapAcik(false);
        };
        try {
            const { data } = islem === "sifirla"
                ? await api.tekrariSifirla(dersId, aktif._id, surum, controller.signal)
                : await api.durumuGuncelle(dersId, aktif._id, { ...degisiklik, ...(islem === "degerlendir" && { surum }) }, controller.signal);
            if (controller.signal.aborted) return false;
            if (!islem) {
                const { goruldu, yildizli } = data.kart;
                setVeri({ ...veri, kartlar: kartlar.map(kart => kart._id === aktif._id ? { ...kart, goruldu, yildizli } : kart) });
                return true;
            }

            const kalan = kartlar.filter(kart => kart._id !== aktif._id);
            const tamamlanan = veri.tamamlanan + (islem === "degerlendir" ? 1 : 0);
            listeyiUygula({ kartlar: kalan, bekleyen: kalan.length, tamamlanan, toplam: kalan.length + tamamlanan });
            const guncel = await api.tekrarlariGetir(dersId, controller.signal).catch(() => null);
            if (!controller.signal.aborted && guncel) listeyiUygula(guncel.data);
            return true;
        } catch (e) {
            if (controller.signal.aborted) return false;
            setHata(kullaniciHataMesaji(e, "Kart güncellenemedi. Yeniden deneyin."));
            if (e.response?.status === 409) {
                const guncel = await api.tekrarlariGetir(dersId, controller.signal).catch(() => null);
                if (guncel && !controller.signal.aborted) {
                    const mevcutIndex = guncel.data.kartlar.findIndex(kart => kart._id === aktif._id);
                    if (mevcutIndex >= 0) { setVeri(guncel.data); setIndex(mevcutIndex); }
                    else listeyiUygula(guncel.data);
                }
            }
            return false;
        } finally {
            istekRef.current = null;
            if (!controller.signal.aborted) setKaydediliyor(false);
        }
    };

    const cevir = async () => {
        if (!aktif || istekRef.current) return;
        if (!cevapAcik && !aktif.goruldu && !(await kaydet({ goruldu: true }))) return;
        setCevapAcik(acik => !acik);
    };

    return <section aria-labelledby="tekrarlar-baslik" className={`mx-auto max-w-5xl space-y-5 ${isDark ? "text-[#F8FAFC]" : "text-[#0F172A]"}`}>
        <header>
            <Link to={dersDetayYolu(dersId, "calisma-kartlari")} className="mb-4 inline-flex items-center gap-2 text-sm font-semibold hover:underline">
                <ArrowLeftIcon aria-hidden="true" className="size-4" /> Çalışma Kartlarına Dön
            </Link>
            <h1 id="tekrarlar-baslik" className="text-2xl font-bold sm:text-3xl">Bugünkü Tekrarlar</h1>
            <p className={`mt-1 text-sm ${ikincil}`}>Tekrar zamanı gelen çalışma kartlarını gözden geçir.</p>
        </header>

        {hata && <div role="alert" className={`rounded-xl border p-4 text-sm ${panel}`}>
            {hata}
            {!veri && <button type="button" className="ml-3 font-semibold underline" onClick={() => {
                setHata(""); setYenileme(n => n + 1);
            }}>Yeniden Dene</button>}
        </div>}
        {!veri && !hata && <p role="status" className={ikincil}>Tekrarlar yükleniyor...</p>}

        {veri && <>
            <dl className="grid grid-cols-3 gap-2 sm:gap-3">
                {[
                    ["Bekleyen", veri.bekleyen, isDark ? "text-amber-300" : "text-amber-800"],
                    ["Tamamlanan", veri.tamamlanan, isDark ? "text-emerald-300" : "text-emerald-700"],
                    ["Toplam", veri.toplam, isDark ? "text-violet-300" : "text-violet-700"],
                ].map(([baslik, sayi, renk]) => <div key={baslik} className={`min-w-0 rounded-2xl border p-2.5 sm:p-4 ${panel}`}>
                    <dt className="text-xs break-words sm:text-sm">{baslik}</dt>
                    <dd className={`mt-1 text-2xl font-bold tabular-nums ${renk}`}>{sayi}</dd>
                </div>)}
            </dl>
            <div>
                <div className="mb-2 flex justify-between gap-2 text-sm font-medium">
                    <span id="tekrar-ilerlemesi">Tekrar İlerlemesi</span>
                    <span className="tabular-nums">{veri.tamamlanan} / {veri.toplam}</span>
                </div>
                <div className={`h-2 overflow-hidden rounded-full ${isDark ? "bg-[#304160]" : "bg-slate-200"}`}
                    role="progressbar" aria-labelledby="tekrar-ilerlemesi" aria-valuemax={veri.toplam || 1} aria-valuenow={veri.tamamlanan}>
                    <div className="h-full rounded-full bg-violet-500" style={{ width: veri.toplam ? `${100 * veri.tamamlanan / veri.toplam}%` : "0%" }} />
                </div>
            </div>
            {aktif ? <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 break-words">{aktif.konuBasligi || "Ders Çalışma Kartı"}</span>
                    <span className={`font-semibold ${isDark ? "text-violet-300" : "text-violet-700"}`}>Seviye {aktif.tekrarSeviyesi ?? 1}</span>
                </div>
                <CalismaKartiYuzleri key={aktif._id} aktif={aktif} cevapAcik={cevapAcik} kaydediliyor={kaydediliyor}
                    cevir={cevir} yildizDegistir={() => kaydet({ yildizli: !aktif.yildizli })} panel={panel} ikincil={ikincil} />
                {cevapAcik && <div className="grid grid-cols-3 gap-2 sm:gap-3" role="group" aria-label="Tekrar değerlendirmesi">
                    {zorluklar.map(([kod, ad, acik, koyu]) => <button key={kod} type="button" disabled={kaydediliyor}
                        onClick={() => kaydet({ zorluk: kod, goruldu: true }, "degerlendir")}
                        className={`rounded-xl border px-2 py-3 text-sm font-semibold disabled:opacity-50 sm:text-base ${isDark ? koyu : acik}`}>
                        {ad}<span className={`mt-0.5 block text-xs font-medium ${ikincil}`}>{aktif.tekrarSureleri[kod]} gün</span>
                    </button>)}
                </div>}
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm font-medium">
                    <button type="button" disabled={kaydediliyor} onClick={() => kaydet({}, "sifirla")}
                        className="inline-flex items-center gap-2 hover:underline disabled:opacity-50">
                        <MinusCircleIcon aria-hidden="true" className="size-4" /> Tekrar Listesinden Çıkar
                    </button>
                    <button type="button" disabled={kaydediliyor || (kartlar.length === 1 && !cevapAcik)} onClick={ilerle}
                        className={`ml-auto inline-flex items-center gap-2 hover:underline disabled:opacity-50 ${isDark ? "text-violet-300" : "text-violet-700"}`}>
                        Sonraki Kart <ArrowRightIcon aria-hidden="true" className="size-4" />
                    </button>
                </div>
            </> : <div role="status" className={`rounded-2xl border p-8 text-center ${panel}`}>
                {veri.tamamlanan > 0 && <CheckCircleIcon aria-hidden="true" className="mx-auto mb-2 size-8 text-emerald-500" />}
                <p className="font-semibold">{veri.tamamlanan ? "Bugünkü tekrarlarını tamamladın." : "Bugün tekrar edilecek kartın yok."}</p>
            </div>}
        </>}
    </section>;
}

export default function DersTekrarlar() {
    const { dersId } = useParams();
    const { isDark } = useOutletContext();
    return <TekrarOturumu key={dersId} dersId={dersId} isDark={isDark} />;
}

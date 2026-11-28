import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { ArrowPathIcon, CheckCircleIcon, ChevronDownIcon, InformationCircleIcon, MinusCircleIcon, XCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import api from "../api.js";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import { testCozmeYolu } from "../utils/testlerYardimcilari.mjs";

const durumlar = {
    duzeltildi: { etiket: "Düzeltildi", baslik: "Düzeltilen", Simge: CheckCircleIcon,
        renk: "bg-emerald-50 text-emerald-700", koyu: "bg-emerald-400/12 text-emerald-300" },
    bos: { etiket: "Boş", baslik: "Boş Bırakılan", Simge: MinusCircleIcon,
        renk: "bg-amber-50 text-amber-800", koyu: "bg-amber-400/12 text-amber-300" },
    yanlis: { etiket: "Yanlış", baslik: "Yanlış Cevaplar", Simge: XCircleIcon,
        renk: "bg-red-50 text-red-700", koyu: "bg-red-400/12 text-red-300" },
};
const sekmeler = [["", "Tümü"], ["yanlis", "Yanlış"], ["bos", "Boş"], ["duzeltildi", "Düzeltilen"]];
const zorluklar = { kolay: "Kolay", orta: "Orta", zor: "Zor" };
const tarihBicimi = new Intl.DateTimeFormat("tr-TR", { dateStyle: "long" });
const konuAnahtari = soru => `${soru.dersId}:${soru.konuId}`;
const SORU_SINIRI = 20;

function SoruKarti({ soru, secili, kapali, sec, isDark, kart, ikincil, vurgu, dersiGoster }) {
    const durum = durumlar[soru.durum];
    const meta = [zorluklar[soru.zorluk], soru.tarih && tarihBicimi.format(new Date(soru.tarih))].filter(Boolean).join(" · ");
    return <article className={`rounded-2xl border p-4 sm:px-6 ${kart}`}>
        <div className="flex items-start gap-3 sm:gap-6">
            <span className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold ${isDark ? durum.koyu : durum.renk}`}>{durum.etiket}</span>
            <div className="min-w-0 flex-1 sm:text-right">
                <p className={`text-sm break-words ${vurgu}`}>{soru.konuBasligi || "Konu belirtilmemiş"}{dersiGoster && ` · ${soru.dersAdi}`}</p>
                <h2 className="mt-1 text-base font-semibold break-words sm:text-lg">{soru.metin}</h2>
                {meta && <p className={`mt-1 text-xs ${ikincil}`}>{meta}</p>}
            </div>
            <input type="checkbox" aria-label={`Soruyu seç: ${soru.metin}`} checked={secili} disabled={kapali}
                onChange={sec} className="mt-0.5 size-5 shrink-0 cursor-pointer accent-violet-600 disabled:cursor-not-allowed" />
        </div>
        <details className="group mt-2">
            <summary className={`flex w-fit cursor-pointer list-none items-center gap-2 text-sm font-semibold ${vurgu}`}>
                <ChevronDownIcon className="size-4 group-open:rotate-180" aria-hidden="true" /> Soruyu İncele
            </summary>
            <div className={`mt-3 grid gap-3 border-t pt-3 text-sm ${isDark ? "border-[#34445F]" : "border-[#E2E8F0]"}`}>
                <ul className="grid gap-1">
                    {soru.secenekler.map(secenek => <li key={secenek.anahtar} className="break-words"><strong>{secenek.anahtar}.</strong> {secenek.metin}</li>)}
                </ul>
                <p><strong>Doğru cevap</strong> {soru.dogruCevap} <span className="mx-1" aria-hidden="true">·</span> <strong>Cevabın</strong> {soru.ogrenciCevabi ?? "Boş bırakıldı"}</p>
                {soru.aciklama && <p className="break-words"><strong>Açıklama</strong> {soru.aciklama}</p>}
                {!!soru.kaynakAdlari.length && <p className={`break-words ${ikincil}`}><strong>Kaynak</strong> {soru.kaynakAdlari.join(", ")}</p>}
            </div>
        </details>
    </article>;
}

function Yanlislarim() {
    const { isDark } = useOutletContext();
    const navigate = useNavigate();
    const [sorular, setSorular] = useState(null);
    const [listeHatasi, setListeHatasi] = useState("");
    const [olusturmaHatasi, setOlusturmaHatasi] = useState("");
    const [dersId, setDersId] = useState("");
    const [konu, setKonu] = useState("");
    const [durum, setDurum] = useState("");
    const [secim, setSecim] = useState([]);
    const [olusturuluyor, setOlusturuluyor] = useState(false);
    const olusturmaIstekRef = useRef(null);

    useEffect(() => {
        const controller = new AbortController();
        api.get("/yanlislarim", { withCredentials: true, signal: controller.signal })
            .then(({ data }) => { if (!controller.signal.aborted) setSorular(data.sorular); })
            .catch(hata => {
                if (!controller.signal.aborted) setListeHatasi(kullaniciHataMesaji(hata, "Yanlışlarım listesi yüklenemedi."));
            });
        return () => {
            controller.abort();
            olusturmaIstekRef.current?.abort();
        };
    }, []);

    const liste = sorular ?? [];
    const dersler = new Map(liste.map(soru => [soru.dersId, soru.dersAdi]));
    const dersSorulari = liste.filter(soru => !dersId || soru.dersId === dersId);
    const konular = new Map(dersSorulari.filter(soru => soru.konuId).map(soru => [
        konuAnahtari(soru), dersId || dersler.size === 1 ? soru.konuBasligi || soru.konuId
            : `${soru.konuBasligi || soru.konuId} · ${soru.dersAdi}`
    ]));
    const gorunen = dersSorulari.filter(soru => (!konu || konuAnahtari(soru) === konu) && (!durum || soru.durum === durum));
    const sayilar = { duzeltildi: 0, bos: 0, yanlis: 0 };
    gorunen.forEach(soru => { sayilar[soru.durum]++; });

    const gorunenDersler = new Set(gorunen.map(soru => soru.dersId));
    const hedefDers = secim[0]?.dersId || (gorunenDersler.size === 1 ? gorunen[0].dersId : "");
    const secilebilir = gorunen.filter(soru => soru.dersId === hedefDers);
    const topluSecim = secilebilir.slice(0, SORU_SINIRI);
    const seciliIds = new Set(secim.map(soru => soru.soruId));
    const tumuSecili = topluSecim.length > 0 && topluSecim.every(soru => seciliIds.has(soru.soruId));
    const secimiTemizle = () => { setSecim([]); setOlusturmaHatasi(""); };
    const soruSec = soru => {
        setOlusturmaHatasi("");
        setSecim(onceki => onceki.some(kayit => kayit.soruId === soru.soruId)
            ? onceki.filter(kayit => kayit.soruId !== soru.soruId)
            : [...onceki, soru]);
    };
    const tekrarOlustur = async () => {
        if (!secim.length || olusturmaIstekRef.current) return;
        const controller = new AbortController();
        olusturmaIstekRef.current = controller;
        setOlusturuluyor(true);
        setOlusturmaHatasi("");
        try {
            const { data } = await api.post("/yanlislarim/tekrar-testleri", {
                dersId: secim[0].dersId, soruIds: secim.map(soru => soru.soruId)
            }, { withCredentials: true, signal: controller.signal });
            if (!controller.signal.aborted) navigate(testCozmeYolu(data.dersId, data.testId));
        } catch (hata) {
            if (!controller.signal.aborted) setOlusturmaHatasi(kullaniciHataMesaji(hata, "Tekrar testi oluşturulamadı."));
        } finally {
            olusturmaIstekRef.current = null;
            if (!controller.signal.aborted) setOlusturuluyor(false);
        }
    };

    const kart = isDark ? "border-[#34445F] bg-[#141E32]" : "border-[#E2E8F0] bg-white";
    const ikincil = isDark ? "text-[#B8C3D8]" : "text-slate-600";
    const vurgu = isDark ? "text-violet-300" : "text-violet-700";
    const alan = `mt-1.5 w-full rounded-xl border px-3 py-2.5 text-sm ${isDark ? "border-[#40506E] bg-[#10182A]" : "border-[#CBD5E1] bg-white"}`;

    return <section aria-labelledby="yanlislarim-baslik" className={`mx-auto max-w-5xl space-y-5 ${isDark ? "text-slate-100 [color-scheme:dark]" : "text-slate-900"}`}>
        <header className="flex items-start justify-between gap-3">
            <div className="sm:ml-auto sm:text-right">
                <h1 id="yanlislarim-baslik" className="text-2xl font-bold sm:text-3xl">Yanlışlarım</h1>
                <p className={`mt-1 text-sm ${ikincil}`}>Hatalarından öğren, eksiklerini tamamlama</p>
            </div>
            <Link to="/panel" aria-label="Yanlışlarım sayfasını kapat" className={`shrink-0 rounded-xl border border-violet-500/35 p-2 ${vurgu}`}>
                <XMarkIcon className="size-5" aria-hidden="true" />
            </Link>
        </header>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {Object.entries(durumlar).map(([kod, durumBilgisi]) => {
                const { baslik, Simge, renk, koyu } = durumBilgisi;
                return <div key={kod} className={`flex flex-col justify-between gap-2 rounded-2xl border p-2.5 min-[480px]:flex-row min-[480px]:p-4 ${kart}`}>
                    <Simge className={`size-6 rounded-full sm:size-8 ${isDark ? koyu : renk}`} aria-hidden="true" />
                    <div className="min-w-0 min-[480px]:text-right">
                        <p className={`w-fit rounded-md px-1 text-xl font-bold tabular-nums min-[480px]:ml-auto sm:text-2xl ${isDark ? koyu : renk}`}>{sorular ? sayilar[kod] : "—"}</p>
                        <p className={`mt-1 text-xs sm:text-sm ${ikincil}`}>{baslik}</p>
                    </div>
                </div>;
            })}
        </div>
        <div className={`grid gap-4 rounded-2xl border p-4 sm:grid-cols-2 sm:px-6 ${kart}`}>
            <label className="min-w-0 text-sm font-medium">Konu
                <select className={alan} value={konu} disabled={olusturuluyor}
                    onChange={e => { setKonu(e.target.value); secimiTemizle(); }}>
                    <option value="">Tüm Konular</option>
                    {[...konular].map(([id, baslik]) => <option key={id} value={id}>{baslik}</option>)}
                </select>
            </label>
            <label className="min-w-0 text-sm font-medium">Ders
                <select className={alan} value={dersId} disabled={olusturuluyor}
                    onChange={e => { setDersId(e.target.value); setKonu(""); secimiTemizle(); }}>
                    <option value="">Tüm Dersler</option>
                    {[...dersler].map(([id, ad]) => <option key={id} value={id}>{ad}</option>)}
                </select>
            </label>
            <div className="flex flex-wrap justify-center gap-1 sm:col-span-2" role="group" aria-label="Soru durumu">
                {sekmeler.map(([kod, ad]) => <button key={kod} type="button" aria-pressed={durum === kod} disabled={olusturuluyor}
                    className={`rounded-full px-3 py-1.5 text-sm font-medium sm:px-5 ${durum === kod ? "bg-violet-600 text-white" : ikincil}`}
                    onClick={() => { if (durum !== kod) { setDurum(kod); secimiTemizle(); } }}>
                    {ad}
                </button>)}
            </div>
        </div>
        {listeHatasi ? <p role="alert">{listeHatasi}</p>
            : !sorular ? <p role="status" className={ikincil}>Sorular yükleniyor…</p>
            : !gorunen.length ? <p role="status" className={`rounded-2xl border p-6 text-center ${kart}`}>
                {liste.length ? "Bu filtrelere uygun soru bulunamadı." : "Yanlış veya boş bırakılmış sorun yok."}
            </p>
            : <>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span aria-live="polite"><strong>{secim.length}</strong> soru seçildi</span>
                    <label className="flex items-center gap-2 font-semibold">
                        {secilebilir.length > SORU_SINIRI ? "İlk 20 Soruyu Seç" : "Tümünü Seç"}
                        <input type="checkbox" checked={tumuSecili} disabled={olusturuluyor || !hedefDers} className="size-5 accent-violet-600"
                            onChange={e => { setSecim(e.target.checked ? topluSecim : []); setOlusturmaHatasi(""); }} />
                    </label>
                    {!hedefDers && <p className={`w-full text-xs ${ikincil}`}>Toplu seçim için bir ders seç.</p>}
                    {secim.length === SORU_SINIRI && <p className={`w-full text-xs ${ikincil}`}>Bir tekrar testinde en fazla 20 soru seçebilirsin.</p>}
                </div>
                <div className="grid gap-3">
                    {gorunen.map(soru => <SoruKarti key={soru.soruId} soru={soru} secili={seciliIds.has(soru.soruId)}
                        kapali={olusturuluyor || (!seciliIds.has(soru.soruId) && (secim.length >= SORU_SINIRI || (secim.length > 0 && soru.dersId !== hedefDers)))}
                        sec={() => soruSec(soru)} isDark={isDark} kart={kart} ikincil={ikincil} vurgu={vurgu} dersiGoster={!dersId} />)}
                </div>
            </>}
        <footer className={`flex flex-wrap items-start justify-between gap-3 border-t pt-4 ${isDark ? "border-[#34445F]" : "border-[#E2E8F0]"}`}>
            <button type="button" disabled={!secim.length || olusturuluyor} onClick={tekrarOlustur}
                className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50">
                <ArrowPathIcon className="size-5" aria-hidden="true" /> {olusturuluyor ? "Tekrar testi oluşturuluyor…" : "Tekrar Testi Oluştur"}
            </button>
            <div className="flex flex-col gap-1 sm:text-right">
                <p className="text-sm font-semibold">{secim.length} soru seçildi</p>
                <p className={`flex items-center gap-1.5 text-xs sm:justify-end ${ikincil}`}>
                    <InformationCircleIcon className="size-4 shrink-0" aria-hidden="true" /> Tekrar testleri konu hâkimiyet puanını etkilemez.
                </p>
            </div>
            {olusturmaHatasi && <p role="alert" className={`w-full text-sm ${isDark ? "text-red-300" : "text-red-700"}`}>{olusturmaHatasi}</p>}
        </footer>
    </section>;
}

export default Yanlislarim;

import { useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { ArrowPathIcon, ArrowLeftIcon, ArrowRightIcon, CheckCircleIcon, ClockIcon, EyeIcon, RectangleStackIcon, SparklesIcon, StarIcon } from "@heroicons/react/24/outline";
import { StarIcon as DoluYildizIcon } from "@heroicons/react/24/solid";
import kartlarApi from "../services/calismaKartlariApi.mjs";
import { istemciIstekIdOlustur } from "../utils/sohbetYardimcilari.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import { acikKartiKoru, kartDurumunuUygula, kartGorunumleri, kartKonulariniGrupla, kartlariFiltrele, kartKonuDurumMesaji } from "../utils/calismaKartlariYardimcilari.mjs";
import "./DersCalismaKartlari.css";

const degerlendirmeler = [
    { kod: "tekrar", baslik: "Tekrar", aciklama: "Cevabı hatırlayamadım", renk: "text-rose-400 border-rose-400/30 hover:bg-rose-400/10" },
    { kod: "zor", baslik: "Zor", aciklama: "Zor hatırladım", renk: "text-orange-400 border-orange-400/30 hover:bg-orange-400/10" },
    { kod: "orta", baslik: "Orta", aciklama: "Normal şekilde hatırladım", renk: "text-sky-400 border-sky-400/30 hover:bg-sky-400/10" },
    { kod: "kolay", baslik: "Kolay", aciklama: "Kolay hatırladım", renk: "text-emerald-400 border-emerald-400/30 hover:bg-emerald-400/10" },
];

function KonuPaneli({ gruplar, secim, kartSayisi, kaydediliyor, tema, ana, ikincil, onSec }) {
    const [acik, setAcik] = useState(false);
    return <aside className={`rounded-2xl border p-4 ${tema}`} aria-label="Kart konuları">
        <div className="flex items-center justify-between gap-3">
            <h3 className={`px-2 text-xs font-bold uppercase tracking-wider ${ikincil}`}>Konular</h3>
            <button type="button" onClick={() => setAcik(v => !v)} aria-expanded={acik} className="rounded-lg px-2 py-1 text-xs font-semibold text-violet-500 lg:hidden">{acik ? "Kapat" : "Konuları seç"}</button>
        </div>
        <div className={`${acik ? "block" : "hidden"} mt-3 lg:block`}>
            <button type="button" disabled={kaydediliyor} onClick={() => onSec({ konuId: "", anaKonuId: "" })} className={`flex w-full justify-between rounded-xl px-3 py-2.5 text-sm ${!secim.konuId && !secim.anaKonuId ? "bg-violet-500/15 text-violet-500" : ikincil}`}>Tüm konular<span>{kartSayisi}</span></button>
            <div className="mt-2 max-h-64 space-y-3 overflow-y-auto lg:max-h-[560px]">
                {gruplar.map(grup => <div key={grup.konuId}>
                    <button type="button" disabled={kaydediliyor} onClick={() => onSec({ anaKonuId: grup.konuId, konuId: "" })} className={`flex w-full items-start justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm font-semibold ${secim.anaKonuId === grup.konuId ? "text-violet-500" : ana}`}><span>{grup.baslik}</span><span className={`text-xs ${ikincil}`}>{grup.kartSayisi}</span></button>
                    {grup.altKonular.filter(alt => alt.konuId !== grup.konuId).map(alt => <button type="button" key={alt.konuId} disabled={kaydediliyor} onClick={() => onSec({ konuId: alt.konuId, anaKonuId: "" })} className={`mt-1 flex w-full items-start justify-between gap-2 rounded-lg py-2 pl-6 pr-3 text-left text-xs ${secim.konuId === alt.konuId ? "bg-violet-500/10 text-violet-500" : ikincil}`}><span>{alt.baslik}</span><span>{alt.kartSayisi}</span></button>)}
                </div>)}
            </div>
        </div>
    </aside>;
}

function KartlarIcerigi({ dersId, isDark }) {
    const [veri, setVeri] = useState(null);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [hata, setHata] = useState("");
    const [uretimHatasi, setUretimHatasi] = useState("");
    const [yenileme, setYenileme] = useState(0);
    const [baslatiliyor, setBaslatiliyor] = useState(false);
    const [calismaAcik, setCalismaAcik] = useState(false);
    const [secim, setSecim] = useState({ gorunum: "tum", konuId: "", anaKonuId: "" });
    const [aktifKartId, setAktifKartId] = useState("");
    const [cevrili, setCevrili] = useState(false);
    const [kaydediliyor, setKaydediliyor] = useState(false);
    const [bildirim, setBildirim] = useState("");
    const [kayitHatasi, setKayitHatasi] = useState("");
    const [tekrarEylemi, setTekrarEylemi] = useState(null);
    const okumaRef = useRef(null), yazmalarRef = useRef(new Set());
    const kayitSurumuRef = useRef(0);
    const mesgulRef = useRef(false), baslatRef = useRef(false), yeniUretimRef = useRef(false);

    useEffect(() => {
        const controller = new AbortController(); okumaRef.current = controller;
        let timer;
        const yukle = async () => {
            try {
                const surum = kayitSurumuRef.current;
                const sonuc = await kartlarApi.getir(dersId, controller.signal);
                if (controller.signal.aborted) return;
                if (mesgulRef.current || surum !== kayitSurumuRef.current) { timer = setTimeout(yukle, 2500); return; }
                setVeri(sonuc.data); setHata("");
                if (["olusturuluyor", "hazir"].includes(sonuc.data.durum)) setUretimHatasi("");
                if (sonuc.data.durum === "hazir" && !yeniUretimRef.current) setCalismaAcik(true);
                if (sonuc.data.durum === "olusturuluyor") timer = setTimeout(yukle, 2500);
            } catch (err) {
                if (!controller.signal.aborted) setHata(kullaniciHataMesaji(err, "Kartlar yüklenemedi. Yeniden deneyin."));
            } finally { if (!controller.signal.aborted) setYukleniyor(false); }
        };
        void yukle();
        return () => { controller.abort(); clearTimeout(timer); };
    }, [dersId, yenileme]);
    useEffect(() => {
        const yazmalar = yazmalarRef.current;
        return () => { for (const c of yazmalar) c.abort(); yazmalar.clear(); };
    }, []);

    const tema = isDark ? "border-[#26334A] bg-[#111D31]" : "border-[#E4E7EF] bg-white";
    const ana = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const ikincil = isDark ? "text-[#94A3B8]" : "text-[#64748B]";
    const buton = "inline-flex items-center justify-center gap-2 rounded-xl bg-[#7564F7] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#6553E6] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-50";
    const kartlar = veri?.kartlar || [];
    const gruplar = useMemo(() => kartKonulariniGrupla(veri?.konular || []), [veri?.konular]);
    const secili = kartlar.find(k => k._id === aktifKartId);
    const liste = acikKartiKoru(kartlariFiltrele(kartlar, secim, veri?.konular), secili);
    const kart = secili || liste[0];
    const sira = kart ? liste.findIndex(k => k._id === kart._id) : -1;
    const konu = veri?.konular.find(k => k.konuId === kart?.konuId);
    const uretiliyor = veri?.durum === "olusturuluyor" || baslatiliyor;
    const eksik = ["kismi", "hata"].includes(veri?.durum);
    const saltOkunur = veri?.kaynakGuncel === false;

    const olustur = async () => {
        if (baslatRef.current || uretiliyor || veri?.olusturulabilir === false) return;
        baslatRef.current = true; yeniUretimRef.current = true;
        setBaslatiliyor(true); setUretimHatasi(""); okumaRef.current?.abort();
        const controller = new AbortController(); yazmalarRef.current.add(controller);
        try {
            const sonuc = await kartlarApi.olustur(dersId, controller.signal);
            if (!controller.signal.aborted) setVeri(sonuc.data);
        } catch (err) { if (!controller.signal.aborted) setUretimHatasi(kullaniciHataMesaji(err)); }
        finally {
            yazmalarRef.current.delete(controller); baslatRef.current = false;
            if (!controller.signal.aborted) { setBaslatiliyor(false); setYenileme(v => v + 1); }
        }
    };
    const kaydet = async eylem => {
        if (mesgulRef.current || saltOkunur) return;
        mesgulRef.current = true; kayitSurumuRef.current += 1; setKaydediliyor(true); setKayitHatasi(""); setBildirim("");
        const controller = new AbortController(); yazmalarRef.current.add(controller);
        try {
            const sonuc = eylem.tur === "degerlendirme"
                ? await kartlarApi.degerlendir(dersId, eylem.kartId, eylem.girdi, controller.signal)
                : await kartlarApi.durumKaydet(dersId, eylem.kartId, eylem.girdi, controller.signal);
            if (controller.signal.aborted) return;
            if (eylem.tur === "durum") setVeri(v => kartDurumunuUygula(v, eylem.kartId, sonuc.data.durum));
            else setBildirim("Değerlendirmeniz kaydedildi.");
            setTekrarEylemi(null);
        } catch (err) {
            if (!controller.signal.aborted) { setKayitHatasi(kullaniciHataMesaji(err, "Kaydınız tamamlanamadı. Yeniden deneyin.")); setTekrarEylemi(eylem); }
        } finally {
            yazmalarRef.current.delete(controller); mesgulRef.current = false; kayitSurumuRef.current += 1;
            if (!controller.signal.aborted) setKaydediliyor(false);
        }
    };
    const cevir = () => {
        if (!kart || kaydediliyor) return;
        setCevrili(v => !v); setAktifKartId(kart._id); setBildirim("");
        if (!cevrili && !kart.goruldu && !saltOkunur) void kaydet({ tur: "durum", kartId: kart._id, girdi: { goruldu: true } });
    };
    const gorunumuSec = yeni => { setSecim(s => ({ ...s, ...yeni })); setAktifKartId(""); setCevrili(false); setBildirim(""); };
    const ilerle = miktar => {
        const hedef = liste[sira + miktar]; if (!hedef) return;
        setAktifKartId(hedef._id); setCevrili(false); setBildirim("");
    };

    return <section className={`calisma-kartlari space-y-6 ${ana}`} aria-label="Çalışma kartları">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3"><div className="rounded-2xl bg-violet-500/15 p-3 text-violet-400"><RectangleStackIcon className="h-7 w-7" /></div><div><h2 className="text-2xl font-bold tracking-tight">Çalışma Kartları</h2><p className={`mt-1 text-sm ${ikincil}`}>Konularını hatırla, bilgini pekiştir.</p></div></div>
            <div className={`flex items-center gap-3 rounded-xl border px-4 py-3 ${tema}`}><ClockIcon className="h-5 w-5 text-violet-400" /><div><h3 className="text-sm font-semibold">Bugünkü Tekrarlar</h3><p className={`mt-1 text-xs ${ikincil}`}>Tekrar planlaması henüz etkin değil.</p></div><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${ikincil}`}>YAKINDA</span></div>
        </header>
        {(hata || uretimHatasi) && <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-400"><span>{hata || uretimHatasi}</span><button type="button" onClick={() => setYenileme(v => v + 1)} className="font-semibold underline">Yeniden dene</button></div>}
        {yukleniyor && <div role="status" className={`flex min-h-64 items-center justify-center gap-3 ${ikincil}`}><ArrowPathIcon className="h-5 w-5 animate-spin motion-reduce:animate-none" />Kartlar yükleniyor...</div>}
        {!yukleniyor && veri && <>
            {saltOkunur && <div role="alert" className="rounded-xl border border-amber-400/25 bg-amber-400/10 p-4 text-sm">{veri.engelMesaji}</div>}
            {veri.konular.length > 0 && <details className={`rounded-xl border p-4 text-sm ${tema}`}><summary className="cursor-pointer font-semibold">Konu ilerlemesi</summary><ul className="mt-3 space-y-2">{veri.konular.map(k => <li key={k.konuId}><span className="font-medium">{k.baslik}: </span>{kartKonuDurumMesaji(k)}{k.retrievalYontemi === "keyword_fallback" && <span className={`ml-1 ${ikincil}`}>Anlamsal arama kullanılamadı; kaynaklar metin eşleşmesiyle seçildi.</span>}</li>)}</ul></details>}
            {veri.durum === "hazir" && !kartlar.length && <p role="status" className={`rounded-xl border p-6 ${tema}`}>Konu incelemesi tamamlandı. Kaynaklarda ayrı kart gerektiren bir öğrenme ifadesi belirlenmedi.</p>}
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{kartGorunumleri.map(g => <button type="button" key={g.deger} onClick={() => { gorunumuSec({ gorunum: g.deger }); setCalismaAcik(true); }} disabled={!kartlar.length || kaydediliyor} className={`rounded-2xl border p-4 text-left transition disabled:cursor-default ${secim.gorunum === g.deger && calismaAcik ? "border-violet-500/70 bg-violet-500/10" : tema}`} aria-pressed={secim.gorunum === g.deger && calismaAcik}><span className={`block text-xs ${ikincil}`}>{g.etiket}</span><span className="mt-2 block text-2xl font-bold tabular-nums">{veri.istatistikler[g.alan]}</span></button>)}</div>
            {uretiliyor && <div role="status" aria-live="polite" className={`rounded-2xl border px-6 py-9 text-center ${tema}`}><div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-[3px] border-violet-400/20 border-t-violet-400 motion-reduce:animate-none" /><h3 className="font-semibold">Çalışma kartları oluşturuluyor...</h3><p className={`mt-2 text-sm ${ikincil}`}>Tamamlanan konular kaydediliyor. Bu sayfaya geri dönebilirsiniz.</p>{veri.ilerleme.toplamKonu > 0 && <p className="mt-3 text-sm text-violet-400">{veri.ilerleme.tamamlananKonu} / {veri.ilerleme.toplamKonu} konu tamamlandı</p>}</div>}
            {eksik && !uretiliyor && !saltOkunur && <div role="alert" className="flex flex-col gap-4 rounded-2xl border border-amber-400/25 bg-amber-400/5 p-5 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="font-semibold">Kart üretimi tamamlanamadı</h3><p className={`mt-2 text-sm ${ikincil}`}>{kullaniciHataMesaji({ response: { status: 502, data: { kod: veri.hataKodu } } })} Tamamlanan kartlar korundu.</p></div><button type="button" onClick={olustur} className={`${buton} shrink-0`}><ArrowPathIcon className="h-4 w-4" />Eksik Konuları Tamamla</button></div>}
            {!uretiliyor && !kartlar.length && !eksik && veri.durum !== "hazir" && !saltOkunur && <div className={`relative overflow-hidden rounded-2xl border px-5 py-16 text-center ${tema}`}><div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(139,92,246,0.12),transparent_65%)]" /><RectangleStackIcon className="relative mx-auto mb-5 h-14 w-14 text-violet-400" /><h3 className="relative text-xl font-bold">Bilgilerini kartlarla kalıcı hâle getir</h3><p className={`relative mx-auto mt-3 max-w-lg text-sm leading-6 ${ikincil}`}>Onaylanmış konu haritanız ve ders materyallerinizden, her konuya uygun soru ve cevap kartları hazırlayalım.</p>{veri.engelMesaji && <p className="relative mt-4 text-sm text-amber-500">{veri.engelMesaji}</p>}<button type="button" onClick={olustur} disabled={!veri.olusturulabilir || baslatiliyor} className={`${buton} relative mt-7`}><SparklesIcon className="h-5 w-5" />Kartları Oluştur</button></div>}
            {kartlar.length > 0 && !calismaAcik && <div className={`rounded-2xl border p-8 text-center ${tema}`}><CheckCircleIcon className="mx-auto h-12 w-12 text-emerald-400" /><h3 className="mt-4 text-xl font-bold">{veri.durum === "hazir" ? "Çalışma kartlarınız hazır!" : "Hazır kartlarla çalışmaya başlayabilirsiniz"}</h3><p className={`mt-2 text-sm ${ikincil}`}>{kartlar.length} kart dersiniz için kaydedildi.</p><button type="button" onClick={() => setCalismaAcik(true)} className={`${buton} mt-6`}>Kartları Görüntüle<ArrowRightIcon className="h-4 w-4" /></button></div>}
            {calismaAcik && kartlar.length > 0 && <div className="grid items-start gap-5 lg:grid-cols-[250px_minmax(0,1fr)]">
                <KonuPaneli gruplar={gruplar} secim={secim} kartSayisi={kartlar.length} kaydediliyor={kaydediliyor} tema={tema} ana={ana} ikincil={ikincil} onSec={gorunumuSec} />
                <div className="min-w-0 space-y-4">{kart ? <>
                    <div className={`flex items-center justify-between gap-3 px-1 text-xs ${ikincil}`}><span className="truncate">{konu?.anaBaslik} / {konu?.baslik}</span><span className="shrink-0 tabular-nums">Kart {sira + 1} / {liste.length}</span></div>
                    <article key={kart._id} className={`calisma-karti-sahne relative rounded-2xl border ${isDark ? "border-violet-400/20 bg-[#111B31]" : "border-violet-200 bg-violet-50/50"}`}>
                        <button type="button" disabled={kaydediliyor || saltOkunur} onClick={() => void kaydet({ tur: "durum", kartId: kart._id, girdi: { yildizli: !kart.yildizli } })} aria-label={kart.yildizli ? "Yıldızı kaldır" : "Yıldız ekle"} aria-pressed={kart.yildizli} className={`absolute right-4 top-4 z-10 rounded-full p-2 transition hover:bg-amber-400/10 disabled:opacity-50 ${kart.yildizli ? "text-amber-400" : ikincil}`}>{kart.yildizli ? <DoluYildizIcon className="h-6 w-6" /> : <StarIcon className="h-6 w-6" />}</button>
                        <button type="button" disabled={kaydediliyor} onClick={cevir} aria-label={`${cevrili ? "Soruyu göster" : "Cevabı göster"}: ${cevrili ? kart.cevap : kart.soru}`} aria-pressed={cevrili} className="block w-full rounded-2xl text-center focus-visible:outline-2 focus-visible:outline-violet-400"><span className={`calisma-karti-donen ${cevrili ? "cevrili" : ""}`}><span className="calisma-karti-yuz" aria-hidden={cevrili}><span className="mb-5 text-[11px] font-bold uppercase tracking-[0.2em] text-violet-400">Soru</span><span className="calisma-karti-metin text-xl font-semibold leading-relaxed sm:text-2xl">{kart.soru}</span><span className={`mt-8 text-xs ${ikincil}`}>Cevabı görmek için karta tıklayın</span></span><span className="calisma-karti-yuz calisma-karti-arka" aria-hidden={!cevrili}><span className="mb-5 text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">Cevap</span><span className="calisma-karti-metin text-lg font-medium leading-relaxed sm:text-xl">{kart.cevap}</span><span className={`mt-7 text-xs ${ikincil}`}>Soruyu görmek için tekrar tıklayın</span></span></span></button>
                    </article>
                    <div className="flex items-center justify-between gap-3"><button type="button" onClick={() => ilerle(-1)} disabled={sira <= 0 || kaydediliyor} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm disabled:opacity-35 ${tema}`}><ArrowLeftIcon className="h-4 w-4" />Önceki</button><span className={`flex items-center gap-1.5 text-xs ${ikincil}`}>{kart.goruldu && <><EyeIcon className="h-4 w-4" />Görüldü</>}</span><button type="button" onClick={() => ilerle(1)} disabled={sira >= liste.length - 1 || kaydediliyor} className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm disabled:opacity-35 ${tema}`}>Sonraki<ArrowRightIcon className="h-4 w-4" /></button></div>
                    {cevrili && !saltOkunur && <div className={`rounded-2xl border p-4 sm:p-5 ${tema}`}><h3 className="text-sm font-semibold">Cevabı ne kadar kolay hatırladınız?</h3><div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">{degerlendirmeler.map(d => <button type="button" key={d.kod} disabled={kaydediliyor || !kart.goruldu} onClick={() => void kaydet({ tur: "degerlendirme", kartId: kart._id, girdi: { degerlendirme: d.kod, istemciIstekId: istemciIstekIdOlustur() } })} title={d.aciklama} className={`rounded-xl border px-3 py-3 text-sm font-semibold transition disabled:opacity-40 ${d.renk}`}>{d.baslik}</button>)}</div><p className={`mt-3 text-[11px] leading-5 ${ikincil}`}>Değerlendirmeleriniz kaydedilir. Otomatik tekrar planlaması henüz etkin değildir.</p></div>}
                    {cevrili && <p className={`px-1 text-xs ${ikincil}`}>Kaynak: {kart.kaynak.dosyaAdi} · Metin parçası {kart.kaynak.parcaIndex + 1}</p>}
                </> : <div className={`rounded-2xl border px-5 py-16 text-center ${tema}`}><RectangleStackIcon className={`mx-auto h-10 w-10 ${ikincil}`} /><h3 className="mt-4 font-semibold">Bu görünümde kart yok</h3><p className={`mt-2 text-sm ${ikincil}`}>Başka bir görünüm veya konu seçebilirsiniz.</p></div>}
                    <div aria-live="polite" className="min-h-6 text-center text-sm">{kaydediliyor ? <span className={ikincil}>Kaydediliyor...</span> : bildirim && <span className="text-emerald-400">{bildirim}</span>}</div>
                    {kayitHatasi && <div role="alert" className="rounded-xl border border-rose-400/25 bg-rose-400/10 p-4 text-sm text-rose-400">{kayitHatasi}{tekrarEylemi && <button type="button" disabled={kaydediliyor} onClick={() => void kaydet(tekrarEylemi)} className="ml-3 font-semibold underline">Yeniden kaydet</button>}</div>}
                </div>
            </div>}
        </>}
    </section>;
}

export default function DersCalismaKartlari() {
    const { dersId } = useParams(); const { isDark } = useOutletContext();
    return <KartlarIcerigi key={dersId} dersId={dersId} isDark={isDark} />;
}

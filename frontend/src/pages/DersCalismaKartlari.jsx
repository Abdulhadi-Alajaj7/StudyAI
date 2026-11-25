import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { RectangleStackIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, SparklesIcon, StarIcon } from "@heroicons/react/24/outline";
import api from "../services/calismaKartlariApi.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";

const FILTRELER = [
  { id: "tum", ad: "Tüm Kartlar" },
  { id: "gorulmeyen", ad: "Görülmeyen Kartlar" },
  { id: "gorulen", ad: "Görülen Kartlar" },
  { id: "yildizli", ad: "Yıldızlı Kartlar" },
];
const ZORLUKLAR = [
  { id: "zor", ad: "Zor", renk: "border-orange-500/50 text-orange-400 hover:bg-orange-500/10" },
  { id: "orta", ad: "Orta", renk: "border-sky-500/50 text-sky-400 hover:bg-sky-500/10" },
  { id: "kolay", ad: "Kolay", renk: "border-emerald-500/50 text-emerald-400 hover:bg-emerald-500/10" },
];

function DersCalismaKartlari() {
  const { isDark } = useOutletContext();
  const { dersId } = useParams();
  const [kartlar, setKartlar] = useState([]);
  const [yukleniyor, setYukleniyor] = useState(true);
  const [olusturuluyor, setOlusturuluyor] = useState(false);
  const [uretim, setUretim] = useState({ dersKartTamamlandi: false, toplamGrupSayisi: 0, islenenGrupSayisi: 0 });
  const [uretimMesaji, setUretimMesaji] = useState("");
  const uretimControllerRef = useRef(null);
  const [hata, setHata] = useState("");
  const [filtre, setFiltre] = useState("tum");
  const [konuFiltre,setKonuFiltre]=useState("tum");
  const [index, setIndex] = useState(0);
  const [cevapAcik, setCevapAcik] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const islemRef = useRef(false);
  const panel = isDark ? "border-[#263653] bg-[#111D31]" : "border-[#E2E8F0] bg-white";
  const metin = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
  const ikincil = isDark ? "text-[#92A7C5]" : "text-[#64748B]";

  useEffect(() => {
    const controller = new AbortController();
    setYukleniyor(true);
    setHata("");
    setKartlar([]);
    setUretim({ dersKartTamamlandi: false, uretimSuruyor: false,
      toplamGrupSayisi: 0, islenenGrupSayisi: 0 });
    setUretimMesaji("");
    setIndex(0);
    setCevapAcik(false);
    setFiltre("tum");
    setKonuFiltre("tum");
    api.listele(dersId, controller.signal)
      .then(r => { setKartlar(r.data.kartlar || []); setUretim(r.data); })
      .catch(e => { if (!controller.signal.aborted) setHata(kullaniciHataMesaji(e, "Kartlar yüklenemedi.")); })
      .finally(() => { if (!controller.signal.aborted) setYukleniyor(false); });
    return () => { controller.abort(); uretimControllerRef.current?.abort(); };
  }, [dersId]);

  // Bir kez başlatılan üretim tarayıcıdan bağımsız devam eder.
  // Yalnızca durum sorgulanır; kartlar bitince topluca gösterilir.
  useEffect(() => {
    if (!uretim.uretimSuruyor) return undefined;
    const controller = new AbortController();
    let bekleyen = false;
    const interval = setInterval(async () => {
      if (bekleyen) return;
      bekleyen = true;
      try {
        const r = await api.listele(dersId, controller.signal);
        if (controller.signal.aborted) return;
        setUretim(r.data);
        if (r.data.dersKartTamamlandi) {
          setKartlar(r.data.kartlar || []);
          setUretimMesaji("");
          setHata("");
        } else {
          setKartlar([]);
        }
      } catch (e) {
        // Geçici bağlantı sorunu arka plandaki üretimi durdurmaz.
        // Aynı sorgu bir sonraki aralıkta otomatik tekrarlanır.
      } finally {
        bekleyen = false;
      }
    }, 3000);
    return () => { clearInterval(interval); controller.abort(); };
  }, [dersId, uretim.uretimSuruyor]);

  const uretimAktif = olusturuluyor || Boolean(uretim.uretimSuruyor);
  const uretimHatasi = Boolean(uretim.uretimHatasi);
  const durumMesaji = uretim.uretimSuruyor
    ? (uretim.sonrakiDeneme &&
      new Date(uretim.sonrakiDeneme).getTime() > Date.now()
        ? "Kartlar hazırlanıyor. Sistem geçici yoğunluk nedeniyle otomatik yeniden deneyecek."
        : "Dersin tüm metinleri arka planda inceleniyor. Bu sayfadan ayrılsanız da işlem devam eder.")
    : uretimHatasi
      ? "Kartlar henüz tamamlanamadı. Kayıtlı ilerleme korunuyor; daha sonra tekrar başlatabilirsiniz."
      : "Dersin önemli bilgileri çalışma kartlarına dönüştürülecek.";

  const gosterilenKartlar = uretimAktif || uretimHatasi || uretim.yeniKonuKartlariGerekli ? [] : kartlar;
  const konuSecenekleri=useMemo(()=>[...new Map(gosterilenKartlar.map(k=>[k.konuId||"eski",k.konuBasligi||"Konu bağlantısı olmayan kartlar"])).entries()],[gosterilenKartlar]);
  const konuKartlari=useMemo(()=>gosterilenKartlar.filter(k=>konuFiltre==="tum"||(k.konuId||"eski")===konuFiltre),[gosterilenKartlar,konuFiltre]);
  const sayilar = useMemo(() => ({
    tum: konuKartlari.length,
    gorulmeyen: konuKartlari.filter(k => !k.goruldu).length,
    gorulen: konuKartlari.filter(k => k.goruldu).length,
    yildizli: konuKartlari.filter(k => k.yildizli).length,
  }), [konuKartlari]);
  const filtrelenmis = useMemo(() => konuKartlari.filter(k =>
    filtre === "tum" ||
    (filtre === "gorulmeyen" && !k.goruldu) ||
    (filtre === "gorulen" && k.goruldu) ||
    (filtre === "yildizli" && k.yildizli)
  ), [konuKartlari, filtre]);
  const aktifIndex = Math.min(index, Math.max(0, filtrelenmis.length - 1));
  const aktif = filtrelenmis[aktifIndex];

  const filtreDegistir = (yeni) => {
    setFiltre(yeni);
    setIndex(0);
    setCevapAcik(false);
    setHata("");
  };
  const ilerle = useCallback((fark) => {
    setIndex(i => Math.max(0, Math.min(filtrelenmis.length - 1, i + fark)));
    setCevapAcik(false);
  }, [filtrelenmis.length]);
  const olustur = async () => {
    if (islemRef.current) return;
    islemRef.current = true;
    const controller = new AbortController();
    uretimControllerRef.current = controller;
    setOlusturuluyor(true);
    setHata("");
    setUretimMesaji("Ders materyallerinin tamamı inceleniyor. Önemli bilgilerden çalışma kartları hazırlanıyor...");
    try {
      const r = await api.hizliOlustur(dersId, controller.signal);
      if (controller.signal.aborted) return;
      setUretim(eski => ({ ...eski, ...r.data }));
      if (r.data.uretimSuruyor) {
        // Tamamlanana kadar kısmi kartlar öğrenciye sunulmaz.
        setKartlar([]);
        setIndex(0);
        setCevapAcik(false);
      } else {
        const mevcut = await api.listele(dersId, controller.signal);
        if (controller.signal.aborted) return;
        setKartlar(mevcut.data.kartlar || []);
        setUretim(mevcut.data);
      }
    } catch (e) {
      if (!controller.signal.aborted && e.code !== "ERR_CANCELED") {
        const baglantiYok = !e.response && (e.code === "ERR_NETWORK" || e.isAxiosError);
        setHata(baglantiYok
          ? "Bağlantı kurulamadı. İşin durumunu tekrar kontrol edebilirsiniz."
          : "Kart üretimi başlatılamadı. Lütfen tekrar deneyin.");
      }
    } finally {
      islemRef.current = false;
      if (uretimControllerRef.current === controller) uretimControllerRef.current = null;
      setOlusturuluyor(false);
      setUretimMesaji("");
    }
  };
  const durum = async (kart, degisiklik) => {
    if (!kart || kaydediliyor) return false;
    setKaydediliyor(true);
    setHata("");
    try {
      const r = await api.durumuGuncelle(dersId, kart._id, degisiklik);
      setKartlar(eski => eski.map(k => k._id === kart._id ? r.data.kart : k));
      return true;
    } catch (e) {
      setHata(kullaniciHataMesaji(e, "Kart güncellenemedi."));
      return false;
    } finally {
      setKaydediliyor(false);
    }
  };
  const cevir = async () => {
    if (!aktif || kaydediliyor) return;
    if (!cevapAcik && !aktif.goruldu) {
      const basarili = await durum(aktif, { goruldu: true });
      if (!basarili) return;
    }
    setCevapAcik(v => !v);
  };
  const degerlendir = async (zorluk) => {
    if (!aktif || !cevapAcik || kaydediliyor) return;
    const id = aktif._id;
    const basarili = await durum(aktif, { zorluk, goruldu: true });
    if (basarili) {
      const sonraki = filtrelenmis.findIndex((k, i) => i > aktifIndex && k._id !== id);
      if (sonraki >= 0) setIndex(sonraki);
      else if (filtre === "gorulmeyen") setIndex(0);
      setCevapAcik(false);
    }
  };

  return <section className={`space-y-6 ${metin}`}>
    <div className="grid grid-cols-1 items-center gap-4 lg:grid-cols-2 lg:gap-3">
      <div className="flex items-center gap-4">
        <div className="rounded-2xl bg-violet-500/15 p-3"><RectangleStackIcon className="h-7 w-7 text-violet-400" /></div>
        <div><h2 className="text-[25px] font-bold">Çalışma Kartları</h2><p className={`text-[13px] ${ikincil}`}>Konularını hatırla, bilgini pekiştir.</p></div>
      </div>
      <div className={`flex w-full min-w-0 items-center gap-3 rounded-xl border px-5 py-3 ${panel}`}>
        <ClockIcon className="h-5 w-5 shrink-0 text-violet-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Bugünkü Tekrarlar</p>
          <p className={`text-xs ${ikincil}`}>Tekrar planlaması henüz etkin değil.</p>
        </div>
        <span className="shrink-0 text-[10px] font-bold text-sky-400">YAKINDA</span>
      </div>
    </div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" role="group" aria-label="Kart filtreleri">
      {FILTRELER.map(({ id, ad }) => <button type="button" key={id} onClick={() => filtreDegistir(id)}
        aria-pressed={filtre === id}
        className={`rounded-2xl border p-5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400 ${filtre === id
          ? isDark ? "border-violet-500 bg-violet-500/10" : "border-violet-500 bg-violet-50"
          : panel + " hover:border-violet-500/50"}`}>
        <p className={`text-xs ${filtre === id ? "text-violet-400" : ikincil}`}>{ad}</p>
        <p className="mt-2 text-3xl font-bold">{sayilar[id]}</p>
      </button>)}
    </div>
    {!yukleniyor && gosterilenKartlar.length>0 && (
      <div className="flex flex-wrap items-center gap-3">
        {konuSecenekleri.some(([id])=>id!=="eski") && <label className="flex flex-1 flex-wrap items-center gap-2 text-sm">
          Konu Seçimi
          <select value={konuFiltre} onChange={e=>{setKonuFiltre(e.target.value);setIndex(0);setCevapAcik(false);setFiltre("tum");}}
            className={`min-w-0 max-w-full rounded-xl border px-3 py-2 ${panel} ${metin}`}>
            <option value="tum">Tüm Konular</option>
            {konuSecenekleri.map(([id,baslik])=><option key={id} value={id}>{baslik}</option>)}
          </select>
        </label>}
        {!uretimAktif && !uretim.dersKartTamamlandi && !uretimHatasi &&
          <button type="button" onClick={olustur} className="rounded-xl bg-[#705CF5] px-4 py-2 text-sm font-semibold text-white">
            Kartları Oluştur
          </button>}
      </div>
    )}
    {!yukleniyor && (uretimAktif || uretimHatasi) && (
      <div role="status" aria-live="polite"
        className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-400/30 bg-violet-500/10 px-4 py-3 text-sm ${metin}`}>
        <div className="flex items-center gap-2">
          {uretimAktif && <ArrowPathIcon className="h-5 w-5 animate-spin text-violet-400" />}
          <span>{uretimAktif && uretimMesaji ? uretimMesaji : durumMesaji}</span>
        </div>
        {uretim.toplamGrupSayisi > 0 && <span className="text-xs font-semibold text-violet-400">
          {uretim.islenenGrupSayisi || 0} / {uretim.toplamGrupSayisi} metin bölümü
        </span>}
        {!uretimAktif && uretimHatasi && <button type="button" onClick={olustur}
          className="rounded-lg border border-violet-400/50 px-3 py-2 font-semibold text-violet-400">
          Yeniden Dene
        </button>}
      </div>
    )}
    {hata && <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-400">{hata}</p>}
    {yukleniyor ? <div role="status" className="py-14 text-center">Kartlar yükleniyor...</div> : !gosterilenKartlar.length ?
      <div className={`flex min-h-[380px] flex-col items-center justify-center rounded-2xl border p-8 text-center ${panel}`}>
        <RectangleStackIcon className="h-14 w-14 text-violet-400" />
        <h3 className="mt-5 text-xl font-bold">Bilgilerini kartlarla kalıcı hâle getir</h3>
        <p className={`mt-3 max-w-lg text-sm leading-6 ${ikincil}`}>{uretimAktif
          ? durumMesaji
          : uretim.dersKartTamamlandi
            ? "Ders materyalleri incelendi ancak kaynaklı soru-cevap kartı bulunamadı. Yüklenen dosyaları kontrol edin."
            : "Ders materyallerindeki önemli bilgileri kapsayan soru-cevap kartları hazırlayalım."}</p>
        <button type="button" disabled={uretimAktif || uretim.dersKartTamamlandi} onClick={olustur} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#705CF5] px-6 py-3 font-semibold text-white hover:bg-[#6250DE] disabled:opacity-50">
          {uretimAktif ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <SparklesIcon className="h-5 w-5" />}
          {uretimAktif ? "Kartlar hazırlanıyor..." : "Kartları Oluştur"}
        </button>
      </div> : !aktif ?
      <div className={`rounded-2xl border p-14 text-center ${panel}`}>
        <StarIcon className="mx-auto h-10 w-10 text-violet-400" />
        <p className="mt-4 font-semibold">Bu grupta henüz kart bulunmuyor.</p>
        <button type="button" onClick={() => {setKonuFiltre("tum");filtreDegistir("tum");}} className="mt-4 text-sm font-semibold text-violet-400 hover:underline">Tüm kartlara dön</button>
      </div> :
      <div className="mx-auto max-w-5xl space-y-4">
        <div className={`flex flex-wrap items-center justify-between gap-3 text-sm ${ikincil}`}>
          <span className="min-w-0 break-words">{aktif.konuBasligi || "Ders Çalışma Kartı"} {aktif.uretimYontemi === "kaynak" && <span className="ml-2 rounded-full border border-amber-400/40 px-2 py-0.5 text-[11px] text-amber-400">Kaynak metni</span>}
            {aktif.uretimYontemi === "genel" && <span className="ml-2 rounded-full border border-indigo-400/40 px-2 py-0.5 text-[11px] text-indigo-400">Genel bilgi</span>}</span>
          <span className="shrink-0">Kart {aktifIndex + 1} / {filtrelenmis.length}</span>
        </div>
        <div className="relative" style={{ perspective: "1400px" }}>
          <div className="relative h-[320px] sm:h-[380px] transition-transform duration-500 motion-reduce:transition-none"
            style={{ transformStyle: "preserve-3d", transform: cevapAcik ? "rotateY(180deg)" : "rotateY(0deg)" }}>
            {[false, true].map(arka => <div key={String(arka)}
              className={`absolute inset-0 flex flex-col rounded-[20px] border p-6 sm:p-9 ${panel}`}
              style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: arka ? "rotateY(180deg)" : "none" }}
              aria-hidden={cevapAcik !== arka}
              inert={cevapAcik !== arka}>
              <div className="flex items-start justify-between gap-3">
                <span className={`max-w-[85%] truncate text-xs font-medium ${ikincil}`}>Ders Çalışma Kartı</span>
                {!arka && <button type="button" disabled={kaydediliyor} onClick={() => durum(aktif, { yildizli: !aktif.yildizli })}
                  aria-label={aktif.yildizli ? "Yıldızı kaldır" : "Yıldız ekle"}
                  className={`rounded-lg p-1.5 ${aktif.yildizli ? "text-amber-400" : ikincil}`}>
                  <StarIcon className="h-6 w-6" fill={aktif.yildizli ? "currentColor" : "none"} />
                </button>}
                {arka && <span className="text-xs font-bold tracking-[0.2em] text-emerald-400">CEVAP</span>}
              </div>
              <button type="button" tabIndex={cevapAcik === arka ? 0 : -1} onClick={e => { e.currentTarget.blur(); cevir(); }}
                disabled={kaydediliyor} aria-label={arka ? "Soruyu görmek için kartı çevir" : "Cevabı görmek için kartı çevir"}
                className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto rounded-xl px-2 py-4 text-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-violet-400">
                <span className="whitespace-pre-wrap break-words text-xl font-semibold leading-relaxed sm:text-2xl">{arka ? aktif.cevap : aktif.soru}</span>
                <span className={`inline-flex items-center gap-2 text-xs ${ikincil}`}><ArrowPathIcon className="h-4 w-4" />{arka ? "Soruyu görmek için tıklayın" : "Cevabı görmek için tıklayın"}</span>
              </button>
            </div>)}
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <button type="button" disabled={aktifIndex === 0 || kaydediliyor} onClick={() => ilerle(-1)}
            className={`inline-flex items-center gap-2 rounded-xl border px-5 py-3 font-medium disabled:opacity-30 ${panel}`}><ChevronLeftIcon className="h-5 w-5" />Önceki</button>
          <span className={`text-xs ${ikincil}`}>{aktif.goruldu ? "Görüldü" : "Görülmedi"}</span>
          <button type="button" disabled={aktifIndex >= filtrelenmis.length - 1 || kaydediliyor} onClick={() => ilerle(1)}
            className={`inline-flex items-center gap-2 rounded-xl border px-5 py-3 font-medium disabled:opacity-30 ${panel}`}>Sonraki<ChevronRightIcon className="h-5 w-5" /></button>
        </div>
        {cevapAcik && <div className={`rounded-2xl border p-5 sm:p-6 ${panel}`}>
          <p className="mb-4 text-sm font-semibold">Cevabı ne kadar kolay hatırladınız?</p>
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {ZORLUKLAR.map(z => <button type="button" key={z.id} disabled={kaydediliyor}
              onClick={() => degerlendir(z.id)}
              className={`rounded-xl border px-2 py-3 text-sm font-semibold transition-colors disabled:opacity-50 sm:text-base ${z.renk} ${aktif.zorluk === z.id ? "ring-2 ring-current ring-offset-2 ring-offset-transparent" : ""}`}>{z.ad}</button>)}
          </div>
          <p className={`mt-4 text-xs ${ikincil}`}>Değerlendirmeniz kaydedilir. Otomatik tekrar planlaması henüz etkin değildir.</p>
        </div>}
        <p className={`break-all px-1 text-xs ${ikincil}`}>{aktif.uretimYontemi === "genel" ? "Bilgi türü: Genel akademik bilgi (ders dosyasında ayrıntı yok)" : `Kaynak: ${[...new Set((aktif.kaynaklar || []).map(k => k.dosyaAdi))].join(", ")}` }</p>
      </div>}
  </section>;
}
export default DersCalismaKartlari;

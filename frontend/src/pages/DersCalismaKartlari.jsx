import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useOutletContext, useParams } from "react-router-dom";
import { RectangleStackIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, SparklesIcon, StarIcon } from "@heroicons/react/24/outline";
import api from "../services/calismaKartlariApi.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import { dersDetayYolu } from "../utils/dersDetayYollari.mjs";
import CalismaKartiYuzleri from "../components/CalismaKartiYuzleri.jsx";

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
  const [tekrarBilgilendirmesi, setTekrarBilgilendirmesi] = useState("");
  const [filtre, setFiltre] = useState("tum");
  const [index, setIndex] = useState(0);
  const [cevapAcik, setCevapAcik] = useState(false);
  const [kaydediliyor, setKaydediliyor] = useState(false);
  const kartYaziliyorRef = useRef(false);
  const [tekrarBilgisi, setTekrarBilgisi] = useState(null);
  const [tekrarYenile, setTekrarYenile] = useState(0);
  const islemRef = useRef(false);
  const panel = isDark ? "border-[#263653] bg-[#111D31]" : "border-[#E2E8F0] bg-white";
  const metin = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
  const ikincil = isDark ? "text-[#92A7C5]" : "text-[#64748B]";

  useEffect(() => {
    const controller = new AbortController();
    api.tekrarlariGetir(dersId, controller.signal)
      .then(({ data }) => { if (!controller.signal.aborted) setTekrarBilgisi({ dersId, bekleyen: data.bekleyen }); })
      .catch(() => { if (!controller.signal.aborted) setTekrarBilgisi({ dersId, hata: true }); });
    return () => controller.abort();
  }, [dersId, tekrarYenile, uretim.uretimSuruyor]);

  useEffect(() => {
    const controller = new AbortController();
    setYukleniyor(true);
    setHata("");
    setTekrarBilgilendirmesi("");
    setKartlar([]);
    setUretim({ dersKartTamamlandi: false, uretimSuruyor: false,
      toplamGrupSayisi: 0, islenenGrupSayisi: 0 });
    setUretimMesaji("");
    setIndex(0);
    setCevapAcik(false);
    setFiltre("tum");
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
  const sayilar = useMemo(() => ({
    tum: gosterilenKartlar.length,
    gorulmeyen: gosterilenKartlar.filter(k => !k.goruldu).length,
    gorulen: gosterilenKartlar.filter(k => k.goruldu).length,
    yildizli: gosterilenKartlar.filter(k => k.yildizli).length,
  }), [gosterilenKartlar]);
  const filtrelenmis = useMemo(() => gosterilenKartlar.filter(k =>
    filtre === "tum" ||
    (filtre === "gorulmeyen" && !k.goruldu) ||
    (filtre === "gorulen" && k.goruldu) ||
    (filtre === "yildizli" && k.yildizli)
  ), [gosterilenKartlar, filtre]);
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
    if (!kart || kartYaziliyorRef.current) return false;
    kartYaziliyorRef.current = true;
    setKaydediliyor(true);
    setHata("");
    setTekrarBilgilendirmesi("");
    try {
      const girdi = degisiklik.zorluk ? { ...degisiklik, surum: kart.__v ?? 0 } : degisiklik;
      const r = await api.durumuGuncelle(dersId, kart._id, girdi);
      const { goruldu, yildizli } = r.data.kart;
      setKartlar(eski => eski.map(k => k._id === kart._id
        ? (degisiklik.zorluk ? r.data.kart : { ...k, goruldu, yildizli }) : k));
      if (degisiklik.zorluk) {
        if (r.data.kart.zorluk === null) setTekrarBilgilendirmesi("Bu kartı art arda iki kez kolay olarak değerlendirdiğin için tekrar listesinden çıkarıldı.");
        setTekrarYenile(sayi => sayi + 1);
      }
      return true;
    } catch (e) {
      setHata(kullaniciHataMesaji(e, "Kart güncellenemedi."));
      if (e.response?.status === 409) {
        const guncel = await api.listele(dersId).catch(() => null);
        if (guncel) setKartlar(guncel.data.kartlar || []);
        setTekrarYenile(sayi => sayi + 1);
      }
      return false;
    } finally {
      kartYaziliyorRef.current = false;
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
      <Link to={dersDetayYolu(dersId, "tekrarlar")} className={`flex w-full min-w-0 items-center gap-3 rounded-xl border px-5 py-3 hover:border-violet-500/50 ${panel}`}>
        <ClockIcon className="h-5 w-5 shrink-0 text-violet-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Bugünkü Tekrarlar</p>
          <p className={`text-xs ${ikincil}`}>{tekrarBilgisi?.dersId !== dersId ? "Tekrarlar yükleniyor..."
            : tekrarBilgisi.hata ? "Tekrar sayısı yüklenemedi."
              : tekrarBilgisi.bekleyen ? `${tekrarBilgisi.bekleyen} kart tekrar edilmeyi bekliyor.` : "Bugün tekrar edilecek kartın yok."}</p>
        </div>
      </Link>
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
    {!yukleniyor && gosterilenKartlar.length > 0 && !uretimAktif && !uretim.dersKartTamamlandi && !uretimHatasi && (
      <div className="flex flex-wrap items-center gap-3">
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
    {tekrarBilgilendirmesi && <p role="status" className={`rounded-xl border p-4 text-sm ${panel}`}>{tekrarBilgilendirmesi}</p>}
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
        <button type="button" onClick={() => filtreDegistir("tum")} className="mt-4 text-sm font-semibold text-violet-400 hover:underline">Tüm kartlara dön</button>
      </div> :
      <div className="mx-auto max-w-5xl space-y-4">
        <div className={`flex flex-wrap items-center justify-between gap-3 text-sm ${ikincil}`}>
          <span className="min-w-0 break-words">{aktif.konuBasligi || "Ders Çalışma Kartı"} {aktif.uretimYontemi === "kaynak" && <span className="ml-2 rounded-full border border-amber-400/40 px-2 py-0.5 text-[11px] text-amber-400">Kaynak metni</span>}
            {aktif.uretimYontemi === "genel" && <span className="ml-2 rounded-full border border-indigo-400/40 px-2 py-0.5 text-[11px] text-indigo-400">Genel bilgi</span>}</span>
          <span className="shrink-0">Kart {aktifIndex + 1} / {filtrelenmis.length}</span>
        </div>
        <CalismaKartiYuzleri aktif={aktif} cevapAcik={cevapAcik} kaydediliyor={kaydediliyor}
          cevir={cevir} yildizDegistir={() => durum(aktif, { yildizli: !aktif.yildizli })} panel={panel} ikincil={ikincil} />
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
              className={`rounded-xl border px-2 py-3 text-sm font-semibold transition-colors disabled:opacity-50 sm:text-base ${z.renk} ${aktif.zorluk === z.id ? "ring-2 ring-current ring-offset-2 ring-offset-transparent" : ""}`}>
              {z.ad}<span className={`mt-0.5 block text-xs font-medium ${ikincil}`}>{aktif.tekrarSureleri[z.id] === null ? "Listeden çıkar" : `${aktif.tekrarSureleri[z.id]} gün`}</span>
            </button>)}
          </div>
          <p className={`mt-4 text-xs ${ikincil}`}>Değerlendirmeniz kartın sonraki tekrar tarihini belirler.</p>
        </div>}
        <p className={`break-all px-1 text-xs ${ikincil}`}>{aktif.uretimYontemi === "genel" ? "Bilgi türü: Genel akademik bilgi (ders dosyasında ayrıntı yok)" : `Kaynak: ${[...new Set((aktif.kaynaklar || []).map(k => k.dosyaAdi))].join(", ")}` }</p>
      </div>}
  </section>;
}
export default DersCalismaKartlari;

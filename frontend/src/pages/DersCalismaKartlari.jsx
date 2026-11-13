import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import { ArchiveBoxIcon, ArrowPathIcon, ChevronLeftIcon, ChevronRightIcon, ClockIcon, SparklesIcon, StarIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
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
  const [hata, setHata] = useState("");
  const [filtre, setFiltre] = useState("tum");
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
    setIndex(0);
    setCevapAcik(false);
    setFiltre("tum");
    api.listele(dersId, controller.signal)
      .then(r => setKartlar(r.data.kartlar || []))
      .catch(e => { if (!controller.signal.aborted) setHata(kullaniciHataMesaji(e, "Kartlar yüklenemedi.")); })
      .finally(() => { if (!controller.signal.aborted) setYukleniyor(false); });
    return () => controller.abort();
  }, [dersId]);

  const sayilar = useMemo(() => ({
    tum: kartlar.length,
    gorulmeyen: kartlar.filter(k => !k.goruldu).length,
    gorulen: kartlar.filter(k => k.goruldu).length,
    yildizli: kartlar.filter(k => k.yildizli).length,
  }), [kartlar]);
  const filtrelenmis = useMemo(() => kartlar.filter(k =>
    filtre === "tum" ||
    (filtre === "gorulmeyen" && !k.goruldu) ||
    (filtre === "gorulen" && k.goruldu) ||
    (filtre === "yildizli" && k.yildizli)
  ), [kartlar, filtre]);
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
    setOlusturuluyor(true);
    setHata("");
    try {
      const r = await api.olustur(dersId);
      setKartlar(r.data.kartlar || []);
      setIndex(0);
      setCevapAcik(false);
    } catch (e) {
      setHata(kullaniciHataMesaji(e, "Kart oluşturulamadı."));
    } finally {
      islemRef.current = false;
      setOlusturuluyor(false);
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
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className="rounded-2xl bg-violet-500/15 p-3"><ArchiveBoxIcon className="h-7 w-7 text-violet-400" /></div>
        <div><h2 className="text-[25px] font-bold">Çalışma Kartları</h2><p className={`text-[13px] ${ikincil}`}>Konularını hatırla, bilgini pekiştir.</p></div>
      </div>
      <div className={`flex items-center gap-3 rounded-xl border px-5 py-3 ${panel}`}>
        <ClockIcon className="h-5 w-5 text-violet-400" />
        <div><p className="text-sm font-semibold">Bugünkü Tekrarlar</p><p className={`text-xs ${ikincil}`}>Tekrar planlaması henüz etkin değil.</p></div>
        <span className="ml-3 text-[10px] font-bold text-sky-400">YAKINDA</span>
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
    {hata && <p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-400">{hata}</p>}
    {yukleniyor ? <div role="status" className="py-14 text-center">Kartlar yükleniyor...</div> : !kartlar.length ?
      <div className={`flex min-h-[380px] flex-col items-center justify-center rounded-2xl border p-8 text-center ${panel}`}>
        <ArchiveBoxIcon className="h-14 w-14 text-violet-400" />
        <h3 className="mt-5 text-xl font-bold">Bilgilerini kartlarla kalıcı hâle getir</h3>
        <p className={`mt-3 max-w-lg text-sm leading-6 ${ikincil}`}>Onaylanmış konu haritanız ve ders materyallerinizden her konuya uygun soru ve cevap kartları hazırlayalım.</p>
        <button type="button" disabled={olusturuluyor} onClick={olustur} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#705CF5] px-6 py-3 font-semibold text-white hover:bg-[#6250DE] disabled:opacity-50">
          {olusturuluyor ? <ArrowPathIcon className="h-5 w-5 animate-spin" /> : <SparklesIcon className="h-5 w-5" />}
          {olusturuluyor ? "Kartlar hazırlanıyor..." : "Kartları Oluştur"}
        </button>
      </div> : !aktif ?
      <div className={`rounded-2xl border p-14 text-center ${panel}`}>
        <StarIcon className="mx-auto h-10 w-10 text-violet-400" />
        <p className="mt-4 font-semibold">Bu grupta henüz kart bulunmuyor.</p>
        <button type="button" onClick={() => filtreDegistir("tum")} className="mt-4 text-sm font-semibold text-violet-400 hover:underline">Tüm kartlara dön</button>
      </div> :
      <div className="mx-auto max-w-5xl space-y-4">
        <div className={`flex flex-wrap items-center justify-between gap-3 text-sm ${ikincil}`}>
          <span className="min-w-0 break-words">{aktif.konuBasligi}</span>
          <span className="shrink-0">Kart {aktifIndex + 1} / {filtrelenmis.length}</span>
        </div>
        <div className="relative" style={{ perspective: "1400px" }}>
          <div className="relative h-[320px] sm:h-[380px] transition-transform duration-500 motion-reduce:transition-none"
            style={{ transformStyle: "preserve-3d", transform: cevapAcik ? "rotateY(180deg)" : "rotateY(0deg)" }}>
            {[false, true].map(arka => <div key={String(arka)}
              className={`absolute inset-0 flex flex-col rounded-[20px] border p-6 sm:p-9 ${panel}`}
              style={{ backfaceVisibility: "hidden", WebkitBackfaceVisibility: "hidden", transform: arka ? "rotateY(180deg)" : "none" }}
              aria-hidden={cevapAcik !== arka}>
              <div className="flex items-start justify-between gap-3">
                <span className={`max-w-[85%] truncate text-xs font-medium ${ikincil}`}>{aktif.konuBasligi}</span>
                {!arka && <button type="button" disabled={kaydediliyor} onClick={() => durum(aktif, { yildizli: !aktif.yildizli })}
                  aria-label={aktif.yildizli ? "Yıldızı kaldır" : "Yıldız ekle"}
                  className={`rounded-lg p-1.5 ${aktif.yildizli ? "text-amber-400" : ikincil}`}>
                  <StarIcon className="h-6 w-6" fill={aktif.yildizli ? "currentColor" : "none"} />
                </button>}
                {arka && <span className="text-xs font-bold tracking-[0.2em] text-emerald-400">CEVAP</span>}
              </div>
              <button type="button" tabIndex={cevapAcik === arka ? 0 : -1} onClick={cevir}
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
        <p className={`break-all px-1 text-xs ${ikincil}`}>Kaynak: {[...new Set((aktif.kaynaklar || []).map(k => k.dosyaAdi))].join(", ")}</p>
      </div>}
  </section>;
}
export default DersCalismaKartlari;

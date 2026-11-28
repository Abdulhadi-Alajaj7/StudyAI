import { ArrowPathIcon, StarIcon } from "@heroicons/react/24/outline";

export default function CalismaKartiYuzleri({ aktif, cevapAcik, kaydediliyor, cevir, yildizDegistir, panel, ikincil }) {
  return (
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
            {!arka && <button type="button" disabled={kaydediliyor} onClick={yildizDegistir}
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
  );
}

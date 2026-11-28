import { useId, useState } from "react";
import { ChevronDownIcon, CheckIcon, DocumentTextIcon, InformationCircleIcon, RectangleStackIcon } from "@heroicons/react/24/outline";
import "./DersKonuHaritasi.css";

const hakimiyetEtiketleri = {
    zayif: "Zayıf",
    gelistirilmeli: "Geliştirilmeli",
    iyi: "İyi",
    yeterli_veri_yok: "Yeterli Veri Yok"
};
const yuzdeBicimi = new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 1 });

function HakimiyetDurumu({ analiz }) {
    if (!analiz) return null;
    return <span className="konu-hakimiyet" data-durum={analiz.durum}>
        {analiz.durum === "yeterli_veri_yok" ? <>
            <span className="konu-hakimiyet-seviye">{hakimiyetEtiketleri[analiz.durum]}</span>
            <span className="konu-hakimiyet-bilgi"><InformationCircleIcon aria-hidden="true" />
                Hâkimiyet seviyeni belirlemek için en az 5 soru çözmelisin.
            </span>
        </> : <>
            <span className="konu-hakimiyet-baslik">Konu Hâkimiyeti</span>
            <span className="konu-hakimiyet-satir">
                <span className="konu-hakimiyet-cubuk" aria-hidden="true"><span style={{ width: `${analiz.yuzde}%` }} /></span>
                <span>{yuzdeBicimi.format(analiz.yuzde / 100)}</span>
                <span className="konu-hakimiyet-seviye">{hakimiyetEtiketleri[analiz.durum]}</span>
            </span>
        </>}
    </span>;
}

function KonuDali({ ana, index, secili, onSec, kartSayilari, konuHakimiyeti }) {
    const [acik, setAcik] = useState(true);
    const id = useId();
    const altKonular = ana.altKonular || [];
    return <li className={`konu-dali konu-vurgu-${index % 4}`}>
        <div className={`konu-ana ${secili === ana.konuId ? "konu-secili" : ""}`}>
            <button type="button" className="konu-ana-sec" aria-pressed={secili === ana.konuId} onClick={() => onSec(ana.konuId)}>
                <span className="konu-sira" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <span className="konu-yazi"><span className="konu-ana-baslik">{ana.baslik}</span>{ana.aciklama && <span className="konu-aciklama">{ana.aciklama}</span>}</span>

                {secili === ana.konuId && <CheckIcon className="konu-secim-simgesi" aria-hidden="true" />}
            </button>
            {!!altKonular.length && <button type="button" className="konu-dal-ac" aria-expanded={acik} aria-controls={id}
                aria-label={`${ana.baslik}: alt konuları ${acik ? "gizle" : "göster"}`} onClick={() => setAcik(v => !v)}>
                <ChevronDownIcon className={`h-4 w-4 transition-transform ${acik ? "" : "-rotate-90"}`} />
            </button>}
        </div>
        {!!altKonular.length && <ol id={id} hidden={!acik} className="konu-altlar">
            {altKonular.map((alt, i) => {
                const analiz = konuHakimiyeti?.get(alt.konuId);
                return <li key={alt.konuId || alt._id || i} className="konu-alt-dali">
                    <button type="button" className={`konu-alt ${secili === alt.konuId ? "konu-secili" : ""}`}
                        aria-pressed={secili === alt.konuId} onClick={() => onSec(alt.konuId)}>
                        <span className="konu-nokta" aria-hidden="true" /><span className="konu-yazi"><span className="konu-alt-baslik">{alt.baslik}</span>
                            {alt.aciklama && <span className="konu-aciklama">{alt.aciklama}</span>}
                            <HakimiyetDurumu analiz={analiz} />
                        </span>

                        {(kartSayilari !== null || analiz) && <span className="konu-alt-sayilari">
                            {kartSayilari !== null && <span className="konu-kart-sayisi" aria-label={`${kartSayilari[alt.konuId] || 0} çalışma kartı`}>
                                <RectangleStackIcon aria-hidden="true" />
                                <span>{kartSayilari[alt.konuId] || 0} kart</span>
                            </span>}
                            {analiz && <span className="konu-soru-sayisi">
                                <DocumentTextIcon aria-hidden="true" />
                                <span>{analiz.soruSayisi} soru</span>
                            </span>}
                        </span>}
                        {secili === alt.konuId && <CheckIcon className="konu-secim-simgesi" aria-hidden="true" />}
                    </button>
                </li>;
            })}
        </ol>}
    </li>;
}

export default function KonuHaritasiListesi({ anaKonular, kartSayilari = null, konuHakimiyeti = null }) {
    const [secili, setSecili] = useState(null);
    return <ol className="konu-dallar" aria-label="Ders konuları">{anaKonular.map((ana, i) =>
        <KonuDali key={ana.konuId || ana._id || i} ana={ana} index={i} secili={secili} onSec={setSecili} kartSayilari={kartSayilari} konuHakimiyeti={konuHakimiyeti} />)}</ol>;
}

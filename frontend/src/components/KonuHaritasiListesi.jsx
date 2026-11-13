import { useId, useState } from "react";
import { ChevronDownIcon, CheckIcon } from "@heroicons/react/24/outline";
import "./DersKonuHaritasi.css";

function KonuDali({ ana, index, secili, onSec }) {
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
            {altKonular.map((alt, i) => <li key={alt.konuId || alt._id || i} className="konu-alt-dali">
                <button type="button" className={`konu-alt ${secili === alt.konuId ? "konu-secili" : ""}`}
                    aria-pressed={secili === alt.konuId} onClick={() => onSec(alt.konuId)}>
                    <span className="konu-nokta" aria-hidden="true" /><span className="konu-yazi"><span className="konu-alt-baslik">{alt.baslik}</span>
                        {alt.aciklama && <span className="konu-aciklama">{alt.aciklama}</span>}</span>
                    {secili === alt.konuId && <CheckIcon className="konu-secim-simgesi" aria-hidden="true" />}
                </button>
            </li>)}
        </ol>}
    </li>;
}

export default function KonuHaritasiListesi({ anaKonular }) {
    const [secili, setSecili] = useState(null);
    return <ol className="konu-dallar" aria-label="Ders konuları">{anaKonular.map((ana, i) =>
        <KonuDali key={ana.konuId || ana._id || i} ana={ana} index={i} secili={secili} onSec={setSecili} />)}</ol>;
}

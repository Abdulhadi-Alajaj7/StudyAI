import { useId, useState } from "react";
import { ChevronDownIcon, CheckIcon, BookOpenIcon, Square3Stack3DIcon, DocumentTextIcon, FolderOpenIcon } from "@heroicons/react/24/outline";
import { materyalSunumu } from "../utils/konuHaritasiSunumu.mjs";
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

export default function DersKonuHaritasi({ ders, harita, materyaller, isDark, yukleniyor, haritaHatasi, materyalHatasi }) {
    const [secili, setSecili] = useState(null);
    const anaKonular = harita?.anaKonular || [];
    const aciklama = harita?.durum === "olusturuluyor" ? "Konu haritası hazırlanıyor. Hazır olduğunda burada görüntülenecek."
        : harita?.durum === "hata" ? "Konu haritası şu anda kullanılamıyor. Ders hazırlama durumunu kontrol edin." : "Bu ders için henüz bir konu haritası bulunmuyor.";
    return <section className="ders-konu-sayfasi" data-tema={isDark ? "koyu" : "acik"} aria-labelledby="konu-haritasi-baslik">
        <header className="konu-sayfa-baslik"><span className="konu-baslik-simgesi" aria-hidden="true"><Square3Stack3DIcon /></span>
            <div><h2 id="konu-haritasi-baslik">Konu Haritası</h2><p>Dersin ana konularını ve alt başlıklarını keşfet.</p></div></header>
        <div className="konu-sayfa-yerlesim">
            <div className="konu-harita-karti">
                <div className="konu-harita-doku" aria-hidden="true" />
                <div className="konu-ders-koku"><BookOpenIcon aria-hidden="true" /><div><h3>{ders.dersAdi}</h3>{ders.dersKodu && <p>{ders.dersKodu}</p>}</div></div>
                {yukleniyor ? <p role="status" className="konu-bos-durum">Konu haritası yükleniyor...</p>
                    : haritaHatasi ? <p role="alert" className="konu-bos-durum konu-hata">{haritaHatasi}</p>
                        : !anaKonular.length ? <p role={harita?.durum === "hata" ? "alert" : "status"} className="konu-bos-durum">{aciklama}</p>
                            : <ol className="konu-dallar" aria-label="Ders konuları">{anaKonular.map((ana, i) => <KonuDali key={ana.konuId || ana._id || i} ana={ana} index={i} secili={secili} onSec={setSecili} />)}</ol>}
            </div>
            <aside className="konu-materyal-paneli" aria-labelledby="konu-materyal-baslik">
                <header><DocumentTextIcon aria-hidden="true" /><div><h3 id="konu-materyal-baslik">Ders Materyalleri</h3><p>Bu derse eklediğin dosyalar.</p></div></header>
                {yukleniyor ? <p role="status" className="konu-bos-durum">Materyaller yükleniyor...</p>
                    : materyalHatasi ? <p role="alert" className="konu-bos-durum konu-hata">{materyalHatasi}</p>
                        : !materyaller.length ? <div className="konu-materyal-bos"><FolderOpenIcon aria-hidden="true" /><p>Henüz materyal yok</p><span>Bu derse eklenen dosyalar burada listelenecek.</span></div>
                            : <ul className="konu-materyaller">{materyaller.map((m, i) => {
                                const dosya = materyalSunumu(m);
                                return <li key={m._id || i} className="konu-materyal">
                                    <span className={`konu-dosya-simgesi konu-dosya-${dosya.grup}`} aria-hidden="true"><span>{dosya.uzanti || "DOSYA"}</span></span>
                                    <span className="konu-materyal-bilgi"><span className="konu-dosya-adi">{dosya.ad}</span>{dosya.boyut && <span className="konu-dosya-boyutu">{dosya.boyut}</span>}</span>
                                </li>;
                            })}</ul>}
            </aside>
        </div>
    </section>;
}

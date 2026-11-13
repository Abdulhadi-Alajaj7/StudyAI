import { BookOpenIcon, Square3Stack3DIcon, DocumentTextIcon, FolderOpenIcon } from "@heroicons/react/24/outline";
import { materyalSunumu } from "../utils/konuHaritasiSunumu.mjs";
import KonuHaritasiListesi from "./KonuHaritasiListesi.jsx";

export default function DersKonuHaritasi({ ders, harita, materyaller, isDark, yukleniyor, haritaHatasi, materyalHatasi, kartSayilari }) {
    const anaKonular = harita?.anaKonular || [];
    const altKonuSayisi = anaKonular.reduce((toplam, ana) => toplam + (ana.altKonular?.length || 0), 0);
    const aciklama = harita?.durum === "olusturuluyor" ? "Konu haritası hazırlanıyor. Hazır olduğunda burada görüntülenecek."
        : harita?.durum === "hata" ? "Konu haritası şu anda kullanılamıyor. Ders hazırlama durumunu kontrol edin." : "Bu ders için henüz bir konu haritası bulunmuyor.";
    return <section className="ders-konu-sayfasi" data-tema={isDark ? "koyu" : "acik"} aria-labelledby="konu-haritasi-baslik">
        <header className="konu-sayfa-baslik"><span className="konu-baslik-simgesi" aria-hidden="true"><Square3Stack3DIcon /></span>
            <div className="konu-baslik-metni"><h2 id="konu-haritasi-baslik">Konu Haritası</h2><p>Dersin ana konularını ve alt başlıklarını keşfet.</p></div>
            {!yukleniyor && !haritaHatasi && <dl className="konu-sayilari" aria-label="Konu sayıları">
                <div><dt>Ana Konu</dt><dd>{anaKonular.length}</dd></div>
                <div><dt>Alt Konu</dt><dd>{altKonuSayisi}</dd></div>
            </dl>}</header>
        <div className="konu-sayfa-yerlesim">
            <div className="konu-harita-karti">
                <div className="konu-harita-doku" aria-hidden="true" />
                <div className="konu-ders-koku"><BookOpenIcon aria-hidden="true" /><div><h3>{ders.dersAdi}</h3>{ders.dersKodu && <p>{ders.dersKodu}</p>}</div></div>
                {yukleniyor ? <p role="status" className="konu-bos-durum">Konu haritası yükleniyor...</p>
                    : haritaHatasi ? <p role="alert" className="konu-bos-durum konu-hata">{haritaHatasi}</p>
                        : !anaKonular.length ? <p role={harita?.durum === "hata" ? "alert" : "status"} className="konu-bos-durum">{aciklama}</p>
                            : <KonuHaritasiListesi anaKonular={anaKonular} kartSayilari={kartSayilari} />}
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

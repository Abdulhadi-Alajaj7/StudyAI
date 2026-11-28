import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import api from "../api";
import kartApi from "../services/calismaKartlariApi.mjs";
import { konuKartSayilariniHesapla } from "../utils/konuHaritasiSunumu.mjs";
import DersKonuHaritasi from "../components/DersKonuHaritasi.jsx";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";

function DersKonular() {
    const { isDark, ders } = useOutletContext();
    const { dersId } = useParams();
    const [veri, setVeri] = useState({ dersId: null, harita: null, materyaller: [], haritaHatasi: "", materyalHatasi: "" });
    const [kartVerisi, setKartVerisi] = useState({ dersId: null, sayilar: null });
    const [hakimiyetVerisi, setHakimiyetVerisi] = useState(null);
    useEffect(() => {
        const c = new AbortController();
        Promise.allSettled([
            api.get(`/dersler/${encodeURIComponent(dersId)}/konu-haritasi`, { withCredentials: true, signal: c.signal }),
            api.get(`/materyaller/ders/${encodeURIComponent(dersId)}`, { withCredentials: true, signal: c.signal }),
        ]).then(([harita, materyal]) => {
            if (c.signal.aborted) return;
            setVeri({ dersId, harita: harita.status === "fulfilled" ? harita.value.data.harita : null,
                materyaller: materyal.status === "fulfilled" ? materyal.value.data.materyaller || [] : [],
                haritaHatasi: harita.status === "rejected" ? kullaniciHataMesaji(harita.reason, "Konu haritası yüklenemedi.") : "",
                materyalHatasi: materyal.status === "rejected" ? kullaniciHataMesaji(materyal.reason, "Materyaller yüklenemedi.") : "" });
        });
        return () => c.abort();
    }, [dersId]);
    // Yalnız mevcut kayıtları oku; kart üretimini başlatma.
    useEffect(() => {
        const c = new AbortController();
        let zamanlayici;
        const oku = async () => {
            try {
                const { data } = await kartApi.listele(dersId, c.signal);
                if (c.signal.aborted) return;
                setKartVerisi({ dersId, sayilar: konuKartSayilariniHesapla(data) });
                if (data.uretimSuruyor) zamanlayici = setTimeout(oku, 3000);
            } catch {
                if (!c.signal.aborted) setKartVerisi({ dersId, sayilar: null });
            }
        };
        setKartVerisi({ dersId, sayilar: null });
        void oku();
        return () => { c.abort(); clearTimeout(zamanlayici); };
    }, [dersId]);
    useEffect(() => {
        const c = new AbortController();
        api.get(`/dersler/${encodeURIComponent(dersId)}/konu-hakimiyeti`, { withCredentials: true, signal: c.signal })
            .then(({ data }) => {
                if (!c.signal.aborted) {
                    setHakimiyetVerisi({ dersId, altKonular: new Map(data.altKonular.map(konu => [konu.konuId, konu])) });
                }
            })
            .catch(() => {
                if (!c.signal.aborted) setHakimiyetVerisi(null);
            });
        return () => c.abort();
    }, [dersId]);
    const yukleniyor = veri.dersId !== dersId;
    return <DersKonuHaritasi key={dersId} ders={ders} isDark={isDark} harita={yukleniyor ? null : veri.harita}
        kartSayilari={kartVerisi.dersId === dersId ? kartVerisi.sayilar : null}
        konuHakimiyeti={hakimiyetVerisi?.dersId === dersId ? hakimiyetVerisi.altKonular : null}
        materyaller={yukleniyor ? [] : veri.materyaller} haritaHatasi={veri.haritaHatasi} materyalHatasi={veri.materyalHatasi} yukleniyor={yukleniyor} />;
}

export default DersKonular;

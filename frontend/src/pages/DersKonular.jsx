import { useEffect, useState } from "react";
import { useOutletContext, useParams } from "react-router-dom";
import api from "../api";
import calismaKartlariApi from "../services/calismaKartlariApi.mjs";
import DersKonuHaritasi from "../components/DersKonuHaritasi.jsx";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";

function DersKonular() {
    const { isDark, ders } = useOutletContext();
    const { dersId } = useParams();
    const [veri, setVeri] = useState({ dersId: null, harita: null, materyaller: [], haritaHatasi: "", materyalHatasi: "", kartSayilari: null });
    useEffect(() => {
        const c = new AbortController();
        Promise.allSettled([
            api.get(`/dersler/${encodeURIComponent(dersId)}/konu-haritasi`, { withCredentials: true, signal: c.signal }),
            api.get(`/materyaller/ders/${encodeURIComponent(dersId)}`, { withCredentials: true, signal: c.signal }),
            calismaKartlariApi.listele(dersId, c.signal),
        ]).then(([harita, materyal, kartlar]) => {
            if (c.signal.aborted) return;
            const sayilar = kartlar.status === "fulfilled" ? (kartlar.value.data.kartlar || []).reduce((acc, kart) => {
                acc[kart.konuId] = (acc[kart.konuId] || 0) + 1;
                return acc;
            }, {}) : null;
            setVeri({ dersId, kartSayilari: sayilar, harita: harita.status === "fulfilled" ? harita.value.data.harita : null,
                materyaller: materyal.status === "fulfilled" ? materyal.value.data.materyaller || [] : [],
                haritaHatasi: harita.status === "rejected" ? kullaniciHataMesaji(harita.reason, "Konu haritası yüklenemedi.") : "",
                materyalHatasi: materyal.status === "rejected" ? kullaniciHataMesaji(materyal.reason, "Materyaller yüklenemedi.") : "" });
        });
        return () => c.abort();
    }, [dersId]);
    const yukleniyor = veri.dersId !== dersId;
    return <DersKonuHaritasi key={dersId} ders={ders} isDark={isDark} harita={yukleniyor ? null : veri.harita}
        materyaller={yukleniyor ? [] : veri.materyaller} haritaHatasi={veri.haritaHatasi} materyalHatasi={veri.materyalHatasi} kartSayilari={yukleniyor ? null : veri.kartSayilari} yukleniyor={yukleniyor} />;
}

export default DersKonular;

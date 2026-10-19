import api from "../api.js";

const kimlik = (deger) => encodeURIComponent(String(deger));
const istekAyarlari = (signal, params) => ({
    withCredentials: true,
    ...(signal ? { signal } : {}),
    ...(params ? { params } : {}),
});

export const sohbetApiOlustur = (istemci = api) => ({
    sohbetleriListele(dersId, { cursor = null, limit = 20, signal } = {}) {
        return istemci.get(`/dersler/${kimlik(dersId)}/sohbetler`, istekAyarlari(signal, {
            limit,
            ...(cursor ? { cursor } : {}),
        }));
    },

    sohbetOlustur(dersId, { ilkMesaj, istemciIstekId }, signal) {
        return istemci.post(
            `/dersler/${kimlik(dersId)}/sohbetler`,
            { ilkMesaj, istemciIstekId },
            istekAyarlari(signal)
        );
    },

    sohbetGetir(dersId, sohbetId, signal) {
        return istemci.get(
            `/dersler/${kimlik(dersId)}/sohbetler/${kimlik(sohbetId)}`,
            istekAyarlari(signal)
        );
    },

    mesajlariGetir(dersId, sohbetId, { cursor = null, limit = 50, signal } = {}) {
        return istemci.get(
            `/dersler/${kimlik(dersId)}/sohbetler/${kimlik(sohbetId)}/mesajlar`,
            istekAyarlari(signal, {
                limit,
                ...(cursor ? { cursor } : {}),
            })
        );
    },

    mesajGonder(dersId, sohbetId, { icerik, istemciIstekId }, signal) {
        return istemci.post(
            `/dersler/${kimlik(dersId)}/sohbetler/${kimlik(sohbetId)}/mesajlar`,
            { icerik, istemciIstekId },
            istekAyarlari(signal)
        );
    },

    baslikGuncelle(dersId, sohbetId, baslik) {
        return istemci.patch(
            `/dersler/${kimlik(dersId)}/sohbetler/${kimlik(sohbetId)}`,
            { baslik },
            istekAyarlari()
        );
    },

    sohbetSil(dersId, sohbetId) {
        return istemci.delete(
            `/dersler/${kimlik(dersId)}/sohbetler/${kimlik(sohbetId)}`,
            istekAyarlari()
        );
    },
});

export default sohbetApiOlustur();

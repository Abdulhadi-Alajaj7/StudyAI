import api from "../api.js";

const kimlik = (deger) => encodeURIComponent(String(deger));
const istekAyarlari = (signal, params) => ({
    withCredentials: true,
    ...(signal ? { signal } : {}),
    ...(params ? { params } : {}),
});

export const dersOzetiApiOlustur = (istemci = api) => ({
    materyalleriGetir(dersId, signal) {
        return istemci.get(
            `/materyaller/ders/${kimlik(dersId)}`,
            istekAyarlari(signal)
        );
    },

    konuHaritasiniGetir(dersId, signal) {
        return istemci.get(
            `/dersler/${kimlik(dersId)}/konu-haritasi`,
            istekAyarlari(signal)
        );
    },

    kayitliOzetiGetir(dersId, girdi, signal) {
        return istemci.get(
            `/dersler/${kimlik(dersId)}/ozetler`,
            istekAyarlari(signal, girdi)
        );
    },

    ozetOlustur(dersId, girdi, signal) {
        return istemci.post(
            `/dersler/${kimlik(dersId)}/ozetler`,
            girdi,
            istekAyarlari(signal)
        );
    },

    ozetYenidenOlustur(dersId, girdi, signal) {
        return istemci.post(
            `/dersler/${kimlik(dersId)}/ozetler/yeniden-olustur`,
            girdi,
            istekAyarlari(signal)
        );
    },
});

export default dersOzetiApiOlustur();

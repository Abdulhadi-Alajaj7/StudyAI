import api from "../api.js";

const kimlik = (deger) => encodeURIComponent(String(deger));
const istekAyarlari = (signal) => ({
    withCredentials: true,
    ...(signal ? { signal } : {}),
});

export const testlerApiOlustur = (istemci = api) => ({
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

    devamEdenTestleriGetir(dersId, signal) {
        return istemci.get(
            `/dersler/${kimlik(dersId)}/testler/devam-eden`,
            istekAyarlari(signal)
        );
    },

    tamamlananTestleriGetir(dersId, signal) {
        return istemci.get(
            `/dersler/${kimlik(dersId)}/testler/tamamlanan`,
            istekAyarlari(signal)
        );
    },

    testOlustur(dersId, girdi, signal) {
        return istemci.post(
            `/dersler/${kimlik(dersId)}/testler`,
            girdi,
            istekAyarlari(signal)
        );
    },

    testiBaslat(dersId, testId, signal) {
        return istemci.post(
            `/dersler/${kimlik(dersId)}/testler/${kimlik(testId)}/baslat`,
            {},
            istekAyarlari(signal)
        );
    },

    testDetayiniGetir(dersId, testId, signal) {
        return istemci.get(
            `/dersler/${kimlik(dersId)}/testler/${kimlik(testId)}`,
            istekAyarlari(signal)
        );
    },

    cevabiKaydet(dersId, testId, soruId, cevap, signal) {
        return istemci.patch(
            `/dersler/${kimlik(dersId)}/testler/${kimlik(testId)}/sorular/${kimlik(soruId)}/cevap`,
            { cevap },
            istekAyarlari(signal)
        );
    },

    soruIsaretiniGuncelle(dersId, testId, soruId, isaretli, signal) {
        return istemci.patch(
            `/dersler/${kimlik(dersId)}/testler/${kimlik(testId)}/sorular/${kimlik(soruId)}/isaret`,
            { isaretli },
            istekAyarlari(signal)
        );
    },

    sonSoruyuKaydet(dersId, testId, soruIndex, signal) {
        return istemci.patch(
            `/dersler/${kimlik(dersId)}/testler/${kimlik(testId)}/son-soru`,
            { soruIndex },
            istekAyarlari(signal)
        );
    },

    testiTamamla(dersId, testId, signal) {
        return istemci.post(
            `/dersler/${kimlik(dersId)}/testler/${kimlik(testId)}/tamamla`,
            {},
            istekAyarlari(signal)
        );
    },

    testSonucunuGetir(dersId, testId, signal) {
        return istemci.get(
            `/dersler/${kimlik(dersId)}/testler/${kimlik(testId)}/sonuc`,
            istekAyarlari(signal)
        );
    },
});

export default testlerApiOlustur();

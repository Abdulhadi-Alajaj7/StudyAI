import api from "../api.js";
const id = deger => encodeURIComponent(String(deger));
const ayarlar = signal => ({ withCredentials: true, ...(signal ? { signal } : {}) });
export const calismaKartlariApiOlustur = (istemci = api) => ({
    getir: (dersId, signal) => istemci.get(`/dersler/${id(dersId)}/calisma-kartlari`, ayarlar(signal)),
    olustur: (dersId, signal) => istemci.post(`/dersler/${id(dersId)}/calisma-kartlari/olustur`, {}, ayarlar(signal)),
    durumKaydet: (dersId, kartId, girdi, signal) => istemci.patch(`/dersler/${id(dersId)}/calisma-kartlari/${id(kartId)}/durum`, girdi, ayarlar(signal)),
    degerlendir: (dersId, kartId, girdi, signal) => istemci.post(`/dersler/${id(dersId)}/calisma-kartlari/${id(kartId)}/degerlendirmeler`, girdi, ayarlar(signal)),
});
export default calismaKartlariApiOlustur();

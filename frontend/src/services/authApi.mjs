import api from "../api.js";
export const authApiOlustur = client => ({
    profil: signal => client.get("/auth/profil", { withCredentials: true, signal }),
    profilKaydet: (veri, signal) => client.put("/auth/profil", veri, { withCredentials: true, signal }),
    sifreDegistir: (veri, signal) => client.post("/auth/sifre-degistir", veri, { withCredentials: true, signal }),
    sifremiUnuttum: (email, signal) => client.post("/auth/forgot-password", { email }, { withCredentials: true, signal }),
    sifreSifirla: (token, veri, signal) => client.post(`/auth/reset-password/${encodeURIComponent(token)}`, veri, { withCredentials: true, signal }),
    emailDogrula: (token, signal) => client.post("/auth/email-change/verify", { token }, { withCredentials: true, signal }),
    cikis: () => client.post("/auth/cikis", {}, { withCredentials: true }),
    kayitDogrula: (token, signal) => client.post("/auth/verify-email", { token }, { signal }),
    kayitYenidenGonder: (email, signal) => client.post("/auth/resend-verification", { email }, { signal }),
});
export default authApiOlustur(api);

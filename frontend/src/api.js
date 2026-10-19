import axios from "axios";
import { kullaniciHataMesaji } from "./utils/kullaniciHatasi.mjs";

const yapilandirilanBaseUrl = import.meta.env?.VITE_API_BASE_URL?.trim();
const baseURL = (yapilandirilanBaseUrl || "http://localhost:5000").replace(/\/+$/, "");

const api = axios.create({ baseURL });

api.interceptors.response.use(
    (yanit) => yanit,
    (hata) => {
        hata.kullaniciMesaji = kullaniciHataMesaji(hata);

        if (hata.response?.data && typeof hata.response.data === "object") {
            const alanlar = ["hata", "mesaj", "message"];
            let alanGuncellendi = false;

            for (const alan of alanlar) {
                if (hata.response.data[alan]) {
                    hata.response.data[alan] = hata.kullaniciMesaji;
                    alanGuncellendi = true;
                }
            }
            if (!alanGuncellendi) hata.response.data.hata = hata.kullaniciMesaji;
        }

        return Promise.reject(hata);
    }
);

export default api;

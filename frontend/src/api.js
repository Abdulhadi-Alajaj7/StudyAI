import axios from "axios";

const yapilandirilanBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const baseURL = (yapilandirilanBaseUrl || "http://localhost:5000").replace(/\/+$/, "");

const api = axios.create({ baseURL });

export default api;


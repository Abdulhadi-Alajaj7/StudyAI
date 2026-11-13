// Erişim listesi yalnız izinli canlı doğrulamadan sonra işletmeci tarafından doldurulur.
const gorevler = { konu_haritasi: "KONU_HARITASI", kart: "KART", test: "TEST", ozet: "OZET", sohbet: "SOHBET", sohbet_basligi: "SOHBET_BASLIK" };
export const modelKimliginiNormallestir = model => String(model || "").trim().replace(/^models\//, "");
const modelGecerli = model => /^[a-zA-Z0-9_.-]{1,120}$/.test(model) && !/^(AIza|sk-)/.test(model);
export const modelKotalariniGetir = (model, env = process.env) => {
    let profiller;
    try { profiller = JSON.parse(env.GEMINI_MODEL_KOTALARI || "{}"); }
    catch { throw Object.assign(new Error("Gemini model kota yapılandırması geçersiz."), { kod: "GEMINI_YAPILANDIRMA", status: 500 }); }
    if (!profiller || typeof profiller !== "object" || Array.isArray(profiller)) throw Object.assign(new Error("Gemini model kota yapılandırması nesne olmalı."), { kod: "GEMINI_YAPILANDIRMA", status: 500 });
    const profil = profiller[modelKimliginiNormallestir(model)];
    if (profil == null) return null;
    if (!["rpm", "tpm", "rpd"].every(k => Number.isSafeInteger(profil[k]) && profil[k] >= 0)) {
        throw Object.assign(new Error("Gemini model kota değerleri geçersiz."), { kod: "GEMINI_YAPILANDIRMA", status: 500 });
    }
    return profil;
};
export const geminiModelRotasiniGetir = (gorev, mevcutModel, env = process.env) => {
    const eski = modelKimliginiNormallestir(mevcutModel), alan = gorevler[gorev];
    if (!alan || env.GEMINI_MODEL_ROUTING_AKTIF !== "true") return { primary: eski, fallback: null };
    const dogrulanan = new Set(String(env.GEMINI_DOGRULANMIS_MODELLER || "").split(",").map(modelKimliginiNormallestir).filter(modelGecerli));
    const aday = modelKimliginiNormallestir(env[`GEMINI_${alan}_PRIMARY_MODELI`]);
    const primary = aday && dogrulanan.has(aday) ? aday : eski;
    const fallback = modelKimliginiNormallestir(env[`GEMINI_${alan}_FALLBACK_MODELI`]);
    const kota = fallback && dogrulanan.has(fallback) ? modelKotalariniGetir(fallback, env) : null;
    return { primary, fallback: fallback !== primary && dogrulanan.has(fallback) && kota &&
        [kota.rpm, kota.tpm, kota.rpd].every(v => v > 0) ? fallback : null };
};

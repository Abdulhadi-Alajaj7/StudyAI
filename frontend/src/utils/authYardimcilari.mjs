export const basHarfler = ad => (ad?.trim().split(/\s+/u).filter(Boolean).map(p => p[0]).filter((_, i, a) => i === 0 || i === a.length - 1).join("") || "K").toLocaleUpperCase("tr-TR");
export const yeniSifreHatasi = (sifre, tekrar) => {
    if (sifre !== tekrar) return "Yeni şifreler eşleşmiyor.";
    if (sifre.length < 6 || new TextEncoder().encode(sifre).length > 72) return "Şifre en az 6 karakter ve en fazla 72 UTF-8 bayt olmalıdır.";
    return "";
};
export const guvenliDonusYolu = yol => typeof yol === "string" && /^\/eposta-dogrula\/[a-f0-9]{64}$/.test(yol) ? yol : "/panel";

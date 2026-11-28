const yuzdeBicimi = new Intl.NumberFormat("tr-TR", { style: "percent", maximumFractionDigits: 2 });
export const performansYuzdesi = yuzde => Number.isFinite(yuzde) ? yuzdeBicimi.format(yuzde / 100) : "Veri Yok";
export const performansSayisi = new Intl.NumberFormat("tr-TR");
const tarihBicimi = new Intl.DateTimeFormat("tr-TR", {
    timeZone: "Europe/Istanbul", day: "numeric", month: "short", year: "numeric"
});
export const performansTarihi = tarih => tarih && Number.isFinite(new Date(tarih).getTime())
    ? tarihBicimi.format(new Date(tarih)) : "Tarih bilgisi yok";

const KOD_PARCASI_DESENI = /(```[\s\S]*?(?:```|$)|~~~[\s\S]*?(?:~~~|$)|`[^`\r\n]*`)/g;
const DAHILI_ATIF_DESENI = /[ \t]*\[K[1-9]\d*(?:[ \t]*,[ \t]*K[1-9]\d*)*[ \t]*\](?![ \t]*(?:\(|\[|:))[ \t]*/g;

const duzMetindekiAtiflariTemizle = (metin) => String(metin).replace(
    DAHILI_ATIF_DESENI,
    (eslesme, konum, tumMetin) => {
        const onceki = tumMetin[konum - 1] || "";
        const sonraki = tumMetin[konum + eslesme.length] || "";
        const ikiKelimeArasinda = /[\p{L}\p{N}\])]/u.test(onceki) && /[\p{L}\p{N}\[(]/u.test(sonraki);
        return ikiKelimeArasinda ? " " : "";
    }
);

export const dahiliKaynakAtiflariniTemizle = (icerik) => String(icerik || "")
    .split(KOD_PARCASI_DESENI)
    .map((parca, index) => index % 2 === 1 ? parca : duzMetindekiAtiflariTemizle(parca))
    .join("");

export default dahiliKaynakAtiflariniTemizle;

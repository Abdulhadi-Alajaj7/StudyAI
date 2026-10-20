const DAHILI_REFERANS_TANIMI_DESENI = /^[ \t]*\[K[1-9]\d*(?:[ \t]*,[ \t]*K[1-9]\d*)*[ \t]*\][ \t]*:[^\r\n]*(?:\r?\n|$)/gm;
const DAHILI_ATIF_DESENI = /[ \t]*\[K[1-9]\d*(?:[ \t]*,[ \t]*K[1-9]\d*)*[ \t]*\](?:[ \t]*\([^\r\n)]*\))?[ \t]*/g;

const duzMetindekiAtiflariTemizle = (metin) => String(metin)
    .replace(DAHILI_REFERANS_TANIMI_DESENI, "")
    .replace(DAHILI_ATIF_DESENI, (eslesme, konum, tumMetin) => {
        const onceki = tumMetin[konum - 1] || "";
        const sonraki = tumMetin[konum + eslesme.length] || "";
        const ikiKelimeArasinda = /[\p{L}\p{N}\])]/u.test(onceki) && /[\p{L}\p{N}\[(]/u.test(sonraki);
        return ikiKelimeArasinda ? " " : "";
    });

export const dahiliKaynakAtiflariniTemizle = (icerik) =>
    duzMetindekiAtiflariTemizle(String(icerik || ""));

export default dahiliKaynakAtiflariniTemizle;

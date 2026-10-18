export const dersDetayTablari = [
    { anahtar: "genel-bakis", etiket: "Genel Bakış", segment: "" },
    { anahtar: "konular", etiket: "Konular", segment: "konular" },
    { anahtar: "ozet", etiket: "Özet", segment: "ozet" },
    { anahtar: "sohbet", etiket: "Sohbet", segment: "sohbet" },
    { anahtar: "testler", etiket: "Testler", segment: "testler" },
    { anahtar: "calisma-kartlari", etiket: "Çalışma Kartları", segment: "calisma-kartlari" },
];

export const dersDetayYolu = (dersId, segment = "") => {
    const temelYol = `/dersler/${encodeURIComponent(String(dersId))}`;
    return segment ? `${temelYol}/${segment}` : temelYol;
};

export const dersDuzenlemeYolu = (dersId, donus = "dersler") => (
    `${dersDetayYolu(dersId)}/duzenle?donus=${donus === "detay" ? "detay" : "dersler"}`
);

export const gecerliDersKimligiMi = (dersId) => /^[a-f\d]{24}$/i.test(String(dersId || ""));

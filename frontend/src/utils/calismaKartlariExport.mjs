/**
 * Çalışma kartı dışa aktarımı: öğrenci kimliği ve veritabanı ID'si içermez.
 * Kaynak adı / soru / cevap korunur. Mevcut filtreye bağlı değildir.
 */

const sutunlar = [
  ["Sıra", (_, i) => i + 1],
  ["Soru", (k) => k.soru || ""],
  ["Cevap", (k) => k.cevap || ""],
  ["Bilgi Türü", (k) => ({
    kaynak: "Kaynak metni", genel: "Genel bilgi", gemini: "Gemini / ders kaynağı",
  })[k.uretimYontemi] || "Belirtilmemiş"],
  ["Kaynak Dosyaları", (k) => [...new Set((k.kaynaklar || [])
    .map((x) => String(x?.dosyaAdi || "").trim()).filter(Boolean))].join(" | ")],
  ["Görüldü", (k) => k.goruldu ? "Evet" : "Hayır"],
  ["Yıldızlı", (k) => k.yildizli ? "Evet" : "Hayır"],
  ["Zorluk", (k) => ({ zor: "Zor", orta: "Orta", kolay: "Kolay" })[k.zorluk] || ""],
];

/** Formül enjeksiyonunu engelle; tüm hücreler metin olarak açılabilsin. */
const guvenliExcelMetni = (deger) => {
  const metin = String(deger ?? "");
  return /^[\s\u0000-\u001f]*[=+\-@]/u.test(metin) ? "'" + metin : metin;
};
const csvHucresi = (deger) => '"' + guvenliExcelMetni(deger).replace(/"/g, '""') + '"';

export const calismaKartlariCsvOlustur = (kartlar) => {
  const satirlar = [
    "sep=;",
    sutunlar.map(([ad]) => csvHucresi(ad)).join(";"),
    ...kartlar.map((kart, i) => sutunlar
      .map(([, deger]) => csvHucresi(deger(kart, i))).join(";")),
  ];
  // UTF-8 BOM, Excel'de Türkçe karakterlerin bozulmasını önler.
  return "\uFEFF" + satirlar.join("\r\n") + "\r\n";
};

export const calismaKartlariJsonOlustur = (kartlar) => JSON.stringify({
  format: "StudyAI Çalışma Kartları",
  surum: 1,
  toplamKart: kartlar.length,
  kartlar: kartlar.map((kart, i) => ({
    sira: i + 1,
    soru: kart.soru || "",
    cevap: kart.cevap || "",
    bilgiTuru: ({
      kaynak: "Kaynak metni", genel: "Genel bilgi", gemini: "Gemini / ders kaynağı",
    })[kart.uretimYontemi] || "Belirtilmemiş",
    kaynaklar: (kart.kaynaklar || []).map((kaynak) => ({
      dosyaAdi: kaynak.dosyaAdi || "",
      parcaIndex: Number.isInteger(kaynak.parcaIndex) ? kaynak.parcaIndex : null,
    })),
    goruldu: Boolean(kart.goruldu),
    yildizli: Boolean(kart.yildizli),
    zorluk: kart.zorluk || null,
  })),
}, null, 2);

export const calismaKartlariDosyasiniIndir = (kartlar, tur = "csv") => {
  if (!Array.isArray(kartlar) || !kartlar.length) {
    throw new Error("Dışa aktarılacak çalışma kartı bulunamadı.");
  }
  if (!["csv", "json"].includes(tur)) throw new Error("Geçersiz dosya türü.");
  const csv = tur === "csv";
  const icerik = csv ? calismaKartlariCsvOlustur(kartlar) : calismaKartlariJsonOlustur(kartlar);
  const dosya = new Blob([icerik], {
    type: csv ? "text/csv;charset=utf-8" : "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(dosya);
  const baglanti = document.createElement("a");
  baglanti.href = url;
  baglanti.download = "StudyAI_Calisma_Kartlari_" + new Date().toISOString().slice(0, 10) +
    (csv ? ".csv" : ".json");
  baglanti.style.display = "none";
  document.body.appendChild(baglanti);
  try {
    baglanti.click();
  } finally {
    baglanti.remove();
    // URL'yi indirme işlemi başladıktan sonra serbest bırak.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
};

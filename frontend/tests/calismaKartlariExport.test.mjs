import test from "node:test";
import assert from "node:assert/strict";
import {
  calismaKartlariCsvOlustur,
  calismaKartlariJsonOlustur,
  calismaKartlariDosyasiniIndir,
} from "../src/utils/calismaKartlariExport.mjs";

const kartlar = [
  {
    _id: "private-card-id", kullaniciId: "private-student-id", dersId: "private-course-id",
    konuId: "k1", konuBasligi: "Veri Ön İşleme",
    soru: 'MCAR, MAR ve MNAR arasındaki fark nedir?',
    cevap: 'Eksiklik mekanizmalarıdır.\n"MCAR" gözlemlerden bağımsızdır.',
    uretimYontemi: "gemini",
    kaynaklar: [
      { dosyaAdi: "Hafta_03.pdf", parcaIndex: 5 },
      { dosyaAdi: "Hafta_03.pdf", parcaIndex: 6 },
    ],
    goruldu: true, yildizli: false, zorluk: "zor",
  },
  {
    _id: "second-id", konuBasligi: "=HYPERLINK('example')",
    soru: "İlk kavram nedir?", cevap: "+1+2",
    uretimYontemi: "genel", kaynaklar: [],
    goruldu: false, yildizli: true, zorluk: null,
  },
];

test("Excel CSV Türkçe karakterleri, çok satırlı cevabı, kaynak adlarını bozmadan dışa aktarır", () => {
  const sonuc = calismaKartlariCsvOlustur(kartlar);
  assert.ok(sonuc.startsWith("\uFEFFsep=;\r\n"));
  assert.match(sonuc, /"Konu";"Soru";"Cevap"/);
  assert.match(sonuc, /"Veri Ön İşleme"/);
  assert.match(sonuc, /"MCAR, MAR ve MNAR/);
  assert.match(sonuc, /"Eksiklik mekanizmalarıdır\.\n""MCAR"" gözlemlerden bağımsızdır\."/);
  assert.match(sonuc, /"Hafta_03\.pdf"/);
  assert.match(sonuc, /"Zor"/);
  assert.doesNotMatch(sonuc, /private-student-id|private-course-id|private-card-id/);
});

test("Excel formül enjeksiyonu soruda, cevapta ve konuda engellenir", () => {
  const sonuc = calismaKartlariCsvOlustur(kartlar);
  assert.match(sonuc, /"'=HYPERLINK/);
  assert.match(sonuc, /"'\+1\+2"/);
});

test("JSON tüm kartları korur, kaynakları aktarır, özel kimlikleri dışarı çıkarmaz", () => {
  const sonuc = JSON.parse(calismaKartlariJsonOlustur(kartlar));
  assert.equal(sonuc.toplamKart, 2);
  assert.equal(sonuc.kartlar[0].soru, kartlar[0].soru);
  assert.equal(sonuc.kartlar[0].cevap, kartlar[0].cevap);
  assert.deepEqual(sonuc.kartlar[0].kaynaklar, [
    { dosyaAdi: "Hafta_03.pdf", parcaIndex: 5 },
    { dosyaAdi: "Hafta_03.pdf", parcaIndex: 6 },
  ]);
  assert.equal(sonuc.kartlar[1].bilgiTuru, "Genel bilgi");
  assert.equal(sonuc.kartlar[0].zorluk, "zor");
  assert.ok(!sonuc.kartlar[0].kullaniciId);
  assert.ok(!sonuc.kartlar[0]._id);
  assert.ok(!sonuc.kartlar[0].dersId);
});

test("Boş kart listesi indirmeyi başlatmaz", () => {
  assert.throws(() => calismaKartlariDosyasiniIndir([], "csv"), /bulunamadı/);
  assert.throws(() => calismaKartlariDosyasiniIndir(kartlar, "xlsx"), /Geçersiz dosya/);
});

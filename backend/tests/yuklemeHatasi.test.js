import test from "node:test";
import assert from "node:assert/strict";
import { yuklemeHatasiniYanitaCevir } from "../utils/yuklemeHatasi.js";

test("Multer beklenmeyen alan hatası teknik İngilizce mesaj göstermeden çevrilir", () => {
    const sonuc = yuklemeHatasiniYanitaCevir(
        { code: "LIMIT_UNEXPECTED_FILE", field: "file", message: "Unexpected field" }
    );

    assert.equal(sonuc.kod, "LIMIT_UNEXPECTED_FILE");
    assert.match(sonuc.mesaj, /yükleme alanı geçersiz/i);
    assert.doesNotMatch(sonuc.mesaj, /unexpected field/i);
});

test("Multer dosya sayısı aşımı ders başına 3 materyal sınırını bildirir", () => {
    const sonuc = yuklemeHatasiniYanitaCevir(
        { code: "LIMIT_UNEXPECTED_FILE", field: "dosyalar" }
    );

    assert.equal(sonuc.kod, "DOSYA_SAYISI_ASILDI");
    assert.match(sonuc.mesaj, /en fazla 3 materyal/i);
});

test("Multer boyut ve dosya türü hataları eyleme dönük Türkçe mesaj verir", () => {
    const boyut = yuklemeHatasiniYanitaCevir({ code: "LIMIT_FILE_SIZE" });
    const tur = yuklemeHatasiniYanitaCevir({ code: "DESTEKLENMEYEN_DOSYA_TURU" });

    assert.match(boyut.mesaj, /PDF 2 MB, PPTX 2 MB, DOCX 1 MB, TXT 50 KB/);
    assert.match(tur.mesaj, /PDF, DOCX, PPTX veya TXT/);
});

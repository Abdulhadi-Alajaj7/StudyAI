import test from "node:test";
import assert from "node:assert/strict";
import { yuklemeHatasiniYanitaCevir } from "../utils/yuklemeHatasi.js";

const limitler = {
    maksimumDosyaSayisi: 10,
    maksimumDosyaBoyutu: 50 * 1024 * 1024
};

test("Multer beklenmeyen alan hatası teknik İngilizce mesaj göstermeden çevrilir", () => {
    const sonuc = yuklemeHatasiniYanitaCevir(
        { code: "LIMIT_UNEXPECTED_FILE", field: "file", message: "Unexpected field" },
        limitler
    );

    assert.equal(sonuc.kod, "LIMIT_UNEXPECTED_FILE");
    assert.match(sonuc.mesaj, /yükleme alanı geçersiz/i);
    assert.doesNotMatch(sonuc.mesaj, /unexpected field/i);
});

test("Multer dosya sayısı aşımı mevcut 10 dosya sınırını bildirir", () => {
    const sonuc = yuklemeHatasiniYanitaCevir(
        { code: "LIMIT_UNEXPECTED_FILE", field: "dosyalar" },
        limitler
    );

    assert.equal(sonuc.kod, "DOSYA_SAYISI_ASILDI");
    assert.match(sonuc.mesaj, /en fazla 10 dosya/i);
});

test("Multer boyut ve dosya türü hataları eyleme dönük Türkçe mesaj verir", () => {
    const boyut = yuklemeHatasiniYanitaCevir({ code: "LIMIT_FILE_SIZE" }, limitler);
    const tur = yuklemeHatasiniYanitaCevir({ code: "DESTEKLENMEYEN_DOSYA_TURU" }, limitler);

    assert.match(boyut.mesaj, /50 MB/);
    assert.match(tur.mesaj, /PDF, DOCX, PPTX veya TXT/);
});

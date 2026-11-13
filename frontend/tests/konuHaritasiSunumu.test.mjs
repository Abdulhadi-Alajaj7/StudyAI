import test from "node:test";
import assert from "node:assert/strict";
import { materyalSunumu, dosyaBoyutuMetni } from "../src/utils/konuHaritasiSunumu.mjs";

test("dört dosya ailesi gerçek ad/uzantıdan ayrılır; DOC/PPT eski uzantıları da desteklenir", () => {
    for (const [ad, grup] of [["Notlar.PDF", "pdf"], ["Çalışma.doc", "doc"], ["Çalışma.DOCX", "doc"], ["Sunum.ppt", "ppt"], ["Sunum.PPTX", "ppt"], ["Özet.txt", "txt"]]) {
        const m = { orijinalDosyaAdi: ad, dosyaAdi: "sunucudaki-isim.bin", dosyaBoyutu: 2048 };
        const r = materyalSunumu(m); assert.equal(r.ad, ad); assert.equal(r.grup, grup); assert.equal(r.boyut, "2 KB");
        assert.equal(m.orijinalDosyaAdi, ad);
    }
});
test("boyut yoksa uydurulmaz; sıfır, KB/MB/GB ve Türkçe ondalıklar doğru sunulur", () => {
    for (const v of [null, undefined, -1, NaN, Infinity, "1024"]) assert.equal(dosyaBoyutuMetni(v), "");
    assert.equal(dosyaBoyutuMetni(0), "0 B"); assert.equal(dosyaBoyutuMetni(1536), "1,5 KB");
    assert.equal(dosyaBoyutuMetni(1024 ** 2), "1 MB"); assert.equal(dosyaBoyutuMetni(1024 ** 3), "1 GB");
});
test("eksik uzantıda mevcut tür/mime kullanılır; uzun ve noktalı gerçek dosya adları korunur", () => {
    assert.equal(materyalSunumu({ dosyaAdi: "Metin", dosyaTuru: ".TXT" }).uzanti, "TXT");
    assert.equal(materyalSunumu({ orijinalDosyaAdi: "Notlar", mimeTuru: "application/pdf" }).grup, "pdf");
    const ad = "Çok uzun bir materyal başlığı. ".repeat(12) + "docx";
    assert.equal(materyalSunumu({ orijinalDosyaAdi: ad }).ad, ad);
    assert.equal(materyalSunumu({ dosyaAdi: "arşiv.zip" }).grup, "diger");
});

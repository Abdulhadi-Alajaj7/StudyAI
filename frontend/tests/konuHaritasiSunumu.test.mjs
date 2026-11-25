import test from "node:test";
import assert from "node:assert/strict";
import { materyalSunumu, dosyaBoyutuMetni, konuKartSayilariniHesapla } from "../src/utils/konuHaritasiSunumu.mjs";

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

test("kartlar gerçek konuId ile sayılır; eski bağlantısız kartlar sayılmaz", () => {
    const kartlar = [{konuId:"sub-1"}, {konuId:"sub-1"}, {konuId:"sub-2"}, {konuId:"top-1"}, {}, {konuId:""}];
    const sayilar = konuKartSayilariniHesapla({dersKartTamamlandi:true,kartlar});
    assert.deepEqual({...sayilar},{"sub-1":2,"sub-2":1,"top-1":1});
    assert.equal(sayilar["sub-3"] || 0,0);
    assert.deepEqual({...konuKartSayilariniHesapla({kartlar:[]})},{});
});
test("üretim sürerken veya veri alınamazken yanıltıcı kart sayısı gösterilmez", () => {
    for (const durum of [null,{}, {kartlar:[],uretimSuruyor:true},{kartlar:[],uretimHatasi:"503"},{kartlar:[],yeniKonuKartlariGerekli:true}]) {
        assert.equal(konuKartSayilariniHesapla(durum),null);
    }
});

import test from "node:test";
import assert from "node:assert/strict";

import {
    basariOraniniGetir,
    soruIndeksiniSinirla,
    soruKaynakAdlariniGetir,
    soruSonucDurumunuGetir,
    testCozumOzetiniGetir,
    testCozmeYolu,
    testHedefBilgisi,
    testIlerlemeBilgisi,
    testOlusturmaButonuDevreDisiMi,
    testOlusturmaGirdisiOlustur,
    testSonucYolu,
} from "../src/utils/testlerYardimcilari.mjs";

test("test oluşturma girdisi yalnızca seçilen kapsama ait kimliği taşır", () => {
    const tumDersGirdisi = testOlusturmaGirdisiOlustur({
        kapsamTuru: "tum_ders",
        soruSayisi: 10,
        zorluk: "karisik",
        materyalId: "m1",
        konuId: "k1",
    });
    assert.deepEqual(tumDersGirdisi, {
        kapsamTuru: "tum_ders",
        soruSayisi: 10,
        zorluk: "karisik",
    });
    assert.equal(testOlusturmaButonuDevreDisiMi({
        sayfaYukleniyor: false,
        olusturuluyor: false,
        olusturmaGirdisi: tumDersGirdisi,
    }), false);
    assert.equal(testOlusturmaButonuDevreDisiMi({
        sayfaYukleniyor: true,
        olusturuluyor: false,
        olusturmaGirdisi: tumDersGirdisi,
    }), true);
    assert.deepEqual(testOlusturmaGirdisiOlustur({
        kapsamTuru: "materyal",
        soruSayisi: 5,
        zorluk: "kolay",
        materyalId: "m1",
        konuId: "k1",
    }), { kapsamTuru: "materyal", soruSayisi: 5, zorluk: "kolay", materyalId: "m1" });
    assert.equal(testOlusturmaGirdisiOlustur({
        kapsamTuru: "konu",
        soruSayisi: 10,
        zorluk: "orta",
    }), null);
});

test("ilerleme son görüntülenen sorudan tahmin edilmez", () => {
    assert.deepEqual(testIlerlemeBilgisi({
        durum: "devam_ediyor",
        soruSayisi: 10,
        sonGoruntulenenSoru: 7,
    }), { toplam: 10, cevaplanan: null, yuzde: null, biliniyor: false });
    assert.deepEqual(testIlerlemeBilgisi({
        durum: "hazirlandi",
        soruSayisi: 10,
    }), { toplam: 10, cevaplanan: 0, yuzde: 0, biliniyor: true });
    assert.equal(testIlerlemeBilgisi({ soruSayisi: 0 }), null);
});

test("backend cevaplanan sayısını sağlarsa ilerleme güvenli aralıkta hesaplanır", () => {
    assert.deepEqual(testIlerlemeBilgisi({
        durum: "devam_ediyor",
        soruSayisi: 10,
        cevaplananSoruSayisi: 6,
    }), { toplam: 10, cevaplanan: 6, yuzde: 60, biliniyor: true });
    assert.equal(basariOraniniGetir({ sonuc: { basariOrani: 125 } }), 100);
});

test("test başlığı gerçek materyal veya konu verisinden çözülür", () => {
    assert.deepEqual(testHedefBilgisi(
        { kapsamTuru: "materyal", materyalId: "m1" },
        { materyaller: [{ _id: "m1", orijinalDosyaAdi: "Hafta 1.pdf" }] }
    ), { baslik: "Hafta 1.pdf", kapsam: "Materyal" });
    assert.deepEqual(testHedefBilgisi(
        { kapsamTuru: "konu", konuId: "k1", konuBasligi: "Sanal Bellek" },
        { konular: [] }
    ), { baslik: "Sanal Bellek", kapsam: "Konu" });
});

test("gelecek çözme ve sonuç rotaları kimlikleri güvenli biçimde korur", () => {
    assert.equal(
        testCozmeYolu("ders 1", "test/1"),
        "/dersler/ders%201/testler/test%2F1/coz"
    );
    assert.equal(
        testSonucYolu("ders 1", "test/1"),
        "/dersler/ders%201/testler/test%2F1/sonuc"
    );
});

test("çözme özeti gerçek cevap, boş ve işaret durumlarını birbirinden bağımsız sayar", () => {
    const ozet = testCozumOzetiniGetir({
        sorular: [
            { ogrenciCevabi: "A", isaretli: false },
            { ogrenciCevabi: null, isaretli: true },
            { ogrenciCevabi: "C", isaretli: true },
            { ogrenciCevabi: null, isaretli: false },
        ],
    });
    assert.deepEqual(ozet, {
        toplam: 4,
        cevaplanan: 2,
        bos: 2,
        isaretli: 2,
        yuzde: 50,
    });
    assert.equal(soruIndeksiniSinirla(8, 4), 3);
    assert.equal(soruIndeksiniSinirla(-2, 4), 0);
});

test("sonuç durumu backend doğru cevabına göre belirlenir ve kaynak adları uydurulmaz", () => {
    assert.equal(soruSonucDurumunuGetir({ ogrenciCevabi: "A", dogruCevap: "A" }), "dogru");
    assert.equal(soruSonucDurumunuGetir({ ogrenciCevabi: "B", dogruCevap: "A" }), "yanlis");
    assert.equal(soruSonucDurumunuGetir({ ogrenciCevabi: null, dogruCevap: "A" }), "bos");
    assert.deepEqual(soruKaynakAdlariniGetir({
        kaynaklar: [
            { dosyaAdi: "Hafta 1.pdf", parcaIndeksleri: [2] },
            { dosyaAdi: "Hafta 1.pdf", parcaIndeksleri: [8] },
            { dosyaAdi: "Ders Notu.docx" },
            { dosyaAdi: " " },
        ],
    }), ["Hafta 1.pdf", "Ders Notu.docx"]);
});

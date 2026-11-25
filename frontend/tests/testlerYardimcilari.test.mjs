import test from "node:test";
import assert from "node:assert/strict";

import {
    basariOraniniGetir,
    soruIndeksiniSinirla,
    soruKaynakAdlariniGetir,
    soruSonucDurumunuGetir,
    testCozumOzetiniGetir,
    testCozmeYolu,
    testDenetimVerisiniOlustur,
    testEksikSoruMesaji,
    testHedefBilgisi,
    testIlerlemeBilgisi,
    testOlusturmaButonuDevreDisiMi,
    testOlusturmaGirdisiOlustur,
    testSonucYolu,
} from "../src/utils/testlerYardimcilari.mjs";

test("alt konuda 5 soru ve özel 7/12 soru sayıları girişte korunur", () => {
    for (const soruSayisi of [1, 5, 7, 12, 20]) {
        assert.equal(testOlusturmaGirdisiOlustur({ kapsamTuru: "konu", konuId: "sub-ornek", soruSayisi, zorluk: "orta" }).soruSayisi, soruSayisi);
    }
    for (const soruSayisi of [0, 21, 1.5, "", true]) {
        assert.equal(testOlusturmaGirdisiOlustur({ kapsamTuru: "konu", konuId: "sub-ornek", soruSayisi, zorluk: "orta" }), null);
    }
});

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
        soruSayisi: 10,
        zorluk: "kolay",
        materyalId: "m1",
        konuId: "k1",
    }), { kapsamTuru: "materyal", soruSayisi: 10, zorluk: "kolay", materyalId: "m1" });
    assert.equal(testOlusturmaGirdisiOlustur({
        kapsamTuru: "materyal",
        soruSayisi: 0,
        zorluk: "kolay",
        materyalId: "m1",
    }), null);
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


test("JSON denetimi soru, şık ve konu içerir; cevap anahtarını sızdırmaz", () => {
    const veri = testDenetimVerisiniOlustur({
        _id: "test1", konuBasligi: "Ana Konu", soruSayisi: 1,
        sorular: [{
            metin: "Örnek soru?",
            secenekler: [{ anahtar: "A", metin: "Seçenek A" }],
            konuId: "alt1",
            dogruCevap: "A", aciklama: "Gizli açıklama",
            kaynaklar: [{
                dosyaAdi: "ders.pdf",
                parcaIndeksleri: [3],
                parcaSkorlari: [{ parcaIndex: 3, skor: 0.8132 }],
            }],
            kaliteDogrulama: { durum: "UYGUN", guven: 0.97 },
            konuDogrulama: {
                hedefSkor: 0.8021,
                rakipSkor: 0.5932,
                rakipKonuBasligi: "Başka alt konu",
            },
        }],
    }, [{ konuId: "alt1", baslik: "Alt Konu 1" }]);
    assert.equal(veri.sorular[0].konuId, "alt1");
    assert.equal(veri.sorular[0].konuBasligi, "Alt Konu 1");
    assert.equal(veri.sorular[0].secenekler[0].metin, "Seçenek A");
    assert.deepEqual(veri.sorular[0].kaynakDosyalari, ["ders.pdf"]);
    assert.deepEqual(veri.sorular[0].kaynakParcalari, [{
        dosyaAdi: "ders.pdf", parcaIndex: 3, semantikSkor: 0.8132,
    }]);
    assert.deepEqual(veri.sorular[0].konuDogrulama, {
        hedefSkor: 0.8021, rakipSkor: 0.5932,
        rakipKonuBasligi: "Başka alt konu",
    });
    assert.deepEqual(veri.sorular[0].kaliteDogrulama, {
        durum: "UYGUN", guven: 0.97,
    });
    assert.equal(JSON.stringify(veri).includes("dogruCevap"), false);
    assert.equal(JSON.stringify(veri).includes("Gizli açıklama"), false);
});

test("kısmi soru sayısında gerçek sonuç ve anlaşılır Türkçe neden gösterilir", () => {
    const kismi = {
        soruSayisi: 17, istenenSoruSayisi: 20,
        eksikSoruNedeni: "KALITE_KONTROLU", sorular: [],
    };
    assert.match(testEksikSoruMesaji(kismi), /20 sorudan 17 soru/);
    assert.match(testEksikSoruMesaji(kismi), /3 eksik/);
    assert.match(testEksikSoruMesaji(kismi), /dört seçenek veya cevap eksikti/);
    assert.equal(testEksikSoruMesaji({ soruSayisi: 10, istenenSoruSayisi: 10 }), "");
    const kaynak = { ...kismi, eksikSoruNedeni: "KAYNAK_KAPASITESI" };
    assert.match(testEksikSoruMesaji(kaynak), /Gemini, kaynak metinlere dayanarak/);
    const json = testDenetimVerisiniOlustur(kismi);
    assert.equal(json.soruSayisi, 17);
    assert.equal(json.istenenSoruSayisi, 20);
    assert.equal(json.eksikSoruNedeni, "KALITE_KONTROLU");
});

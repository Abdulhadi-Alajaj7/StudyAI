import test from "node:test";
import assert from "node:assert/strict";
import { calismaKartlariApiOlustur } from "../src/services/calismaKartlariApi.mjs";
import { acikKartiKoru, kartlariFiltrele, kartDurumunuUygula, kartKonulariniGrupla, kartGorunumleri, kartKonuDurumMesaji, kartUretimDurumMesaji } from "../src/utils/calismaKartlariYardimcilari.mjs";
import { kullaniciHataMesaji } from "../src/utils/kullaniciHatasi.mjs";
const kartlar = [
    { _id: "1", konuId: "a", goruldu: false, yildizli: true },
    { _id: "2", konuId: "a", goruldu: true, yildizli: false },
    { _id: "3", konuId: "b", goruldu: false, yildizli: false },
];
const konular = [{ konuId: "a", anaKonuId: "ana", anaBaslik: "Ana", baslik: "A", kartSayisi: 2 }, { konuId: "b", anaKonuId: "ana", anaBaslik: "Ana", baslik: "B", kartSayisi: 1 }];
test("V2+ sıfır kart nedeni ve gerçek eksik kavram ilerlemesi ayrılır", () => {
    const nedenler = ["ogrenilebilir_kavram_yok", "kaynak_yok", "kanit_yetersiz", "uretim_basarisiz", "dogrulama_basarisiz"];
    const mesajlar = nedenler.map(sifirKartNedeni => kartKonuDurumMesaji({ tamamlandi: sifirKartNedeni === "ogrenilebilir_kavram_yok", kartSayisi: 0, sifirKartNedeni }));
    assert.equal(new Set(mesajlar).size, nedenler.length);
    assert.match(kartKonuDurumMesaji({ kartSayisi: 7, eksikKartSayisi: 1, tamamlandi: false }), /7 kart hazır; 1 kavram bekliyor/);
    assert.match(kartKonuDurumMesaji({ kartSayisi: 8, tamamlandi: true }), /8 kart hazır/);
});
test("V2+ yerel RPM/TPM/RPD ve model kapatma hataları güvenli Türkçe sunulur", () => {
    const mesajlar = ["GEMINI_YEREL_RPM", "GEMINI_YEREL_TPM", "GEMINI_YEREL_RPD", "GEMINI_MODEL_KAPALI", "KART_BATCH_SINIRI"].map(kod =>
        kullaniciHataMesaji({ response: { status: 429, data: { kod, hata: "gizli-provider-detayi" } } }));
    assert.equal(new Set(mesajlar).size, 5); assert.ok(mesajlar.every(m => !m.includes("gizli-provider")));
});
test("dört görünüm gerçek görüldü/yıldız durumlarını birbirinden bağımsız süzer", () => {
    const sonuclar = [3, 2, 1, 1];
    kartGorunumleri.forEach((g, i) => assert.equal(kartlariFiltrele(kartlar, { gorunum: g.deger }, konular).length, sonuclar[i]));
    assert.deepEqual(kartlariFiltrele(kartlar, { gorunum: "gorulmeyen", konuId: "a" }, konular).map(k => k._id), ["1"]);
    assert.equal(kartlariFiltrele(kartlar, { gorunum: "tum", anaKonuId: "ana" }, konular).length, 3);
});
test("konu ve istatistik sayıları gerçek kayıtlarla hesaplanır", () => {
    const veri = { kartlar, konular };
    const yeni = kartDurumunuUygula(veri, "1", { gorulduTarihi: "2026-11-12", yildizli: true });
    assert.deepEqual(yeni.istatistikler, { toplam: 3, gorulen: 2, gorulmeyen: 1, yildizli: 1 });
    assert.equal(kartlar[0].goruldu, false);
    const [grup] = kartKonulariniGrupla(konular);
    assert.equal(grup.kartSayisi, 3); assert.equal(grup.altKonular.length, 2);
});
test("görülmeyen kart cevabı açıldığında kullanıcı ilerleyene kadar ekrandan kaybolmaz", () => {
    const yeni = kartDurumunuUygula({ kartlar }, "1", { gorulduTarihi: "2026-11-12", yildizli: true });
    const filtreli = kartlariFiltrele(yeni.kartlar, { gorunum: "gorulmeyen" });
    assert.deepEqual(acikKartiKoru(filtreli, yeni.kartlar[0]).map(k => k._id), ["1", "3"]);
    assert.equal(acikKartiKoru(filtreli, null).length, 1);
});
test("API tüm isteklerde oturum, kodlanmış kimlik ve iptal sinyali taşır; GET üretim başlatmaz", async () => {
    const cagrilar = [], client = {};
    for (const metod of ["get", "post", "patch"]) client[metod] = async (...args) => { cagrilar.push([metod, ...args]); return { data: {} }; };
    const api = calismaKartlariApiOlustur(client), signal = new AbortController().signal;
    await api.getir("ders/1", signal); await api.olustur("ders/1", signal);
    await api.durumKaydet("ders/1", "kart/2", { goruldu: true }, signal);
    await api.degerlendir("ders/1", "kart/2", { degerlendirme: "zor", istemciIstekId: "istek-001" }, signal);
    assert.equal(cagrilar[0][0], "get"); assert.equal(cagrilar[0][1], "/dersler/ders%2F1/calisma-kartlari");
    assert.deepEqual(cagrilar[1].slice(1, 3), ["/dersler/ders%2F1/calisma-kartlari/olustur", {}]);
    assert.equal(cagrilar[2][1], "/dersler/ders%2F1/calisma-kartlari/kart%2F2/durum");
    assert.equal(cagrilar[3][1], "/dersler/ders%2F1/calisma-kartlari/kart%2F2/degerlendirmeler");
    assert.ok(cagrilar.every(c => c.at(-1).withCredentials && c.at(-1).signal === signal));
});
test("kart hataları teknik gövdeden bağımsız sabit Türkçe mesaj gösterir", () => {
    for (const kod of ["KART_GECERSIZ_YANIT", "KART_KAYIT_HATASI", "KART_URETIM_HATASI", "KART_ISLEM_KESILDI", "KART_KAYNAK_YETERSIZ", "KART_KAYNAK_DEGISTI", "KART_KILIT_KAYBI", "KART_ISLEM_CAGRI_SINIRI", "KART_DERS_CAGRI_SINIRI", "KART_KANIT_YETERSIZ"]) {
        const mesaj = kullaniciHataMesaji({ response: { status: 502, data: { kod, hata: "sentetik-gizli-anahtar" } } });
        assert.doesNotMatch(mesaj, /sentetik-gizli/);
    }
    const baglantiMesaji = kullaniciHataMesaji({ response: { status: 422, data: {
        kod: "KART_KAYNAK_BAGLANTISI_EKSIK", hata: "sentetik-gizli-anahtar",
    } } });
    assert.match(baglantiMesaji, /kaynak bağlantısı doğrulanamadı/);
    assert.doesNotMatch(baglantiMesaji, /yeterli kaynak|sentetik-gizli/);
});


test("kalıcı iş beklemesi otomatik devamı açıklar; bilinmeyen kart sayısı sabit hedef gibi sunulmaz", () => {
    const r = kartUretimDurumMesaji({ uretimIsi: { durum: "bekliyor", sonrakiDeneme: "2026-11-14T09:00:00Z" } });
    assert.match(r.baslik, /otomatik devam/); assert.match(r.aciklama, /yeniden denenecek/);
    assert.match(r.aciklama, /açık tutmanız gerekmez/);
    assert.doesNotMatch(kartUretimDurumMesaji({ uretimIsi: { durum: "bekliyor", sonrakiDeneme: "bozuk" } }).aciklama, /Invalid/);
    assert.match(kartKonuDurumMesaji({ kartSayisi: 6, eksikKartSayisi: null }), /6 kart hazır; kaynaklar inceleniyor/);
});

test("toplam tüketim ve ilerleme durması öğrenciyi sürekli yeniden denemeye yönlendirmez", () => {
    const mesaj = kod => kullaniciHataMesaji({ response: { status: 429, data: { kod } } });
    assert.match(mesaj("KART_TOPLAM_CAGRI_SINIRI"), /toplam kullanım sınırına/);
    assert.match(mesaj("KART_ILERLEME_YOK"), /durduruldu/);
});

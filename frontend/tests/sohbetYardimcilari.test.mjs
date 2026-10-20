import test from "node:test";
import assert from "node:assert/strict";

import {
    dahiliKaynakAtiflariniTemizle,
    geciciMesajiSunucuMesajiylaDegistir,
    istemciIstekIdOlustur,
    kaydirmaSondaMi,
    kaynakMateryalAdlari,
    mesajlariBirlestir,
    sohbetleriBirlestir,
} from "../src/utils/sohbetYardimcilari.mjs";

test("eski asistan mesajlarındaki dahili atıfları Markdown içeriğini bozmadan temizler", () => {
    const icerik = "Yanıt [K1, K3]. [Bağlantı](https://example.com) ve `örnek [K2, K4]`.\n```txt\n[K3, K5]\n```";
    assert.equal(
        dahiliKaynakAtiflariniTemizle(icerik),
        "Yanıt. [Bağlantı](https://example.com) ve `örnek`.\n```txt\n\n```"
    );
});

test("Markdown bağlantısı ve referans tanımı olarak yazılan dahili kaynak kodlarını göstermez", () => {
    assert.equal(
        dahiliKaynakAtiflariniTemizle("Yanıt [K1](https://example.com/kaynak).\n[K2]: https://example.com/iki\nSonuç"),
        "Yanıt.\nSonuç"
    );
});

test("her gönderim için backend kalıbına uygun istemci istek kimliği oluşturulur", () => {
    const id = istemciIstekIdOlustur({ randomUUID: () => "12345678-1234-1234-1234-123456789abc" });
    assert.equal(id, "12345678-1234-1234-1234-123456789abc");
    assert.ok(id.length >= 8);
});

test("eski mesaj sayfası kronolojik sırada başa eklenir ve tekrarlar tekilleştirilir", () => {
    const yeni = [{ _id: "m2", createdAt: "2026-01-02", icerik: "iki" }];
    const eski = [
        { _id: "m1", createdAt: "2026-01-01", icerik: "bir" },
        { _id: "m2", createdAt: "2026-01-02", icerik: "iki-güncel" },
    ];
    const sonuc = mesajlariBirlestir(yeni, eski, { basaEkle: true });
    assert.deepEqual(sonuc.map((mesaj) => mesaj._id), ["m1", "m2"]);
    assert.equal(sonuc[1].icerik, "iki");
});

test("geçici kullanıcı mesajı aynı istekten gelen sunucu mesajıyla değiştirilir", () => {
    const sonuc = geciciMesajiSunucuMesajiylaDegistir(
        [{ _id: "gecici-istek-0001", icerik: "Soru" }],
        "istek-0001",
        { _id: "sunucu-1", icerik: "Soru", createdAt: "2026-01-01" }
    );
    assert.deepEqual(sonuc.map((mesaj) => mesaj._id), ["sunucu-1"]);
});

test("kaynak rozetleri yalnızca benzersiz gerçek materyal adlarını döndürür", () => {
    const sonuc = kaynakMateryalAdlari([
        { materyalAdi: "Hafta5.pdf", parcaIndex: 1, konum: { tur: "sayfa", deger: "67" } },
        { materyalAdi: "Hafta5.pdf", parcaIndex: 2 },
        { materyalAdi: "DersNotlari.docx" },
        { materyalAdi: " " },
    ]);
    assert.deepEqual(sonuc, ["Hafta5.pdf", "DersNotlari.docx"]);
    assert.ok(sonuc.every((ad) => !ad.includes("67")));
});

test("sohbet listesi güncellenir ve son mesaj tarihine göre sıralanır", () => {
    const sonuc = sohbetleriBirlestir(
        [{ _id: "s1", baslik: "Eski", sonMesajTarihi: "2026-01-01" }],
        [
            { _id: "s1", baslik: "Güncel", sonMesajTarihi: "2026-01-03" },
            { _id: "s2", baslik: "Diğer", sonMesajTarihi: "2026-01-02" },
        ]
    );
    assert.deepEqual(sonuc.map((sohbet) => sohbet._id), ["s1", "s2"]);
    assert.equal(sonuc[0].baslik, "Güncel");
});

test("otomatik kaydırma yalnızca kullanıcı görünümün sonuna yakınsa etkinleşir", () => {
    assert.equal(kaydirmaSondaMi({ scrollHeight: 1000, scrollTop: 700, clientHeight: 250 }), true);
    assert.equal(kaydirmaSondaMi({ scrollHeight: 1000, scrollTop: 300, clientHeight: 250 }), false);
});

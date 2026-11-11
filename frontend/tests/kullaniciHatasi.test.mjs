import test from "node:test";
import assert from "node:assert/strict";
import { kullaniciHataMesaji } from "../src/utils/kullaniciHatasi.mjs";

test("ağ, oturum ve sunucu hataları kullanıcı dostu Türkçe mesaja çevrilir", () => {
    assert.match(kullaniciHataMesaji({ isAxiosError: true, code: "ERR_NETWORK" }), /Bağlantı kurulamadı/);
    assert.match(kullaniciHataMesaji({ response: { status: 401, data: {} } }), /Oturumunuz sona ermiş/);
    assert.match(kullaniciHataMesaji({ response: { status: 500, data: { hata: "Internal Server Error" } } }), /biraz sonra/);
});

test("Unexpected field kullanıcıya teknik İngilizce göstermeden açıklanır", () => {
    const mesaj = kullaniciHataMesaji({
        response: { status: 400, data: { hata: "Unexpected field" } }
    });

    assert.match(mesaj, /yükleme alanı geçersiz/i);
    assert.doesNotMatch(mesaj, /unexpected field/i);
});

test("yerel uygulama hatasında çağıranın bağlama özel mesajı korunur", () => {
    assert.equal(
        kullaniciHataMesaji(new Error("teknik"), "Onay işlemi doğrulanamadı."),
        "Onay işlemi doğrulanamadı."
    );
});


test("güvenli Gemini hata kodları 5xx olsa da sabit mesaj gösterir, ham gövdeyi sızdırmaz", () => {
    for (const [kod, desen, status] of [
        ["GEMINI_GECICI_HATA", /geçici olarak yoğun/, 503],
        ["GEMINI_KOTA_ASIMI", /kullanım sınırına/, 429],
        ["GEMINI_GUNLUK_KOTA", /günlük kotası/, 429],
        ["GEMINI_ZAMAN_ASIMI", /zamanında alınamadı/, 504],
        ["GEMINI_AG_HATASI", /bağlanılamadı/, 502],
        ["GEMINI_GECERSIZ_YANIT", /doğrulanamadı/, 502],
        ["GEMINI_GECERSIZ_TEST_YANITI", /doğrulanamadı/, 502],
        ["YETERSIZ_TEST_ICERIGI", /kaynak içeriği/, 422],
        ["GEMINI_YAPILANDIRMA", /erişim ayarları/, 401],
    ]) {
        const mesaj = kullaniciHataMesaji({ response: { status, data: { kod, hata: "gizli-api-anahtarı ve ham materyal" } } });
        assert.match(mesaj, desen);
        assert.doesNotMatch(mesaj, /gizli|ham materyal/);
    }
    assert.doesNotMatch(kullaniciHataMesaji({ response: { status: 500, data: { kod: "BILINMEYEN", hata: "gizli" } } }), /gizli/);
});

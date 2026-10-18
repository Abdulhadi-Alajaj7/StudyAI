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

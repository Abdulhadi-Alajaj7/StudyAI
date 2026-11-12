const teknikMesajCevirileri = [
    [/unexpected field/i, "Dosya yükleme alanı geçersiz. Lütfen sayfayı yenileyip tekrar deneyin."],
    [/internal server error/i, "İşlem sırasında bir sorun oluştu. Lütfen biraz sonra tekrar deneyin."],
    [/network error|failed to fetch|econnrefused/i, "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."],
    [/unauthorized|invalid token|jwt expired/i, "Oturumunuz sona ermiş olabilir. Lütfen tekrar giriş yapın."]
];

// Yalnızca sabit mesajlar: sağlayıcının teknik hata gövdesini ekrana taşıma.
const guvenliKodMesajlari = new Map([
    ["KART_GECERSIZ_YANIT", "Üretilen kartlar kaynaklarıyla doğrulanamadı. Eksik konuları yeniden deneyebilirsiniz."],
    ["KART_ISLEM_CAGRI_SINIRI", "Bu işlemin güvenli çağrı sınırına ulaşıldı. Kaydedilen kartlar korundu; eksik konulara devam edebilirsiniz."],
    ["KART_DERS_CAGRI_SINIRI", "Bu dersin günlük kart üretim sınırına ulaşıldı. Kaydedilen kartlar korunuyor; daha sonra devam edebilirsiniz."],
    ["KART_KANIT_YETERSIZ", "Seçilen kaynaklarda doğrulanabilir kısa kanıt bulunamadı. Kaydedilen kartlar korundu; materyal içeriğini kontrol edin."],
    ["KART_KAYIT_HATASI", "Kartlar kaydedilirken bir sorun oluştu. Kaydedilmiş kartlar korunuyor; eksik konuları yeniden deneyebilirsiniz."],
    ["KART_URETIM_HATASI", "Kart üretimi tamamlanamadı. Eksik konuları yeniden deneyebilirsiniz."],
    ["KART_ISLEM_KESILDI", "Önceki üretim kesildi. Tamamlanan kartları koruyarak devam edebilirsiniz."],
    ["KART_KAYNAK_YETERSIZ", "Konuya uygun yeterli kaynak bulunamadı. Ders materyallerini kontrol edin."],
    ["KART_KAYNAK_BAGLANTISI_EKSIK", "Konunun kaynak bağlantısı doğrulanamadı. Konu haritasının materyal ve sürüm bilgilerini kontrol edin."],
    ["KART_KAYNAK_DEGISTI", "Ders kaynakları değişti. Kart destesinin kaynaklarını kontrol edin."],
    ["KART_KILIT_KAYBI", "Kart işlemi başka bir oturumda devam ediyor. Sayfayı yenileyin."],
    ["KART_SUNUCU_HATASI", "Çalışma kartları işlemi tamamlanamadı. Lütfen yeniden deneyin."],
    ["GEMINI_GECICI_HATA", "Yapay zekâ hizmeti geçici olarak yoğun. Biraz sonra yeniden deneyin."],
    ["GEMINI_ISTEK_YOGUNLUGU", "Yapay zekâ işlemleri şu anda yoğun. Biraz sonra yeniden deneyin."],
    ["GEMINI_KOTA_ASIMI", "Yapay zekâ kullanım sınırına ulaşıldı. Bir süre bekleyip yeniden deneyin."],
    ["GEMINI_GUNLUK_KOTA", "Yapay zekâ günlük kotası doldu. Kota yenilendikten sonra yeniden deneyin."],
    ["GEMINI_ZAMAN_ASIMI", "Yapay zekâ yanıtı zamanında alınamadı. Yeniden deneyebilirsiniz."],
    ["GEMINI_AG_HATASI", "Yapay zekâ hizmetine bağlanılamadı. Biraz sonra yeniden deneyin."],
    ["GEMINI_GECERSIZ_TEST_YANITI", "Üretilen sorular doğrulanamadı. Yeniden deneyebilirsiniz."],
    ["YETERSIZ_TEST_ICERIGI", "Yeterli kaynak içeriği bulunamadı. Daha geniş bir kapsam seçin."],
    ["GEMINI_GECERSIZ_YANIT", "Üretilen içerik doğrulanamadı. Yeniden deneyebilirsiniz."],
    ["GEMINI_YAPILANDIRMA", "Yapay zekâ erişim ayarları kontrol edilmeli. Lütfen yöneticiye bildirin."],
    ["GEMINI_MODEL_BULUNAMADI", "Yapay zekâ modeli kullanılamıyor. Lütfen yöneticiye bildirin."],
    ["GEMINI_GECERSIZ_ISTEK", "Yapay zekâ isteği kabul edilmedi. Lütfen yöneticiye bildirin."],
    ["GEMINI_ISTEK_BOYUTU", "İçerik yapay zekâ isteği için çok büyük. Daha dar bir kapsam seçin."],
    ["GEMINI_CAGRI_BUTCESI_ASILDI", "İçerik güvenle tamamlanamadı. Daha dar bir kapsamla yeniden deneyin."],
    ["UYGUN_ICERIK_BULUNAMADI", "Uygun kaynak içeriği bulunamadı. Materyallerinizi kontrol edin."],
]);

export const kullaniciHataMesaji = (
    hata,
    varsayilanMesaj = "İşlem sırasında bir sorun oluştu. Lütfen tekrar deneyin."
) => {
    if (!hata?.response) {
        return hata?.isAxiosError || hata?.code === "ERR_NETWORK"
            ? "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."
            : varsayilanMesaj;
    }

    const durum = hata.response.status;
    const guvenliMesaj = guvenliKodMesajlari.get(hata.response.data?.kod);
    if (guvenliMesaj) return guvenliMesaj;
    if (durum === 401) {
        return "Oturumunuz sona ermiş olabilir. Lütfen tekrar giriş yapın.";
    }
    if (durum >= 500) {
        return "İşlem sırasında bir sorun oluştu. Lütfen biraz sonra tekrar deneyin.";
    }

    const sunucuMesaji =
        hata.response?.data?.hata ||
        hata.response?.data?.mesaj ||
        hata.response?.data?.message;
    if (typeof sunucuMesaji === "string" && sunucuMesaji.trim()) {
        for (const [desen, turkceMesaj] of teknikMesajCevirileri) {
            if (desen.test(sunucuMesaji)) return turkceMesaj;
        }
        return sunucuMesaji;
    }

    return varsayilanMesaj;
};

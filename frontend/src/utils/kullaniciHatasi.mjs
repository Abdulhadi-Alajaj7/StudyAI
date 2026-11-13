const teknikMesajCevirileri = [
    [/unexpected field/i, "Dosya yükleme alanı geçersiz. Lütfen sayfayı yenileyip tekrar deneyin."],
    [/internal server error/i, "İşlem sırasında bir sorun oluştu. Lütfen biraz sonra tekrar deneyin."],
    [/network error|failed to fetch|econnrefused/i, "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."],
    [/unauthorized|invalid token|jwt expired/i, "Oturumunuz sona ermiş olabilir. Lütfen tekrar giriş yapın."]
];

// Yalnızca sabit mesajlar: sağlayıcının teknik hata gövdesini ekrana taşıma.
const guvenliKodMesajlari = new Map([
    ["EMAIL_DOGRULAMA_GEREKLI", "Giriş yapmadan önce e-posta adresinizi doğrulayın."],
    ["KAYIT_DOGRULAMA_GECERSIZ", "Doğrulama bağlantısı geçersiz, kullanılmış veya süresi dolmuş. Yeni bağlantı isteyin veya yeniden kayıt olun."],
    ["MEVCUT_SIFRE_HATALI", "Mevcut şifreniz hatalı. Lütfen kontrol edin."],
    ["AUTH_YENIDEN_GIRIS", "E-posta değişikliği için yeniden giriş yapın."],
    ["AUTH_ISTEK_SINIRI", "Çok fazla istek gönderdiniz. Lütfen daha sonra tekrar deneyin."],
    ["EPOSTA_YAPILANDIRMA", "E-posta servisi henüz kullanıma hazır değil. Lütfen yöneticiye bildirin."],
    ["EMAIL_BAGLANTISI_GECERSIZ", "Bağlantı geçersiz, kullanılmış veya süresi dolmuş. Doğru hesapla giriş yapıp profilinizden yeni bağlantı isteyin."],
    ["SIFIRLAMA_BAGLANTISI_GECERSIZ", "Bağlantı geçersiz, kullanılmış veya süresi dolmuş. Yeni sıfırlama bağlantısı isteyin."],

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

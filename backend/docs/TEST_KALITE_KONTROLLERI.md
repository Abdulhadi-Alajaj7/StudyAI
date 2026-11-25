# StudyAI Test Üretimi: Basit Akış

1. Kullanıcı sahipliği, kaynak sürümleri ve seçilen kapsam korunur. Yeni test API'si ana konu için 10/15/20, alt konu için 5/10 seçeneklerini kabul eder. Eski kayıtların soru sayısı değişmez. Geçici JSON inceleme arayüzü kaldırılmıştır.
2. Mevcut chunk-konu atamaları ve kaynak bütçesiyle tek kaynak paketi hazırlanır. Embedding veya yeniden sınıflandırma çağrısı yapılmaz.
3. Gemini'ye istenen sayı, konu ve zorluk dağılımı, farklı sorular, yalnızca kaynaklara dayanma, dört seçenek, doğru cevap ve açıklama prompt ile iletilir. Alıntı/öğrenme hedefi zorunlu değildir. JSON MIME ve sabit, küçük `responseJsonSchema` kullanılır. Şema uyumsuzluğu görülürse `GEMINI_TEST_JSON_SEMA=false` ile kapatılabilir.
4. Modelin içerik kalitesi, anlamsal tekrarları, alıntı eşleşmesi ve dağılımı yerel olarak denetlenmez. Sadece sayı ve uygulama için gerekli veri biçimi doğrulanır; gerçek kaynak kodları sunucu kayıtlarına dönüştürülür. Bilinmeyen kaynak/konu kimlikleri bağlanmaz.
5. Normal akış tek Gemini çağrısıdır. Gerçek sağlayıcı 503, timeout veya JSON_PARSE için en fazla bir yedek model çağrısı; kalite veya eksik sayı için ek çağrı yoktur. 400/401/403/404/429 yeniden denenmez. Toplam en fazla iki SDK çağrısı ve 120 saniye işlem bütçesi. Yedek varsa çağrı başına en fazla 55 saniye, yoksa 90 saniye. Yedek model `GEMINI_TEST_YEDEK_MODELI` ile belirlenir; ayar yoksa 3.1/3.5 birbirinin yedeğidir. Yedek kapalıysa yalnız 503 için aynı model bir kez denenir. Kaydedilen model gerçek başarılı modeldir.
6. Sayı veya biçim hatasında test kaydedilmez. Kaynak sürümü değişirse 409 döner. Eski kayıtlar okunabilir; yanıt ve açıklama çözüm sırasında sızdırılmaz.

Konu dağılımı, tekrar etmeme ve akademik doğruluk artık model talimatıdır, garanti değildir. Kullanıcıya sunulan soruların içeriği ikinci bir modelle veya yerel sözcük benzerliğiyle değerlendirilmez.

## Konu haritası / chunk sınıflandırma terminal tanılaması

- `[GeminiHazirlama]`: konu haritası çıkarma ve birleştirme çağrılarının model, aşama, HTTP durumu, sağlayıcı hata kodu, süre ve token özetleri.
- `[ParcaAtama] Başladı`: kaç aktif chunk ve batch olduğu.
- `[ParcaAtama] Batch tamamlandı`: tamamlanan batch, o batch'in chunk sayısı ve gerçek API çağrı sayısı.
- `[ParcaAtama] Yerel kota beklemesi`: harita üretimiyle **aynı Node.js sürecinde paylaşılan** RPM/TPM sınırının bekleme süresi.
- `[ParcaAtama] Batch hatası`: başarısız batch, gerçek sağlayıcı HTTP kodu (varsa), `kod`, `yerelSinir`, `retryAfterMs`, toplam API çağrısı. API anahtarı veya chunk metni loglanmaz.
- `[ParcaAtama] İşlem durduruldu`: kaç batch tamamlandığı ve hatanın kodu. Başarılı batch sonuçları şu anda kalıcı checkpoint olarak tutulmaz; harita yeniden oluşturulursa yeniden işlenir.
- `[ParcaAtama] Tamamlandı`: tüm chunkların atanması, batch ve API çağrı sayısı.

Chunk atamaları harita ile **aynı kota sınırlayıcısını** paylaşır. Geçici 503 ve geçici 429 hatalarında yapılandırılmış en fazla üç deneme yapılır; günlük kota için yeniden deneme yapılmaz. Yerel RPM/TPM beklemesi 65 saniyeyle sınırlandırılır. Sınırlayıcı yalnızca tek Node.js süreci içindir; farklı backend süreçleri ve AI Studio aynı sayaçta görünmez. Sağlayıcı hatası ile yerel sınır ayrımı için `httpDurumu` ve `yerelSinir` birlikte incelenir.

Hata raporu için terminalden yalnızca `[GeminiHazirlama]` ve `[ParcaAtama]` satırlarını paylaşın. `.env`, API anahtarı ve ders metnini paylaşmayın.

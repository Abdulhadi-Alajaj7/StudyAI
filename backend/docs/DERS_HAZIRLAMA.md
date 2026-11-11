# Ders oluşturma akışı — değişiklik raporu

Çalışma branch'i: `analiz/sistem-guvenilirlik-performans`. Commit, push, merge veya reset yapılmadı. Yeni bağımlılık, ücretli servis veya gerçek Gemini API çağrısı kullanılmadı.

## Davranış

- Yükleme ve yeniden metin çıkarma yalnız dosya doğrulama, metin çıkarma ve parçalama yapar. Ekleme/silme Gemini üretimini tetiklemez.
- **Devam** yalnız son onay modalını açar. **Onayla ve Dersi Hazırla**, mevcut `/materyaller/onayla` endpoint'inde hazırlamayı başlatır; yanıt hazırlık sürerken HTTP 202'dir.
- Ders belgesindeki atomik kilit, aktif materyal işlemleriyle yarışmayı ve ikinci hazırlama işini engeller. Hazırlık sırasında materyal ekleme, silme, yeniden işleme ve ders silme reddedilir. Eski bağımsız harita üretim endpoint'i hazırlama akışına yönlendiren 409 döndürür.
- Metin parçaları doğrulanır; embedding tamamlanınca mevcut full harita algoritması çalışır. Sıralı çalışma, embedding başarısızken boşa harita isteğini önler. Konu kimliği eşleme ve kaynak bağlantısı algoritmaları korunur.
- Mevcut onay transaction'ı servise taşındı. Materyallerin ve aktif parçaların embedding durumu, tüm harita kaynakları/sürümleri, işlem token'ı ve lease doğrulanmadan kalıcı onay verilmez. Ders ve harita birlikte kilitlenir.
- Başarısız hazırlık taslak kalır. Dosyalar, metin sürümleri, başarılı embedding partileri ve önceki harita korunur. Hatalı hazırlıklar otomatik taslak temizliğinden çıkarıldı; kullanıcı açıkça silebilir.
- 429 kota ve 503 geçici hizmet hataları ayrı mesajlarla gösterilir. Harita isteği en fazla iki deneme; embedding mevcut yapılandırmanın sınırlı deneme sayısını kullanır (varsayılan üç). Kullanıcı yeniden denemesi ayrı bir girişimdir.
- Hazırlama ekranı gerçek aşamaları gösterir; uydurma yüzde içermez. Üç saniyelik durum sorgulaması üretim başlatmaz. Kalıcı onay sonrasında DersHazir'a yönlenir. Derslerim'in yalnız onaylı dersleri listelemesi korunur; DersHazir doğrudan açıldığında da sunucu onayı doğrulanır.
- Lease 30 saniyede yenilenir; beş dakikalık süre aşımı MongoDB saatiyle kontrol edilir. Süresi dolan iş, durum okuma/yeniden deneme sırasında transaction ile hata durumuna alınır ve eski harita token'ı geçersizleşir. Mevcut açık `single-instance` başlangıç kurtarması, yeniden başlatmada hemen hata durumuna geçirir. Otomatik Gemini yeniden üretimi yoktur.

## API ve süre etkisi

Onay öncesi materyal hazırlamada **sıfır Gemini çağrısı** yapılır. İlk harita, tüm kalan kaynaklardan toplu üretilir: mevcut 80.000 karakterlik gruplama tek grup çıkarıyorsa bir üretim; birden çok grupta grup başına üretim ve bir birleştirme çağrısı gerekir. Retry bu sayılara eklenebilir. Dosya başına artımlı üretim ve tekrar tekrar birleştirme kaldırıldı.

Embedding mevcut batch/kota ayarlarını ve kullanıcıya özel içerik önbelleğini kullanır. Başarılı partiler hemen saklanır; sonraki parti hatasında yeniden kullanılabilir. Yeni vektörler ikinci kez topluca yazılmaz. Başarılı işleme yapay bekleme eklenmedi; yalnız mevcut kota sınırlaması ve hata backoff'u bekletir.

Metin çıkarma, parçalama, embedding, Gemini harita isteği, veritabanı kayıtları ve toplam hazırlama süreleri teknik loglarla ölçülür. Süre logları içerik, dosya adı veya API anahtarı içermez. Gerçek API testi yapılmadığından canlı çağrı sayısı veya hızlanma yüzdesi ölçülmedi.

## Doğrulama ve sınırlar

- Backend: `RUN_LIVE_GEMINI_TESTS=false` ile `npm test` — **343/343 geçti**. Semantik arama, kaynaklı sohbet, özet, test sistemi, konu kimlikleri, kilitler ve temizlik regresyonları dahil.
- Frontend: `npm test` — **80/80 geçti**. `npm run build` ve `npm run lint` başarılı.
- Yeni mock kapsamı: beş dosya yükleme/iki silme, onaysız sıfır üretim, kalan kaynakların işlenmesi, çift onay, 429/503, kısmi embedding başarısı, harita hatası, durum yenileme, kesinti kurtarma, eski token reddi, kalıcı kilit, eksik embedding/kaynak sürümü reddi ve kullanıcı sahipliği.
- Frontend akış testleri kaynak kodu kontrolleridir; gerçek tarayıcı E2E veya canlı MongoDB transaction testi yapılmadı. Mevcut transaction desteği olan MongoDB altyapısı gereklidir.
- Tek instance kurtarması açık değilse süreç kesintisinin görünür biçimde hata durumuna geçmesi son heartbeat'ten itibaren beş dakikayı bulabilir; diğer sunucuların geçerli işleri erken serbest bırakılmaz.
- Gerçek Gemini kota/model erişimi ve büyük materyallerin canlı gecikmesi doğrulanmadı. Başarısız büyük harita üretiminde tamamlanmamış ara grup sonuçları mevcut algoritmada bellektedir; sonraki kullanıcı denemesinde bu gruplar yeniden üretilebilir. Başarılı nihai harita ve embedding partileri kalıcıdır.
- Frontend derlemesi 500 kB üzerindeki ana JavaScript paketi için boyut uyarısı veriyor; derlemeyi engellemiyor.

## Değiştirilen / eklenen dosyalar

| Alan | Dosyalar |
| --- | --- |
| Model ve HTTP | `backend/models/Ders.js`, `backend/routes/dersRoutes.js`, `backend/controllers/dersController.js`, `backend/controllers/dersHazirlamaController.js`, `backend/controllers/materyalController.js` |
| Hazırlama ve onay | `backend/services/dersHazirlamaService.js`, `backend/services/dersOnayService.js` |
| Üretim ve ölçüm | `backend/services/embeddingService.js`, `backend/services/geminiService.js`, `backend/services/konuHaritasiService.js`, `backend/services/metinParcalamaService.js`, `backend/utils/islemSuresi.js` |
| Kurtarma ve temizlik | `backend/services/baslangicKurtarmaService.js`, `backend/services/geciciDersTemizlemeService.js` |
| Arayüz | `frontend/src/pages/MateryalEkle.jsx`, `frontend/src/pages/DersHazir.jsx` |
| Backend testleri | `backend/tests/dersHazirlama.test.js`, `backend/tests/geminiHazirlamaRetry.test.js`, `backend/tests/embeddingKalicilik.test.js`, `backend/tests/materyalOnayDegismezlik.test.js`, `backend/tests/materyalMetinCikar.test.js`, `backend/tests/geciciDersTemizleme.test.js`, `backend/tests/baslangicKurtarma.test.js` |
| Frontend testleri | `frontend/tests/dersHazirlamaAkisi.test.mjs` |
| Bu rapor | `backend/docs/DERS_HAZIRLAMA.md` |

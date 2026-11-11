# Hazırlamaya devam, silme göstergeleri ve Gemini tanılaması

Çalışma branch'i: `analiz/sistem-guvenilirlik-performans`. Gerçek Gemini çağrısı, gerçek kullanıcı verisi, ücretli servis ve yeni bağımlılık kullanılmadı. Commit, push, merge veya reset yapılmadı.

## Bulunan nedenler ve sonuç

- Hazırlama başlangıcı her retry'da `hazirlamaAsamasi=metinler` yazıyordu. Worker da metinler/embedding aşamalarını yeniden ziyaret ediyordu. Mevcut embedding önbelleği API çağrılarını azaltıyordu, ancak hazır parçalar yeniden okunup topluca yazılıyordu.
- Frontend, son onay isteği beklenirken bütün aşamaları bekliyor durumuna döndürüyordu; önceki tamamlandı işaretleri kayboluyordu.
- Embedding hata sınıflandırması yapılandırma/model hatalarını ve bilinmeyen hataları 503'e çevirebiliyordu. Harita isteği 429 ve 503'ü aynı bir saniyelik retry ile ele alıyor; kota türünü, `Retry-After` bilgisini ve çıktı kesilmesini ayrı değerlendirmiyordu.
- Silme işlemlerinde işlem boyunca merkezi gösterge ve eşzamanlı tıklama koruması bulunmuyordu. Ders silme hatasını genel liste hatasında göstermek de mevcut kartları gizleyebilirdi; silme hatası artık listeden bağımsız gösterilir.

## Yeniden deneme hangi aşamaları atlar?

**Metin ve embedding eksiksiz/güncelse, harita başarısız olduğunda yalnız harita üretimi yeniden çalışır.** Metin çıkarma/parçalama çağrılmaz; embedding üretim fonksiyonu ve hazır embedding yazımları atlanır. Harita da hazır ve kaynak sürümleri güncelse harita üretimi de atlanır, mevcut onay transaction'ına geçilir.

Karar frontend state'inden verilmez: ders kilidi altında mevcut materyaller ve aktif metin parçaları okunur. Embedding için model, boyut, içerik/başlık girdisinin hash'i, hazır durumu ve sayısal vektör geçerliliği doğrulanır. Eksik/geçersiz embedding varsa yalnız o parçalar hazırlanır; başarılı partiler korunur. Materyal değişikliği önceki aşama bilgisini geçersiz kılar. Bağımsız semantik dizin yenilemesi de hazırlama kilidiyle yarışamaz.

Yeni işlem için atomik token/lease alınması, eski token koşulları, harita kaynak sürümü kontrolleri ve kalıcı onay transaction'ı korunur. Yeni aşama doğrulama sonrasında veritabanına yazılır; sayfa yenilemesi aynı bilgiyi okur. Son onay isteği beklenirken önceki başarılı işaretler korunur; hatalı aşama başarılı olarak gösterilmez.

## Gemini hatası ve retry

- Gerçek HTTP 429, 503, 400, 401, 403, 404 ve 413 birbirine dönüştürülmez. Ağ hatası, timeout, boş yanıt, geçersiz JSON/şema ve `MAX_TOKENS` ayrı kodlarla sunulur.
- `Retry-After` saniye/tarih ve sağlayıcının `google.rpc.RetryInfo` bilgisi okunur. Kota ayrıntıları elverdiğinde RPM, TPM ve günlük kota ayrılır.
- Günlük kota için kısa otomatik retry yapılmaz. Bekleme bilgisi olmayan 429'da bir saniye sonra tekrar gönderilmez; süreçte koruyucu bekleme uygulanır. Uzun bekleme gerektiğinde kullanıcıya manuel yeniden deneme bırakılır.
- Harita varsayılan olarak en fazla iki deneme yapar; 503 için ilk backoff bir saniyedir. Süreler/deneme sayısı sınırlı ve yapılandırılabilirdir. Timeout'ta bekleyen istek iptal edilir.
- Yeni harita sınırları koruyucu varsayılanlardır: RPM 12, tahmini TPM 200.000, RPD 450. Bunlar kullanıcının bildirdiği hesap limitlerinin altında seçildi; evrensel sağlayıcı limitleri değildir. Model, kota, timeout, deneme ve bekleme ayarları `backend/.env.example` içinde açıklanır. İsteğe bağlı çıktı token ayarı boşsa mevcut model varsayılanı kullanılır.
- `[GeminiHazirlama]` logları aşama, model, gerçek HTTP kodu, sağlayıcı hata kodu, deneme, süre, kota/bekleme bilgisi ve mevcutsa sayısal token istatistiklerini içerir. Anahtar, ham materyal, prompt ve sağlayıcı hata gövdesi loglanmaz. Güvenli hata metadatası ayrıca `Ders.hazirlamaTanilama` alanında saklanır.

**Kullanıcının önce gördüğü hatanın kesin sağlayıcı nedeni mevcut kayıtlarla belirlenemiyor.** Erişilebilir log dosyaları önceki test koşularına ait; eski genel mesaj 503'e çevrilmiş farklı nedenleri ayırmaya yetmiyor. Gerçek hatayı kesinleştirmek için yeni güvenli log veya `hazirlamaTanilama` kaydı gerekir. Bu görevde canlı çağrı yapılmadı.

## Arayüz

Hazırlama modalının kaydırma çubuğu yalnız o modalda gizlendi; `overflow-y:auto`, touch için dikey kaydırma ve klavye kaydırması korunur. Boşluklar az miktarda daraltıldı; aşama ikonları/renkleri değiştirilmedi.

Ders ve materyal silmede onaydan sonra merkezi spinner açılır. Tekrar istek engellenir; gerçek yanıt gelene kadar kayıt listeden çıkarılmaz. Başarıda liste güncellenir, hatada gösterge kapanır ve kayıt korunarak hata gösterilir. Materyal polling yanıtlarının silinen kaydı geri getirmemesi için eski liste sorguları elenir.

## Doğrulama ve sınırlar

- Backend: `RUN_LIVE_GEMINI_TESTS=false` ile `npm test`: **369/369 geçti**. Son küçük işlem-kilidi hata yakalama değişikliğinden sonra ilgili semantik yenileme testleri ayrıca **2/2 geçti**.
- Frontend: `npm test`: **100/100 geçti**. `npm run lint`, `npm run build` ve `git diff --check` başarılı.
- Mock tarayıcı: ders/materyal silme başarısı ve hatası, bekleyen yanıt boyunca gösterge, çift tıklamada tek istek, hata halinde kartların korunması, onay/yenileme/retry/yönlendirme, önceki yeşil işaretler, mobil taşma kontrolü, gizli scrollbar ile mouse tekerleği ve klavye kaydırması geçti. Açık/koyu tema kontrol edildi.
- Ara regresyon koşusu bir fonksiyon imzası hatasını yakaladı; hata düzeltildi ve tüm backend paketi yeniden başarılı çalıştı.
- Haritanın çok parçalı üretimindeki ara grup sonuçları hâlâ bellektedir. Sonraki kullanıcı denemesinde bu gruplar yeniden üretilebilir; kapsamlı ara önbellek/queue eklenmedi.
- Kota koruması model/süreç başınadır; başka sunucuların ve diğer Gemini özelliklerinin kullanımını ortak olarak saymaz. Yeniden başlatmada yerel sayaçlar sıfırlanır. Sağlayıcının gerçek kotaları son otoritedir.
- Gerçek Gemini/model erişimi, gerçek hata kaydı, canlı MongoDB transaction'ları ve fiziksel cihazdaki touch davranışı bu koşuda test edilmedi. Derleme 500 kB üzerindeki ana paket için mevcut boyut uyarısını veriyor.

## Değiştirilen/eklenen dosyalar

| Alan | Dosyalar |
| --- | --- |
| Hazırlama ve embedding | `backend/services/dersHazirlamaService.js`, `backend/services/embeddingService.js`, `backend/controllers/dersHazirlamaController.js` |
| Gemini | `backend/services/geminiService.js`, `backend/services/konuHaritasiService.js`, `backend/utils/geminiHazirlamaHatasi.js`, `backend/utils/geminiHaritaSiniri.js`, `backend/.env.example` |
| Durum/güvenlik | `backend/models/Ders.js`, `backend/controllers/materyalController.js`, `backend/controllers/semanticAramaController.js` |
| Backend testleri | `dersHazirlama.test.js`, `embeddingKalicilik.test.js`, `embeddingService.test.js`, `geminiHazirlamaRetry.test.js`, `geminiHazirlamaTanilama.test.js`, `semanticAramaYenileme.test.js` (`backend/tests/` altında) |
| Arayüz | `frontend/src/pages/Derslerim.jsx`, `frontend/src/pages/MateryalEkle.jsx`, `frontend/src/components/DersHazirlamaEkrani.jsx`, `frontend/src/components/SilmeGostergesi.jsx`, `frontend/src/utils/dersHazirlamaSunumu.mjs`, `frontend/src/index.css` |
| Frontend testleri | `dersHazirlamaAkisi.test.mjs`, `dersHazirlamaGorunumu.test.mjs`, `dersHazirlamaSunumu.test.mjs` (`frontend/tests/` altında) |
| Rapor | `backend/docs/HAZIRLAMA_DEVAM_VE_TANILAMA.md` |

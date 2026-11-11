# StudyAI AI güvenilirlik denetimi — 11 Kasım 2026

Branch: `analiz/sistem-guvenilirlik-performans`. Başlangıç commit'i: `eed1cb1`.
Başlangıç çalışma ağacı temizdi. Gerçek Gemini/embedding çağrısı, yeni bağımlılık,
commit, push, merge, reset veya branch değişikliği yapılmadı.

## 1. Kesin bulunan hatalar

| Önem | Dosya / fonksiyon | Bulgu ve doğrulama |
| --- | --- | --- |
| Yüksek | `services/geminiService.js` / `geminiHatasiniSiniflandir` | 400/403/404 ve bilinmeyen hatalar genel 503'e dönüşebiliyordu; ağ hatası da aynı sınıftaydı. Sağlayıcı kodları korunuyor, bilinmeyen hata 500, ağ hatası 502, timeout 504. Mock testleri mevcut. |
| Yüksek | `services/geminiService.js` / `yapilandirilmisGeminiCagrisi` | Geçerli JSON ile gelen `MAX_TOKENS` cevabı başarı sayılabiliyordu. Şimdi çıktı sınırı teşhisiyle reddediliyor; özet olarak kaydedilmiyor. |
| Yüksek | `services/testService.js` / `testOlustur` | Aynı kullanıcının aynı parametrelerle paralel istekleri iki üretim/kayıt başlatıyordu. Süreç içi devam eden istekler tek üretime katılıyor; başarı/hata sonrasında kayıt temizleniyor. |
| Yüksek | `services/dersOzetiService.js` / `dersOzetiOlustur`, `kilidiYenile` | Uzun SDK çağrısı içinde kilit yenilenmiyordu. Periyodik, üst üste binmeyen yenileme eklendi. Sahiplik kaybolursa eski özetin ve yeni sahibin kilidinin korunması test edildi. |
| Orta | `services/dersOzetiService.js` / `dersOzetiOlustur` | İlk cache okuması ile kilit edinimi arasında tamamlanan güncel özet tekrar üretiliyordu. Kilit alındıktan sonra cache tekrar doğrulanıyor. |
| Yüksek | Üç AI controller / `hataYaniti` | Beklenmeyen hataların nesnesi veya ham mesajı loglanabiliyordu. Yalnızca sabit hata kodu loglanıyor; sentetik gizli anahtar, materyal ve mesajın log/cevapta bulunmadığı test edildi. |
| Orta | `frontend/src/utils/kullaniciHatasi.mjs` / `kullaniciHataMesaji` | Güvenli kodlara sahip 5xx hataları da tek genel mesajla kayboluyordu. Sabit Türkçe mesaj listesi eklendi; teknik gövde kullanılmıyor. |

İlk beş bulgu düzeltme öncesinde beş başarısız mock testle tekrar üretildi;
düzeltmelerden sonra aynı testler geçti. Soru, doğru cevap veya kanıt doğrulaması gevşetilmedi.

## 2. Potansiyel riskler

- **Orta — `utils/geminiOrtakIstekYonetimi.js` / `yerAyir`, `testService.js` / `testOlustur`:**
  ani yük ve aynı test isteğini birleştirme korumaları aynı Node.js süreciyle sınırlı.
  Birden fazla sunucu, embedding ve mevcut ayrı konu haritası sınırlayıcısı tek ortak
  proje kotasını birlikte saymıyor. Dağıtık kota/idempotency garantisi verilmez.
- **Orta — kurulu `@google/genai@1.34.0` / `throwErrorIfNotOK`:**
  SDK `RetryInfo` gövdesini koruyor, HTTP `Retry-After` başlığını `ApiError` nesnesine
  taşımıyor. Transport mock testi bunu doğruladı. Ortak yardımcı erişebildiği
  `Retry-After` ve `RetryInfo` değerlerini uygular; yalnızca başlıkta verilen beklemeyi
  bu SDK yolunda göremez. SDK değiştirilmedi, global fetch yaması eklenmedi.
- **Orta — `geminiService.js` / `geminiIleTestSorulariUret`, `dersOzetiService.js` / `geminiOzetiniUret`:**
  başarılı ara sonuçlar aynı çalışma boyunca tutulur. Sonraki bağımsız kullanıcı
  denemesi veya sunucu yeniden başlatması bunları tekrar kullanmaz. Kalıcı checkpoint;
  kaynak sürümü, parametre, kullanıcı ve model anahtarı, sahiplik, temizlik ve saklama
  süresi gerektirdiğinden bu sınırlı düzeltmeye eklenmedi. Eksik sonuç tamamlanmış kaydedilmez.
- **Orta — `dersOzetiService.js` / `kayitliOzetGuncelMi`:**
  yeni kayıtlarda tam kaynak sürümü kontrolü var; eski, tam sürüm listesi bulunmayan
  kayıtlar kullanılan kaynak snapshot'larına dayanır. Eski kayıtlar topluca değiştirilmedi.
- **Orta — `geminiService.js` / `geminiIleDersOzetiUret`, `dersAsistaniService.js` / kaynak doğrulama:**
  doğru kapsam ve geçerli kaynak referansı, modelin her cümlesinin olgusal doğruluğunu
  kanıtlamaz. Test sorularındaki alıntı/cevap kontrolleri de deterministik kontrollerdir;
  genel bir anlamsal doğruluk garantisi değildir.
- **Düşük — frontend build:** yaklaşık 568 kB JavaScript parçası için 500 kB uyarısı
  var. Build başarılı; bu görevde paket bölme veya tasarım değişikliği yapılmadı.

## 3. Yapılan sınırlı düzeltmeler

- Ortak Gemini sınıflandırıcısı mevcut saf hata/kota ayrıştırıcısını kullanır;
  konu haritasının yardımcıları ve çağrı yolu değiştirilmedi.
- 503 ve geçici bağlantı/timeout için 1, 2, 4, 8 saniye tabanlı,
  0–250 ms jitter içeren, en fazla 10 saniyelik tek beklemeye izin veren retry.
  Günlük kota tekrar edilmez; bekleme bilgisi olmayan 429 için hızlı retry yoktur.
  Daha uzun sağlayıcı beklemesi kısa bir beklemeye kırpılıp tekrar edilmez.
- Test/özet varsayılan toplam deneme sayısı 3, ayarlanabilir aralık 1–5.
  Sohbet varsayılan 2, başlık 1. Testin onarım/küçültme dahil SDK bütçesi en fazla 32;
  daha düşük mevcut hesaplanan bütçe de korunur.
- Model başına süreç içi varsayılan iki eşzamanlı SDK isteği; kuyruk tutulmaz.
  Yer bulunamazsa güvenli yerel yoğunluk hatası döner, SDK sayacı artmaz.
  Başarılı çağrı tekrar edilmez; bekleme sırasında slot tutulmaz.
- `.env.example`: `GEMINI_TEST_MAKS_DENEME`, `GEMINI_OZET_MAKS_DENEME`,
  `GEMINI_ORTAK_MAKS_ESZAMANLI_ISTEK`. Bunlar Google'ın evrensel kota değerleri değildir.
- Gerçek SDK sayaçları korunur; kota türü, erişilebilir retry süresi ve işlem süresi
  güvenli tanılama alanlarına eklenir. İstemci kurulumu başarısızsa SDK denemesi sıfırdır.

Değişen uygulama dosyaları: `services/geminiService.js`, `services/testService.js`,
`services/dersOzetiService.js`, `services/testTanilamaService.js`,
`utils/geminiOrtakIstekYonetimi.js`, üç ilgili AI controller,
`backend/.env.example` ve frontend `kullaniciHatasi.mjs`.
İlgili mevcut testler genişletildi; `geminiOrtakGuvenilirlik.test.js` ve
`aiControllerGizlilik.test.js` eklendi. Veritabanı şeması, endpoint,
hazırlama/embedding/semantik servis, sohbet iş mantığı ve sayfa tasarımları değiştirilmedi.

## 4. Test sistemi değerlendirmesi

**Yüksek önem, giderildi — `geminiService.js` / ortak çağrı ve `testService.js` / üretim:**
verilen gerçek olay HTTP 503 / `UNAVAILABLE` sağlayıcı hatasıdır. JSON, soru onarımı veya
kesin kota hatası sayılmıyor. İlk partide üretim bitmeden gelen hata kendi SDK çağrısında
sınırlı retry görür; sürekli başarısızlıkta güvenli 503 döner, yarım test kaydedilmez.
Orijinal olayın korelasyon kimliği/log dosyası sağlanmadığından özgün 5416 ms'lik
çalışmayı bağımsız olarak ilişkilendirme iddiası yoktur; verilen olay mock ile incelendi.

5/10/15/20 soru × tüm ders/materyal/konu × kolay/orta/zor/karışık olmak üzere 48
kombinasyon mock üretimden geçti. Kesin sayı, zorluk dağılımı, izinli kaynak ve
en fazla beş soruluk parti boyutu doğrulandı. Son partide iki 503 sonrası ilk iki
partinin yeniden üretilmediği ve 15 sorunun tamamlandığı gösterildi. Son partideki
uydurma alıntı veya yanlış doğru cevap reddedildi. Mevcut eksik JSON/sayı,
tekrar soru, yanlış konu, kaynak kanıtı ve kayıt öncesi sürüm testleri geçiyor.

## 5. Özet sistemi değerlendirmesi

**Yüksek önem, giderildi — `dersOzetiService.js` / üretim ve kilit:**
tüm ders/materyal/konu kaynak kapsamı, eşzamanlı kilit, güncel cache ve kayıt öncesi
sürüm kontrolü korunuyor. Uzun metnin ara özet sırası ve tek nihai birleştirmesi
mock ile doğrulandı. Başarısız yeniden oluşturma eski başarılı içeriği silmiyor.
Periyodik yenileme kilit sahipliğini kaybederse geç gelen içerik kaydedilmiyor ve
başka işlemin kilidi bırakılmıyor. Sayfaların mevcut yükleme/iptal korumaları korunuyor.

## 6. Sohbet sistemi değerlendirmesi

**Yüksek önem taşıyan korumalar, mevcut testlerle doğrulandı —
`sohbetService.js`, `dersAsistaniService.js`, ilgili modeller:**
istemci istek kimliğiyle tekrar, farklı içerikte kimlik çakışması, transaction,
kullanıcı/ders/sohbet sahipliği, mesaj sırası, tek asistan yanıtı, hata sonrası tekrar,
kilit ve uydurma kaynak kodu filtreleri incelendi. Yalnızca materyal modunda kaynak
yoksa model çağrılmıyor. Somut sohbet iş mantığı hatası bulunmadı; değiştirilmedi.

**Yüksek önem taşıyan kaynak korumaları, mevcut testlerle doğrulandı —
`semanticAramaService.js` / `semanticAramaYap`:** kullanıcı/ders ve aktif materyal
sürümü filtreleri, embedding sürerken değişen kaynakları ayıklama, kapsam sınırı ve
boş kaynakta gereksiz embedding çağrısı yapmama korunuyor. Semantik sistem yeniden tasarlanmadı.

## 7. Gemini kota ve performans değerlendirmesi

**Orta önem — `geminiService.js` / `yapilandirilmisGeminiCagrisi`:**
testler geçici servis yoğunluğuna daha dayanıklı; sınırsız retry yok.
Başarılı partiler aynı çalışma içinde tekrar üretilmez. Tek işlemde ek denemenin
maliyet/süreyi artırabileceği test bütçesiyle sınırlandı. Özet toplam işi kaynak ve
parti bütçeleriyle sınırlıdır; bağımsız kalıcı ara sonuç cache'i eklenmedi.

Kurulu gerçek SDK ile global `fetch` yalnızca test süresince mock edildi:
uygulama timeout sinyali gerçek HTTP `AbortSignal`ine ulaştı, istek iptal edildi ve
bir SDK denemesi bir fetch çağrısı yaptı. API anahtarı olarak sentetik değer kullanıldı.
Bu, iptalin sağlayıcıya ulaşmış bir isteğin ücretini kesin iptal edeceği anlamına gelmez.

## 8. Test sonuçları ve kalan riskler

- Backend: `RUN_LIVE_GEMINI_TESTS=false npm test` — **391/391 başarılı**.
- Frontend: `npm test` — **101/101 başarılı**.
- Frontend: `npm run lint` — başarılı; `npm run build` — başarılı, parça boyutu uyarısı var.
- Backend paketinde ayrı lint/build script'i yok; değişen JavaScript dosyaları
  `node --check` ile doğrulandı.
- `git diff --check` — başarılı.
- Konu haritasının `callGeminiStructuredJson` ve sonraki üretim kodları ile mevcut
  timeout yardımcısı HEAD ile birebir karşılaştırıldı; aynı. Hazırlama ve konu haritası
  regresyonları tam backend test çalışmasına dahil.

Canlı deneme öncesinde yöneticinin model erişimini, gerçek proje kota değerlerini,
çıktı token sınırlarını, deneme ayarlarını ve kabul edilen çağrı maliyetini doğrulaması
gerekir. Gerçek MongoDB indeksleri/transaction desteği ve kullanılan instance sayısı
dağıtım ortamında kontrol edilmelidir. Yalnızca HTTP başlığında bekleme bildiren
sağlayıcı yanıtları için yukarıdaki SDK sınırı dikkate alınmalıdır.

**Çalışma kartları geliştirmesini engelleyen kanıtlanmış kritik hata kalmadı.**
Bu değerlendirme mock testleri ve kod incelemesine dayanır; canlı sağlayıcı veya
gerçek veritabanı yük testi yapıldığı anlamına gelmez. Çalışma kartlarına başlanmadı.

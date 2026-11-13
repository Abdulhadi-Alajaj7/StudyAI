# Konu Bazlı Otomatik + Akıllı Batch — uygulama raporu

13 Kasım 2026. Branch: `feature/calisma-kartlari-sistemi`, temel commit: `d932a9c`.
Devralınan altı dosyanın değişiklikleri korundu; eksik worker, scheduler, entegrasyon,
mock testleri ve dokümantasyon tamamlandı. Commit/push/merge ve değişiklik kaybettiren
Git işlemi yapılmadı. Yeni paket eklenmedi, `.env` değiştirilmedi.

**Sonuç: KOD_VE_MOCK_TAMAMLANDI. CANLI_DOĞRULAMA_YAPILMADI.**
Önceki 437/106 veya 462/108 sonuçları bu çalışmanın kanıtı olarak kullanılmadı.

## Hedef durumları

Aşağıdaki TAMAMLANDI durumları kod ve güvenli mock doğrulaması kapsamındadır.

| Geliştirme hedefi | Durum | Bu çalışmadaki sonuç |
| --- | --- | --- |
| 1. Gemini 503, sınırlı retry, güvenli fallback | TAMAMLANDI | Mevcut ortak retry/fallback korundu; kalıcı iş geçici hatada en fazla üç otomatik devam, sonra durma uygular. |
| 2. Görev bazlı Primary/Fallback routing | TAMAMLANDI | Çalışan yapı korundu ve tam regresyonlarla doğrulandı; yeni model etkinleştirilmedi. |
| 3. Ortak RPM/TPM/RPD ve toplam bütçe | TAMAMLANDI | Ortak model kotası korunur; günlük bekleme DST ile hesaplanır. Ders/gün ve iş/ömür çağrı sınırı kalıcıdır. Tek başına TPM'ye sığmayan istek sonsuza kadar beklemez. |
| 4. Embedding 503 ve mevcut vektörler | TAMAMLANDI | Lexical fallback veya kayıtlı bekleme; aranmamış konu kaynak yok sayılmaz. Seçim checkpoint'i yeni turda tekrar embedding'i önler. Belge vektörleri değiştirilmedi. |
| 5. Hybrid Retrieval | TAMAMLANDI | Güçlü semantik kaynak kelime örtüşmesi yok diye elenmez; yanlış kimlik/sürüm/metin elenir. |
| 6. Dinamik kavram/kart sayısı | TAMAMLANDI | Kavramları Gemini seçer. CevapIndex üretim zorunluluğu kalktı. Sekiz kavramın birden fazla turda sekiz kart olması mock testle doğrulandı. |
| 7. Kısa doğal Türkçe, kanıtlı soru-cevap | TAMAMLANDI | Model sorusu korunur. Cevap tam özgün cümle veya tam tanım aralığıdır; uydurma cevap, kesilmiş olumsuzluk, yanlış kullanıcı/ders/sürüm ve tekrar reddedilir. |
| 8. Kontrollü batch ve token sınırları | TAMAMLANDI | Bağlı konular birlikte gönderilir, kaynaklar kesilmez, girdi/çıktı/kart/materyal sınırları uygulanır; tur sınırı otomatik devamı engellemez. |
| 9. Kalıcı iş/checkpoint ve öğrenci verisi | TAMAMLANDI | Tek tık, otomatik tarama, restart devralma, kira/lease, eşzamanlılık ve toplam sınır testleri geçti. Eski kartlar, kimlikler, yıldızlar ve değerlendirmeler korunur. |
| 10. Frontend/backend, regresyon ve belgeler | TAMAMLANDI | Bekleme/otomatik devam arayüzü, hazır kartla çalışma ve toplam sınırda butonun kapanması doğrulandı. Tam backend/frontend testleri, lint, build ve tarayıcı geçti. |

## Gerçekten değiştirilen kaynak dosyaları

- [CalismaKartiDestesi.js](../models/CalismaKartiDestesi.js): opsiyonel kalıcı iş ve kaynak checkpoint alanları, eski şema uyumluluğu.
- [calismaKartlariService.js](../services/calismaKartlariService.js): kaynak tabanlı turlar, ortak bütçe, kalıcı bekleme, scheduler, lease/transaction ve öğrenci verisini koruyan ekleme.
- [geminiService.js](../services/geminiService.js): doğal çok konulu protokol, modelin kavram/soru seçimi, bağımsız kart doğrulaması; eski çağıranlar için adaptör.
- [calismaKartiKanit.js](../utils/calismaKartiKanit.js): kaynak sahipliği, aktif sürüm, tam kanıt/cevap aralıkları ve tekrar doğrulaması.
- [calismaKartiPlanlama.js](../utils/calismaKartiPlanlama.js): tam kaynaklı batch, konu açıklaması/önceki kavramlar ve kaynak hash'i.
- [geminiOrtakIstekYonetimi.js](../utils/geminiOrtakIstekYonetimi.js): günlük kota bekleme zamanı ve kalıcı tek-istek TPM taşması ayrımı.
- [server.js](../server.js): başlangıç taraması ve periyodik devam bağlantısı. Bu sunucu çalıştırılmadı.
- [calismaKartiSaltOkunurTani.js](../scripts/calismaKartiSaltOkunurTani.js): yeni protokol için saf hazırlık, aktif iş varken tanı çağrısını engelleme. CLI çalıştırılmadı.
- [DersCalismaKartlari.jsx](../../frontend/src/pages/DersCalismaKartlari.jsx): bekleme mesajı, otomatik devam ve toplam sınırda devre dışı buton.
- [calismaKartlariYardimcilari.mjs](../../frontend/src/utils/calismaKartlariYardimcilari.mjs): bilinmeyen dinamik hedef ve iş durumu metinleri.
- [kullaniciHatasi.mjs](../../frontend/src/utils/kullaniciHatasi.mjs): toplam sınır/ilerleme durması mesajları.
- [.env.example](../.env.example): tur, ders/gün, iş/ömür sınırlarının ayrı belgelenmesi; gerçek `.env` aynı kaldı.

Testler: `backend/tests/calismaKartlari.test.js`, `backend/tests/calismaKartlariV2Plus.test.js`,
yeni `backend/tests/calismaKartlariDogal.test.js`, `frontend/tests/calismaKartlari.test.mjs`,
`frontend/tests/calismaKartlari.browser.mjs`.
Belgeler: `CALISMA_KARTLARI.md`, tarihsel olarak işaretlenen `V2_PLUS_UYGULAMA_NOTLARI.md`, bu rapor.

## Çalıştırılan kontroller

| Komut / kontrol | Sonuç |
| --- | --- |
| `backend: npm test` — son tam çalıştırma | **481/481 geçti**, 0 başarısız, 0 atlanan, yaklaşık 66 saniye |
| Kart odaklı 3 dosya — son odaklı çalıştırma | **62/62 geçti**; ardından eklenen 2 senaryo da 481 testlik tam pakette geçti |
| `frontend: npm test` | **110/110 geçti**, 0 başarısız, 0 atlanan |
| `frontend: npm run lint` | Başarılı |
| `frontend: npm run build` | Başarılı; mevcut büyük JS chunk uyarısı var (591,02 kB, gzip 158,96 kB), hata değil |
| `frontend: node tests/calismaKartlari.browser.mjs` | Başarılı; tüm uygulama API'leri mock. Masaüstü/mobil, klavye, yıldız/değerlendirme, otomatik devam, yeniden açma, toplam sınır, eski kısmi kayıt ve özet sekmesi |
| `node --check` (server, tanı scripti, kart servisi, Gemini servisi) | Başarılı |
| `git diff --check` | Başarılı |

Tarayıcı ilk sandbox denemesinde DevTools zaman aşımına uğradı. İzinli yeniden
çalıştırma yeni testteki beklenen ekranın yanlış olduğunu gösterdi: yeniden açılan
sayfa hazır kartları doğrudan gösteriyordu. Beklenti düzeltildi, aynı mock test geçti.
Üretim akışı veya güvenlik kontrolü test geçsin diye devre dışı bırakılmadı.

Backend preload'u gerçek fetch/TCP/Mongo bağlantısını engelledi ve sahte API anahtarı
kullandı. DB işlemleri enjekte edilen bellek modelleri ve transaction simülasyonudur.
Tam paket mevcut Test, Özet, Sohbet, Konu Haritası, embedding, routing ve kota
regresyonlarını da kapsar; gerçek servislere erişilmedi.

## Doğrulanmamış noktalar ve canlı izin sınırı

- Gerçek Gemini/Embedding çağrısı: **0**. Gerçek MongoDB yazma/silme/migration: **0**.
  Uygulama backend'i ve gerçek veriyle tanı scripti çalıştırılmadı.
- Gerçek model erişimi, pedagojik soru kalitesi/kavram kapsamı, gerçek token maliyeti,
  Mongo replica-set transaction/lease ve çoklu süreç/yük davranışı **CANLIDA DOĞRULANMADI**.
- Model ortak RPM/TPM/RPD sayacı mevcut tasarımda süreç içidir. Çoklu sunucu/restart
  boyunca proje geneli kalıcı model kotası garantisi yoktur. İş ve ders çağrı sınırı
  kalıcıdır; belirsiz crash tüketimi iade edilmez. Yeni Redis/harici kuyruk eklenmedi.
- Teknik kaynak ve toplam tüketim sınırına ulaşan ders otomatik olarak tamamlandı
  sayılmaz. Hazır kartlar korunur, anlaşılır durma sebebi gösterilir. Kapsamın tamamı
  içinde kanıt bulunamayan veya doğrulanamayan konular eksik olarak kalır.
- Canlı deneme ayrı açık izin gerektirir. Backend açılışı önceden başlatılmış işleri
  devam ettirebilir; burada canlı akış tetiklenmeden duruldu.

## Son Git dökümü

`git diff --stat` çıktısı (izlenen dosyalar; aşağıdaki iki yeni dosya bu sayıma dahil değildir):

```text
 backend/.env.example                               |   8 +-
 backend/docs/CALISMA_KARTLARI.md                   | 270 ++++++--------
 backend/docs/V2_PLUS_UYGULAMA_NOTLARI.md           |   6 +-
 backend/models/CalismaKartiDestesi.js              |  18 +
 backend/scripts/calismaKartiSaltOkunurTani.js      |  34 +-
 backend/server.js                                  |   5 +-
 backend/services/calismaKartlariService.js         | 399 +++++++++++++--------
 backend/services/geminiService.js                  |  55 ++-
 backend/tests/calismaKartlari.test.js              | 231 +++++++++---
 backend/tests/calismaKartlariV2Plus.test.js        |  21 +-
 backend/utils/calismaKartiKanit.js                 |  58 +++
 backend/utils/calismaKartiPlanlama.js              |  59 +++
 backend/utils/geminiOrtakIstekYonetimi.js          |  14 +-
 frontend/src/pages/DersCalismaKartlari.jsx         |   7 +-
 frontend/src/utils/calismaKartlariYardimcilari.mjs |  10 +
 frontend/src/utils/kullaniciHatasi.mjs             |   2 +
 frontend/tests/calismaKartlari.browser.mjs         |  22 +-
 frontend/tests/calismaKartlari.test.mjs            |  17 +-
 18 files changed, 845 insertions(+), 391 deletions(-)
```

Yeni, henüz izlenmeyen dosyalar: `backend/tests/calismaKartlariDogal.test.js` ve
`backend/docs/KART_OTOMATIK_URETIM.md`. Çalışma ağacı toplam 20 değişen/yeni dosyadan
oluşur. Tamamı commit edilmeden aynı branch üzerinde bırakıldı.

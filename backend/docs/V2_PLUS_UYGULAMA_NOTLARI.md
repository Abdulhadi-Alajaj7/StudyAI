# V2+ uygulama kaydı — 12–13 Kasım 2026

> Bu belge önceki V2+ uygulamasının tarihsel kaydıdır. 462/462 ve 108/108
> sonuçları yeni otomatik üretim protokolünün kanıtı değildir. Güncel çalışma:
> [Konu Bazlı Otomatik + Akıllı Batch](KART_OTOMATIK_URETIM.md).

**Bu tarihsel çalışmanın son durumu (13 Kasım): KOD_VE_MOCK_HAZIR / CANLI_TEST_IZNI_BEKLENIYOR.**
Backend 462/462, frontend 108/108; tarayıcı, lint, build, sözdizimi ve diff kontrolü başarılı.
Gerçek Gemini: 0; gerçek embedding: 0; gerçek MongoDB yazımı/silme/migration: 0.

Başlangıç: `feature/calisma-kartlari-sistemi`, `f942552`, temiz çalışma ağacı.
Bu kayıt önceki V2 test raporunun yerine geçmez. Canlı API ve MongoDB işlemleri yasak; commit/push/merge yapılmaz.

Bağımlılık sırası:
1. Ortak SDK denemesi, hata sınıflandırması, model kotası ve doğrulanmış model routing.
2. Embedding devamı ve mevcut semantic search üzerinden hybrid kaynak seçimi.
3. Kanıt tabanlı kavram planı, doğal soru-cevap, kontrollü batch ve checkpoint.
4. Frontend durumları, regresyonlar, karşılaştırma ve dokümantasyon.

İlk inceleme: V2 kanıt aralıkları, kısmi kart kaydı, transaction/lease ve öğrenci durumları mevcut.
Eksikler: ortak RPM/TPM/RPD ve fallback yok; kart kaynakları yalnız keyword; hedef 1–4;
doğal soru-cevap ve çok konulu batch yok. Embedding parti kaydı mevcut ve korunacak.

## 13 Kasım devam kontrolü

Branch değişmedi. Devralınan 24 izlenen dosya değişikliği ve 8 untracked
dosya/dizin kaydı korunuyor; `git diff --check` temiz. Önceki 437/106 sonuçları
V2+ tamamlanma kanıtı olarak kullanılmadı. Gerçek API ve MongoDB işlemi yapılmadı.

Kod ve mevcut regresyonlara göre ara durum:

| Aşama | Durum | Kanıt / kalan iş |
| --- | --- | --- |
| Ortak retry, routing, kota | TAMAMLANDI (mock) | 3 primary + 1 fallback; ortak bütçe, iptal, lease ve Pacific günü testleri |
| Embedding ve hybrid | TAMAMLANDI (mock) | Aktif sürüm, vektör koruma, sorgu cache ve keyword fallback regresyonları |
| Dinamik kavram, doğal kart, batch, checkpoint | TAMAMLANDI (mock) | Çok konulu batch, eksik kavramdan devam, geçerli kısmi kayıt ve öğrenci durumu testleri |
| Frontend | KISMEN TAMAMLANDI | 108/108 birim testi, lint/build başarılı; tarayıcı sürücüsünde iptal edilmiş CDP isteği düzeltilecek |
| Son regresyon ve dokümantasyon | HATALI / TEST BAŞARISIZ | Son backend 458 testin 457'si başarılı; eklenen gerçek-model metadata alanının sözleşme testi güncellenecek |

Kalanlar: backend tam regresyonunu ve tarayıcı testini başarıyla bitirmek,
salt okunur canlı tanı scriptini V2+ batch protokolüne uyarlamak, güncel kullanım
belgesini ve son Git dökümünü tamamlamak. Aşağıdaki nihai kayıt bu ara durumun
yerini alacaktır; canlı kabul için ayrıca açık izin gerekir.

## Nihai uygulama ve doğrulama — 13 Kasım 2026

Ara kontroldeki başarısız testler giderildi. Bu kayıt eski 437/106 V2 sonuçlarına
dayanmaz; güncel kod üzerinde aşağıdaki komutlar gerçekten çalıştırıldı.
Kod/mock kapsamındaki 12 aşama tamamlandı. Gerçek sağlayıcı ve MongoDB kabulü
**TAMAMLANMADI**; kullanıcının açık izni olmadığı için çalıştırılmadı.

### Aşama durumları

| Aşama | Durum (kod/mock) | Uygulama ve kanıt | Canlı sınır / bilinen sınırlama |
| --- | --- | --- | --- |
| 1. V2 kanıt protokolü | TAMAMLANDI | Konu, kanıt kimliği, cevap indeksi, özgün aralık, aktif kaynak; geçerli kısmi sonuç korunur | Modelin gerçek seçim kalitesi kabul edilmedi |
| 2. 503 retry/fallback | TAMAMLANDI | En çok 3 primary + 1 doğrulanmış fallback; düşük bütçe, backoff/jitter, RetryInfo, timeout, iptal ve lease testleri | Hesapta sağlayıcı çağrısı yapılmadı |
| 3. Görev bazlı model routing | TAMAMLANDI | Altı göreve ayrı primary/fallback; mevcut env korunur, doğrulama listesi ve pozitif kota şartı | Hedef yeni modeller varsayılan pasif |
| 4. Ortak RPM/TPM/RPD | TAMAMLANDI | Normalize model bazlı ortak defter; Pacific gün sınırı, rezervasyon/mutabakat, eşzamanlılık, gerçek SDK sayısı | Süreç içi; multi-instance/restart garantisi yok |
| 5. Embedding 503 devamı | TAMAMLANDI | Ortak retry; başarılı batch ve hazır vektör korunur; hash/model/boyut cache ve sahiplik | Belge embedding'i veya gerçek indeks üretilmedi |
| 6. Hybrid retrieval | TAMAMLANDI | Mevcut cosine servisi, keyword birleşimi, aktif sürüm/parça doğrulama, sınırlı sorgu cache, görünür fallback | Retrieval toplam çağrı bütçesinde; gerekirse keyword kullanılır |
| 7. Dinamik kart sayısı | TAMAMLANDI | Kavram planı; 8 farklı kavrama 8 hedef, duplicate ve tamamlanmış kavram eleme; sıfır nedenleri ayrı | Sezgisel ifade çıkarımı ve kaynak bütçesi tam pedagojik kapsam garantisi değildir |
| 8. Doğal Türkçe soru-cevap | TAMAMLANDI | Sunucu tanım/formül kalıbından soru kurar, cevap özgün aralıktan; serbest/hatalı metin reddedilir | Desteklenmeyen kalıplar güvenli boşluk doldurmada kalır |
| 9. Batch/token optimizasyonu | TAMAMLANDI | İlişkili konular; konu/kart/materyal/girdi/çıktı sınırları; tüm eski kartlara karşı doğrulama | Tokenlar sağlayıcı metadata'sı yoksa tahmindir |
| 10. Checkpoint/eski veriler | TAMAMLANDI | Konu başına transaction; ikinci kayıt hatasında ilk checkpoint; yalnız eksiklerden devam, kimlik/ilerleme korunur | Gerçek MongoDB transaction/indeks/yük kabulü yapılmadı |
| 11. Frontend | TAMAMLANDI | Sıfır kavram, kısmi ilerleme, keyword fallback ve kaynak değişiminde salt okunur eski kartlar | Gerçek backend uçtan uca kabulü mock dışındadır |
| 12. Test ve dokümantasyon | TAMAMLANDI | Ağ kapalı backend test ön yükleyicisi; UI mock tarayıcı, güncel env örneği, kullanım/tanı/karşılaştırma | Canlı erişim ve üretim testleri izin bekler |

İlk istekteki 10 hedefin karşılığı: retry (2), routing (3), kota (4), embedding (5),
hybrid (6), dinamik (7), doğal kart (8), batch (9), checkpoint (10), entegrasyon/test/doküman (11–12).
Hepsinin kod/mock durumu **TAMAMLANDI**; canlı üretim doğrulandı sonucu verilmez.

### Önceki değişikliklerin korunması ve bu devamda biten işler

Devralınan ortak Gemini yöneticisi, routing, embedding/semantic, kavram/batch,
checkpoint ve frontend değişiklikleri korunarak devam edildi. Yeni branch veya
worktree oluşturulmadı. HEAD `f942552a213ae3d6f55301811ebf6e9560cf91bd` olarak kaldı.

Bu devamda test sonucu sözleşmesi `kullanilanModeller` metadata'sını doğrulayacak
şekilde tamamlandı. Chromium testinde gerçek Enter/Space ve yeni durumlar korundu;
HMR/dosya izleme ve harici font yüklemesi kaynaklı DevTools yarışı giderildi.
Son başarılı çalışmada iptal edilmiş istek sayısı da 0'dı.

Salt okunur tanı scriptindeki eski 1–4 sayısı ve tek konu V2 protokolü, ilk eksik
kavramların ilk sınırlı V2+ batch'i ile değiştirildi. Saf hazırlık fonksiyonu
sentetik verilerle test edildi. Script import edildiğinde .env yüklemez veya
MongoDB bağlantısı başlatmaz; komut satırı canlı akışı bu oturumda çalıştırılmadı.

Doğrudan batch girişindeki çıktı/materyal sınırları ve semantic sahiplik hatasının
keyword fallback ile gizlenmemesi tamamlandı. Yerel kotada engellenen fallback'in
SDK çağrısı/gerçek fallback sayılmaması düzeltildi; güvenli loglarda tahmini/gerçek
token, retry, SDK sayısı, fallback ve süre ayrı tutuldu. Testleri eklendi.

### Değişen kaynak ve script dosyaları

| Dosya (repo köküne göre) | Gerekçe / etkisi |
| --- | --- |
| `backend/utils/geminiOrtakIstekYonetimi.js` | Tek retry/fallback döngüsü, süre/iptal/lease, model bazlı ortak RPM/TPM/RPD ve kullanım mutabakatı |
| `backend/utils/geminiModelYonlendirme.js` (yeni) | Model normalizasyonu, görev ayarları, doğrulanmış erişim listesi, kota profili doğrulaması |
| `backend/utils/geminiHazirlamaHatasi.js` | Yerel/sağlayıcı ayrımı, Türkçe hatalar, jitter, güvenli metadata; log hatası başarıyı tekrarlatmaz |
| `backend/services/geminiService.js` | Harita/kart/test/özet/sohbet/başlık ortak yöneticiye bağlı; V2+ structured batch ve gerçek model metadata |
| `backend/services/embeddingService.js` | Ortak deneme/bütçe; başarılı parti ve mevcut vektör koruma; sahipliğe bağlı kapsamlı yazım filtreleri |
| `backend/services/semanticAramaService.js` | Aktif sürümlü kullanıcı/ders/model sorgu cache'i, bütçe/lease aktarımı, parça sürümü çıktısı |
| `backend/utils/calismaKartiPlanlama.js` (yeni) | Kavram kimliği/türü/konu ilişkisi, eksik kavramlar, sıfır nedeni; kaynak/schema dahil sınırlı batch planı |
| `backend/utils/calismaKartiKanit.js` | Doğal soru/cevabı özgün kaynak aralığından oluşturma; eski boşluk doldurma uyumluluğu |
| `backend/utils/calismaKartiDogrulama.js` | Ayrı konudaki ayrı soruları yalnız benzer uzun cevap yüzünden duplicate saymama |
| `backend/services/calismaKartlariService.js` | Hybrid seçim, kavram hedefi, paylaşılan çağrı bütçesi, konu checkpoint'i, eksikten devam ve salt okunur eski deste |
| `backend/models/CalismaKartiDestesi.js` | 1–4 sınırını kaldırma; opsiyonel kavram/kart türü/parça/retrieval/gerçek model alanları; migration yok |
| `backend/scripts/calismaKartiSaltOkunurTani.js` | İlk eksik konu için V2+ hazırlık, tek SDK hakkı, routing kapalı; salt okunur canlı test hazırlığı |
| `backend/scripts/kartV2MockKarsilastirma.js` (yeni) | Aynı sentetik kavramlarla eski tek konu ve yeni batch ölçümü; gerçek API/DB yok |
| `frontend/src/pages/DersCalismaKartlari.jsx` | Gerçek konu ilerlemesi, sıfır kavram ve salt okunur eski kart durumu |
| `frontend/src/utils/calismaKartlariYardimcilari.mjs` | Konu/kavram/retrieval sonuçlarının Türkçe durum mesajları |
| `frontend/src/utils/kullaniciHatasi.mjs` | Yerel kota, model kapalı, süre ve batch sınırı mesajları |

Diğer değişiklikler: `backend/.env.example`, `backend/package.json`; backend
testleri `calismaKartlari`, `embeddingService`, `geminiCalismaKartlari`,
`geminiHazirlamaRetry`, `geminiOrtakGuvenilirlik`, `geminiSohbet`, `konuHaritasiVeGemini`,
`semanticArama`, `testTanilama`; yeni `calismaKartlariV2Plus`, `geminiV2Altyapi` ve
`tests/helpers/guvenliTestOrtami.js`; frontend `tests/calismaKartlari.test.mjs` ve
`tests/calismaKartlari.browser.mjs`; kullanım belgesi, tarihsel V1 notu, bu kayıt ve
`V2_PLUS_MOCK_KARSILASTIRMA.json`. Paket/SDK yükseltmesi veya yeni bağımlılık yok.

### Model planı ve doğrulama sınırı

Aşağıdaki mevcut sütunu **kodun varsayılanıdır**; gerçek .env okunarak hesapta
kullanılan ayarlar doğrulanmadı veya değiştirilmedi. Eski `*_MODELI` değerleri
önceliğini korur. Yeni primary/fallback ayarları örnekte boş ve routing kapalıdır.

| Görev | Mevcut kod varsayılanı | Hedef primary | Hedef fallback | Yeni rota |
| --- | --- | --- | --- | --- |
| Konu haritası | gemini-3.5-flash-lite | gemini-3.5-flash-lite | gemini-3.1-flash-lite | Pasif |
| Kart | gemini-3.5-flash-lite | gemini-3.1-flash-lite | gemini-3.5-flash-lite | Pasif |
| Test | gemini-3.5-flash-lite | gemini-3.1-flash-lite | gemini-3.5-flash-lite | Pasif |
| Özet | gemini-3.5-flash-lite | gemini-3.5-flash-lite | gemini-3.1-flash-lite | Pasif |
| Sohbet | gemini-3.5-flash-lite | gemini-3.5-flash-lite | gemini-3.1-flash-lite | Pasif |
| Sohbet başlığı | Mevcut sohbet modeli | gemini-3.1-flash-lite | gemini-3.5-flash-lite | Pasif |
| Semantic | gemini-embedding-001 / 768 | Aynı | Yok | Model geçişi yok |

13 Kasım resmi belge kontrolü: [3.5 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.5-flash-lite)
ve [3.1 Flash-Lite](https://aistudio.google.com/docs/models/gemini-3.1-flash-lite)
model kodları ve structured output desteği belgeleniyor. [Fiyatlandırma](https://aistudio.google.com/docs/pricing)
standart metin üretimi ve embedding-001 için Free Tier girdileri içeriyor.
Bu, kullanıcının projesindeki erişim/kota veya ücretsiz hak doğrulaması değildir;
paid tier/billing etkinleştirilmedi. Pro/Live/ses/görüntü modelleri zincire eklenmedi.

Kurulu `@google/genai` 1.34.0'ın `responseJsonSchema`/AbortSignal taşıması yerel
SDK ve transport mock ile doğrulandı; gerçek model+SDK+hizmet birlikte kabulü
açık izinli canlı adıma kaldı. Structured output, kaynak doğrulamasının yerine geçmez.

[Resmi kota belgesi](https://ai.google.dev/gemini-api/docs/rate-limits): kota proje
kapsamında, TPM girdiye göre, günlük sıfırlama Pacific gece yarısıdır. Kodun
10/175000/400 ve 60/20000/700 değerleri iç güvenlik tavanıdır. Model profilleri
.env ile değişir; legacy harita/embedding ayarları bu tavanı ancak düşürür.
24 saatlik kalıcı kullanıcı+ders bütçesi sağlayıcı takvim günü değildir.

### Gerçekten çalıştırılan güvenli kontroller

| Dizin / komut | Sonuç |
| --- | --- |
| `backend`: `npm test` | **462 test, 462 başarılı, 0 başarısız, 0 atlanan** |
| `backend`: `node --import ./tests/helpers/guvenliTestOrtami.js --experimental-test-module-mocks --test --test-concurrency=1 tests/calismaKartlariV2Plus.test.js tests/semanticArama.test.js` | **18/18** |
| `frontend`: `npm test` | **108/108**, 0 başarısız |
| `frontend`: `npm run lint` | Başarılı; ESLint . |
| `frontend`: `npm run build` | Başarılı; 779 modül, JS 590,02 kB / gzip 158,56 kB; 500 kB uyarısı, hata değil |
| `frontend`: `node tests/calismaKartlari.browser.mjs` | Başarılı; 2 kontrollü POST, 1 özet GET, 1 değerlendirme; iptal yarışı 0 |
| Kök: `rg --files backend -g '*.js' -g '!node_modules' -g '!coverage'` ile seçilen her dosyada `node --check` | **113 dosya, 0 hata** |
| Kök: `git diff --check` | Temiz; CRLF dönüştürme bildirimleri whitespace hatası değil |
| `backend`: `node --import ./tests/helpers/guvenliTestOrtami.js scripts/kartV2MockKarsilastirma.js` | Aynı kaynakla karşılaştırma tamamlandı; JSON raporu kayıtlı |

Backend paketinde ayrı lint/build script'i yok; bunların yerine JS sözdizimi ve
tüm testler kontrol edildi. Başarısız ara testler (eski sonuç sözleşmesi, CDP
CSS/font yarışı, yeni testte eksik kapanış) düzeltilip yeniden çalıştırıldı.
Son geçerli sonuçta başarısız test yok. Gerçek HTTP/DB kabul testleri çalıştırılmadı.

Backend test ön yükleyicisi gerçek fetch ve TCP bağlantısını engeller;
RUN_LIVE_GEMINI_TESTS=false ve sentetik anahtar kullanılır. Gerçek SDK testleri
yalnız transport mock'tur. Tarayıcı yalnız yerel Vite'a çıkar; uygulama API'leri
CDP ile yanıtlanır, diğer istekler engellenir. Sunucu/production MongoDB başlatılmadı.

### Aynı sentetik kaynaklarla karşılaştırma

Ölçüm [V2_PLUS_MOCK_KARSILASTIRMA.json](V2_PLUS_MOCK_KARSILASTIRMA.json) içindedir.
Tek konulu V2 seçim protokolü ile V2+ aynı güncel ortak SDK katmanında karşılaştırıldı;
önceki canlı V2'nin ölçümü olarak sunulmaz. 9 öğrenme kavramı için:

| Senaryo / yöntem | Mock SDK | Tahmini girdi tokenı | Geçerli kart / kapsam | Ret | Mock süre |
| --- | ---: | ---: | --- | ---: | ---: |
| Sağlıklı / tek konu | 3 | 2343 | 9 / %100 | 0 | 14,77 ms |
| Sağlıklı / batch | 1 | 1225 | 9 / %100 | 0 | 3,80 ms |
| Bir hatalı kart / tek konu | 3 | 2308 | 8 / %88,89 | 1 | 6,22 ms |
| Bir hatalı kart / batch | 1 | 1225 | 8 / %88,89 | 1 | 2,52 ms |

Girdi tokenı karakter/3 tahmini; süre yerel mock süresidir. Sağlayıcı tokenı,
gecikmesi veya doğal dil kalitesi ölçülmedi. Hatalı kaynak kabul oranı artırılmadı;
ayrı konu/soruların ortak uzun cevap nedeniyle yanlış duplicate sayılması düzeltilip
regresyonla korundu. Aynı yanıt hatasında iki yöntemde de bir kart reddedildi.

### Kalan canlı adımlar ve riskler

- **Gerçek Gemini çağrısı: 0. Gerçek Embedding çağrısı: 0.** Model listeleme,
  countTokens veya sağlayıcı erişim testi yok. Resmi belge okumaları API testi değildir.
- **Gerçek MongoDB yazımı/silme/migration: 0.** Eski kart/öğrenci kayıtlarını
  silen veya taşıyan işlem yapılmadı. Commit, push, merge, rebase, reset/restore/clean yok.
- Canlı ilk adım hazır fakat çalıştırılmadı. İzin sonrası hedef ders için
  `node scripts/calismaKartiSaltOkunurTani.js --ders-id=<kimlik> --gemini`
  komutu mevcut ilk eksik konu/aktif snapshot ile en fazla **1 SDK çağrısı** yapar.
  Yeni route, retry/fallback, embedding ve DB yazımı kapalıdır. Geçerli kart,
  ret kodları, gerçek model ve SDK sayısı içerik ifşa etmeden raporlanır.
- İlk canlı kaynak doğrulaması başarılı olduktan sonra gerçek MongoDB checkpoint,
  öğrenci ilerlemesi ve tam ders kabulü ayrı açık izin gerektirir. Bu iznin kapsamı
  verilmeden kart üretim POST'u veya migration çalıştırılmamalıdır.
- Çoklu Node instance için süreç içi model limiti proje genelini tek başına
  garanti etmez. Çoklu dağıtım gerekiyorsa mevcut MongoDB üzerinden ortak atomik
  kota rezervasyonu ayrıca tasarlanıp izole ortamda doğrulanmalıdır.
- Kaynak seçimi 10 parça/12.000 karakter, kavram çıkarımı açık dil kalıplarıyla
  sınırlıdır. Tüm önemli kavramların bulunduğu veya canlı modelin doğru seçtiği
  iddia edilmez. Güvenli boşluk doldurma alternatifi korunur.
- Ağdaki abort, sağlayıcının işlemi veya olası ücretini geri aldığı anlamına gelmez.
  Başarısız çağrı tahmini bütçede kalır; gerçek kullanım metadata'sı varsa mutabakat yapılır.
- Build'in büyük JS parçası uyarısı mevcut bir dağıtım sınırlamasıdır; bu görevde
  ilgisiz bundle refactoring yapılmadı.

### Son Git dökümü

Branch `feature/calisma-kartlari-sistemi`, HEAD `f942552`.
28 izlenen dosya değişikliği ve 8 yeni dosya vardır; staged değişiklik yoktur.
Önceki çalışma korunmuştur. Aşağıdaki `git diff --stat` **untracked yeni dosyaları
saymaz**; bunlar ayrıca listelenmiştir.

```text
 backend/.env.example                               |  55 +++-
 backend/docs/CALISMA_KARTLARI.md                   | 323 ++++++++++---------
 backend/docs/CALISMA_KARTLARI_V1_GUVENILIRLIK.md   |   2 +
 backend/models/CalismaKartiDestesi.js              |  12 +-
 backend/package.json                               |   2 +-
 backend/scripts/calismaKartiSaltOkunurTani.js      |  59 ++--
 backend/services/calismaKartlariService.js         | 168 +++++++---
 backend/services/embeddingService.js               | 132 ++------
 backend/services/geminiService.js                  | 347 ++++++++-------------
 backend/services/semanticAramaService.js           |  33 +-
 backend/tests/calismaKartlari.test.js              |  99 +++++-
 backend/tests/embeddingService.test.js             |   2 +-
 backend/tests/geminiCalismaKartlari.test.js        |   2 +-
 backend/tests/geminiHazirlamaRetry.test.js         |   2 +-
 backend/tests/geminiOrtakGuvenilirlik.test.js      |   2 +-
 backend/tests/geminiSohbet.test.js                 |   5 +-
 backend/tests/konuHaritasiVeGemini.test.js         |   2 +-
 backend/tests/semanticArama.test.js                |  27 ++
 backend/tests/testTanilama.test.js                 |   3 +-
 backend/utils/calismaKartiDogrulama.js             |   3 +
 backend/utils/calismaKartiKanit.js                 |  28 +-
 backend/utils/geminiHazirlamaHatasi.js             |  30 +-
 backend/utils/geminiOrtakIstekYonetimi.js          | 145 +++++++--
 frontend/src/pages/DersCalismaKartlari.jsx         |  20 +-
 frontend/src/utils/calismaKartlariYardimcilari.mjs |  11 +
 frontend/src/utils/kullaniciHatasi.mjs             |   7 +
 frontend/tests/calismaKartlari.browser.mjs         |  58 +++-
 frontend/tests/calismaKartlari.test.mjs            |  14 +-
 28 files changed, 967 insertions(+), 626 deletions(-)
```

Yeni dosyalar:

```text
backend/docs/V2_PLUS_MOCK_KARSILASTIRMA.json
backend/docs/V2_PLUS_UYGULAMA_NOTLARI.md
backend/scripts/kartV2MockKarsilastirma.js
backend/tests/calismaKartlariV2Plus.test.js
backend/tests/geminiV2Altyapi.test.js
backend/tests/helpers/guvenliTestOrtami.js
backend/utils/calismaKartiPlanlama.js
backend/utils/geminiModelYonlendirme.js
```

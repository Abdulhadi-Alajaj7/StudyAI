# Çalışma Kartları V2+

13 Kasım 2026 — `feature/calisma-kartlari-sistemi`

Güncel uygulama, test kanıtları, değişen dosyalar ve canlı izin sınırı:
[V2+ uygulama kaydı](V2_PLUS_UYGULAMA_NOTLARI.md).
[V1 denetimi](CALISMA_KARTLARI_V1_GUVENILIRLIK.md) ve bu belgenin sonundaki
canlı denemeler tarihsel kayıtlardır; V2+ canlı kabulü olarak kullanılamaz.

## Kullanım

Dersin **Çalışma Kartları** sekmesindeki **Kartları Oluştur** üretimi başlatır.
Öğrenciden konu, kart sayısı, zorluk veya model seçmesi istenmez. Kayıtlı kartlar
sonraki ziyarette açılır. Sayfa açılışı ve GET hiçbir üretim başlatmaz.

Karta tıklamak veya Enter/Boşluk kullanmak cevabı açar; ilk açılış görüldü olarak
kaydedilir. Yıldız bağımsızdır. Tüm/görülmeyen/görülen/yıldızlı görünümleri ve
ana/alt konu filtreleri korunur. Görülmeyen kart açılınca kullanıcı ilerleyene
kadar ekranda kalır; yeni kart soru yüzüyle açılır. Mobil konu paneli korunur.

**Tekrar, Zor, Orta, Kolay** değerlendirmeleri değişmez geçmiş kayıtlarıdır.
Aynı istemci istek kimliğiyle tekrar gönderim ikinci kayıt oluşturmaz.
**Bugünkü Tekrarlar** pasiftir; SM-2, FSRS veya tekrar takvimi eklenmedi.

## Kaynak, kavram ve kart üretimi

1. Kullanıcıya ait onaylı dersin hazır ve kilitli mevcut konu haritası okunur.
   `konuId`, ana/alt konu bağlantıları ve kaynak snapshot'ı değişmez. Konu kaynağı
   belirtilmemişse yalnız haritanın snapshot'ıyla aktif sürümü eşleşen materyaller
   aday olur. Doğrulanmış bağlantı yoksa `KART_KAYNAK_BAGLANTISI_EKSIK` döner.
2. Keyword eşleşmesi mevcut `semanticAramaService` ve kayıtlı cosine vektörleriyle
   birleştirilir. Materyal, kullanıcı, ders, aktif işlem sürümü ve özgün parça metni
   doğrulanır. Yüksek anlamsal skor tek başına konu kanıtı sayılmaz. Materyaller
   arasında çeşitlilik korunur; en fazla 10 bütün parça / 12.000 karakter seçilir.
3. Belge embedding'leri yeniden üretilmez. Gerekirse yalnız sorgu embedding'i
   kullanılır. Kullanıcı+ders+model+boyut+aktif snapshot+sorgu anahtarlı cache,
   100 kayıt ve 10 dakika ile sınırlıdır. Başarısız sorgu cache edilmez. Semantic
   hata sonrası keyword fallback açıkça kaydedilir; yeterli kanıt yoksa üretim durur.
4. Kaynaktaki tanım, özellik/kural, formül, işleyiş, fark, neden-sonuç ve kullanım
   ifadeleri deterministik olarak ayrılır. Başlık/alıştırma/boilerplate elenir.
   Normalize kavram veya aynı alıntı tekrar planlanmaz. Hedef **1–4 değildir**;
   farklı kanıtlanabilir kavram sayısıdır. Teknik kaynak sınırları ve bu sezgisel
   çıkarım, tüm dersin pedagojik kapsamının eksiksiz olduğunu garanti etmez.
5. Aynı ana konuya bağlı işler küçük batch'lere ayrılır. Varsayılan üst sınırlar
   3 konu, 12 kart, 6 materyal, 6.000 tahmini girdi ve 2.400 çıktı tokenıdır.
   Sistem talimatı, JSON schema ve kanıtlar girdi tahminine dahildir. Bir kanıt bile
   sığmazsa güvenli sınır hatası döner. Batch sınırı toplam kavram hedefini kırpmaz.
6. Gemini yalnız `konuId`, `kanitReferansi`, `cevapIndex`, `tur` seçer. Tanımı veya
   formülü açık kaynaklarda sunucu kısa doğal Türkçe soru-cevap oluşturur; cevap
   kaynaktan aynen alınır. Diğerlerinde güvenli boşluk doldurma korunur. Serbest
   model sorusu, cevabı veya yeniden yazılmış alıntısı kabul edilmez.
7. Her kartın konusu, kanıtı, materyal/sürüm/parça bilgisi, cevap indeksi, karakter
   aralığı ve tekrarı bağımsız doğrulanır. Bir kartın reddi diğer geçerli kartları
   kaybettirmez. JSON/source hatası sağlayıcı kesintisi sayılmaz; otomatik model
   fallback veya aynı başarılı cevabı yeniden üretme gerekçesi olmaz.

Kavramın konu bağlantısı kaynak ifadesi, kavram kimliği/türü ve planın eşleşen
kelimeleriyle izlenebilir. Doğal kart biçimi kaynakta açıkça doğrulanabilen
kalıplarla sınırlıdır. Geçerli JSON veya sözcük örtüşmesi semantik doğruluk
kanıtı olarak sunulmaz. Desteklenemeyen serbest cevap yayımlanmaz.

## Kalıcılık, sıfır kart ve güvenli devam

`CalismaKartiDestesi` kullanıcı+ders başına tek kayıttır. Konu planı ve kartlar,
SHA-256 kaynak imzası ve işlem lease'iyle tutulur. Yeni alanlar opsiyoneldir;
eski kart kimlikleri, kaynakları, yıldızları, görülme ve değerlendirmeleri korunur.

Batch sonucu konu başına ayrı transaction/checkpoint ile kaydedilir. Sonraki
konunun yazımı başarısızsa önceki checkpoint kalır. Devam, tamamlanan konuları ve
kaynakta zaten kapsanan kavramları yeniden göndermez. Yeni kartlar eski kartlara
eklenir; silip yeniden oluşturma veya veri migration'ı uygulanmaz.

Sıfır kart durumları ayrıdır: `ogrenilebilir_kavram_yok` ve zaten başka kartta
kapsanan kavramlar başarıyla tamamlanabilir. `kaynak_yok`, `kanit_yetersiz`,
üretim veya doğrulama hatası eksik kalır. Semantic fallback ayrıca gösterilir.
Kavramsız hazır deste arayüzde açıklanır; tekrar üretim döngüsü başlatılmaz.

Üretim POST'u hızlı döner, Node.js içindeki worker çalışır; arayüz 2,5 saniyelik
GET polling ile gerçek ilerlemeyi okur. Kilit 30 saniyede yenilenir, 3 dakika
kesilirse iş eksik olarak kapanır. Yeni SDK denemesi öncesinde ve başarıdan sonra
sahiplik kontrol edilir. Kaynak imzası her checkpoint'te tekrar doğrulanır.

Kaynak sürümü değişince eski kartlar **GET ile salt okunur** gösterilir. Üretim,
yıldız, görülme ve değerlendirme yazımları 409 ile engellenir. Arayüzde eski
kartlar çevrilebilir; bu durumda görülme isteği gönderilmez. Kaynakları yeni
sürüme taşıyan otomatik bir işlem yoktur.

Transaction'lar dersin `kartSurumu` üzerinden mevcut silme kilidiyle sıralanır;
geç kalan yazım yetim kayıt oluşturamaz. Kalıcı harici iş kuyruğu eklenmedi.
Süreç kapanırsa kaydedilmiş işler korunur; kullanıcı eksiklerden devam eder.

## Gemini 503, model ve kota

Bütün üretim özellikleri ve embedding aynı SDK deneme yöneticisini kullanır.
İlk istek dahil en fazla 3 primary denemesi, ardından yalnız 503 için 1
fallback mümkündür; varsayılan toplam 4 SDK denemesidir. Daha düşük özellik veya
işlem bütçesi önceliklidir. Backoff+jitter, Retry-After/RetryInfo, SDK timeout,
toplam süre (varsayılan 120 saniye), iptal ve lease kontrolü uygulanır.

400/401/403/404 ve günlük kota kör retry/fallback başlatmaz. Geçersiz JSON veya
kaynak aynı retry döngüsüne girmez. Yerel yoğunluk/RPM/TPM/RPD sağlayıcı 429'undan
ayrı kodlarla raporlanır. Embedding model fallback'i yoktur; başarılı batch'ler,
metin/model/boyut hash cache'i ve mevcut `gemini-embedding-001` / 768 kayıtları korunur.
Ders hazırlamanın zorunlu embedding koşulu kaldırılmadı.

Routing varsayılan kapalıdır. Eski `GEMINI_*_MODELI` ayarları çalışmaya devam eder.
`*_PRIMARY_MODELI` ancak `GEMINI_DOGRULANMIS_MODELLER` içinde ise kullanılır.
Fallback ayrıca pozitif, açık RPM/TPM/RPD profili gerektirir. Sıfır kota modeli
kapatır. Yeni model erişimi bu geliştirmede canlı doğrulanmadı ve etkinleştirilmedi.

Aynı modelin sohbet/özet/test/kart/harita çağrıları ortak bütçeyi paylaşır.
Metin modeli varsayılanları 10 RPM / 175.000 TPM / 400 RPD; embedding varsayılanları
60 / 20.000 / 700'dür. Bunlar yapılandırılabilir iç güvenlik sınırlarıdır,
evrensel Google kotaları değildir. Anahtar sayısı bütçeyi çoğaltmaz.
TPM girdi tokenıdır; tahmin çağrıdan önce ayrılır, `usageMetadata` ile mutabakat
yapılır. Bilinmeyen başarısız çağrının tahmini tüketimi korunur. RPD Pacific gece
yarısında yenilenir. Limiter **süreç içidir**; çoklu instance veya restart sonrası
Google proje kotasını tam koruma garantisi vermez. Mevcut tek süreç için Redis eklenmedi.

Kart işlem bütçesi (`GEMINI_KART_ISLEM_CAGRI_BUTCESI`, varsayılan 4) sorgu
embedding'i, retry ve fallback'i kapsar; retrieval üretime en az bir deneme
bırakır. Kullanıcı+ders 24 saatlik kalıcı bütçesi (`GEMINI_KART_DERS_GUNLUK_CAGRI_BUTCESI`,
varsayılan 48) bundan ve Pacific RPD'den ayrıdır. İş başlangıcında hak ayrılır,
normal bitişte kullanılmayan hak iade edilir; çökmede belirsiz hak tüketilmiş sayılır.
Konuya yazılan SDK sayısı paylaşılan batch'e katılımı gösterir; konu sayaçları
toplanarak gerçek toplam çağrı hesaplanmamalıdır. Destenin `sonIslemSdkCagrisi`
ve ortak yöneticinin sayaçları gerçek SDK denemelerini sayar.

Tüm ayarlar [`.env.example`](../.env.example) içindedir. Gerçek `.env` değiştirilmedi.
Ham materyal, anahtar ve öğrenci içeriği loglanmaz; model, özellik, deneme, token
ölçümünün tahmini/gerçek oluşu, süre ve güvenli hata/ret kodları kaydedilir.

## API ve test

Tüm uçlar oturum gerektirir; kullanıcı, ders, deste ve kart ilişkisini doğrular.

| Metot / yol (`/dersler/:dersId/calisma-kartlari`) | İşlem |
| --- | --- |
| `GET /` | Kayıtlı kartlar, istatistikler, konu ve retrieval durumu; üretim yapmaz |
| `POST /olustur` | Boş gövde ile başlat/devam; aktif ikinci POST aynı işi döndürür |
| `PATCH /:kartId/durum` | `{goruldu:true}` ve/veya `{yildizli:boolean}` |
| `POST /:kartId/degerlendirmeler` | `{degerlendirme, istemciIstekId}`; cevap önceden açılmış olmalı |

Backend `npm test` bir ön yükleyiciyle gerçek fetch/TCP/MongoDB bağlantısını
engeller, sahte anahtar ve mock SDK kullanır. Frontend birim testleri, lint/build
ve kurulu başsız Chromium testi bulunur. Tarayıcıda API'ler sentetik yanıtlanır,
harici HTTPS engellenir, HMR/dosya izleme kapalıdır. Doğal/eski kart, gerçek
Enter/Space, filtreler, kısmi devam, salt okunur ve kavramsız hazır durumları test edilir.

Mock karşılaştırma: [ölçümler](V2_PLUS_MOCK_KARSILASTIRMA.json).
Komut: `node --import ./tests/helpers/guvenliTestOrtami.js scripts/kartV2MockKarsilastirma.js`.
Aynı 9 kavramda tek konulu 3 çağrı/2.343 tahmini girdi tokenına karşı batch
1 çağrı/1.225 tahmini token, aynı 9 geçerli kart üretir. Bunlar gerçek sağlayıcı
tokenı, kalite veya süre ölçümü değildir.

Canlı test için hazırlanan `scripts/calismaKartiSaltOkunurTani.js` ilk eksik
konunun ilk sınırlı V2+ batch'ini seçer. Varsayılan yalnız MongoDB okur;
`--gemini` ayrıca açık kullanıcı izni gerektirir: en fazla 1 SDK çağrısı,
retry/fallback yok, embedding yok, MongoDB yazımı yok. Bu oturumda çalıştırılmadı.
Gerçek model erişimi ve MongoDB kabul testi mock başarısından ayrı onaylanmalıdır.

## Tarihsel V1/V2 sonuçları — V2+ kabulü değildir

Önceki V2 doğrulaması 437/437 backend, 106/106 frontend testiydi. Aşağıdaki gerçek
ders incelemesi ve canlı denemeler önceki görevlerin kayıtlarıdır; V2+ sırasında
tekrarlanmadı. Güncel sonuçlar V2+ uygulama kaydındadır.

## 422 kaynak bağlantısı düzeltmesi

Salt okunur gerçek ders incelemesinde 5 hazır materyal ve aktif sürümlerde 137
metin parçası bulundu. Haritanın 7 ana ve 31 alt konusundaki kaynak listeleri
boştu; ders düzeyindeki 5 kaynak snapshot'ı ise aktif sürümlerle eşleşiyordu.
Kart servisi yalnızca konu/ana konu listelerini kullandığından ilk konuda boş
aday kümesi üretip planlama aşamasında 422 dönüyordu. Gemini'ye ulaşılmıyordu.

Düzeltme, yalnızca iki konu düzeyinde de bağlantı yokken haritanın doğrulanmış
ders kaynaklarını aday kabul eder. Açık alt/ana konu bağlantıları önceliğini korur;
harita dışındaki veya snapshot sürümü değişmiş materyaller eklenmez. Yerel metin
eşleştirmesi, 12.000 karakter bütçesi ve kart/cevap/alıntı doğrulaması değiştirilmedi.
Hiçbir konu kimliği, harita veya materyal kaydı güncellenmedi.

Aynı gerçek kayıtlarda üretim başlatmadan tekrar yapılan seçim 31/31 konuda
başarılı oldu; en büyük grup 8.437 karakterdi. Üç regresyon testi düzeltme öncesi
başarısız, sonrasında başarılıdır. Alt/ana kaynak önceliği, ObjectId/string eşleşmesi,
eski/yabancı sürümün dışlanması ve kısa kaynağın eşik yüzünden elenmemesi de test edildi.

## Gerçek kullanım denetimi — 12 Kasım 2026

Bu bölüm V1 commit'i öncesindeki denetimin tarihsel kaydıdır. Sonraki bağımsız
kart doğrulaması, kanıt protokolü ve bütçe değişiklikleri üstteki güncel rapordadır.

### 1. 422 hatasının doğrulanmış kök nedeni

Önceki bölümdeki kaynak snapshot düzeltmesi korunmuştur. Yeniden yapılan gerçek
MongoDB okumasında aynı 5 hazır materyal, 137 aktif parça, 7 ana/31 alt konu ve
boş konu kaynak listeleri doğrulandı. Harita kilitli/hazır, ders onaylı ve hazırlama
durumu `tamamlandi`; sahip hesabı mevcut. Güncel kaynak seçimi 31/31 konuyu geçiyor.

İncelenen olasılıklar:

| Olasılık | Gerçek kayıt/kod bulgusu |
| --- | --- |
| Yanlış materyal referansı | Konu listeleri boş; ders düzeyindeki 5 snapshot aktif materyal sürümleriyle eşleşiyor. Eski kodun bu snapshot'ları kullanmaması 422 nedeniydi. |
| Yanlış aktif parça okuması | Sorgu kullanıcı/ders/materyal/aktif işlem kimliğini birlikte kullanıyor; 137 aktif parça bulundu. |
| Başlık/açıklama eşleştirmesinin kaynak elemesi | Bu derste hiçbir konunun seçimi boş kalmıyor. Başlığın tamamının aynen geçmesi zorunlu değil; açıklama sözcükleri ve uzun önekler de kullanılıyor. |
| Türkçe/ek/eş anlamlı sorunu | Türkçe büyük/küçük harf ve mevcut ek eşleştirmesi regresyonlarla geçti. Genel akademik eş anlamlıları çözümleyen bir mekanizma olduğu iddia edilmiyor. |
| Karakter/minimum içerik eşiği | En büyük seçim 8.437 karakter; 12.000 bütçeyi aşmıyor. Asgari sözcük/karakter eşiği yok. |
| Harita/materyal sürüm tutarsızlığı | Mevcut destenin kaynak imzası yeniden hesaplanan imzayla aynı. |
| Ana/alt konu ilişkisi | Alt kaynak > ana kaynak > doğrulanmış ders snapshot'ı önceliği korunuyor. |

Kaynak seçimi değiştirilmedi veya gevşetilmedi. Mevcut semantik arama servisi sorgu
embedding'i için sağlayıcı çağırdığı için bu denetimde devreye alınmadı. Mevcut
özet yardımcısı `dengeliOzetParcalariniSec` kullanılmaya devam ediyor.

### 2. Kart doğrulama başarısızlığının doğrulanmış nedeni ve sınır

Gerçek deste `hata / KART_GECERSIZ_YANIT` durumunda; 31 planın her birinde hedef
4 kart, tamamlanan konu ve kaydedilmiş kart sayısı 0. Aktif üretim kilidi yok.
Bu kod yalnızca `kartYanitiniDogrula` tarafından üretilir. Akış ilk eksik konuda
durur; dolayısıyla ret **Gemini yanıtı JSON olarak ayrıştırıldıktan sonra, ilk
konunun kartları veritabanına yazılmadan önce** gerçekleşmiştir. Kaynak seçimi,
SDK HTTP hatası veya MAX_TOKENS/JSON ayrıştırma hatası değildir.

Geçmiş deste yalnızca `hataKodu` saklıyor; yanıt, ret alt kodu ve konu tanılaması
yok. Çalışma alanında gerçek sunucu yanıt kaydı da bulunmadı; bulunan loglar test
çıktılarıdır. Bu nedenle geçmişteki reddin **alıntı, cevap, tekrar, sayı, uzunluk
veya soru ilişkisi kurallarından hangisi olduğu kanıtlanamıyor**. Belirli bir
kuralı geçmiş hatanın kesin nedeni olarak sunmak doğru olmaz.

Doğrulanan yazılım eksikleri: bütün ret kuralları aynı genel kodu veriyor,
arka plan hataları loglanmıyor, prompt/şema açıklamaları doğrulayıcının 400/800/1600
karakter sınırlarını ve soru-alıntı sözcük ilişkisini belirtmiyordu. Bunlar düzeltildi.
Bu eksiklerin geçmiş model yanıtında hangi alanı etkilediği henüz doğrulanmadı.

Kaynakta alıntının bulunması, cevabın alıntıdan aynen alınması, konu/kaynak kimliği,
kesin kart sayısı, soru ilişkisi ve tekrar kurallarının kabul/ret koşulları korunur.
Anlamlı bir serbest cevap kaynak alıntısının aynen parçası değilse yine reddedilir;
salt sözcük örtüşmesi, anlamsal doğruluğun tam kanıtı olarak sunulmaz.

Gemini'nin resmi belgesine göre string `maxLength` sunucuda uygulanmaz. Bu yüzden
uzunluklar prompt ve şema `description` alanlarında açıklanır; zorunlu kontrol
uygulama doğrulayıcısında kalır.
[Google yapılandırılmış çıktı belgesi](https://aistudio.google.com/docs/structured-output#type-specific-properties).

### 3. Tekrarlanan 404 hatalarının nedeni

Route backend'de tanımlı ve `/dersler` altında bağlıdır. Bu ders için
`tum_ders / orta` özet kaydı yok. `kayitliDersOzetiniGetir`, bulunmayan başarılı
özete `404 / OZET_BULUNAMADI` döndürür; frontend zaten bu kodu boş durum sayar.

Tekrar nedeni `DersOzet.jsx` içindedir: kapsam `tum_ders` olsa da seçim nesnesinin
`useMemo` bağımlılıkları materyal/konu kimliklerini içeriyordu. Seçenekler yüklenip
varsayılan kimlikler atanırken aynı `{tur, uzunluk}` nesnesi yeniden üretiliyor,
GET effect'i tekrar çalışıyordu. Gecikmeli sentetik API ile gerçek React tarayıcı
testi düzeltmeden önce 2 istek, sonra 1 istek ölçtü. Geliştirme StrictMode ilk
effect'i ayrıca çalıştırıp iptal edebilir; bu, sonsuz polling değildir.

Gerçek `DersDetayLayout` ve kart sayfası birlikte mount edilerek kart üretimi,
polling, yenileme ve sekmeye dönüş boyunca özet isteği başlatılmadığı doğrulandı.
İki hata birbirinden bağımsızdır. 404 API sözleşmesi değiştirilmedi.

### 4. Bu denetimde değiştirilen dosyalar ve düzeltmeler

- `services/calismaKartlariService.js`: güvenli aşama/konu/alt kod logu, hata
  tanılamasının saklanması; hata yolunda ikinci DB okumasına gerek olmadan
  checkpoint durumunun korunması; kayıt hatasının ayrı sınıflandırılması.
- `utils/calismaKartiDogrulama.js`: mevcut ret koşullarına sabit alt kodlar.
- `utils/calismaKartiTanilama.js`: yalnızca izinli sabit kod ve sayılar; ham yanıt,
  materyal, hata metni ve hassas bilgi loga/kayda taşınmaz.
- `models/CalismaKartiDestesi.js`: isteğe bağlı `hataTanilama` alanı. Geçmiş
  desteler için migration, silme veya yeniden üretim gerekmez. API'ye açılmaz.
- `services/geminiService.js`: yalnızca kart fonksiyonunun prompt/şema açıklamaları
  ve tanılama aktarımı; test/özet/sohbet fonksiyonları değiştirilmedi.
- `scripts/calismaKartiSaltOkunurTani.js`: raw Mongo okuması, yerel kaynak seçimi;
  açık `--gemini` seçeneği olmadan SDK çağrısı yok. O seçenek açık kullanıcı
  onayından sonra en fazla 1 çağrı yapar (`maxDeneme: 1`); hiçbir mod DB'ye yazmaz.
- `frontend/src/pages/DersOzet.jsx`: yalnızca etkin kapsamdaki seçim bağımlılıkları.
- `frontend/src/utils/kullaniciHatasi.mjs`: güvenli kayıt hatası mesajı.
- `backend/tests/calismaKartlari.test.js`, `backend/tests/geminiCalismaKartlari.test.js`,
  `frontend/tests/calismaKartlari.test.mjs`, `frontend/tests/calismaKartlari.browser.mjs`:
  aşağıdaki regresyonlar. Bu belge de güncellendi.

Önceden tamamlanan çalışma kartı dosyaları ve başarılı davranışlar korunmuştur.

### 5. Eklenen regresyon testleri

Backend'e 9 yeni test eklendi: açıklama/ek/Türkçe kaynak seçimi ve ilgisiz kaynak
reddi; ilk konu doğrulama hatasının güvenli tanılanması ve GET'te üretim olmaması;
checkpoint hatası; hata durumu da yazılamadığında logun korunması; tanılama alan
izin listesi; ret alt kodları ve gereksiz SDK tekrarı olmaması; prompt/şema sınır
açıklamaları; kesik/boş/MAX_TOKENS çıktısı; kaynak normalizasyonu ve desteksiz
serbest cevabın reddi. Planlama kaynak hatası logu ve frontend hata mesajı
kontrolleri mevcut testlere eklendi.

Önceki testler kısmi başarı/yalnızca eksik konuların tamamlanması, eşzamanlı
oluşturma, yıldız/görüldü/değerlendirme, kaynak sürümü, yetki ve silme kilidi
senaryolarını korur. Gerçek layout kullanılan tarayıcı testi; özet 404 boş durumu,
istek sayısı, kartlardan özet çağrısı çıkmaması ve sekmeye dönüşü de kapsar.

### 6. Test sonuçları

| Kontrol | Sonuç |
| --- | --- |
| Backend `npm test` (canlı Gemini kapalı) | 426/426 başarılı |
| Frontend `npm test` | 106/106 başarılı |
| Frontend `npm run lint` | Başarılı |
| Frontend `npm run build` | Başarılı |
| Chromium kart/özet, masaüstü/mobil | Başarılı; 1 kart üretim POST'u, 1 özet kontrolü |
| Değişen backend dosyalarında `node --check` | Başarılı |
| `git diff --check` | Başarılı |

Backend paketinde lint/build script'i bulunmuyor. Yeni bağımlılık eklenmedi.

### 7. Gerçek MongoDB ile doğrulanan noktalar

Ders sahibi hesabı, ders onayı/hazırlık, harita kilidi, kaynak listelerinin boş
olması, aktif materyal sürümleri, 137 parça, 31/31 pozitif seçim, 8.437 azami
karakter, mevcut destenin güncel kaynak imzası, başarısız durum ve sıfır kart,
aktif kilidin yokluğu, özet kaydının yokluğu doğrulandı. Bütün erişimler raw
`findOne/find/countDocuments` okumasıdır; otomatik index/create kapalıdır.
Uygulamanın yazabilen GET/POST servisleri gerçek DB üzerinde çalıştırılmadı.
İlk sandbox denemesi DNS `ETIMEOUT` verdi; izinli ağ erişiminde okumalar başarılı oldu.

### 8. Gerçek Gemini ile henüz doğrulanmayan noktalar

Mock kontroller tamamlandıktan sonra kullanıcı yalnızca **1 gerçek Gemini
çağrısına** açık onay verdi. İlk eksik konuda `maxDeneme: 1` ile yapılan çağrı
**HTTP 503 / GEMINI_GECICI_HATA** ile sonuçlandı. Güvenli tanılama:

```json
{"kod":"GEMINI_GECICI_HATA","asama":"GEMINI_ISTEGI","konuId":"sub-91a6543f","gercekDenemeSayisi":1,"orijinalHttpDurumu":503,"sdkCagrisi":1,"veritabaninaYazildi":false}
```

Bu çağrıda kart içeren yanıt alınmadı; JSON/kart doğrulamasına ulaşılamadı.
İkinci çağrı veya embedding çağrısı yapılmadı. Yeni 503 sonucu geçmiş
`KART_GECERSIZ_YANIT` hatasının nedeni olarak sunulmaz; bunlar ayrı aşamalardır.
Geçmiş model çıktısının tam ret sebebi, güncel promptun aynı gerçek konuda
sağlayıcı başarısı ve bütün dersin gerçek üretim/kayıt akışı henüz doğrulanmadı.
Mock sonuçları bunların yerine geçirilmez; sistem kesin sorunsuz ilan edilmez.

### 9. Kalan riskler

Geçmiş yanıt geri alınamadı; onaylı canlı çağrı da sağlayıcının 503 hatasıyla
sonuçlandığından ret alt kuralı henüz kesinleşmedi. Sözcüksel kaynak sıralaması
genel anlamsal arama değildir.
Sağlayıcı kaynakta aynen olmayan cevap/alıntı veya tekrarlı kart döndürürse ret
devam eder. İlk başarısız konuda süreç durur, otomatik sınırsız tekrar yapılmaz.
DB erişimi kesilirse durum yazılamayabilir; güvenli log ve mevcut süreli kilit
mekanizması devrede kalır. Çoklu gerçek Mongo instance/yük testi yapılmadı.

### 10. Son doğrulama adımları ve gereken onay

İlk eksik konuda `--gemini` ile izin verilen **1 gerçek SDK çağrısı** kullanıldı.
İstek 10 seçili parça/7.916 kaynak karakteri, 4 kart hedefi, yapılandırılmış
4.200 çıktı token sınırı ve `maxDeneme: 1` ile hazırlandı; sağlayıcı 503 döndürdü.
Gerçek token tüketimi bu yanıtla doğrulanamadı; yapılandırılmış üst sınır tüketim
ölçümü değildir. Bütün 31 konu başlatılmadı, hiçbir sonuç DB'ye yazılmadı.
Onaylı tek çağrı sınırına uyuldu. Ek gerçek çağrı için yeniden açık onay gerekir.

Bu kontrol tamamlanıp varsa kanıtlanan ek hata düzeltildikten sonra uygulama
sunucuları güncel kodla yeniden başlatılmalı. Mevcut destede `Eksik Konuları
Tamamla` gerçek üretim ve DB yazımı yapacağından ayrıca açık onay olmadan
tetiklenmemeli. Kullanıcı kontrollü üretim sonrası kart görüntüleme, yenileme,
yıldız/görüldü/değerlendirmeyi doğrulamalıdır. Deste, materyal ve harita silinmez.
Bu çalışma sırasında commit/push/merge/reset yapılmadı.

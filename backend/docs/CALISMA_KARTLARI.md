# Çalışma Kartları

12 Kasım 2026 — `feature/calisma-kartlari-sistemi`

## Kullanım

Dersin **Çalışma Kartları** sekmesindeki **Kartları Oluştur** düğmesi üretimi başlatır.
Konu, sayı veya zorluk seçimi yoktur. Hazır kartlar sonraki ziyarette doğrudan açılır.
Karta tıklamak veya klavyede Enter/Boşluk kullanmak soru/cevap yüzünü değiştirir.
İlk cevap açılışı görüldü olarak kaydedilir. Yıldız bundan bağımsızdır.

Tüm/görülmeyen/görülen/yıldızlı görünümleri ve ana/alt konu filtreleri vardır.
Görülmeyen görünümünde açılan kart, kullanıcı ilerleyene kadar ekrandan kaybolmaz.
Yeni karta geçince soru yüzü gösterilir. Mobilde konu listesi açılıp kapanabilir.
Değerlendirmeler **Tekrar, Zor, Orta, Kolay** olarak saklanır; tekrar değerlendirme
eski kaydı değiştirmez. Ağ hatası sonrası aynı değerlendirme isteğini yeniden
kaydetmek ikinci geçmiş kaydı oluşturmaz.

**Bugünkü Tekrarlar** açıkça pasiftir. Tekrar sayısı/tarihi hesaplanmaz; SM-2,
FSRS, bildirim veya otomatik zamanlama uygulanmadı.

## Kaynak ve üretim

- Dersin kullanıcıya ait, temizleme dışında ve materyalleri onaylanmış olması gerekir.
- Hazır ve değişikliklere kilitli mevcut konu haritası kullanılır. Konu kimlikleri
  değişmez. Alt konusu olmayan ana konu kendi kart grubunu oluşturur.
- Yalnızca konunun materyal referansları ve materyallerin aktif işlem sürümlerindeki
  parçalar okunur. Yeni embedding/konu haritası/özet/test üretimi başlatılmaz.
- Tam ders haritasında alt/ana konu kaynak listeleri boşsa haritanın kayıtlı
  `kaynakMateryaller` snapshot'larından yalnızca mevcut aktif sürümle eşleşenler
  aday kapsamı oluşturur. Harita dışında kalan veya eski sürümlü materyaller bu
  kapsama eklenmez. Yerel konu eşleştirmesi ve kart/alıntı doğrulaması aynen uygulanır;
  konu haritası ve materyal kayıtları değiştirilmez. Doğrulanmış bağlantı da yoksa
  içerik yetersizliği yerine `KART_KAYNAK_BAGLANTISI_EKSIK` döner.
- Başlık/açıklama ile yerel eşleşen kaynaklar seçilir; dengeli kaynak seçimi mevcut
  özet yardımcısını kullanır. Konu başına kaynak bütçesi 12.000 karakterdir.
- Seçilen içeriğin sözcük kapsamına göre konu başına 1–4 kart planlanır. Destede
  en fazla 120 konu bulunur. Daha büyük harita sessizce kırpılmak yerine açıklamayla reddedilir.
- Bir Gemini çağrısı bir konunun küçük kart grubunu üretir. Ortak hata ayrıştırma,
  exponential backoff/jitter, timeout iptali ve süreç içi eşzamanlı istek sınırı kullanılır.
- Beklenen kart sayısı, konu kimliği, izinli kaynak, alıntının kaynakta bulunması,
  kısa cevabın alıntıdan alınması ve soru/alıntı ilişkisi doğrulanır. Aynı ve çok
  benzer sorular parti içinde ve tüm kayıtlı kartlara karşı denetlenir.
- Önceki kartlardan en fazla son 80'i prompt'a eklenir; doğrulama tüm önceki
  kartlara karşı yapılır. Boş/geçersiz/eksik/kesilmiş JSON başarı sayılmaz.

Bu deterministik kontroller desteksiz cevabı önemli ölçüde sınırlar; modelin her
soru-cevap eşleştirmesinin anlamsal doğruluğuna ilişkin mutlak bir garanti değildir.
Konuya uygun yeterli kaynak veya farklı doğrulanabilir kart üretilemezse hata döner;
doğrulama gevşetilip uydurma kart kaydedilmez.

## Kalıcılık ve devam

`CalismaKartiDestesi` ders başına tek kayıt tutar; konu grupları ve kart içerikleri
gömülüdür. Kaynak sürümleri ve konu haritasından üretilen SHA-256 imza saklanır.
Her başarılı konu, işlem token'ı koşuluyla atomik checkpoint olarak kaydedilir.
Başarısız grubun bozuk/eksik kartları yayımlanmaz. Önceki başarılı gruplar korunur.
**Eksik Konuları Tamamla** yalnızca tamamlanmamış grupları üretir; mevcut kart
kimlikleri ve bu kartlara ait çalışma/değerlendirme verileri korunur.

Üretim POST'u işlem durumunu hızlıca döndürür; iş Node.js sürecinde devam eder.
GET hiçbir zaman Gemini üretimi başlatmaz. Arayüz aktif işte 2,5 saniyede bir
gerçek konu ilerlemesini okur; sahte yüzde yoktur. Okumalar ve yazmalar ders
değişiminde iptal edilir; eski okuma çalışma durumu yazımını ezmez.

Veritabanı kilidi 30 saniyede bir yenilenir; 3 dakika yenilenmeyen iş kesilmiş
sayılır. Sunucu yeniden başlatılırsa mevcut gruplar kalır ve kullanıcı devam
düğmesiyle eksikleri başlatabilir. Hazır desteyi tekrar istemek yeni üretim yapmaz.
Kalıcı harici iş kuyruğu eklenmedi; çalışan sunucunun kapanması aktif SDK çağrısını
tamamlayamayabilir. İptal edilmiş bir sağlayıcı isteğinin ücretinin iptal edildiği
garanti edilemez.

Kaynak/harita sürümü değişirse eski kartlar otomatik silinmez veya sıfırlanmaz;
güncel olmayan deste için güvenli 409 döner. Onay sonrası değişmezlik mevcut
sistemce korunur. Eski kartları başka sürüme taşıyan bir veri göçü eklenmedi.

## Veriler ve yetkilendirme

| Model | İçerik / benzersizlik |
| --- | --- |
| `CalismaKartiDestesi` | Kullanıcı+ders tekilliği, konu planı, kartlar, kaynaklar, üretim durumu ve lease |
| `KartCalismaDurumu` | Kullanıcı+deste+kart tekilliği; ilk görülme, yıldız; gelecekteki algoritma için boş tekrar alanları |
| `KartDegerlendirmesi` | Her değerlendirme için ayrı, değişmez kayıt; sunucu zamanı ve kullanıcı+istemci istek kimliği tekilliği |

Tüm uçlar mevcut oturum middleware'inden geçer. Okuma/yazma işlemleri kullanıcı,
ders ve ilgili kartın destede bulunmasıyla sınırlandırılır. İstemciden gönderilen
kullanıcı kimliği, sahte değerlendirme zamanı veya tekrar tarihi kabul edilmez.

Checkpoint ve çalışma durumu yazımları, mevcut sohbet akışına benzer MongoDB
transaction'ları kullanır. Dersin `kartSurumu` alanına yapılan kısa yazım bunları
ders silme kilidiyle sıralar. Silme başlamışsa geç gelen işlem yetim kayıt oluşturmaz.
Mevcut ders silme/temizlik akışları üç yeni koleksiyonu da kapsar; bu geliştirme
sırasında gerçek kullanıcı verisi silinmedi veya sıfırlanmadı.

## API

Tüm yollar `/dersler/:dersId/calisma-kartlari` altında ve oturum gerektirir.

| Metot / yol | İşlem |
| --- | --- |
| `GET /` | Kayıtlı kartlar, gerçek istatistikler, konular ve üretim durumu |
| `POST /olustur` | Boş gövdeyle başlat/devam et; aktifte 202, hazırda 200 |
| `PATCH /:kartId/durum` | `{goruldu:true}` ve/veya `{yildizli:boolean}` |
| `POST /:kartId/degerlendirmeler` | `{degerlendirme, istemciIstekId}`; cevap önce açılmış olmalı |

Aktif üretimde ikinci POST aynı işlemi döndürür. Ders başına veritabanı kilidi
birden fazla backend sürecini de kapsar; ortak Gemini ani yük sınırı önceki
altyapıdaki gibi süreç içidir ve dağıtık Google proje kotası garantisi değildir.
Ham SDK hatası/log gövdesi kullanıcıya aktarılmaz.

## Yapılandırma ve doğrulama

`GEMINI_KART_MODELI` boşsa mevcut varsayılan Gemini modeli kullanılır.
`GEMINI_KART_MAKS_DENEME` varsayılan 3; izin verilen aralık 1–5 toplam SDK denemesidir.
Yeni bağımlılık yoktur. Yeni modellerin bileşik benzersiz indekslerinin oluşturulması
ve mevcut sohbetin de gerektirdiği MongoDB transaction desteği dağıtımda doğrulanmalıdır.

Backend ve frontend testleri gerçek Gemini çağrısı olmadan çalıştırılır.
`frontend/tests/calismaKartlari.browser.mjs` kurulu Chromium ve mevcut Vite ile
gerçek React etkileşimlerini kontrol eder; tüm API yanıtları sentetiktir ve
harici sayfa istekleri engellenir. Tarayıcı yolu gerekirse `STUDYAI_TEST_BROWSER`
ile belirtilir. Test üretim, çevirme, yeni kartın soru yüzü, yıldız, değerlendirme,
yenilemede tekrar üretmeme ve mobil taşma/konu panelini kapsar.

Gerçek sağlayıcı kalitesi, gerçek MongoDB üzerinde çoklu instance/yük ve dağıtım
indeksleri bu mock testlerin yerine geçmez. Otomatik testler gerçek sağlayıcıya
çağrı yapmaz. Ayrı, kullanıcı onaylı tek canlı tanılama sonucu aşağıdadır.

Son doğrulama: backend **426/426**, frontend **106/106** test başarılı. Frontend lint
ve build, backend JavaScript sözdizimi ve `git diff --check` başarılı. Masaüstü
koyu tema ve 390 px mobil açık tema Chromium senaryosu başarılıdır.
Backend paketinde ayrı lint/build script'i yoktur. Son build başarılıdır; JS parçası
587,15 kB'dir. Önceki build'in 500 kB uyarısı bu çalıştırmada çıkmamıştır.

## Değişen dosyalar

- Backend: `models/CalismaKartiDestesi.js`, `models/KartCalismaDurumu.js`,
  `models/KartDegerlendirmesi.js`, `services/calismaKartlariService.js`,
  `utils/calismaKartiDogrulama.js`, `controllers/calismaKartlariController.js`,
  `routes/calismaKartlariRoutes.js`.
- Backend bağlantıları: `models/Ders.js`, `services/geminiService.js`, `server.js`,
  `controllers/dersController.js`, `services/geciciDersTemizlemeService.js`, `.env.example`.
- Frontend: `pages/DersCalismaKartlari.jsx`, `pages/DersCalismaKartlari.css`,
  `services/calismaKartlariApi.mjs`, `utils/calismaKartlariYardimcilari.mjs`,
  `utils/kullaniciHatasi.mjs`.
- Testler: backend `calismaKartlari.test.js`, `geminiCalismaKartlari.test.js`;
  frontend `calismaKartlari.test.mjs`, `calismaKartlari.browser.mjs`.
  Eski `dersHazirlama.test.js`, `dersSil.test.js`, `geciciDersTemizleme.test.js`
  düzenekleri yeni koleksiyonları da mock edecek şekilde genişletildi.
- Bu kullanım ve uygulama belgesi: `backend/docs/CALISMA_KARTLARI.md`.

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

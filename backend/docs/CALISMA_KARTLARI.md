# Çalışma Kartları — Konu Bazlı Otomatik + Akıllı Batch

13 Kasım 2026 — `feature/calisma-kartlari-sistemi`

Güncel uygulama ve test kaydı: [Otomatik üretim raporu](KART_OTOMATIK_URETIM.md).
[Önceki V2+ kaydı](V2_PLUS_UYGULAMA_NOTLARI.md) ve aşağıdaki canlı denetimler tarihseldir;
bu protokolün canlı kabulü veya bu oturumda canlı işlem yapıldığı anlamına gelmez.

## Kullanım

Öğrenci **Kartları Oluştur** düğmesine bir kez basar. Kayıtlı ve onaylı Konu Haritası
okunur; mevcut `konuId`, aktif materyal sürümleri ve metin parçaları kullanılır.
Harita veya belge embedding'leri yeniden oluşturulmaz. Kart sayısı/model seçimi istenmez.
Hazır kartlarla diğer konular üretilirken çalışılabilir; tarayıcının açık kalması gerekmez.
GET yeni iş başlatmaz. Sunucu önceden başlatılan kalıcı işi otomatik sürdürür.

Karta tıklamak veya Enter/Boşluk cevabı açar, ilk açılış görüldü olarak kaydedilir.
Yıldız bağımsızdır. Tüm/görülmeyen/görülen/yıldızlı görünümleri, konu filtreleri,
mobil panel ve **Tekrar, Zor, Orta, Kolay** değerlendirmeleri korunur. Aynı istemci
istek kimliği ikinci değerlendirme oluşturmaz. SM-2/FSRS veya hâkimiyet hesabı eklenmedi;
konu ve kart kimlikleri gelecekteki sistemlerin kullanabileceği biçimde korunur.

## Kaynak seçimi ve doğal protokol

1. Ders, kullanıcı, onaylı harita ve aktif sürümler doğrulanır. Konu kaynak bağlantısı
   yoksa yalnız haritanın kaynak snapshot'ı ile aktif sürümü eşleşen materyaller kullanılır.
2. Mevcut semantic search ile lexical sıralama birleştirilir. Tam kimlik/sürüm/metin
   eşleşmesi olan güçlü semantik sonuç (skor >= 0,65), kelime örtüşmesi olmasa da
   adaydır. En fazla 10 bütün parça / 12.000 karakter seçilir; kaynak metni kesilmez.
   Bu teknik seçim bütün pedagojik kapsamın eksiksiz olduğu garantisi değildir.
3. Sorgu embedding'i ortak çağrı/kota sınırındadır. Belge vektörlerine dokunulmaz.
   Kesinti/kotada lexical fallback kullanılabilir. Semantik arama yapılamadığı ve lexical
   kaynak bulunamadığı için konu kalıcı olarak kaynak yok sayılmaz: bütçede sonraki tur,
   geçici hatada kayıtlı bekleme kullanılır. Seçilen parça kimlikleri checkpoint'e alınır.
4. Aynı ana konuya bağlı konular girdi tokenı, konu ve materyal sınırlarına göre batch'e
   ayrılır. Gemini'ye `konuId`, başlık, açıklama, ana başlık, tam kaynak metinleri ve
   önceki kavramlar gönderilir. Backend önceden kavram veya cevapIndex listesi çıkarmaz.
5. Gemini önemli farklı kavramları, sayıyı ve doğal Türkçe soruları belirler. Yanıt:
   `{konular:[{konuId,tamamlandi,bosNedeni,kartlar:[{konuId,metinParcasiId,kavram,soru,cevap,kanit}]}]}`.
   Tek yanıtın kart üst sınırı çıktı tokenına bağlıdır (varsayılan 2.400 tokenla 4);
   bu konu başına toplam sınır değildir. Kalan kavram varsa `tamamlandi:false` ile devam eder.
6. Backend her kart için konu/parça bağını, kullanıcı/dersi, materyali ve aktif sürümü
   tekrar doğrular. Kanıt özgün metindeki TAM cümle/satırla birebir aynı olmalıdır.
   Cevap bu alıntının tamamı veya açık tanımın TAM cevap aralığıdır. Serbest açıklama,
   kesilmiş koşul/olumsuzluk ve yalnız doğru parça kimliği kabul edilmez. Kaynak aralıkları saklanır.
7. Soru uzunluğu, tek soru işareti, kavram odağı, sayısal/teknik iddialar, şema ve
   tekrarlar kontrol edilir. Geçerli kartlar tek kartın reddinden etkilenmez. Modelin
   soru kalitesi ve kavram kapsamının tamamı deterministik kontrollerle kanıtlanmış
   sayılmaz; gerçek ders örnekleriyle ayrıca pedagojik değerlendirme gerekir.

Eski V2 kart şeması ve eski tanı/test çağıranları için cevapIndex doğrulayıcısı korunur.
Normal üretim worker'ı yalnız yeni kaynak protokolünü kullanır. Kaynakta açık bilgi
bulunmayan serbest açıklamalar yayınlanmaz.

## Kalıcı iş, checkpoint ve sınırlar

`CalismaKartiDestesi` kullanıcı+ders başına unique kayıttır. Opsiyonel `uretimIsi`,
aynı belgedeki kalıcı işi temsil eder: `kuyrukta`, `calisiyor`, `bekliyor`, `tamamlandi`,
`durduruldu`. Eski tamamlanmış desteler aynen okunur; eski kısmi deste kullanıcı
başlattığında yeni işe geçer. Otomatik tarama eski kayıtlara kendiliğinden iş eklemez.

Her konu sonucu ayrı MongoDB transaction/checkpoint ile eklenir. Kartlar silinmez,
kimlikleri yenilenmez; öğrenci ilerlemesi ve değerlendirme koleksiyonlarına üretim
worker'ı yazmaz. Tam incelenen parçalar metin/sürüm/kimlik hash'iyle işaretlenir;
kalan kaynaklar ve kaydedilmiş kavramlar sonraki tura aktarılır.

Sunucu başlangıcında ve 15 saniyede bir yalnız zamanı gelmiş aktif işler taranır.
Ders transaction'ı ve 30 saniyelik heartbeat/3 dakikalık lease aynı işin eşzamanlı
çalışmasını engeller. Sunucu kesilirse kalıcı checkpoint devralınır. Yeni SDK denemesi
ve kayıt öncesi lease kontrol edilir; geç kalan eski worker yeni sonucu ezemez.
Kaynak imzası her konu checkpoint'inde ve başarılı sonlandırmada transaction içinde
kontrol edilir. Ders silme kilidi aynı ders belgesi üzerinden sıralanır.

- Tur SDK sınırı: `GEMINI_KART_ISLEM_CAGRI_BUTCESI` (varsayılan 4, en fazla 12).
  Tur bitince iş kuyruğa döner; yeniden tıklama gerekmez. Tek çağrılık tur gerekirse
  yalnız semantik seçimi kaydeder, sonraki tur üretimi yapar.
- Dersin 24 saatlik sınırı: `GEMINI_KART_DERS_GUNLUK_CAGRI_BUTCESI` (48, en fazla 200).
  Zamanı gelene kadar kalıcı bekleme; sonra otomatik devam.
- İşin ömrü boyunca sınır: `GEMINI_KART_TOPLAM_CAGRI_BUTCESI` (varsayılan günlük ders
  sınırı, en fazla 200). Başlangıçta işe kaydedilir. Gün/restart/POST bunu sıfırlamaz;
  env değişikliği mevcut işin iznini otomatik yükseltmez. Aşılırsa otomatik çağrı durur,
  arayüz sebebi gösterir ve yeniden üretim butonunu kapatır.
- Sorgu embedding'i, retry ve fallback gerçek SDK sınırlarına dahildir. Önceden ayrılan
  kullanılmamış tur hakkı normal bitişte iade edilir. Çökmede belirsiz kullanım harcanmış
  sayılır; `gercekSdkCagrisi` yalnız sonucu kaydedilebilen turları kesin sayabilir.
- RPM/TPM/429 beklemesi Retry-After veya güvenli bekleme süresiyle; RPD Pasifik gece
  yarısına göre kaydedilir (yaz/kış saati dahil). Tek istek TPM'ye hiç sığmıyorsa kalıcı
  boyut hatasıdır. 503/ağ/DB kayıt hatası en fazla 3 otomatik devamla sınırlıdır.
- Üç başarısız konu doğrulaması veya üç ilerlemesiz üretim turu otomatik tekrarları
  durdurur. Kalıcı model/yetki hatası durur. Sonradan manuel yeniden deneme toplam
  kullanım hakkını yenilemez. Toplam sınır onayı için yeni yönetim ekranı eklenmedi.

Hazır kartlar bekleme süresince sunulur. Sıfır kart, kaynağın gerçekten kavramsız
olması veya önceki kartlarda kapsanmasıyla açıklanır. Kaynak/kanıt/doğrulama hatası
başarı sayılmaz. Kaynak sürümü değişirse eski kartlar salt okunur sunulur; yeni
üretim ve öğrenci verisi yazımı engellenir. Otomatik migration yoktur.

## Ortak Gemini altyapısı

Önceden çalışan routing, 503 retry/fallback, model bazlı ortak RPM/TPM/RPD ve
embedding checkpoint/cache korunmuştur. Yeni model etkinleştirilmedi, gerçek `.env`
değiştirilmedi. Routing varsayılan kapalı; primary/fallback yalnız doğrulanmış model
listesi ve pozitif kota profiliyle çalışır. 400/401/403/404 kör retry/fallback başlatmaz.
JSON/kanıt reddi sağlayıcı 503'ü gibi değerlendirilmez.

Model başına ortak kota defteri süreç içidir; çoklu sunucu veya restart boyunca
Google proje kotasını kalıcı olarak garanti etmez. Ders ve iş tüketim sınırları
MongoDB'de kalıcıdır. Bu görevde Redis veya başka kuyruk altyapısı eklenmedi.

## Güvenli doğrulama ve canlı sınır

Backend `npm test` preload'u gerçek fetch ve TCP/Mongo bağlantısını engeller,
sahte anahtar ve enjekte edilmiş model/DB kullanır. Frontend tarayıcı testinde
bütün uygulama API'leri intercept edilir, dış HTTPS engellenir. Test/Özet/Sohbet/
Konu Haritası regresyonları aynı tam test paketinde çalışır.

Bu görevde gerçek Gemini/embedding çağrısı, gerçek Mongo yazımı/silme/migration
ve uygulama backend'ini başlatma yapılmaz. Salt okunur tanı komutunun CLI akışı da
çalıştırılmadı; yalnız saf hazırlık fonksiyonu sentetik verilerle test edilir.
Gerçek API, Mongo transaction/lease davranışı ve derslerde soru kalitesi canlı
izin sonrasında doğrulanmalıdır. Backend'in açılması önceden başlatılmış işleri
sürdürebileceğinden canlı deneme izni olmadan burada başlatılmamalıdır.

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

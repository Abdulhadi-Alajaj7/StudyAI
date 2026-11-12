# Çalışma Kartları V1 güvenilirlik denetimi

12 Kasım 2026. Bu rapor kod/mock/tarayıcı doğrulamasını gerçek üretimden ayırır.
Bu geliştirme turunda onaylı tek gerçek Gemini çağrısı yapıldı; gerçek veritabanı yazımı yoktur. Canlı sonuç ve sonrasındaki çevrimdışı düzeltme aşağıda ayrılmıştır.

## 1. Branch, HEAD ve GitHub ilişkisi

- Aktif yerel branch: `feature/calisma-kartlari-sistemi`.
- HEAD: `03f7db93607b3f8906dcdd8994834863ff1fecd6` — Çalışma Kartları sistemi V1.
- Çalışma ağacı inceleme başlangıcında temizdi. Önceki düzeltmeler bu commit'te bulunuyor.
- GitHub branches API okumasında kart branch'i aynı SHA'dadır. Ayrı
  `feature/gemini-konu-haritasi` branch'i `df9baea49141b8cccd2e9e7e38bb596fb7bfc71a`
  commit'indedir. Yerel ortak ata `4d090564a5ffb4a8d7274d1a4c14951d4c46330f`;
  iki uçta karşılıklı 1/28 farklı commit bulunuyor.
- Branch değiştirme, cherry-pick, commit, push, merge, rebase veya reset yapılmadı.

[İncelenen GitHub V1 commit'i](https://github.com/Abdulhadi-Alajaj7/StudyAI/commit/03f7db93607b3f8906dcdd8994834863ff1fecd6).

## 2. Kanıtlanmış nedenler

| Bulgu | Kanıt ve kapsam |
| --- | --- |
| Önceki 422 | Boş alt/ana konu kaynak listeleri yerine haritanın geçerli ders snapshot'ları kullanılmıyordu. Önceden yapılan düzeltme aynen korundu; gerçek seçim 31/31 geçiyor. |
| Bir ret bütün grubu kaybettiriyor | V1 `kartYanitiniDogrula` ilk hatada `throw` eder. Yeni dört kartlık regresyonda tek sahte kanıtın yanında üç geçerli kart korunuyor. |
| İlk konu diğerlerini durduruyor | V1 döngüsü tek dış `catch` kullanır. Yeni doğrulama-hatası regresyonunda ikinci konu kaydedilir; 503 regresyonunda ise güvenlik için sonraki konu çağrılmaz. |
| Ortak soru kalıbında yanlış tekrar | V1 commit'indeki saf yardımcı doğrudan çalıştırıldı: “Yığın veri yapısı elemanlarını hangi çalışma ilkesine göre işler?”/LIFO ve aynı kalıptaki Kuyruk/FIFO çifti için `true`; düzeltmede `false`. Bunlar farklı kavramlardır. Geçmiş canlı yanıtın bu örnek olduğu iddia edilmiyor. |
| Yeni protokolün izinli canlı denemesi | Bir SDK çağrısı geçerli JSON içinde 4 seçim döndürdü; dört kart da `CEVAP_KANITTA_YOK` ile reddedildi, 0 geçerli kart. Bu kez servis hatası yoktu. |
| Geçmiş 503 | Önceki izinli tek çağrı sağlayıcıdan HTTP 503 aldı; kart/JSON doğrulamasına ulaşmadı. Kaynak veya model kalitesi hakkında sonuç vermez. |

## 3. Henüz kanıtlanamayan olasılıklar

Gerçek eski destede yalnızca `KART_GECERSIZ_YANIT` var; ham yanıt veya ret alt
kodu yok. Geçmiş reddin alıntı, cevap, tekrar, sayı veya uzunluk kurallarından
hangisinde olduğu geri çıkarılamıyor. Yeni mimari bu kayıp nedenlerini azaltır;
geçmiş olayın tam nedenini sonradan kanıtlamış sayılmaz.

Konu başına ayrı çağrı tek başına kanıtlanmış hata değildir. Kaynak seçimi ve
aktif sürümler bu derste çalışıyor; 503 nedeniyle modeli veya kaynakları değiştirmek
için kanıt yoktur. Genel Türkçe yeniden ifadelerin anlamsal eşdeğerliğini deterministik
olarak doğruladığımız iddia edilmiyor.

## 4. Düzeltmeler ve tercih edilen güvenilir üretim biçimi

Yeni kartlarda model serbest soru, cevap ve uzun alıntı yazmaz. Sunucu seçilmiş
aktif kaynakları Türkçe cümlelere ayırır, her kısa cümleye kanıt kimliği ve özgün
parçadaki karakter aralığını verir. Model yalnızca `konuId`, `kanitReferansi`,
`cevapIndex` seçer. Her kanıtın `cevaplar` dizisi sunucuda çıkarılan en çok 12 anlamlı sözcük/sayı aralığıdır. Sunucu aynı kaynak cümlesinde boşluk açar ve cevabı o
boşluktan çıkarır. Örnek: `Boşluğu tamamlayın: Yığın […] ilkesini kullanır.` / `LIFO`.
Kaynak alıntısı ve cevap aralıkları kalıcı kart kaynağına eklenir.

Bu tercih, serbest yeniden ifadeyi birkaç ortak kelimeye dayanarak “doğru”
saymayı ve model cevabını sessizce başka bir cevaba dönüştürmeyi önler. Yeni
protokole serbest `cevap` alanı eklenirse kart reddedilir. Doğru yeniden ifade
edilmiş bir cümle bile otomatik anlamsal hakem olmadan kabul edilmiyor; modelden
böyle bir cevap istenmiyor. Kullanıcıya gösterilen cevap özgün Türkçe kaynaktır.
Bu, soru yazımında bilinçli bir boşluk doldurma tercihidir; serbest anlatımlı
kartların anlamsal doğrulaması bu çalışmaya eklenmedi.

Kaynak cümlesi 10–320 karakter ve en az iki anlamlı terim, gizlenecek cevap
1–120 karakterlik anlamlı bir sözcük/sayı aralığıdır; her cümlede en çok 12 seçenek vardır. Cümlenin tamamını veya kelimenin
yarısını gizlemek kabul edilmez. Kaynak metin yeniden yazılmadığı için Türkçe harfler ve teknik kısaltmalar
korunur; aralıklar her zaman özgün metinden alınır. Olumsuzluk/koşul yeniden
yazılmaz. Kanıtın mevcut kaynakta aynı aralıkta bulunması doğrulanır. Cümle
düzeyindeki sözcüksel konu filtresi yalnızca yönlendirmedir; anlamsal doğruluk
kararı değildir. Kaynak–soru–cevap desteği aynı cümle/boşluk ilişkisiyle kurulur.

Kartlar bağımsız doğrulanır. Geçerli kartlar ve sabit kodlu ret listesi birlikte
döner; eksik sayı grubun geçerli kartlarını silmez. Bir konu grubunun checkpoint'i
yine tek transaction'dır. Eksik hedef tamamlanmadan konu `tamamlandi` olmaz.
Sonraki işlem yalnızca hedef eksi kayıtlı kart sayısını ister; eski kart kimlikleri,
yıldız, görülme ve değerlendirmeler korunur. Aynı soru veya aynı kanıt reddedilir.
Yaklaşık soru eşleşmesi aynı cevabı da gerektirir; ortak soru kalıbı farklı
kavramları tek başına birleştirmez.

Doğrulama/kısa kanıt hatası konuya kaydedilip bütçe içinde diğer konulara geçilir.
503, kota, ağ, timeout, JSON/token veya kayıt hatasında işlem durur. Az denenmiş
konular öne alınır; sürekli başarısız ilk konu hiç denenmeyenleri aç bırakmaz.

Çağrı sınırları retry dahil ve açık yapılandırılmıştır:

| Ayar | Varsayılan / sınır |
| --- | --- |
| `GEMINI_KART_MAKS_DENEME` | Konu SDK isteği başına 3 toplam deneme, mevcut 1–5 aralığı korunur |
| `GEMINI_KART_ISLEM_CAGRI_BUTCESI` | İşlem başına 4 gerçek SDK çağrısı; 1–12 |
| `GEMINI_KART_DERS_GUNLUK_CAGRI_BUTCESI` | Kullanıcı+ders için 24 saatte 48; 1–200 |

İş başlangıcında ders hakkı aynı lease transaction'ında ayrılır; normal bitişte
kullanılmayan hak iade edilir. Çöken süreçte bilinmeyen ayrılmış hak tüketilmiş
sayılır; yeniden başlatma sınırı aşamaz. İşlem bitince yeni POST kendiliğinden
gönderilmez. 31 konunun tamamı tek düşük bütçeli işlemde bitmeyebilir; kalanlar
aynı mevcut devam düğmesiyle ilerler. Bu limit Google projesinin toplam kotası
değildir. Salt okunur tanılama DB bütçesine yazmaz; kendi tek çağrılık koruması vardır.

Konu bazında deneme sayısı, toplam/son SDK sayısı ve ret listesi; deste bazında
son işlem SDK sayısı saklanır. 503 son izinli denemede oluşursa kaynak veya bütçe
hatasıyla örtülmez. Ortak limiter/retry/backoff/HTTP iptal kodu değiştirilmedi.

## 5. Değiştirilen dosyalar

- `backend/utils/calismaKartiKanit.js` — yeni saf kanıt aralığı ve bağımsız parti doğrulaması.
- `backend/utils/calismaKartiDogrulama.js` — ortak soru kalıbındaki yanlış tekrar düzeltmesi; V1 doğrulayıcısı/regresyonları korunur.
- `backend/utils/calismaKartiTanilama.js` — yeni kanıt ret alt kodları.
- `backend/services/geminiService.js` — yalnızca kart üretimi importu/fonksiyonu: kanıt seçme JSON'u, kısmi sonuç, mevcut ortak çağrı bütçesi.
- `backend/services/calismaKartlariService.js` — kartları ekleyen atomik checkpoint, konu hataları, adil devam sırası ve kalıcı bütçe.
- `backend/models/CalismaKartiDestesi.js` — isteğe bağlı aralıklar, konu ret/deneme bilgileri ve bütçe alanları. Eski desteler silinmez/migrate edilmez.
- `backend/scripts/calismaKartiSaltOkunurTani.js` — yeni parti sonucunu ve kanıt sayısını raporlama; eksik kart sayısı; yazım yok.
- `backend/.env.example` — iki bütçe ayarı; gerçek `.env` değiştirilmedi.
- `backend/tests/calismaKartlari.test.js`, `backend/tests/geminiCalismaKartlari.test.js` — üretim protokolüne uyarlanmış ve genişletilmiş regresyonlar.
- `frontend/src/utils/kullaniciHatasi.mjs` — üç sabit Türkçe bütçe/kanıt mesajı.
- `frontend/tests/calismaKartlari.test.mjs`, `frontend/tests/calismaKartlari.browser.mjs` — güvenli mesajlar, kısmi sonuç/yenileme/devam/çalışma geçmişi.
- `backend/docs/CALISMA_KARTLARI.md` ve bu rapor — güncel davranış ve sınırlar.

Frontend sayfa tasarımı, controller/route/endpoint, konu haritası, test, özet,
sohbet ve genel Gemini yönetimi değiştirilmedi. Yeni paket, SM-2/FSRS eklenmedi.

## 6. Test sonuçları

| Kontrol | Sonuç |
| --- | --- |
| Backend `npm test`, canlı Gemini kapalı | 437/437 |
| Frontend `npm test` | 106/106 |
| Frontend lint / build | Başarılı / başarılı |
| Chromium masaüstü/mobil ve özet | Başarılı |
| Backend değişen JS dosyaları `node --check` | Başarılı |
| `git diff --check` | Başarılı |

Testler şu senaryoları kapsar: 4 karttan 3'ünün korunması, ilgisiz/sahte kanıt,
doğru yeniden ifade ve uydurma serbest cevabın otomatik onaylanmaması, tekrar,
yalnızca eksik kartın tamamlanması, 503 sonrası durma, eşzamanlı POST, kesilen
iş/lease, checkpoint rollback, eski kart ve değerlendirmelerin korunması, yabancı
kullanıcı, aktif kaynak sürümü, 422 fallback, Türkçe/teknik harfler, noktasız satır
ve ondalık değerler, başlık yerine açıklamadan kaynak/kanıt bulma, işlem/ders bütçesi
ve 24 saatlik pencerenin yenilenmesi. V1 konu/alıntı/cevap/uzunluk ret örnekleri
saf eski doğrulayıcıyla da korunmuştur. Yeni regresyon, negatif/kesirli/metin/tanımsız indeksleri, eski metin alanını ve tahrif edilmiş sunucu aralığını reddeder; bütün seçenekler için özgün kaynak eşitliğini kontrol eder. Eski JSON sözleşmesi yeni sağlayıcı yanıtı
olarak kabul edilmez; kalıcı eski kartların okunması devam eder.

Tarayıcıda ilk oluşturma için bir POST, kullanıcı eksikleri tamamlamak istediğinde
bir ek POST görüldü; yenileme kendiliğinden üretmedi. Kısmi görünümde tek kayıtlı
karttan iki karta geçerken eski kimlik, yıldız ve görülme/değerlendirme korundu.
Özet kontrolü bir GET'te kaldı. Bütün API yanıtları sentetikti; gerçek backend
üretimi tetiklenmedi. Build yalnızca mevcut 500 kB parça uyarısını verir
(JS 587,59 kB). Backend paketinde ayrı lint/build script'i yoktur.

## 7. Gemini çağrı sayıları

Bu geliştirme turu: **1 gerçek Gemini**, **0 embedding** çağrısı.
Kullanıcının yeni tek çağrılık onayıyla ilk eksik konuda 4 seçim alındı. Hepsi
`CEVAP_KANITTA_YOK` ile reddedildi: **0 geçerli kart**, DB yazımı yok, ikinci çağrı yok.
Önceki turda izin verilen ayrı tek çağrı: **1**, HTTP 503, DB yazımı yok.
Bu iki olay aynı hata olarak kabul edilmez. İki ayrı tek çağrılık izin de kullanıldı.

Güvenli canlı sonuç (ham yanıt/metin saklanmadı):

```json
{"sonuc":"dogrulanamadi","kartSayisi":0,"reddedilenler":[{"kartIndex":0,"dogrulamaAltKodu":"CEVAP_KANITTA_YOK"},{"kartIndex":1,"dogrulamaAltKodu":"CEVAP_KANITTA_YOK"},{"kartIndex":2,"dogrulamaAltKodu":"CEVAP_KANITTA_YOK"},{"kartIndex":3,"dogrulamaAltKodu":"CEVAP_KANITTA_YOK"}],"sdkCagrisi":1,"veritabaninaYazildi":false}
```

Bu alt kod, modelin seçtiği metinden kabul edilebilir cevap aralığı kurulamadığını
kanıtlar. Eski sürüm aynı kodu bulunmayan metin, kelime sınırı veya cümlenin tamamı
seçildiğinde verdiğinden bunlardan hangisinin yaşandığı ve metnin yeniden ifade
edilip edilmediği ayrıca kanıtlanamaz. Geçmiş V1 reddinin aynısı olduğu iddia edilmez.

Bu gözlemden sonra, kontrolleri gevşetmeden metin kopyalama adımı kaldırıldı.
Model artık `gizlenecekMetin` yazamaz; kaynakta önceden belirlenen `cevaplar`
arasından yalnızca sayısal indeks seçer. Cevap ve aralığı sunucuda aynen alınır.
Böylece yeni model metnini kaynakta arama gereği kalmaz. Geçersiz indeks veya
bozulmuş aralık `CEVAP_ARALIGI_GECERSIZ` ile reddedilir. Eski serbest metin alanı
`KART_ALANLARI` ile reddedilir. Bu son protokol düzeltmesi yalnızca mock/saf testlerle
doğrulandı; yeni bir gerçek Gemini çağrısı yapılmadı.

Mock SDK çağrıları gerçek sağlayıcı tüketimi değildir. Üretim servisinin işlem ve
ders sınırları gerçek SDK denemelerini sayar; retry'lar da bu sayıya dahildir.

## 8. Kullanılan ve korunmuş gerçek veriler

Belirtilen ders raw Mongo koleksiyonlarından, autoIndex/autoCreate kapalı ve yalnızca
`findOne/find` ile okundu. Hazırlık tamamlanmış; 5 hazır materyal, 137 aktif parça,
31 konu var. Kaynak 31/31, kısa uygun kanıt 31/31 bulundu; ilk eksik konuda 82
aday kanıt ve son indeks protokolünde toplam 443 cevap aralığı var. En büyük seçili kaynak 8.437 karakter. Mevcut destenin kaynak imzası
güncel; durum hâlâ eski `hata / KART_GECERSIZ_YANIT`, kart sayısı 0.

Hiçbir gerçek kart/deste, kullanıcı çalışma kaydı, konu haritası, kaynak veya aktif
materyal sürümü değiştirilmedi. Bu yüzden mevcut arayüzde eski hata yeni üretim
yapılana kadar görünmeye devam edebilir. Yeni alanlar gerçek DB'ye yazılmadı.

## 9. Kalan riskler

- Geçmiş V1 doğrulama alt nedeni bilinmiyor. İlk yeni canlı protokol 4/4 aralık reddi verdi; son indeks protokolünün canlı başarısı henüz doğrulanmadı.
- Boşluk doldurma kaynak desteğini somutlaştırır; pedagojik kaliteyi veya genel anlamsal konu eşleştirmesini mutlak garanti etmez.
- Uzun/kısa veya biçimi zor PDF cümleleri uygun kanıt sayısını azaltabilir; bu derste 31/31 pozitif olması bütün dersler için garanti değildir.
- Kanıt sayısı hedef kart sayısını garanti etmez; model aynı bilgiyi seçerse ret/kısmi sonuç oluşabilir.
- Sınırlı otomatik çağrılar servis hatasında durur. Kullanıcının devam etmesi ve gerekirse 24 saatlik pencereyi beklemesi gerekebilir.
- Süreç çökmesinde bilinmeyen ayrılmış çağrılar muhafazakâr biçimde sayılır; kullanılmamış hak geçici olarak bloke olabilir.
- Mock transaction/eşzamanlılık testleri gerçek çoklu instance Mongo yük testinin yerine geçmez. Kayıt/read uçtan uca canlı kabulü yapılmadı.

## 10. Gereken son kontrollü test

Önce yeni protokolle ilk eksik konuda, DB'ye yazmayan **en fazla 1 gerçek Gemini
çağrısı** öneriliyor. `maxDeneme: 1` ve SDK katmanında tek çağrı koruması vardır.
İstek 82 aday kanıt ve bunların 443 hazır cevap aralığı arasından en çok 4 kart seçtirecek; yapılandırılmış çıktı sınırı
4.200 tokendır. Kota etkisi bir üretim isteği ile girdi/çıktı tokenlarıdır; gerçek
token tüketimi çağrıdan önce ölçülmüş gibi sunulmaz. Başka konuya geçilmeyecek.
Önceki onaylı çağrı kullanıldığı için son indeks protokolüyle yeni çağrı ayrı açık onay gerektirir. Bu turda ikinci çağrı yapılmadı. 503 veya doğrulama reddi canlı kabulde başarısız sayılır.

En az bir geçerli kartın gerçek sağlayıcıyla üretildiği doğrulandıktan sonra,
mevcut deste üzerinde gerçek uygulama üretimi/yazımı için ayrıca açık onay gerekir.
Güncel sunucuyla kontrollü üretim, kayıt, sayfa yenileme, görüntüleme, yıldız,
görüldü ve değerlendirme bu ikinci adımda doğrulanmalıdır. Tam ders yerine düşük
işlem bütçesiyle başlanmalı; mevcut deste sıfırlanmamalıdır. Bu iki canlı kabul
adımı bitmeden sistem gerçek kullanımda kesin başarılı ilan edilmez.

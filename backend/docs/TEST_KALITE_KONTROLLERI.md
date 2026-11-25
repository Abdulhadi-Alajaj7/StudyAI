# StudyAI Test Üretimi: Kesin Sayı ve Alt Konu Dağılımı

## Güncel akış

1. Ders/kullanıcı sahipliği, seçilen kapsam ve aktif materyal sürümleri kontrol edilir. Konu haritasının MongoDB'deki `parcaKonuAtamalari` kayıtları korunur; üretim sırasında embedding veya yeniden sınıflandırma yapılmaz. Eski haritalarda ilgili materyallerin aktif parçaları kullanılır.
2. Ana konu seçilirse doğrudan alt konular, alt konu seçilirse yalnızca o konu kullanılır. Tüm ders kapsamı haritanın yaprak konularını kapsar. Soru sayısı 1–20 arasında tam sayıdır; konu sayısından küçük istek açıklayıcı 422 hatasıyla reddedilir.
3. Kaynaklar fiziksel parça başına tekilleştirilir; ortak parçaların konu etiketleri birleştirilir. Her gerekli konunun kaynağı korunur. Kaynaksız konu veya kaynak paketine sığmayan zorunlu içerik varsa API çağrısı yapılmaz.
4. Tek Gemini isteğinde tam sayı, konu ve zorluk kotaları, kaynak metinleri ve JSON yanıt biçimi prompt içinde gönderilir. Dinamik, iç içe geçmiş API şeması yerine `responseMimeType: application/json` kullanılır; sayı, kimlik ve kalite koşulları yerel doğrulayıcıda zorunlu kalır. Her soruda somut `ogrenmeHedefi`, A/B/C/D seçenekleri, tek cevap anahtarı, açıklama, konu kimliği, kaynak referansları ve kısa kanıt alıntıları istenir.
5. Yerel doğrulama yapıyı, dört farklı seçeneği, cevap/açıklama tutarlılığını, izinli konuları, kaynak-konu bağlarını, alıntıların kaynakta bulunmasını, tekrarları ve dağılımı kontrol eder. Geçerli adaylar konu ve zorluk kotalarına birlikte uydurulur. Aynı bilgi/cevap/öğrenme hedefini yeniden ölçen yakın ifadeler de kontrol edilir.
6. Eksik varsa yalnızca kalan sayı ve kotalar için **en fazla bir tamamlama isteği** yapılır. Kabul edilen soruların metni, cevabı ve hedefi tekrar edilmemesi için gönderilir. Kaynak yetersizliği açıkça bildirildiyse ek çağrı yapılmaz.
7. Üretici ve kayıt servisi aynı doğrulayıcıyla son koşulları denetler. `soruSayisi === istenenSoruSayisi === sorular.length` ve konu kotaları sağlanmadan kayıt yoktur. Kaynak sürümü değişmişse 409 döner. MongoDB şeması da yeni kısmi testleri reddeder.

## Dağılım kuralları

| Konu | Soru | Geçerli dağılım |
| --- | --- | --- |
| 5 | 10 | 2, 2, 2, 2, 2 |
| 5 | 20 | 4, 4, 4, 4, 4 |
| 4 | 12 | 3, 3, 3, 3 |
| 5 | 7 | Her konu en az 1; örneğin 2, 2, 1, 1, 1 veya 3, 1, 1, 1, 1 |
| 5 | 4 | Uyarı/422; üretim ve kayıt yok |

Tam bölünmede eşitlik kesin koşuldur. Bölünemeyen sayıda kalanların yerini backend karakter sayısına göre belirlemez; Gemini kaynak içeriğine ve farklı öğrenme hedeflerine göre seçer. Karışık zorluk için mevcut dengeli kolay/orta/zor kotaları korunur.

## Sınırlar ve hata davranışı

- Normal üretim 1; yalnızca tamamlama gerektiğinde toplam en fazla 2 SDK çağrısı. Her çağrı tek denemedir; 429/503, bozuk JSON veya kesilmiş çıktı yeni bir üretim zinciri başlatmaz.
- Toplam Gemini zaman bütçesi 120 saniye, tek çağrı en fazla 90 saniyedir. Çıktı token bütçesi istenen sayıyla artar. Gerçek süre/tokenlar mevcut üretim izleyicisinden takip edilir; canlı performans iddiası değildir.
- Kaynak hazırlama üst sınırı `TEST_MAKS_KAYNAK_KARAKTERI` (varsayılan 160.000); tek istek paketi `TEST_TEK_ISTEK_KAYNAK_KARAKTER_BUTCESI` (varsayılan 90.000; 30.000–110.000).
- Hedef karşılanmazsa `TEST_HEDEFI_KARSILANAMADI` ve anlaşılır Türkçe hata döner. Hiçbir eksik test başarı olarak sunulmaz.
- Eski kısmi testlerin okuma/çözme desteği ve eski alanları korunur. Yeni kanıt/öğrenme hedefi alanları doğru cevabı sızdırmamak için istemci sunumundan çıkarılır.
- Yerel kontroller akademik doğruluğu, tüm anlamsal tekrarları veya birbirine yakın seçeneklerin tek doğruluğunu kesin ispatlamaz. Bunlar kaynakla sınırlandırılmış üretim talimatı ve hafif yerel kontrollerle azaltılan model riskleridir; ikinci bir Gemini denetçisi veya embedding kullanılmaz.

## Temizlik ve otomatik testler

Eski beş soruluk parti üretimi, parti küçültme, tek tek onarım zinciri, kısmi başarı modu, ikinci Gemini kalite denetçisi, testlere özel embedding denetçisi ve karakter sayısına göre kota yardımcıları kaldırıldı. `GEMINI_TEST_MAKS_DENEME` kullanılmaz. Diğer özelliklerin ortak Gemini, embedding ve semantik arama servisleri korunur.

`testTekIstekGemini`, `testUretimGuvenilirligi`, `testAltKonuDagilimi`, `testSistemi`, `testGeminiBasitAkis`, `testTanilama` ve `testUretimIzleme` testleri güncel sözleşmeyi sınar. Gerçek üretici, sahte SDK yanıtları ve MongoDB şema doğrulaması birlikte çalıştırılır. SDK HTTP gövdesi için 7 konu, 15 soru ve 42 kaynaklı taklit ağ senaryosu da vardır; JSON MIME tipi korunur, API'ye `responseJsonSchema` veya `responseSchema` gönderilmez. Bu testler canlı Gemini/MongoDB testi yerine geçmez.

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

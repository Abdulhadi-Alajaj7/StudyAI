# Test Sorusu Kalite Kontrolleri

## Hedef

Her soru, seçilen ana konunun bir alt konusuna (veya doğrudan seçilen yaprak konuya) bağlanmalı ve öğrencinin ilgili konudaki öğrenmesini gerçekten ölçmelidir. Sorunun yalnızca geçerli bir `konuId` taşıması tek başına akademik doğruluk garantisi değildir.

## Üretim akışı

1. Konuya özgü gömleme tabanlı anlamsal arama ile metin parçaları belirlenir. Kelime/kök benzerliği ile kaynak seçimine geri dönülmez.
2. Ana konu seçilirse her alt konuya en az bir soru ayrılır. Eşit bölünebilen sayıda eşit; aksi durumda içerik kapasitesine göre dengeli kotalar kullanılır. Soru sayısı alt konu sayısından azsa istek reddedilir.
3. Gemini, doğrulanmış kaynaklardan tam dört seçenekli ve tek doğru cevaplı sorular üretir; kaynak alıntıları ve konu kimliği zorunludur.
4. Mevcut kaynak ve yapı doğrulamasından sonra bağımsız embedding kontrolü soruyu dersin bütün yaprak konularıyla karşılaştırır; belirgin başka konu üstünlüğünü veya düşük hedef benzerliğini reddeder.
5. Aynı embedding kontrolü yeni soruyu hem o partinin önceki sorularıyla hem önceki partilerle karşılaştırır; güçlü semantik tekrarları reddeder.
6. Ayrı Gemini kalite denetçisi soruların dört seçeneğini kaynak alıntılarına göre bağımsız yorumlar. Özellikle birden fazla doğru cevap, yanlış cevap anahtarı, aynı öğrenme hedefi tekrarı ve konu dışı sorular için yüksek güvenli tespitleri reddeder.
7. Reddedilen sorunun kendisi sınırlı sayıda yeniden üretilir. İlgili konu kotası ve kaynak kanıtı korunur; tüm testi baştan üretmek zorunlu değildir. Güvenilir soru üretilemiyorsa eksik/kusurlu test kaydedilmez.
8. Sorular veritabanına öğrenciye ait test kaydında saklanır. Eski kayıtlar ve önceki test yanıtları değiştirilmez.

## Kontrollerin sınırları

- Embedding skorları **doğruluk yüzdesi değildir**; konu yakınlığına ilişkin sinyaldir.
- Bağımsız Gemini denetiminin sonucu da kesin akademik doğruluk garantisi değildir. Düşük güvenli işaretler otomatik reddedilmez.
- Ek kalite denetim API'si geçici sağlayıcı hatası nedeniyle erişilemezse testin temel konu, kaynak, cevap kanıtı ve benzerlik kontrolleri çalışmaya devam eder. İnceleme JSON'unda `kaliteDogrulama.durum = DENETIM_ATLANDI` olarak görülebilir; bu durum başarılı kalite denetimi anlamına gelmez.
- Ek denetim yeni bir API çağrısı gerektirir ve bazı testlerde süreyi artırabilir.
- %85 gibi bir gerçek eğitimsel doğruluk oranı yalnızca etiketli ve bağımsız incelenmiş soru örnekleri üzerinde ölçülerek iddia edilebilir. Otomatik birim testleri bunu kanıtlamaz.

## Geçici JSON incelemesi

`JSON` düğmesi seçilen soru sayısı, soru metni, seçenekler, `konuId`, `konuBasligi`, kaynak dosyaları, kaynak parça indeksleri ve embedding skorlarını görüntüler. `konuDogrulama` hedef ve rakip konuları; `kaliteDogrulama` ise ilave kalite denetimi durumunu gösterir. Cevap anahtarı ve öğrenciye açıklanmayacak çözüm metni JSON'a eklenmez.

## Ortam ayarları

- `TEST_KONU_SEMANTIK_MIN_SKOR`: aranan kaynak parçası için varsayılan 0.50.
- `TEST_SORU_KONU_MIN_SKOR`: sorunun hedef konu yakınlığı için varsayılan 0.43.
- `TEST_SORU_KONU_RAKIP_FARKI`: belirgin rakip üstünlüğü için varsayılan 0.06.
- `TEST_SORU_TEKRAR_ESIK`: aynı alt konu için yüksek benzerlik eşiği varsayılan 0.89.
- `TEST_AYNI_CEVAP_TEKRAR_ESIK`: aynı cevapla aynı kavramın yeniden ölçülme eşiği varsayılan 0.80.
- `GEMINI_TEST_DENETIM_MODELI`: istenirse bağımsız kalite denetimi için ayrı model; ayarlanmazsa test modelini kullanır.

Eşikler gerçek öğrenci materyallerinde yanlış pozitif ve kaçan tekrar oranları ölçülerek değiştirilmelidir. Başarılı CI, gerçek Gemini servisinde bütün soruların doğru olacağını garanti etmez.

# StudyAI Test Üretimi: Gemini Öğretmen, Tek İstek ve Güvenilir Kısmi Sonuç

## Güncel üretim akışı

1. **Yeni konu haritaları:** PDF'lerin aktif metin parçalarını Gemini, harita tamamlanırken ilgili ana/alt konu ID'lerine bağlar. Aynı chunk birden çok konuyla ilişkili olabilir. Atamalar `KonuHaritasi.parcaKonuAtamalari` içinde materyal, işlem sürümü ve parça indeksiyle tutulur. Eski haritalar için semantik kaynak araması korunur.
2. Kullanıcı ana konu seçerse her alt konu için **en az bir** soru hedeflenir; istek sayısı alt konu sayısından küçükse işlem reddedilir. Alt konu testleri 5/10, ana konu testleri 10/15/20 soru destekler.
3. Backend önceden etiketlenmiş kaynaklardan fiziksel olarak tekilleştirilmiş, konu başına kaynak içeren bir paket hazırlar. Tek istekte gönderilen kaynak hacmi `TEST_TEK_ISTEK_KAYNAK_KARAKTER_BUTCESI` ile sınırlandırılır (varsayılan 70.000, izinli 30.000–110.000 karakter).
4. **Tek Gemini API isteği:** Hedef sayı, konu/zorluk kotaları, kaynak anahtarları ve tekrar etmeme kuralları ile mümkün olan sorular istenir. Kaynak yetersizse tekrar veya tahmin yerine daha az soru döndürmesine izin verilir. Eski 5 soruluk parti akışı, tekil onarımlar ve ek Gemini kalite kontrolü bu varsayılan yolda çalışmaz.
5. **Yerel kontrol (yeni API çağrısı yok):** Her soru sırayla JSON yapısı, A/B/C/D seçenekleri, tek cevap anahtarı, konu/kota kimliği, kaynak referansları, kaynaktaki birebir kanıt alıntısı, cevap-kaynak örtüşmesi ve benzer/tekrar soru açısından kontrol edilir. Geçersiz sorular atılır, geçerli sorular saklanır.
6. Tüm alt konulardan en az bir geçerli soru yoksa ana konu testi **kaydedilmez** (kapsam kuralı korunur). Yeterli kapsam varsa eksik sayıyla test kaydedilebilir ve kullanıcıya Türkçe uyarı gösterilir.
7. Mevcut kullanıcı testleri ve cevapları değiştirilmez; `main` için otomatik birleştirme yapılmaz.

## Kısmi test ve görünür uyarı

- `soruSayisi`: kaydedilen gerçek soru sayısı.
- `istenenSoruSayisi`: kullanıcının istediği soru sayısı.
- `eksikSoruNedeni`: `KAYNAK_KAPASITESI` (kaynak hazırlama kısalttı) veya `KALITE_KONTROLU` (Gemini eksik üretti veya yerel kontrol soru reddetti).
- Kullanıcı örneğin 10 soru istediğinde 7 geçerli ve kapsayıcı soru kalırsa 7 soru kaydedilir ve eksik 3 soru açıkça gösterilir.
- Kaynak bulunamadığında, tüm alt konular kapsanamadığında, geçerli hiç soru olmadığında veya Gemini 429/503/timeout hatası verdiğinde kısmi başarı uydurulmaz.

## API hızı, kota ve denetlenebilirlik

- Varsayılan test üretimi için **en fazla bir Gemini çağrı denemesi** yapılır; 429'a tekrar istek atılmaz. Kota yenilenme süresi sağlayıcının sınırına bağlıdır.
- Terminalde `[TestTekIstek] Gemini üretimi` özeti: model, istek adedi, istenen/üretilen/kabul edilen soru sayıları, reddedilen soru sayısı, süre ve token kullanımı.
- Gemini'den daha az çağrı yapmak gecikmeyi ve kota kullanımını **azaltabilir**, fakat gerçek süre/kalite değişimini üretim ortamında ölçmek gerekir.
- İkinci Gemini denetimi ve embedding tabanlı soru kontrolü varsayılan tek-istek yolunda devre dışıdır; bu nedenle modelin yanıtı akademik doğruluk garantisi değildir. Yerel kontroller de açıkça yanlış bilgiyi her zaman yakalayamaz.
- `JSON` inceleme düğmesinde kaynak indeksleri ve mevcutsa önceki semantic skorları görünür. Yeni haritada skor bulunmaması normaldir; skor bir doğruluk yüzdesi değildir.

## Eski yol ve regresyon

- `geminiIleTestSorulariUret` fonksiyonu doğrudan `tekIstekModu` olmadan çağrılırsa eski parti/onarma yolunu korur (test/geri uyumluluk). StudyAI test servisi `tekIstekModu: true` geçirir.
- Çalışan birim/entegrasyon testleri kalite ve hızın gerçek Gemini ile doğrulandığı anlamına gelmez.

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

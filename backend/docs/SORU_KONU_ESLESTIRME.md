# Adım 1 — Soru–Konu Eşleştirme ve Öğrenme Verisi Denetimi

**Kapsam:** BPO 2026–2027 ikinci yarıyıl hedefleri 1–3 için veri temeli. Uygulama planı v1.0, Bölüm 10, Adım 1.

## Amaç ve sınır

Tamamlanan testlerden konu bazlı öğrenme analizi için **güvenilir** cevap kayıtları seçmek. Henüz hâkimiyet yüzdesi, adaptif test kararı, yanlışlardan tekrar testi veya yeni arayüz üretilmez. Mevcut soru üretimi, kayıt, kullanıcı doğrulaması ve kart modülü değiştirilmez.

İlgili saf fonksiyon: backend/services/konuPerformansVerisiService.js içindeki konuPerformansVerileriniDogrula.

Girdiler:
- kullaniciId, dersId: Analiz yapılacak öğrenci ve ders.
- konuHaritasi: Aynı kullanıcı ve derse ait anaKonular ve gecmisKonular içeren harita.
- testler: Test modelinden yüklenmiş tam test kayıtları (sorular ve kaynakSurumleri dahil).

Çıktılar:
- gecerliKayitlar: Konusu doğrulanmış, durum ve cevap etiketi hazır kayıtlar. Puan veya ortalama içermez.
- dislananSorular: Test/soru kimlikleri ve neden kodu.
- atlananTestler: Tamamlanmamış, farklı kullanıcı/ders veya öğrenme puanına uygun olmayan testler.
- ozet: İncelenen/atlanan test ve geçerli/dışlanan soru sayıları.

## Kabul ve dışlama kuralları

1. **Sahiplik:** İstenen kullanıcı ve ders kimliği zorunludur. Harita sahibi eşleşmiyorsa hata verilir. Başka kullanıcı veya dersin testleri atlanır. Veritabanı sorgusunun da aynı sahiplik filtrelerini uygulaması gerekir.
2. **Tamamlanma:** Yalnız durum === "tamamlandi" ve geçerli tamamlanmaTarihi olan kayıtlar puan verisine adaydır.
3. **Test türü:** Mevcut eski testlerde tür yoktur; bunlar "normal" sayılır. "normal", "manuel", "adaptif" uygundur. "yanlis_tekrari" ve tanınmayan türler ana hâkimiyete katılmaz.
4. **Konu kimliği:** Her sorunun **kendi** konuId değeri aranır. Bu ID, aynı dersin güncel anaKonular veya tarihsel gecmisKonular kayıtlarındaki ana/alt konuyla eşleşmelidir. konuBasligi, testin genel konuId değeri veya isim benzerliği ile tahmini eşleştirme **yapılmaz**.
5. **Çakışmalar:** Aynı kimlik aynı seviyede veya farklı üst konu altında birden fazla tanıma sahipse belirsiz sayılır. Aktif ve arşivde aynı kalıcı ID, aynı tür ve aynı üst konuyla tekrarlanıyorsa aktif başlık kullanılır.
6. **Kaynak izi:** Her sorunun doğrulanmış kaynaklar kaydı ve test oluşturulduğu andaki kaynakSurumleri anlık görüntüsünde karşılığı olmalıdır. Geçersiz parça indeksi veya çelişen sürüm nedeniyle soru dışlanır. Güncel materyal sürümünün **eski** sürümden farklı olması, tarihsel kaydı tek başına geçersiz kılmaz.
7. **Cevap:** Doğru cevap A/B/C/D; öğrenci cevabı A/B/C/D/null olmalıdır. null ayrı bir "bos" durumu olarak korunur, yanlış ile birleştirilmez. Puan hesabında boş cevapların nasıl ele alınacağı Adım 2'de ayrıca kesinleştirilir.
8. **Kimlik ve tarih:** Soru kimliği ve tamamlanma tarihi eksikse kayıt konu performansına alınmaz.

**Sınır:** Bu aşama saklanan kimlik ve kaynak **metaverisinin** tutarlılığını doğrular. Sorunun metninin gerçekten o konuyu ölçtüğünü semantik olarak yeniden yargılamaz. Mevcut Gemini test üretimindeki konu ve kaynak doğrulaması korunur. Başka bir model eğitilmez, veri otomatik düzeltilmez.

## Gelecekte yanlış tekrarlarını ayırma kararı

Adım 3'te, mevcut Test modeline geriye dönük uyumlu bir testTuru alanı ("normal" varsayılanı; "adaptif"; "yanlis_tekrari") eklenmesi ve tekrar oturumlarında kaynak soru/test kimliklerinin tutulması önerilir. Bu adımda **şema değişikliği yapılmadı**; servis gelecekteki türleri şimdiden güvenli biçimde ayırır. Aynı yanlış soruyu tekrar tekrar çözmek ana hâkimiyet yüzdesini şişirmeyecektir.

## Sınır durumlar ve testler

Otomatik testler şu durumları kapsar:
- Aktif ana/alt konu ve arşiv konusu
- Eksik/bilinmeyen/çakışan konuId
- Aynı ID'nin aktif ve arşivde güvenilir biçimde yer alması
- Başka kullanıcı/ders, tamamlanmamış test, yanlış tekrarı
- Geçerli/doğru/yanlış/boş/bozuk cevap
- Eksik soru kimliği ve tamamlanma tarihi
- Eksik/çakışan kaynak sürümü ve yanlış kaynak bağlantısı
- Kaynak sürümü zaman içinde değişmiş olsa bile tarihsel anlık görüntünün korunması
- Harita veya test bulunmaması

Çalıştırma: cd backend && npm test (tüm mevcut testler) veya node --test tests/konuPerformansVerisi.test.js (yalnız bu modül).

## Adım 2 entegrasyon kararı

Adım 2'nin sunucu hizmeti, kullaniciId/dersId filtreleriyle tamamlanan testlerin tam belgelerini ve KonuHaritasi içindeki **hem aktif hem arşiv** konuları okur. Yukarıdaki saf doğrulama fonksiyonunun döndürdüğü gecerliKayitlar üzerinden son geçerli cevaplar, asgari örnek sayısı, cevap sayıları ve konu hâkimiyeti hesaplanır. Her sorgu mevcut kimlik doğrulama ile korunur; başka öğrenci verisi asla gösterilmez.

## Doğrulama durumu

- Kod incelemesi: Test.js, KonuHaritasi.js, testService.js, geminiService.js, testSistemi.test.js.
- Test kaynakları: backend/tests/konuPerformansVerisi.test.js ve GitHub Actions.
- Üretim MongoDB kayıtlarından **örnek çekilmedi**; gerçek kullanıcı verisine erişim veya veritabanında değişiklik yapılmadı.
- Gerçek öğrenci uçtan uca akışı / Gemini canlı kullanımı ve birinci yarıyıl literatür araştırması-dokümantasyon denetimi ayrıca doğrulanmalıdır.

**Bitiş ölçütü:** Analize alınan her soru güvenilir konu kimliğine ve tarihsel kaynak izine sahip olmalı; alınmayan her soru belirli gerekçeyle raporlanmalı. Adım 2 başlamadan önce otomatik testler ve öğrenci senaryosu doğrulanır.

# StudyAI Semantik Arama

## Mimari karar

Embedding verisi ayrı bir koleksiyon yerine `MetinParcasi` belgesinde saklanır. Her vektör; `materyalId`, `islemeId`, içerik, model, boyut ve giriş hash'iyle aynı yaşam döngüsünü paylaşır. Bunun üç sonucu vardır:

- Materyal silindiğinde mevcut parça temizliği embedding'i de siler.
- Yeniden işlemede staging sürümü hazırlanırken eski aktif sürüm çalışmaya devam eder.
- Arama yalnızca `Materyal.aktifIslemeId` ile birebir eşleşen parçaları seçer; yarım kalmış veya eski sürümler sonuçlara karışmaz.

MongoDB Atlas Vector Search kullanılmaz. Ücretsiz Atlas katmanına uygun olarak aktif parçaların önce yalnızca kimlik ve sıra metadatası alınır. `SEMANTIK_ARAMA_MAKS_ADAY` aşılırsa adaylar materyaller arasında dengeli, her materyalin tamamı boyunca eşit aralıklı ve deterministik seçilir; yalnızca seçilen parçaların metin ve vektörleri belleğe taşınır. Kosinüs benzerliği Node.js içinde hesaplanır. Bu sınır CPU ve vektör belleğini sınırlar ancak yaklaşık arama yaptığı için seçilmeyen bir parçanın en iyi sonuç olma riski tamamen ortadan kalkmaz. Veri büyüyüp ders başına bu sınır düzenli olarak aşılırsa Atlas Vector Search veya ayrı bir vektör veritabanına geçilmelidir.

## Model seçimi

Varsayılan model `gemini-embedding-001`, boyut `768`'dir. Ekim 2026 tarihli resmî Gemini belgelerine göre hem `gemini-embedding-001` hem `gemini-embedding-2` kararlı modeldir ve 128-3072 arası boyutları destekler; 768, 1536 ve 3072 önerilir.

Bu metin odaklı proje için Embedding 1 seçilmiştir. Bir string listesini tek istekte ayrı vektörlere dönüştürmesi, parça indekslemede istek/gün kotasını önemli ölçüde azaltır. `RETRIEVAL_DOCUMENT` ve `RETRIEVAL_QUERY` görev türleri de doğrudan desteklenir. Servis `GEMINI_EMBEDDING_MODELI=gemini-embedding-2` ayarını da destekler; Embedding 2'de resmî `task: search result | query: ...` ve `title: ... | text: ...` biçimleri kullanılır ve her metin ayrı istekle işlenir.

Model değiştirilirse embedding uzayları uyumsuz olduğu için tüm materyaller yeniden indekslenmelidir. Arama model ve boyutu filtrelediğinden eski vektörleri yanlışlıkla karşılaştırmaz.

## İndeksleme akışı ve hata güvenliği

1. Metin, yeni bir `islemeId` altında staging parçalarına ayrılır.
2. Aynı kullanıcıda aynı model, boyut, başlık ve içeriğe ait hazır vektör varsa hash üzerinden yeniden kullanılır.
3. Eksik vektörler Gemini'den batch olarak alınır ve tamamı doğrulandıktan sonra parçalar toplu güncellenir.
4. Embedding başarısız olsa bile metin ve konu haritası akışı taahhüt edilir; materyal `embeddingDurumu=hata` olur. Böylece mevcut özellikler Gemini embedding kotasına bağımlı hâle gelmez.
5. Arama yalnızca hazır embedding taşıyan aktif sürümleri kullanır. Diğer materyallerin hazır sonuçları dönmeye devam eder.

Başarısız veya eski bir materyal indeksini yeniden oluşturmak için:

```http
POST /materyaller/:id/embedding-yenile
Cookie: token=...
```

İşlem kullanıcı sahipliğini, materyalin `hazir` durumunu ve aktif sürümünü doğrular. Materyal/ders silme işlemleri mevcut `MetinParcasi.deleteMany` akışıyla vektörleri de temizler.

## Arama API'si

```http
POST /dersler/:id/semantic-arama
Content-Type: application/json
Cookie: token=...

{
  "sorgu": "ikili arama ağacında düğüm nasıl bulunur?",
  "limit": 8
}
```

`sorgu` 2-500 karakter, `limit` 1-10 aralığındadır. Yanıt; skor sırasındaki pasajları, materyal adını ve indeks kapsamı metadatasını içerir. Embedding vektörleri API yanıtına eklenmez. Ders sahipliği embedding çağrısından önce doğrulanır.

## Kota ve maliyet koruması

- Varsayılan güvenli sınırlar 90 RPM, yaklaşık 27.000 TPM ve 900 RPD'dir; bunlar uygulama ayarıdır, Google hesabının garantili kotası değildir.
- Gerçek proje kotaları Google AI Studio'dan kontrol edilmeli ve ortam değişkenleri daha düşük değerlere ayarlanmalıdır.
- Süreç içi kuyruk RPM/TPM/RPD sınırlarını uygular. Sağlayıcı kaynaklı 429, zaman aşımı ve 5xx hataları en fazla üç denemeyle üstel geri çekilir; yerelde saptanan günlük limit aynı çağrı içinde yeniden denenmez.
- Sayaçlar süreç belleğindedir ve backend yeniden başladığında sıfırlanır. Tek instance kullanılan bitirme projesinde bu bilinçli bir sadelik tercihidir; gerçek proje kotasını Gemini API yine sunucu tarafında uygular ve aşımda 429 döndürür.
- Birden fazla backend instance varsa bu sayaçlar instance başınadır. Ortak kota için Redis tabanlı dağıtık limiter eklenmelidir.
- Ücretsiz katmanda gönderilen verilerin ürün iyileştirmede kullanılabileceğine ilişkin güncel Google koşulları değerlendirilmelidir.

## Dağıtım

Gerekli ortam değişkenleri `backend/.env.example` içindedir. En az `MONGODB_URI`, `JWT_SECRET`, `GEMINI_API_KEY` ve `FRONTEND_URL` sağlanmalıdır.

Mevcut veriler otomatik ve sınırsız biçimde topluca Gemini'ye gönderilmez. Dağıtım sonrası eski materyaller için `embedding-yenile` uç noktası kontrollü olarak çağrılmalı veya materyaller yeniden işlenmelidir. Model/boyut değişiminde de aynı yeniden indeksleme gerekir. Kota nedeniyle küçük gruplar hâlinde ilerlemek önerilir.

Testler canlı API çağrısı yapmaz; Gemini istemcisi mock'lanır:

```bash
cd backend
npm test
```

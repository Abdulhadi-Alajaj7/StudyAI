const konular = [
    ["Yığın", [
        ["Yığında elemanlar hangi sırayla çıkar?", "Son giren ilk çıkar", "Yığın, son giren ilk çıkar sırasıyla çalışır."],
        ["Yığına yeni eleman ekleyen işlem hangisidir?", "Push", "Push işlemi yığının tepesine yeni eleman ekler."],
        ["Yığının tepesindeki elemanı silen işlem hangisidir?", "Pop", "Pop işlemi yığının tepesindeki elemanı siler."],
        ["Yığının tepesindeki elemanı silmeden okumak için hangi işlem kullanılır?", "Peek", "Peek işlemi yığının tepesindeki elemanı silmeden okur."],
        ["Boş yığından eleman çıkarma girişiminin sonucu nedir?", "Underflow", "Boş yığından eleman çıkarma girişimi underflow hatasına yol açar."],
    ]],
    ["Kuyruk", [
        ["Kuyrukta elemanlar hangi sırayla işlenir?", "İlk giren ilk çıkar", "Kuyruk, ilk giren ilk çıkar sırasıyla çalışır."],
        ["Kuyruğun sonuna eleman ekleyen işlem hangisidir?", "Enqueue", "Enqueue işlemi kuyruğun sonuna eleman ekler."],
        ["Kuyruğun başından eleman çıkaran işlem hangisidir?", "Dequeue", "Dequeue işlemi kuyruğun başından eleman çıkarır."],
        ["Kuyruğun başındaki elemanı silmeden okumak için hangi işlem kullanılır?", "Front", "Front işlemi kuyruğun başındaki elemanı silmeden okur."],
        ["Dairesel kuyrukta son konumdan sonra hangi konuma geçilir?", "Başlangıç konumu", "Dairesel kuyrukta son konumdan sonra başlangıç konumuna geçilir."],
    ]],
    ["İkili Arama Ağacı", [
        ["İkili arama ağacında küçük anahtarlar hangi alt ağaçta tutulur?", "Sol alt ağaç", "İkili arama ağacında küçük anahtarlar sol alt ağaçta tutulur."],
        ["İkili arama ağacında büyük anahtarlar hangi alt ağaçta tutulur?", "Sağ alt ağaç", "İkili arama ağacında büyük anahtarlar sağ alt ağaçta tutulur."],
        ["İkili arama ağacını sıralı ziyaret eden dolaşım hangisidir?", "Inorder", "Inorder dolaşımı ikili arama ağacını sıralı ziyaret eder."],
        ["Ağaçta çocuğu olmayan düğüme ne denir?", "Yaprak", "Ağaçta çocuğu olmayan düğüme yaprak denir."],
        ["Ağacın en üst düğümüne ne denir?", "Kök", "Ağacın en üst düğümüne kök denir."],
    ]],
    ["Hash Tablosu", [
        ["Hash tablosunda aynı indekse iki anahtar düşmesi ne olarak adlandırılır?", "Çakışma", "Hash tablosunda aynı indekse iki anahtar düşmesi çakışma olarak adlandırılır."],
        ["Hash çakışmalarını bağlı listeyle tutan yöntem hangisidir?", "Zincirleme", "Zincirleme yöntemi hash çakışmalarını bağlı listeyle tutar."],
        ["Hash çakışmasında başka bir boş hücre arayan yöntem hangisidir?", "Açık adresleme", "Açık adresleme yöntemi hash çakışmasında başka bir boş hücre arar."],
        ["Hash tablosunda eleman sayısının kapasiteye oranına ne denir?", "Yük faktörü", "Hash tablosunda eleman sayısının kapasiteye oranına yük faktörü denir."],
        ["Anahtarı tablo indeksine dönüştüren bileşen hangisidir?", "Hash fonksiyonu", "Hash fonksiyonu anahtarı tablo indeksine dönüştürür."],
    ]],
    ["Graf", [
        ["Grafta genişlik öncelikli arama hangi veri yapısını kullanır?", "Kuyruk", "Grafta genişlik öncelikli arama kuyruk kullanır."],
        ["Grafta derinlik öncelikli arama hangi veri yapısını kullanır?", "Yığın", "Grafta derinlik öncelikli arama yığın kullanır."],
        ["Yönlü graf kenarlarının ayırt edici özelliği nedir?", "Yön bilgisi", "Yönlü graf kenarları yön bilgisi taşır."],
        ["Grafın her düğümünün komşularını liste halinde tutan temsil hangisidir?", "Komşuluk listesi", "Komşuluk listesi grafın her düğümünün komşularını liste halinde tutar."],
        ["Ağırlıklı graf kenarlarında hangi ek bilgi bulunur?", "Maliyet", "Ağırlıklı graf kenarları maliyet bilgisi taşır."],
    ]],
];

export const ornekPaket = (dagilim = [2, 2, 2, 2, 2], zorluk = "orta") => {
    const izinliKonuIds = dagilim.map((_, index) => ({ konuId: `sub-${index}`, baslik: konular[index][0], konuTuru: "alt" }));
    const kaynaklar = izinliKonuIds.map((konu, index) => ({
        anahtar: `K${index + 1}`, materyalId: `m${index + 1}`, dosyaAdi: `${konu.baslik}.txt`, parcaIndex: 0,
        konuIds: [konu.konuId], icerik: konular[index][1].map((satir) => satir[2]).join(" "),
    }));
    const soru = (konuIndex, hedefIndex, yeniZorluk = zorluk) => {
        const [metin, cevap, kanit] = konular[konuIndex][1][hedefIndex];
        return {
            metin, aciklama: kanit, ogrenmeHedefi: kanit,
            secenekler: [cevap, "Rastgele seçim", "Bütün elemanları silme", "Veri kopyalama"].map((metin, i) => ({ anahtar: "ABCD"[i], metin })),
            dogruCevap: "A", zorluk: yeniZorluk, konuId: `sub-${konuIndex}`,
            kaynakReferanslari: [`K${konuIndex + 1}`],
            kaynakKanitlari: [{ kaynakReferansi: `K${konuIndex + 1}`, alinti: kanit }],
        };
    };
    const sorular = dagilim.flatMap((adet, index) => Array.from({ length: adet }, (_, i) => soru(index, i)));
    const soruSayisi = sorular.length;
    return { soru, sorular, girdi: {
        dersBilgisi: { dersAdi: "Veri Yapıları" }, kapsamTuru: "konu", hedefBasligi: "Veri Yapıları",
        soruSayisi, zorlukDagilimi: { [zorluk]: soruSayisi },
        konuDagilimi: izinliKonuIds.map((konu) => ({ ...konu, adet: soruSayisi % dagilim.length ? 1 : soruSayisi / dagilim.length })),
        kaynaklar, izinliKonuIds, konuEslesmeleriZorunlu: true, modelAdi: "mock-model",
    } };
};

export const geminiTaklidi = (yanitlar) => {
    const istekler = [];
    return { istekler, bagimliliklar: {
        istekYonetimi: { yerAyir: () => () => {} },
        istemci: { models: { async generateContent(istek) {
            istekler.push(istek);
            const yanit = yanitlar[istekler.length - 1];
            if (yanit instanceof Error) throw yanit;
            if (typeof yanit === "function") return yanit(istek);
            if (!yanit) throw new Error("Beklenmeyen ek API çağrısı");
            return { text: JSON.stringify({ durum: "tamamlandi", ...yanit }), candidates: [{ finishReason: "STOP" }],
                usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 } };
        } } },
    } };
};

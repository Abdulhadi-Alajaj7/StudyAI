export const HAZIRLAMA_ASAMALARI = [
    {
        kod: "metinler", baslik: "Metinler kontrol ediliyor",
        bekliyor: "Dosyalarınızın metinleri ve içerik parçaları kontrol edilecek.",
        isleniyor: "Dosyalarınızın metinleri ve içerik parçaları doğrulanıyor.",
        tamamlandi: "Metinler ve içerik parçaları kontrol edildi.",
    },
    {
        kod: "embedding", baslik: "Anlamsal arama hazırlanıyor",
        bekliyor: "Materyalleriniz anlamsal aramaya hazırlanacak.",
        isleniyor: "Ders kaynaklarınız için anlamsal arama dizini hazırlanıyor.",
        tamamlandi: "Anlamsal arama dizini hazırlandı.",
    },
    {
        kod: "harita", baslik: "Konu haritası oluşturuluyor",
        bekliyor: "Materyallerinizden dersin konu başlıkları çıkarılacak.",
        isleniyor: "Yapay zekâ, kaynaklarınızdan dersin konu haritasını oluşturuyor.",
        tamamlandi: "Konu haritası oluşturuldu ve kaynakları doğrulandı.",
    },
    {
        kod: "tamamlandi", baslik: "Dersiniz hazır",
        bekliyor: "Tüm aşamalar tamamlandığında dersiniz kullanıma açılacak.",
        tamamlandi: "Dersiniz öğrenmeye hazır.",
    },
];

// Backend aşamaları sıralıdır. Bir sonraki aşamaya geçilmiş olması,
// önceki aşamanın tamamlandığına dair sunucu bilgisidir.
export const hazirlamaAdimlariniGetir = (ders, baslatiliyor = false) => {
    const onaylandi = !baslatiliyor && ders?.materyallerOnaylandi === true;
    const asamaIndex = !baslatiliyor && ["isleniyor", "hata"].includes(ders?.hazirlamaDurumu)
        ? HAZIRLAMA_ASAMALARI.findIndex(a => a.kod === ders?.hazirlamaAsamasi && a.kod !== "tamamlandi")
        : -1;

    return HAZIRLAMA_ASAMALARI.map((asama, index) => {
        const durum = onaylandi || (asamaIndex >= 0 && index < asamaIndex) ? "tamamlandi"
            : index === asamaIndex ? ders.hazirlamaDurumu : "bekliyor";
        return {
            kod: asama.kod,
            baslik: asama.baslik,
            durum,
            aciklama: durum === "hata" ? "Bu aşama tamamlanamadı. Yeniden deneyebilirsiniz." : asama[durum],
        };
    });
};

export const dersDurumunuGetir = (ders, konuHaritasi) => {
    // Kalıcı onay, eski onaylı derslerde de başarı için yetkili kaynaktır.
    if (ders?.materyallerOnaylandi === true) {
        return { durum: "hazir", baslik: "Dersiniz hazır", aciklama: "Dersiniz onaylandı. Öğrenmeye başlayabilirsiniz." };
    }
    if (ders?.hazirlamaDurumu === "hata") {
        return { durum: "hata", baslik: "Hazırlama tamamlanamadı", aciklama: ders.hazirlamaHatasi || "Materyallerinizi kontrol edip yeniden deneyebilirsiniz." };
    }
    if (ders?.hazirlamaDurumu === "isleniyor") {
        return { durum: "isleniyor", baslik: "Ders hazırlanıyor", aciklama: "Materyalleriniz işleniyor ve dersiniz hazırlanıyor." };
    }
    if (konuHaritasi?.durum === "olusturuluyor") {
        return { durum: "isleniyor", baslik: "Konu haritası hazırlanıyor", aciklama: "Ders kaynaklarınız analiz ediliyor." };
    }
    if (konuHaritasi?.durum === "hata") {
        return { durum: "hata", baslik: "Konu haritası oluşturulamadı", aciklama: "Materyallerinizi kontrol edip yeniden deneyebilirsiniz." };
    }
    return { durum: "bekliyor", baslik: "Hazırlama bekleniyor", aciklama: "Ders hazırlama işlemi henüz tamamlanmadı." };
};

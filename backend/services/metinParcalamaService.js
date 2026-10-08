import MetinParcasi from "../models/MetinParcasi.js";

/**
 * Metni belirli bir uzunlukta ve overlap ile anlamlı sınırları (paragraf, cümle, kelime) koruyarak parçalar.
 */
export const metniParcalaraAyir = (metin, maxLength = 1000, overlap = 200) => {
    if (!metin || typeof metin !== 'string') return [];
    
    metin = metin.trim();
    if (metin.length === 0) return [];
    
    if (overlap >= maxLength) {
        overlap = Math.floor(maxLength / 5);
    }
    
    const parcalar = [];
    let baslangic = 0;
    
    while (baslangic < metin.length) {
        if (baslangic + maxLength >= metin.length) {
            const parca = metin.substring(baslangic).trim();
            if (parca.length > 0) parcalar.push(parca);
            break;
        }
        
        let bitis = baslangic + maxLength;
        const incelenenKisim = metin.substring(baslangic, bitis);
        let gercekBitis = -1;
        
        const minHedefBitis = Math.floor(maxLength * 0.5);
        
        const ciftSatir = incelenenKisim.lastIndexOf("\n\n");
        if (ciftSatir > minHedefBitis) {
            gercekBitis = baslangic + ciftSatir;
        }
        
        if (gercekBitis === -1) {
            const tekSatir = incelenenKisim.lastIndexOf("\n");
            if (tekSatir > minHedefBitis) {
                gercekBitis = baslangic + tekSatir;
            }
        }
        
        if (gercekBitis === -1) {
            const regex = /([.?!])(?=\s)/g;
            let match;
            let sonCumleSınırı = -1;
            while ((match = regex.exec(incelenenKisim)) !== null) {
                sonCumleSınırı = match.index + 1;
            }
            if (sonCumleSınırı > minHedefBitis) {
                gercekBitis = baslangic + sonCumleSınırı;
            }
        }
        
        if (gercekBitis === -1) {
            const kelimeSınırı = incelenenKisim.lastIndexOf(" ");
            if (kelimeSınırı > minHedefBitis) {
                gercekBitis = baslangic + kelimeSınırı;
            }
        }
        
        if (gercekBitis === -1) {
            gercekBitis = bitis;
        }
        
        const parca = metin.substring(baslangic, gercekBitis).trim();
        if (parca.length > 0) {
            if (parcalar.length > 0 && parcalar[parcalar.length - 1] === parca) {
                baslangic += maxLength;
                continue;
            }
            parcalar.push(parca);
        }
        
        let yeniBaslangic = gercekBitis - overlap;
        
        if (yeniBaslangic <= baslangic) {
            yeniBaslangic = baslangic + 1;
        } else {
            while (yeniBaslangic > baslangic && yeniBaslangic < metin.length && metin[yeniBaslangic - 1] !== ' ' && metin[yeniBaslangic - 1] !== '\n') {
                yeniBaslangic++;
            }
            if (yeniBaslangic >= gercekBitis) {
                yeniBaslangic = gercekBitis;
            }
        }
        
        baslangic = yeniBaslangic;
    }
    
    return parcalar;
};

export const metinParcalaVeKaydet = async (metin, materyal, parcaUzunlugu = 1000, overlap = 200) => {
    // Önceki parçaları güvenli şekilde sil (yeniden işleme durumu)
    await MetinParcasi.deleteMany({ materyalId: materyal._id });
    
    const parcalar = metniParcalaraAyir(metin, parcaUzunlugu, overlap);
    
    if (parcalar.length === 0) return [];
    
    const belgeler = parcalar.map((icerik, index) => ({
        kullaniciId: materyal.kullaniciId,
        dersId: materyal.dersId,
        materyalId: materyal._id,
        parcaIndex: index,
        icerik: icerik,
        karakterSayisi: icerik.length
    }));
    
    if (belgeler.length > 0) {
        try {
            await MetinParcasi.insertMany(belgeler);
        } catch (error) {
            // Hata durumunda kısmi eklenenleri temizle ve hatayı fırlat
            await MetinParcasi.deleteMany({ materyalId: materyal._id });
            throw new Error("Metin parçaları veritabanına kaydedilirken hata oluştu: " + error.message);
        }
    }
    
    return belgeler;
};

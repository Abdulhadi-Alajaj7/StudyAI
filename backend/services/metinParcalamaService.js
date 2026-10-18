
import MetinParcasi from "../models/MetinParcasi.js";
import crypto from "node:crypto";

/**
 * Metni anlamlı sınırları koruyarak parçalara ayırır.
 * Parçalar arasında overlap bırakır ve metin kaybını önler.
 */
export const metniParcalaraAyir = (
    metin,
    maxLength = 1000,
    overlap = 200
) => {
    if (typeof metin !== "string" || metin.trim().length === 0) {
        return [];
    }

    if (!Number.isInteger(maxLength) || maxLength < 1) {
        throw new Error("maxLength pozitif bir tam sayı olmalıdır.");
    }

    if (!Number.isInteger(overlap) || overlap < 0) {
        throw new Error("overlap negatif olmayan bir tam sayı olmalıdır.");
    }

    metin = metin.trim();

    if (overlap >= maxLength) {
        overlap = Math.floor(maxLength / 5);
    }

    const parcalar = [];
    let baslangic = 0;

    while (baslangic < metin.length) {
        const maksimumBitis = Math.min(
            baslangic + maxLength,
            metin.length
        );

        let bitis = maksimumBitis;

        if (maksimumBitis < metin.length) {
            const incelenenKisim = metin.slice(
                baslangic,
                maksimumBitis
            );

            const minimumSinir = Math.floor(maxLength * 0.5);

            const paragrafSiniri =
                incelenenKisim.lastIndexOf("\n\n");

            const satirSiniri =
                incelenenKisim.lastIndexOf("\n");

            const kelimeSiniri =
                incelenenKisim.lastIndexOf(" ");

            let secilenSinir = -1;

            if (paragrafSiniri >= minimumSinir) {
                secilenSinir = paragrafSiniri + 2;
            } else if (satirSiniri >= minimumSinir) {
                secilenSinir = satirSiniri + 1;
            } else {
                const cumleRegex = /[.?!](?=\s)/g;
                let eslesme;
                let sonCumleSiniri = -1;

                while (
                    (eslesme = cumleRegex.exec(incelenenKisim)) !== null
                ) {
                    sonCumleSiniri = eslesme.index + 1;
                }

                if (sonCumleSiniri >= minimumSinir) {
                    secilenSinir = sonCumleSiniri;
                } else if (kelimeSiniri >= minimumSinir) {
                    secilenSinir = kelimeSiniri + 1;
                }
            }

            if (secilenSinir > 0) {
                bitis = baslangic + secilenSinir;
            }
        }

        // Son parçada kalan tüm metni koru.
        if (maksimumBitis === metin.length) {
            bitis = metin.length;
        }

        // İlerleme garantisi.
        if (bitis <= baslangic) {
            bitis = maksimumBitis;
        }

        const parca = metin.slice(baslangic, bitis).trim();

        if (parca.length > 0) {
            // Tekrarlanan gerçek metin parçaları silinmez.
            parcalar.push(parca);
        }

        if (bitis >= metin.length) {
            break;
        }

        // Overlap korunur ve her döngüde yeterli ilerleme sağlanır.
        let yeniBaslangic = Math.max(
            baslangic + 1,
            bitis - overlap
        );

        // Kelime sınırı yalnızca overlap miktarını aşmadan
        // bulunabiliyorsa kullanılır. Aksi halde mevcut konum korunur.
        if (yeniBaslangic > baslangic + 1) {
            let adayBaslangic = yeniBaslangic;

            while (
                adayBaslangic > baslangic + 1 &&
                !/\s/.test(metin[adayBaslangic - 1])
            ) {
                adayBaslangic--;
            }

            // Çok geriye giderek ilerlemeyi yavaşlatma.
            const minimumIlerleme = Math.max(
                baslangic + 1,
                bitis - maxLength + overlap
            );

            if (adayBaslangic >= minimumIlerleme) {
                yeniBaslangic = adayBaslangic;
            }
        }

        if (yeniBaslangic >= bitis) {
            yeniBaslangic = bitis;
        }

        baslangic = yeniBaslangic;
    }

    return parcalar;
};

/**
 * Metni parçalar ve islemeId altında staging olarak kaydeder.
 * Eski aktif parçalar korunur.
 */
export const metinParcalaVeKaydet = async (
    metin,
    materyal,
    islemeId,
    parcaUzunlugu = 1000,
    overlap = 200
) => {
    if (!islemeId) {
        throw new Error(
            "metinParcalaVeKaydet: Geçerli bir islemeId zorunludur."
        );
    }

    const parcalar = metniParcalaraAyir(
        metin,
        parcaUzunlugu,
        overlap
    );

    if (parcalar.length === 0) {
        return [];
    }

    const belgeler = parcalar.map((icerik, index) => ({
        kullaniciId: materyal.kullaniciId,
        dersId: materyal.dersId,
        materyalId: materyal._id,
        islemeId,
        parcaIndex: index,
        icerik,
        karakterSayisi: icerik.length,
        icerikHash: crypto.createHash("sha256").update(icerik).digest("hex"),
        embeddingDurumu: "bekliyor"
    }));

    try {
        await MetinParcasi.insertMany(belgeler);
    } catch (error) {
        // Yalnızca başarısız yeni işlem parçalarını temizle.
        // Eski aktif materyal parçalarına dokunma.
        await MetinParcasi.deleteMany({
            materyalId: materyal._id,
            islemeId
        });

        throw new Error(
            "Metin parçaları veritabanına kaydedilirken hata oluştu: " +
            error.message
        );
    }

    return belgeler;
};

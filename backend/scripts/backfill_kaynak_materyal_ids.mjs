/**
 * backfill_kaynak_materyal_ids.mjs
 *
 * Mevcut KonuHaritasi kayıtlarındaki altKonu ve anaKonu belgelerine
 * kaynakMateryalIds alanını güvenli şekilde ekler.
 *
 * Strateji:
 * - Her KonuHaritasi.kaynakMateryaller listesini kullan.
 * - Eğer harita tek bir materyale sahipse, tüm altKonulara o materyal ID'sini ekle.
 * - Eğer birden fazla materyal varsa, kaynakMateryalIds = [] (bilinmiyor) olarak bırak.
 *   Bu durumda incremental sistem yeni materyal eklendiğinde ilişkileri kurar.
 * - Var olan kaynakMateryalIds alanları ASLA silinmez veya üzerine yazılmaz.
 *
 * KULLANIM:
 *   # Önce dry-run ile test et (veritabanına yazmaz):
 *   node backend/scripts/backfill_kaynak_materyal_ids.mjs --dry-run
 *
 *   # Gerçek migration (dikkatli ol!):
 *   node backend/scripts/backfill_kaynak_materyal_ids.mjs
 *
 * GÜVENLİK:
 * - Canlı MongoDB üzerinde migration çalıştırılmadan önce MUTLAKA yedek al.
 * - Bu script sadece $set ile günceller, mevcut veri silinmez.
 * - İdempotent: tekrar çalıştırılırsa aynı sonucu verir.
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

dotenv.config({ path: new URL("../.env", import.meta.url) });

const DRY_RUN = process.argv.includes("--dry-run");

if (DRY_RUN) {
    console.log("DRY-RUN modu aktif - veritabanına hiçbir değişiklik yazılmayacak.\n");
} else {
    console.log("GERÇEK migration modu - veritabanı güncellenecek!\n");
}

async function main() {
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!mongoUri) {
        console.error("HATA: MONGODB_URI veya MONGO_URI ortam değişkeni tanımlı değil.");
        process.exit(1);
    }

    await mongoose.connect(mongoUri);
    console.log("MongoDB bağlantısı kuruldu.\n");

    const db = mongoose.connection.db;
    const col = db.collection("konuharitasis");

    const haritalar = await col.find({}).toArray();
    console.log(`Toplam ${haritalar.length} KonuHaritasi kaydı bulundu.\n`);

    let guncellenen = 0;
    let atlanan = 0;
    let toplam = 0;

    for (const harita of haritalar) {
        toplam++;
        const kaynaklar = harita.kaynakMateryaller || [];
        const tekMateryal = kaynaklar.length === 1
            ? kaynaklar[0].materyalId
            : null;

        let degistimi = false;
        const guncelAnaKonular = (harita.anaKonular || []).map(ana => {
            let anaDegistimi = false;
            const yeniAnaKaynak = (ana.kaynakMateryalIds && ana.kaynakMateryalIds.length > 0)
                ? ana.kaynakMateryalIds
                : (tekMateryal ? [tekMateryal] : []);

            if (!ana.kaynakMateryalIds || ana.kaynakMateryalIds.length === 0) {
                anaDegistimi = true;
            }

            const guncelAltKonular = (ana.altKonular || []).map(alt => {
                const yeniAltKaynak = (alt.kaynakMateryalIds && alt.kaynakMateryalIds.length > 0)
                    ? alt.kaynakMateryalIds
                    : (tekMateryal ? [tekMateryal] : []);

                if (!alt.kaynakMateryalIds || alt.kaynakMateryalIds.length === 0) {
                    anaDegistimi = true;
                }

                return { ...alt, kaynakMateryalIds: yeniAltKaynak };
            });

            if (anaDegistimi) degistimi = true;
            return { ...ana, kaynakMateryalIds: yeniAnaKaynak, altKonular: guncelAltKonular };
        });

        if (!degistimi) {
            atlanan++;
            continue;
        }

        console.log(`  Harita ID: ${harita._id} | Ders: ${harita.dersId} | ${kaynaklar.length} materyal`);
        if (tekMateryal) {
            console.log(`    Tek materyal tespit edildi: ${tekMateryal} - tüm konulara atanıyor.`);
        } else {
            console.log(`    Birden fazla materyal var - kaynakMateryalIds boş bırakılıyor (incremental sistem doldurur).`);
        }

        if (!DRY_RUN) {
            await col.updateOne(
                { _id: harita._id },
                { $set: { anaKonular: guncelAnaKonular } }
            );
        }
        guncellenen++;
    }

    console.log("\n---");
    console.log(`Toplam: ${toplam} | Güncellenen: ${guncellenen} | Atlanan: ${atlanan}`);
    if (DRY_RUN) {
        console.log("\nDry-run tamamlandı. Gerçek migration için --dry-run bayrağını kaldırın.");
    } else {
        console.log("\nMigration tamamlandı.");
    }

    await mongoose.disconnect();
}

main().catch(err => {
    console.error("Migration hatası:", err);
    mongoose.disconnect();
    process.exit(1);
});

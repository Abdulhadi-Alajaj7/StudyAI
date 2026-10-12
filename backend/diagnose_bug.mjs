/**
 * diagnose_bug.mjs - Gerçek tarayıcıda gözlemlenen hatanın kod düzeyinde kanıtı
 */
import {
    turkceKarakterleriAsciilestir,
    konuBasliginiNormalizeEt,
    kelimeKokunuBul,
    metinKokleriniCikar,
    semantikEslesmeKontrolu,
    eskiKonuKimliginiBul
} from "./services/konuKimlikEslemeService.js";

const eskiBaslik = "Veri Yapısı Kavramı ve Gerekliliği";
const yeniBaslik = "Veri Yapısı Kavramı ve Gereksinimi";

console.log("=== NORMALIZE ===");
console.log("Eski:", konuBasliginiNormalizeEt(eskiBaslik));
console.log("Yeni:", konuBasliginiNormalizeEt(yeniBaslik));

console.log("\n=== ASCII'e Dönüştürme ===");
console.log("Eski ASCII:", turkceKarakterleriAsciilestir(eskiBaslik));
console.log("Yeni ASCII:", turkceKarakterleriAsciilestir(yeniBaslik));

console.log("\n=== Kelime kökü analizi ===");
const gerekliligiAscii = turkceKarakterleriAsciilestir("gerekliligi");
const gereksinimAscii  = turkceKarakterleriAsciilestir("gereksinimi");
console.log("'gerekliligi' ASCII ->", gerekliligiAscii, "-> kok:", kelimeKokunuBul(gerekliligiAscii));
console.log("'gereksinimi' ASCII ->", gereksinimAscii,  "-> kok:", kelimeKokunuBul(gereksinimAscii));

console.log("\n=== Kok kumeleri ===");
const eskiKokler = metinKokleriniCikar(eskiBaslik);
const yeniKokler = metinKokleriniCikar(yeniBaslik);
console.log("Eski kokleri:", [...eskiKokler].sort());
console.log("Yeni kokleri:", [...yeniKokler].sort());

console.log("\n=== Kesisim hesabi ===");
let kesisim = 0;
const ortakKokler = [];
for (const k of yeniKokler) {
    if (eskiKokler.has(k)) {
        ortakKokler.push(k);
        kesisim++;
    }
}
console.log("Ortak kokler:", ortakKokler);
const birlesim = new Set([...eskiKokler, ...yeniKokler]).size;
const jaccard = kesisim / birlesim;
console.log(`Kesisim: ${kesisim}, Birlesim: ${birlesim}, Jaccard: ${jaccard.toFixed(4)}`);
console.log("Jaccard === 1.0 && kesisim >= 2?", jaccard === 1.0 && kesisim >= 2, "(tam esleme esigi)");
console.log("Jaccard >= 0.75 && kesisim >= 3?", jaccard >= 0.75 && kesisim >= 3, "(yuksek benzerlik esigi)");

console.log("\n=== Semantik esleme sonucu ===");
const eskiKonu = {
    konuId: "sub-bc61f62b",
    baslik: eskiBaslik,
    aciklama: "Veri yapisi kavramini ve gerekliligi aciklar"
};
const yeniKonu = {
    baslik: yeniBaslik,
    aciklama: "Veri yapisi kavrami ve gereksinimi uzerine temel bilgiler"
};

const semantik = semantikEslesmeKontrolu(yeniKonu, eskiKonu);
console.log("semantikEslesmeKontrolu:", semantik, semantik ? "ESLESME VAR" : "ESLESME YOK <- HATA BURADA");

const eslesenId = eskiKonuKimliginiBul(yeniKonu, [eskiKonu]);
console.log("eskiKonuKimliginiBul:", eslesenId, eslesenId ? "ID KORUNDU" : "ID DEGISTI <- GERCEK HATA");

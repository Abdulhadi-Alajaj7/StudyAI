import { metniParcalaraAyir } from "./services/metinParcalamaService.js";

const runTests = () => {
    let passed = 0;
    let failed = 0;

    const assertEqual = (expected, actual, testName) => {
        if (JSON.stringify(expected) === JSON.stringify(actual)) {
            console.log(`✅ ${testName}`);
            passed++;
        } else {
            console.error(`❌ ${testName}`);
            console.error(`  Expected: ${JSON.stringify(expected)}`);
            console.error(`  Actual:   ${JSON.stringify(actual)}`);
            failed++;
        }
    };

    const assertCondition = (condition, testName, message) => {
        if (condition) {
            console.log(`✅ ${testName}`);
            passed++;
        } else {
            console.error(`❌ ${testName}: ${message}`);
            failed++;
        }
    };

    // Test 1: Boş metin
    assertEqual([], metniParcalaraAyir(""), "Boş metin");
    assertEqual([], metniParcalaraAyir(null), "Null metin");

    // Test 2: Çok kısa metin
    assertEqual(["Kısa metin"], metniParcalaraAyir("Kısa metin", 100, 20), "Kısa metin");

    // Test 3: Uzun metin ve Overlap
    const uzunMetin = "Bu birinci cümledir. Bu ikinci cümledir. Bu üçüncü cümledir. Bu da son cümledir.";
    // chunk = 35, overlap = 15
    const chunks = metniParcalaraAyir(uzunMetin, 35, 15);
    // 35 chars could be "Bu birinci cümledir. Bu ikinci"
    // However, it should stop at sentence boundary.
    assertCondition(chunks.length > 1, "Uzun metin parçalandı mı", "Parça sayısı > 1 olmalı");
    assertCondition(chunks[0].includes("Bu birinci cümledir"), "Parça 1 doğru metni içeriyor mu", "Beklenen metin yok");

    // Test 4: Paragraf koruması
    const paragrafMetin = "Birinci paragraf.\n\nİkinci paragraf.\n\nÜçüncü paragraf.";
    const chunksParagraf = metniParcalaraAyir(paragrafMetin, 25, 5);
    assertCondition(chunksParagraf.length === 3, "Paragraf sınırlarından bölündü mü", `Beklenen 3 parça, bulundu ${chunksParagraf.length}`);

    // Test 5: Aynı metnin tekrar parçalanması (Deterministik)
    const chunksA = metniParcalaraAyir(uzunMetin, 35, 15);
    const chunksB = metniParcalaraAyir(uzunMetin, 35, 15);
    assertEqual(chunksA, chunksB, "Aynı ayarlarla aynı sonuç (Deterministik)");

    console.log(`\nTest Sonuçları: ${passed} Başarılı, ${failed} Başarısız.`);
};

runTests();

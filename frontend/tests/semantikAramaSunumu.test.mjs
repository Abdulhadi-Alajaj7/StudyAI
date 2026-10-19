import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const dersHazir = fs.readFileSync(new URL("../src/pages/DersHazir.jsx", import.meta.url), "utf8");
const dersAsistani = fs.readFileSync(
    new URL("../../backend/services/dersAsistaniService.js", import.meta.url),
    "utf8"
);
const semanticServisYolu = new URL(
    "../../backend/services/semanticAramaService.js",
    import.meta.url
);

test("hazır sayfasında bağımsız anlamsal arama arayüzü bulunmaz", () => {
    assert.doesNotMatch(dersHazir, /SemantikAramaBolumu|Materyallerde Anlamsal Arama/);
    assert.equal(
        fs.existsSync(new URL("../src/components/SemantikAramaBolumu.jsx", import.meta.url)),
        false
    );
});

test("sohbet RAG hattı backend anlamsal arama servisini kullanmaya devam eder", () => {
    assert.equal(fs.existsSync(semanticServisYolu), true);
    assert.match(dersAsistani, /import \{ semanticAramaYap \} from "\.\/semanticAramaService\.js"/);
    assert.match(dersAsistani, /semanticArama: bagimliliklar\.semanticArama \|\| semanticAramaYap/);
});


import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const bileşenKaynağı = await readFile(
    new URL("../src/components/OzetSecimDropdown.jsx", import.meta.url),
    "utf8"
);
const sayfaKaynağı = await readFile(
    new URL("../src/pages/DersOzet.jsx", import.meta.url),
    "utf8"
);

test("özet seçim dropdownu portal, listbox ve erişilebilir klavye davranışlarını içerir", () => {
    assert.match(bileşenKaynağı, /createPortal/);
    assert.match(bileşenKaynağı, /role="listbox"/);
    assert.match(bileşenKaynağı, /role="option"/);
    assert.match(bileşenKaynağı, /aria-activedescendant/);
    assert.match(bileşenKaynağı, /event\.key === "Escape"/);
    assert.match(bileşenKaynağı, /document\.addEventListener\("pointerdown"/);
    assert.match(bileşenKaynağı, /scrollIntoView/);
});

test("materyal ve konu seçimleri mevcut kimlik state setterlarını değiştirmeden kullanır", () => {
    assert.match(sayfaKaynağı, /value: String\(materyal\._id\)/);
    assert.match(sayfaKaynağı, /value: konu\.konuId/);
    assert.match(sayfaKaynağı, /onChange=\{setMateryalId\}/);
    assert.match(sayfaKaynağı, /onChange=\{setKonuId\}/);
});

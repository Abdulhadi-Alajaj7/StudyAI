import test from "node:test";
import assert from "node:assert/strict";

import { dahiliKaynakAtiflariniTemizle } from "../utils/dahiliKaynakAtiflari.js";

test("dahili RAG atıflarını metinden temizler", () => {
    assert.equal(
        dahiliKaynakAtiflariniTemizle("Eğitim verisi kullanılır [K1]. Test verisi farklıdır [K2]."),
        "Eğitim verisi kullanılır. Test verisi farklıdır."
    );
});

test("virgülle ayrılmış çoklu dahili RAG atıflarını tek parça olarak temizler", () => {
    assert.equal(
        dahiliKaynakAtiflariniTemizle("Eğitim ve test verileri farklı amaçlarla kullanılır [K1, K3, K5]."),
        "Eğitim ve test verileri farklı amaçlarla kullanılır."
    );
});

test("normal Markdown bağlantılarını ve köşeli parantezleri korur", () => {
    const icerik = "[Kaynak](https://example.com), [önemli] ifade ve [K1, K3](https://example.com/kaynak).";
    assert.equal(dahiliKaynakAtiflariniTemizle(icerik), icerik);
});

test("satır içi ve çitli kod bloklarındaki K kodlarını değiştirmez", () => {
    const icerik = "Metin [K1].\n\n`const kod = '[K2]'`\n\n```js\nconst kaynak = '[K3]';\n```";
    assert.equal(
        dahiliKaynakAtiflariniTemizle(icerik),
        "Metin.\n\n`const kod = '[K2]'`\n\n```js\nconst kaynak = '[K3]';\n```"
    );
});

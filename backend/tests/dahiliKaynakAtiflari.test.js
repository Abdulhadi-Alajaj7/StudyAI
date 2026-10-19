import test from "node:test";
import assert from "node:assert/strict";

import { dahiliKaynakAtiflariniTemizle } from "../utils/dahiliKaynakAtiflari.js";

test("dahili RAG atıflarını metinden temizler", () => {
    assert.equal(
        dahiliKaynakAtiflariniTemizle("Eğitim verisi kullanılır [K1]. Test verisi farklıdır [K2]."),
        "Eğitim verisi kullanılır. Test verisi farklıdır."
    );
});

test("normal Markdown bağlantılarını ve köşeli parantezleri korur", () => {
    const icerik = "[Kaynak](https://example.com) ve [önemli] ifade ile [K1](https://example.com/k1).";
    assert.equal(dahiliKaynakAtiflariniTemizle(icerik), icerik);
});

test("satır içi ve çitli kod bloklarındaki K kodlarını değiştirmez", () => {
    const icerik = "Metin [K1].\n\n`const kod = '[K2]'`\n\n```js\nconst kaynak = '[K3]';\n```";
    assert.equal(
        dahiliKaynakAtiflariniTemizle(icerik),
        "Metin.\n\n`const kod = '[K2]'`\n\n```js\nconst kaynak = '[K3]';\n```"
    );
});

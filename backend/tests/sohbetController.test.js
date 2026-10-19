import test from "node:test";
import assert from "node:assert/strict";

import {
    sohbetBasligiGirdisiniDogrula,
    sohbetOlusturmaGirdisiniDogrula,
} from "../controllers/sohbetController.js";

test("boş veya aşırı uzun ilk mesajlar reddedilir", () => {
    for (const ilkMesaj of ["", "   ", "a".repeat(4_001), null]) {
        const sonuc = sohbetOlusturmaGirdisiniDogrula({
            ilkMesaj,
            istemciIstekId: "istek-0001",
        });
        assert.equal(sonuc.kod, "GECERSIZ_ILK_MESAJ");
    }
});

test("istemci istek kimliği zorunludur ve güvenli karakterlerle sınırlandırılır", () => {
    for (const istemciIstekId of ["", "kisa", "boşluk içeren", "x".repeat(129)]) {
        const sonuc = sohbetOlusturmaGirdisiniDogrula({
            ilkMesaj: "Sanal bellek nedir?",
            istemciIstekId,
        });
        assert.equal(sonuc.kod, "GECERSIZ_ISTEK_ID");
    }

    assert.deepEqual(
        sohbetOlusturmaGirdisiniDogrula({
            ilkMesaj: "  Sanal bellek nedir?  ",
            istemciIstekId: "c5bce8b9-8ef4-4591-a786-4c5127fd55ad",
        }),
        {
            ilkMesaj: "Sanal bellek nedir?",
            istemciIstekId: "c5bce8b9-8ef4-4591-a786-4c5127fd55ad",
        }
    );
});

test("manuel başlık boş olamaz ve model sınırıyla aynı uzunluğu kullanır", () => {
    assert.equal(sohbetBasligiGirdisiniDogrula({ baslik: " " }).kod, "GECERSIZ_SOHBET_BASLIGI");
    assert.equal(
        sohbetBasligiGirdisiniDogrula({ baslik: "x".repeat(101) }).kod,
        "GECERSIZ_SOHBET_BASLIGI"
    );
    assert.deepEqual(
        sohbetBasligiGirdisiniDogrula({ baslik: "  Deadlock Kavramı  " }),
        { baslik: "Deadlock Kavramı" }
    );
});

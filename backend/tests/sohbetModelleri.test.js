import test from "node:test";
import assert from "node:assert/strict";

import Sohbet from "../models/Sohbet.js";
import Mesaj from "../models/Mesaj.js";

const indeksBul = (model, alanlar) => model.schema.indexes().find(
    ([indeks]) => Object.entries(alanlar).every(([alan, yon]) => indeks[alan] === yon)
);

test("Sohbet modeli kullanıcı ve ders sahipliğini, başlık durumunu ve sıralama indeksini taşır", () => {
    assert.ok(Sohbet.schema.path("kullaniciId"));
    assert.ok(Sohbet.schema.path("dersId"));
    assert.ok(Sohbet.schema.path("baslik"));
    assert.ok(Sohbet.schema.path("baslikManuel"));
    assert.ok(Sohbet.schema.path("baslikUretimDurumu"));
    assert.ok(Sohbet.schema.path("baslikUretimDenemeSayisi"));
    assert.ok(Sohbet.schema.path("aktifIstekId"));
    assert.ok(Sohbet.schema.path("sonMesajTarihi"));

    const indeks = indeksBul(Sohbet, {
        kullaniciId: 1,
        dersId: 1,
        sonMesajTarihi: -1,
        _id: -1,
    });
    assert.ok(indeks);
});

test("Mesaj modeli tekrar isteklerini ve aynı kullanıcı mesajına çift asistan yanıtını benzersiz indekslerle engeller", () => {
    const istekIndeksi = indeksBul(Mesaj, { kullaniciId: 1, istemciIstekId: 1 });
    assert.ok(istekIndeksi);
    assert.equal(istekIndeksi[1].unique, true);
    assert.deepEqual(istekIndeksi[1].partialFilterExpression, {
        rol: "user",
        istemciIstekId: { $type: "string" },
    });

    const yanitIndeksi = indeksBul(Mesaj, { sohbetId: 1, yanitlananMesajId: 1 });
    assert.ok(yanitIndeksi);
    assert.equal(yanitIndeksi[1].unique, true);
});

test("Kaynak snapshot şeması yalnızca doğrulanmış materyal bilgisini saklar ve gelecekteki konum metadata'sına hazırdır", () => {
    const kaynakSemasi = Mesaj.schema.path("kaynaklar").schema;
    assert.ok(kaynakSemasi.path("metinParcasiId"));
    assert.ok(kaynakSemasi.path("materyalId"));
    assert.ok(kaynakSemasi.path("materyalAdi"));
    assert.ok(kaynakSemasi.path("parcaIndex"));

    const konumSemasi = kaynakSemasi.path("konum").schema;
    assert.deepEqual(
        konumSemasi.path("tur").options.enum,
        ["sayfa", "slayt", "bolum"]
    );
    assert.ok(konumSemasi.path("deger"));
    assert.equal(kaynakSemasi.path("dosyaYolu"), undefined);
    assert.equal(kaynakSemasi.path("url"), undefined);
});

test("Kullanıcı mesajı istemci istek kimliği olmadan doğrulamadan geçmez", async () => {
    const mesaj = new Mesaj({
        sohbetId: "64b000000000000000000001",
        kullaniciId: "64b000000000000000000002",
        dersId: "64b000000000000000000003",
        rol: "user",
        icerik: "Sanal bellek nedir?",
    });

    await assert.rejects(() => mesaj.validate(), /istemci istek kimliği zorunludur/i);
});

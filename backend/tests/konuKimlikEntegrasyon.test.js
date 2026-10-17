
import test, { mock } from "node:test";
import assert from "node:assert/strict";

const eskiHarita = {
    durum: "olusturuluyor",
    anaKonular: [
        {
            konuId: "top-123",
            baslik: "Diziler",
            altKonular: [
                {
                    konuId: "sub-123",
                    baslik: "Tek Boyutlu Diziler"
                }
            ]
        },
        {
            konuId: "top-456",
            baslik: "Ağaçlar",
            altKonular: []
        }
    ]
};

const materyal = {
    _id: "materyal-1",
    dosyaAdi: "ders.txt",
    aktifIslemeId: "isleme-1"
};

const kaydedilenler = [];

mock.module("../models/Materyal.js", {
    namedExports: {},
    defaultExport: {
        find() {
            return {
                select: async () => [materyal]
            };
        }
    }
});

mock.module("../models/MetinParcasi.js", {
    namedExports: {},
    defaultExport: {
        find() {
            return {
                sort: async () => [
                    {
                        materyalId: "materyal-1",
                        icerik: "Diziler ve ağaçlar hakkında ders.",
                        parcaIndex: 0
                    }
                ]
            };
        }
    }
});

mock.module("../models/Ders.js", {
    defaultExport: {
        async findOne() {
            return {
                _id: "ders-1",
                kullaniciId: "kullanici-1",
                materyallerOnaylandi: false,
                temizleniyor: false
            };
        }
    }
});

mock.module("../models/KonuHaritasi.js", {
    namedExports: {},
    defaultExport: {
        async findOne() {
            return eskiHarita;
        },

        async updateOne() {
            return { matchedCount: 1 };
        },

        async findOneAndUpdate(filtre, guncelleme) {
            kaydedilenler.push({ filtre, guncelleme });
            return guncelleme.$set;
        }
    }
});

mock.module("../services/geminiService.js", {
    namedExports: {
        VARSAYILAN_GEMINI_MODELI: "test-model",

        async geminiIleKonuHaritasiUret() {
            return [
                {
                    baslik: "DİZİLER!",
                    altKonular: [
                        {
                            baslik: "Tek Boyutlu Diziler!"
                        }
                    ]
                },
                {
                    baslik: "Ağaçlar",
                    altKonular: []
                },
                {
                    baslik: "Graf Teorisi",
                    altKonular: []
                }
            ];
        },

        async geminiIleKonulariBirlestir() {
            throw new Error(
                "Tek materyal testinde birleştirme çağrılmamalı."
            );
        }
    }
});

const {
    konuHaritasiUretVeKaydet
} = await import("../services/konuHaritasiService.js");

test("Konu haritası eski ID'leri korur ve yeni ID üretir", async () => {
    const ders = {
        _id: "ders-1",
        dersAdi: "Veri Yapıları",
        aciklama: "",
        donem: "Güz"
    };

    const sonuc = await konuHaritasiUretVeKaydet(
        ders,
        "kullanici-1",
        "token-1"
    );

    assert.equal(sonuc.durum, "hazir");

    const konular = sonuc.anaKonular;

    assert.equal(konular.length, 3);

    assert.equal(
        konular[0].konuId,
        "top-123",
        "Diziler eski ID'sini korumalı"
    );

    assert.equal(
        konular[0].altKonular[0].konuId,
        "sub-123",
        "Alt konu eski ID'sini korumalı"
    );

    assert.equal(
        konular[1].konuId,
        "top-456",
        "Ağaçlar eski ID'sini korumalı"
    );

    assert.ok(
        konular[2].konuId.startsWith("top-"),
        "Yeni konu yeni bir ID almalı"
    );

    const tumKimlikler = konular.flatMap(konu => [
        konu.konuId,
        ...konu.altKonular.map(alt => alt.konuId)
    ]);

    assert.equal(
        new Set(tumKimlikler).size,
        tumKimlikler.length,
        "Konu ID'leri benzersiz olmalı"
    );

    assert.equal(
        kaydedilenler.length,
        1,
        "Harita bir kez kaydedilmeli"
    );
});

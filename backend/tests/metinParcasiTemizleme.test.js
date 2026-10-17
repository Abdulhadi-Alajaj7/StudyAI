import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

let materyaller;
let parcalar;
let silmeCagrilari;
let materyalOkumaSayisi;
let materyalOkumaHook;

const sorguZinciri = (sonucUret) => {
    let limit = Infinity;

    return {
        select() {
            return this;
        },
        sort() {
            return this;
        },
        limit(deger) {
            limit = deger;
            return this;
        },
        async lean() {
            return structuredClone(sonucUret().slice(0, limit));
        }
    };
};

mock.module("../models/MetinParcasi.js", {
    defaultExport: {
        find(filtre) {
            return sorguZinciri(() => parcalar
                .filter((parca) => !filtre._id?.$gt || parca._id > filtre._id.$gt)
                .sort((sol, sag) => sol._id.localeCompare(sag._id))
            );
        },
        async deleteMany(filtre) {
            silmeCagrilari.push(structuredClone(filtre));
            const silinecekler = new Set(filtre._id.$in);
            const oncekiAdet = parcalar.length;
            parcalar = parcalar.filter((parca) => !silinecekler.has(parca._id));
            return { deletedCount: oncekiAdet - parcalar.length };
        }
    }
});

mock.module("../models/Materyal.js", {
    defaultExport: {
        find(filtre) {
            return sorguZinciri(() => {
                const ids = new Set(filtre._id.$in.map(String));
                const sonuc = structuredClone(
                    materyaller.filter((materyal) => ids.has(String(materyal._id)))
                );
                materyalOkumaSayisi++;
                materyalOkumaHook?.(materyalOkumaSayisi);
                return sonuc;
            });
        }
    }
});

const {
    metinParcasiKullaniliyorMu,
    kullanilmayanMetinParcalariniTemizle
} = await import("../services/metinParcasiTemizlemeService.js");

const sessizLogger = { log() {} };

beforeEach(() => {
    materyaller = [
        {
            _id: "mat-basarili",
            durum: "hazir",
            islemeId: "tamamlanan",
            aktifIslemeId: "aktif-1"
        },
        {
            _id: "mat-devam",
            durum: "isleniyor",
            islemeId: "staging-2",
            aktifIslemeId: "aktif-2"
        },
        {
            _id: "mat-basarisiz",
            durum: "hazir",
            islemeId: "terk-edilmis-3",
            aktifIslemeId: "aktif-3"
        },
        {
            _id: "mat-eski",
            durum: "hazir",
            islemeId: null,
            aktifIslemeId: null
        },
        {
            _id: "mat-ilk-yarim",
            durum: "hata",
            islemeId: null,
            aktifIslemeId: null
        }
    ];

    parcalar = [
        { _id: "01", materyalId: "mat-basarili", islemeId: "aktif-1" },
        { _id: "02", materyalId: "mat-basarili", islemeId: "eski-1" },
        { _id: "03", materyalId: "mat-devam", islemeId: "staging-2" },
        { _id: "04", materyalId: "mat-devam", islemeId: "aktif-2" },
        { _id: "05", materyalId: "mat-devam", islemeId: "eski-2" },
        { _id: "06", materyalId: "mat-basarisiz", islemeId: "aktif-3" },
        { _id: "07", materyalId: "mat-basarisiz", islemeId: "terk-edilmis-3" },
        { _id: "08", materyalId: "silinmis-materyal", islemeId: "yetim-4" },
        { _id: "09", materyalId: "mat-eski", islemeId: null },
        { _id: "10", materyalId: "mat-ilk-yarim", islemeId: "staging-5" }
    ];
    silmeCagrilari = [];
    materyalOkumaSayisi = 0;
    materyalOkumaHook = null;
});

test("aktif, geçerli staging ve belirsiz eski sürüm parçalarını korur", () => {
    assert.equal(
        metinParcasiKullaniliyorMu(parcalar[0], materyaller[0]),
        true
    );
    assert.equal(
        metinParcasiKullaniliyorMu(parcalar[2], materyaller[1]),
        true
    );
    assert.equal(
        metinParcasiKullaniliyorMu(parcalar[3], materyaller[1]),
        true
    );
    assert.equal(
        metinParcasiKullaniliyorMu(parcalar[8], materyaller[3]),
        true
    );
});

test("terk edilmiş staging, eski sürüm ve silinmiş materyal parçalarını temizler", async () => {
    const sonuc = await kullanilmayanMetinParcalariniTemizle({
        batchSize: 2,
        logger: sessizLogger,
        mod: "single-instance"
    });

    assert.deepEqual(sonuc, {
        incelenenParcaSayisi: 10,
        silinenParcaSayisi: 5
    });
    assert.deepEqual(
        parcalar.map((parca) => parca._id),
        ["01", "03", "04", "06", "09"]
    );
    assert.ok(silmeCagrilari.every((cagri) => cagri._id?.$in));
});

test("başarısız yeniden işlemenin staging parçalarını silerken önceki aktif sürümü korur", async () => {
    await kullanilmayanMetinParcalariniTemizle({
        logger: sessizLogger,
        mod: "single-instance"
    });

    assert.ok(parcalar.some((parca) => parca._id === "06"));
    assert.ok(!parcalar.some((parca) => parca._id === "07"));
});

test("çoklu instance sırasında güncel işleme tokenına ait staging parçalarını silmez", async () => {
    await kullanilmayanMetinParcalariniTemizle({ logger: sessizLogger });

    assert.ok(parcalar.some((parca) => parca._id === "03"));
});

test("temizlik tekrar çalıştırıldığında idempotent kalır", async () => {
    await kullanilmayanMetinParcalariniTemizle({
        logger: sessizLogger,
        mod: "single-instance"
    });
    const ilkTemizlikSonrasi = structuredClone(parcalar);

    const ikinciSonuc = await kullanilmayanMetinParcalariniTemizle({
        logger: sessizLogger,
        mod: "single-instance"
    });

    assert.deepEqual(ikinciSonuc, {
        incelenenParcaSayisi: 5,
        silinenParcaSayisi: 0
    });
    assert.deepEqual(parcalar, ilkTemizlikSonrasi);
});

test("temizlik aday seçimi sonrasında aktif sürüm değişirse yeni aktif parçayı silmez", async () => {
    materyalOkumaHook = (okumaSayisi) => {
        if (okumaSayisi === 1) {
            materyaller[0].aktifIslemeId = "eski-1";
        }
    };

    await kullanilmayanMetinParcalariniTemizle({
        logger: sessizLogger,
        mod: "single-instance"
    });

    assert.ok(parcalar.some((parca) => parca._id === "02"));
});

test("iki instance eşzamanlı temizlerken mevcut materyallerin tüm sürümlerini korur", async () => {
    const [birinci, ikinci] = await Promise.all([
        kullanilmayanMetinParcalariniTemizle({ logger: sessizLogger }),
        kullanilmayanMetinParcalariniTemizle({ logger: sessizLogger })
    ]);

    assert.ok(!parcalar.some((parca) => parca._id === "08"));
    assert.ok(parcalar.some((parca) => parca._id === "01"));
    assert.ok(parcalar.some((parca) => parca._id === "02"));
    assert.ok(parcalar.some((parca) => parca._id === "03"));
    assert.ok(parcalar.some((parca) => parca._id === "07"));
    assert.equal(birinci.silinenParcaSayisi + ikinci.silinenParcaSayisi, 1);
});

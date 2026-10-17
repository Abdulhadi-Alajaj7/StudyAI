import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

let materyaller;
let haritalar;
let dersler;
let materyalUpdateCalls;
let haritaUpdateCalls;
let dersUpdateCalls;

const degerEsit = (sol, sag) => JSON.stringify(sol) === JSON.stringify(sag);

const guncelle = (belgeler, filtre, set) => {
    let modifiedCount = 0;

    for (const belge of belgeler) {
        let eslesiyor = true;

        if (filtre.durum !== undefined && belge.durum !== filtre.durum) {
            eslesiyor = false;
        }

        if (filtre.aktifIslemeId?.$ne === null && belge.aktifIslemeId == null) {
            eslesiyor = false;
        }

        if (filtre.$or) {
            const aktifSurumYok = belge.aktifIslemeId == null;
            if (!aktifSurumYok) eslesiyor = false;
        }

        if (filtre["anaKonular.0"]?.$exists === true && belge.anaKonular.length === 0) {
            eslesiyor = false;
        }

        if (filtre["anaKonular.0"]?.$exists === false && belge.anaKonular.length > 0) {
            eslesiyor = false;
        }

        if (
            filtre.aktifMateryalIslemSayisi?.$gt !== undefined &&
            !(belge.aktifMateryalIslemSayisi > filtre.aktifMateryalIslemSayisi.$gt)
        ) {
            eslesiyor = false;
        }

        if (!eslesiyor) continue;

        const onceki = Object.fromEntries(Object.keys(set).map((alan) => [alan, belge[alan]]));
        Object.assign(belge, structuredClone(set));
        if (!degerEsit(onceki, set)) modifiedCount++;
    }

    return { modifiedCount };
};

mock.module("../models/Materyal.js", {
    defaultExport: {
        async updateMany(filtre, update) {
            materyalUpdateCalls++;
            return guncelle(materyaller, filtre, update.$set);
        }
    }
});

mock.module("../models/KonuHaritasi.js", {
    defaultExport: {
        async updateMany(filtre, update) {
            haritaUpdateCalls++;
            return guncelle(haritalar, filtre, update.$set);
        }
    }
});

mock.module("../models/Ders.js", {
    defaultExport: {
        async updateMany(filtre, update) {
            dersUpdateCalls++;
            return guncelle(dersler, filtre, update.$set);
        }
    }
});

const {
    baslangicIslemleriniKurtar,
    baslangicKurtarmaEtkinMi,
    TEK_INSTANCE_KURTARMA_MODU
} = await import("../services/baslangicKurtarmaService.js");

const sessizLogger = { log() {}, warn() {} };

const durumOzeti = () => ({
    materyaller: structuredClone(materyaller),
    haritalar: structuredClone(haritalar),
    dersler: structuredClone(dersler)
});

beforeEach(() => {
    materyaller = [
        {
            _id: "ilk-islem",
            durum: "isleniyor",
            islemeId: "eski-islem-1",
            aktifIslemeId: null,
            islemeHatasi: ""
        },
        {
            _id: "yeniden-islem",
            durum: "isleniyor",
            islemeId: "eski-islem-2",
            aktifIslemeId: "basarili-surum",
            islemeHatasi: ""
        },
        {
            _id: "normal",
            durum: "hazir",
            islemeId: null,
            aktifIslemeId: "normal-surum",
            islemeHatasi: ""
        }
    ];
    haritalar = [
        {
            _id: "eski-haritasi-var",
            durum: "olusturuluyor",
            aktifIslemToken: "eski-token-1",
            kilitSonYenilemeTarihi: "2026-01-01T00:00:00.000Z",
            anaKonular: [{ konuId: "korunacak-konu" }],
            olusturmaHatasi: ""
        },
        {
            _id: "ilk-harita",
            durum: "olusturuluyor",
            aktifIslemToken: "eski-token-2",
            kilitSonYenilemeTarihi: "2026-01-01T00:00:00.000Z",
            anaKonular: [],
            olusturmaHatasi: ""
        },
        {
            _id: "normal-harita",
            durum: "hazir",
            aktifIslemToken: null,
            anaKonular: [{ konuId: "normal-konu" }],
            olusturmaHatasi: ""
        }
    ];
    dersler = [
        { _id: "aktif-1", aktifMateryalIslemSayisi: 2 },
        { _id: "aktif-2", aktifMateryalIslemSayisi: 1 },
        { _id: "normal", aktifMateryalIslemSayisi: 0 }
    ];
    materyalUpdateCalls = 0;
    haritaUpdateCalls = 0;
    dersUpdateCalls = 0;
});

test("açık tek-instance onayı yoksa ikinci sunucu aktif işlemlere dokunmaz", async () => {
    const onceki = durumOzeti();

    const sonuc = await baslangicIslemleriniKurtar({
        mod: "multi-instance",
        logger: sessizLogger
    });

    assert.equal(sonuc.calisti, false);
    assert.deepEqual(durumOzeti(), onceki);
    assert.equal(materyalUpdateCalls, 0);
    assert.equal(haritaUpdateCalls, 0);
    assert.equal(dersUpdateCalls, 0);
});

test("tek-instance yeniden başlangıcında yetim işlemler tutarlı biçimde kurtarılır", async () => {
    assert.equal(baslangicKurtarmaEtkinMi(TEK_INSTANCE_KURTARMA_MODU), true);

    const sonuc = await baslangicIslemleriniKurtar({
        mod: TEK_INSTANCE_KURTARMA_MODU,
        logger: sessizLogger
    });

    assert.deepEqual(sonuc, {
        calisti: true,
        materyalSayisi: 2,
        konuHaritasiSayisi: 2,
        dersSayisi: 2
    });

    assert.equal(materyaller[0].durum, "hata");
    assert.equal(materyaller[0].islemeId, null);
    assert.equal(materyaller[1].durum, "hazir");
    assert.equal(materyaller[1].aktifIslemeId, "basarili-surum");
    assert.equal(materyaller[1].islemeId, null);
    assert.equal(materyaller[2].durum, "hazir");

    assert.equal(haritalar[0].durum, "hazir");
    assert.equal(haritalar[0].aktifIslemToken, null);
    assert.equal(haritalar[0].kilitSonYenilemeTarihi, null);
    assert.equal(haritalar[0].anaKonular[0].konuId, "korunacak-konu");
    assert.equal(haritalar[1].durum, "hata");
    assert.equal(haritalar[1].aktifIslemToken, null);
    assert.equal(haritalar[1].kilitSonYenilemeTarihi, null);
    assert.equal(haritalar[2].durum, "hazir");

    assert.deepEqual(
        dersler.map((ders) => ders.aktifMateryalIslemSayisi),
        [0, 0, 0]
    );
});

test("tek-instance kurtarması tekrar çalıştırıldığında idempotent kalır", async () => {
    await baslangicIslemleriniKurtar({
        mod: TEK_INSTANCE_KURTARMA_MODU,
        logger: sessizLogger
    });
    const ilkSonrasi = durumOzeti();

    const ikinciSonuc = await baslangicIslemleriniKurtar({
        mod: TEK_INSTANCE_KURTARMA_MODU,
        logger: sessizLogger
    });

    assert.deepEqual(ikinciSonuc, {
        calisti: true,
        materyalSayisi: 0,
        konuHaritasiSayisi: 0,
        dersSayisi: 0
    });
    assert.deepEqual(durumOzeti(), ilkSonrasi);
});

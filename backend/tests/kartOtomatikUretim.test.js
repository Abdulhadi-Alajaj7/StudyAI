import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
    kartOtomatikUretiminiBaslat, kartOtomatikUretiminiCalistir,
    kartOtomatikUretimleriniTara,
} from "../services/kartOtomatikUretimService.js";
import { calismaKartlariDurumunuGetir } from "../services/calismaKartiService.js";

const kur = () => {
    const kullaniciId = new mongoose.Types.ObjectId();
    const dersId = new mongoose.Types.ObjectId();
    const ders = {
        _id: dersId, kullaniciId, materyallerOnaylandi: true,
        kartDersSurumImzasi: "surum1",
        kartDersTamamlandi: false, kartDersOtomatikAktif: false,
        kartDersIslenenGrupImzalari: [],
        kartDersToplamGrupSayisi: 3,
        kartDersDenemeSayisi: 0, kartDersSonrakiDeneme: null,
        kartDersOtomatikHataKodu: "",
    };
    let guncelleme = 0, kartOkuma = 0;
    const DersModel = {
        findOne(q) {
            if (q.kartDersOtomatikAktif === true && !ders.kartDersOtomatikAktif)
                return { lean: async () => null };
            return { lean: async () => ders };
        },
        async updateOne(q, update) {
            if (q.kartDersOtomatikAktif === true && !ders.kartDersOtomatikAktif)
                return { matchedCount: 0 };
            Object.assign(ders, update.$set || {});
            guncelleme++;
            return { matchedCount: 1 };
        },
    };
    const KartModel = {
        find() {
            kartOkuma++;
            return { sort() { return this; }, lean: async () => [
                { soru: "İlk kart", cevap: "İlk cevap", kaynaklar: [{ dosyaAdi: "hafta1.pdf" }] },
                { soru: "İkinci kart", cevap: "İkinci cevap", kaynaklar: [{ dosyaAdi: "hafta2.pdf" }] },
            ] };
        },
    };
    const args = { kullaniciId, dersId };
    return { args, ders, DersModel, KartModel,
        getUpdates: () => guncelleme, getKartOkuma: () => kartOkuma };
};

test("Tek tık kalıcı işi başlatır; tekrar tıklama aynı işi sıfırlamaz", async () => {
    const x = kur();
    const ilk = await kartOtomatikUretiminiBaslat(x.args, {
        DersModel: x.DersModel, devreDisiBirak: true,
    });
    assert.equal(ilk.uretimSuruyor, true);
    assert.equal(x.ders.kartDersOtomatikAktif, true);
    assert.equal(x.getUpdates(), 1);
    const ikinci = await kartOtomatikUretiminiBaslat(x.args, {
        DersModel: x.DersModel, devreDisiBirak: true,
    });
    assert.equal(ikinci.uretimSuruyor, true);
    assert.equal(x.getUpdates(), 1);
});

test("başarılı arka plan işi tamamlanır; yeni tarama ek üretim çağırmaz", async () => {
    const x = kur();
    await kartOtomatikUretiminiBaslat(x.args, { DersModel: x.DersModel, devreDisiBirak: true });
    let cagrilar = 0;
    const d = { DersModel: x.DersModel, uret: async () => {
        cagrilar++;
        assert.deepEqual((await calismaKartlariDurumunuGetir(x.args, {
            DersModel: x.DersModel, KartModel: x.KartModel,
        })).kartlar, []);
        x.ders.kartDersTamamlandi = true;
        return { tamamlandi: true, kartlar: [{ soru: "Kart" }] };
    } };
    await kartOtomatikUretiminiCalistir(x.args, d);
    await kartOtomatikUretiminiCalistir(x.args, d);
    assert.equal(cagrilar, 1);
    assert.equal(x.ders.kartDersOtomatikAktif, false);
    assert.equal(x.ders.kartDersSonrakiDeneme, null);
    assert.equal((await calismaKartlariDurumunuGetir(x.args, {
        DersModel: x.DersModel, KartModel: x.KartModel,
    })).kartlar.length, 2);
});

for (const [status, kod] of [
    [503, "GEMINI_503"], [504, "GEMINI_ZAMAN_ASIMI"], [502, "GEMINI_AG_HATASI"],
    [429, "GEMINI_GUNLUK_KOTA"], [429, "GEMINI_429"],
    [401, "GEMINI_YAPILANDIRMA"], [403, "GEMINI_YAPILANDIRMA"],
    [502, "GEMINI_GECERSIZ_YANIT"], [502, "KART_KAYNAK_GECERSIZ"],
]) {
    test(kod + ": Gemini katmanı bitince zamanlayıcı ikinci retry/kalite döngüsü başlatmaz", async () => {
        const x = kur();
        await kartOtomatikUretiminiBaslat(x.args, { DersModel: x.DersModel, devreDisiBirak: true });
        let cagrilar = 0;
        const d = { DersModel: x.DersModel, uret: async () => {
            cagrilar++;
            throw Object.assign(new Error("Üretim tamamlanamadı"), { status, kod });
        } };
        await kartOtomatikUretiminiCalistir(x.args, d);
        await kartOtomatikUretiminiCalistir(x.args, d);
        assert.equal(cagrilar, 1);
        assert.equal(x.ders.kartDersOtomatikAktif, false);
        assert.equal(x.ders.kartDersSonrakiDeneme, null);
        assert.equal(x.ders.kartDersOtomatikHataKodu, kod);
        assert.deepEqual((await calismaKartlariDurumunuGetir(x.args, {
            DersModel: x.DersModel, KartModel: x.KartModel,
        })).kartlar, []);
    });
}

test("başka iş kilidi taşıyorsa sonucu beklenir ve hata sayacı artırılmaz", async () => {
    const x = kur();
    await kartOtomatikUretiminiBaslat(x.args, { DersModel: x.DersModel, devreDisiBirak: true });
    await kartOtomatikUretiminiCalistir(x.args, {
        DersModel: x.DersModel,
        uret: async () => { throw Object.assign(new Error("Kilitli"), { status: 409, kod: "KART_URETIM_DEVAM_EDIYOR" }); },
    });
    assert.equal(x.ders.kartDersOtomatikAktif, true);
    assert.equal(x.ders.kartDersDenemeSayisi, 0);
    assert.ok(x.ders.kartDersSonrakiDeneme > new Date());
});

test("tamamlanmamış sonuç yeni üretim isteğiyle tamamlanmaya zorlanmaz", async () => {
    const x = kur();
    await kartOtomatikUretiminiBaslat(x.args, { DersModel: x.DersModel, devreDisiBirak: true });
    await kartOtomatikUretiminiCalistir(x.args, {
        DersModel: x.DersModel, uret: async () => ({ tamamlandi: false }),
    });
    assert.equal(x.ders.kartDersOtomatikAktif, false);
    assert.equal(x.ders.kartDersOtomatikHataKodu, "KART_URETIM_DOGRULANAMADI");
});


test("Sunucu yeniden açıldığında MongoDB'deki bekleyen işi otomatik kurtarır", async () => {
    const x = kur();
    x.ders.kartDersOtomatikAktif = true;
    x.ders.kartDersSonrakiDeneme = new Date(Date.now() - 30_000);
    const DersModel = {
        ...x.DersModel,
        find() {
            return {
                select() { return this; },
                limit() { return this; },
                lean: async () => [{ _id: x.args.dersId, kullaniciId: x.args.kullaniciId }],
            };
        },
    };
    let cagrilar = 0;
    await kartOtomatikUretimleriniTara({
        DersModel,
        uret: async () => {
            cagrilar++;
            x.ders.kartDersTamamlandi = true;
            return { tamamlandi: true, kartlar: [{ soru: "Kurtarılmış ders" }] };
        },
    });
    // Tetikleyici görevi arka plana bırakır. Birkaç microtask sonra
    // üretimden gelen tamamlandı durumu veritabanına yazılmış olmalı.
    for (let i = 0; i < 10 && x.ders.kartDersOtomatikAktif; i++) {
        await new Promise((resolve) => setImmediate(resolve));
    }
    assert.equal(cagrilar, 1);
    assert.equal(x.ders.kartDersOtomatikAktif, false);
    assert.equal(x.ders.kartDersTamamlandi, true);
});

test("Konu bağlantılı kartlar bütün gruplar bitmeden listelenmez", async () => {
    const x = kur();
    x.ders.kartDersSurumImzasi = "konu-v2:surum";
    x.ders.kartDersIslenenGrupImzalari = ["1"];
    x.ders.kartDersOtomatikAktif = true;
    const deps = {DersModel: x.DersModel, KartModel: x.KartModel};
    const kismi = await calismaKartlariDurumunuGetir(x.args, deps);
    assert.deepEqual(kismi.kartlar, []);
    assert.equal(kismi.islenenGrupSayisi, 1);
    assert.equal(x.getKartOkuma(), 0);
    x.ders.kartDersOtomatikAktif = false;
    x.ders.kartDersOtomatikHataKodu = "KART_URETIM_DOGRULANAMADI";
    assert.deepEqual((await calismaKartlariDurumunuGetir(x.args, deps)).kartlar, []);
    x.ders.kartDersOtomatikHataKodu = "";
    x.ders.kartDersTamamlandi = true;
    x.ders.kartDersIslenenGrupImzalari = ["1", "2", "3"];
    const tam = await calismaKartlariDurumunuGetir(x.args, deps);
    assert.equal(tam.dersKartTamamlandi, true);
    assert.equal(tam.kartlar.length, 2);
    assert.equal(x.getKartOkuma(), 1);
});

test("kaynak okumasında hata varsa sürüm oluşmadan da eski kartlar sunulmaz", async () => {
    const x = kur();
    x.ders.kartDersSurumImzasi = "";
    x.ders.kartDersOtomatikHataKodu = "KART_KONU_KAYNAGI_EKSIK";
    const sonuc = await calismaKartlariDurumunuGetir(x.args, {
        DersModel: x.DersModel, KartModel: x.KartModel,
    });
    assert.deepEqual(sonuc.kartlar, []);
    assert.equal(x.getKartOkuma(), 0);
});

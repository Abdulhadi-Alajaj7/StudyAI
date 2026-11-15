import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import {
    kartOtomatikUretiminiBaslat, kartOtomatikUretiminiCalistir,
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

test("429 sonrası kullanıcı yeniden tıklamadan backend kaldığı yerden tamamlar", async () => {
    const x = kur();
    await kartOtomatikUretiminiBaslat(x.args, {
        DersModel: x.DersModel, devreDisiBirak: true,
    });
    let deneme = 0;
    const uret = async () => {
        deneme++;
        if (deneme === 1) {
            x.ders.kartDersIslenenGrupImzalari = ["1"];
            return { tamamlandi: false, kotaEngeli: true, islenenGrupSayisi: 1,
                toplamGrupSayisi: 3 };
        }
        x.ders.kartDersTamamlandi = true;
        return { tamamlandi: true, kartlar: [{ soru: "Kart" }], islenenGrupSayisi: 3 };
    };
    const d = { DersModel: x.DersModel, uret };
    await kartOtomatikUretiminiCalistir(x.args, d);
    assert.equal(x.ders.kartDersOtomatikAktif, true);
    assert.ok(x.ders.kartDersSonrakiDeneme instanceof Date);
    assert.equal(x.ders.kartDersDenemeSayisi, 1);
    const eksik = await calismaKartlariDurumunuGetir(x.args, {
        DersModel: x.DersModel, KartModel: x.KartModel,
    });
    assert.deepEqual(eksik.kartlar, []);
    assert.equal(eksik.uretimSuruyor, true);
    assert.equal(x.getKartOkuma(), 0);
    // Zamanlayıcı vakti geldiğinde tekrar çalışır; yeni POST gerekmez.
    x.ders.kartDersSonrakiDeneme = new Date(Date.now() - 1000);
    await kartOtomatikUretiminiCalistir(x.args, d);
    assert.equal(deneme, 2);
    assert.equal(x.ders.kartDersOtomatikAktif, false);
    assert.equal(x.ders.kartDersTamamlandi, true);
    const tam = await calismaKartlariDurumunuGetir(x.args, {
        DersModel: x.DersModel, KartModel: x.KartModel,
    });
    assert.equal(tam.uretimSuruyor, false);
    assert.equal(tam.kartlar.length, 2);
    assert.equal(x.getKartOkuma(), 1);
});

test("Kalıcı olmayan 503 ve 429 uzun süreli kotada otomatik yeniden denenir", async () => {
    const x = kur();
    await kartOtomatikUretiminiBaslat(x.args, {
        DersModel: x.DersModel, devreDisiBirak: true,
    });
    for (let deneme = 0; deneme < 6; deneme++) {
        x.ders.kartDersSonrakiDeneme = new Date(Date.now() - 1000);
        await kartOtomatikUretiminiCalistir(x.args, {
            DersModel: x.DersModel,
            uret: async () => ({ tamamlandi: false, kotaEngeli: true,
                islenenGrupSayisi: 0, toplamGrupSayisi: 3 }),
        });
    }
    assert.equal(x.ders.kartDersOtomatikAktif, true);
    assert.equal(x.ders.kartDersOtomatikHataKodu, "");
    assert.ok(x.ders.kartDersSonrakiDeneme > new Date());
});

test("Konu veya kart kaynakları sürekli geçersizse sonsuz çağrı yapmadan durum gösterir", async () => {
    const x = kur();
    await kartOtomatikUretiminiBaslat(x.args, {
        DersModel: x.DersModel, devreDisiBirak: true,
    });
    let deneme = 0;
    for (let i = 0; i < 4; i++) {
        x.ders.kartDersSonrakiDeneme = new Date(Date.now() - 1);
        await kartOtomatikUretiminiCalistir(x.args, {
            DersModel: x.DersModel,
            uret: async () => {
                deneme++;
                return { tamamlandi: false, kotaEngeli: false,
                    islenenGrupSayisi: 0, toplamGrupSayisi: 3 };
            },
        });
    }
    assert.equal(deneme, 4);
    assert.equal(x.ders.kartDersOtomatikAktif, false);
    assert.equal(x.ders.kartDersOtomatikHataKodu, "KART_URETIM_DOGRULANAMADI");
    const durum = await calismaKartlariDurumunuGetir(x.args, {
        DersModel: x.DersModel, KartModel: x.KartModel,
    });
    assert.deepEqual(durum.kartlar, []);
    assert.ok(durum.uretimHatasi);
});

test("Üretimde gerçek ilerleme varsa geçici hatalar kalıcı sayılmaz", async () => {
    const x = kur();
    await kartOtomatikUretiminiBaslat(x.args, {
        DersModel: x.DersModel, devreDisiBirak: true,
    });
    x.ders.kartDersDenemeSayisi = 3;
    await kartOtomatikUretiminiCalistir(x.args, {
        DersModel: x.DersModel,
        uret: async () => ({
            tamamlandi: false, kotaEngeli: false, islenenGrupSayisi: 1,
            toplamGrupSayisi: 3,
        }),
    });
    assert.equal(x.ders.kartDersOtomatikAktif, true);
    assert.equal(x.ders.kartDersDenemeSayisi, 1);
});

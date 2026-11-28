import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { createHash } from "node:crypto";
import { dersGeneliKartlariOlustur } from "../services/dersKartService.js";
import { calismaKartlariDurumunuGetir, calismaKartiDurumuGuncelle } from "../services/calismaKartiService.js";

const q = (value) => ({
    sort() { return this; }, select() { return this; },
    lean() { return Promise.resolve(typeof value === "function" ? value() : value); },
});
const kur = ({ uret, kayitli = [], buyuk = false } = {}) => {
    const kullaniciId = new mongoose.Types.ObjectId(), dersId = new mongoose.Types.ObjectId();
    const materyalId = new mongoose.Types.ObjectId(), islemeId = new mongoose.Types.ObjectId();
    const ders = { _id: dersId, kullaniciId, dersAdi: "Uygulamalı Veri Bilimi", aciklama: "Ders açıklaması",
        materyallerOnaylandi: true, kartUretimToken: null, kartDersSurumImzasi: "",
        kartDersIslenenGrupImzalari: [], kartDersTamamlandi: false };
    const materyaller = [{ _id: materyalId, aktifIslemeId: islemeId, dosyaAdi: "Hafta.pdf" }];
    const parcalar = [0, 1].map((i) => ({
        materyalId, islemeId, parcaIndex: i,
        icerik: ("Dersin " + i + ". kavramı. ").repeat(buyuk ? 400 : 100),
    }));
    const harita = { parcaAtamaSurumu: 1,
        anaKonular: [{ konuId: "top-1", baslik: "Ana", altKonular: [
            { konuId: "sub-1", baslik: "Veri" }, { konuId: "sub-2", baslik: "Model" },
        ] }],
        parcaKonuAtamalari: parcalar.map((p, i) => ({ ...p, konuIds: ["sub-" + (i + 1)] })),
    };
    const kartlar = [...kayitli], cagrilar = [], sorgular = [];
    let yazmaSayisi = 0;
    const deps = {
        DersModel: {
            findOne(f) {
                if (f.kartUretimToken != null && String(f.kartUretimToken) !== String(ders.kartUretimToken)) return q(null);
                return q(ders);
            },
            async findOneAndUpdate(_f, g) {
                if (ders.kartUretimToken != null) return null;
                Object.assign(ders, g.$set || {});
                return ders;
            },
            async updateOne(f, g) {
                if (String(f.kartUretimToken) !== String(ders.kartUretimToken)) return { matchedCount: 0 };
                Object.assign(ders, g.$set || {});
                for (const [key, value] of Object.entries(g.$addToSet || {}))
                    ders[key] = [...new Set([...(ders[key] || []), value])];
                return { matchedCount: 1 };
            },
        },
        MateryalModel: { find(f) { sorgular.push(f); return q(materyaller); } },
        ParcaModel: { find(f) { sorgular.push(f); return q(parcalar); } },
        KonuHaritasiModel: { findOne(f) { sorgular.push(f); return q(harita); } },
        KartModel: {
            find() { return q(() => [...kartlar]); },
            findOne(f) { return q(kartlar.find(k => String(k._id) === String(f._id))); },
            async bulkWrite(ops) {
                yazmaSayisi++;
                let upsertedCount = 0;
                for (const op of ops) {
                    assert.deepEqual(Object.keys(op.updateOne.update), ["$setOnInsert"]);
                    const k = op.updateOne.update.$setOnInsert;
                    if (!kartlar.some((old) => old.soruKimligi === k.soruKimligi && old.konuId === k.konuId)) {
                        kartlar.push({ _id: new mongoose.Types.ObjectId(), ...k });
                        upsertedCount++;
                    }
                }
                return { upsertedCount };
            },
            findOneAndUpdate(f, g) {
                const kart = kartlar.find((k) => String(k._id) === String(f._id));
                if (kart) {
                    Object.assign(kart, g.$set);
                    if (g.$inc?.__v) kart.__v = (kart.__v ?? 0) + g.$inc.__v;
                }
                return q(kart);
            },
        },
        async uret(args) {
            cagrilar.push(args);
            return uret ? uret(args) : { kartlar: args.grup.kaynaklar.map((k) => ({
                soru: "Kaynak " + k.kod + " nedir?", cevap: "Metinde açıklanan gerçek bilgi.",
                konuId: k.konuIds[0], 
            })) };
        },
    };
    return { args: { kullaniciId, dersId }, deps, ders, kartlar, parcalar, harita, sorgular,
        cagrilar, getYazmaSayisi: () => yazmaSayisi };
};

test("bütün ders tek üretimle kaydedilir; ikinci çağrı tekrar Gemini isteği göndermez", async () => {
    const x = kur();
    const ilk = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(ilk.tamamlandi, true);
    assert.equal(ilk.kartlar.length, 2);
    assert.equal(ilk.toplamGrupSayisi, 1);
    assert.equal(x.cagrilar.length, 1);
    assert.equal(x.getYazmaSayisi(), 1);
    assert.equal(x.cagrilar[0].dersAdi, "Uygulamalı Veri Bilimi");
    assert.deepEqual(ilk.kartlar.map((k) => k.konuId), ["sub-1", "sub-2"]);
    assert.deepEqual(ilk.kartlar.map((k) => k.kaynaklar[0].kod), ["K1", "K2"]);
    for (const sorgu of x.sorgular) {
        assert.equal(sorgu.kullaniciId, x.args.kullaniciId);
        assert.equal(sorgu.dersId, x.args.dersId);
    }
    assert.deepEqual(x.sorgular[1].$or, [{ materyalId: x.parcalar[0].materyalId, islemeId: x.parcalar[0].islemeId }]);
    const ikinci = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(ikinci.yeniKartSayisi, 0);
    assert.equal(x.cagrilar.length, 1);
    assert.equal((await calismaKartlariDurumunuGetir(x.args, x.deps)).kartlar.length, 2);
});

test("büyük derste her grup bir kez üretilir; üretim sürerken hiçbir kart gösterilmez", async () => {
    let x;
    x = kur({ buyuk: true, uret: async ({ grup }) => {
        const durum = await calismaKartlariDurumunuGetir(x.args, x.deps);
        assert.deepEqual(durum.kartlar, []);
        assert.equal(durum.uretimSuruyor, true);
        assert.equal(durum.tamamlandi, false);
        return { kartlar: [{ soru: "Grup " + grup.sira, cevap: "Yanıt",
            konuId: grup.kaynaklar[0].konuIds[0],  }] };
    } });
    const sonuc = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(sonuc.toplamGrupSayisi, 2);
    assert.equal(x.cagrilar.length, 2);
    assert.equal((await calismaKartlariDurumunuGetir(x.args, x.deps)).kartlar.length, 2);
});

test("başarısız büyük derste ara kayıtlar gizlidir; yeniden başlatılınca yalnız eksik grup üretilir", async () => {
    let hataVer = true;
    const x = kur({ buyuk: true, uret: async ({ grup }) => {
        if (grup.sira === 2 && hataVer) throw Object.assign(new Error("Geçici hata"), { status: 503 });
        return { kartlar: [{ soru: "Grup " + grup.sira, cevap: "Yanıt",
            konuId: grup.kaynaklar[0].konuIds[0],  }] };
    } });
    assert.equal((await dersGeneliKartlariOlustur(x.args, x.deps)).tamamlandi,false);
    assert.equal(x.kartlar.length, 1);
    assert.equal(x.ders.kartUretimToken, null);
    assert.deepEqual((await calismaKartlariDurumunuGetir(x.args, x.deps)).kartlar, []);
    hataVer = false;
    const sonuc = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(sonuc.tamamlandi, true);
    assert.equal(sonuc.kartlar.length, 2);
    assert.deepEqual(x.cagrilar.map((c) => c.grup.sira).sort(), [1, 2, 2]);
});

test("mevcut kartın yıldızı, görülme durumu ve zorluk geçmişi yeniden kayıtta korunur", async () => {
    const eski = { _id: new mongoose.Types.ObjectId(), konuId: "sub-1", konuBasligi: "Veri",
        soru: "Kaynak K1 nedir?", cevap: "Önceden kaydedilmiş yanıt", goruldu: true, yildizli: true, zorluk: "zor",
        soruKimligi: createHash("sha256").update("Kaynak K1 nedir?".toLocaleLowerCase("tr-TR")).digest("hex") };
    const x = kur({ kayitli: [eski] });
    const sonuc = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(sonuc.kartlar.length, 2);
    assert.equal(sonuc.yeniKartSayisi, 1);
    assert.strictEqual(sonuc.kartlar[0], eski);
    assert.equal(eski.goruldu, true);
    assert.equal(eski.yildizli, true);
    assert.equal(eski.zorluk, "zor");
    assert.equal(eski.cevap, "Önceden kaydedilmiş yanıt");
});

test("yeni materyal metniyle üretimde eski kartlar silinmez", async () => {
    const x = kur();
    await dersGeneliKartlariOlustur(x.args, x.deps);
    x.parcalar[0].icerik += " Yeni kavram.";
    const sonuc = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(sonuc.tamamlandi, true);
    assert.equal(x.cagrilar.length, 2);
    assert.equal(x.kartlar.length, 2);
});

test("geçersiz konu kimliği geçerli kartları engellemez; ek AI çağrısı yoktur",async()=>{
    const x=kur({uret:async()=>({kartlar:[
        {soru:"Geçerli?",cevap:"Yanıt",konuId:"sub-1"},
        {soru:"Geçersiz?",cevap:"Yanıt",konuId:"uydurma"},
    ]})});
    const sonuc=await dersGeneliKartlariOlustur(x.args,x.deps);
    assert.equal(sonuc.tamamlandi,true);
    assert.equal(sonuc.kartlar.length,1);
    assert.equal(sonuc.gecersizKartSayisi,1);
    assert.equal(x.cagrilar.length,1);
});

test("konu haritası eksikse AI çağrısı, sınıflandırma ve kayıt yapılmaz", async () => {
    const x = kur();
    x.harita.parcaAtamaSurumu = 0;
    await assert.rejects(dersGeneliKartlariOlustur(x.args, x.deps), { kod: "KART_KONU_KAYNAGI_EKSIK" });
    assert.equal(x.cagrilar.length, 0);
    assert.equal(x.getYazmaSayisi(), 0);
    assert.equal(x.ders.kartUretimToken, null);
});

test("kayıt hatasında tamamlandı işareti açılmaz ve kartlar sunulmaz", async () => {
    const x = kur();
    x.deps.KartModel.bulkWrite = async () => { throw new Error("DB yazılamadı"); };
    assert.equal((await dersGeneliKartlariOlustur(x.args, x.deps)).tamamlandi,false);
    assert.equal(x.ders.kartDersTamamlandi, false);
    assert.equal(x.ders.kartDersIslenenGrupImzalari.length, 0);
    assert.deepEqual((await calismaKartlariDurumunuGetir(x.args, x.deps)).kartlar, []);
});

test("kilit kaybedilince kartlar kaydedilmez", async () => {
    let x;
    x = kur({ uret: async () => {
        x.ders.kartUretimToken = new mongoose.Types.ObjectId();
        return { kartlar: [{ soru: "Soru", cevap: "Yanıt", konuId: "sub-1", kaynakKodlari: ["P1"] }] };
    } });
    await assert.rejects(dersGeneliKartlariOlustur(x.args, x.deps), { status:409 });
    assert.equal(x.getYazmaSayisi(), 0);
});

test("öğrenci kart durumunu güncelleyebilir", async () => {
    const x = kur();
    const sonuc = await dersGeneliKartlariOlustur(x.args, x.deps);
    const kartId = sonuc.kartlar[0]._id;
    const yeni = await calismaKartiDurumuGuncelle({ ...x.args, kartId, goruldu: true, zorluk: "zor", surum: 0 }, x.deps);
    assert.equal(yeni.goruldu, true);
    assert.equal(yeni.zorluk, "zor");
    await assert.rejects(calismaKartiDurumuGuncelle({ ...x.args, kartId, zorluk: "gecersiz" }, x.deps), { status: 400 });
});

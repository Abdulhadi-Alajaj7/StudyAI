import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { dersGeneliKartlariOlustur } from "../services/dersKartService.js";
import {
    calismaKartlariDurumunuGetir, calismaKartiDurumuGuncelle,
} from "../services/calismaKartiService.js";

const q = (value) => ({
    sort() { return this; }, select() { return this; },
    lean() { return Promise.resolve(typeof value === "function" ? value() : value); },
});
const kur = ({ uret, kayitli = [], metinler = [] } = {}) => {
    const kullaniciId = new mongoose.Types.ObjectId();
    const dersId = new mongoose.Types.ObjectId();
    const materyalId = new mongoose.Types.ObjectId();
    const islemeId = new mongoose.Types.ObjectId();
    const ders = {
        _id: dersId, kullaniciId, dersAdi: "Uygulamalı Veri Bilimi",
        materyallerOnaylandi: true, kartUretimToken: null,
        kartDersSurumImzasi: "", kartDersToplamGrupSayisi: 0,
        kartDersIslenenGrupImzalari: [], kartDersTamamlandi: false,
    };
    const materyaller = [{ _id: materyalId, aktifIslemeId: islemeId, dosyaAdi: "Hafta.pdf" }];
    const parcalar = metinler.length ? metinler : [
        { materyalId, islemeId, parcaIndex: 0, icerik: "MCAR veri yokluğunun türüdür." },
        { materyalId, islemeId, parcaIndex: 1, icerik: "Naive Bayes olasılık temellidir." },
    ];
    const kartlar = [...kayitli];
    let istekler = 0;
    const deps = {
        DersModel: {
            findOne(f) {
                if (f.kartUretimToken != null &&
                    String(f.kartUretimToken) !== String(ders.kartUretimToken))
                    return q(null);
                return q(ders);
            },
            async findOneAndUpdate(_f, g) {
                if (ders.kartUretimToken != null) return null;
                Object.assign(ders, g.$set || {});
                return ders;
            },
            async updateOne(f, g) {
                if (String(f.kartUretimToken) !== String(ders.kartUretimToken))
                    return { matchedCount: 0 };
                Object.assign(ders, g.$set || {});
                for (const [key, value] of Object.entries(g.$addToSet || {}))
                    ders[key] = [...new Set([...(ders[key] || []), value])];
                return { matchedCount: 1 };
            },
        },
        MateryalModel: { find() { return q(materyaller); } },
        ParcaModel: { find() { return q(parcalar); } },
        KartModel: {
            find() { return q(() => [...kartlar]); },
            async bulkWrite(ops) {
                for (const op of ops) {
                    const k = op.updateOne.update.$setOnInsert;
                    if (!kartlar.some((old) => old.soruKimligi === k.soruKimligi))
                        kartlar.push({ _id: new mongoose.Types.ObjectId(), ...k });
                }
            },
            findOneAndUpdate(f, g) {
                const i = kartlar.findIndex((k) => String(k._id) === String(f._id));
                if (i !== -1) Object.assign(kartlar[i], g.$set);
                return q(i < 0 ? null : kartlar[i]);
            },
        },
        gruplama: (_parcalar, mats) => [
            { sira: 1, imza: "grup1",
                kaynaklar: [{ kod: "K1", materyalId: mats[0]._id,
                    dosyaAdi: "Hafta.pdf", parcaIndex: 0 }],
                metin: "[K1] MCAR eksik veri" },
            { sira: 2, imza: "grup2",
                kaynaklar: [{ kod: "K2", materyalId: mats[0]._id,
                    dosyaAdi: "Hafta.pdf", parcaIndex: 1 }],
                metin: "[K2] Naive Bayes olasılık" },
        ],
        async uret(args) {
            istekler++;
            return uret ? uret(args) : { kartlar: [{
                soru: "Bu ders bölümünün temel bilgisi " + args.grup.sira + " nedir?",
                cevap: "Metinde açıklanan gerçek bilgi.", kaynakKodlari: [args.grup.kaynaklar[0].kod],
            }] };
        },
    };
    return { args: { kullaniciId, dersId }, deps, ders, kartlar, parcalar,
        getIstekler: () => istekler };
};

test("Yeni sistem iki metin grubunu konu haritası olmadan üretir, ikinci tıklamada tekrar üretmez", async () => {
    const x = kur();
    const ilk = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(ilk.tamamlandi, true);
    assert.equal(ilk.kartlar.length, 2);
    assert.equal(ilk.islenenGrupSayisi, 2);
    assert.equal(x.getIstekler(), 2);
    assert.ok(ilk.kartlar.every((k) => !k.konuId && !k.konuBasligi));
    const ikinci = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(ikinci.yeniKartSayisi, 0);
    assert.equal(x.getIstekler(), 2);
    const durum = await calismaKartlariDurumunuGetir(x.args, x.deps);
    assert.equal(durum.dersKartTamamlandi, true);
});

test("503 sonrası kaydedilenler silinmez, yalnız eksik grup yeniden denenir", async () => {
    let deneme = 0;
    const x = kur({ uret: async ({ grup }) => {
        if (grup.sira === 2 && deneme++ === 0)
            throw Object.assign(new Error("Service unavailable"), { status: 503 });
        return { kartlar: [{
            soru: "Kaynak " + grup.sira + " önemli bilgi nasıl açıklanır?",
            cevap: "Ders materyalinde açıklanmaktadır.",
            kaynakKodlari: [grup.kaynaklar[0].kod],
        }] };
    } });
    const ilk = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(ilk.tamamlandi, false);
    assert.equal(ilk.kartlar.length, 1);
    assert.equal(ilk.islenenGrupSayisi, 1);
    const ikinci = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(ikinci.tamamlandi, true);
    assert.equal(ikinci.kartlar.length, 2);
    assert.equal(x.ders.kartDersIslenenGrupImzalari.length, 2);
});

test("Eski konuya bağlı kartlar silinmeden yeni konu bağımsız kartlar eklenir", async () => {
    const eski = {
        _id: new mongoose.Types.ObjectId(), konuId: "eski-konu", konuBasligi: "Eski",
        soru: "Eski soru?", cevap: "Eski yanıt", goruldu: true, yildizli: true,
    };
    const x = kur({ kayitli: [eski] });
    const sonuc = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(sonuc.kartlar.length, 3);
    assert.strictEqual(sonuc.kartlar[0], eski);
    assert.equal(sonuc.kartlar[0].goruldu, true);
    assert.equal(sonuc.kartlar[0].yildizli, true);
});

test("Yeni materyal metniyle tekrar tarama yapılırken eski kartlara dokunulmaz", async () => {
    const x = kur();
    await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(x.getIstekler(), 2);
    x.parcalar[0].icerik += " Yeni kavram açıklaması.";
    const yeni = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(yeni.tamamlandi, true);
    assert.equal(x.getIstekler(), 4);
    assert.equal(x.kartlar.length, 2);
});

test("Geçersiz kaynak kodu olan Gemini yanıtı tamamlandı sayılmaz", async () => {
    const x = kur({ uret: async () => ({ kartlar: [{
        soru: "Sahte kaynak kodu nedir?", cevap: "Kaynağı yok.", kaynakKodlari: ["K999"],
    }] }) });
    const sonuc = await dersGeneliKartlariOlustur(x.args, x.deps);
    assert.equal(sonuc.tamamlandi, false);
    assert.equal(sonuc.kartlar.length, 0);
    assert.equal(sonuc.islenenGrupSayisi, 0);
});

test("Öğrencinin kart çalışma durumu kayıtlı ders kartında güncellenir", async () => {
    const x = kur();
    const sonuc = await dersGeneliKartlariOlustur(x.args, x.deps);
    const k = sonuc.kartlar[0];
    const yeni = await calismaKartiDurumuGuncelle({
        ...x.args, kartId: k._id, goruldu: true, zorluk: "zor",
    }, x.deps);
    assert.equal(yeni.goruldu, true);
    assert.equal(yeni.zorluk, "zor");
    await assert.rejects(
        calismaKartiDurumuGuncelle({ ...x.args, kartId: k._id, zorluk: "gecersiz" }, x.deps),
        (e) => e.status === 400
    );
});

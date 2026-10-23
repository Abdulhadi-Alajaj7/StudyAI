import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import DersOzeti from "../models/DersOzeti.js";
import { dersOzetiGirdisiniDogrula } from "../controllers/dersOzetiController.js";
import {
    dengeliOzetParcalariniSec,
    dersOzetiOlustur,
    kayitliDersOzetiniGetir,
} from "../services/dersOzetiService.js";

const kullaniciId = new mongoose.Types.ObjectId();
const dersId = new mongoose.Types.ObjectId();
const materyalId = new mongoose.Types.ObjectId();
const islemeId = new mongoose.Types.ObjectId();

const zincir = (deger) => ({
    select() { return this; },
    sort() { return this; },
    async lean() { return deger; },
});

const ozetIcerigi = (genelBakis) => ({
    genelBakis,
    temelKavramlar: [],
    onemliNoktalar: [],
    konularArasiIliskiler: [],
    ornekler: [],
    sinavIcinOnemli: [],
});

const bagimliliklariOlustur = ({
    ilkOzet = null,
    geminiOzetUret,
    materyaller = [{
        _id: materyalId,
        orijinalDosyaAdi: "ders.pdf",
        dosyaAdi: "ders.pdf",
        durum: "hazir",
        aktifIslemeId: islemeId,
    }],
    metinParcalari = [
        {
            _id: new mongoose.Types.ObjectId(),
            materyalId,
            islemeId,
            parcaIndex: 0,
            icerik: "Yığın LIFO ilkesiyle çalışan bir veri yapısıdır.",
        },
        {
            _id: new mongoose.Types.ObjectId(),
            materyalId,
            islemeId,
            parcaIndex: 1,
            icerik: "Kuyruk FIFO ilkesiyle çalışır.",
        },
    ],
    konuHaritasi = null,
    semanticArama = async () => ({ sonuclar: [] }),
} = {}) => {
    let ozet = ilkOzet ? { ...ilkOzet } : null;

    const DersOzetiModel = {
        findOne(filtre) {
            const sonuc = ozet && (!filtre.basarili || ozet.basarili)
                ? { ...ozet }
                : null;
            return zincir(sonuc);
        },
        async updateOne(filtre, guncelleme) {
            if (guncelleme.$setOnInsert) {
                if (!ozet) {
                    ozet = {
                        _id: new mongoose.Types.ObjectId(),
                        ...guncelleme.$setOnInsert,
                        aktifIslemToken: null,
                        kilitSonYenilemeTarihi: null,
                    };
                }
                return { matchedCount: 1 };
            }
            if (
                !ozet ||
                (filtre._id && String(filtre._id) !== String(ozet._id)) ||
                (filtre.aktifIslemToken &&
                    String(filtre.aktifIslemToken) !== String(ozet.aktifIslemToken))
            ) {
                return { matchedCount: 0 };
            }
            Object.assign(ozet, guncelleme.$set || {});
            if (guncelleme.$currentDate) ozet.kilitSonYenilemeTarihi = new Date();
            return { matchedCount: 1 };
        },
        async findOneAndUpdate(filtre, guncelleme) {
            if (!ozet) return null;
            if (filtre.$or) {
                if (ozet.aktifIslemToken != null) return null;
            } else if (
                filtre.aktifIslemToken &&
                String(filtre.aktifIslemToken) !== String(ozet.aktifIslemToken)
            ) {
                return null;
            }
            Object.assign(ozet, guncelleme.$set || {});
            return { ...ozet };
        },
    };

    return {
        bagimliliklar: {
            DersModel: {
                findOne() {
                    return zincir({ _id: dersId, dersAdi: "Veri Yapıları", aciklama: "" });
                },
            },
            MateryalModel: {
                findOne(filtre) {
                    const materyal = materyaller.find((aday) => (
                        String(aday._id) === String(filtre._id)
                    ));
                    return zincir(materyal || null);
                },
                find(filtre) {
                    const izinliIds = filtre._id?.$in
                        ? new Set(filtre._id.$in.map(String))
                        : null;
                    return zincir(materyaller.filter((materyal) => (
                        !izinliIds || izinliIds.has(String(materyal._id))
                    )));
                },
            },
            MetinParcasiModel: {
                find(filtre) {
                    const surumler = new Set((filtre.$or || []).map(
                        (surum) => `${surum.materyalId}:${surum.islemeId}`
                    ));
                    return zincir(metinParcalari.filter((parca) => (
                        surumler.has(`${parca.materyalId}:${parca.islemeId}`)
                    )));
                },
            },
            KonuHaritasiModel: {
                findOne() { return zincir(konuHaritasi); },
            },
            DersOzetiModel,
            semanticArama,
            geminiOzetUret,
            kaynakButcesi: 40_000,
            batchButcesi: 15_000,
        },
        ozetGetir: () => ozet,
    };
};

test("DersOzeti modeli son başarılı kombinasyon için benzersiz indeks ve gerekli alanları taşır", () => {
    for (const alan of [
        "kullaniciId",
        "dersId",
        "tur",
        "hedefAnahtari",
        "uzunluk",
        "icerik",
        "kullanilanKaynaklar",
        "kaynakSurumleri",
        "olusturulmaTarihi",
        "aktifIslemToken",
    ]) {
        assert.ok(DersOzeti.schema.path(alan), `${alan} alanı bulunmalı`);
    }

    const indeks = DersOzeti.schema.indexes().find(([alanlar]) => (
        alanlar.kullaniciId === 1 &&
        alanlar.dersId === 1 &&
        alanlar.tur === 1 &&
        alanlar.hedefAnahtari === 1 &&
        alanlar.uzunluk === 1
    ));
    assert.ok(indeks);
    assert.equal(indeks[1].unique, true);
});

test("özet API girdisi tür, hedef ve uzunluk kombinasyonunu doğrular", () => {
    assert.deepEqual(
        dersOzetiGirdisiniDogrula(String(dersId), { tur: "tum_ders", uzunluk: "kisa" }),
        { tur: "tum_ders", uzunluk: "kisa", materyalId: null, konuId: "" }
    );
    assert.equal(
        dersOzetiGirdisiniDogrula(String(dersId), {
            tur: "materyal",
            uzunluk: "orta",
            materyalId: "gecersiz",
        }).kod,
        "GECERSIZ_MATERYAL_ID"
    );
    assert.equal(
        dersOzetiGirdisiniDogrula(String(dersId), {
            tur: "konu",
            uzunluk: "uzun",
        }).kod,
        "GECERSIZ_KONU_ID"
    );
});

test("kaynak sınırında her materyalden belge boyunca dengeli parça seçer", () => {
    const ikinciMateryal = new mongoose.Types.ObjectId();
    const parcalar = [materyalId, ikinciMateryal].flatMap((id) => (
        Array.from({ length: 8 }, (_, parcaIndex) => ({
            _id: new mongoose.Types.ObjectId(),
            materyalId: id,
            parcaIndex,
            icerik: "x".repeat(100),
        }))
    ));

    const secilen = dengeliOzetParcalariniSec(parcalar, 400);
    assert.deepEqual(new Set(secilen.map((parca) => String(parca.materyalId))).size, 2);
    assert.ok(secilen.some((parca) => parca.parcaIndex >= 4));
    assert.ok(secilen.reduce((toplam, parca) => toplam + parca.icerik.length, 0) <= 400);
});

test("eşzamanlı aynı özet isteğinde yalnızca bir Gemini üretimi başlar", async () => {
    let geminiCagrisi = 0;
    let geminiyiBaslat;
    let geminiyiBitir;
    const basladi = new Promise((resolve) => { geminiyiBaslat = resolve; });
    const bekleme = new Promise((resolve) => { geminiyiBitir = resolve; });
    const { bagimliliklar } = bagimliliklariOlustur({
        geminiOzetUret: async () => {
            geminiCagrisi += 1;
            geminiyiBaslat();
            await bekleme;
            return { icerik: ozetIcerigi("Yeni özet"), model: "test-model" };
        },
    });
    const girdi = {
        kullaniciId,
        dersId,
        tur: "tum_ders",
        uzunluk: "orta",
    };

    const ilkIstek = dersOzetiOlustur(girdi, bagimliliklar);
    await basladi;
    await assert.rejects(
        dersOzetiOlustur(girdi, bagimliliklar),
        (hata) => hata.status === 409 && hata.kod === "OZET_OLUSTURULUYOR"
    );
    geminiyiBitir();
    const sonuc = await ilkIstek;

    assert.equal(geminiCagrisi, 1);
    assert.equal(sonuc.ozet.icerik.genelBakis, "Yeni özet");
});

test("özet üretilirken tüm ders kaynak kapsamı değişirse sonuç kaydedilmez", async () => {
    const materyaller = [{
        _id: materyalId,
        orijinalDosyaAdi: "ders.pdf",
        durum: "hazir",
        aktifIslemeId: islemeId,
    }];
    const { bagimliliklar, ozetGetir } = bagimliliklariOlustur({
        materyaller,
        geminiOzetUret: async () => {
            materyaller.push({
                _id: new mongoose.Types.ObjectId(),
                orijinalDosyaAdi: "yeni.pdf",
                durum: "hazir",
                aktifIslemeId: new mongoose.Types.ObjectId(),
            });
            return { icerik: ozetIcerigi("Eksik kapsam"), model: "test-model" };
        },
    });

    await assert.rejects(
        dersOzetiOlustur({
            kullaniciId,
            dersId,
            tur: "tum_ders",
            uzunluk: "orta",
        }, bagimliliklar),
        (hata) => hata.status === 409 && hata.kod === "KAYNAK_SURUMU_DEGISTI"
    );
    assert.equal(ozetGetir().basarili, false);
    assert.equal(ozetGetir().aktifIslemToken, null);
});

test("materyal özeti yalnızca seçilen materyalin aktif parçalarını kullanır", async () => {
    const digerMateryalId = new mongoose.Types.ObjectId();
    const digerIslemeId = new mongoose.Types.ObjectId();
    let geminiGirdisi;
    const { bagimliliklar } = bagimliliklariOlustur({
        materyaller: [
            {
                _id: materyalId,
                orijinalDosyaAdi: "secilen.pdf",
                durum: "hazir",
                aktifIslemeId: islemeId,
            },
            {
                _id: digerMateryalId,
                orijinalDosyaAdi: "diger.pdf",
                durum: "hazir",
                aktifIslemeId: digerIslemeId,
            },
        ],
        metinParcalari: [
            { materyalId, islemeId, parcaIndex: 0, icerik: "Seçilen içerik" },
            { materyalId: digerMateryalId, islemeId: digerIslemeId, parcaIndex: 0, icerik: "Diğer içerik" },
        ],
        geminiOzetUret: async (girdi) => {
            geminiGirdisi = girdi;
            return { icerik: ozetIcerigi("Materyal özeti"), model: "test-model" };
        },
    });

    const sonuc = await dersOzetiOlustur({
        kullaniciId,
        dersId,
        tur: "materyal",
        materyalId,
        uzunluk: "kisa",
    }, bagimliliklar);

    assert.match(geminiGirdisi.kaynakMetni, /Seçilen içerik/);
    assert.doesNotMatch(geminiGirdisi.kaynakMetni, /Diğer içerik/);
    assert.deepEqual(
        sonuc.ozet.kullanilanKaynaklar.map((kaynak) => String(kaynak.materyalId)),
        [String(materyalId)]
    );
});

test("konu özeti konu haritası kaynaklarıyla sınırlı semantic search kullanır", async () => {
    const digerMateryalId = new mongoose.Types.ObjectId();
    const digerIslemeId = new mongoose.Types.ObjectId();
    let aramaGirdisi;
    const { bagimliliklar } = bagimliliklariOlustur({
        materyaller: [
            {
                _id: materyalId,
                orijinalDosyaAdi: "yigin.pdf",
                durum: "hazir",
                aktifIslemeId: islemeId,
            },
            {
                _id: digerMateryalId,
                orijinalDosyaAdi: "graf.pdf",
                durum: "hazir",
                aktifIslemeId: digerIslemeId,
            },
        ],
        metinParcalari: [
            { materyalId, islemeId, parcaIndex: 0, icerik: "Yığın işlemleri" },
            { materyalId: digerMateryalId, islemeId: digerIslemeId, parcaIndex: 0, icerik: "Graf işlemleri" },
        ],
        konuHaritasi: {
            anaKonular: [{
                konuId: "top-veri-yapilari",
                baslik: "Veri Yapıları",
                aciklama: "Temel yapılar",
                kaynakMateryalIds: [materyalId],
                altKonular: [{
                    konuId: "sub-yigin",
                    baslik: "Yığın",
                    aciklama: "LIFO işlemleri",
                    kaynakMateryalIds: [materyalId],
                }],
            }],
        },
        semanticArama: async (girdi) => {
            aramaGirdisi = girdi;
            return {
                sonuclar: [{
                    materyalId: String(materyalId),
                    parcaIndex: 0,
                    icerik: "Yığın işlemleri",
                }],
            };
        },
        geminiOzetUret: async () => ({
            icerik: ozetIcerigi("Konu özeti"),
            model: "test-model",
        }),
    });

    const sonuc = await dersOzetiOlustur({
        kullaniciId,
        dersId,
        tur: "konu",
        konuId: "sub-yigin",
        uzunluk: "orta",
    }, bagimliliklar);

    assert.deepEqual(aramaGirdisi.materyalIds.map(String), [String(materyalId)]);
    assert.equal(sonuc.ozet.konuId, "sub-yigin");
    assert.equal(sonuc.ozet.konuBasligi, "Yığın");
    assert.deepEqual(
        sonuc.ozet.kullanilanKaynaklar.map((kaynak) => String(kaynak.materyalId)),
        [String(materyalId)]
    );
});

test("yeniden üretim hatasında önceki başarılı özet korunur ve kilit bırakılır", async () => {
    const eskiIcerik = ozetIcerigi("Korunacak özet");
    const { bagimliliklar, ozetGetir } = bagimliliklariOlustur({
        ilkOzet: {
            _id: new mongoose.Types.ObjectId(),
            kullaniciId,
            dersId,
            tur: "tum_ders",
            hedefAnahtari: "ders",
            uzunluk: "orta",
            basarili: true,
            icerik: eskiIcerik,
            aktifIslemToken: null,
            kilitSonYenilemeTarihi: null,
        },
        geminiOzetUret: async () => {
            throw Object.assign(new Error("Gemini geçici hata"), {
                status: 503,
                kod: "GEMINI_GECICI_HATA",
            });
        },
    });

    await assert.rejects(
        dersOzetiOlustur({
            kullaniciId,
            dersId,
            tur: "tum_ders",
            uzunluk: "orta",
            yenidenOlustur: true,
        }, bagimliliklar),
        (hata) => hata.status === 503
    );

    assert.deepEqual(ozetGetir().icerik, eskiIcerik);
    assert.equal(ozetGetir().basarili, true);
    assert.equal(ozetGetir().aktifIslemToken, null);
});

test("kayıtlı materyal özeti yalnızca kaynak aktif sürümü değişmediğinde döner", async () => {
    const materyaller = [{
        _id: materyalId,
        orijinalDosyaAdi: "ders.pdf",
        dosyaAdi: "ders.pdf",
        durum: "hazir",
        aktifIslemeId: islemeId,
    }];
    const eskiOzet = {
        _id: new mongoose.Types.ObjectId(),
        kullaniciId,
        dersId,
        tur: "materyal",
        hedefAnahtari: String(materyalId),
        materyalId,
        uzunluk: "orta",
        basarili: true,
        icerik: ozetIcerigi("Eski özet"),
        kullanilanKaynaklar: [{ materyalId, aktifIslemeId: islemeId, dosyaAdi: "ders.pdf" }],
    };
    const { bagimliliklar, ozetGetir } = bagimliliklariOlustur({
        ilkOzet: eskiOzet,
        materyaller,
    });
    const girdi = {
        kullaniciId,
        dersId,
        tur: "materyal",
        materyalId,
        uzunluk: "orta",
    };

    const guncel = await kayitliDersOzetiniGetir(girdi, bagimliliklar);
    assert.equal(guncel.icerik.genelBakis, "Eski özet");

    materyaller[0].aktifIslemeId = new mongoose.Types.ObjectId();
    await assert.rejects(
        kayitliDersOzetiniGetir(girdi, bagimliliklar),
        (hata) => hata.status === 404 && hata.kod === "OZET_BULUNAMADI"
    );
    assert.equal(ozetGetir().basarili, true);
    assert.deepEqual(ozetGetir().icerik, eskiOzet.icerik);

    // Başarısız yeniden işleme aktif sürümü değiştirmez; eski özet silinmeden
    // yeniden kullanılabilir hale gelir.
    materyaller[0].aktifIslemeId = islemeId;
    const tekrarGuncel = await kayitliDersOzetiniGetir(girdi, bagimliliklar);
    assert.equal(tekrarGuncel.icerik.genelBakis, "Eski özet");
});

test("tüm ders özetinde kaynak kümesine yeni materyal eklenirse eski özet sunulmaz", async () => {
    const yeniMateryalId = new mongoose.Types.ObjectId();
    const yeniIslemeId = new mongoose.Types.ObjectId();
    const { bagimliliklar } = bagimliliklariOlustur({
        ilkOzet: {
            _id: new mongoose.Types.ObjectId(),
            kullaniciId,
            dersId,
            tur: "tum_ders",
            hedefAnahtari: "ders",
            uzunluk: "kisa",
            basarili: true,
            icerik: ozetIcerigi("Eksik kapsam"),
            kullanilanKaynaklar: [{ materyalId, aktifIslemeId: islemeId, dosyaAdi: "ders.pdf" }],
            kaynakSurumleri: [{ materyalId, aktifIslemeId: islemeId }],
        },
        materyaller: [
            {
                _id: materyalId,
                dosyaAdi: "ders.pdf",
                durum: "hazir",
                aktifIslemeId: islemeId,
            },
            {
                _id: yeniMateryalId,
                dosyaAdi: "ek.pdf",
                durum: "hazir",
                aktifIslemeId: yeniIslemeId,
            },
        ],
    });

    await assert.rejects(
        kayitliDersOzetiniGetir({
            kullaniciId,
            dersId,
            tur: "tum_ders",
            uzunluk: "kisa",
        }, bagimliliklar),
        (hata) => hata.status === 404 && hata.kod === "OZET_BULUNAMADI"
    );
});

test("konu özetinde kapsama dahil kaynak değişirse eski cache yerine yeni özet üretilir", async () => {
    const ikinciMateryalId = new mongoose.Types.ObjectId();
    const ikinciEskiIslemeId = new mongoose.Types.ObjectId();
    const ikinciYeniIslemeId = new mongoose.Types.ObjectId();
    const materyaller = [
        {
            _id: materyalId,
            dosyaAdi: "bir.pdf",
            durum: "hazir",
            aktifIslemeId: islemeId,
        },
        {
            _id: ikinciMateryalId,
            dosyaAdi: "iki.pdf",
            durum: "hazir",
            aktifIslemeId: ikinciYeniIslemeId,
        },
    ];
    let geminiCagrisi = 0;
    const { bagimliliklar } = bagimliliklariOlustur({
        ilkOzet: {
            _id: new mongoose.Types.ObjectId(),
            kullaniciId,
            dersId,
            tur: "konu",
            hedefAnahtari: "sub-yigin",
            konuId: "sub-yigin",
            uzunluk: "orta",
            basarili: true,
            icerik: ozetIcerigi("Eski konu özeti"),
            kullanilanKaynaklar: [{ materyalId, aktifIslemeId: islemeId, dosyaAdi: "bir.pdf" }],
            kaynakSurumleri: [
                { materyalId, aktifIslemeId: islemeId },
                { materyalId: ikinciMateryalId, aktifIslemeId: ikinciEskiIslemeId },
            ],
            aktifIslemToken: null,
        },
        materyaller,
        metinParcalari: [
            { materyalId, islemeId, parcaIndex: 0, icerik: "Yığın işlemleri" },
            { materyalId: ikinciMateryalId, islemeId: ikinciYeniIslemeId, parcaIndex: 0, icerik: "Yığın belleği" },
        ],
        konuHaritasi: {
            anaKonular: [{
                konuId: "top-veri",
                baslik: "Veri Yapıları",
                kaynakMateryalIds: [materyalId, ikinciMateryalId],
                altKonular: [{
                    konuId: "sub-yigin",
                    baslik: "Yığın",
                    aciklama: "LIFO",
                    kaynakMateryalIds: [materyalId, ikinciMateryalId],
                }],
            }],
        },
        geminiOzetUret: async () => {
            geminiCagrisi += 1;
            return { icerik: ozetIcerigi("Yeni konu özeti"), model: "test-model" };
        },
    });

    const sonuc = await dersOzetiOlustur({
        kullaniciId,
        dersId,
        tur: "konu",
        konuId: "sub-yigin",
        uzunluk: "orta",
    }, bagimliliklar);

    assert.equal(sonuc.onbellekten, false);
    assert.equal(geminiCagrisi, 1);
    assert.equal(sonuc.ozet.icerik.genelBakis, "Yeni konu özeti");
    assert.deepEqual(
        sonuc.ozet.kaynakSurumleri.map((kaynak) => String(kaynak.materyalId)),
        [String(materyalId), String(ikinciMateryalId)]
    );
});

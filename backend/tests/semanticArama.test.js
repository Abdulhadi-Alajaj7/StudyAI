import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
    dengeliAdayKimlikleriniSec,
    semanticAramaYap,
} from "../services/semanticAramaService.js";

const kullaniciId = new mongoose.Types.ObjectId();
const dersId = new mongoose.Types.ObjectId();
const materyal1 = new mongoose.Types.ObjectId();
const materyal2 = new mongoose.Types.ObjectId();
const aktif1 = new mongoose.Types.ObjectId();
const aktif2 = new mongoose.Types.ObjectId();

const zincir = (deger) => ({
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    async lean() { return deger; },
});

const varsayilanMateryaller = () => ([
    { _id: materyal1, orijinalDosyaAdi: "bir.pdf", aktifIslemeId: aktif1 },
    { _id: materyal2, orijinalDosyaAdi: "iki.docx", aktifIslemeId: aktif2 },
]);

const modeller = ({
    dersVar = true,
    parcalar = [],
    filtreYakala = () => {},
    ilkMateryaller = varsayilanMateryaller(),
    guncelMateryaller = ilkMateryaller,
} = {}) => {
    let materyalCagrisi = 0;
    return ({
    DersModel: {
        async findOne(filtre) {
            assert.equal(String(filtre.kullaniciId), String(kullaniciId));
            return dersVar ? { _id: dersId, kullaniciId } : null;
        }
    },
    MateryalModel: {
        find() {
            materyalCagrisi += 1;
            return zincir(materyalCagrisi === 1 ? ilkMateryaller : guncelMateryaller);
        }
    },
    MetinParcasiModel: {
        find(filtre) {
            filtreYakala(filtre);
            if (!filtre._id?.$in) return zincir(parcalar);
            const kimlikler = new Set(filtre._id.$in.map(String));
            return zincir(parcalar.filter((parca) => kimlikler.has(String(parca._id))));
        }
    },
    ayarlar: { model: "gemini-embedding-001", boyut: 3 },
    async embeddingUret() { return [[1, 0, 0]]; },
    });
};

test("yalnızca kullanıcıya ait dersin aktif materyal sürümlerini sorgular ve sonuçları skora göre sıralar", async () => {
    let kullanilanFiltre;
    const parcalar = [
        { _id: new mongoose.Types.ObjectId(), materyalId: materyal2, islemeId: aktif2, parcaIndex: 0, icerik: "Dengeli ağaçlar aramayı hızlandırır.", embedding: [0.8, 0.6, 0] },
        { _id: new mongoose.Types.ObjectId(), materyalId: materyal1, islemeId: aktif1, parcaIndex: 1, icerik: "İkili arama ağacında düğüm kökten başlanarak bulunur.", embedding: [1, 0, 0] },
        { _id: new mongoose.Types.ObjectId(), materyalId: materyal1, islemeId: aktif1, parcaIndex: 2, icerik: "Kuyruk FIFO ilkesiyle çalışır.", embedding: [0, 1, 0] },
    ];
    const bagimliliklar = modeller({ parcalar, filtreYakala: (filtre) => { kullanilanFiltre = filtre; } });

    const oncekiEsik = process.env.SEMANTIK_ARAMA_MIN_SKOR;
    process.env.SEMANTIK_ARAMA_MIN_SKOR = "-1";
    try {
        const sonuc = await semanticAramaYap({ kullaniciId, dersId, sorgu: "ağaçta eleman nasıl bulunur?", limit: 2 }, bagimliliklar);

        assert.equal(String(kullanilanFiltre.kullaniciId), String(kullaniciId));
        assert.equal(String(kullanilanFiltre.dersId), String(dersId));
        assert.deepEqual(
            kullanilanFiltre.$or.map((surum) => String(surum.islemeId)),
            [String(aktif1), String(aktif2)]
        );
        assert.equal(kullanilanFiltre.embeddingModel, "gemini-embedding-001");
        assert.deepEqual(sonuc.sonuclar.map((kayit) => kayit.icerik), [
            "İkili arama ağacında düğüm kökten başlanarak bulunur.",
            "Dengeli ağaçlar aramayı hızlandırır."
        ]);
        assert.equal(sonuc.sonuclar[0].metinParcasiId, String(parcalar[1]._id));
        assert.equal(sonuc.meta.indeksliMateryalSayisi, 2);
    } finally {
        if (oncekiEsik === undefined) delete process.env.SEMANTIK_ARAMA_MIN_SKOR;
        else process.env.SEMANTIK_ARAMA_MIN_SKOR = oncekiEsik;
    }
});

test("istenen sonuç sayısını güvenli üst sınır olan 10 ile sınırlar", async () => {
    const parcalar = Array.from({ length: 15 }, (_, index) => ({
        _id: new mongoose.Types.ObjectId(),
        materyalId: materyal1,
        islemeId: aktif1,
        parcaIndex: index,
        icerik: `Türkçe ders bölümü ${index}`,
        embedding: [1, 0, 0],
    }));
    const sonuc = await semanticAramaYap(
        { kullaniciId, dersId, sorgu: "ders bölümü", limit: 999 },
        modeller({ parcalar })
    );

    assert.equal(sonuc.sonuclar.length, 10);
});

test("aday sınırında materyalleri ve belge boyunca parçaları deterministik, dengeli seçer", () => {
    const kayitlar = [materyal1, materyal2].flatMap((materyalId) => (
        Array.from({ length: 10 }, (_, parcaIndex) => ({
            _id: `${materyalId}-${parcaIndex}`,
            materyalId,
            parcaIndex,
        }))
    ));
    const tersSirali = [...kayitlar].reverse();

    const ilk = dengeliAdayKimlikleriniSec(kayitlar, 4).map(String);
    const ikinci = dengeliAdayKimlikleriniSec(tersSirali, 4).map(String);

    assert.deepEqual(ilk, ikinci);
    assert.deepEqual(ilk, [
        `${materyal1}-2`,
        `${materyal1}-7`,
        `${materyal2}-2`,
        `${materyal2}-7`,
    ].sort((sol, sag) => {
        const solMateryal = sol.slice(0, 24);
        const sagMateryal = sag.slice(0, 24);
        return solMateryal.localeCompare(sagMateryal);
    }));
});

test("sorgu embedding'i üretilirken değişen aktif sürümün eski parçalarını yanıttan çıkarır", async () => {
    const yeniAktif1 = new mongoose.Types.ObjectId();
    const parcalar = [
        { _id: new mongoose.Types.ObjectId(), materyalId: materyal1, islemeId: aktif1, parcaIndex: 0, icerik: "eski sürüm", embedding: [1, 0, 0] },
        { _id: new mongoose.Types.ObjectId(), materyalId: materyal2, islemeId: aktif2, parcaIndex: 0, icerik: "güncel sürüm", embedding: [0.9, 0.1, 0] },
    ];
    const bagimliliklar = modeller({
        parcalar,
        guncelMateryaller: [
            { _id: materyal1, orijinalDosyaAdi: "bir.pdf", aktifIslemeId: yeniAktif1 },
            { _id: materyal2, orijinalDosyaAdi: "iki.docx", aktifIslemeId: aktif2 },
        ],
    });

    const sonuc = await semanticAramaYap(
        { kullaniciId, dersId, sorgu: "güncel bilgi", limit: 10 },
        bagimliliklar
    );

    assert.deepEqual(sonuc.sonuclar.map((kayit) => kayit.icerik), ["güncel sürüm"]);
    assert.equal(sonuc.meta.indeksliMateryalSayisi, 1);
});


test("başka kullanıcıya ait veya bulunmayan derste aramayı 404 ile reddeder", async () => {
    await assert.rejects(
        semanticAramaYap(
            { kullaniciId, dersId, sorgu: "arama" },
            modeller({ dersVar: false })
        ),
        (hata) => hata.status === 404 && hata.kod === "DERS_BULUNAMADI"
    );
});

test("indeksli aktif parça yoksa gereksiz sorgu embedding çağrısı yapmaz", async () => {
    let embeddingCagrildi = false;
    const bagimliliklar = modeller({ parcalar: [] });
    bagimliliklar.embeddingUret = async () => {
        embeddingCagrildi = true;
        return [[1, 0, 0]];
    };

    const sonuc = await semanticAramaYap({ kullaniciId, dersId, sorgu: "arama" }, bagimliliklar);

    assert.equal(embeddingCagrildi, false);
    assert.deepEqual(sonuc.sonuclar, []);
    assert.equal(sonuc.meta.eksikIndeksSayisi, 2);
});

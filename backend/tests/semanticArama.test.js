import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import { semanticAramaYap } from "../services/semanticAramaService.js";

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

const modeller = ({ dersVar = true, parcalar = [], filtreYakala = () => {} } = {}) => ({
    DersModel: {
        async findOne(filtre) {
            assert.equal(String(filtre.kullaniciId), String(kullaniciId));
            return dersVar ? { _id: dersId, kullaniciId } : null;
        }
    },
    MateryalModel: {
        find() {
            return zincir([
                { _id: materyal1, orijinalDosyaAdi: "bir.pdf", aktifIslemeId: aktif1 },
                { _id: materyal2, orijinalDosyaAdi: "iki.docx", aktifIslemeId: aktif2 },
            ]);
        }
    },
    MetinParcasiModel: {
        find(filtre) {
            filtreYakala(filtre);
            return zincir(parcalar);
        }
    },
    ayarlar: { model: "gemini-embedding-001", boyut: 3 },
    async embeddingUret() { return [[1, 0, 0]]; },
});

test("yalnızca kullanıcıya ait dersin aktif materyal sürümlerini sorgular ve sonuçları skora göre sıralar", async () => {
    let kullanilanFiltre;
    const parcalar = [
        { materyalId: materyal2, islemeId: aktif2, parcaIndex: 0, icerik: "Dengeli ağaçlar aramayı hızlandırır.", embedding: [0.8, 0.6, 0] },
        { materyalId: materyal1, islemeId: aktif1, parcaIndex: 1, icerik: "İkili arama ağacında düğüm kökten başlanarak bulunur.", embedding: [1, 0, 0] },
        { materyalId: materyal1, islemeId: aktif1, parcaIndex: 2, icerik: "Kuyruk FIFO ilkesiyle çalışır.", embedding: [0, 1, 0] },
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
        assert.equal(sonuc.meta.indeksliMateryalSayisi, 2);
    } finally {
        if (oncekiEsik === undefined) delete process.env.SEMANTIK_ARAMA_MIN_SKOR;
        else process.env.SEMANTIK_ARAMA_MIN_SKOR = oncekiEsik;
    }
});

test("istenen sonuç sayısını güvenli üst sınır olan 10 ile sınırlar", async () => {
    const parcalar = Array.from({ length: 15 }, (_, index) => ({
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

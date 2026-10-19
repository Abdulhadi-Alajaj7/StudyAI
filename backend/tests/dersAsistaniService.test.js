import test from "node:test";
import assert from "node:assert/strict";

import {
    acikKonuIceriyorMu,
    anlamsalAramaSorgusuOlustur,
    kaynakSnapshotlariniDogrula,
    otomatikSohbetBasliginiUret,
    sohbetMesajinaYanitOlustur,
    yalnizcaMateryalIstegiMi,
    yarimKalanBaslikUretimleriniKapat,
} from "../services/dersAsistaniService.js";

const kullaniciId = "64b000000000000000000001";
const dersId = "64b000000000000000000002";
const sohbetId = "64b000000000000000000003";

const kopya = (deger) => deger == null ? deger : structuredClone(deger);

const degerEslesiyor = (gercek, beklenen) => {
    if (beklenen && typeof beklenen === "object" && !(beklenen instanceof Date)) {
        if ("$ne" in beklenen) return String(gercek) !== String(beklenen.$ne);
        if ("$exists" in beklenen) return beklenen.$exists ? gercek !== undefined : gercek === undefined;
        if ("$lt" in beklenen) return gercek != null && new Date(gercek) < new Date(beklenen.$lt);
    }
    return String(gercek) === String(beklenen);
};

const eslesiyor = (belge, filtre) => Object.entries(filtre).every(([alan, beklenen]) => {
    if (alan === "$or") return beklenen.some((altFiltre) => eslesiyor(belge, altFiltre));
    return degerEslesiyor(belge[alan], beklenen);
});

const guncelle = (belge, islem) => {
    if (islem.$set) Object.assign(belge, kopya(islem.$set));
    if (islem.$setOnInsert) Object.assign(belge, kopya(islem.$setOnInsert));
    if (islem.$inc) {
        for (const [alan, miktar] of Object.entries(islem.$inc)) belge[alan] = (belge[alan] || 0) + miktar;
    }
    if (islem.$max) {
        for (const [alan, deger] of Object.entries(islem.$max)) {
            if (!belge[alan] || new Date(belge[alan]) < new Date(deger)) belge[alan] = deger;
        }
    }
    if (islem.$unset) {
        for (const alan of Object.keys(islem.$unset)) delete belge[alan];
    }
};

const sorgu = (deger, { dizi = false } = {}) => {
    let sonuc = deger;
    return {
        session() { return this; },
        sort() { return this; },
        limit(limit) {
            if (dizi) sonuc = sonuc.slice(0, limit);
            return this;
        },
        async lean() { return kopya(sonuc); },
    };
};

const bellekModelleri = ({ sohbet = {}, mesajlar = [] } = {}) => {
    const sohbetler = [{
        _id: sohbetId,
        kullaniciId,
        dersId,
        baslik: "Sanal bellek nedir?",
        baslikManuel: false,
        baslikUretimDurumu: "bekliyor",
        baslikUretimDenemeSayisi: 0,
        ...sohbet,
    }];
    const kayitlar = mesajlar.map(kopya);
    let sira = kayitlar.length;

    const SohbetModel = {
        findOne(filtre) {
            return sorgu(sohbetler.find((belge) => eslesiyor(belge, filtre)) || null);
        },
        async findOneAndUpdate(filtre, islem) {
            const belge = sohbetler.find((aday) => eslesiyor(aday, filtre));
            if (!belge) return null;
            guncelle(belge, islem);
            return kopya(belge);
        },
        async updateOne(filtre, islem) {
            const belge = sohbetler.find((aday) => eslesiyor(aday, filtre));
            if (!belge) return { modifiedCount: 0 };
            guncelle(belge, islem);
            return { modifiedCount: 1 };
        },
        async updateMany(filtre, islem) {
            let modifiedCount = 0;
            for (const belge of sohbetler.filter((aday) => eslesiyor(aday, filtre))) {
                guncelle(belge, islem);
                modifiedCount += 1;
            }
            return { modifiedCount };
        },
    };

    const DersModel = {
        async findOneAndUpdate(filtre) {
            if (String(filtre._id) !== dersId || String(filtre.kullaniciId) !== kullaniciId) return null;
            return { _id: dersId };
        },
    };

    const MesajModel = {
        findOne(filtre) {
            return sorgu(kayitlar.find((belge) => eslesiyor(belge, filtre)) || null);
        },
        find(filtre) {
            const bulunanlar = kayitlar.filter((belge) => {
                const sadeFiltre = { ...filtre };
                const kimlikFiltresi = sadeFiltre._id;
                delete sadeFiltre._id;
                if (!eslesiyor(belge, sadeFiltre)) return false;
                return !kimlikFiltresi?.$ne || String(belge._id) !== String(kimlikFiltresi.$ne);
            }).sort((sol, sag) => new Date(sag.createdAt) - new Date(sol.createdAt));
            return sorgu(bulunanlar, { dizi: true });
        },
        async create(girdi) {
            const kayit = Array.isArray(girdi) ? girdi[0] : girdi;
            const belge = { _id: `mesaj-${++sira}`, createdAt: new Date(), ...kopya(kayit) };
            kayitlar.push(belge);
            return Array.isArray(girdi) ? [kopya(belge)] : kopya(belge);
        },
        async findOneAndUpdate(filtre, islem) {
            let belge = kayitlar.find((aday) => eslesiyor(aday, filtre));
            if (!belge) {
                belge = { _id: `mesaj-${++sira}`, createdAt: new Date() };
                guncelle(belge, islem);
                kayitlar.push(belge);
            }
            return kopya(belge);
        },
        async updateOne(filtre, islem) {
            const belge = kayitlar.find((aday) => eslesiyor(aday, filtre));
            if (!belge) return { modifiedCount: 0 };
            guncelle(belge, islem);
            return { modifiedCount: 1 };
        },
    };
    const startSession = async () => ({
        async withTransaction(islem) { await islem(); },
        async endSession() {},
    });
    return { DersModel, SohbetModel, MesajModel, startSession, sohbetler, mesajlar: kayitlar };
};

const kaynak = {
    metinParcasiId: "64b000000000000000000010",
    materyalId: "64b000000000000000000011",
    materyalAdi: "Hafta5.pdf",
    parcaIndex: 4,
    icerik: "Sanal bellek, süreçlere kesintisiz sanal adres alanı sağlar.",
    skor: 0.91,
};

test("yeni sohbetin ilk mesajına AI yanıtı kaydeder ve doğrulanmış kaynağı snapshot yapar", async () => {
    const ilkMesaj = {
        _id: "mesaj-ilk",
        sohbetId,
        kullaniciId,
        dersId,
        rol: "user",
        icerik: "Sanal bellek nedir?",
        istemciIstekId: "istek-ilk-0001",
        yanitDurumu: "yanit_bekliyor",
        createdAt: new Date(),
    };
    const modeller = bellekModelleri({
        sohbet: { aktifIstekId: "istek-ilk-0001", aktifIstekBaslamaTarihi: new Date() },
        mesajlar: [ilkMesaj],
    });
    const sonuc = await sohbetMesajinaYanitOlustur({
        kullaniciId, dersId, sohbetId,
        icerik: ilkMesaj.icerik,
        istemciIstekId: ilkMesaj.istemciIstekId,
        kullaniciMesaji: ilkMesaj,
        kilitZatenAlindi: true,
    }, {
        ...modeller,
        semanticArama: async () => ({ sonuclar: [kaynak] }),
        geminiYanitUret: async () => ({
            yanit: "Sanal bellek bir bellek yönetimi tekniğidir [K1].",
            kullanilanKaynakKodlari: ["K1", "K999"],
            bilgiDurumu: "yeterli",
        }),
    });

    assert.equal(sonuc.asistanMesaji.icerik, "Sanal bellek bir bellek yönetimi tekniğidir.");
    assert.equal(
        modeller.mesajlar.find((mesaj) => mesaj.rol === "assistant").icerik,
        "Sanal bellek bir bellek yönetimi tekniğidir."
    );
    assert.deepEqual(sonuc.asistanMesaji.kaynaklar, [{
        metinParcasiId: kaynak.metinParcasiId,
        materyalId: kaynak.materyalId,
        materyalAdi: "Hafta5.pdf",
        parcaIndex: 4,
    }]);
    assert.equal(modeller.mesajlar.find((mesaj) => mesaj._id === "mesaj-ilk").yanitDurumu, "yanitlandi");
    assert.equal(modeller.sohbetler[0].aktifIstekId, undefined);
});

test("mevcut sohbete kullanıcı mesajı ekleyip AI yanıtı üretir", async () => {
    const modeller = bellekModelleri();
    const session = {
        transactionAcik: false,
        sonaErdi: false,
        async withTransaction(islem) {
            this.transactionAcik = true;
            await islem();
            this.transactionAcik = false;
        },
        async endSession() { this.sonaErdi = true; },
    };
    let dersSilmeSiralamasiYapildi = false;
    modeller.startSession = async () => session;
    modeller.DersModel = {
        async findOneAndUpdate(filtre, guncelleme, secenekler) {
            assert.equal(session.transactionAcik, true);
            assert.equal(secenekler.session, session);
            assert.deepEqual(filtre.temizleniyor, { $ne: true });
            assert.deepEqual(guncelleme, { $inc: { sohbetSurumu: 1 } });
            dersSilmeSiralamasiYapildi = true;
            return { _id: dersId };
        },
    };
    const sonuc = await sohbetMesajinaYanitOlustur({
        kullaniciId, dersId, sohbetId,
        icerik: "Deadlock nedir?",
        istemciIstekId: "istek-yeni-0001",
    }, {
        ...modeller,
        semanticArama: async () => ({ sonuclar: [] }),
        geminiYanitUret: async ({ kaynaklar }) => {
            assert.equal(session.transactionAcik, false);
            assert.deepEqual(kaynaklar, []);
            return { yanit: "Materyalde bulunamadı. Genel bilgi: Deadlock...", kullanilanKaynakKodlari: [], bilgiDurumu: "bulunamadi" };
        },
    });
    assert.equal(sonuc.kullaniciMesaji.icerik, "Deadlock nedir?");
    assert.equal(sonuc.asistanMesaji.kaynaklar.length, 0);
    assert.equal(dersSilmeSiralamasiYapildi, true);
    assert.equal(session.sonaErdi, true);
});

test("takip sorusu önceki açık konuya bağlanır", () => {
    const sonuc = anlamsalAramaSorgusuOlustur({
        guncelMesaj: "Peki avantajları nelerdir?",
        oncekiMesajlar: [{ _id: "1", rol: "user", icerik: "Sanal bellek nedir?" }],
    });
    assert.equal(sonuc.takipSorusu, true);
    assert.match(sonuc.sorgu, /Sanal bellek nedir/);
});

test("açık konu değişimi önceki konuya bağlanmaz", () => {
    assert.equal(acikKonuIceriyorMu("Deadlock nedir?"), true);
    const sonuc = anlamsalAramaSorgusuOlustur({
        guncelMesaj: "Deadlock nedir?",
        oncekiMesajlar: [{ rol: "user", icerik: "Sanal bellek nedir?" }],
    });
    assert.deepEqual(sonuc, { sorgu: "Deadlock nedir?", takipSorusu: false, baglamMesajId: null });
});

test("yalnızca getirilen kaynak kodlarını doğrular; uydurma ve tekrar kodlarını reddeder", () => {
    const aday = { ...kaynak, kod: "K1" };
    assert.deepEqual(kaynakSnapshotlariniDogrula(["K999", "K1", "K1"], [aday]), [{
        metinParcasiId: kaynak.metinParcasiId,
        materyalId: kaynak.materyalId,
        materyalAdi: kaynak.materyalAdi,
        parcaIndex: kaynak.parcaIndex,
    }]);
});

test("kaynak yoksa hibrit mod Gemini'nin genel bilgi verebilmesine izin verir", async () => {
    const modeller = bellekModelleri();
    let cagrildi = false;
    await sohbetMesajinaYanitOlustur({
        kullaniciId, dersId, sohbetId, icerik: "Deadlock nedir?", istemciIstekId: "istek-hibrit-01",
    }, {
        ...modeller,
        semanticArama: async () => ({ sonuclar: [] }),
        geminiYanitUret: async ({ yalnizcaMateryal, kaynaklar }) => {
            cagrildi = true;
            assert.equal(yalnizcaMateryal, false);
            assert.deepEqual(kaynaklar, []);
            return { yanit: "Materyalde bulunamadı; genel bilgi şöyledir.", kullanilanKaynakKodlari: [], bilgiDurumu: "bulunamadi" };
        },
    });
    assert.equal(cagrildi, true);
});

test("yalnızca materyal isteğinde kaynak yoksa Gemini çağrısı yapmadan güvenli yanıt verir", async () => {
    assert.equal(yalnizcaMateryalIstegiMi("Sadece ders materyallerine dayanarak yanıtla"), true);
    const modeller = bellekModelleri();
    const sonuc = await sohbetMesajinaYanitOlustur({
        kullaniciId, dersId, sohbetId,
        icerik: "Sadece ders materyallerine dayanarak deadlock nedir?",
        istemciIstekId: "istek-strict-01",
    }, {
        ...modeller,
        semanticArama: async () => ({ sonuclar: [] }),
        geminiYanitUret: async () => { throw new Error("Gemini çağrılmamalı"); },
    });
    assert.match(sonuc.asistanMesaji.icerik, /genel bilgi eklemedim/);
});

test("otomatik başlık yalnızca bir kez alınır ve başarılıysa kaydedilir", async () => {
    const modeller = bellekModelleri();
    let cagrilar = 0;
    const deps = {
        ...modeller,
        geminiBaslikUret: async () => { cagrilar += 1; return "Sanal Bellek Yönetimi"; },
    };
    const ilk = await otomatikSohbetBasliginiUret({ kullaniciId, dersId, sohbetId, ilkMesaj: "Sanal bellek nedir?" }, deps);
    const ikinci = await otomatikSohbetBasliginiUret({ kullaniciId, dersId, sohbetId, ilkMesaj: "Sanal bellek nedir?" }, deps);
    assert.equal(ilk.guncellendi, true);
    assert.equal(ikinci.denendi, false);
    assert.equal(cagrilar, 1);
    assert.equal(modeller.sohbetler[0].baslik, "Sanal Bellek Yönetimi");
});

test("manuel başlık otomatik üretim tarafından değiştirilmez", async () => {
    const modeller = bellekModelleri({ sohbet: { baslik: "Benim Başlığım", baslikManuel: true } });
    const sonuc = await otomatikSohbetBasliginiUret({ kullaniciId, dersId, sohbetId, ilkMesaj: "Soru" }, {
        ...modeller,
        geminiBaslikUret: async () => "Model Başlığı",
    });
    assert.equal(sonuc.denendi, false);
    assert.equal(modeller.sohbetler[0].baslik, "Benim Başlığım");
});

test("başlık üretimi başarısızsa varsayılan başlık korunur ve hata durumu yazılır", async () => {
    const modeller = bellekModelleri();
    const sonuc = await otomatikSohbetBasliginiUret({ kullaniciId, dersId, sohbetId, ilkMesaj: "Soru" }, {
        ...modeller,
        geminiBaslikUret: async () => { throw Object.assign(new Error("hata"), { kod: "GEMINI_GECICI_HATA" }); },
        logger: { warn() {} },
    });
    assert.equal(sonuc.guncellendi, false);
    assert.equal(modeller.sohbetler[0].baslik, "Sanal bellek nedir?");
    assert.equal(modeller.sohbetler[0].baslikUretimDurumu, "hata");
});

test("aynı istemci isteği tamamlandıysa Gemini çağrılmadan aynı asistan yanıtı döner", async () => {
    const user = { _id: "u1", sohbetId, kullaniciId, dersId, rol: "user", icerik: "Soru", istemciIstekId: "istek-tekrar-01", yanitDurumu: "yanitlandi" };
    const assistant = { _id: "a1", sohbetId, kullaniciId, dersId, rol: "assistant", icerik: "Yanıt", yanitlananMesajId: "u1", createdAt: new Date() };
    const modeller = bellekModelleri({ mesajlar: [user, assistant] });
    const sonuc = await sohbetMesajinaYanitOlustur({
        kullaniciId, dersId, sohbetId, icerik: "Soru", istemciIstekId: "istek-tekrar-01",
    }, {
        ...modeller,
        semanticArama: async () => { throw new Error("Arama tekrarlanmamalı"); },
        geminiYanitUret: async () => { throw new Error("Gemini tekrarlanmamalı"); },
    });
    assert.equal(sonuc.tekrar, true);
    assert.equal(sonuc.asistanMesaji._id, "a1");
});

test("başarısız AI isteği hata olarak işaretlenir ve aynı istek kimliğiyle güvenle tamamlanabilir", async () => {
    const modeller = bellekModelleri();
    const girdi = {
        kullaniciId, dersId, sohbetId, icerik: "Semaphore nedir?", istemciIstekId: "istek-yeniden-01",
    };
    await assert.rejects(
        sohbetMesajinaYanitOlustur(girdi, {
            ...modeller,
            semanticArama: async () => ({ sonuclar: [] }),
            geminiYanitUret: async () => {
                throw Object.assign(new Error("Geçici hizmet hatası"), { status: 503, kod: "GEMINI_GECICI_HATA" });
            },
        }),
        (hata) => hata.kod === "GEMINI_GECICI_HATA"
    );
    assert.equal(modeller.mesajlar[0].yanitDurumu, "hata");
    assert.equal(modeller.sohbetler[0].aktifIstekId, undefined);

    const sonuc = await sohbetMesajinaYanitOlustur(girdi, {
        ...modeller,
        semanticArama: async () => ({ sonuclar: [] }),
        geminiYanitUret: async () => ({ yanit: "Semaphore bir senkronizasyon aracıdır.", kullanilanKaynakKodlari: [], bilgiDurumu: "bulunamadi" }),
    });
    assert.equal(sonuc.asistanMesaji.icerik, "Semaphore bir senkronizasyon aracıdır.");
    assert.equal(modeller.mesajlar.filter((mesaj) => mesaj.rol === "user").length, 1);
    assert.equal(modeller.mesajlar[0].yanitDurumu, "yanitlandi");
});

test("eşzamanlı farklı mesaj aktif sohbet kilidini geçemez", async () => {
    const modeller = bellekModelleri({
        sohbet: { aktifIstekId: "baska-istek", aktifIstekBaslamaTarihi: new Date() },
    });
    await assert.rejects(
        sohbetMesajinaYanitOlustur({
            kullaniciId, dersId, sohbetId, icerik: "Yeni soru", istemciIstekId: "istek-eszaman-01",
        }, modeller),
        (hata) => hata.status === 409 && hata.kod === "SOHBET_MESAJI_ISLENIYOR"
    );
});

test("başka kullanıcıya ait sohbet mesaj gönderiminde 404 ile izole edilir", async () => {
    const modeller = bellekModelleri();
    await assert.rejects(
        sohbetMesajinaYanitOlustur({
            kullaniciId: "baska-kullanici", dersId, sohbetId, icerik: "Soru", istemciIstekId: "istek-izole-001",
        }, modeller),
        (hata) => hata.status === 404 && hata.kod === "SOHBET_BULUNAMADI"
    );
});

test("sunucu yeniden başlatma kurtarması yarım kalmış eski başlık işini hata durumuna alır", async () => {
    const eski = new Date("2026-01-01T00:00:00Z");
    const modeller = bellekModelleri({
        sohbet: { baslikUretimDurumu: "isleniyor", baslikUretimBaslamaTarihi: eski },
    });
    const sayi = await yarimKalanBaslikUretimleriniKapat(
        { eskiTarih: new Date("2026-01-01T00:05:00Z") },
        modeller
    );
    assert.equal(sayi, 1);
    assert.equal(modeller.sohbetler[0].baslikUretimDurumu, "hata");
    assert.equal(modeller.sohbetler[0].baslik, "Sanal bellek nedir?");
});

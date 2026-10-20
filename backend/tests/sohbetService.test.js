import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

import {
    sohbetBasliginiDegistir,
    sohbetGetir,
    sohbetMesajlariniGetir,
    sohbetOlustur,
    sohbetSil,
    sohbetleriListele,
    varsayilanSohbetBasligiOlustur,
} from "../services/sohbetService.js";

const kullaniciId = new mongoose.Types.ObjectId();
const dersId = new mongoose.Types.ObjectId();
const sohbetId = new mongoose.Types.ObjectId();
const mesajId = new mongoose.Types.ObjectId();

const sorgu = (deger) => ({
    session() { return this; },
    select() { return this; },
    sort() { return this; },
    limit() { return this; },
    lean() { return Promise.resolve(deger); },
    then(resolve, reject) { return Promise.resolve(deger).then(resolve, reject); },
});

const belge = (deger) => ({
    ...deger,
    toObject() { return { ...deger }; },
});

const oturum = () => ({
    sonaErdi: false,
    async withTransaction(islem) { await islem(); },
    async endSession() { this.sonaErdi = true; },
});

test("varsayılan başlık ilk mesajdan güvenli biçimde türetilir ve sınırlanır", () => {
    assert.equal(
        varsayilanSohbetBasligiOlustur("  **Sanal bellek nedir?**  "),
        "Sanal bellek nedir?"
    );
    assert.ok(varsayilanSohbetBasligiOlustur("a".repeat(100)).length <= 70);
});

test("ilk mesaj sohbetle aynı transaction içinde oluşturulur ve ders silme kilidiyle sıralanır", async () => {
    const session = oturum();
    let dersFiltresi;
    let dersGuncellemesi;
    let sohbetKaydi;
    let mesajKaydi;

    const sonuc = await sohbetOlustur({
        kullaniciId,
        dersId,
        ilkMesaj: "Sanal bellek nedir?",
        istemciIstekId: "istek-0001",
    }, {
        DersModel: {
            async findOneAndUpdate(filtre, guncelleme, secenekler) {
                dersFiltresi = filtre;
                dersGuncellemesi = guncelleme;
                assert.equal(secenekler.session, session);
                return { _id: dersId };
            },
        },
        SohbetModel: {
            findOne() { throw new Error("Tekrar mesajı yokken sohbet aranmamalı."); },
            async create([kayit], secenekler) {
                assert.equal(secenekler.session, session);
                sohbetKaydi = { _id: sohbetId, ...kayit };
                return [belge(sohbetKaydi)];
            },
        },
        MesajModel: {
            findOne() { return sorgu(null); },
            async create([kayit], secenekler) {
                assert.equal(secenekler.session, session);
                mesajKaydi = { _id: mesajId, ...kayit };
                return [belge(mesajKaydi)];
            },
        },
        startSession: async () => session,
    });

    assert.equal(String(dersFiltresi.kullaniciId), String(kullaniciId));
    assert.equal(String(dersFiltresi._id), String(dersId));
    assert.deepEqual(dersFiltresi.temizleniyor, { $ne: true });
    assert.deepEqual(dersGuncellemesi, { $inc: { sohbetSurumu: 1 } });
    assert.equal(sohbetKaydi.baslik, "Sanal bellek nedir?");
    assert.equal(String(mesajKaydi.sohbetId), String(sohbetId));
    assert.equal(mesajKaydi.yanitDurumu, "yanit_bekliyor");
    assert.equal(sohbetKaydi.aktifIstekId, "istek-0001");
    assert.equal(sonuc.kilitAlindi, true);
    assert.equal(sonuc.tekrar, false);
    assert.equal(session.sonaErdi, true);
});

test("aynı istemci istek kimliği tekrarlandığında yeni sohbet veya mesaj oluşturulmaz", async () => {
    let sessionBaslatildi = false;
    const mevcutMesaj = {
        _id: mesajId,
        sohbetId,
        kullaniciId,
        dersId,
        rol: "user",
        icerik: "Tekrar gönderilen mesaj",
        istemciIstekId: "istek-0002",
    };
    const mevcutSohbet = { _id: sohbetId, kullaniciId, dersId };

    const sonuc = await sohbetOlustur({
        kullaniciId,
        dersId,
        ilkMesaj: "Tekrar gönderilen mesaj",
        istemciIstekId: "istek-0002",
    }, {
        DersModel: {},
        SohbetModel: {
            findOne(filtre) {
                assert.equal(String(filtre._id), String(sohbetId));
                return sorgu(mevcutSohbet);
            },
            create() { throw new Error("Yeni sohbet oluşturulmamalı."); },
        },
        MesajModel: {
            findOne(filtre) {
                assert.equal(filtre.istemciIstekId, "istek-0002");
                return sorgu(mevcutMesaj);
            },
            create() { throw new Error("Yeni mesaj oluşturulmamalı."); },
        },
        startSession: async () => {
            sessionBaslatildi = true;
            return oturum();
        },
    });

    assert.equal(sonuc.tekrar, true);
    assert.equal(String(sonuc.sohbet._id), String(sohbetId));
    assert.equal(sessionBaslatildi, false);
});

test("aynı istemci istek kimliği farklı içerikle kullanılırsa çakışma reddedilir", async () => {
    await assert.rejects(
        sohbetOlustur({
            kullaniciId,
            dersId,
            ilkMesaj: "Yeni ve farklı içerik",
            istemciIstekId: "istek-0003",
        }, {
            DersModel: {},
            SohbetModel: {},
            MesajModel: {
                findOne: () => sorgu({
                    _id: mesajId,
                    sohbetId,
                    kullaniciId,
                    dersId,
                    rol: "user",
                    icerik: "Önceki içerik",
                    istemciIstekId: "istek-0003",
                }),
            },
        }),
        (hata) => hata.status === 409 && hata.kod === "ISTEK_ID_CAKISMASI"
    );
});

test("sohbet listesi yalnızca kullanıcıya ait dersi doğrulayıp son mesaj sırasıyla sayfalanır", async () => {
    const birinci = { _id: new mongoose.Types.ObjectId(), sonMesajTarihi: new Date("2026-01-02") };
    const ikinci = { _id: new mongoose.Types.ObjectId(), sonMesajTarihi: new Date("2026-01-01") };
    let dersFiltresi;
    let sohbetFiltresi;

    const sonuc = await sohbetleriListele({
        kullaniciId,
        dersId,
        limit: 1,
    }, {
        DersModel: {
            findOne(filtre) {
                dersFiltresi = filtre;
                return sorgu({ _id: dersId });
            },
        },
        SohbetModel: {
            find(filtre) {
                sohbetFiltresi = filtre;
                return sorgu([birinci, ikinci]);
            },
        },
    });

    assert.deepEqual(dersFiltresi, {
        _id: dersId,
        kullaniciId,
        temizleniyor: { $ne: true },
    });
    assert.deepEqual(sohbetFiltresi, { kullaniciId, dersId });
    assert.deepEqual(sonuc.sohbetler, [birinci]);
    assert.equal(sonuc.sonrakiCursor, String(birinci._id));
});

test("mesaj geçmişi kullanıcı, ders ve sohbet kimlikleriyle izole edilir ve kronolojik döner", async () => {
    const eskiMesaj = { _id: new mongoose.Types.ObjectId(), rol: "user", icerik: "Soru", createdAt: new Date("2026-01-01") };
    const yeniMesaj = {
        _id: new mongoose.Types.ObjectId(),
        rol: "assistant",
        icerik: "Eski kayıt yanıtı [K1].",
        kaynaklar: [{ materyalAdi: "Hafta5.pdf" }],
        createdAt: new Date("2026-01-02"),
    };
    let sohbetFiltresi;
    let mesajFiltresi;

    const sonuc = await sohbetMesajlariniGetir({
        kullaniciId,
        dersId,
        sohbetId,
        limit: 50,
    }, {
        SohbetModel: {
            findOne(filtre) {
                sohbetFiltresi = filtre;
                return sorgu({ _id: sohbetId });
            },
        },
        MesajModel: {
            find(filtre) {
                mesajFiltresi = filtre;
                return sorgu([yeniMesaj, eskiMesaj]);
            },
        },
    });

    assert.deepEqual(sohbetFiltresi, { _id: sohbetId, kullaniciId, dersId });
    assert.deepEqual(mesajFiltresi, { sohbetId, kullaniciId, dersId });
    assert.deepEqual(sonuc.mesajlar.map((mesaj) => mesaj._id), [eskiMesaj._id, yeniMesaj._id]);
    assert.equal(sonuc.mesajlar[1].icerik, "Eski kayıt yanıtı.");
    assert.deepEqual(sonuc.mesajlar[1].kaynaklar, [{ materyalAdi: "Hafta5.pdf" }]);
});

test("başka kullanıcıya veya derse ait sohbet okunamaz", async () => {
    await assert.rejects(
        sohbetGetir({ kullaniciId, dersId, sohbetId }, {
            SohbetModel: { findOne: () => sorgu(null) },
        }),
        (hata) => hata.status === 404 && hata.kod === "SOHBET_BULUNAMADI"
    );
});

test("başlık değiştirme ve silme sorguları kullanıcı, ders ve sohbet sahipliğini birlikte uygular", async () => {
    let guncellemeFiltresi;
    let silmeFiltresi;
    let mesajSilmeFiltresi;
    const session = oturum();

    const SohbetModel = {
        async findOneAndUpdate(filtre, guncelleme) {
            guncellemeFiltresi = filtre;
            assert.equal(guncelleme.$set.baslikManuel, true);
            return belge({ _id: sohbetId, baslik: "Yeni Başlık" });
        },
        findOneAndDelete(filtre) {
            silmeFiltresi = filtre;
            return sorgu(belge({ _id: sohbetId }));
        },
    };

    await sohbetBasliginiDegistir({
        kullaniciId,
        dersId,
        sohbetId,
        baslik: "Yeni Başlık",
    }, { SohbetModel });

    await sohbetSil({ kullaniciId, dersId, sohbetId }, {
        SohbetModel,
        MesajModel: {
            deleteMany(filtre) {
                mesajSilmeFiltresi = filtre;
                return sorgu({ deletedCount: 2 });
            },
        },
        startSession: async () => session,
    });

    const beklenen = { _id: sohbetId, kullaniciId, dersId };
    assert.deepEqual(guncellemeFiltresi, beklenen);
    assert.equal(String(silmeFiltresi._id), String(sohbetId));
    assert.equal(String(silmeFiltresi.kullaniciId), String(kullaniciId));
    assert.equal(String(silmeFiltresi.dersId), String(dersId));
    assert.equal(silmeFiltresi.$or.length, 2);
    assert.deepEqual(mesajSilmeFiltresi, { sohbetId, kullaniciId, dersId });
    assert.equal(session.sonaErdi, true);
});

test("aktif yanıt üretilirken sohbet ve mesajlar silinmez", async () => {
    const session = oturum();
    let mesajlarSilindi = false;

    await assert.rejects(
        sohbetSil({ kullaniciId, dersId, sohbetId }, {
            SohbetModel: {
                findOneAndDelete() { return sorgu(null); },
                findOne() {
                    return sorgu({
                        _id: sohbetId,
                        kullaniciId,
                        dersId,
                        aktifIstekId: "istek-aktif-01",
                        aktifIstekBaslamaTarihi: new Date(),
                    });
                },
            },
            MesajModel: {
                deleteMany() {
                    mesajlarSilindi = true;
                    return sorgu({ deletedCount: 2 });
                },
            },
            startSession: async () => session,
        }),
        (hata) => hata.status === 409 && hata.kod === "SOHBET_MESAJI_ISLENIYOR"
    );

    assert.equal(mesajlarSilindi, false);
    assert.equal(session.sonaErdi, true);
});

test("süresi dolmuş yanıt kilidi ilk silme denemesinde temizlenir fakat veri silinmez", async () => {
    const session = oturum();
    const eskiBaslangic = new Date(Date.now() - (3 * 60 * 1000));
    let kilitTemizlendi = false;
    let mesajlarSilindi = false;

    await assert.rejects(
        sohbetSil({ kullaniciId, dersId, sohbetId }, {
            SohbetModel: {
                findOneAndDelete() { return sorgu(null); },
                findOne() {
                    return sorgu({
                        _id: sohbetId,
                        kullaniciId,
                        dersId,
                        aktifIstekId: "istek-bayat-01",
                        aktifIstekBaslamaTarihi: eskiBaslangic,
                    });
                },
                async updateOne(filtre, guncelleme, secenekler) {
                    assert.equal(filtre.aktifIstekId, "istek-bayat-01");
                    assert.equal(secenekler.session, session);
                    assert.deepEqual(guncelleme.$unset, {
                        aktifIstekId: "",
                        aktifIstekBaslamaTarihi: "",
                    });
                    kilitTemizlendi = true;
                },
            },
            MesajModel: {
                deleteMany() {
                    mesajlarSilindi = true;
                    return sorgu({ deletedCount: 2 });
                },
            },
            startSession: async () => session,
        }),
        (hata) => hata.status === 409 && hata.kod === "SOHBET_MESAJI_ISLENIYOR"
    );

    assert.equal(kilitTemizlendi, true);
    assert.equal(mesajlarSilindi, false);
    assert.equal(session.sonaErdi, true);
});

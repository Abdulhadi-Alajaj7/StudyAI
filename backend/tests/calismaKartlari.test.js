import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import CalismaKartiDestesi from "../models/CalismaKartiDestesi.js";
import KartCalismaDurumu from "../models/KartCalismaDurumu.js";
import KartDegerlendirmesi from "../models/KartDegerlendirmesi.js";
import { geminiIleCalismaKartlariUret } from "../services/geminiService.js";
import { kartGirdisiniDogrula } from "../controllers/calismaKartlariController.js";
import { calismaKartlariniGetir, calismaKartlariniOlustur, kartDurumunuGuncelle, kartiDegerlendir, kartKonulariniGetir, konuKartKaynaklariniSec } from "../services/calismaKartlariService.js";
import { kartHataTanilamasiniOlustur } from "../utils/calismaKartiTanilama.js";

const id = () => String(new mongoose.Types.ObjectId());
const kopya = v => v == null ? v : JSON.parse(JSON.stringify(v));
const deger = (d, yol) => yol.split(".").reduce((o, k) => Array.isArray(o) ? o.flatMap(a => a?.[k]) : o?.[k], d);
const eslesir = (d, f) => Object.entries(f).every(([k, v]) => {
    if (k === "$or") return v.some(a => eslesir(d, a));
    const x = deger(d, k);
    if (v && typeof v === "object") {
        if ("$ne" in v) return String(x) !== String(v.$ne);
        if ("$in" in v) return v.$in.some(a => String(a) === String(x));
    }
    return Array.isArray(x) ? x.map(String).includes(String(v)) : v == null ? x == null : String(x) === String(v);
});
const zincir = veri => ({ select() { return this; }, sort() { return this; }, session() { return this; }, async lean() { return kopya(veri); } });

const duzenek = () => {
    const kullaniciId = id(), dersId = id(), materyalId = id(), islemeId = id();
    const girdi = { kullaniciId, dersId };
    let zaman = new Date("2026-11-12T09:00:00Z"), sira = Promise.resolve();
    const isler = [], cagrilar = [], sorgular = [], tanilamalar = [];
    const db = {
        ders: [{ _id: dersId, kullaniciId, materyallerOnaylandi: true, temizleniyor: false, kartSurumu: 0 }],
        harita: [{ ...girdi, durum: "hazir", degisikliklereKilitli: true, anaKonular: [{
            konuId: "ana", baslik: "Veri Yapıları", kaynakMateryalIds: [materyalId], altKonular: [
                { konuId: "yigin", baslik: "Yığın", kaynakMateryalIds: [materyalId] },
                { konuId: "kuyruk", baslik: "Kuyruk", kaynakMateryalIds: [materyalId] },
            ],
        }] }],
        materyal: [{ ...girdi, _id: materyalId, aktifIslemeId: islemeId, durum: "hazir", dosyaAdi: "ders.pdf" }],
        parca: [
            { ...girdi, materyalId, islemeId, parcaIndex: 0, icerik: "Yığın LIFO ilkesiyle çalışan bir veri yapısıdır." },
            { ...girdi, materyalId, islemeId, parcaIndex: 1, icerik: "Kuyruk FIFO ilkesiyle çalışan bir veri yapısıdır." },
            { ...girdi, materyalId, islemeId: id(), parcaIndex: 2, icerik: "PASİF eski sürüm içeriği" },
        ], deste: [], durum: [], degerlendirme: [],
    };
    const modeller = { deste: CalismaKartiDestesi, durum: KartCalismaDurumu, degerlendirme: KartDegerlendirmesi };
    const model = ad => {
        const uygula = (doc, degisiklik, f, yeni = false) => {
            const set = { ...(yeni ? degisiklik.$setOnInsert : {}), ...degisiklik.$set };
            for (const [key, value] of Object.entries(set)) {
                if (key.startsWith("konular.$.")) doc.konular.find(k => k.konuId === f["konular.konuId"])[key.slice(10)] = kopya(value);
                else doc[key] = kopya(value);
            }
            for (const [key, value] of Object.entries(degisiklik.$inc || {})) doc[key] = (doc[key] || 0) + value;
            for (const key of Object.keys(degisiklik.$currentDate || {})) doc[key] = zaman.toISOString();
            return doc;
        };
        return {
            findOne(f) { sorgular.push({ ad, f: kopya(f) }); return zincir(db[ad].find(d => eslesir(d, f)) || null); },
            find(f) { sorgular.push({ ad, f: kopya(f) }); return zincir(db[ad].filter(d => eslesir(d, f))); },
            async create(docs) {
                const sonuc = docs.map(d => {
                    const doc = modeller[ad] ? new modeller[ad](d) : { _id: id(), ...d };
                    const hata = doc.validateSync?.(); if (hata) throw hata;
                    return kopya(doc.toObject ? doc.toObject() : doc);
                });
                db[ad].push(...sonuc); return kopya(sonuc);
            },
            async findOneAndUpdate(f, g) {
                const doc = db[ad].find(d => eslesir(d, f));
                return doc ? kopya(uygula(doc, g, f)) : null;
            },
            async updateOne(f, g, opts = {}) {
                let doc = db[ad].find(d => eslesir(d, f));
                if (!doc && opts.upsert) {
                    doc = kopya(new modeller[ad]({ ...g.$setOnInsert, ...g.$set }).toObject()); db[ad].push(doc);
                    uygula(doc, g, f, true); return { matchedCount: 0, upsertedCount: 1 };
                }
                if (doc) uygula(doc, g, f);
                return { matchedCount: doc ? 1 : 0 };
            },
        };
    };
    const deps = {
        DersModel: model("ders"), KonuHaritasiModel: model("harita"), MateryalModel: model("materyal"), MetinParcasiModel: model("parca"),
        DesteModel: model("deste"), DurumModel: model("durum"), DegerlendirmeModel: model("degerlendirme"),
        simdi: () => new Date(zaman), heartbeatMs: 10000,
        tanilamaLogla: veri => tanilamalar.push(veri),
        arkaPlandaBaslat: islem => isler.push(islem),
        oturumBaslat: async () => ({
            async withTransaction(islem) {
                const onceki = sira; let birak; sira = new Promise(r => { birak = r; });
                await onceki; const eski = kopya(db);
                try { await islem(); } catch (e) { Object.assign(db, eski); throw e; } finally { birak(); }
            }, async endSession() {},
        }),
        kartUret: async g => {
            cagrilar.push(g);
            return geminiIleCalismaKartlariUret(g, {
                istemci: { models: { async generateContent() {
                    const kaynak = g.kaynaklar[0];
                    return { text: JSON.stringify({ kartlar: [{ konuId: g.konu.konuId, soru: `${g.konu.baslik} hangi ilkeyle çalışır?`,
                        cevap: kaynak.icerik, kaynakReferansi: kaynak.anahtar, alinti: kaynak.icerik }] }), candidates: [{ finishReason: "STOP" }] };
                } } }, maxDeneme: 1,
            });
        },
    };
    return { girdi, deps, db, isler, cagrilar, sorgular, tanilamalar, zamaniIlerlet: ms => { zaman = new Date(zaman.getTime() + ms); },
        async tamamla() { while (isler.length) await isler.shift()(); } };
};
const hazirDuzenek = async () => { const d = duzenek(); await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla(); return d; };

test("konu başlığının birebir geçmesi gerekmez; açıklama ve Türkçe ekler kaynak eşleştirmesini korur", () => {
    const d = duzenek(), m = d.db.materyal[0];
    const konu = { baslik: "Son Giren İlk Çıkar", aciklama: "Yığının LIFO", kaynakIds: [m._id] };
    const s = konuKartKaynaklariniSec(konu, d.db.parca.slice(0, 2), [m]);
    assert.equal(s.length, 1); assert.match(s[0].icerik, /Yığın/);
    assert.equal(konuKartKaynaklariniSec({ ...konu, baslik: "YIĞIN", aciklama: "" }, d.db.parca.slice(0, 2), [m]).length, 1);
    assert.equal(konuKartKaynaklariniSec({ ...konu, baslik: "Fotosentez Klorofil", aciklama: "" }, d.db.parca.slice(0, 2), [m]).length, 0);
});

test("gerçek hata şeklindeki ilk konu reddi alt koduyla kaydedilir; GET tekrar üretmez", async () => {
    const d = duzenek(); let cagri = 0;
    d.deps.kartUret = g => geminiIleCalismaKartlariUret(g, { maxDeneme: 1,
        istemci: { models: { async generateContent() {
            cagri++; return { text: JSON.stringify({ kartlar: [{ konuId: g.konu.konuId, soru: "Yığın nedir?", cevap: "sentetik-gizli-cevap",
                alinti: g.kaynaklar[0].icerik, kaynakReferansi: g.kaynaklar[0].anahtar }] }) };
        } } },
    });
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].durum, "hata");
    assert.equal(d.db.deste[0].hataKodu, "KART_GECERSIZ_YANIT");
    assert.equal(d.db.deste[0].hataTanilama.konuId, "yigin");
    assert.equal(d.db.deste[0].hataTanilama.dogrulamaAltKodu, "CEVAP_ALINTIDA_YOK");
    assert.equal(d.db.deste[0].konular.flatMap(k => k.kartlar).length, 0);
    await calismaKartlariniGetir(d.girdi, d.deps); await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(cagri, 1); assert.equal(d.isler.length, 0);
    assert.equal(d.tanilamalar[0].asama, "KART_DOGRULAMA");
    assert.doesNotMatch(JSON.stringify(d.tanilamalar), /sentetik-gizli|Yığın LIFO/);
    assert.ok(!("hataTanilama" in await calismaKartlariniGetir(d.girdi, d.deps)));
});

test("checkpoint yazımı başarısızsa başarı gösterilmez; kayıt aşaması ayrı loglanır", async () => {
    const d = duzenek(), kaydet = d.deps.DesteModel.findOneAndUpdate;
    d.deps.DesteModel.findOneAndUpdate = async (f, g) => {
        if (g.$set?.["konular.$.kartlar"]) throw new Error("sentetik-gizli-veritabani");
        return kaydet(f, g);
    };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].hataKodu, "KART_KAYIT_HATASI");
    assert.equal(d.db.deste[0].hataTanilama.asama, "VERITABANI_KAYDI");
    assert.equal(d.db.deste[0].konular.flatMap(k => k.kartlar).length, 0);
    assert.doesNotMatch(JSON.stringify(d.tanilamalar), /sentetik-gizli/);
    d.deps.DesteModel.findOneAndUpdate = kaydet;
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].durum, "hazir"); assert.equal(d.db.deste[0].hataTanilama, null);
});

test("hata durumu yazılamasa bile özgün hata ve kayıt sorunu güvenli tanılamada kalır", async () => {
    const d = duzenek(), guncelle = d.deps.DesteModel.updateOne;
    d.deps.kartUret = async () => { throw Object.assign(new Error("sentetik-gizli-sdk"), { kod: "GEMINI_GECICI_HATA" }); };
    d.deps.DesteModel.updateOne = async (f, g, opts) => {
        if (g.$set?.hataKodu) throw new Error("sentetik-gizli-kayit");
        return guncelle(f, g, opts);
    };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.deepEqual(d.tanilamalar.map(t => [t.kod, t.asama]), [["GEMINI_GECICI_HATA", "GEMINI_ISTEGI"], ["KART_KAYIT_HATASI", "VERITABANI_KAYDI"]]);
    assert.doesNotMatch(JSON.stringify(d.tanilamalar), /sentetik-gizli/);
});

test("tanılama serbest metinleri, ham yanıtı ve izin verilmeyen alt kodları dışlar", () => {
    const sonuc = kartHataTanilamasiniOlustur({ tanilama: { asama: "sentetik-gizli", dogrulamaAltKodu: "sentetik-gizli", yanit: "sentetik-gizli",
        finishReason: "sentetik-gizli", kartIndex: -1, gercekDenemeSayisi: 1, beklenenKartSayisi: "sentetik-gizli" } },
    { asama: "KAYNAK_SECIMI", konuId: "<sentetik-gizli>" });
    assert.deepEqual(sonuc, { asama: "KAYNAK_SECIMI", gercekDenemeSayisi: 1 });
});

test("boş derste Gemini çağrısı olmadan boş durum; hazır olmayan ders için açıklama", async () => {
    const d = duzenek();
    assert.equal((await calismaKartlariniGetir(d.girdi, d.deps)).durum, "yok");
    d.db.ders[0].materyallerOnaylandi = false;
    assert.equal((await calismaKartlariniGetir(d.girdi, d.deps)).olusturulabilir, false);
    await assert.rejects(calismaKartlariniOlustur(d.girdi, d.deps), h => h.status === 422);
    assert.equal(d.cagrilar.length, 0);
});

test("üretim yalnızca kullanıcı isteğiyle başlar; kayıtlar ve konu sayıları yenilemede aynıdır", async () => {
    const d = await hazirDuzenek();
    const a = await calismaKartlariniGetir(d.girdi, d.deps);
    const b = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(a.durum, "hazir"); assert.equal(a.istatistikler.toplam, 2);
    assert.deepEqual(a, b); assert.deepEqual(a.konular.map(k => k.kartSayisi), [1, 1]);
    await calismaKartlariniOlustur(d.girdi, d.deps);
    assert.equal(d.cagrilar.length, 2); assert.equal(d.isler.length, 0);
    assert.ok(d.cagrilar.every(c => c.kaynaklar.every(k => !k.icerik.includes("PASİF"))));
    assert.ok(!JSON.stringify(a).includes("aktifIslemToken"));
});

test("eşzamanlı aynı ders isteği tek üretim kilidi alır", async () => {
    const d = duzenek();
    const [a, b] = await Promise.all([calismaKartlariniOlustur(d.girdi, d.deps), calismaKartlariniOlustur(d.girdi, d.deps)]);
    assert.equal(a.desteId, b.desteId); assert.equal(d.isler.length, 1);
    await d.tamamla(); assert.equal(d.cagrilar.length, 2); assert.equal(d.db.deste.length, 1);
});

test("kısmi 503 hatasında ilk konu kalıcıdır; devam yalnızca eksik konuyu üretir", async () => {
    const d = duzenek(), uret = d.deps.kartUret;
    d.deps.kartUret = async g => {
        if (g.konu.konuId === "kuyruk") throw Object.assign(new Error("sentetik-gizli-ham-hata"), { kod: "GEMINI_GECICI_HATA" });
        return uret(g);
    };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    const kismi = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(kismi.durum, "kismi"); assert.equal(kismi.kartlar.length, 1);
    const eskiId = kismi.kartlar[0]._id;
    d.deps.kartUret = uret;
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    const tam = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(tam.durum, "hazir"); assert.equal(tam.kartlar[0]._id, eskiId);
    assert.equal(d.cagrilar.filter(c => c.konu.konuId === "yigin").length, 1);
    assert.equal(d.db.harita[0].durum, "hazir"); assert.equal(d.db.ders[0].materyallerOnaylandi, true);
    assert.doesNotMatch(JSON.stringify(tam), /sentetik-gizli/);
});

test("sunucu kesintisi: aktif durum yenilemede görünür, eski kilit sonrası checkpoint'ten devam eder", async () => {
    const d = duzenek(); await calismaKartlariniOlustur(d.girdi, d.deps);
    assert.equal((await calismaKartlariniGetir(d.girdi, d.deps)).durum, "olusturuluyor");
    d.isler.length = 0; d.zamaniIlerlet(181000);
    assert.equal((await calismaKartlariniGetir(d.girdi, d.deps)).durum, "hata");
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal((await calismaKartlariniGetir(d.girdi, d.deps)).durum, "hazir");
});

test("ilk görülme ve yıldız birbirinden bağımsız, kalıcı ve idempotenttir", async () => {
    const d = await hazirDuzenek(), kartId = d.db.deste[0].konular[0].kartlar[0]._id;
    const g = { ...d.girdi, kartId };
    await kartDurumunuGuncelle({ ...g, yildizli: true }, d.deps);
    assert.equal((await calismaKartlariniGetir(d.girdi, d.deps)).istatistikler.gorulen, 0);
    await kartDurumunuGuncelle({ ...g, goruldu: true }, d.deps);
    const ilk = d.db.durum[0].gorulduTarihi; d.zamaniIlerlet(10000);
    await kartDurumunuGuncelle({ ...g, goruldu: true }, d.deps);
    await kartDurumunuGuncelle({ ...g, yildizli: false }, d.deps);
    assert.equal(d.db.durum[0].gorulduTarihi, ilk);
    assert.deepEqual((await calismaKartlariniGetir(d.girdi, d.deps)).istatistikler, { toplam: 2, gorulen: 1, gorulmeyen: 1, yildizli: 0 });
    assert.equal(d.db.durum[0].sonrakiTekrarTarihi, null);
});

test("değerlendirme geçmişi eklenir; ağ tekrarında aynı kimlik ikinci kayıt oluşturmaz", async () => {
    const d = await hazirDuzenek(), kartId = d.db.deste[0].konular[0].kartlar[0]._id;
    const g = { ...d.girdi, kartId, istemciIstekId: "istek-degerlendirme-01", degerlendirme: "zor" };
    await assert.rejects(kartiDegerlendir(g, d.deps), h => h.kod === "KART_ONCE_CEVABI_AC");
    await kartDurumunuGuncelle({ ...d.girdi, kartId, goruldu: true }, d.deps);
    const a = await kartiDegerlendir(g, d.deps), b = await kartiDegerlendir(g, d.deps);
    assert.equal(a._id, b._id);
    for (const [i, degerlendirme] of ["tekrar", "orta", "kolay"].entries()) await kartiDegerlendir({ ...g, degerlendirme, istemciIstekId: `istek-yeni-${i}` }, d.deps);
    assert.deepEqual(d.db.degerlendirme.map(k => k.degerlendirme), ["zor", "tekrar", "orta", "kolay"]);
    await assert.rejects(kartiDegerlendir({ ...g, degerlendirme: "kolay" }, d.deps), h => h.status === 409);
});

test("yabancı kullanıcı, ders veya kart çalışma verisine erişemez", async () => {
    const d = await hazirDuzenek(), kartId = d.db.deste[0].konular[0].kartlar[0]._id;
    for (const g of [{ ...d.girdi, kullaniciId: id() }, { ...d.girdi, dersId: id() }]) {
        await assert.rejects(calismaKartlariniGetir(g, d.deps), h => h.status === 404);
        await assert.rejects(calismaKartlariniOlustur(g, d.deps), h => h.status === 404);
        await assert.rejects(kartDurumunuGuncelle({ ...g, kartId, yildizli: true }, d.deps), h => h.status === 404);
    }
    await assert.rejects(kartDurumunuGuncelle({ ...d.girdi, kartId: id(), goruldu: true }, d.deps), h => h.status === 404);
    assert.equal(d.db.durum.length, 0);
});

test("üretim sırasında kaynak sürümü değişirse geç gelen kart kaydedilmez", async () => {
    const d = duzenek(), uret = d.deps.kartUret;
    d.deps.kartUret = async g => { const r = await uret(g); d.db.materyal[0].aktifIslemeId = id(); return r; };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].konular.flatMap(k => k.kartlar).length, 0);
    assert.equal(d.db.deste[0].hataKodu, "KART_KAYNAK_DEGISTI");
    await assert.rejects(calismaKartlariniGetir(d.girdi, d.deps), h => h.status === 409);
});

test("ders silme kilidi geç gelen üretim veya çalışma durumu yazımını engeller", async () => {
    const d = duzenek(), uret = d.deps.kartUret;
    d.deps.kartUret = async g => { const r = await uret(g); d.db.ders[0].temizleniyor = true; return r; };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].konular.flatMap(k => k.kartlar).length, 0);
    await assert.rejects(kartDurumunuGuncelle({ ...d.girdi, kartId: id(), yildizli: true }, d.deps), h => h.status === 404);
});

test("API girdisi sayı/zorluk seçimini, görülmeyi geri almayı ve sahte tarihleri reddeder", () => {
    const req = { params: { dersId: id(), kartId: id() }, user: { _id: id() }, body: {} };
    for (const [tur, body] of [["olustur", { kartSayisi: 20 }], ["durum", { goruldu: false }], ["durum", { yildizli: "true" }], ["degerlendirme", { degerlendirme: "kolay", istemciIstekId: "gecerli-istek", zaman: "2020" }]]) {
        assert.throws(() => kartGirdisiniDogrula({ ...req, body }, tur), h => h.status === 400);
    }
    assert.equal(kartKonulariniGetir({ anaKonular: [{ konuId: "tek", baslik: "Tek", kaynakMateryalIds: [] }] })[0].konuId, "tek");
    assert.throws(() => kartKonulariniGetir({ anaKonular: [] }));
});

test("eski iş yeni kilit sahibinin sonucunu veya durumunu değiştiremez", async () => {
    const d = duzenek(), uret = d.deps.kartUret;
    const yeniToken = id();
    d.deps.kartUret = async g => { const r = await uret(g); d.db.deste[0].aktifIslemToken = yeniToken; return r; };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].aktifIslemToken, yeniToken);
    assert.equal(d.db.deste[0].durum, "olusturuluyor");
    assert.equal(d.db.deste[0].konular.flatMap(k => k.kartlar).length, 0);
});

test("kısmi destede çalışma durumu ve değerlendirmeler eksikler tamamlanırken korunur", async () => {
    const d = duzenek(), uret = d.deps.kartUret;
    d.deps.kartUret = async g => {
        if (g.konu.konuId === "kuyruk") throw new Error("sentetik hata");
        return uret(g);
    };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    const kartId = d.db.deste[0].konular[0].kartlar[0]._id;
    await kartDurumunuGuncelle({ ...d.girdi, kartId, goruldu: true, yildizli: true }, d.deps);
    await kartiDegerlendir({ ...d.girdi, kartId, degerlendirme: "orta", istemciIstekId: "kismi-istek-01" }, d.deps);
    d.deps.kartUret = uret;
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    const sonuc = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(sonuc.durum, "hazir");
    assert.deepEqual(sonuc.istatistikler, { toplam: 2, gorulen: 1, gorulmeyen: 1, yildizli: 1 });
    assert.equal(d.db.degerlendirme.length, 1);
    assert.equal(sonuc.kartlar[0]._id, kartId);
});

test("otomatik kart sayısı kaynak kapsamına göre 1–4 aralığındadır; yanlış materyalden kaynak alınmaz", async () => {
    const d = duzenek();
    d.db.parca[0].icerik = "Yığın LIFO işlemleri. ".repeat(350);
    await calismaKartlariniOlustur(d.girdi, d.deps);
    assert.deepEqual(d.db.deste[0].konular.map(k => k.hedefKartSayisi), [4, 1]);
    assert.equal(d.cagrilar.length, 0, "Planlama Gemini çağrısı yapmaz");
    const yanlis = duzenek();
    yanlis.db.harita[0].anaKonular[0].altKonular[0].kaynakMateryalIds = [id()];
    await assert.rejects(calismaKartlariniOlustur(yanlis.girdi, yanlis.deps), h => h.kod === "KART_KAYNAK_YETERSIZ");
    assert.equal(yanlis.isler.length, 0);
    assert.deepEqual(yanlis.tanilamalar, [{ kod: "KART_KAYNAK_YETERSIZ", asama: "KAYNAK_SECIMI", konuId: "yigin" }]);
});

test("422 kaynak regresyonu: konu bağlantıları boş olan çok materyalli onaylı harita, doğrulanmış kaynak snapshot'larını kullanır", async () => {
    const d = duzenek();
    const ikinciMateryal = { ...d.db.materyal[0], _id: id(), aktifIslemeId: id() };
    d.db.materyal.push(ikinciMateryal);
    d.db.parca.push({ ...d.girdi, materyalId: ikinciMateryal._id, islemeId: ikinciMateryal.aktifIslemeId,
        parcaIndex: 5, icerik: "İkinci belgede yığın ve kuyruk işlemlerinin ek ayrıntıları bulunur." });
    const harita = d.db.harita[0];
    harita.anaKonular[0].kaynakMateryalIds = [];
    for (const alt of harita.anaKonular[0].altKonular) alt.kaynakMateryalIds = [];
    harita.kaynakMateryaller = d.db.materyal.map(m => ({ materyalId: m._id, aktifIslemeId: m.aktifIslemeId }));
    const oncekiHarita = kopya(harita);
    const sonuc = await calismaKartlariniOlustur(d.girdi, d.deps);
    assert.equal(sonuc.durum, "olusturuluyor");
    assert.equal(d.cagrilar.length, 0, "Planlama aşamasında Gemini çağrılmamalı");
    await d.tamamla();
    assert.equal((await calismaKartlariniGetir(d.girdi, d.deps)).durum, "hazir");
    assert.equal(d.cagrilar.length, 2);
    const surumler = new Map(d.db.materyal.map(m => [m._id, m.aktifIslemeId]));
    assert.ok(d.cagrilar.every(c => c.kaynaklar.every(k => k.islemeId === surumler.get(k.materyalId))));
    assert.deepEqual(harita, oncekiHarita, "Konu haritası güncellenmemeli");
});

test("422 kaynak regresyonu: global aday kapsamı yalnızca mevcut aktif sürümle eşleşen harita kaynaklarından oluşur", () => {
    const materyalId = id(), islemeId = id(), ekId = id();
    const harita = { anaKonular: [{ konuId: "ana", baslik: "Ana", kaynakMateryalIds: [], altKonular: [{ konuId: "alt", baslik: "Alt", kaynakMateryalIds: [] }] }],
        kaynakMateryaller: [{ materyalId: new mongoose.Types.ObjectId(materyalId), aktifIslemeId: new mongoose.Types.ObjectId(islemeId) },
            { materyalId: ekId, aktifIslemeId: id() }] };
    const materyaller = [{ _id: materyalId, aktifIslemeId: islemeId }, { _id: ekId, aktifIslemeId: id() }, { _id: id(), aktifIslemeId: id() }];
    assert.deepEqual(kartKonulariniGetir(harita, materyaller)[0].kaynakIds, [materyalId]);
});

test("422 kaynak regresyonu: doğrulanamayan konu bağlantısı içerik yetersizliği diye bildirilmez ve Gemini çağrılmaz", async () => {
    const d = duzenek();
    d.db.harita[0].anaKonular[0].kaynakMateryalIds = [];
    for (const alt of d.db.harita[0].anaKonular[0].altKonular) alt.kaynakMateryalIds = [];
    d.db.harita[0].kaynakMateryaller = [{ materyalId: d.db.materyal[0]._id, aktifIslemeId: id() }];
    await assert.rejects(calismaKartlariniOlustur(d.girdi, d.deps), h => h.status === 422 && h.kod === "KART_KAYNAK_BAGLANTISI_EKSIK");
    assert.equal(d.cagrilar.length, 0); assert.equal(d.isler.length, 0); assert.equal(d.db.deste.length, 0);
});

test("422 kaynak kontrolü: alt konu kaynağı ana konuya ve harita geneline göre önceliklidir", () => {
    const anaId = id(), altId = id(), genelId = id(), surum = id();
    const harita = { kaynakMateryaller: [{ materyalId: genelId, aktifIslemeId: surum }], anaKonular: [
        { konuId: "ana", baslik: "Ana", kaynakMateryalIds: [anaId], altKonular: [
            { konuId: "alt-a", baslik: "A", kaynakMateryalIds: [altId] },
            { konuId: "alt-b", baslik: "B", kaynakMateryalIds: [] },
        ] },
    ] };
    const sonuc = kartKonulariniGetir(harita, [{ _id: genelId, aktifIslemeId: surum }]);
    assert.deepEqual(sonuc.map(k => k.kaynakIds), [[altId], [anaId]]);
});

test("422 kaynak kontrolü: ders geneli adayları kullanıcı/ders ve aktif sürüm sınırlarını aşamaz", async () => {
    const d = duzenek(), harita = d.db.harita[0];
    harita.anaKonular[0].kaynakMateryalIds = [];
    for (const alt of harita.anaKonular[0].altKonular) alt.kaynakMateryalIds = [];
    const yabanci = { ...d.db.materyal[0], _id: id(), aktifIslemeId: id(), kullaniciId: id() };
    d.db.materyal.push(yabanci);
    d.db.parca.push({ ...d.girdi, kullaniciId: yabanci.kullaniciId, materyalId: yabanci._id, islemeId: yabanci.aktifIslemeId,
        parcaIndex: 0, icerik: "Yığın ve kuyruk için YABANCI kullanıcı metni." });
    harita.kaynakMateryaller = d.db.materyal.map(m => ({ materyalId: m._id, aktifIslemeId: m.aktifIslemeId }));
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.cagrilar.length, 2);
    assert.ok(d.cagrilar.every(c => c.kaynaklar.every(k => k.materyalId !== yabanci._id && !k.icerik.includes("PASİF"))));
});

test("422 kaynak kontrolü: kısa kaynak bir eşik yüzünden elenmez; asıl kart doğrulaması korunur", async () => {
    const d = duzenek();
    d.db.parca[0].icerik = "Yığın LIFO.";
    d.db.parca[1].icerik = "Kuyruk FIFO.";
    const sonuc = await calismaKartlariniOlustur(d.girdi, d.deps);
    assert.equal(sonuc.durum, "olusturuluyor");
    assert.deepEqual(d.db.deste[0].konular.map(k => k.hedefKartSayisi), [1, 1]);
    assert.equal(d.cagrilar.length, 0);
});

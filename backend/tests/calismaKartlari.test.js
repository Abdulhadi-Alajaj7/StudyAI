import test from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import CalismaKartiDestesi from "../models/CalismaKartiDestesi.js";
import KartCalismaDurumu from "../models/KartCalismaDurumu.js";
import KartDegerlendirmesi from "../models/KartDegerlendirmesi.js";
import { geminiIleCalismaKartlariUret, geminiIleKartBatchiUret } from "../services/geminiService.js";
import { kartGirdisiniDogrula } from "../controllers/calismaKartlariController.js";
import { calismaKartlariniGetir, calismaKartlariniOlustur, kartDurumunuGuncelle, kartiDegerlendir, kartKonulariniGetir, konuKartKaynaklariniSec, kartUretimIsleriniDevamEttir, kartIsiBeklemesiniGetir } from "../services/calismaKartlariService.js";
import { kartHataTanilamasiniOlustur } from "../utils/calismaKartiTanilama.js";

const id = () => String(new mongoose.Types.ObjectId());
const kopya = v => v == null ? v : JSON.parse(JSON.stringify(v));
const deger = (d, yol) => yol.split(".").reduce((o, k) => Array.isArray(o) ? o.flatMap(a => a?.[k]) : o?.[k], d);
const eslesir = (d, f) => Object.entries(f).every(([k, v]) => {
    if (k === "$or") return v.some(a => eslesir(d, a));
    if (k === "$and") return v.every(a => eslesir(d, a));
    const x = deger(d, k);
    if (v && typeof v === "object") {
        if ("$ne" in v) return String(x) !== String(v.$ne);
        if ("$in" in v) return v.$in.some(a => String(a) === String(x));
        if ("$lte" in v) return x != null && new Date(x).getTime() <= new Date(v.$lte).getTime();
    }
    return Array.isArray(x) ? x.map(String).includes(String(v)) : v == null ? x == null : String(x) === String(v);
});
const zincir = veri => ({ select() { return this; }, sort() { return this; }, limit() { return this; }, session() { return this; }, async lean() { return kopya(veri); } });

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
            find(f) { if (ad === "parca") for (const p of db.parca) p._id ||= id(); sorgular.push({ ad, f: kopya(f) }); return zincir(db[ad].filter(d => eslesir(d, f))); },
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
        semanticArama: async () => ({ sonuclar: [] }), batchAyarlari: { konu: 1 },
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
                istemci: { models: { async generateContent(istek) {
                    const kanit = JSON.parse(istek.contents).kanitlar[0];
                    return { text: JSON.stringify({ kartlar: [{ konuId: g.konu.konuId,
                        kanitReferansi: kanit.kimlik, cevapIndex: kanit.cevaplar.indexOf(g.konu.konuId === "yigin" ? "LIFO" : "FIFO") }] }), candidates: [{ finishReason: "STOP" }] };
                } } }, maxDeneme: 1,
            });
        },
    };
    return { girdi, deps, db, isler, cagrilar, sorgular, tanilamalar, zamaniIlerlet: ms => { zaman = new Date(zaman.getTime() + ms); },
        async tamamla() { while (isler.length) await isler.shift()(); } };
};
const hazirDuzenek = async () => { const d = duzenek(); await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla(); return d; };

const batchSdkAyarla = (d, degistir = kartlar => kartlar) => {
    const istekler = [];
    d.deps.batchAyarlari = { konu: 3 };
    d.deps.kartBatchUret = g => geminiIleKartBatchiUret(g, { maxDeneme: 1, bekle: async () => {},
        istemci: { models: { async generateContent(istek) {
            const p = JSON.parse(istek.contents); istekler.push(p);
            const adaylar = p.konular.map(k => k.kaynaklar.flatMap(e => e.metin.split(/(?<=\.)\s+|\n/u).filter(m => m.endsWith(".")).map(m => {
                const kavram = m.includes(":") ? m.split(":")[0] : m.split(" ")[0];
                return { konuId: k.konuId, metinParcasiId: e.metinParcasiId, kavram,
                    soru: m.includes(":") ? `${kavram} neyi ifade eder?` : `${kavram} hangi ilkeyle çalışır?`, cevap: m, kanit: m };
            })).filter(c => !k.oncekiKavramlar.includes(c.kavram)));
            // Test modeli de tek yanıtın taşıma sınırına uyar; sonraki kavramlar kalır.
            const secimler = adaylar.map(() => []); let kalan = 4;
            for (let i = 0; kalan && adaylar.some((a, j) => a.length > secimler[j].length); i = (i + 1) % adaylar.length) {
                if (adaylar[i].length > secimler[i].length) { secimler[i].push(adaylar[i][secimler[i].length]); kalan--; }
            }
            const degisen = degistir(secimler.flat(), istekler.length);
            return { text: JSON.stringify({ konular: p.konular.map((k, i) => ({ konuId: k.konuId,
                tamamlandi: adaylar[i].length === secimler[i].length,
                bosNedeni: adaylar[i].length ? "" : k.oncekiKavramlar.length ? "kavramlar_zaten_kapsandi" : "ogrenilebilir_kavram_yok",
                kartlar: degisen.filter(c => c.konuId === k.konuId) })) }) };
        } } } });
    return istekler;
};

test("tek tıkla doğal çok konulu batch: sekiz kavram, kısmi checkpoint, otomatik devam ve öğrenci kaydı", async () => {
    const d = duzenek();
    d.db.parca[0].icerik = ["Yığın: Son giren elemanın ilk çıkarıldığı veri yapısıdır.",
        "Yığın push: Tepeye yeni eleman ekleme işlemidir.", "Yığın pop: Tepedeki elemanı çıkarma işlemidir.",
        "Yığın peek: Tepedeki elemanı çıkarmadan okuma işlemidir.", "Yığın taşması: Kapasitesi dolu yığına eleman ekleme girişimidir.",
        "Yığın alt taşması: Boş yığından eleman çıkarma girişimidir.", "Yığın çağrı belleği: İşlevlerin dönüş bilgilerini saklar.",
        "Yığın kapasitesi: Dizide ayrılan eleman sayısıyla sınırlıdır."].join("\n");
    const c = batchSdkAyarla(d, (kartlar, n) => kartlar.map((k, i) => n === 1 && i === 1 ? { ...k, metinParcasiId: "sahte" } : k));
    const eskiHarita = kopya(d.db.harita);
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    let r = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(c.length, 1); assert.equal(c[0].konular.length, 2); assert.equal(r.durum, "olusturuluyor");
    assert.equal(r.kartlar.length, 3); assert.equal(r.konular[0].eksikKartSayisi, null);
    const ids = r.kartlar.map(k => k._id), kartId = ids[0];
    await kartDurumunuGuncelle({ ...d.girdi, kartId, goruldu: true, yildizli: true }, d.deps);
    await kartiDegerlendir({ ...d.girdi, kartId, degerlendirme: "kolay", istemciIstekId: "batch-devam-istek-01" }, d.deps);
    for (let i = 0; i < 5 && d.db.deste[0].durum !== "hazir"; i++) {
        await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
    }
    r = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(r.durum, "hazir"); assert.equal(r.kartlar.length, 9);
    assert.equal(r.konular[0].kartSayisi, 8); assert.equal(c.length, 3);
    assert.ok(c[1].konular.some(k => k.oncekiKavramlar.length));
    assert.ok(c.every(p => p.konular.every(k => k.kaynaklar.length && !("kanitlar" in k))));
    assert.ok(r.kartlar.every(k => k.tur === "soru_cevap" && k.soru.endsWith("?")));
    assert.ok(ids.every(k => r.kartlar.some(c => c._id === k))); assert.equal(r.kartlar[0].yildizli, true);
    assert.equal(d.db.degerlendirme.length, 1); assert.equal(d.db.deste[0].uretimIsi.gercekSdkCagrisi, 3);
    assert.deepEqual(d.db.harita, eskiHarita);
    await calismaKartlariniGetir(d.girdi, d.deps); await kartUretimIsleriniDevamEttir(d.deps);
    assert.equal(d.isler.length, 0); assert.equal(c.length, 3);
});

test("V2+ batch checkpoint yazım hatası ilk konunun kalıcı kartını ve kimliğini korur", async () => {
    const d = duzenek(); const c = batchSdkAyarla(d);
    const kaydet = d.deps.DesteModel.findOneAndUpdate;
    d.deps.DesteModel.findOneAndUpdate = async (f, u) => {
        if (f["konular.konuId"] === "kuyruk" && u.$set?.["konular.$.kartlar"]) throw new Error("Sentetik transaction hatası");
        return kaydet(f, u);
    };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].hataKodu, "KART_KAYIT_HATASI");
    const eskiId = d.db.deste[0].konular[0].kartlar[0]._id;
    d.deps.DesteModel.findOneAndUpdate = kaydet; d.zamaniIlerlet(61_000);
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].durum, "hazir"); assert.equal(d.db.deste[0].konular[0].kartlar[0]._id, eskiId);
    assert.equal(c[1].konular.length, 1); assert.equal(c[1].konular[0].konuId, "kuyruk");
});

test("V2+ sıfır kavram konusu tamamlanır, kaynak hatalı konu tamamlandı sayılmaz", async () => {
    const d = duzenek(); batchSdkAyarla(d);
    d.db.parca[0].icerik = "Yığın çalışma notları";
    d.db.parca[1].icerik = "İlgisiz içindekiler başlığı";
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    const [ilk, ikinci] = d.db.deste[0].konular;
    assert.equal(ilk.tamamlandi, true); assert.equal(ilk.sifirKartNedeni, "ogrenilebilir_kavram_yok");
    assert.equal(ikinci.tamamlandi, false); assert.equal(ikinci.sifirKartNedeni, "kaynak_yok");
    assert.equal(d.db.deste[0].sonIslemSdkCagrisi, 1);
});

test("V2+ kaynak değiştiğinde eski kartlar ve öğrenci kayıtları salt okunur sunulur", async () => {
    const d = await hazirDuzenek();
    const once = await calismaKartlariniGetir(d.girdi, d.deps), kartId = once.kartlar[0]._id;
    await kartDurumunuGuncelle({ ...d.girdi, kartId, goruldu: true, yildizli: true }, d.deps);
    d.db.materyal[0].aktifIslemeId = id();
    const sonra = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.deepEqual(sonra.kartlar.map(k => k._id), once.kartlar.map(k => k._id));
    assert.equal(sonra.kartlar[0].yildizli, true); assert.equal(sonra.kaynakGuncel, false);
    await assert.rejects(calismaKartlariniOlustur(d.girdi, d.deps), { kod: "KART_KAYNAK_DEGISTI" });
    await assert.rejects(kartDurumunuGuncelle({ ...d.girdi, kartId, yildizli: false }, d.deps), { kod: "KART_KAYNAK_DEGISTI" });
});

const sdkYanitiniAyarla = (d, yanitla, maxDeneme = 1) => {
    const cagrilar = [];
    d.deps.kartUret = g => geminiIleCalismaKartlariUret(g, { maxDeneme, bekle: async () => {}, rastgele: () => 0,
        istemci: { models: { async generateContent(istek) {
            const prompt = JSON.parse(istek.contents); cagrilar.push({ g, prompt });
            return { text: JSON.stringify({ kartlar: await yanitla(g, prompt) }) };
        } } },
    });
    return cagrilar;
};

test("üç geçerli kart atomik korunur; yalnızca dördüncü tamamlanır ve çalışma geçmişi değişmez", async () => {
    const d = duzenek(); d.db.harita[0].anaKonular[0].altKonular.length = 1;
    d.db.parca[0].icerik = "Yığın ekleme işlemi push olarak adlandırılır. Yığın çıkarma işlemi pop olarak adlandırılır. Yığın taşması kapasite doluyken oluşur. Yığın boşluğu hiç eleman kalmadığında oluşur. " + "Açıklayıcı kaynak içeriği ".repeat(200);
    let tur = 0;
    const cagrilar = sdkYanitiniAyarla(d, (g, p) => {
        tur++;
        return tur === 1 ? ["push", "pop", "kapasite", "sahte"].map((m, i) => ({ konuId: g.konu.konuId,
            kanitReferansi: i === 3 ? "sahte" : p.kanitlar[i].kimlik, cevapIndex: i === 3 ? 99 : p.kanitlar[i].cevaplar.indexOf(m) }))
            : [{ konuId: g.konu.konuId, kanitReferansi: p.kanitlar[3].kimlik, cevapIndex: p.kanitlar[3].cevaplar.indexOf("eleman") }];
    });
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    let sonuc = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(sonuc.durum, "olusturuluyor"); assert.equal(sonuc.kartlar.length, 3);
    assert.equal(sonuc.konular[0].eksikKartSayisi, null); assert.equal(sonuc.ilerleme.tamamlananKonu, 0);
    const kimlikler = sonuc.kartlar.map(k => k._id), kartId = kimlikler[0];
    await kartDurumunuGuncelle({ ...d.girdi, kartId, goruldu: true, yildizli: true }, d.deps);
    await kartiDegerlendir({ ...d.girdi, kartId, degerlendirme: "zor", istemciIstekId: "kismi-v1-istek-01" }, d.deps);
    // Eksik kartın DB checkpoint'i başarısız olduğunda eski üç kart ezilmez.
    const kaydet = d.deps.DesteModel.findOneAndUpdate;
    d.deps.DesteModel.findOneAndUpdate = async (f, u) => {
        if (u.$set?.["konular.$.kartlar"]) throw new Error("sentetik-kayit-hatasi");
        return kaydet(f, u);
    };
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
    assert.deepEqual((await calismaKartlariniGetir(d.girdi, d.deps)).kartlar.map(k => k._id), kimlikler);
    d.deps.DesteModel.findOneAndUpdate = kaydet; d.zamaniIlerlet(61_000);
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
    sonuc = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(sonuc.durum, "hazir"); assert.equal(sonuc.kartlar.length, 4);
    assert.deepEqual(sonuc.kartlar.slice(0, 3).map(k => k._id), kimlikler);
    assert.deepEqual(cagrilar.map(c => c.prompt.kartSayisi), [4, 1, 1]);
    assert.equal(sonuc.kartlar[0].goruldu, true); assert.equal(sonuc.kartlar[0].yildizli, true);
    assert.equal(d.db.degerlendirme.length, 1);
});

test("ilk konunun doğrulama hatası ikinci konuya engel olmaz; yalnızca başarısız konu yeniden denenir", async () => {
    const d = duzenek();
    const cagrilar = sdkYanitiniAyarla(d, (g, p) => [{ konuId: g.konu.konuId, kanitReferansi: p.kanitlar[0].kimlik,
        cevapIndex: g.konu.konuId === "yigin" ? 99 : p.kanitlar[0].cevaplar.indexOf("FIFO") }]);
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].durum, "olusturuluyor");
    assert.equal(d.db.deste[0].konular[0].tamamlandi, false);
    assert.equal(d.db.deste[0].konular[1].tamamlandi, true);
    const eskiId = d.db.deste[0].konular[1].kartlar[0]._id;
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
    assert.deepEqual(cagrilar.map(c => c.g.konu.konuId), ["yigin", "kuyruk", "yigin"]);
    assert.equal(d.db.deste[0].konular[1].kartlar[0]._id, eskiId);
});

test("503 retry sınırı sonrası diğer konular çağrılmaz; ret ve SDK sayısı güvenli kaydedilir", async () => {
    const d = duzenek();
    const cagrilar = sdkYanitiniAyarla(d, () => { throw Object.assign(new Error("sentetik-503"), { status: 503 }); }, 2);
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(cagrilar.length, 2); assert.ok(cagrilar.every(c => c.g.konu.konuId === "yigin"));
    assert.equal(d.db.deste[0].hataKodu, "GEMINI_GECICI_HATA");
    assert.equal(d.db.deste[0].sonIslemSdkCagrisi, 2); assert.equal(d.db.deste[0].ayrilanCagriSayisi, 2);
    assert.equal(d.db.deste[0].konular[0].sdkCagriSayisi, 2); assert.equal(d.db.deste[0].konular[0].sonDenemeSdkCagrisi, 2);
    assert.equal(d.db.deste[0].konular[0].reddedilenKartlar[0].orijinalHttpDurumu, 503);
    assert.equal(d.db.deste[0].konular[1].denemeSayisi, 0);
});

const cokKonuluDuzenek = () => {
    const d = duzenek(), m = d.db.materyal[0];
    d.db.harita[0].anaKonular[0].altKonular = Array.from({ length: 4 }, (_, i) => ({ konuId: `konu${i}`, baslik: `Konu${i}`, kaynakMateryalIds: [m._id] }));
    d.db.parca = d.db.harita[0].anaKonular[0].altKonular.map((k, i) => ({ ...d.girdi, materyalId: m._id, islemeId: m.aktifIslemeId,
        parcaIndex: i, icerik: `${k.baslik} öğrenilirken Terim${i} kavramı kullanılır.` }));
    return d;
};
const cokKonuYanitla = (g, p) => [{ konuId: g.konu.konuId, kanitReferansi: p.kanitlar[0].kimlik, cevapIndex: p.kanitlar[0].cevaplar.indexOf(`Terim${g.konu.konuId.slice(4)}`) }];

test("iki zamanlayıcı ve yinelenen POST yalnız bir devam turu başlatır; hazır kartlar beklerken okunur", async () => {
    const d = cokKonuluDuzenek(); d.deps.cagriSinirlari = { islem: 1, ders: 10 };
    const c = sdkYanitiniAyarla(d, cokKonuYanitla);
    await kartUretimIsleriniDevamEttir(d.deps); assert.equal(d.isler.length, 0);
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    const ilkId = d.db.deste[0].konular[0].kartlar[0]._id;
    assert.equal((await calismaKartlariniGetir(d.girdi, d.deps)).kartlar.length, 1);
    await Promise.all([kartUretimIsleriniDevamEttir(d.deps), kartUretimIsleriniDevamEttir(d.deps), calismaKartlariniOlustur(d.girdi, d.deps)]);
    assert.equal(d.isler.length, 1); await d.tamamla();
    for (let i = 0; i < 2; i++) { await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla(); }
    assert.equal(c.length, 4); assert.equal(d.db.deste.length, 1); assert.equal(d.db.deste[0].durum, "hazir");
    assert.equal(d.db.deste[0].konular[0].kartlar[0]._id, ilkId);
});

test("kalıcı kota beklemesi zamanı gelmeden POST veya restart ile atlanamaz; sonra otomatik devam eder", async () => {
    for (const kod of ["GEMINI_YEREL_RPM", "GEMINI_YEREL_TPM", "GEMINI_YEREL_RPD", "GEMINI_GUNLUK_KOTA", "GEMINI_KOTA_ASIMI"]) {
        const d = duzenek(), uret = d.deps.kartUret; let deneme = 0;
        d.deps.kartUret = async g => { deneme++; if (deneme === 1) throw Object.assign(new Error("kota"), { kod, retryAfterMs: 70_000 }); return uret(g); };
        await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
        assert.equal(d.db.deste[0].uretimIsi.durum, "bekliyor", kod);
        const tarih = new Date(d.db.deste[0].uretimIsi.sonrakiDeneme).getTime();
        await calismaKartlariniOlustur(d.girdi, d.deps);
        await kartUretimIsleriniDevamEttir({ ...d.deps }); assert.equal(d.isler.length, 0);
        d.zamaniIlerlet(tarih - d.deps.simdi().getTime() - 1);
        await kartUretimIsleriniDevamEttir(d.deps); assert.equal(d.isler.length, 0);
        d.zamaniIlerlet(1); await kartUretimIsleriniDevamEttir({ ...d.deps }); await d.tamamla();
        assert.equal(d.db.deste[0].durum, "hazir", kod);
    }
});

test("restart tamamlanmış kaynakları ve öğrenci kaydını korur; seçilmiş kaynaklar için yeniden embedding istemez", async () => {
    const d = duzenek(); d.deps.cagriSinirlari = { islem: 1, ders: 12 }; let semantic = 0;
    d.deps.semanticArama = async () => { semantic++; return { sonuclar: [] }; };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    const kartId = d.db.deste[0].konular[0].kartlar[0]._id;
    await kartDurumunuGuncelle({ ...d.girdi, kartId, goruldu: true, yildizli: true }, d.deps);
    const once = semantic;
    // Kuyruk belleği olmadan yeni worker yalnız DB checkpoint'inden devam eder.
    d.isler.length = 0;
    await kartUretimIsleriniDevamEttir({ ...d.deps }); await d.tamamla();
    assert.equal(semantic, once); assert.equal(d.db.deste[0].durum, "hazir");
    const r = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(r.kartlar[0]._id, kartId); assert.equal(r.kartlar[0].yildizli, true); assert.equal(r.kartlar[0].goruldu, true);
});

test("izinli toplam tüketim sınırı gün, restart veya manuel istekle sıfırlanmaz", async () => {
    const d = cokKonuluDuzenek(); d.deps.cagriSinirlari = { islem: 1, ders: 8, toplam: 2 };
    const c = sdkYanitiniAyarla(d, cokKonuYanitla);
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].uretimIsi.durum, "durduruldu");
    assert.equal(d.db.deste[0].hataKodu, "KART_TOPLAM_CAGRI_SINIRI");
    assert.equal((await calismaKartlariniGetir(d.girdi, d.deps)).olusturulabilir, false);
    d.zamaniIlerlet(2 * 86400_000); await kartUretimIsleriniDevamEttir(d.deps);
    await assert.rejects(calismaKartlariniOlustur(d.girdi, d.deps), { kod: "KART_TOPLAM_CAGRI_SINIRI" });
    assert.equal(c.length, 2); assert.equal(d.isler.length, 0);
});

test("geçici 503 devamı sınırlıdır; kalıcı model hatası otomatik tekrar edilmez", async () => {
    for (const kod of ["GEMINI_GECICI_HATA", "GEMINI_MODEL_BULUNAMADI"]) {
        const d = duzenek(); let sayi = 0;
        d.deps.kartUret = async () => { sayi++; throw Object.assign(new Error("sentetik"), { kod }); };
        await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
        for (let i = 0; i < 6; i++) { d.zamaniIlerlet(500_000); await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla(); }
        assert.equal(sayi, kod === "GEMINI_GECICI_HATA" ? 4 : 1);
        assert.equal(d.db.deste[0].uretimIsi.durum, "durduruldu");
    }
    assert.equal(kartIsiBeklemesiniGetir({ kod: "GEMINI_ISTEK_BOYUTU" }, Date.now()), null);
});

test("model ilerleme bildirmeden sürekli boş sonuç döndürürse otomatik üretim durur", async () => {
    const d = duzenek(); let sayi = 0;
    d.deps.kartBatchUret = async ({ isler }) => { sayi++; return { sonuclar: isler.map(i => ({ konuId: i.konu.konuId, kartlar: [], reddedilenler: [], kaynaklarTamamlandi: false })) }; };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    for (let i = 0; i < 5; i++) { await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla(); }
    assert.equal(sayi, 6); assert.equal(d.db.deste[0].hataKodu, "KART_ILERLEME_YOK");
    assert.equal(d.db.deste[0].uretimIsi.durum, "durduruldu");
});

test("tek çağrılık turda yalnız semantik kaynaklı konular sırayla seçilir; bütçe bitti diye elenmez", async () => {
    const d = duzenek(); d.deps.cagriSinirlari = { islem: 1, ders: 8 };
    const alt = d.db.harita[0].anaKonular[0].altKonular;
    alt[0].baslik = "Son Gelen Önce Ayrılır"; alt[1].baslik = "İlk Gelen Önce Ayrılır";
    let embedding = 0; const c = batchSdkAyarla(d);
    d.deps.semanticArama = async ({ apiCagriButcesi: b, sorgu }) => {
        if (b.kullanilan >= b.maksimum) throw Object.assign(new Error("Tur dolu"), { kod: "GEMINI_CAGRI_BUTCESI_ASILDI" });
        b.kullanilan++; embedding++;
        const p = d.db.parca[sorgu.startsWith("Son") ? 0 : 1];
        return { sonuclar: [{ ...p, metinParcasiId: p._id, skor: 0.95 }] };
    };
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].uretimIsi.durum, "kuyrukta"); assert.equal(c.length, 0);
    assert.ok(d.db.deste[0].konular.every(k => !k.uretimiDurduruldu));
    for (let i = 0; i < 3; i++) { await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla(); }
    assert.equal(d.db.deste[0].durum, "hazir"); assert.equal(embedding, 2); assert.equal(c.length, 1);
    assert.equal(d.db.deste[0].uretimIsi.gercekSdkCagrisi, 3);
});

test("embedding 503 ve RPM beklemesi lexical kaynağı olmayan konuyu kaynak yok diye kapatmaz", async () => {
    for (const kod of ["EMBEDDING_SERVIS_HATASI", "GEMINI_YEREL_RPM"]) {
        const d = duzenek(); d.db.harita[0].anaKonular[0].altKonular.length = 1;
        d.db.harita[0].anaKonular[0].altKonular[0].baslik = "Son Gelen Önce Ayrılır";
        batchSdkAyarla(d); const once = kopya(d.db.parca);
        d.deps.semanticArama = async () => { throw Object.assign(new Error("Kesinti"), { kod, retryAfterMs: 90_000 }); };
        await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
        assert.equal(d.db.deste[0].uretimIsi.durum, "bekliyor");
        assert.equal(d.db.deste[0].konular[0].uretimiDurduruldu, false);
        const fark = new Date(d.db.deste[0].uretimIsi.sonrakiDeneme).getTime() - d.deps.simdi().getTime();
        assert.ok(fark >= 90_000);
        d.deps.semanticArama = async () => ({ sonuclar: [{ ...d.db.parca[0], metinParcasiId: d.db.parca[0]._id, skor: 0.95 }] });
        d.zamaniIlerlet(fark); await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
        assert.equal(d.db.deste[0].durum, "hazir");
        assert.deepEqual(d.db.parca.map(({ _id, ...p }) => p), once.map(({ _id, ...p }) => p));
    }
});

test("işlem ve ders çağrı bütçesi kalıcıdır; eşzamanlı POST çift hak ayırmaz, pencere dolunca devam eder", async () => {
    const d = cokKonuluDuzenek(); d.deps.cagriSinirlari = { islem: 2, ders: 3, toplam: 8 };
    const cagrilar = sdkYanitiniAyarla(d, cokKonuYanitla);
    await Promise.all([calismaKartlariniOlustur(d.girdi, d.deps), calismaKartlariniOlustur(d.girdi, d.deps)]);
    assert.equal(d.isler.length, 1); assert.equal(d.db.deste[0].ayrilanCagriSayisi, 2);
    await d.tamamla();
    assert.equal(cagrilar.length, 2); assert.equal(d.db.deste[0].uretimIsi.durum, "kuyrukta");
    const eskiId = d.db.deste[0].konular[0].kartlar[0]._id;
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
    assert.equal(cagrilar.length, 3); assert.equal(d.db.deste[0].ayrilanCagriSayisi, 3);
    await kartUretimIsleriniDevamEttir(d.deps);
    assert.equal(d.db.deste[0].uretimIsi.durum, "bekliyor");
    assert.equal(d.db.deste[0].hataKodu, "KART_DERS_CAGRI_SINIRI");
    assert.equal(d.isler.length, 0); assert.equal(cagrilar.length, 3);
    d.zamaniIlerlet(24 * 60 * 60_000 + 1001);
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].durum, "hazir"); assert.equal(cagrilar.length, 4);
    assert.equal(d.db.deste[0].ayrilanCagriSayisi, 1); assert.equal(d.db.deste[0].konular[0].kartlar[0]._id, eskiId);
});

test("doğrulamada sürekli başarısız ilk konu bütçe bitince hiç denenmemiş konuları aç bırakmaz", async () => {
    const d = cokKonuluDuzenek(); d.deps.cagriSinirlari = { islem: 2, ders: 12 };
    const cagrilar = sdkYanitiniAyarla(d, (g, p) => g.konu.konuId === "konu0" ? [] : cokKonuYanitla(g, p));
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
    assert.deepEqual(cagrilar.map(c => c.g.konu.konuId), ["konu0", "konu1", "konu2", "konu3"]);
    assert.equal(d.db.deste[0].konular.filter(k => k.tamamlandi).length, 3);
});

test("sunucu kesintisinde bilinmeyen ayrılmış hak geri verilmez; yeniden başlatmak ders bütçesini aşmaz", async () => {
    const d = cokKonuluDuzenek(); d.deps.cagriSinirlari = { islem: 2, ders: 3 };
    const cagrilar = sdkYanitiniAyarla(d, cokKonuYanitla);
    await calismaKartlariniOlustur(d.girdi, d.deps); d.isler.length = 0;
    d.zamaniIlerlet(181000);
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
    assert.equal(cagrilar.length, 1); assert.equal(d.db.deste[0].ayrilanCagriSayisi, 3);
    await assert.rejects(calismaKartlariniOlustur(d.girdi, d.deps), h => h.kod === "KART_TOPLAM_CAGRI_SINIRI");
});

test("konu başlığının birebir geçmesi gerekmez; açıklama ve Türkçe ekler kaynak eşleştirmesini korur", () => {
    const d = duzenek(), m = d.db.materyal[0];
    const konu = { baslik: "Son Giren İlk Çıkar", aciklama: "Yığının LIFO", kaynakIds: [m._id] };
    const s = konuKartKaynaklariniSec(konu, d.db.parca.slice(0, 2), [m]);
    assert.equal(s.length, 1); assert.match(s[0].icerik, /Yığın/);
    assert.equal(konuKartKaynaklariniSec({ ...konu, baslik: "YIĞIN", aciklama: "" }, d.db.parca.slice(0, 2), [m]).length, 1);
    assert.equal(konuKartKaynaklariniSec({ ...konu, baslik: "Fotosentez Klorofil", aciklama: "" }, d.db.parca.slice(0, 2), [m]).length, 0);
});

test("başlığı kaynakta geçmeyen konu açıklaması kanıt seçimine kadar korunur", async () => {
    const d = duzenek();
    d.db.harita[0].anaKonular[0].altKonular.length = 1;
    Object.assign(d.db.harita[0].anaKonular[0].altKonular[0], { baslik: "Son Giren İlk Çıkar", aciklama: "Yığın LIFO" });
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].durum, "hazir"); assert.equal(d.db.deste[0].konular[0].kartlar[0].cevap, "LIFO");
    assert.equal(d.cagrilar[0].konu.aciklama, "Yığın LIFO");
});

test("kart reddi konu bazında alt koduyla kaydedilir; GET tekrar üretmez", async () => {
    const d = duzenek(); let cagri = 0;
    d.deps.kartUret = g => geminiIleCalismaKartlariUret(g, { maxDeneme: 1,
        istemci: { models: { async generateContent() {
            cagri++; return { text: JSON.stringify({ kartlar: [{ konuId: g.konu.konuId,
                kanitReferansi: `${g.kaynaklar[0].anahtar}.E1`, cevapIndex: 99 }] }) };
        } } },
    });
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.equal(d.db.deste[0].durum, "olusturuluyor");
    assert.equal(d.db.deste[0].konular[0].hataKodu, "KART_GECERSIZ_YANIT");
    assert.equal(d.db.deste[0].konular[0].reddedilenKartlar[0].konuId, "yigin");
    assert.equal(d.db.deste[0].konular[0].reddedilenKartlar[0].dogrulamaAltKodu, "CEVAP_ARALIGI_GECERSIZ");
    assert.equal(d.db.deste[0].konular.flatMap(k => k.kartlar).length, 0);
    await calismaKartlariniGetir(d.girdi, d.deps); await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(cagri, 2); assert.equal(d.isler.length, 0);
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
    d.deps.DesteModel.findOneAndUpdate = kaydet; d.zamaniIlerlet(61_000);
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
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
    assert.equal(kismi.durum, "olusturuluyor"); assert.equal(kismi.kartlar.length, 1);
    const eskiId = kismi.kartlar[0]._id;
    d.deps.kartUret = uret; d.zamaniIlerlet(61_000);
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
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
    assert.equal((await calismaKartlariniGetir(d.girdi, d.deps)).durum, "olusturuluyor");
    await kartUretimIsleriniDevamEttir(d.deps); await d.tamamla();
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
    const eski = await calismaKartlariniGetir(d.girdi, d.deps);
    assert.equal(eski.kaynakGuncel, false); assert.equal(eski.olusturulabilir, false);
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

test("tekrarlanan kaynak hedefi şişirmez; yanlış materyal başarısız konu olarak kaydedilir", async () => {
    const d = duzenek();
    d.db.parca[0].icerik = "Yığın LIFO işlemleri. ".repeat(350);
    await calismaKartlariniOlustur(d.girdi, d.deps);
    assert.equal(d.cagrilar.length, 0, "Planlama Gemini çağrısı yapmaz");
    await d.tamamla();
    assert.deepEqual(d.db.deste[0].konular.map(k => k.hedefKartSayisi), [1, 1]);
    const yanlis = duzenek();
    yanlis.db.harita[0].anaKonular[0].altKonular[0].kaynakMateryalIds = [id()];
    await calismaKartlariniOlustur(yanlis.girdi, yanlis.deps); await yanlis.tamamla();
    assert.equal(yanlis.db.deste[0].konular[0].hataKodu, "KART_KAYNAK_YETERSIZ");
    assert.equal(yanlis.db.deste[0].konular[0].tamamlandi, false);
    assert.ok(yanlis.cagrilar.every(c => c.konu.konuId !== "yigin"));
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
    await calismaKartlariniOlustur(d.girdi, d.deps); await d.tamamla();
    assert.ok(d.db.deste[0].konular.every(k => k.hataKodu === "KART_KAYNAK_BAGLANTISI_EKSIK" && !k.tamamlandi));
    assert.equal(d.cagrilar.length, 0); assert.equal(d.isler.length, 0);
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
    assert.equal(d.cagrilar.length, 0);
    await d.tamamla();
    assert.deepEqual(d.db.deste[0].konular.map(k => k.hedefKartSayisi), [1, 1]);
});

import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Kullanici from "../models/Kullanici.js";
import kimlikDogrula from "../middleware/auth.js";
import { kayitOl, girisYap, kayitEmailiniDogrula } from "../controllers/authControllers.js";
import { kayitDogrulamaServisiOlustur, kayitDogrulamaServisi, KAYIT_DOGRULAMA_MESAJI } from "../services/kayitDogrulamaService.js";
import { dogrulanmamisHesaplariTemizle } from "../services/geciciDersTemizlemeService.js";
import { kayitDogrulamaEpostasi, sifreSifirlamaEpostasi } from "../services/epostaSablonlari.js";
import { readFile } from "node:fs/promises";
import authRoutes from "../routes/authRoutes.js";
import AuthIstekSiniri from "../models/AuthIstekSiniri.js";

process.env.JWT_SECRET = "yalniz-kayit-test-anahtari";
const SAAT = 3600_000, baslangic = Date.parse("2026-11-14T10:00:00Z");
const kopya = v => structuredClone(v);
const eslesir = (d, f) => Object.entries(f).every(([k, v]) => {
    if (k === "$or") return v.some(x => eslesir(d, x));
    if (k === "$and") return v.every(x => eslesir(d, x));
    if (v && typeof v === "object" && !(v instanceof Date)) {
        if ("$exists" in v) return (d[k] !== undefined) === v.$exists;
        if ("$gt" in v) return d[k] > v.$gt;
        if ("$lte" in v) return d[k] <= v.$lte;
    }
    return String(d[k]) === String(v);
});
const uygula = (d, u) => {
    Object.assign(d, u.$set);
    for (const [k, v] of Object.entries(u.$inc || {})) d[k] = (d[k] || 0) + v;
    for (const k of Object.keys(u.$unset || {})) delete d[k];
};
const q = v => ({ select() { return this; }, sort() { return this; }, limit(n) { v = v.slice(0, n); return this; },
    lean: async () => kopya(v), then: (a, b) => Promise.resolve(v).then(a, b) });
const resOlustur = () => ({ statusCode: 200, cookies: [], status(n) { this.statusCode = n; return this; },
    json(v) { this.body = v; return this; }, cookie(...a) { this.cookies.push(a); }, set() { return this; } });
const duzenek = () => {
    let zaman = baslangic, n = 0, t = 0;
    const db = [], postalar = [], yazimlar = [], loglar = [];
    const Model = {
        async create(g) {
            if (db.some(k => k.email === g.email)) throw Object.assign(new Error(), { code: 11000 });
            const d = { ...g, _id: `u${++n}`, sifre: await Kullanici.sifreyiHashle(g.sifre) }; db.push(d); return d;
        },
        findOne(f) { const d = db.find(k => eslesir(k, f)); return q(d ? { ...d, sifreEslesiyorMu: p => bcrypt.compare(p, d.sifre) } : null); },
        findById(id) { return q(db.find(k => k._id === id) || null); },
        find(f) { return q(db.filter(k => eslesir(k, f))); },
        findOneAndUpdate(f, u) {
            const d = db.find(k => eslesir(k, f)); if (d) { uygula(d, u); yazimlar.push(kopya(u)); }
            return q(d ? kopya(d) : null);
        },
        async updateOne(f, u) { const d = db.find(k => eslesir(k, f)); if (d) uygula(d, u); return { matchedCount: d ? 1 : 0 }; },
        async deleteOne(f) { const i = db.findIndex(k => eslesir(k, f)); if (i < 0) return { deletedCount: 0 }; db.splice(i, 1); return { deletedCount: 1 }; },
    };
    const eposta = { ayarlariGetir: () => ({ clientUrl: "https://studyai.example.test" }), sirayaAl: m => { postalar.push(m); return true; } };
    const servis = kayitDogrulamaServisiOlustur({ Model, eposta, simdi: () => zaman, tokenUret: () => (++t).toString(16).padStart(64, "0") });
    const temizle = bagliModeller => dogrulanmamisHesaplariTemizle({ KullaniciModel: Model, simdi: () => zaman,
        bagliModeller: bagliModeller || [{ exists: async () => null }], logger: { error: x => loglar.push(x), warn: x => loglar.push(x) } });
    return { db, Model, servis, eposta, postalar, yazimlar, loglar, temizle, ilerlet: ms => { zaman += ms; },
        token: () => postalar.at(-1).text.match(/hesap-dogrula\/([a-f0-9]{64})/)[1],
        kaydet: () => servis.kaydet({ kullaniciAdi: "Öğrenci", email: "ogrenci@example.test", sifre: "Guvenli123!" }) };
};

test("yeni kayıt doğrulanmamış oluşturulur, hash saklanır; cookie ve JWT verilmez", async t => {
    const d = duzenek(); t.mock.method(Kullanici, "findOne", f => d.Model.findOne(f));
    t.mock.method(kayitDogrulamaServisi, "kaydet", g => d.servis.kaydet(g));
    const r = resOlustur(); await kayitOl({ body: { kullaniciAdi: "Öğrenci", email: "ogrenci@example.test", sifre: "Guvenli123!" } }, r);
    assert.equal(r.statusCode, 201); assert.equal(r.cookies.length, 0); assert.equal(r.body.token, undefined);
    assert.equal(r.body.mesaj, KAYIT_DOGRULAMA_MESAJI); assert.equal(d.db[0].emailDogrulandi, false);
    assert.equal(d.db[0].kayitDogrulamaSonTarih.getTime(), baslangic + SAAT);
    assert.ok(!JSON.stringify(d.db[0]).includes(d.token())); assert.ok(await bcrypt.compare("Guvenli123!", d.db[0].sifre));
});

test("doğrulanmamış kullanıcı giriş ve cookie/Bearer korumalı erişim yapamaz; doğrulanınca giriş başarılıdır", async t => {
    const d = duzenek(); await d.kaydet();
    t.mock.method(Kullanici, "findOne", f => d.Model.findOne(f)); t.mock.method(Kullanici, "findById", id => d.Model.findById(id));
    const r = resOlustur(); await girisYap({ body: { email: d.db[0].email, sifre: "Guvenli123!" } }, r);
    assert.equal(r.statusCode, 403); assert.equal(r.body.kod, "EMAIL_DOGRULAMA_GEREKLI"); assert.equal(r.cookies.length, 0);
    const token = jwt.sign({ id: d.db[0]._id }, process.env.JWT_SECRET);
    for (const req of [{ cookies: { token }, headers: {} }, { headers: { authorization: `Bearer ${token}` } }]) {
        const r2 = resOlustur(); await kimlikDogrula(req, r2, () => assert.fail()); assert.equal(r2.statusCode, 403);
    }
    await d.servis.dogrula(d.token());
    const r3 = resOlustur(); await girisYap({ body: { email: d.db[0].email, sifre: "Guvenli123!" } }, r3);
    assert.equal(r3.statusCode, 200); assert.equal(r3.cookies.length, 1);
});

test("token tek kullanımlıktır; paralel doğrulamalardan yalnız biri başarılıdır, otomatik giriş yapılmaz", async t => {
    const d = duzenek(); await d.kaydet(); const token = d.token();
    const r = await Promise.allSettled([d.servis.dogrula(token), d.servis.dogrula(token)]);
    assert.equal(r.filter(x => x.status === "fulfilled").length, 1); assert.equal(d.db[0].kayitDogrulamaTokenHash, undefined);
    await assert.rejects(d.servis.dogrula(token), { kod: "KAYIT_DOGRULAMA_GECERSIZ" });
    t.mock.method(kayitDogrulamaServisi, "dogrula", async () => {});
    const res = resOlustur(); await kayitEmailiniDogrula({ body: { token } }, res); assert.equal(res.cookies.length, 0); assert.equal(res.body.token, undefined);
});

test("bir saatten önce hesap korunur; tam bir saatte süresi dolan doğrulanmamış hesap silinir ve adres yeniden kullanılabilir", async () => {
    const d = duzenek(); await d.kaydet();
    d.ilerlet(SAAT - 1); assert.equal((await d.temizle()).temizlenenHesapSayisi, 0);
    d.ilerlet(1); await assert.rejects(d.servis.dogrula(d.token()));
    assert.equal((await d.temizle()).temizlenenHesapSayisi, 1); assert.equal(d.db.length, 0);
    await d.kaydet(); assert.equal(d.db.length, 1);
});

test("doğrulanmış, eski ve yeni akış işareti olmayan hesaplar asla silinmez", async () => {
    const d = duzenek(); await d.kaydet(); await d.servis.dogrula(d.token());
    d.db.push({ _id: "eski", email: "eski@example.test", createdAt: new Date(baslangic - 10 * SAAT) });
    d.db.push({ _id: "isaretsiz", emailDogrulandi: false, createdAt: new Date(baslangic - 10 * SAAT), kayitDogrulamaSonTarih: new Date(baslangic) });
    d.ilerlet(2 * SAAT); assert.equal((await d.temizle()).temizlenenHesapSayisi, 0); assert.equal(d.db.length, 3);
});

test("eski hesaplar alan eklenmeden giriş ve korumalı API erişimini sürdürür", async t => {
    const d = duzenek(); await d.kaydet(); delete d.db[0].emailDogrulandi; delete d.db[0].emailDogrulamaZorunluKayit;
    t.mock.method(Kullanici, "findOne", f => d.Model.findOne(f)); t.mock.method(Kullanici, "findById", id => d.Model.findById(id));
    const r = resOlustur(); await girisYap({ body: { email: d.db[0].email, sifre: "Guvenli123!" } }, r); assert.equal(r.statusCode, 200);
    let gecti = false; await kimlikDogrula({ cookies: { token: r.body.token }, headers: {} }, resOlustur(), () => { gecti = true; }); assert.equal(gecti, true);
    const model = new Kullanici({ kullaniciAdi: "Eski", email: "eski@example.test", sifre: "Guvenli123!" });
    assert.equal(model.emailDogrulandi, undefined); assert.equal(model.emailDogrulamaZorunluKayit, undefined);
});

test("bağlı ders/diğer veri varsa veya veri kontrolü başarısızsa hesap silinmez ve kilit bırakılır", async () => {
    for (const exists of [async () => ({ _id: "ders" }), async () => { throw new Error("sentetik"); }]) {
        const d = duzenek(); await d.kaydet(); d.ilerlet(SAAT);
        await d.temizle([{ exists }]); assert.equal(d.db.length, 1); assert.equal(d.db[0].hesapTemizlemeToken, undefined);
    }
});

test("doğrulama tarama ile kilit arasında kazanırsa hesap korunur; kilit alınınca doğrulama tüketilemez", async () => {
    const d = duzenek(); await d.kaydet(); const token = d.token(); d.ilerlet(SAAT);
    const onceki = d.Model.findOneAndUpdate;
    d.Model.findOneAndUpdate = (f, u) => { if (u.$set?.hesapTemizlemeToken) d.db[0].emailDogrulandi = true; return onceki(f, u); };
    await d.temizle(); assert.equal(d.db.length, 1); assert.equal(d.db[0].emailDogrulandi, true);
    const d2 = duzenek(); await d2.kaydet(); const token2 = d2.token(); d2.ilerlet(SAAT);
    await d2.temizle([{ exists: async () => {
        assert.ok(d2.db[0].hesapTemizlemeToken);
        await assert.rejects(d2.servis.dogrula(token2)); return null;
    } }]); assert.equal(d2.db.length, 0);
    await assert.rejects(d.servis.dogrula(token));
});

test("son silme anında doğrulanmış hesap atomik koşul nedeniyle silinmez; restart eski lease'i devralabilir", async () => {
    const d = duzenek(); await d.kaydet(); d.ilerlet(2 * SAAT);
    d.db[0].hesapTemizlemeToken = "eski-islem"; d.db[0].hesapTemizlemeSonTarih = new Date(baslangic);
    const sil = d.Model.deleteOne;
    d.Model.deleteOne = async f => { d.db[0].emailDogrulandi = true; return sil(f); };
    await d.temizle(); assert.equal(d.db.length, 1); assert.equal(d.db[0].emailDogrulandi, true);
});

test("yeniden gönderim son tarihi/oluşturulma zamanını uzatmaz; eski token iptal olur", async () => {
    const d = duzenek(); await d.kaydet(); const eski = d.token(), tarih = d.db[0].kayitDogrulamaSonTarih.getTime(), olusma = d.db[0].createdAt.getTime();
    await d.servis.yenidenGonder(d.db[0].email); assert.equal(d.postalar.length, 1);
    d.ilerlet(61_000); await d.servis.yenidenGonder(d.db[0].email); assert.equal(d.postalar.length, 2);
    assert.equal(d.db[0].kayitDogrulamaSonTarih.getTime(), tarih); assert.equal(d.db[0].createdAt.getTime(), olusma);
    await assert.rejects(d.servis.dogrula(eski)); await d.servis.dogrula(d.token());
});

test("SMTP yapılandırma/gönderim hatasında hesap korunur ve bir saat içinde yeniden bağlantı istenebilir", async () => {
    const d = duzenek(); const ayar = d.eposta.ayarlariGetir;
    d.eposta.ayarlariGetir = () => { throw new Error("gizli"); };
    const r = await d.kaydet(); assert.equal(r.epostaGonderildi, false); assert.equal(d.db.length, 1);
    d.eposta.ayarlariGetir = ayar; d.ilerlet(61_000); await d.servis.yenidenGonder(d.db[0].email); assert.equal(d.postalar.length, 1);
});

test("profesyonel doğrulama HTML/text 1 saat ve ayrı buton/link içerir; reset 15 dakika kalır", () => {
    const link = `https://studyai.example.test/hesap-dogrula/${"a".repeat(64)}`;
    const m = kayitDogrulamaEpostasi(link);
    for (const text of [m.html, m.text]) { assert.ok(text.includes("E-posta Adresimi Doğrula")); assert.ok(text.includes("1 saat")); assert.ok(text.includes(link)); }
    assert.match(m.html, /role="presentation"/); assert.doesNotMatch(m.html, /15 dakika/);
    assert.match(sifreSifirlamaEpostasi(link).text, /15 dakika/);
});

test("başlangıç ve mevcut 10 dakika döngüsü aynı birleşik temizliği kullanır; yeni zamanlayıcı yoktur", async () => {
    const s = await readFile(new URL("../server.js", import.meta.url), "utf8");
    assert.equal((s.match(/setInterval\(/g) || []).length, 1);
    assert.match(s, /await zamanlanmisTemizlikleriCalistir\(\)/);
    assert.match(s, /void zamanlanmisTemizlikleriCalistir\(\)/);
});

test("yeniden doğrulama endpoint'i farklı IP'lerden aynı adrese altıncı isteği rate limit ile durdurur", async t => {
    const sayaclar = new Map(); let gonderim = 0;
    t.mock.method(AuthIstekSiniri, "findOneAndUpdate", async f => {
        const n = sayaclar.get(f._id) || 0;
        if (n >= f.sayac.$lt) throw Object.assign(new Error(), { code: 11000 });
        sayaclar.set(f._id, n + 1);
    });
    t.mock.method(kayitDogrulamaServisi, "yenidenGonder", async () => { gonderim++; });
    const rota = authRoutes.stack.find(s => s.route?.path === "/resend-verification").route;
    for (let i = 0; i < 6; i++) {
        const req = { body: { email: "ogrenci@example.test" }, ip: `ip${i}`, cookies: {}, get: () => undefined };
        const res = resOlustur();
        for (const { handle } of rota.stack) {
            let devam = false; await handle(req, res, e => { if (e) throw e; devam = true; }); if (!devam) break;
        }
        assert.equal(res.statusCode, i < 5 ? 200 : 429);
    }
    assert.equal(gonderim, 5);
});

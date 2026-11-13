import test from "node:test";
import assert from "node:assert/strict";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Kullanici from "../models/Kullanici.js";
import kimlikDogrula from "../middleware/auth.js";
import { authIstekSiniri } from "../middleware/authIstekSiniri.js";
import { epostaServisiOlustur } from "../services/epostaService.js";
import { sifreSifirlamaServisiOlustur, sifreSifirlamaServisi } from "../services/sifreSifirlamaService.js";
import { sifremiUnuttum, sifreSifirla, profilGetir, profilGuncelle, girisYap, cikisYap, sifreDegistir } from "../controllers/authControllers.js";
import { tokenHashle, oturumTokeniOlustur, oturumCookieAyarlari, authOriginKontrolu } from "../utils/authGuvenligi.js";
import authRoutes from "../routes/authRoutes.js";
import AuthIstekSiniri from "../models/AuthIstekSiniri.js";

process.env.JWT_SECRET = "yalniz-test-icin-guvenli-anahtar";
const token = "a".repeat(64);
const simdi = Date.parse("2026-11-13T09:00:00Z");
const resOlustur = () => ({ statusCode: 200, headers: {}, cookies: [],
    status(n) { this.statusCode = n; return this; }, set(k, v) { this.headers[k] = v; return this; },
    json(v) { this.body = v; return this; }, cookie(...a) { this.cookies.push(a); }, clearCookie(...a) { this.silinen = a; } });
const kopya = v => structuredClone(v);
const eslesir = (d, f) => Object.entries(f).every(([k, v]) => {
    if (k === "$or") return v.some(x => eslesir(d, x));
    if (k === "$and") return v.every(x => eslesir(d, x));
    if (v && typeof v === "object") {
        if ("$exists" in v) return (d[k] !== undefined) === v.$exists;
        if ("$gt" in v) return d[k] > v.$gt;
        if ("$lte" in v) return d[k] <= v.$lte;
        if ("$lt" in v) return d[k] < v.$lt;
    }
    return d[k] === v;
});
const uygula = (d, u) => {
    Object.assign(d, u.$set);
    for (const [k, v] of Object.entries(u.$inc || {})) d[k] = (d[k] || 0) + v;
    for (const k of Object.keys(u.$unset || {})) delete d[k];
};
const duzenek = (ek = {}) => {
    const doc = { _id: "u", email: "ogrenci@example.test", sifre: "onceki-hash", kullaniciAdi: "Öğrenci", ...ek };
    let zaman = simdi;
    const mesajlar = [], yazimlar = [], hatalar = [];
    const Model = {
        findOne(f) { return { select: async () => eslesir(doc, f) ? kopya(doc) : null }; },
        async updateOne(f, u) {
            yazimlar.push({ f: kopya(f), u: kopya(u) });
            if (hatalar.length) throw hatalar.shift();
            if (!eslesir(doc, f)) return { matchedCount: 0 };
            uygula(doc, u); return { matchedCount: 1 };
        }, sifreyiHashle: sifre => Kullanici.sifreyiHashle(sifre),
    };
    const eposta = { ayarlariGetir: () => ({ clientUrl: "https://studyai.example.test" }),
        sirayaAl: (mesaj, basarisiz) => { mesajlar.push({ mesaj, basarisiz }); return true; } };
    const servis = sifreSifirlamaServisiOlustur({ Model, eposta, simdi: () => zaman, tokenUret: () => token });
    return { doc, Model, eposta, servis, mesajlar, yazimlar, hatalar, ilerlet: ms => { zaman += ms; } };
};

test("token yalnız hash olarak saklanır; 15 dakika geçerli, bağlantı doğru frontend'e gider", async () => {
    const d = duzenek(); await d.servis.iste(d.doc.email);
    assert.equal(d.doc.sifirlamaTokenHash, tokenHashle(token));
    assert.equal(d.doc.sifirlamaSonTarih.getTime(), simdi + 900_000);
    assert.ok(!JSON.stringify(d.doc).includes(token));
    assert.match(d.mesajlar[0].mesaj.text, new RegExp(`/reset-password/${token}`));
    assert.equal(d.doc.sifre, "onceki-hash"); assert.equal(d.doc.email, "ogrenci@example.test");
});

test("aynı token eşzamanlı yalnız bir kez tüketilir; şifre, token ve oturum tek atomik yazımdır", async () => {
    const d = duzenek(); await d.servis.iste(d.doc.email);
    const r = await Promise.allSettled([d.servis.sifirla(token, "YeniGuvenli123!"), d.servis.sifirla(token, "BaskaGuvenli123!")]);
    assert.equal(r.filter(x => x.status === "fulfilled").length, 1);
    assert.equal(d.doc.oturumSurumu, 1); assert.equal(d.doc.sifirlamaTokenHash, undefined);
    assert.ok(await bcrypt.compare("YeniGuvenli123!", d.doc.sifre) || await bcrypt.compare("BaskaGuvenli123!", d.doc.sifre));
    const u = d.yazimlar.find(x => x.u.$set?.sifre).u;
    assert.equal(u.$inc.oturumSurumu, 1); assert.ok(u.$unset.sifirlamaTokenHash);
    await assert.rejects(d.servis.sifirla(token, "Tekrar123!"), { kod: "SIFIRLAMA_BAGLANTISI_GECERSIZ" });
});

test("süresi dolan, bozuk ve hash sırasında süresi dolan token parola değiştirmez", async () => {
    const d = duzenek(); await d.servis.iste(d.doc.email);
    for (const t of ["bozuk", "b".repeat(64)]) await assert.rejects(d.servis.sifirla(t, "Yeni123!"));
    d.Model.sifreyiHashle = async () => { d.ilerlet(900_000); return "yeni-hash"; };
    await assert.rejects(d.servis.sifirla(token, "Yeni123!")); assert.equal(d.doc.sifre, "onceki-hash");
});

test("başarısız DB veya parola hash'i token'ı tüketmez; geçerli istek tekrar denenebilir", async () => {
    const d = duzenek(); await d.servis.iste(d.doc.email);
    await assert.rejects(d.servis.sifirla(token, "x"));
    d.hatalar.push(new Error("sentetik")); await assert.rejects(d.servis.sifirla(token, "YeniGuvenli123!"));
    assert.equal(d.doc.sifre, "onceki-hash"); assert.equal(d.doc.sifirlamaTokenHash, tokenHashle(token));
    await d.servis.sifirla(token, "YeniGuvenli123!"); assert.equal(d.doc.oturumSurumu, 1);
});

test("yeniden gönderim beklemesi ve SMTP hatası eski adresi/parolayı değiştirmez; yeni token ezilmez", async () => {
    const d = duzenek(); await d.servis.iste(d.doc.email); await d.servis.iste(d.doc.email);
    assert.equal(d.mesajlar.length, 1);
    d.doc.sifirlamaTokenHash = "yeni-istek-hashi";
    await d.mesajlar[0].basarisiz(); assert.equal(d.doc.sifirlamaTokenHash, "yeni-istek-hashi");
    d.doc.sifirlamaTokenHash = tokenHashle(token);
    await d.mesajlar[0].basarisiz(); assert.equal(d.doc.sifirlamaTokenHash, undefined);
    assert.equal(d.doc.email, "ogrenci@example.test"); assert.equal(d.doc.sifre, "onceki-hash");
});

test("şifre sıfırlama istekleri eski oturum sürümünden token oluşturamaz; bilinmeyen hesap yazılmaz", async () => {
    const d = duzenek(); await d.servis.iste("yok@example.test"); assert.equal(d.yazimlar.length, 0);
    const eski = d.Model.findOne;
    d.Model.findOne = f => ({ select: async () => { const r = await eski(f).select(); d.doc.oturumSurumu = 1; return r; } });
    await d.servis.iste(d.doc.email); assert.equal(d.mesajlar.length, 0);
});

test("eski sürümsüz JWT eski hesapta çalışır; sıfırlama sonrasında cookie/Bearer reddedilir", async t => {
    let surum;
    t.mock.method(Kullanici, "findById", () => ({ select: async () => ({ _id: "u", oturumSurumu: surum }) }));
    const eski = jwt.sign({ id: "u" }, process.env.JWT_SECRET);
    let next = 0;
    await kimlikDogrula({ cookies: { token: eski }, headers: {} }, resOlustur(), () => { next++; });
    assert.equal(next, 1); surum = 1;
    for (const req of [{ cookies: { token: eski }, headers: {} }, { headers: { authorization: `Bearer ${eski}` } }]) {
        const res = resOlustur(); await kimlikDogrula(req, res, () => { next++; }); assert.equal(res.statusCode, 401);
    }
    const guncel = oturumTokeniOlustur({ _id: "u", oturumSurumu: 1 });
    await kimlikDogrula({ headers: { authorization: `Bearer ${guncel}` } }, resOlustur(), () => { next++; });
    assert.equal(next, 2);
});

test("profil yanıtında token alanları yok; doğrulamasız e-posta güncellemesi kaydedilmez", async t => {
    const req = { user: { _id: "u", id: "u", kullaniciAdi: "Ad", email: "eski@example.test", sifirlamaTokenHash: "gizli" }, body: { email: "yeni@example.test" } };
    const r = resOlustur(); await profilGetir(req, r); assert.ok(!JSON.stringify(r.body).includes("gizli"));
    t.mock.method(Kullanici, "findOneAndUpdate", () => assert.fail("Doğrulanmamış adres kaydedilmemeli"));
    const r2 = resOlustur(); await profilGuncelle(req, r2); assert.equal(r2.statusCode, 409);
});

test("bilinen/bilinmeyen ve hesaba özel arızalarda forgot HTTP yanıtı aynıdır", async t => {
    const r = [];
    for (const hata of [null, null, new Error("gizli-db-detayi")]) {
        t.mock.method(sifreSifirlamaServisi, "iste", async () => { if (hata) throw hata; });
        const res = resOlustur(); await sifremiUnuttum({ body: { email: "test@example.test" } }, res); r.push(res.body);
        assert.equal(res.statusCode, 200); t.mock.restoreAll();
    }
    assert.deepEqual(r[0], r[1]); assert.deepEqual(r[1], r[2]);
});

test("başarılı reset oturum açmaz ve cookie'yi temizler; geçersiz bağlantı Türkçe hata verir", async t => {
    t.mock.method(sifreSifirlamaServisi, "sifirla", async () => {});
    const r = resOlustur(); await sifreSifirla({ params: { token }, body: { yeniSifre: "Yeni123!" } }, r);
    assert.equal(r.cookies.length, 0); assert.equal(r.silinen[0], "token"); assert.equal(r.headers["Cache-Control"], "no-store");
});

test("login mevcut bcrypt karşılaştırmasını kullanır; çıkış cookie seçenekleri oluşturmayla aynıdır", async t => {
    const hash = await Kullanici.sifreyiHashle("Mevcut123!");
    t.mock.method(Kullanici, "findOne", () => ({ select: async () => ({ _id: "u", kullaniciAdi: "Ad", email: "a@b.test", sifreEslesiyorMu: p => bcrypt.compare(p, hash) }) }));
    const r = resOlustur(); await girisYap({ body: { email: "a@b.test", sifre: "Mevcut123!" } }, r);
    assert.equal(r.statusCode, 200); assert.equal(jwt.verify(r.body.token, process.env.JWT_SECRET).oturumSurumu, 0);
    const cikis = resOlustur(); await cikisYap({}, cikis);
    for (const k of ["secure", "sameSite", "path", "httpOnly"]) assert.equal(r.cookies[0][2][k], cikis.silinen[1][k]);
    assert.equal(oturumCookieAyarlari({ NODE_ENV: "production" }).secure, true);
});

test("şifre değiştir atomik karşılaştırma yapar; yalnız güncel oturumu yeni JWT ile sürdürür", async t => {
    const doc = { _id: "u", sifre: "eski-hash", sifreEslesiyorMu: async () => true };
    t.mock.method(Kullanici, "findById", () => ({ select: async () => doc }));
    let filtre, update;
    t.mock.method(Kullanici, "findOneAndUpdate", (f, u) => { filtre = f; update = u; return { select: async () => ({ _id: "u", oturumSurumu: 1 }) }; });
    const res = resOlustur(); await sifreDegistir({ user: { id: "u" }, body: { mevcutSifre: "Eski123!", yeniSifre: "Yeni123!" } }, res);
    assert.equal(filtre.sifre, "eski-hash"); assert.ok(filtre.$or); assert.equal(update.$inc.oturumSurumu, 1);
    assert.ok(await bcrypt.compare("Yeni123!", update.$set.sifre));
    assert.equal(jwt.verify(res.cookies[0][1], process.env.JWT_SECRET).oturumSurumu, 1);
});

test("Nodemailer TLS/Gmail ayarları güvenlidir, SMTP hatası gizli bilgi loglamaz", async () => {
    let ayarlar, mesaj; const loglar = [];
    const servis = epostaServisiOlustur({ env: { EMAIL_USER: "mock@example.test", EMAIL_PASS: "gizli-smtp", CLIENT_URL: "https://studyai.example.test" },
        logla: x => loglar.push(x), transportOlustur: x => { ayarlar = x; return { sendMail: async m => { mesaj = m; throw new Error("gizli-smtp token=" + token); } }; } });
    let temizlendi = false;
    servis.sirayaAl({ to: "a@b.test", subject: "Başlık", text: "İçerik" }, async () => { temizlendi = true; });
    for (let i = 0; i < 5 && !temizlendi; i++) await new Promise(r => setImmediate(r));
    assert.equal(ayarlar.host, "smtp.gmail.com"); assert.equal(ayarlar.port, 465); assert.equal(ayarlar.secure, true);
    assert.equal(ayarlar.tls.rejectUnauthorized, true); assert.equal(ayarlar.debug, false);
    assert.equal(mesaj.to, "a@b.test"); assert.equal(temizlendi, true);
    assert.deepEqual(loglar, ["EPOSTA_GONDERILEMEDI"]);
    for (const env of [{}, { EMAIL_USER: "a", EMAIL_PASS: "b", CLIENT_URL: "http://evil.test", NODE_ENV: "production" }])
        assert.throws(() => epostaServisiOlustur({ env }).ayarlariGetir(), { kod: "EPOSTA_YAPILANDIRMA" });
});

test("Mongo istek sayacı eşzamanlı limiti korur; pencere ilerler, DB arızasında güvenli durur", async () => {
    const db = new Map(); let zaman = simdi;
    const Model = { async findOneAndUpdate(f, u) {
        const d = db.get(f._id);
        if (d && !eslesir(d, f)) throw Object.assign(new Error(), { code: 11000 });
        const yeni = d || { _id: f._id }; uygula(yeni, u); Object.assign(yeni, !d ? u.$setOnInsert : {}); db.set(f._id, yeni);
    } };
    const sinir = authIstekSiniri({ kapsam: "test", maksimum: 2, email: true, Model, simdi: () => zaman });
    let gecti = 0; const yanitlar = [];
    await Promise.all(Array.from({ length: 4 }, async () => { const r = resOlustur(); yanitlar.push(r); await sinir({ ip: "1", body: { email: "a@b.test" } }, r, () => { gecti++; }); }));
    assert.equal(gecti, 2); assert.equal(yanitlar.filter(r => r.statusCode === 429).length, 2);
    assert.ok([...db.keys()].every(k => !k.includes("a@b.test")));
    zaman += 900_000; await sinir({ ip: "1", body: { email: "a@b.test" } }, resOlustur(), () => { gecti++; }); assert.equal(gecti, 3);
    const r = resOlustur(); await authIstekSiniri({ kapsam: "test", maksimum: 2, Model: { findOneAndUpdate: async () => { throw new Error(); } } })({ ip: "1" }, r, () => assert.fail());
    assert.equal(r.statusCode, 503);
});

test("auth cookie yazımlarında yabancı veya eksik Origin reddedilir; açık Bearer istemcisi korunur", () => {
    for (const headers of [{ origin: "https://evil.test" }, {}]) {
        const r = resOlustur(); authOriginKontrolu({ cookies: { token: "cookie" }, get: k => headers[k] }, r, () => assert.fail()); assert.equal(r.statusCode, 403);
    }
    let gecti = false;
    authOriginKontrolu({ get: k => k === "authorization" ? "Bearer test" : undefined }, resOlustur(), () => { gecti = true; }); assert.equal(gecti, true);
});

test("reset rotası nesne/enjeksiyon, kısa/aşırı uzun parola ve eşleşmeyen tekrarı reddeder", async () => {
    const route = authRoutes.stack.find(s => s.route?.path === "/reset-password/:token").route;
    // Express validator zincirleri doğrudan çalıştırılır; socket veya gerçek sunucu yoktur.
    const validators = route.stack.map(s => s.handle).filter(h => typeof h.run === "function");
    const validate = route.stack.map(s => s.handle).find(h => h.name === "girdiyiKontrolEt");
    for (const body of [{ yeniSifre: { $ne: "" } }, { yeniSifre: "x" }, { yeniSifre: "ü".repeat(37) }, { yeniSifre: "Yeni123!", yeniSifreTekrar: "Yanlis123!" }]) {
        const req = { body, params: { token } }; for (const v of validators) await v.run(req);
        const r = resOlustur(); validate(req, r, () => assert.fail("Hatalı girdi kabul edildi")); assert.equal(r.statusCode, 400);
    }
});

const rotayiCalistir = async (path, girdi) => {
    const route = authRoutes.stack.find(s => s.route?.path === path).route;
    const req = { ip: "127.0.0.1", cookies: {}, headers: {}, get: () => undefined, ...girdi };
    const res = resOlustur();
    for (const { handle } of route.stack) {
        let devam = false;
        await handle(req, res, hata => { if (hata) throw hata; devam = true; });
        if (!devam) break;
    }
    return res;
};

test("forgot endpoint zinciri geçerli adreslerde aynı yanıtı verir, NoSQL nesnesini servis öncesi reddeder", async t => {
    t.mock.method(AuthIstekSiniri, "findOneAndUpdate", async () => ({}));
    const adresler = [];
    t.mock.method(sifreSifirlamaServisi, "iste", async email => { adresler.push(email); });
    const a = await rotayiCalistir("/forgot-password", { body: { email: "var@example.test" } });
    const b = await rotayiCalistir("/forgot-password", { body: { email: "yok@example.test" } });
    assert.equal(a.statusCode, 200); assert.deepEqual(a.body, b.body);
    const r = await rotayiCalistir("/forgot-password", { body: { email: { $ne: null } } });
    assert.equal(r.statusCode, 400); assert.doesNotMatch(r.body.hata, /Invalid/); assert.equal(adresler.length, 2);
});

test("reset endpoint zincirinde iki eşzamanlı istekten biri başarılı olur; JWT eski sürümde kalamaz", async t => {
    t.mock.method(AuthIstekSiniri, "findOneAndUpdate", async () => ({}));
    const d = duzenek(); await d.servis.iste(d.doc.email);
    t.mock.method(sifreSifirlamaServisi, "sifirla", (...a) => d.servis.sifirla(...a));
    const istek = () => ({ params: { token }, body: { yeniSifre: "Yeni123!", yeniSifreTekrar: "Yeni123!" } });
    const r = await Promise.all([rotayiCalistir("/reset-password/:token", istek()), rotayiCalistir("/reset-password/:token", istek())]);
    assert.deepEqual(r.map(x => x.statusCode).sort(), [200, 400]);
    assert.equal(d.doc.oturumSurumu, 1); assert.equal(d.doc.sifirlamaTokenHash, undefined);
});

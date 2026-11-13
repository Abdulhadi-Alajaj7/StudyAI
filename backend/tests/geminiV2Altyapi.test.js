import test from "node:test";
import assert from "node:assert/strict";
import { geminiIsteginiYurut, geminiOrtakIstekYonetimiOlustur } from "../utils/geminiOrtakIstekYonetimi.js";
import { geminiModelRotasiniGetir } from "../utils/geminiModelYonlendirme.js";

const kota = { rpm: 10, tpm: 10000, rpd: 100 };
const env = { GEMINI_MODEL_ROUTING_AKTIF: "true", GEMINI_DOGRULANMIS_MODELLER: "bir,iki", GEMINI_KART_FALLBACK_MODELI: "iki",
    GEMINI_MODEL_KOTALARI: JSON.stringify({ iki: kota }) };
const hata = status => Object.assign(new Error("Sentetik hata"), { status });
const ortam = () => {
    let saat = Date.parse("2026-11-12T07:59:59Z");
    const beklemeler = [], modeller = [];
    const istekYonetimi = geminiOrtakIstekYonetimiOlustur({ simdi: () => saat, kotalar: { bir: kota, iki: kota } });
    return { modeller, beklemeler, istekYonetimi, ilerlet: ms => { saat += ms; },
        calistir: (islem, ek = {}) => geminiIsteginiYurut({ modelAdi: "bir", gorev: "kart", env,
            simdi: () => saat, bekle: async ms => { beklemeler.push(ms); saat += ms; }, rastgele: () => 0,
            istekYonetimi, logger: { info() {} }, islem: g => { modeller.push(g.model); return islem(g); }, ...ek }) };
};
test("503 üç primary ve tek doğrulanmış fallback; denemeler ortak bütçeye yazılır", async () => {
    const d = ortam(), apiCagriButcesi = { maksimum: 4, kullanilan: 0 };
    const r = await d.calistir(g => { if (g.model === "bir") throw hata(503); return { text: "başarılı", usageMetadata: { promptTokenCount: 7 } }; }, { apiCagriButcesi });
    assert.deepEqual(d.modeller, ["bir", "bir", "bir", "iki"]);
    assert.equal(apiCagriButcesi.kullanilan, 4); assert.equal(r.tanilama.fallbackKullanildi, true);
    assert.equal(d.istekYonetimi.durum("iki").tpm, 7);
    assert.deepEqual(d.beklemeler, [1000, 2000, 4000]);
});
test("fallback hatası döngü yapmaz; düşük bütçe aşılmaz", async () => {
    for (const maksimum of [1, 2, 4]) {
        const d = ortam();
        await assert.rejects(d.calistir(() => { throw hata(503); }, { apiCagriButcesi: { maksimum, kullanilan: 0 } }), { kod: "GEMINI_503" });
        assert.equal(d.modeller.length, maksimum);
    }
});
test("routing kapalı/eski env, doğrulanmamış veya sıfır kotalı fallback güvenle kapalıdır", () => {
    assert.deepEqual(geminiModelRotasiniGetir("kart", "models/eski", {}), { primary: "eski", fallback: null });
    for (const ek of [{ GEMINI_DOGRULANMIS_MODELLER: "" }, { GEMINI_MODEL_ROUTING_AKTIF: "false" }, { GEMINI_MODEL_KOTALARI: '{"iki":{"rpm":0,"tpm":100,"rpd":10}}' }]) {
        assert.equal(geminiModelRotasiniGetir("kart", "bir", { ...env, ...ek }).fallback, null);
    }
    assert.equal(geminiModelRotasiniGetir("embedding", "gemini-embedding-001", env).fallback, null);
    for (const [gorev, alan] of Object.entries({ kart: "KART", test: "TEST", ozet: "OZET", konu_haritasi: "KONU_HARITASI", sohbet: "SOHBET", sohbet_basligi: "SOHBET_BASLIK" })) {
        assert.equal(geminiModelRotasiniGetir(gorev, "bir", { ...env, [`GEMINI_${alan}_PRIMARY_MODELI`]: "iki" }).primary, "iki");
    }
});
test("400/401/403/404 ve günlük kota fallback gerekçesi değildir", async () => {
    for (const status of [400, 401, 403, 404, 429]) {
        const d = ortam();
        await assert.rejects(d.calistir(() => { throw Object.assign(hata(status), { error: { message: "", details: [{ quotaId: "RequestsPerDay" }] } }); }));
        assert.deepEqual(d.modeller, ["bir"]);
    }
});
test("model takma adı ve özellikler RPM/TPM/RPD bütçesini paylaşır; Pacific gün yenilenir", () => {
    let saat = Date.parse("2026-11-12T07:59:59Z");
    const y = geminiOrtakIstekYonetimiOlustur({ simdi: () => saat, kotalar: { bir: { rpm: 2, tpm: 10, rpd: 2 } } });
    const ilk = y.yerAyir("models/bir", { tahminiToken: 8 }); ilk.mutabakat({ promptTokenCount: 4 }); ilk();
    assert.throws(() => y.yerAyir("bir", { tahminiToken: 7 }), { kod: "GEMINI_YEREL_TPM" });
    y.yerAyir("bir", { tahminiToken: 2 })();
    assert.throws(() => y.yerAyir("bir"), { kod: "GEMINI_YEREL_RPD" });
    saat += 61000; y.yerAyir("bir")(); assert.equal(y.durum("bir").rpd, 1);
});
test("eşzamanlı yer ayırma, yerel yoğunluk ve başarısız SDK tahmini", async () => {
    const y = geminiOrtakIstekYonetimiOlustur({ maksimum: 1, kotalar: { bir: kota } });
    const birak = y.yerAyir("bir", { tahminiToken: 42 });
    assert.throws(() => y.yerAyir("bir"), { kod: "GEMINI_ISTEK_YOGUNLUGU" });
    birak(); birak(); assert.equal(y.durum("bir").tpm, 42); assert.equal(y.durum("bir").aktif, 0);
});
test("lease kaybı/iptal retry ve fallback öncesi SDK'yı durdurur", async () => {
    const d = ortam(); let kontrol = 0;
    await assert.rejects(d.calistir(() => { throw hata(503); }, { sahipligiDogrula: () => { if (++kontrol === 2) throw Object.assign(new Error("Lease"), { kod: "KART_KILIT_KAYBI" }); } }), { kod: "KART_KILIT_KAYBI" });
    assert.equal(d.modeller.length, 1);
    const controller = new AbortController(); controller.abort();
    await assert.rejects(d.calistir(() => assert.fail(), { signal: controller.signal }), { kod: "GEMINI_IPTAL" });
});

test("başarılı SDK sonrası sahiplik veya log hatası üretimi tekrarlamaz", async () => {
    const d = ortam(); let kontrol = 0;
    await assert.rejects(d.calistir(() => ({ text: "başarılı" }), { sahipligiDogrula: () => {
        if (++kontrol === 2) throw Object.assign(new Error("Veritabanı erişimi"), { status: 503 });
    } }), { kod: "GEMINI_SAHIPLIK_KONTROLU" });
    assert.equal(d.modeller.length, 1);
    const ikinci = ortam();
    await ikinci.calistir(() => ({ text: "başarılı" }), { logger: { info() { throw new Error("Log kapalı"); } } });
    assert.equal(ikinci.modeller.length, 1);
});

test("işlem süresi retry ve fallback beklemesinden önce tüketilirse güvenle durur", async () => {
    const d = ortam();
    await assert.rejects(d.calistir(() => { d.ilerlet(950); throw hata(503); }, { toplamSureMs: 1000 }), { kod: "GEMINI_503" });
    assert.equal(d.modeller.length, 1); assert.equal(d.beklemeler.length, 0);
});

test("kota engelindeki fallback gerçek SDK denemesi sayılmaz; güvenli log ölçümü ayırır", async () => {
    const d = ortam(), loglar = [];
    const yonetici = geminiOrtakIstekYonetimiOlustur({ kotalar: { bir: kota, iki: { ...kota, rpm: 0 } } });
    await assert.rejects(d.calistir(() => { throw hata(503); }, { istekYonetimi: yonetici,
        logger: { info: (_etiket, veri) => loglar.push(veri) } }), e => {
        assert.equal(e.tanilama.fallbackKullanildi, false);
        assert.equal(e.tanilama.gercekDenemeSayisi, 3); assert.equal(e.tanilama.retrySayisi, 2);
        return e.kod === "GEMINI_MODEL_KAPALI";
    });
    assert.equal(loglar.at(-1).fallbackKullanildi, false);
    assert.equal(loglar.at(-1).tokenOlcumu, "tahmini");
    const baska = ortam();
    await baska.calistir(() => ({ text: "Loglanmayan kaynak", usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 2 } }), {
        logger: { info: (_etiket, veri) => loglar.push(veri) },
    });
    assert.equal(loglar.at(-1).tokenOlcumu, "saglayici");
    assert.equal(loglar.at(-1).promptTokenCount, 5);
    assert.ok(!JSON.stringify(loglar).includes("Loglanmayan kaynak"));
});

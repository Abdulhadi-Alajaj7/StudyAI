import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import {
    dersDetayTablari,
    dersDetayYolu,
    dersDuzenlemeYolu,
    gecerliDersKimligiMi,
} from "../src/utils/dersDetayYollari.mjs";

const kaynakOku = (goreliYol) => readFile(new URL(goreliYol, import.meta.url), "utf8");

test("ders detay sekmeleri istenen altı Türkçe sekmeden oluşur ve Materyaller içermez", () => {
    assert.deepEqual(
        dersDetayTablari.map((tab) => tab.etiket),
        ["Genel Bakış", "Konular", "Özet", "Sohbet", "Testler", "Çalışma Kartları"]
    );
    assert.equal(dersDetayTablari.some((tab) => tab.etiket === "Materyaller"), false);
});

test("ders kimliği bütün detay yollarında korunur", () => {
    const dersId = "507f1f77bcf86cd799439011";
    assert.deepEqual(
        dersDetayTablari.map((tab) => dersDetayYolu(dersId, tab.segment)),
        [
            `/dersler/${dersId}`,
            `/dersler/${dersId}/konular`,
            `/dersler/${dersId}/ozet`,
            `/dersler/${dersId}/sohbet`,
            `/dersler/${dersId}/testler`,
            `/dersler/${dersId}/calisma-kartlari`,
        ]
    );
    assert.equal(dersDuzenlemeYolu(dersId), `/dersler/${dersId}/duzenle?donus=dersler`);
    assert.equal(dersDuzenlemeYolu(dersId, "detay"), `/dersler/${dersId}/duzenle?donus=detay`);
    assert.equal(gecerliDersKimligiMi(dersId), true);
    assert.equal(gecerliDersKimligiMi("gecersiz"), false);
});

test("router altı sayfayı ortak ders detay yerleşimi altında tanımlar", async () => {
    const appKaynagi = await kaynakOku("../src/App.jsx");

    assert.match(appKaynagi, /path="\/dersler\/:dersId" element={<DersDetayLayout \/>}/);
    assert.match(appKaynagi, /path="\/dersler\/:dersId\/duzenle" element={<DersDuzenle \/>}/);
    for (const segment of ["konular", "ozet", "sohbet", "testler", "calisma-kartlari"]) {
        assert.match(appKaynagi, new RegExp(`path="${segment}"`));
    }
    assert.match(appKaynagi, /<Route index element={<DersGenelBakis \/>} \/>/);
});

test("Ders Hazır ve Derslerim gerçek ders kimliğiyle detay yoluna gider", async () => {
    const [dersHazir, derslerim] = await Promise.all([
        kaynakOku("../src/pages/DersHazir.jsx"),
        kaynakOku("../src/pages/Derslerim.jsx"),
    ]);

    assert.match(dersHazir, /navigate\(dersDetayYolu\(dersId\), \{ state: ders \? \{ ders \} : null \}\)/);
    assert.match(derslerim, /navigate\(dersDetayYolu\(ders\._id\), \{ state: \{ ders \} \}\)/);
});

test("mobil menü drawer, overlay, Escape ve kaydırma kilidi davranışlarını içerir", async () => {
    const panelLayout = await kaynakOku("../src/components/PanelLayout.jsx");

    assert.match(panelLayout, /mobilMenuAcik/);
    assert.match(panelLayout, /aria-expanded=\{mobilMenuAcik\}/);
    assert.match(panelLayout, /event\.key === "Escape"/);
    assert.match(panelLayout, /document\.body\.style\.overflow = "hidden"/);
    assert.match(panelLayout, /backdrop-blur/);
    assert.match(panelLayout, /onClick=\{\(\) => setMobilMenuAcik\(false\)\}/);
});

test("mobil detay sekmeleri taşma yerine üç sütunlu grid kullanır", async () => {
    const detayLayout = await kaynakOku("../src/components/DersDetayLayout.jsx");

    assert.match(detayLayout, /grid grid-cols-3/);
    assert.doesNotMatch(detayLayout, /overflow-x-auto/);
    assert.doesNotMatch(detayLayout, /min-w-max/);
    assert.doesNotMatch(detayLayout, /h-40 rounded-2xl/);
    assert.match(detayLayout, /Ders bilgileri yükleniyor/);
});

test("iki giriş noktası aynı düzenleme sayfasını kullanır ve görünüm alanları kaydedilir", async () => {
    const [detayLayout, derslerim, duzenleme] = await Promise.all([
        kaynakOku("../src/components/DersDetayLayout.jsx"),
        kaynakOku("../src/pages/Derslerim.jsx"),
        kaynakOku("../src/pages/DersDuzenle.jsx"),
    ]);

    assert.match(detayLayout, /dersDuzenlemeYolu\(ders\._id, "detay"\)/);
    assert.match(derslerim, /dersDuzenlemeYolu\(ders\._id\)/);
    for (const alan of ["dersAdi", "aciklama", "donem", "dersKodu", "renk", "simge"]) {
        assert.match(duzenleme, new RegExp(`${alan}: form\\.${alan}`));
    }
    assert.match(duzenleme, /api\.put\(`\/dersler\/\$\{dersId\}`/);
    assert.match(duzenleme, /<DersKarti ders=\{form\}/);
});

test("Ders Hazır görünümü geçici uiPrefs yerine kalıcı ders simgesi ve rengini kullanır", async () => {
    const dersHazir = await kaynakOku("../src/pages/DersHazir.jsx");

    assert.match(dersHazir, /DersGorunumSimgesi renk=\{ders\?\.renk\} simge=\{ders\?\.simge\}/);
    assert.doesNotMatch(dersHazir, /const uiPrefs/);
});

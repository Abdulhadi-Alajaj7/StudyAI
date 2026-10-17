import { test, beforeEach, mock } from "node:test";
import assert from "node:assert/strict";

let harita;
let yenilemeHatasi;
let yenilemeSayisi;

const ayniId = (sol, sag) => String(sol) === String(sag);

mock.module("../models/KonuHaritasi.js", {
    defaultExport: {
        async updateOne(filtre, guncelleme) {
            yenilemeSayisi++;
            if (yenilemeHatasi) throw yenilemeHatasi;

            const eslesiyor = harita &&
                ayniId(harita.dersId, filtre.dersId) &&
                ayniId(harita.kullaniciId, filtre.kullaniciId) &&
                harita.durum === filtre.durum &&
                ayniId(harita.aktifIslemToken, filtre.aktifIslemToken);

            if (!eslesiyor) return { matchedCount: 0 };

            Object.assign(harita, guncelleme.$set);
            if (guncelleme.$currentDate?.kilitSonYenilemeTarihi) {
                harita.kilitSonYenilemeTarihi = new Date();
            }
            return { matchedCount: 1 };
        }
    }
});

const {
    KONU_HARITASI_KILIT_ZAMAN_ASIMI_MS,
    KonuHaritasiKilitKaybiHatasi,
    konuHaritasiKilidiAktifMi,
    konuHaritasiKilitAlmaKosulu,
    konuHaritasiKilidiniYenile,
    konuHaritasiHeartbeatBaslat
} = await import("../services/konuHaritasiKilitService.js");

beforeEach(() => {
    harita = {
        dersId: "ders-1",
        kullaniciId: "kullanici-1",
        durum: "olusturuluyor",
        aktifIslemToken: "token-1",
        updatedAt: new Date(0),
        kilitSonYenilemeTarihi: new Date()
    };
    yenilemeHatasi = null;
    yenilemeSayisi = 0;
});

test("güncel heartbeat, eski updatedAt değerine rağmen beş dakikayı aşan kilidi aktif tutar", () => {
    const simdi = Date.now();
    harita.updatedAt = new Date(simdi - KONU_HARITASI_KILIT_ZAMAN_ASIMI_MS * 2);
    harita.kilitSonYenilemeTarihi = new Date(simdi - 1000);

    assert.equal(konuHaritasiKilidiAktifMi(harita, simdi), true);
});

test("gerçekten zaman aşımına uğramış lease devralma koşuluna girer", () => {
    const simdi = Date.now();
    harita.kilitSonYenilemeTarihi = new Date(
        simdi - KONU_HARITASI_KILIT_ZAMAN_ASIMI_MS - 1
    );

    assert.equal(konuHaritasiKilidiAktifMi(harita, simdi), false);

    const kosul = konuHaritasiKilitAlmaKosulu();
    const zamanAsimiMs = kosul.$or[1].$expr.$lt[1].$subtract[1];
    assert.equal(
        zamanAsimiMs,
        KONU_HARITASI_KILIT_ZAMAN_ASIMI_MS
    );
});

test("heartbeat yalnızca kendi tokenına ait kilidi yeniler", async () => {
    const oncekiYenileme = harita.kilitSonYenilemeTarihi;
    await konuHaritasiKilidiniYenile({
        dersId: harita.dersId,
        kullaniciId: harita.kullaniciId,
        islemToken: "token-1"
    });

    assert.ok(harita.kilitSonYenilemeTarihi >= oncekiYenileme);

    await assert.rejects(
        konuHaritasiKilidiniYenile({
            dersId: harita.dersId,
            kullaniciId: harita.kullaniciId,
            islemToken: "eski-token"
        }),
        KonuHaritasiKilitKaybiHatasi
    );
    assert.equal(harita.aktifIslemToken, "token-1");
});

test("heartbeat veritabanı hatasında bekleyen işlemi güvenli şekilde durdurur", async () => {
    const heartbeat = await konuHaritasiHeartbeatBaslat({
        dersId: harita.dersId,
        kullaniciId: harita.kullaniciId,
        islemToken: "token-1",
        aralikMs: 5
    });

    yenilemeHatasi = new Error("MongoDB geçici hatası");

    await assert.rejects(
        heartbeat.bekle(new Promise((resolve) => setTimeout(resolve, 50))),
        /kilidi yenilenemedi/
    );
    heartbeat.durdur();
    assert.ok(yenilemeSayisi >= 2);
});

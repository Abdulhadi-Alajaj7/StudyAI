import { randomUUID } from "node:crypto";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Test from "../models/Test.js";
import { dengeliOzetParcalariniSec } from "./dersOzetiService.js";
import { semanticAramaYap } from "./semanticAramaService.js";
import {
    geminiIleTestSorulariUret,
    VARSAYILAN_GEMINI_MODELI,
} from "./geminiService.js";
import { testTanilamaKaydiYaz } from "./testTanilamaService.js";

const VARSAYILAN_KAYNAK_BUTCESI = 160_000;
const MINIMUM_SORU_BASI_KARAKTER = 80;
const TEST_LISTE_ALANLARI = [
    "_id",
    "dersId",
    "kapsamTuru",
    "materyalId",
    "konuId",
    "konuBasligi",
    "soruSayisi",
    "zorluk",
    "durum",
    "sonGoruntulenenSoru",
    "baslamaTarihi",
    "tamamlanmaTarihi",
    "sonuc",
    "createdAt",
    "updatedAt",
].join(" ");

export class TestSistemiHatasi extends Error {
    constructor(mesaj, { status = 500, kod = "TEST_SISTEMI_HATASI" } = {}) {
        super(mesaj);
        this.name = "TestSistemiHatasi";
        this.status = status;
        this.kod = kod;
    }
}

const kimlikMetni = (deger) => String(deger ?? "");
const belgeyiNesneyeCevir = (belge) => belge?.toObject ? belge.toObject() : belge;
const kaynakButcesiGetir = () => {
    const ayar = Number.parseInt(process.env.TEST_MAKS_KAYNAK_KARAKTERI, 10);
    return Number.isInteger(ayar)
        ? Math.min(300_000, Math.max(30_000, ayar))
        : VARSAYILAN_KAYNAK_BUTCESI;
};

const bagimliliklariGetir = (bagimliliklar = {}) => ({
    DersModel: bagimliliklar.DersModel || Ders,
    MateryalModel: bagimliliklar.MateryalModel || Materyal,
    MetinParcasiModel: bagimliliklar.MetinParcasiModel || MetinParcasi,
    KonuHaritasiModel: bagimliliklar.KonuHaritasiModel || KonuHaritasi,
    TestModel: bagimliliklar.TestModel || Test,
    semanticArama: bagimliliklar.semanticArama || semanticAramaYap,
    geminiTestUret: bagimliliklar.geminiTestUret || geminiIleTestSorulariUret,
    kaynakButcesi: bagimliliklar.kaynakButcesi || kaynakButcesiGetir(),
    simdi: bagimliliklar.simdi || (() => new Date()),
    korelasyonIdOlustur: bagimliliklar.korelasyonIdOlustur || randomUUID,
    testTanilamaYaz: bagimliliklar.testTanilamaYaz || testTanilamaKaydiYaz,
});

const dersBulunamadiHatasi = () => new TestSistemiHatasi(
    "Ders bulunamadı veya bu ders için yetkiniz yok.",
    { status: 404, kod: "DERS_BULUNAMADI" }
);

const testBulunamadiHatasi = () => new TestSistemiHatasi(
    "Test bulunamadı veya bu test için yetkiniz yok.",
    { status: 404, kod: "TEST_BULUNAMADI" }
);

const uygunIcerikBulunamadiHatasi = (mesaj) => new TestSistemiHatasi(
    mesaj || "İstenen sayıda güvenilir soru üretmek için yeterli işlenmiş içerik bulunamadı.",
    { status: 422, kod: "YETERSIZ_TEST_ICERIGI" }
);

const turkceNormalizeEt = (metin) => String(metin || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9çğıöşü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const sorguKelimeleri = (metin) => [...new Set(
    turkceNormalizeEt(metin)
        .split(" ")
        .filter((kelime) => kelime.length >= 4)
)];

export const zorlukDagiliminiOlustur = (zorluk, soruSayisi) => {
    if (zorluk !== "karisik") return { [zorluk]: soruSayisi };
    const taban = Math.floor(soruSayisi / 3);
    const kalan = soruSayisi % 3;
    return {
        kolay: taban + (kalan > 1 ? 1 : 0),
        orta: taban + (kalan > 0 ? 1 : 0),
        zor: taban,
    };
};

const konulariDuzlestir = (harita) => (harita?.anaKonular || []).flatMap((anaKonu) => {
    const anaKaynaklar = anaKonu.kaynakMateryalIds || [];
    const ana = {
        konuId: anaKonu.konuId,
        baslik: anaKonu.baslik,
        konuTuru: "ana",
        sorgu: [anaKonu.baslik, anaKonu.aciklama].filter(Boolean).join(" "),
        kaynakMateryalIds: anaKaynaklar,
    };
    const altlar = (anaKonu.altKonular || []).map((altKonu) => ({
        konuId: altKonu.konuId,
        baslik: altKonu.baslik,
        konuTuru: "alt",
        sorgu: [
            anaKonu.baslik,
            anaKonu.aciklama,
            altKonu.baslik,
            altKonu.aciklama,
        ].filter(Boolean).join(" "),
        kaynakMateryalIds: (altKonu.kaynakMateryalIds || []).length > 0
            ? altKonu.kaynakMateryalIds
            : anaKaynaklar,
    }));
    return [ana, ...altlar];
});

const dagitimKonulariniGetir = (harita) => (harita?.anaKonular || []).flatMap(
    (anaKonu) => (anaKonu.altKonular || []).length > 0
        ? (anaKonu.altKonular || []).map((altKonu) => ({
            konuId: altKonu.konuId,
            baslik: altKonu.baslik,
            sorgu: [
                anaKonu.baslik,
                anaKonu.aciklama,
                altKonu.baslik,
                altKonu.aciklama,
            ].filter(Boolean).join(" "),
            kaynakMateryalIds: (altKonu.kaynakMateryalIds || []).length > 0
                ? altKonu.kaynakMateryalIds
                : (anaKonu.kaynakMateryalIds || []),
        }))
        : [{
            konuId: anaKonu.konuId,
            baslik: anaKonu.baslik,
            sorgu: [anaKonu.baslik, anaKonu.aciklama].filter(Boolean).join(" "),
            kaynakMateryalIds: anaKonu.kaynakMateryalIds || [],
        }]
);

const konuIcinParcalariSirala = (parcalar, konu) => {
    const izinliMateryaller = new Set(konu.kaynakMateryalIds.map(kimlikMetni));
    const kelimeler = sorguKelimeleri(konu.sorgu);
    const adaylar = parcalar.filter((parca) => (
        izinliMateryaller.size === 0 || izinliMateryaller.has(kimlikMetni(parca.materyalId))
    ));
    const puanli = adaylar.map((parca) => {
        const icerik = turkceNormalizeEt(parca.icerik);
        return {
            parca,
            skor: kelimeler.reduce(
                (toplam, kelime) => toplam + (icerik.includes(kelime) ? 1 : 0),
                0
            ),
        };
    });
    const eslesenler = puanli.filter(({ skor }) => skor > 0);
    return (eslesenler.length > 0 ? eslesenler : puanli)
        .sort((sol, sag) => (
            sag.skor - sol.skor ||
            kimlikMetni(sol.parca.materyalId).localeCompare(kimlikMetni(sag.parca.materyalId)) ||
            sol.parca.parcaIndex - sag.parca.parcaIndex
        ))
        .map(({ parca }) => parca);
};

const konuIcinParcalariSec = async ({
    kullaniciId,
    dersId,
    konu,
    materyaller,
    tumParcalar,
}, deps) => {
    try {
        const aramaSonucu = await deps.semanticArama({
            kullaniciId,
            dersId,
            sorgu: konu.sorgu.slice(0, 500),
            limit: 10,
            materyalIds: materyaller.map((materyal) => materyal._id),
        });
        const eslesmeler = new Set((aramaSonucu?.sonuclar || []).map(
            (sonuc) => `${sonuc.materyalId}:${sonuc.parcaIndex}`
        ));
        if (eslesmeler.size > 0) {
            const secilenler = tumParcalar.filter((parca) => [-1, 0, 1].some(
                (fark) => eslesmeler.has(
                    `${kimlikMetni(parca.materyalId)}:${parca.parcaIndex + fark}`
                )
            ));
            if (secilenler.length > 0) return secilenler;
        }
    } catch {
        // Embedding geçici olarak kullanılamazsa konu haritası ve metin
        // eşleşmesi, test üretimini deterministik biçimde çalışır tutar.
    }
    return konuIcinParcalariSirala(tumParcalar, konu);
};

export const konuKotalariniDagit = (konuGruplari, soruSayisi) => {
    const gruplar = (konuGruplari || [])
        .map((grup) => ({
            ...grup,
            karakterSayisi: grup.parcalar.reduce(
                (toplam, parca) => toplam + String(parca.icerik || "").length,
                0
            ),
        }))
        .filter((grup) => grup.karakterSayisi >= MINIMUM_SORU_BASI_KARAKTER)
        .sort((sol, sag) => (
            sag.karakterSayisi - sol.karakterSayisi ||
            sol.konuId.localeCompare(sag.konuId)
        ));
    if (gruplar.length === 0) return [];

    const secilenler = gruplar.slice(0, soruSayisi).map((grup) => ({
        ...grup,
        kapasite: Math.max(1, Math.floor(
            grup.karakterSayisi / MINIMUM_SORU_BASI_KARAKTER
        )),
        adet: 1,
    }));
    let kalan = soruSayisi - secilenler.length;
    while (kalan > 0) {
        const uygunlar = secilenler.filter((grup) => grup.adet < grup.kapasite);
        if (uygunlar.length === 0) return [];
        uygunlar.sort((sol, sag) => (
            (sol.adet / sol.kapasite) - (sag.adet / sag.kapasite) ||
            sol.adet - sag.adet ||
            sag.karakterSayisi - sol.karakterSayisi ||
            sol.konuId.localeCompare(sag.konuId)
        ));
        uygunlar[0].adet += 1;
        kalan -= 1;
    }
    return secilenler;
};

const dersiGetir = async ({ kullaniciId, dersId }, DersModel) => {
    const ders = await DersModel.findOne({
        _id: dersId,
        kullaniciId,
        temizleniyor: { $ne: true },
    })
        .select("_id dersAdi aciklama materyallerOnaylandi")
        .lean();
    if (!ders) throw dersBulunamadiHatasi();
    return ders;
};

const konuHaritasiniGetir = async ({ kullaniciId, dersId }, deps) => (
    deps.KonuHaritasiModel.findOne({ kullaniciId, dersId, durum: "hazir" })
        .select("anaKonular")
        .lean()
);

const hedefiDogrula = async ({
    kullaniciId,
    dersId,
    kapsamTuru,
    materyalId,
    konuId,
}, deps) => {
    const harita = await konuHaritasiniGetir({ kullaniciId, dersId }, deps);
    if (kapsamTuru === "materyal") {
        const materyal = await deps.MateryalModel.findOne({
            _id: materyalId,
            kullaniciId,
            dersId,
        })
            .select("_id durum aktifIslemeId dosyaAdi orijinalDosyaAdi")
            .lean();
        if (!materyal) {
            throw new TestSistemiHatasi(
                "Materyal bulunamadı, seçilen derse ait değil veya bu materyal için yetkiniz yok.",
                { status: 404, kod: "MATERYAL_BULUNAMADI" }
            );
        }
        if (materyal.durum !== "hazir" || !materyal.aktifIslemeId) {
            throw uygunIcerikBulunamadiHatasi(
                "Seçilen materyal henüz işlenmemiş veya test üretmeye hazır değil."
            );
        }
        return { materyal, konu: null, harita };
    }

    if (kapsamTuru === "konu") {
        if (!harita) {
            throw new TestSistemiHatasi(
                "Konu testi için hazır bir konu haritası bulunamadı.",
                { status: 422, kod: "KONU_HARITASI_HAZIR_DEGIL" }
            );
        }
        const konu = konulariDuzlestir(harita).find((aday) => aday.konuId === konuId);
        if (!konu) {
            throw new TestSistemiHatasi(
                "Seçilen konu bu dersin güncel konu haritasında bulunamadı.",
                { status: 404, kod: "KONU_BULUNAMADI" }
            );
        }
        return { materyal: null, konu, harita };
    }
    return { materyal: null, konu: null, harita };
};

const hazirMateryalleriGetir = async ({
    kullaniciId,
    dersId,
    materyalIds = null,
}, MateryalModel) => MateryalModel.find({
    kullaniciId,
    dersId,
    durum: "hazir",
    aktifIslemeId: { $ne: null },
    ...(Array.isArray(materyalIds) ? { _id: { $in: materyalIds } } : {}),
})
    .select("_id dosyaAdi orijinalDosyaAdi aktifIslemeId")
    .sort({ _id: 1 })
    .lean();

const aktifParcalariGetir = async ({
    kullaniciId,
    dersId,
    materyaller,
}, MetinParcasiModel) => {
    if (materyaller.length === 0) return [];
    return MetinParcasiModel.find({
        kullaniciId,
        dersId,
        $or: materyaller.map((materyal) => ({
            materyalId: materyal._id,
            islemeId: materyal.aktifIslemeId,
        })),
    })
        .select("_id materyalId islemeId parcaIndex icerik")
        .sort({ materyalId: 1, parcaIndex: 1, _id: 1 })
        .lean();
};

const kapsamMateryalIds = (kapsamTuru, hedef) => {
    if (kapsamTuru === "materyal") return [hedef.materyal._id];
    if (kapsamTuru === "konu" && hedef.konu.kaynakMateryalIds.length > 0) {
        return hedef.konu.kaynakMateryalIds;
    }
    return null;
};

const enUygunKonuyuBul = (parca, konular) => {
    const icerik = turkceNormalizeEt(parca.icerik);
    let enIyi = null;
    let enIyiSkor = 0;
    for (const konu of konular) {
        const izinli = konu.kaynakMateryalIds.length === 0 || konu.kaynakMateryalIds.some(
            (id) => kimlikMetni(id) === kimlikMetni(parca.materyalId)
        );
        if (!izinli) continue;
        const skor = sorguKelimeleri(konu.sorgu).reduce(
            (toplam, kelime) => toplam + (icerik.includes(kelime) ? 1 : 0),
            0
        );
        if (skor > enIyiSkor) {
            enIyiSkor = skor;
            enIyi = konu;
        }
    }
    return enIyi;
};

const kaynakKayitlariniOlustur = (parcaKonulari, materyaller) => {
    const materyalHaritasi = new Map(
        materyaller.map((materyal) => [kimlikMetni(materyal._id), materyal])
    );
    return parcaKonulari.map(({ parca, konu }, index) => {
        const materyal = materyalHaritasi.get(kimlikMetni(parca.materyalId));
        return {
            anahtar: `K${index + 1}`,
            materyalId: parca.materyalId,
            dosyaAdi: materyal?.orijinalDosyaAdi || materyal?.dosyaAdi || "Materyal",
            parcaIndex: parca.parcaIndex,
            konuId: konu?.konuId || "",
            icerik: String(parca.icerik || "").trim(),
        };
    });
};

const kaynaklariHazirla = async ({
    kullaniciId,
    dersId,
    kapsamTuru,
    hedef,
    soruSayisi,
}, deps) => {
    const materyaller = await hazirMateryalleriGetir({
        kullaniciId,
        dersId,
        materyalIds: kapsamMateryalIds(kapsamTuru, hedef),
    }, deps.MateryalModel);
    if (materyaller.length === 0) throw uygunIcerikBulunamadiHatasi();

    const tumParcalar = await aktifParcalariGetir({
        kullaniciId,
        dersId,
        materyaller,
    }, deps.MetinParcasiModel);
    if (tumParcalar.length === 0) throw uygunIcerikBulunamadiHatasi();

    const tumKonular = konulariDuzlestir(hedef.harita);
    let konuDagilimi = [];
    let parcaKonulari = [];

    if (kapsamTuru === "tum_ders" && hedef.harita) {
        const gruplar = dagitimKonulariniGetir(hedef.harita).map((konu) => ({
            ...konu,
            parcalar: konuIcinParcalariSirala(tumParcalar, konu),
        }));
        const kotalar = konuKotalariniDagit(gruplar, soruSayisi);
        if (kotalar.length === 0) throw uygunIcerikBulunamadiHatasi();
        const grupButcesi = Math.max(2_000, Math.floor(deps.kaynakButcesi / kotalar.length));
        parcaKonulari = kotalar.flatMap((grup) => (
            dengeliOzetParcalariniSec(grup.parcalar, grupButcesi)
                .map((parca) => ({ parca, konu: grup }))
        ));
        konuDagilimi = kotalar.map((grup) => ({
            konuId: grup.konuId,
            baslik: grup.baslik,
            adet: grup.adet,
        }));
    } else {
        const ilgiliParcalar = kapsamTuru === "konu"
            ? await konuIcinParcalariSec({
                kullaniciId,
                dersId,
                konu: hedef.konu,
                materyaller,
                tumParcalar,
            }, deps)
            : tumParcalar;
        const secilenler = dengeliOzetParcalariniSec(
            ilgiliParcalar,
            deps.kaynakButcesi
        );
        parcaKonulari = secilenler.map((parca) => ({
            parca,
            konu: kapsamTuru === "konu"
                ? hedef.konu
                : enUygunKonuyuBul(parca, tumKonular),
        }));
        if (kapsamTuru === "konu") {
            konuDagilimi = [{
                konuId: hedef.konu.konuId,
                baslik: hedef.konu.baslik,
                adet: soruSayisi,
            }];
        }
    }

    const benzersizParcaKonulari = [...new Map(parcaKonulari.map(({ parca, konu }) => [
        `${konu?.konuId || ""}:${kimlikMetni(parca.materyalId)}:${parca.parcaIndex}`,
        { parca, konu },
    ])).values()];
    const toplamKarakter = benzersizParcaKonulari.reduce(
        (toplam, { parca }) => toplam + String(parca.icerik || "").length,
        0
    );
    if (toplamKarakter < soruSayisi * MINIMUM_SORU_BASI_KARAKTER) {
        throw uygunIcerikBulunamadiHatasi();
    }

    return {
        materyaller,
        kaynaklar: kaynakKayitlariniOlustur(benzersizParcaKonulari, materyaller),
        konuDagilimi,
        izinliKonuIds: tumKonular.map(({ konuId, baslik, konuTuru }) => ({
            konuId,
            baslik,
            konuTuru,
        })),
        kaynakSurumleri: materyaller.map((materyal) => ({
            materyalId: materyal._id,
            aktifIslemeId: materyal.aktifIslemeId,
        })),
    };
};

const kaynakSurumleriniDogrula = async ({
    kullaniciId,
    dersId,
    kapsamTuru,
    hedef,
    kaynakSurumleri,
}, deps) => {
    const guncelMateryaller = await hazirMateryalleriGetir({
        kullaniciId,
        dersId,
        materyalIds: kapsamMateryalIds(kapsamTuru, hedef),
    }, deps.MateryalModel);
    const guncelHarita = new Map(
        guncelMateryaller.map((materyal) => [kimlikMetni(materyal._id), materyal])
    );
    const ayni = guncelMateryaller.length === kaynakSurumleri.length &&
        kaynakSurumleri.every((kaynak) => (
            kimlikMetni(guncelHarita.get(kimlikMetni(kaynak.materyalId))?.aktifIslemeId) ===
            kimlikMetni(kaynak.aktifIslemeId)
        ));
    if (!ayni) {
        throw new TestSistemiHatasi(
            "Test hazırlanırken materyal içeriği değişti. Eski kaynaklarla üretilen test kaydedilmedi; lütfen yeniden deneyin.",
            { status: 409, kod: "KAYNAK_SURUMU_DEGISTI" }
        );
    }
};

export const testOlustur = async ({
    kullaniciId,
    dersId,
    kapsamTuru,
    materyalId = null,
    konuId = "",
    soruSayisi = 10,
    zorluk = "karisik",
}, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    const tanilama = {
        korelasyonId: deps.korelasyonIdOlustur(),
        kapsamTuru,
        istenenSoruSayisi: soruSayisi,
        istenenZorluk: zorluk,
        model: process.env.GEMINI_TEST_MODELI || VARSAYILAN_GEMINI_MODELI,
    };
    let asama = "DERS_DOGRULAMA";

    try {
        const ders = await dersiGetir({ kullaniciId, dersId }, deps.DersModel);
        asama = "HEDEF_DOGRULAMA";
        const hedef = await hedefiDogrula({
            kullaniciId,
            dersId,
            kapsamTuru,
            materyalId,
            konuId,
        }, deps);
        asama = "KAYNAK_HAZIRLAMA";
        const kaynakVerisi = await kaynaklariHazirla({
            kullaniciId,
            dersId,
            kapsamTuru,
            hedef,
            soruSayisi,
        }, deps);
        Object.assign(tanilama, {
            kaynakMateryalSayisi: kaynakVerisi.materyaller.length,
            kaynakMetinParcasiSayisi: kaynakVerisi.kaynaklar.length,
            konuSayisi: new Set(
                kaynakVerisi.kaynaklar.map((kaynak) => String(kaynak.konuId || ""))
                    .filter(Boolean)
            ).size,
            toplamKaynakKarakterSayisi: kaynakVerisi.kaynaklar.reduce(
                (toplam, kaynak) => toplam + String(kaynak.icerik || "").length,
                0
            ),
        });
        const zorlukDagilimi = zorlukDagiliminiOlustur(zorluk, soruSayisi);
        asama = "GEMINI_URETIMI";
        const geminiSonucu = await deps.geminiTestUret({
            dersBilgisi: { dersAdi: ders.dersAdi, aciklama: ders.aciklama },
            kapsamTuru,
            hedefBasligi: hedef.materyal
                ? (hedef.materyal.orijinalDosyaAdi || hedef.materyal.dosyaAdi)
                : (hedef.konu?.baslik || ders.dersAdi),
            soruSayisi,
            zorlukDagilimi,
            konuDagilimi: kaynakVerisi.konuDagilimi,
            kaynaklar: kaynakVerisi.kaynaklar,
            izinliKonuIds: kaynakVerisi.izinliKonuIds,
        });

        asama = "KAYNAK_SURUM_DOGRULAMA";
        await kaynakSurumleriniDogrula({
            kullaniciId,
            dersId,
            kapsamTuru,
            hedef,
            kaynakSurumleri: kaynakVerisi.kaynakSurumleri,
        }, deps);

        asama = "TEST_KAYDI";
        const testBelgesi = await deps.TestModel.create({
            kullaniciId,
            dersId,
            kapsamTuru,
            materyalId: kapsamTuru === "materyal" ? materyalId : null,
            konuId: kapsamTuru === "konu" ? konuId : "",
            konuBasligi: hedef.konu?.baslik || "",
            soruSayisi,
            zorluk,
            sorular: geminiSonucu.sorular,
            kaynakSurumleri: kaynakVerisi.kaynakSurumleri,
            kullanilanModel: geminiSonucu.model ||
                process.env.GEMINI_TEST_MODELI ||
                VARSAYILAN_GEMINI_MODELI,
            durum: "hazirlandi",
        });
        return belgeyiNesneyeCevir(testBelgesi);
    } catch (hata) {
        const dogrulamaHatasi = hata?.name === "ValidationError" || hata?.name === "CastError";
        try {
            deps.testTanilamaYaz({
                ...tanilama,
                ...hata?.tanilama,
                asama: hata?.tanilama?.asama || asama,
                httpDurumu: Number.isInteger(hata?.status)
                    ? hata.status
                    : (dogrulamaHatasi ? 400 : 500),
                uygulamaHataKodu: typeof hata?.kod === "string"
                    ? hata.kod
                    : (dogrulamaHatasi ? "GECERSIZ_TEST_VERISI" : "TEST_SISTEMI_SUNUCU_HATASI"),
            });
        } catch {
            // Tanılama altyapısı, asıl HTTP hata davranışını değiştirmemelidir.
        }
        throw hata;
    }
};

const sahiplikFiltresi = ({ kullaniciId, dersId, testId }) => ({
    _id: testId,
    kullaniciId,
    dersId,
});

const testDurumHatasiniAt = async (girdi, deps, soruId = null) => {
    const testBelgesi = await deps.TestModel.findOne(sahiplikFiltresi(girdi))
        .select("durum sorular._id soruSayisi")
        .lean();
    if (!testBelgesi) throw testBulunamadiHatasi();
    if (testBelgesi.durum === "tamamlandi") {
        throw new TestSistemiHatasi(
            "Tamamlanmış testler değiştirilemez.",
            { status: 409, kod: "TEST_TAMAMLANDI" }
        );
    }
    if (testBelgesi.durum !== "devam_ediyor") {
        throw new TestSistemiHatasi(
            "Bu işlemden önce testi başlatmalısınız.",
            { status: 409, kod: "TEST_BASLATILMADI" }
        );
    }
    if (soruId && !(testBelgesi.sorular || []).some(
        (soru) => kimlikMetni(soru._id) === kimlikMetni(soruId)
    )) {
        throw new TestSistemiHatasi(
            "Soru bu testte bulunamadı.",
            { status: 404, kod: "SORU_BULUNAMADI" }
        );
    }
    throw new TestSistemiHatasi(
        "Test ilerlemesi kaydedilemedi. Lütfen yeniden deneyin.",
        { status: 409, kod: "TEST_GUNCELLEME_CAKISMASI" }
    );
};

export const testiGetir = async (girdi, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    const testBelgesi = await deps.TestModel.findOne(sahiplikFiltresi(girdi)).lean();
    if (!testBelgesi) throw testBulunamadiHatasi();
    return testBelgesi;
};

export const testleriListele = async ({
    kullaniciId,
    dersId,
    tamamlandi,
}, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    await dersiGetir({ kullaniciId, dersId }, deps.DersModel);
    const durum = tamamlandi
        ? "tamamlandi"
        : { $in: ["hazirlandi", "devam_ediyor"] };
    const testler = await deps.TestModel.find({ kullaniciId, dersId, durum })
        .select(`${TEST_LISTE_ALANLARI} sorular.ogrenciCevabi`)
        .sort({ updatedAt: -1, _id: -1 })
        .lean();
    return testler.map(({ sorular = [], ...test }) => ({
        ...test,
        cevaplananSoruSayisi: sorular.filter(
            (soru) => soru?.ogrenciCevabi != null
        ).length,
    }));
};

export const testiBaslat = async (girdi, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    const baslatilan = await deps.TestModel.findOneAndUpdate(
        { ...sahiplikFiltresi(girdi), durum: "hazirlandi" },
        {
            $set: {
                durum: "devam_ediyor",
                baslamaTarihi: deps.simdi(),
            },
        },
        { new: true, runValidators: true }
    ).lean();
    if (baslatilan) return baslatilan;

    const mevcut = await deps.TestModel.findOne(sahiplikFiltresi(girdi)).lean();
    if (!mevcut) throw testBulunamadiHatasi();
    if (mevcut.durum === "devam_ediyor") return mevcut;
    throw new TestSistemiHatasi(
        "Tamamlanmış test yeniden başlatılamaz.",
        { status: 409, kod: "TEST_TAMAMLANDI" }
    );
};

export const cevabiKaydet = async ({
    kullaniciId,
    dersId,
    testId,
    soruId,
    cevap,
}, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    const girdi = { kullaniciId, dersId, testId };
    const guncellenen = await deps.TestModel.findOneAndUpdate(
        {
            ...sahiplikFiltresi(girdi),
            durum: "devam_ediyor",
            "sorular._id": soruId,
        },
        { $set: { "sorular.$.ogrenciCevabi": cevap } },
        { new: true, runValidators: true }
    ).lean();
    if (!guncellenen) await testDurumHatasiniAt(girdi, deps, soruId);
    return guncellenen;
};

export const soruIsaretiniGuncelle = async ({
    kullaniciId,
    dersId,
    testId,
    soruId,
    isaretli,
}, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    const girdi = { kullaniciId, dersId, testId };
    const guncellenen = await deps.TestModel.findOneAndUpdate(
        {
            ...sahiplikFiltresi(girdi),
            durum: "devam_ediyor",
            "sorular._id": soruId,
        },
        { $set: { "sorular.$.isaretli": isaretli } },
        { new: true, runValidators: true }
    ).lean();
    if (!guncellenen) await testDurumHatasiniAt(girdi, deps, soruId);
    return guncellenen;
};

export const sonGoruntulenenSoruyuGuncelle = async ({
    kullaniciId,
    dersId,
    testId,
    soruIndex,
}, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    const girdi = { kullaniciId, dersId, testId };
    const guncellenen = await deps.TestModel.findOneAndUpdate(
        {
            ...sahiplikFiltresi(girdi),
            durum: "devam_ediyor",
            soruSayisi: { $gt: soruIndex },
        },
        { $set: { sonGoruntulenenSoru: soruIndex } },
        { new: true, runValidators: true }
    ).lean();
    if (!guncellenen) {
        const mevcut = await deps.TestModel.findOne(sahiplikFiltresi(girdi))
            .select("durum soruSayisi")
            .lean();
        if (mevcut && mevcut.durum === "devam_ediyor" && soruIndex >= mevcut.soruSayisi) {
            throw new TestSistemiHatasi(
                "Son görüntülenen soru indeksi test sınırlarının dışındadır.",
                { status: 400, kod: "GECERSIZ_SORU_INDEXI" }
            );
        }
        await testDurumHatasiniAt(girdi, deps);
    }
    return guncellenen;
};

export const sonucuHesapla = (sorular) => {
    const dogruSayisi = sorular.filter(
        (soru) => soru.ogrenciCevabi != null && soru.ogrenciCevabi === soru.dogruCevap
    ).length;
    const bosSayisi = sorular.filter((soru) => soru.ogrenciCevabi == null).length;
    const yanlisSayisi = sorular.length - dogruSayisi - bosSayisi;
    return {
        dogruSayisi,
        yanlisSayisi,
        bosSayisi,
        basariOrani: Number(((dogruSayisi / sorular.length) * 100).toFixed(2)),
    };
};

export const testiTamamla = async (girdi, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    for (let deneme = 0; deneme < 3; deneme += 1) {
        const mevcut = await deps.TestModel.findOne(sahiplikFiltresi(girdi)).lean();
        if (!mevcut) throw testBulunamadiHatasi();
        if (mevcut.durum === "tamamlandi") {
            return { test: mevcut, zatenTamamlandi: true };
        }
        if (mevcut.durum !== "devam_ediyor") {
            throw new TestSistemiHatasi(
                "Testi tamamlamadan önce başlatmalısınız.",
                { status: 409, kod: "TEST_BASLATILMADI" }
            );
        }

        const sonuc = sonucuHesapla(mevcut.sorular);
        const tamamlanan = await deps.TestModel.findOneAndUpdate(
            {
                ...sahiplikFiltresi(girdi),
                durum: "devam_ediyor",
                ...(mevcut.updatedAt ? { updatedAt: mevcut.updatedAt } : {}),
            },
            {
                $set: {
                    durum: "tamamlandi",
                    tamamlanmaTarihi: deps.simdi(),
                    sonuc,
                },
            },
            { new: true, runValidators: true }
        ).lean();
        if (tamamlanan) return { test: tamamlanan, zatenTamamlandi: false };
    }
    throw new TestSistemiHatasi(
        "Test aynı anda güncellendiği için tamamlanamadı. Son cevapların kaydedildiğini kontrol edip yeniden deneyin.",
        { status: 409, kod: "TEST_GUNCELLEME_CAKISMASI" }
    );
};

export const testSonucunuGetir = async (girdi, bagimliliklar = {}) => {
    const testBelgesi = await testiGetir(girdi, bagimliliklar);
    if (testBelgesi.durum !== "tamamlandi") {
        throw new TestSistemiHatasi(
            "Test sonucu yalnızca test tamamlandıktan sonra görüntülenebilir.",
            { status: 409, kod: "TEST_TAMAMLANMADI" }
        );
    }
    return testBelgesi;
};

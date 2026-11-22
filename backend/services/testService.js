import { randomUUID } from "node:crypto";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Test from "../models/Test.js";
import { dengeliOzetParcalariniSec } from "./dersOzetiService.js";
import { semanticAramaYap } from "./semanticAramaService.js";
import { dersKonulariniDogrulamaIcinGetir, testKonuDogrulayicisiOlustur } from "./testKonuDogrulamaService.js";
import {
    geminiIleTestSorulariUret,
    geminiIleTestKalitesiniDenetle,
    VARSAYILAN_GEMINI_MODELI,
} from "./geminiService.js";
import { testTanilamaKaydiYaz } from "./testTanilamaService.js";
import { testUretimIzleyicisiOlustur } from "./testUretimIzlemeService.js";

const VARSAYILAN_KAYNAK_BUTCESI = 160_000;
const MINIMUM_SORU_BASI_KARAKTER = 80;
const TEST_KONU_SEMANTIK_MIN_SKOR = 0.5;
const testSemantikMinSkorGetir = () => {
    const ayar = Number.parseFloat(process.env.TEST_KONU_SEMANTIK_MIN_SKOR);
    return Number.isFinite(ayar) ? Math.max(0, Math.min(1, ayar)) : TEST_KONU_SEMANTIK_MIN_SKOR;
};
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
    geminiKaliteDenetle: bagimliliklar.geminiKaliteDenetle || geminiIleTestKalitesiniDenetle,
    testKonuDogrulayicisiOlustur: bagimliliklar.testKonuDogrulayicisiOlustur || testKonuDogrulayicisiOlustur,
    kaynakButcesi: bagimliliklar.kaynakButcesi || kaynakButcesiGetir(),
    simdi: bagimliliklar.simdi || (() => new Date()),
    korelasyonIdOlustur: bagimliliklar.korelasyonIdOlustur || randomUUID,
    testTanilamaYaz: bagimliliklar.testTanilamaYaz || testTanilamaKaydiYaz,
    testUretimIzleyicisiOlustur: bagimliliklar.testUretimIzleyicisiOlustur ||
        testUretimIzleyicisiOlustur,
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
        aciklama: anaKonu.aciklama || "",
        konuTuru: "ana",
        sorgu: [anaKonu.baslik, anaKonu.aciklama].filter(Boolean).join(" "),
        kaynakMateryalIds: anaKaynaklar,
    };
    const altlar = (anaKonu.altKonular || []).map((altKonu) => ({
        konuId: altKonu.konuId,
        baslik: altKonu.baslik,
        aciklama: altKonu.aciklama || "",
        konuTuru: "alt",
        kanitSorgusu: [altKonu.baslik, altKonu.aciklama].filter(Boolean).join(" "),
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
            aciklama: altKonu.aciklama || "",
            konuTuru: "alt",
            kanitSorgusu: [altKonu.baslik, altKonu.aciklama].filter(Boolean).join(" "),
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
            aciklama: anaKonu.aciklama || "",
            konuTuru: "ana",
            kanitSorgusu: [anaKonu.baslik, anaKonu.aciklama].filter(Boolean).join(" "),
            sorgu: [anaKonu.baslik, anaKonu.aciklama].filter(Boolean).join(" "),
            kaynakMateryalIds: anaKonu.kaynakMateryalIds || [],
        }]
);

// Seçilen ana konunun yalnızca doğrudan alt konularını test kapsamına al.
const secilenAnaKonununAltKonulari = (hedef) => {
    const anaKonu = (hedef.harita?.anaKonular || []).find(
        (konu) => konu.konuId === hedef.konu?.konuId
    );
    return anaKonu?.altKonular?.length > 0
        ? dagitimKonulariniGetir({ anaKonular: [anaKonu] })
        : [];
};

const konuIcinParcalariSec = async ({
    kullaniciId,
    dersId,
    konu,
    materyaller,
    tumParcalar,
}, deps) => {
    const haritaMateryalleri = new Set(
        (konu.kaynakMateryalIds || []).map(kimlikMetni)
    );
    const konuMateryalleri = haritaMateryalleri.size > 0
        ? materyaller.filter((materyal) => haritaMateryalleri.has(kimlikMetni(materyal._id)))
        : materyaller;
    const izinliMateryalKimlikleri = new Set(
        konuMateryalleri.map((materyal) => kimlikMetni(materyal._id))
    );
    if (konuMateryalleri.length === 0) return [];
    const sorgu = String(konu.kanitSorgusu || konu.sorgu || konu.baslik || "").trim().slice(0, 500);
    if (!sorgu) return [];
    // Test için konu metinleri yalnızca mevcut embedding tabanlı aramadan gelir.
    // Arama başarısız olduğunda metinsel/kök eşleşmesine geri dönülmez.
    const aramaSonucu = await deps.semanticArama({
        kullaniciId,
        dersId,
        sorgu,
        limit: 10,
        materyalIds: konuMateryalleri.map((materyal) => materyal._id),
    });
    const parcaHaritasi = new Map(tumParcalar
        .filter((parca) => izinliMateryalKimlikleri.has(kimlikMetni(parca.materyalId)))
        .map((parca) => [`${kimlikMetni(parca.materyalId)}:${parca.parcaIndex}`, parca])
    );
    const minSkor = testSemantikMinSkorGetir();
    const secilen = [];
    const gorulen = new Set();
    for (const sonuc of aramaSonucu?.sonuclar || []) {
        if (!Number.isFinite(sonuc.skor) || sonuc.skor < minSkor) continue;
        const anahtar = `${kimlikMetni(sonuc.materyalId)}:${sonuc.parcaIndex}`;
        const parca = parcaHaritasi.get(anahtar);
        if (!parca || gorulen.has(anahtar)) continue;
        gorulen.add(anahtar);
        secilen.push({ ...parca, semantikSkor: sonuc.skor });
    }
    return secilen;
};

const fizikselParcalariTekillestir = (parcalar) => [...new Map(
    (parcalar || []).map((parca) => [
        `${kimlikMetni(parca.materyalId)}:${parca.parcaIndex}`,
        parca,
    ])
).values()];

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

// Ana konu testlerinde hiçbir alt konu atlanmaz. Eşit bölünebilen soru
// sayılarında eşit kota, diğerlerinde içerik kapasitesine göre kalan dağıtılır.
export const altKonuKotalariniDagit = (konuGruplari, soruSayisi) => {
    if (!Array.isArray(konuGruplari) || konuGruplari.length === 0 ||
        !Number.isInteger(soruSayisi) || soruSayisi < konuGruplari.length) return [];

    const gruplar = konuGruplari.map((grup) => {
        const karakterSayisi = fizikselParcalariTekillestir(grup.parcalar).reduce(
            (toplam, parca) => toplam + String(parca.icerik || "").length, 0
        );
        return {
            ...grup,
            karakterSayisi,
            kapasite: Math.floor(karakterSayisi / MINIMUM_SORU_BASI_KARAKTER),
            adet: 1,
        };
    });
    if (gruplar.some((grup) => grup.kapasite < 1)) return [];

    if (soruSayisi % gruplar.length === 0) {
        const esitAdet = soruSayisi / gruplar.length;
        if (gruplar.some((grup) => grup.kapasite < esitAdet)) return [];
        return gruplar.map((grup) => ({ ...grup, adet: esitAdet }));
    }

    let kalan = soruSayisi - gruplar.length;
    while (kalan > 0) {
        const uygunlar = gruplar.filter((grup) => grup.adet < grup.kapasite);
        if (uygunlar.length === 0) return [];
        uygunlar.sort((sol, sag) => (
            // Önce her konuya eşit fırsat; eşit adette olanlarda
            // daha kapsamlı kaynağı bulunan konu öncelikli.
            sol.adet - sag.adet ||
            (sag.karakterSayisi / (sag.adet + 1)) -
            (sol.karakterSayisi / (sol.adet + 1)) ||
            sag.karakterSayisi - sol.karakterSayisi ||
            sol.konuId.localeCompare(sag.konuId)
        ));
        uygunlar[0].adet += 1;
        kalan -= 1;
    }
    return gruplar;
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
    if (kapsamTuru === "konu") {
        const altKonular = secilenAnaKonununAltKonulari(hedef);
        // Ana konuyla ilişkili tüm alt konu materyallerini de kapsa.
        const kaynaklar = [hedef.konu, ...altKonular].flatMap(
            (konu) => konu.kaynakMateryalIds || []
        );
        return kaynaklar.length > 0
            ? [...new Map(kaynaklar.map((id) => [kimlikMetni(id), id])).values()]
            : null;
    }
    return null;
};

const kaynakKayitlariniOlustur = (parcaGruplari, materyaller) => {
    const materyalHaritasi = new Map(
        materyaller.map((materyal) => [kimlikMetni(materyal._id), materyal])
    );
    return parcaGruplari.map(({ parca, konular, konuSkorlari }, index) => {
        const materyal = materyalHaritasi.get(kimlikMetni(parca.materyalId));
        const konuIds = [...new Set(
            (konular || []).map((konu) => String(konu?.konuId || "")).filter(Boolean)
        )];
        return {
            anahtar: `K${index + 1}`,
            materyalId: parca.materyalId,
            dosyaAdi: materyal?.orijinalDosyaAdi || materyal?.dosyaAdi || "Materyal",
            parcaIndex: parca.parcaIndex,
            konuId: konuIds[0] || "",
            konuIds,
            konuSkorlari: Object.fromEntries(konuSkorlari || []),
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
    const altKonular = kapsamTuru === "konu"
        ? secilenAnaKonununAltKonulari(hedef)
        : [];
    if (altKonular.length > soruSayisi) {
        throw new TestSistemiHatasi(
            `Seçilen ana konuda ${altKonular.length} alt konu var. Her alt konu için en az bir soru gerektiğinden en az ${altKonular.length} soruluk test seçin.`,
            { status: 422, kod: "ALT_KONU_SORU_SAYISI_YETERSIZ" }
        );
    }
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
    let planlananSoruSayisi = soruSayisi;
    let eksikSoruNedeni = "";

    if (kapsamTuru === "konu" && altKonular.length > 0) {
        // Ana konu seçildiğinde hem ana konunun hem her alt konunun kaynakları
        // toplanır; aynı fiziksel metin aşağıda bir kez gönderilir.
        const gruplar = [];
        for (const altKonu of altKonular) {
            const parcalar = await konuIcinParcalariSec({
                kullaniciId, dersId, konu: altKonu, materyaller, tumParcalar,
            }, deps);
            if (parcalar.reduce(
                (toplam, parca) => toplam + String(parca.icerik || "").length, 0
            ) < MINIMUM_SORU_BASI_KARAKTER) {
                throw uygunIcerikBulunamadiHatasi(
                    `"${altKonu.baslik}" alt konusu için güvenilir soru üretecek yeterli kaynak bulunamadı.`
                );
            }
            gruplar.push({ ...altKonu, parcalar });
        }
        // Ana konu metinleri yardımcı bağlamdır; soru etiketleri alt konulara aittir.
        const anaParcalar = await konuIcinParcalariSec({
            kullaniciId, dersId, konu: hedef.konu, materyaller, tumParcalar,
        }, deps);
        const anaButcesi = Math.min(8_000, Math.floor(deps.kaynakButcesi * 0.05));
        const anaSecilenler = dengeliOzetParcalariniSec(anaParcalar, anaButcesi);
        const anaKaynaklar = anaSecilenler.map((parca) => ({ parca, konu: null }));
        const kullanilanAnaButce = anaSecilenler.reduce(
            (toplam, parca) => toplam + String(parca.icerik || "").length, 0
        );
        const grupButcesi = Math.max(
            2_000, Math.floor((deps.kaynakButcesi - kullanilanAnaButce) / gruplar.length)
        );

        // 20 soruluk talepte 17 soruya yetecek kaynak varsa 20'yi zorlayıp
        // hepsini çöpe atma. Büyükten küçüğe, tüm alt konuları kapsayan
        // en yüksek güvenilir kota + gerçek kaynak parçası bütçesini seç.
        let uygunKotalar = [];
        let uygunKaynaklar = [];
        for (let adaySoruSayisi = soruSayisi;
            adaySoruSayisi >= altKonular.length; adaySoruSayisi -= 1) {
            const kotalar = altKonuKotalariniDagit(gruplar, adaySoruSayisi);
            if (kotalar.length !== altKonular.length) continue;
            const adayKaynaklar = [...anaKaynaklar];
            let tumAltKonularKapsandi = true;
            for (const grup of kotalar) {
                const secilenler = dengeliOzetParcalariniSec(grup.parcalar, grupButcesi);
                if (secilenler.reduce(
                    (toplam, parca) => toplam + String(parca.icerik || "").length, 0
                ) < grup.adet * MINIMUM_SORU_BASI_KARAKTER) {
                    tumAltKonularKapsandi = false;
                    break;
                }
                adayKaynaklar.push(...secilenler.map((parca) => ({ parca, konu: grup })));
            }
            if (!tumAltKonularKapsandi) continue;
            const benzersizKaynakKarakteri = fizikselParcalariTekillestir(
                adayKaynaklar.map(({ parca }) => parca)
            ).reduce((toplam, parca) => toplam + String(parca.icerik || "").length, 0);
            if (benzersizKaynakKarakteri < adaySoruSayisi * MINIMUM_SORU_BASI_KARAKTER) continue;
            uygunKotalar = kotalar;
            uygunKaynaklar = adayKaynaklar;
            planlananSoruSayisi = adaySoruSayisi;
            break;
        }
        if (uygunKotalar.length !== altKonular.length) {
            throw uygunIcerikBulunamadiHatasi(
                "En az bir soru için tüm alt konularda yeterli güvenilir kaynak bulunamadı."
            );
        }
        parcaKonulari = uygunKaynaklar;
        konuDagilimi = uygunKotalar.map((grup) => ({
            konuId: grup.konuId,
            baslik: grup.baslik,
            adet: grup.adet,
        }));
        if (planlananSoruSayisi < soruSayisi) eksikSoruNedeni = "KAYNAK_KAPASITESI";
    } else if (kapsamTuru === "tum_ders" && hedef.harita) {
        // Tüm ders kapsamındaki her konu için de yalnızca anlamsal arama kullan.
        const gruplar = [];
        for (const konu of dagitimKonulariniGetir(hedef.harita)) {
            const parcalar = await konuIcinParcalariSec({
                kullaniciId, dersId, konu, materyaller, tumParcalar,
            }, deps);
            gruplar.push({ ...konu, parcalar });
        }
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
                : null,
        }));
        if (kapsamTuru === "konu") {
            konuDagilimi = [{
                konuId: hedef.konu.konuId,
                baslik: hedef.konu.baslik,
                adet: soruSayisi,
            }];
        }
    }

    const fizikselParcaGruplari = new Map();
    for (const { parca, konu } of parcaKonulari) {
        const fizikselAnahtar = `${kimlikMetni(parca.materyalId)}:${parca.parcaIndex}`;
        if (!fizikselParcaGruplari.has(fizikselAnahtar)) {
            fizikselParcaGruplari.set(fizikselAnahtar, { parca, konular: [], konuSkorlari: new Map() });
        }
        const grup = fizikselParcaGruplari.get(fizikselAnahtar);
        // Aynı parça farklı konu bütçelerinde kırpılmışsa en kapsamlı
        // sürümü tut; bütün doğrulanmış konu bağlantılarını yine de birleştir.
        if (String(parca.icerik || "").length > String(grup.parca.icerik || "").length) {
            grup.parca = parca;
        }
        if (konu?.konuId) {
            grup.konular.push(konu);
            if (Number.isFinite(parca.semantikSkor)) {
                const eskiSkor = grup.konuSkorlari.get(konu.konuId) ?? -1;
                grup.konuSkorlari.set(konu.konuId, Math.max(eskiSkor, parca.semantikSkor));
            }
        }
    }
    const benzersizFizikselParcalar = [...fizikselParcaGruplari.values()];
    const toplamKarakter = benzersizFizikselParcalar.reduce(
        (toplam, { parca }) => toplam + String(parca.icerik || "").length,
        0
    );
    if (toplamKarakter < planlananSoruSayisi * MINIMUM_SORU_BASI_KARAKTER) {
        throw uygunIcerikBulunamadiHatasi();
    }

    return {
        materyaller,
        planlananSoruSayisi,
        eksikSoruNedeni,
        kaynaklar: kaynakKayitlariniOlustur(benzersizFizikselParcalar, materyaller),
        konuDagilimi,
        // Ana konu testinde yalnızca planlanan alt konuların ad ve açıklamalarını
        // gönder. Modelin konu kimliklerini rastgele ders başlıklarına bağlamasını önle.
        izinliKonuIds: tumKonular
            .filter((konu) => kapsamTuru !== "konu" ||
                konuDagilimi.some((dagilim) => dagilim.konuId === konu.konuId))
            .map(({ konuId, baslik, aciklama, konuTuru }) => ({
                konuId,
                baslik,
                aciklama,
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

const testOlusturTekIslem = async ({
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
    let uretimIzleyicisi = null;
    try {
        uretimIzleyicisi = deps.testUretimIzleyicisiOlustur({
            korelasyonId: tanilama.korelasyonId,
            kapsamTuru,
            soruSayisi,
            zorluk,
        });
        uretimIzleyicisi?.baslat?.();
    } catch {
        // Terminal izleme, test üretimini başlatmayı engellememelidir.
    }
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
                kaynakVerisi.kaynaklar.flatMap((kaynak) => kaynak.konuIds || [])
                    .filter(Boolean)
            ).size,
            toplamKaynakKarakterSayisi: kaynakVerisi.kaynaklar.reduce(
                (toplam, kaynak) => toplam + String(kaynak.icerik || "").length,
                0
            ),
        });
        const zorlukDagilimi = zorlukDagiliminiOlustur(zorluk, soruSayisi);
        asama = "GEMINI_URETIMI";
        // Soru gerçekten doğru alt konuya mı ait? Bütün ders haritasındaki
        // rakip konularla bağımsız embedding karşılaştırması kullanılır.
        const soruKonuDogrula = kapsamTuru === "konu" &&
            kaynakVerisi.konuDagilimi.length > 0
            ? deps.testKonuDogrulayicisiOlustur({
                konular: dersKonulariniDogrulamaIcinGetir(hedef.harita),
            })
            : null;
        // Ek kalite denetimi geçici sağlayıcı hatasında var olan
        // semantik/kanıt kontrolünü çalışır tutar; aynı test boyunca
        // başarısız denetim API çağrısı tekrar tekrar yapılmaz.
        let kaliteDenetimiKullanilabilir = true;
        const soruKalitesiDogrula = kapsamTuru === "konu"
            ? async ({ sorular, oncekiSorular, izinliKonuIds }) => {
                if (!kaliteDenetimiKullanilabilir) return sorular.map((_, index) => ({
                    soruIndeksi: index, gecerli: true, neden: "DENETIM_ATLANDI",
                }));
                try {
                    return await deps.geminiKaliteDenetle({
                        sorular, oncekiSorular, izinliKonuIds,
                    });
                } catch (hata) {
                    // Denetim ilave kontroldür; erişilemeyen ikinci API çağrısı
                    // nedeniyle zaten doğrulanmış testleri boşa çıkarma.
                    if (![429, 502, 503, 504].includes(Number(hata?.status)) &&
                        !["ETIMEDOUT", "ECONNRESET", "GEMINI_GECERSIZ_YANIT"].includes(hata?.kod)) {
                        throw hata;
                    }
                    kaliteDenetimiKullanilabilir = false;
                    console.warn("[TestKalitesi] Ek denetim atlandı", {
                        kod: String(hata?.kod || "SAGLAYICI_HATASI").slice(0, 80),
                    });
                    return sorular.map((_, index) => ({
                        soruIndeksi: index, gecerli: true, neden: "DENETIM_ATLANDI",
                    }));
                }
            }
            : null;
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
            soruKonuDogrula,
            soruKalitesiDogrula,
        }, {
            uretimIzleyicisi,
        });

        // Denetim JSON'u için her sorunun gerçekten kullandığı parçaların
        // o sorunun alt konusuyla olan semantik skorlarını sakla.
        const skorHaritasi = new Map(kaynakVerisi.kaynaklar.map((kaynak) => [
            `${kimlikMetni(kaynak.materyalId)}:${kaynak.parcaIndex}`, kaynak,
        ]));
        const denetimliSorular = geminiSonucu.sorular.map((soru) => ({
            ...soru,
            kaynaklar: (soru.kaynaklar || []).map((kaynak) => {
                const parcaSkorlari = (kaynak.parcaIndeksleri || [])
                    .map((parcaIndex) => {
                        const kayit = skorHaritasi.get(
                            `${kimlikMetni(kaynak.materyalId)}:${parcaIndex}`
                        );
                        const skor = kayit?.konuSkorlari?.[soru.konuId];
                        return Number.isFinite(skor) ? {
                            parcaIndex, skor: Number(skor.toFixed(4)),
                        } : null;
                    }).filter(Boolean);
                return parcaSkorlari.length > 0
                    ? { ...kaynak, parcaSkorlari }
                    : kaynak;
            }),
        }));
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
            sorular: denetimliSorular,
            kaynakSurumleri: kaynakVerisi.kaynakSurumleri,
            kullanilanModel: geminiSonucu.model ||
                process.env.GEMINI_TEST_MODELI ||
                VARSAYILAN_GEMINI_MODELI,
            durum: "hazirlandi",
        });
        try {
            uretimIzleyicisi?.tamamla?.({ sonuc: "basarili" });
        } catch {
            // Terminal izleme, başarılı test sonucunu değiştirmemelidir.
        }
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
        try {
            uretimIzleyicisi?.tamamla?.({
                sonuc: "basarisiz",
                hataKodu: typeof hata?.kod === "string"
                    ? hata.kod
                    : (dogrulamaHatasi ? "GECERSIZ_TEST_VERISI" : "TEST_SISTEMI_SUNUCU_HATASI"),
                altNeden: hata?.tanilama?.kaynakKanitiAltNedeni ||
                    hata?.tanilama?.dogrulamaAltKodu || null,
            });
        } catch {
            // Terminal izleme, asıl HTTP hata davranışını değiştirmemelidir.
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


// Yalnızca devam eden eş istekleri birleştirir; tamamlanmış testi önbelleklemez.
const devamEdenTestler = new Map();
export const testOlustur = async (girdi, bagimliliklar = {}) => {
    const anahtar = JSON.stringify([
        String(girdi.kullaniciId), String(girdi.dersId), girdi.kapsamTuru,
        String(girdi.materyalId || ""), String(girdi.konuId || ""),
        girdi.soruSayisi ?? 10, girdi.zorluk ?? "karisik",
    ]);
    if (devamEdenTestler.has(anahtar)) return devamEdenTestler.get(anahtar);
    const islem = testOlusturTekIslem(girdi, bagimliliklar);
    devamEdenTestler.set(anahtar, islem);
    try {
        return await islem;
    } finally {
        if (devamEdenTestler.get(anahtar) === islem) devamEdenTestler.delete(anahtar);
    }
};

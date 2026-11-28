import { randomUUID } from "node:crypto";
import { testSorulariniDogrula } from "./testDogrulamaService.js";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Test from "../models/Test.js";
import { dengeliOzetParcalariniSec } from "./dersOzetiService.js";
import {
    geminiIleTestSorulariUret,
    VARSAYILAN_GEMINI_MODELI,
} from "./geminiService.js";
import { testTanilamaKaydiYaz } from "./testTanilamaService.js";
import { testUretimIzleyicisiOlustur } from "./testUretimIzlemeService.js";

const VARSAYILAN_KAYNAK_BUTCESI = 160_000;
const TEST_LISTE_ALANLARI = [
    "_id",
    "dersId",
    "kapsamTuru",
    "kaynak",
    "materyalId",
    "konuId",
    "konuBasligi",
    "soruSayisi",
    "istenenSoruSayisi",
    "eksikSoruNedeni",
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
    geminiTestUret: bagimliliklar.geminiTestUret || geminiIleTestSorulariUret,
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
        kaynakMateryalIds: anaKaynaklar,
    };
    const altlar = (anaKonu.altKonular || []).map((altKonu) => ({
        konuId: altKonu.konuId,
        baslik: altKonu.baslik,
        aciklama: altKonu.aciklama || "",
        konuTuru: "alt",
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
            kaynakMateryalIds: (altKonu.kaynakMateryalIds || []).length > 0
                ? altKonu.kaynakMateryalIds
                : (anaKonu.kaynakMateryalIds || []),
        }))
        : [{
            konuId: anaKonu.konuId,
            baslik: anaKonu.baslik,
            aciklama: anaKonu.aciklama || "",
            konuTuru: "ana",
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

const konuIcinParcalariSec = ({
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

    // Yeni haritalarda Gemini'nin önceden kaydettiği konu eşleştirmesi
    // tek otoritedir. Eski haritalarda ilgili materyallerin aktif parçaları kullanılır.
    if (deps.aktifHaritaAtamalari?.parcaAtamaSurumu === 1) {
        const atamalar = deps.aktifHaritaAtamalari.parcaKonuAtamalari || [];
        const seciliAna = (deps.aktifHaritaAtamalari.anaKonular || []).find(
            (ana) => ana.konuId === konu.konuId
        );
        const ilgiliIds = new Set([
            konu.konuId,
            ...(seciliAna?.altKonular || []).map((alt) => alt.konuId),
        ]);
        const atamaAnahtarlari = new Set(atamalar.filter((atama) =>
            (atama.konuIds || []).some((id) => ilgiliIds.has(id))
        ).map((atama) =>
            `${kimlikMetni(atama.materyalId)}:${kimlikMetni(atama.islemeId)}:${atama.parcaIndex}`
        ));
        return tumParcalar.filter((parca) =>
            izinliMateryalKimlikleri.has(kimlikMetni(parca.materyalId)) &&
            atamaAnahtarlari.has(
                `${kimlikMetni(parca.materyalId)}:${kimlikMetni(parca.islemeId)}:${parca.parcaIndex}`
            )
        );
    }
    // Eski haritalarda da embedding çağırma: konuya bağlı materyallerin
    // aktif parçalarını Gemini'ye gönder; konu uygunluğunu model belirler.
    return tumParcalar.filter((parca) =>
        izinliMateryalKimlikleri.has(kimlikMetni(parca.materyalId))
    );
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
        .select("anaKonular parcaAtamaSurumu parcaKonuAtamalari")
        .lean()
);

const hedefiDogrula = async ({
    kullaniciId,
    dersId,
    kapsamTuru,
    materyalId,
    konuId,
    kaynak,
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
        if (!konu || (kaynak === "adaptif" && konu.konuTuru !== "alt")) {
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
    return parcaGruplari.map(({ parca, konular }, index) => {
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
    deps.aktifHaritaAtamalari = hedef.harita || null;
    const yeniAtamalar = hedef.harita?.parcaAtamaSurumu === 1 &&
        Array.isArray(hedef.harita.parcaKonuAtamalari);
    const konular = kapsamTuru === "konu"
        ? (altKonular.length ? altKonular : [hedef.konu])
        : (kapsamTuru === "tum_ders" && hedef.harita
            ? dagitimKonulariniGetir(hedef.harita) : []);

    // Her konuya bir soru isteniyorsa, soru sayısı konu sayısından az olamaz.
    if (konular.length > soruSayisi) {
        throw new TestSistemiHatasi(
            `Bu kapsamda ${konular.length} konu var. Her konuya en az bir soru için daha yüksek soru sayısı seçin.`,
            { status: 422, kod: "ALT_KONU_SORU_SAYISI_YETERSIZ" }
        );
    }
    // Eşit bölünebildiğinde eşit dağıtım iste, diğer durumlarda Gemini
    // kalan soruları içeriğe göre dağıtsın. Bu kural kayıt öncesinde de doğrulanır.
    const esitAdet = konular.length && soruSayisi % konular.length === 0
        ? soruSayisi / konular.length : null;
    const konuDagilimi = konular.map((konu) => ({
        konuId: konu.konuId,
        baslik: konu.baslik,
        adet: esitAdet ?? 1,
    }));

    let parcaKonulari = [];
    if (yeniAtamalar && konular.length) {
        // Yalnızca haritada konuya bağlanmış metin parçaları gönderilir.
        const grupButcesi = Math.max(2_000, Math.floor(deps.kaynakButcesi / konular.length));
        for (const konu of konular) {
            const parcalar = konuIcinParcalariSec({
                konu, materyaller, tumParcalar,
            }, deps);
            parcaKonulari.push(...dengeliOzetParcalariniSec(parcalar, grupButcesi)
                .map((parca) => ({ parca, konu })));
        }
    } else {
        // Eski haritalarda parça-konu eşleştirmesi kayıtlı değil.
        // Embedding çağırmak veya tüm parçaları yanlış konuya etiketlemek
        // yerine kapsamın hazır materyal parçalarını doğrudan Gemini'ye ver.
        const ilgiliParcalar = kapsamTuru === "konu"
            ? konuIcinParcalariSec({
                konu: hedef.konu, materyaller, tumParcalar,
            }, deps)
            : tumParcalar;
        parcaKonulari = dengeliOzetParcalariniSec(ilgiliParcalar, deps.kaynakButcesi)
            .map((parca) => ({ parca, konu: null }));
    }
    const fizikselParcaGruplari = new Map();
    for (const { parca, konu } of parcaKonulari) {
        const anahtar = `${kimlikMetni(parca.materyalId)}:${kimlikMetni(parca.islemeId)}:${parca.parcaIndex}`;
        if (!fizikselParcaGruplari.has(anahtar)) {
            fizikselParcaGruplari.set(anahtar, { parca, konular: [] });
        }
        const kayit = fizikselParcaGruplari.get(anahtar);
        if (String(parca.icerik || "").length > String(kayit.parca.icerik || "").length) {
            kayit.parca = parca;
        }
        if (konu?.konuId && !kayit.konular.some((item) => item.konuId === konu.konuId)) {
            kayit.konular.push(konu);
        }
    }
    const benzersizParcalar = [...fizikselParcaGruplari.values()];
    if (!benzersizParcalar.length ||
        !benzersizParcalar.some(({ parca }) => String(parca.icerik || "").trim())) {
        throw uygunIcerikBulunamadiHatasi(
            "Seçilen kapsamda işlenmiş kaynak metni bulunamadı."
        );
    }
    return {
        materyaller,
        konuEslesmeleriZorunlu: yeniAtamalar,
        kaynaklar: kaynakKayitlariniOlustur(benzersizParcalar, materyaller),
        konuDagilimi,
        izinliKonuIds: (konular.length ? konular : tumKonular)
            .map(({ konuId, baslik, aciklama, konuTuru }) => ({
                konuId, baslik, aciklama, konuTuru,
            })),
        kaynakSurumleri: materyaller.map((materyal) => ({
            materyalId: materyal._id, aktifIslemeId: materyal.aktifIslemeId,
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
    kaynak,
}, bagimliliklar = {}) => {
    const sonZaman = Date.now() + 112_000;
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
            kaynak,
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
        // Tek üretim; kalite kuralları prompt içinde, ek onarım isteği yok.
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
            konuEslesmeleriZorunlu: kaynakVerisi.konuEslesmeleriZorunlu,
        }, {
            uretimIzleyicisi, sonZaman,
        });

        tanilama.apiCagriSayisi = Number.isInteger(geminiSonucu?.apiCagriSayisi)
            ? geminiSonucu.apiCagriSayisi : null;
        asama = "TEST_DOGRULAMA";
        const denetimliSorular = testSorulariniDogrula(geminiSonucu, {
            soruSayisi, zorlukDagilimi,
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
            ...(kaynak === "adaptif" ? { kaynak } : {}),
            materyalId: kapsamTuru === "materyal" ? materyalId : null,
            konuId: kapsamTuru === "konu" ? konuId : "",
            konuBasligi: hedef.konu?.baslik || "",
            soruSayisi,
            istenenSoruSayisi: soruSayisi,
            eksikSoruNedeni: "",
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
                altNeden: hata?.tanilama?.dogrulamaAltKodu || null,
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
        girdi.kaynak === "adaptif",
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

import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import DersOzeti from "../models/DersOzeti.js";
import { semanticAramaYap } from "./semanticAramaService.js";
import {
    geminiIleDersOzetiUret,
    VARSAYILAN_GEMINI_MODELI,
} from "./geminiService.js";

const OZET_KILIDI_MS = 3 * 60 * 1000;
const VARSAYILAN_KAYNAK_BUTCESI = 180_000;
const VARSAYILAN_BATCH_BUTCESI = 35_000;

export class DersOzetiHatasi extends Error {
    constructor(mesaj, { status = 500, kod = "DERS_OZETI_HATASI" } = {}) {
        super(mesaj);
        this.name = "DersOzetiHatasi";
        this.status = status;
        this.kod = kod;
    }
}

const sinirliTamSayi = (deger, varsayilan, enAz, enFazla) => {
    const sayi = Number.parseInt(deger, 10);
    return Number.isInteger(sayi)
        ? Math.min(enFazla, Math.max(enAz, sayi))
        : varsayilan;
};

const kaynakButcesiGetir = () => sinirliTamSayi(
    process.env.DERS_OZETI_MAKS_KAYNAK_KARAKTERI,
    VARSAYILAN_KAYNAK_BUTCESI,
    40_000,
    400_000
);

const batchButcesiGetir = () => sinirliTamSayi(
    process.env.DERS_OZETI_BATCH_KARAKTERI,
    VARSAYILAN_BATCH_BUTCESI,
    15_000,
    60_000
);

const kimlikMetni = (deger) => String(deger ?? "");

const belgeyiNesneyeCevir = (belge) => (
    belge?.toObject ? belge.toObject() : belge
);

const bagimliliklariGetir = (bagimliliklar = {}) => ({
    DersModel: bagimliliklar.DersModel || Ders,
    MateryalModel: bagimliliklar.MateryalModel || Materyal,
    MetinParcasiModel: bagimliliklar.MetinParcasiModel || MetinParcasi,
    KonuHaritasiModel: bagimliliklar.KonuHaritasiModel || KonuHaritasi,
    DersOzetiModel: bagimliliklar.DersOzetiModel || DersOzeti,
    semanticArama: bagimliliklar.semanticArama || semanticAramaYap,
    geminiOzetUret: bagimliliklar.geminiOzetUret || geminiIleDersOzetiUret,
    simdi: bagimliliklar.simdi || (() => new Date()),
    kaynakButcesi: bagimliliklar.kaynakButcesi || kaynakButcesiGetir(),
    batchButcesi: bagimliliklar.batchButcesi || batchButcesiGetir(),
});

const ozetAnahtari = ({ kullaniciId, dersId, tur, materyalId, konuId, uzunluk }) => ({
    kullaniciId,
    dersId,
    tur,
    hedefAnahtari: tur === "tum_ders"
        ? "ders"
        : (tur === "materyal" ? kimlikMetni(materyalId) : String(konuId)),
    uzunluk,
});

const dersBulunamadiHatasi = () => new DersOzetiHatasi(
    "Ders bulunamadı veya bu ders için yetkiniz yok.",
    { status: 404, kod: "DERS_BULUNAMADI" }
);

const uygunIcerikBulunamadiHatasi = (mesaj = "Özetlenebilecek işlenmiş içerik bulunamadı.") => (
    new DersOzetiHatasi(mesaj, {
        status: 422,
        kod: "UYGUN_ICERIK_BULUNAMADI",
    })
);

const dersiGetir = async ({ kullaniciId, dersId }, DersModel) => {
    const ders = await DersModel.findOne({
        _id: dersId,
        kullaniciId,
        temizleniyor: { $ne: true },
    })
        .select("_id dersAdi aciklama")
        .lean();

    if (!ders) throw dersBulunamadiHatasi();
    return ders;
};

const konuBilgisiniBul = (harita, konuId) => {
    for (const anaKonu of harita?.anaKonular || []) {
        if (anaKonu.konuId === konuId) {
            const kaynakMateryalIds = [
                ...(anaKonu.kaynakMateryalIds || []),
                ...(anaKonu.altKonular || []).flatMap(
                    (altKonu) => altKonu.kaynakMateryalIds || []
                ),
            ];
            return {
                konuId,
                baslik: anaKonu.baslik,
                sorgu: [
                    anaKonu.baslik,
                    anaKonu.aciklama,
                    ...(anaKonu.altKonular || []).flatMap(
                        (altKonu) => [altKonu.baslik, altKonu.aciklama]
                    ),
                ].filter(Boolean).join(" "),
                kaynakMateryalIds: [...new Map(
                    kaynakMateryalIds.map((id) => [kimlikMetni(id), id])
                ).values()],
            };
        }

        const altKonu = (anaKonu.altKonular || []).find(
            (aday) => aday.konuId === konuId
        );
        if (altKonu) {
            const altKaynaklar = altKonu.kaynakMateryalIds || [];
            return {
                konuId,
                baslik: altKonu.baslik,
                sorgu: [
                    anaKonu.baslik,
                    anaKonu.aciklama,
                    altKonu.baslik,
                    altKonu.aciklama,
                ].filter(Boolean).join(" "),
                kaynakMateryalIds: altKaynaklar.length > 0
                    ? altKaynaklar
                    : (anaKonu.kaynakMateryalIds || []),
            };
        }
    }
    return null;
};

const hedefiDogrula = async ({
    kullaniciId,
    dersId,
    tur,
    materyalId,
    konuId,
}, deps) => {
    if (tur === "materyal") {
        const materyal = await deps.MateryalModel.findOne({
            _id: materyalId,
            dersId,
            kullaniciId,
        })
            .select("_id durum aktifIslemeId dosyaAdi orijinalDosyaAdi")
            .lean();
        if (!materyal) {
            throw new DersOzetiHatasi(
                "Materyal bulunamadı, seçilen derse ait değil veya bu materyal için yetkiniz yok.",
                { status: 404, kod: "MATERYAL_BULUNAMADI" }
            );
        }
        if (materyal.durum !== "hazir" || !materyal.aktifIslemeId) {
            throw uygunIcerikBulunamadiHatasi(
                "Seçilen materyal henüz işlenmemiş veya özetlenmeye hazır değil."
            );
        }
        return { materyal, konu: null };
    }

    if (tur === "konu") {
        const harita = await deps.KonuHaritasiModel.findOne({
            dersId,
            kullaniciId,
            durum: "hazir",
        })
            .select("anaKonular")
            .lean();
        if (!harita) {
            throw new DersOzetiHatasi(
                "Konu özeti için hazır bir konu haritası bulunamadı.",
                { status: 422, kod: "KONU_HARITASI_HAZIR_DEGIL" }
            );
        }
        const konu = konuBilgisiniBul(harita, konuId);
        if (!konu) {
            throw new DersOzetiHatasi(
                "Seçilen konu bu dersin güncel konu haritasında bulunamadı.",
                { status: 404, kod: "KONU_BULUNAMADI" }
            );
        }
        return { materyal: null, konu };
    }

    return { materyal: null, konu: null };
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

const esitAralikliIndeksler = (uzunluk, adet) => {
    if (adet >= uzunluk) return Array.from({ length: uzunluk }, (_, index) => index);
    return Array.from(
        { length: adet },
        (_, index) => Math.min(uzunluk - 1, Math.floor(((index + 0.5) * uzunluk) / adet))
    );
};

/**
 * Kaynak bütçesi aşılırsa her materyale eşit karakter kotası verir ve belgenin
 * başı/ortası/sonu boyunca eşit aralıklı parçalar seçer.
 */
export const dengeliOzetParcalariniSec = (parcalar, maksimumKarakter) => {
    const gecerliParcalar = (parcalar || []).filter(
        (parca) => typeof parca?.icerik === "string" && parca.icerik.trim()
    );
    const toplam = gecerliParcalar.reduce(
        (sonuc, parca) => sonuc + parca.icerik.length,
        0
    );
    if (toplam <= maksimumKarakter) return gecerliParcalar;

    const grupHaritasi = new Map();
    for (const parca of gecerliParcalar) {
        const anahtar = kimlikMetni(parca.materyalId);
        if (!grupHaritasi.has(anahtar)) grupHaritasi.set(anahtar, []);
        grupHaritasi.get(anahtar).push(parca);
    }
    const gruplar = [...grupHaritasi.entries()]
        .sort(([sol], [sag]) => sol.localeCompare(sag))
        .map(([, grup]) => grup.sort(
            (sol, sag) => sol.parcaIndex - sag.parcaIndex
        ));
    const materyalKotasi = Math.max(1, Math.floor(maksimumKarakter / gruplar.length));
    const secilenler = [];

    for (const grup of gruplar) {
        const grupToplami = grup.reduce((sonuc, parca) => sonuc + parca.icerik.length, 0);
        if (grupToplami <= materyalKotasi) {
            secilenler.push(...grup);
            continue;
        }

        const ortalama = Math.max(1, Math.ceil(grupToplami / grup.length));
        let adet = Math.max(1, Math.min(grup.length, Math.floor(materyalKotasi / ortalama)));
        let adaylar = [];
        do {
            adaylar = esitAralikliIndeksler(grup.length, adet).map((index) => grup[index]);
            if (adaylar.reduce((sonuc, parca) => sonuc + parca.icerik.length, 0) <= materyalKotasi) {
                break;
            }
            adet -= 1;
        } while (adet > 0);

        if (adet === 0) {
            const ortaParca = grup[Math.floor(grup.length / 2)];
            secilenler.push({
                ...ortaParca,
                icerik: ortaParca.icerik.slice(0, materyalKotasi),
            });
        } else {
            secilenler.push(...adaylar);
        }
    }

    return secilenler.sort((sol, sag) => (
        kimlikMetni(sol.materyalId).localeCompare(kimlikMetni(sag.materyalId)) ||
        sol.parcaIndex - sag.parcaIndex
    ));
};

const turkceNormalizeEt = (metin) => String(metin || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9çğıöşü\s]/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

const konuIcinYerelParcalariSec = (parcalar, konu, sinir = 18) => {
    const kelimeler = [...new Set(
        turkceNormalizeEt(konu.sorgu).split(" ").filter((kelime) => kelime.length >= 4)
    )];
    return parcalar
        .map((parca) => {
            const icerik = turkceNormalizeEt(parca.icerik);
            const skor = kelimeler.reduce(
                (toplam, kelime) => toplam + (icerik.includes(kelime) ? 1 : 0),
                0
            );
            return { parca, skor };
        })
        .filter(({ skor }) => skor > 0)
        .sort((sol, sag) => (
            sag.skor - sol.skor ||
            kimlikMetni(sol.parca.materyalId).localeCompare(kimlikMetni(sag.parca.materyalId)) ||
            sol.parca.parcaIndex - sag.parca.parcaIndex
        ))
        .slice(0, sinir)
        .map(({ parca }) => parca)
        .sort((sol, sag) => (
            kimlikMetni(sol.materyalId).localeCompare(kimlikMetni(sag.materyalId)) ||
            sol.parcaIndex - sag.parcaIndex
        ));
};

const konuParcalariniSec = async ({
    kullaniciId,
    dersId,
    konu,
    materyaller,
    tumParcalar,
}, deps) => {
    let anlamsalSonuclar = [];
    try {
        const sonuc = await deps.semanticArama({
            kullaniciId,
            dersId,
            sorgu: konu.sorgu.slice(0, 500),
            limit: 10,
            materyalIds: materyaller.map((materyal) => materyal._id),
        });
        anlamsalSonuclar = sonuc?.sonuclar || [];
    } catch {
        // Embedding geçici olarak kullanılamazsa konu haritası ve metin üzerinden
        // deterministik yerel seçim özet üretimini çalışır tutar.
    }

    if (anlamsalSonuclar.length > 0) {
        const eslesmeler = new Set(anlamsalSonuclar.map(
            (sonuc) => `${sonuc.materyalId}:${sonuc.parcaIndex}`
        ));
        const secilenler = tumParcalar.filter((parca) => {
            for (const fark of [-1, 0, 1]) {
                if (eslesmeler.has(`${kimlikMetni(parca.materyalId)}:${parca.parcaIndex + fark}`)) {
                    return true;
                }
            }
            return false;
        });
        if (secilenler.length > 0) return secilenler;
    }

    const yerelSonuclar = konuIcinYerelParcalariSec(tumParcalar, konu);
    if (yerelSonuclar.length > 0) return yerelSonuclar;

    if (konu.kaynakMateryalIds.length > 0) {
        return dengeliOzetParcalariniSec(tumParcalar, deps.kaynakButcesi);
    }
    throw uygunIcerikBulunamadiHatasi(
        "Seçilen konuyla ilişkili işlenmiş materyal içeriği bulunamadı."
    );
};

const kaynaklariOlustur = (materyaller, parcalar) => {
    const parcaHaritasi = new Map();
    for (const parca of parcalar) {
        const anahtar = kimlikMetni(parca.materyalId);
        if (!parcaHaritasi.has(anahtar)) parcaHaritasi.set(anahtar, new Set());
        parcaHaritasi.get(anahtar).add(parca.parcaIndex);
    }

    return materyaller
        .filter((materyal) => parcaHaritasi.has(kimlikMetni(materyal._id)))
        .map((materyal) => ({
            materyalId: materyal._id,
            dosyaAdi: materyal.orijinalDosyaAdi || materyal.dosyaAdi,
            aktifIslemeId: materyal.aktifIslemeId,
            parcaIndeksleri: [...parcaHaritasi.get(kimlikMetni(materyal._id))].sort(
                (sol, sag) => sol - sag
            ),
        }));
};

const kaynakSurumleriniOlustur = (materyaller) => materyaller.map((materyal) => ({
    materyalId: materyal._id,
    aktifIslemeId: materyal.aktifIslemeId,
}));

const parcalariBatchlereBol = (parcalar, materyalHaritasi, batchButcesi) => {
    const bloklar = parcalar.flatMap((parca) => {
        const materyal = materyalHaritasi.get(kimlikMetni(parca.materyalId));
        const baslik = materyal?.orijinalDosyaAdi || materyal?.dosyaAdi || "Materyal";
        const onEk = `[MATERYAL: ${baslik}] [PARÇA: ${parca.parcaIndex}]\n`;
        const kullanilabilir = Math.max(1_000, batchButcesi - onEk.length);
        const icerik = parca.icerik.trim();
        const parcalar = [];
        for (let baslangic = 0; baslangic < icerik.length; baslangic += kullanilabilir) {
            parcalar.push(`${onEk}${icerik.slice(baslangic, baslangic + kullanilabilir)}`);
        }
        return parcalar;
    });

    const batchler = [];
    let mevcut = [];
    let karakter = 0;
    for (const blok of bloklar) {
        if (mevcut.length > 0 && karakter + blok.length > batchButcesi) {
            batchler.push(mevcut.join("\n\n"));
            mevcut = [];
            karakter = 0;
        }
        mevcut.push(blok);
        karakter += blok.length;
    }
    if (mevcut.length > 0) batchler.push(mevcut.join("\n\n"));
    return batchler;
};

const kilidiYenile = async (ozetId, islemToken, deps) => {
    const sonuc = await deps.DersOzetiModel.updateOne(
        { _id: ozetId, aktifIslemToken: islemToken },
        { $currentDate: { kilitSonYenilemeTarihi: true } },
        { timestamps: false }
    );
    const eslesen = sonuc?.matchedCount ?? sonuc?.n ?? 0;
    if (eslesen !== 1) {
        throw new DersOzetiHatasi(
            "Özet oluşturma işleminin sahipliği kaybedildi. Lütfen yeniden deneyin.",
            { status: 409, kod: "OZET_ISLEM_SAHIPLIGI_KAYBEDILDI" }
        );
    }
};

const kaynakSurumleriniDogrula = async ({
    kullaniciId,
    dersId,
    kaynaklar,
    materyalIds = kaynaklar.map((kaynak) => kaynak.materyalId),
}, deps) => {
    const guncelMateryaller = await hazirMateryalleriGetir({
        kullaniciId,
        dersId,
        materyalIds,
    }, deps.MateryalModel);
    const guncelHarita = new Map(
        guncelMateryaller.map((materyal) => [kimlikMetni(materyal._id), materyal])
    );
    const guncel = kaynaklar.every((kaynak) => (
        kimlikMetni(guncelHarita.get(kimlikMetni(kaynak.materyalId))?.aktifIslemeId) ===
        kimlikMetni(kaynak.aktifIslemeId)
    ));
    if (!guncel || guncelMateryaller.length !== kaynaklar.length) {
        throw new DersOzetiHatasi(
            "Özet hazırlanırken materyal içeriği değişti. Eski sonuç kaydedilmedi; lütfen yeniden deneyin.",
            { status: 409, kod: "KAYNAK_SURUMU_DEGISTI" }
        );
    }
};

const kaynakSurumleriEslesiyor = (kaynakSurumleri, materyaller) => {
    if (!Array.isArray(kaynakSurumleri) || kaynakSurumleri.length === 0) return false;
    if (kaynakSurumleri.length !== materyaller.length) return false;

    const guncelHarita = new Map(
        materyaller.map((materyal) => [kimlikMetni(materyal._id), materyal])
    );
    return kaynakSurumleri.every((kaynak) => (
        kimlikMetni(guncelHarita.get(kimlikMetni(kaynak.materyalId))?.aktifIslemeId) ===
        kimlikMetni(kaynak.aktifIslemeId)
    ));
};

const ozetKapsamiMateryalIds = (tur, hedef) => (
    tur === "materyal"
        ? [hedef.materyal._id]
        : (tur === "konu" && hedef.konu.kaynakMateryalIds.length > 0
            ? hedef.konu.kaynakMateryalIds
            : null)
);

const kayitliOzetGuncelMi = async ({
    kullaniciId,
    dersId,
    tur,
    hedef,
    ozet,
}, deps) => {
    const kaydedilmisSurumler = ozet.kaynakSurumleri?.length > 0
        ? ozet.kaynakSurumleri
        : ozet.kullanilanKaynaklar;
    if (!Array.isArray(kaydedilmisSurumler) || kaydedilmisSurumler.length === 0) {
        return false;
    }

    // Yeni kayıtlarda tüm özet kapsamını karşılaştır. Eski kayıtlarda bu alan
    // bulunmadığı için yalnızca gerçekten kullanılan kaynak sürümlerini doğrula.
    let materyalIds;
    if (ozet.kaynakSurumleri?.length > 0) {
        materyalIds = ozetKapsamiMateryalIds(tur, hedef);
    } else {
        materyalIds = kaydedilmisSurumler.map((kaynak) => kaynak.materyalId);
    }

    const guncelMateryaller = await hazirMateryalleriGetir({
        kullaniciId,
        dersId,
        materyalIds,
    }, deps.MateryalModel);
    return kaynakSurumleriEslesiyor(kaydedilmisSurumler, guncelMateryaller);
};

const kaynaklariHazirla = async ({
    kullaniciId,
    dersId,
    tur,
    hedef,
}, deps) => {
    const sinirliMateryalIds = ozetKapsamiMateryalIds(tur, hedef);
    const materyaller = await hazirMateryalleriGetir({
        kullaniciId,
        dersId,
        materyalIds: sinirliMateryalIds,
    }, deps.MateryalModel);
    if (materyaller.length === 0) {
        throw uygunIcerikBulunamadiHatasi(
            tur === "materyal"
                ? "Seçilen materyalde özetlenebilecek işlenmiş içerik bulunamadı."
                : "Bu ders için özetlenebilecek işlenmiş materyal bulunamadı."
        );
    }

    const tumParcalar = await aktifParcalariGetir({
        kullaniciId,
        dersId,
        materyaller,
    }, deps.MetinParcasiModel);
    if (tumParcalar.length === 0) throw uygunIcerikBulunamadiHatasi();

    const ilgiliParcalar = tur === "konu"
        ? await konuParcalariniSec({
            kullaniciId,
            dersId,
            konu: hedef.konu,
            materyaller,
            tumParcalar,
        }, deps)
        : tumParcalar;
    const secilenParcalar = dengeliOzetParcalariniSec(
        ilgiliParcalar,
        deps.kaynakButcesi
    );
    if (secilenParcalar.length === 0) throw uygunIcerikBulunamadiHatasi();

    return {
        materyaller,
        parcalar: secilenParcalar,
        kaynaklar: kaynaklariOlustur(materyaller, secilenParcalar),
        kaynakSurumleri: kaynakSurumleriniOlustur(materyaller),
    };
};

const geminiOzetiniUret = async ({
    ders,
    tur,
    hedefBasligi,
    uzunluk,
    materyaller,
    parcalar,
    heartbeat,
}, deps) => {
    const materyalHaritasi = new Map(
        materyaller.map((materyal) => [kimlikMetni(materyal._id), materyal])
    );
    const batchler = parcalariBatchlereBol(
        parcalar,
        materyalHaritasi,
        deps.batchButcesi
    );
    const ortakGirdi = {
        dersBilgisi: { dersAdi: ders.dersAdi, aciklama: ders.aciklama },
        tur,
        hedefBasligi,
        uzunluk,
    };

    if (batchler.length === 1) {
        await heartbeat();
        return deps.geminiOzetUret({
            ...ortakGirdi,
            kaynakMetni: batchler[0],
        });
    }

    const araOzetler = [];
    for (const [index, batch] of batchler.entries()) {
        await heartbeat();
        const araSonuc = await deps.geminiOzetUret({
            ...ortakGirdi,
            kaynakMetni: batch,
            araOzet: true,
        });
        araOzetler.push(`ARA ÖZET ${index + 1}:\n${JSON.stringify(araSonuc.icerik)}`);
    }

    await heartbeat();
    return deps.geminiOzetUret({
        ...ortakGirdi,
        kaynakMetni: araOzetler.join("\n\n"),
    });
};

export const kayitliDersOzetiniGetir = async ({
    kullaniciId,
    dersId,
    tur,
    materyalId = null,
    konuId = "",
    uzunluk,
}, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    await dersiGetir({ kullaniciId, dersId }, deps.DersModel);
    const hedef = await hedefiDogrula({
        kullaniciId,
        dersId,
        tur,
        materyalId,
        konuId,
    }, deps);

    const ozet = await deps.DersOzetiModel.findOne({
        ...ozetAnahtari({ kullaniciId, dersId, tur, materyalId, konuId, uzunluk }),
        basarili: true,
    }).lean();
    if (!ozet) {
        throw new DersOzetiHatasi(
            "Bu seçim için kaydedilmiş başarılı bir özet bulunamadı.",
            { status: 404, kod: "OZET_BULUNAMADI" }
        );
    }
    const guncel = await kayitliOzetGuncelMi({
        kullaniciId,
        dersId,
        tur,
        hedef,
        ozet,
    }, deps);
    if (!guncel) {
        throw new DersOzetiHatasi(
            "Kaynaklar değiştiği için kaydedilmiş özet artık güncel değil.",
            { status: 404, kod: "OZET_BULUNAMADI" }
        );
    }
    return ozet;
};

export const dersOzetiOlustur = async ({
    kullaniciId,
    dersId,
    tur,
    materyalId = null,
    konuId = "",
    uzunluk,
    yenidenOlustur = false,
}, bagimliliklar = {}) => {
    const deps = bagimliliklariGetir(bagimliliklar);
    const ders = await dersiGetir({ kullaniciId, dersId }, deps.DersModel);
    const hedef = await hedefiDogrula({
        kullaniciId,
        dersId,
        tur,
        materyalId,
        konuId,
    }, deps);
    const anahtar = ozetAnahtari({
        kullaniciId,
        dersId,
        tur,
        materyalId,
        konuId,
        uzunluk,
    });

    const mevcut = await deps.DersOzetiModel.findOne(anahtar).lean();
    if (
        !yenidenOlustur &&
        mevcut?.basarili &&
        await kayitliOzetGuncelMi({
            kullaniciId,
            dersId,
            tur,
            hedef,
            ozet: mevcut,
        }, deps)
    ) {
        return { ozet: mevcut, onbellekten: true };
    }

    try {
        await deps.DersOzetiModel.updateOne(
            anahtar,
            {
                $setOnInsert: {
                    ...anahtar,
                    materyalId: tur === "materyal" ? materyalId : null,
                    konuId: tur === "konu" ? konuId : "",
                    konuBasligi: hedef.konu?.baslik || "",
                    basarili: false,
                },
            },
            { upsert: true, runValidators: true }
        );
    } catch (hata) {
        if (hata?.code !== 11000) throw hata;
    }

    const islemToken = new mongoose.Types.ObjectId();
    const eskiKilitEsigi = new Date(deps.simdi().getTime() - OZET_KILIDI_MS);
    const kilitliOzet = await deps.DersOzetiModel.findOneAndUpdate(
        {
            ...anahtar,
            $or: [
                { aktifIslemToken: null },
                { aktifIslemToken: { $exists: false } },
                { kilitSonYenilemeTarihi: { $lt: eskiKilitEsigi } },
            ],
        },
        {
            $set: {
                aktifIslemToken: islemToken,
                kilitSonYenilemeTarihi: deps.simdi(),
                materyalId: tur === "materyal" ? materyalId : null,
                konuId: tur === "konu" ? konuId : "",
                konuBasligi: hedef.konu?.baslik || "",
            },
        },
        { new: true }
    );

    if (!kilitliOzet) {
        const yarisSonucu = await deps.DersOzetiModel.findOne({
            ...anahtar,
            basarili: true,
        }).lean();
        if (
            !yenidenOlustur &&
            yarisSonucu &&
            await kayitliOzetGuncelMi({
                kullaniciId,
                dersId,
                tur,
                hedef,
                ozet: yarisSonucu,
            }, deps)
        ) {
            return { ozet: yarisSonucu, onbellekten: true };
        }
        throw new DersOzetiHatasi(
            "Bu özet için oluşturma işlemi zaten devam ediyor.",
            { status: 409, kod: "OZET_OLUSTURULUYOR" }
        );
    }

    const heartbeat = () => kilidiYenile(kilitliOzet._id, islemToken, deps);
    try {
        const kaynakVerisi = await kaynaklariHazirla({
            kullaniciId,
            dersId,
            tur,
            hedef,
        }, deps);
        const geminiSonucu = await geminiOzetiniUret({
            ders,
            tur,
            hedefBasligi: hedef.materyal
                ? (hedef.materyal.orijinalDosyaAdi || hedef.materyal.dosyaAdi)
                : (hedef.konu?.baslik || ders.dersAdi),
            uzunluk,
            materyaller: kaynakVerisi.materyaller,
            parcalar: kaynakVerisi.parcalar,
            heartbeat,
        }, deps);

        await heartbeat();
        const guncelHedef = tur === "konu"
            ? await hedefiDogrula({
                kullaniciId,
                dersId,
                tur,
                materyalId,
                konuId,
            }, deps)
            : hedef;
        await kaynakSurumleriniDogrula({
            kullaniciId,
            dersId,
            kaynaklar: kaynakVerisi.kaynakSurumleri,
            materyalIds: ozetKapsamiMateryalIds(tur, guncelHedef),
        }, deps);

        const kaydedilen = await deps.DersOzetiModel.findOneAndUpdate(
            { _id: kilitliOzet._id, aktifIslemToken: islemToken },
            {
                $set: {
                    basarili: true,
                    icerik: geminiSonucu.icerik,
                    kullanilanKaynaklar: kaynakVerisi.kaynaklar,
                    kaynakSurumleri: kaynakVerisi.kaynakSurumleri,
                    kullanilanModel: geminiSonucu.model ||
                        process.env.GEMINI_OZET_MODELI ||
                        VARSAYILAN_GEMINI_MODELI,
                    olusturulmaTarihi: deps.simdi(),
                    aktifIslemToken: null,
                    kilitSonYenilemeTarihi: null,
                },
            },
            { new: true, runValidators: true }
        );
        if (!kaydedilen) {
            throw new DersOzetiHatasi(
                "Özet tamamlandı ancak işlem sahipliği değiştiği için kaydedilemedi.",
                { status: 409, kod: "OZET_ISLEM_SAHIPLIGI_KAYBEDILDI" }
            );
        }
        return { ozet: belgeyiNesneyeCevir(kaydedilen), onbellekten: false };
    } catch (hata) {
        await deps.DersOzetiModel.updateOne(
            { _id: kilitliOzet._id, aktifIslemToken: islemToken },
            {
                $set: {
                    aktifIslemToken: null,
                    kilitSonYenilemeTarihi: null,
                },
            }
        ).catch(() => {});
        throw hata;
    }
};

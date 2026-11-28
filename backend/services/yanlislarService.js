import Ders from "../models/Ders.js";
import Test from "../models/Test.js";

export const YANLIS_DURUMLARI = ["yanlis", "bos", "duzeltildi"];
export const TEKRAR_SORU_SINIRI = 20;

const soruDurumu = (soru) => {
    if (soru.ogrenciCevabi == null) return "bos";
    return soru.ogrenciCevabi === soru.dogruCevap ? "duzeltildi" : "yanlis";
};

const soruGecmisiniGetir = async (kullaniciId, dersler, soruIds) => {
    if (!dersler.length) return [];
    const dersAdlari = new Map(dersler.map(ders => [String(ders._id), ders.dersAdi]));
    const filtre = { kullaniciId, dersId: { $in: dersler.map(ders => ders._id) }, durum: "tamamlandi" };
    if (soruIds) filtre.$or = [{ "sorular._id": { $in: soruIds } }, { "sorular.tekrarSoruId": { $in: soruIds } }];

    const testler = await Test.find(filtre)
        .select("dersId kaynak kaynakSurumleri tamamlanmaTarihi sorular")
        .sort({ tamamlanmaTarihi: -1, _id: -1 }).lean();
    const arananSorular = soruIds && new Set(soruIds);
    const sonTekrarlar = new Map();
    const kayitlar = [];

    for (const test of testler) {
        const dersId = String(test.dersId);
        const tekrar = test.kaynak === "tekrar";
        for (const soru of test.sorular) {
            const kimlik = tekrar ? soru.tekrarSoruId : soru._id;
            if (!kimlik || (arananSorular && !arananSorular.has(String(kimlik)))) continue;
            const anahtar = `${dersId}:${kimlik}`;
            const sonuc = { durum: soruDurumu(soru), ogrenciCevabi: soru.ogrenciCevabi ?? null, tarih: test.tamamlanmaTarihi };
            if (tekrar) {
                if (!sonTekrarlar.has(anahtar)) sonTekrarlar.set(anahtar, sonuc);
            } else if (sonuc.durum !== "duzeltildi") {
                kayitlar.push({
                    dersId, dersAdi: dersAdlari.get(dersId), soru,
                    kaynakSurumleri: test.kaynakSurumleri || [],
                    ...(sonTekrarlar.get(anahtar) ?? sonuc)
                });
            }
        }
    }
    return kayitlar.sort((a, b) => new Date(b.tarih) - new Date(a.tarih) ||
        String(b.soru._id).localeCompare(String(a.soru._id)));
};

export const yanlislariGetir = async (kullaniciId, { dersId, konuId, durum } = {}) => {
    const dersler = await Ders.find({ kullaniciId, ...(dersId ? { _id: dersId } : {}) }).select("dersAdi").lean();
    const gecmis = await soruGecmisiniGetir(kullaniciId, dersler);
    return gecmis.filter(kayit =>
        (konuId === undefined || kayit.soru.konuId === konuId) && (!durum || kayit.durum === durum)
    ).map(({ dersId, dersAdi, soru, durum, ogrenciCevabi, tarih }) => ({
        soruId: String(soru._id), dersId, dersAdi, konuId: soru.konuId || "", konuBasligi: soru.konuBasligi,
        metin: soru.metin, secenekler: soru.secenekler, dogruCevap: soru.dogruCevap, ogrenciCevabi,
        durum, zorluk: soru.zorluk, tarih, aciklama: soru.aciklama,
        kaynakAdlari: [...new Set((soru.kaynaklar || []).map(kaynak => kaynak.dosyaAdi).filter(Boolean))]
    }));
};

export const tekrarTestiOlustur = async (kullaniciId, dersId, soruIds) => {
    const ders = await Ders.findOne({ _id: dersId, kullaniciId }).select("dersAdi").lean();
    if (!ders) return null;
    const gecmis = await soruGecmisiniGetir(kullaniciId, [ders], soruIds);
    const sorularaGore = new Map(gecmis.map(kayit => [String(kayit.soru._id), kayit]));
    if (soruIds.some(id => !sorularaGore.has(id))) return null;

    const kaynakSurumleri = new Map();
    const sorular = soruIds.map(id => {
        const { soru, kaynakSurumleri: kaynaklar } = sorularaGore.get(id);
        for (const kaynak of kaynaklar) {
            kaynakSurumleri.set(`${kaynak.materyalId}:${kaynak.aktifIslemeId}`, kaynak);
        }
        const { metin, secenekler, dogruCevap, aciklama, zorluk, konuId, konuBasligi } = soru;
        return { tekrarSoruId: soru._id, metin, secenekler, dogruCevap, aciklama, zorluk, konuId, konuBasligi, kaynaklar: soru.kaynaklar };
    });

    const test = await Test.create({
        kullaniciId, dersId, kapsamTuru: "tum_ders", kaynak: "tekrar", zorluk: "karisik",
        soruSayisi: sorular.length, istenenSoruSayisi: sorular.length, sorular,
        kaynakSurumleri: [...kaynakSurumleri.values()]
    });
    return { testId: test._id, dersId: test.dersId };
};

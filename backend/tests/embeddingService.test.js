import test from "node:test";
import assert from "node:assert/strict";

import {
    embeddingKullaniciHatasi,
    embeddingleriUret,
    kosinusBenzerligi,
    vektoruNormalizeEt,
} from "../services/embeddingService.js";

const ayarlar = (model = "gemini-embedding-001") => ({
    model,
    boyut: 3,
    batchBoyutu: 2,
    rpm: 90,
    tpm: 27_000,
    rpd: 900,
    maksDeneme: 3,
});

test("embedding-001 metinleri batch işler, retrieval türünü kullanır ve vektörleri normalize eder", async () => {
    const istekler = [];
    const istemci = {
        models: {
            async embedContent(istek) {
                istekler.push(istek);
                const adet = Array.isArray(istek.contents) ? istek.contents.length : 1;
                return { embeddings: Array.from({ length: adet }, () => ({ values: [3, 4, 0] })) };
            }
        }
    };

    const sonuc = await embeddingleriUret(["bir", "iki", "üç"], {
        tur: "dokuman",
        baslik: "ders.pdf",
        istemci,
        ayarlar: ayarlar(),
        limitUygula: false,
    });

    assert.equal(istekler.length, 2);
    assert.deepEqual(istekler[0].contents, ["bir", "iki"]);
    assert.equal(istekler[0].config.taskType, "RETRIEVAL_DOCUMENT");
    assert.equal(istekler[0].config.title, "ders.pdf");
    assert.deepEqual(sonuc[0], [0.6, 0.8, 0]);
});

test("embedding-2 arama ve doküman öneklerini kullanıp her girdiyi ayrı çağrıda işler", async () => {
    const istekler = [];
    const istemci = {
        models: {
            async embedContent(istek) {
                istekler.push(istek);
                return { embeddings: [{ values: [1, 0, 0] }] };
            }
        }
    };

    await embeddingleriUret(["ilk", "ikinci"], {
        tur: "dokuman",
        baslik: "notlar.txt",
        istemci,
        ayarlar: ayarlar("gemini-embedding-2"),
        limitUygula: false,
    });
    await embeddingleriUret(["ağaç arama"], {
        tur: "sorgu",
        istemci,
        ayarlar: ayarlar("gemini-embedding-2"),
        limitUygula: false,
    });

    assert.equal(istekler.length, 3);
    assert.match(istekler[0].contents, /^title: notlar\.txt \| text: ilk$/);
    assert.match(istekler[2].contents, /^task: search result \| query: ağaç arama$/);
    assert.equal(istekler[0].config.taskType, undefined);
});

test("geçici 429 hatasında üstel geri çekilme ile yeniden dener", async () => {
    let cagri = 0;
    const beklemeler = [];
    const istemci = {
        models: {
            async embedContent() {
                cagri += 1;
                if (cagri < 3) {
                    const hata = new Error("429 rate limit");
                    hata.status = 429;
                    throw hata;
                }
                return { embeddings: [{ values: [1, 0, 0] }] };
            }
        }
    };

    const sonuc = await embeddingleriUret(["sorgu"], {
        tur: "sorgu",
        istemci,
        ayarlar: ayarlar(),
        limitUygula: false,
        beklet: async (sure) => { beklemeler.push(sure); },
    });

    assert.equal(cagri, 3);
    assert.deepEqual(beklemeler, [500, 1000]);
    assert.deepEqual(sonuc[0], [1, 0, 0]);
});

test("geçici 503 hatasında sınırlı sayıda yeniden dener ve hata türünü gizli ayrıntı sızdırmadan sunar", async () => {
    let cagri = 0;
    const istemci = {
        models: {
            async embedContent() {
                cagri += 1;
                const hata = new Error("503 upstream internal detail");
                hata.status = 503;
                throw hata;
            }
        }
    };

    await assert.rejects(
        embeddingleriUret(["sorgu"], {
            istemci,
            ayarlar: { ...ayarlar(), maksDeneme: 2 },
            limitUygula: false,
            beklet: async () => {},
        }),
        (hata) => hata.kod === "EMBEDDING_SERVIS_HATASI" && hata.status === 503
    );
    assert.equal(cagri, 2);
    assert.equal(
        embeddingKullaniciHatasi({ kod: "EMBEDDING_GUNLUK_LIMIT" }),
        "Semantik arama kotası şu anda dolu. Bir süre sonra tekrar deneyin."
    );
});

test("kosinüs benzerliği geçerli sonuç üretir, bozuk boyutu güvenle reddeder", () => {
    assert.equal(kosinusBenzerligi([1, 0], [1, 0]), 1);
    assert.equal(kosinusBenzerligi([1, 0], [0, 1]), 0);
    assert.equal(kosinusBenzerligi([1], [1, 0]), null);
    assert.throws(() => vektoruNormalizeEt([0, 0]), /normu sıfır/);
});

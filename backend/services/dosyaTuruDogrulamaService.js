import AdmZip from "adm-zip";

const MAKSIMUM_DOSYA_BOYUTU = 50 * 1024 * 1024;
const MAKSIMUM_ZIP_GIRDISI = 10000;
const MAKSIMUM_ACILMIS_TOPLAM_BOYUT = 200 * 1024 * 1024;
const MAKSIMUM_TEK_GIRDI_BOYUTU = 100 * 1024 * 1024;
const MAKSIMUM_YAPISAL_XML_BOYUTU = 50 * 1024 * 1024;
const MAKSIMUM_SIKISTIRMA_ORANI = 200;

export class GecersizDosyaIcerigiHatasi extends Error {
    constructor(message) {
        super(message);
        this.name = "GecersizDosyaIcerigiHatasi";
        this.statusCode = 400;
        this.code = "GECERSIZ_DOSYA_ICERIGI";
    }
}

const gecersiz = (message) => {
    throw new GecersizDosyaIcerigiHatasi(message);
};

const utf8Coz = (buffer, hataMesaji) => {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
    } catch {
        gecersiz(hataMesaji);
    }
};

const pdfDogrula = (buffer) => {
    const imzaBolumu = buffer.subarray(0, Math.min(buffer.length, 1024)).toString("latin1");
    if (!imzaBolumu.includes("%PDF-")) {
        gecersiz("Dosyanın içeriği geçerli bir PDF değil.");
    }
};

const zipImzasiVar = (buffer) => (
    buffer.length >= 4 &&
    buffer[0] === 0x50 &&
    buffer[1] === 0x4b &&
    buffer[2] === 0x03 &&
    buffer[3] === 0x04
);

const guvenliZipGirdiAdi = (entryName) => {
    if (!entryName || entryName.includes("\\") || entryName.startsWith("/")) return false;
    return !entryName.split("/").some((bolum) => bolum === "..");
};

const xmlGirdisiniOku = (entry, beklenenKok, hataMesaji) => {
    if (!entry || entry.isDirectory || entry.header.size > MAKSIMUM_YAPISAL_XML_BOYUTU) {
        gecersiz(hataMesaji);
    }

    let veri;
    try {
        veri = entry.getData();
    } catch {
        gecersiz(hataMesaji);
    }

    const xml = utf8Coz(veri, hataMesaji).replace(/^\uFEFF/, "").trimStart();
    if (!xml.startsWith("<") || !beklenenKok.test(xml)) {
        gecersiz(hataMesaji);
    }
    return xml;
};

const officeDogrula = (buffer, dosyaTuru) => {
    if (!zipImzasiVar(buffer)) {
        gecersiz(`Dosyanın içeriği geçerli bir ${dosyaTuru.toUpperCase()} değil.`);
    }

    let entries;
    try {
        entries = new AdmZip(buffer).getEntries();
    } catch {
        gecersiz(`Dosyanın içeriği geçerli bir ${dosyaTuru.toUpperCase()} değil.`);
    }

    if (entries.length === 0 || entries.length > MAKSIMUM_ZIP_GIRDISI) {
        gecersiz("Office dosyası güvenli şekilde işlenemeyecek kadar fazla ZIP girdisi içeriyor.");
    }

    let toplamBoyut = 0;
    let toplamSikistirilmisBoyut = 0;
    const girdiler = new Map();

    for (const entry of entries) {
        const ad = entry.entryName;
        const kucukAd = ad.toLowerCase();
        if (!guvenliZipGirdiAdi(ad) || girdiler.has(kucukAd) || entry.header.encrypted) {
            gecersiz("Office dosyasının ZIP yapısı güvenli değil.");
        }

        const acilmisBoyut = entry.header.size;
        const sikistirilmisBoyut = entry.header.compressedSize;
        if (!Number.isSafeInteger(acilmisBoyut) || !Number.isSafeInteger(sikistirilmisBoyut)) {
            gecersiz("Office dosyasının ZIP boyut bilgileri geçersiz.");
        }

        toplamBoyut += acilmisBoyut;
        toplamSikistirilmisBoyut += sikistirilmisBoyut;
        if (acilmisBoyut > MAKSIMUM_TEK_GIRDI_BOYUTU || toplamBoyut > MAKSIMUM_ACILMIS_TOPLAM_BOYUT) {
            gecersiz("Office dosyasının açılmış içeriği güvenli boyut sınırını aşıyor.");
        }
        girdiler.set(kucukAd, entry);
    }

    if (
        toplamBoyut > 1024 * 1024 &&
        toplamBoyut / Math.max(toplamSikistirilmisBoyut, 1) > MAKSIMUM_SIKISTIRMA_ORANI
    ) {
        gecersiz("Office dosyasının sıkıştırma oranı güvenli sınırı aşıyor.");
    }

    const anaYol = dosyaTuru === "docx" ? "word/document.xml" : "ppt/presentation.xml";
    const anaIcerikTuru = dosyaTuru === "docx"
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
    const anaKok = dosyaTuru === "docx"
        ? /<(?:[\w.-]+:)?document\b/i
        : /<(?:[\w.-]+:)?presentation\b/i;
    const hataMesaji = `ZIP içeriği geçerli bir ${dosyaTuru.toUpperCase()} yapısı taşımıyor.`;

    const contentTypes = xmlGirdisiniOku(
        girdiler.get("[content_types].xml"),
        /<(?:[\w.-]+:)?types\b/i,
        hataMesaji
    );
    const rootRels = xmlGirdisiniOku(
        girdiler.get("_rels/.rels"),
        /<(?:[\w.-]+:)?relationships\b/i,
        hataMesaji
    );
    xmlGirdisiniOku(girdiler.get(anaYol), anaKok, hataMesaji);

    if (!contentTypes.includes(`/${anaYol}`) || !contentTypes.includes(anaIcerikTuru)) {
        gecersiz(hataMesaji);
    }
    if (!rootRels.includes(anaYol) || !/officeDocument/i.test(rootRels)) {
        gecersiz(hataMesaji);
    }
};

const txtDogrula = (buffer) => {
    const metin = utf8Coz(buffer, "TXT dosyası geçerli UTF-8 metin içermiyor.");
    let kontrolKarakteriSayisi = 0;
    let karakterSayisi = 0;

    for (const karakter of metin) {
        const kod = karakter.codePointAt(0);
        karakterSayisi++;
        if (kod === 0) gecersiz("TXT dosyası ikili içerik barındırıyor.");
        if ((kod < 32 && ![9, 10, 12, 13].includes(kod)) || (kod >= 127 && kod <= 159)) {
            kontrolKarakteriSayisi++;
        }
    }

    if (kontrolKarakteriSayisi / Math.max(karakterSayisi, 1) > 0.01) {
        gecersiz("TXT dosyası ikili içerik barındırıyor.");
    }
};

/**
 * Multer diske yazdıktan sonra dosyanın istemciden bağımsız gerçek içeriğini doğrular.
 */
export const dosyaIceriginiDogrula = (buffer, dosyaTuru) => {
    if (!Buffer.isBuffer(buffer) || buffer.length > MAKSIMUM_DOSYA_BOYUTU) {
        gecersiz("Dosya içeriği güvenli boyut sınırını aşıyor.");
    }

    if (dosyaTuru === "pdf") return pdfDogrula(buffer);
    if (dosyaTuru === "docx" || dosyaTuru === "pptx") return officeDogrula(buffer, dosyaTuru);
    if (dosyaTuru === "txt") return txtDogrula(buffer);
    gecersiz("Desteklenmeyen dosya türü.");
};


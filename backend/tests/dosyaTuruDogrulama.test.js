import { test } from "node:test";
import assert from "node:assert/strict";
import AdmZip from "adm-zip";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
    dosyaIceriginiDogrula,
    GecersizDosyaIcerigiHatasi
} from "../services/dosyaTuruDogrulamaService.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const officePaketiOlustur = (dosyaTuru, ekDosyalar = []) => {
    const zip = new AdmZip();
    const docx = dosyaTuru === "docx";
    const anaYol = docx ? "word/document.xml" : "ppt/presentation.xml";
    const anaIcerikTuru = docx
        ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"
        : "application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml";
    const anaXml = docx
        ? "<?xml version=\"1.0\"?><w:document xmlns:w=\"urn:test\"><w:body/></w:document>"
        : "<?xml version=\"1.0\"?><p:presentation xmlns:p=\"urn:test\"/>";

    zip.addFile("[Content_Types].xml", Buffer.from(
        `<?xml version="1.0"?><Types><Override PartName="/${anaYol}" ContentType="${anaIcerikTuru}"/></Types>`
    ));
    zip.addFile("_rels/.rels", Buffer.from(
        `<?xml version="1.0"?><Relationships><Relationship Type="officeDocument" Target="${anaYol}"/></Relationships>`
    ));
    zip.addFile(anaYol, Buffer.from(anaXml));
    for (const [ad, icerik] of ekDosyalar) zip.addFile(ad, icerik);
    return zip.toBuffer();
};

const gecersizOlmali = (calistir) => {
    assert.throws(calistir, (error) => {
        assert.ok(error instanceof GecersizDosyaIcerigiHatasi);
        assert.equal(error.statusCode, 400);
        return true;
    });
};

test("gerçek PDF imzası kabul edilir, sahte PDF reddedilir", () => {
    assert.doesNotThrow(() => dosyaIceriginiDogrula(Buffer.from("%PDF-1.7\n1 0 obj\n%%EOF"), "pdf"));
    gecersizOlmali(() => dosyaIceriginiDogrula(Buffer.from("PDF gibi görünen düz metin"), "pdf"));
});

test("gerekli OOXML yapılarını taşıyan DOCX ve PPTX kabul edilir", () => {
    assert.doesNotThrow(() => dosyaIceriginiDogrula(officePaketiOlustur("docx"), "docx"));
    assert.doesNotThrow(() => dosyaIceriginiDogrula(officePaketiOlustur("pptx"), "pptx"));
});

test("projedeki gerçek PDF, DOCX, PPTX ve TXT örnekleri kabul edilir", () => {
    const dersDizini = path.join(__dirname, "dersler");
    const ornekler = fs.readdirSync(dersDizini);

    for (const dosyaAdi of ornekler) {
        const dosyaTuru = path.extname(dosyaAdi).slice(1).toLowerCase();
        assert.doesNotThrow(
            () => dosyaIceriginiDogrula(fs.readFileSync(path.join(dersDizini, dosyaAdi)), dosyaTuru),
            `${dosyaAdi} kabul edilmeliydi`
        );
    }
});

test("yalnızca ZIP olan dosya DOCX veya PPTX sayılmaz", () => {
    const zip = new AdmZip();
    zip.addFile("rastgele.txt", Buffer.from("içerik"));
    const buffer = zip.toBuffer();

    gecersizOlmali(() => dosyaIceriginiDogrula(buffer, "docx"));
    gecersizOlmali(() => dosyaIceriginiDogrula(buffer, "pptx"));
});

test("Office ana içerik türü ve kök ilişkisi doğrulanır", () => {
    const zip = new AdmZip();
    zip.addFile("[Content_Types].xml", Buffer.from("<Types/>"));
    zip.addFile("_rels/.rels", Buffer.from("<Relationships/>"));
    zip.addFile("word/document.xml", Buffer.from("<w:document/>"));

    gecersizOlmali(() => dosyaIceriginiDogrula(zip.toBuffer(), "docx"));
});

test("anormal sıkıştırma oranlı Office paketi reddedilir", () => {
    const buyukTekrarliIcerik = Buffer.alloc(2 * 1024 * 1024, 0x41);
    const buffer = officePaketiOlustur("docx", [["word/media/supheli.bin", buyukTekrarliIcerik]]);

    gecersizOlmali(() => dosyaIceriginiDogrula(buffer, "docx"));
});

test("geçerli UTF-8 TXT ve özel karakterler kabul edilir", () => {
    const metin = Buffer.from("Türkçe metin 👋\nSekme:\t✓\nForm feed:\fson", "utf8");
    assert.doesNotThrow(() => dosyaIceriginiDogrula(metin, "txt"));
    assert.doesNotThrow(() => dosyaIceriginiDogrula(Buffer.alloc(0), "txt"));
});

test("geçersiz UTF-8 ve ikili TXT içerikleri reddedilir", () => {
    gecersizOlmali(() => dosyaIceriginiDogrula(Buffer.from([0xc3, 0x28]), "txt"));
    gecersizOlmali(() => dosyaIceriginiDogrula(Buffer.from([0x41, 0x00, 0x42]), "txt"));
});

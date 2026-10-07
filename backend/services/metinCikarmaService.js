import fs from "fs";
import fsPromises from "fs/promises";
import { PDFParse } from "pdf-parse";
import mammoth from "mammoth";
import AdmZip from "adm-zip";
import { XMLParser } from "fast-xml-parser";

/**
 * PDF, DOCX, PPTX ve TXT dosyalarından metin çıkaran servis.
 * @param {string} dosyaYolu - Dosyanın fiziksel yolu
 * @param {string} mimeTuru - Dosyanın MIME türü veya uzantısı
 * @returns {Promise<string>} - Çıkarılan metin
 */
export const metinCikar = async (dosyaYolu, mimeTuru) => {
    if (!fs.existsSync(dosyaYolu)) {
        throw new Error("Dosya bulunamadı: " + dosyaYolu);
    }

    try {
        if (mimeTuru.includes("pdf")) {
            return await pdfMetinCikar(dosyaYolu);
        } else if (mimeTuru.includes("wordprocessingml.document") || dosyaYolu.endsWith(".docx")) {
            return await docxMetinCikar(dosyaYolu);
        } else if (mimeTuru.includes("presentationml.presentation") || dosyaYolu.endsWith(".pptx")) {
            return await pptxMetinCikar(dosyaYolu);
        } else if (mimeTuru.includes("text/plain") || dosyaYolu.endsWith(".txt")) {
            return await txtMetinCikar(dosyaYolu);
        } else {
            throw new Error("Desteklenmeyen dosya türü metin çıkarma işlemi için gönderildi.");
        }
    } catch (error) {
        throw new Error("Metin çıkarma başarısız: " + error.message);
    }
};

const pdfMetinCikar = async (dosyaYolu) => {
    const dataBuffer = await fsPromises.readFile(dosyaYolu);
    const parser = new PDFParse({ data: dataBuffer });
    const data = await parser.getText();
    if (!data.text || data.text.trim().length === 0) {
        throw new Error("PDF'den metin çıkarılamadı (belki taranmış/OCR gerektiren bir belgedir).");
    }
    return data.text.trim();
};

const docxMetinCikar = async (dosyaYolu) => {
    const result = await mammoth.extractRawText({ path: dosyaYolu });
    if (!result.value || result.value.trim().length === 0) {
        throw new Error("DOCX belgesinden metin okunamadı veya belge boş.");
    }
    return result.value.trim();
};

const pptxMetinCikar = async (dosyaYolu) => {
    return new Promise((resolve, reject) => {
        try {
            const zip = new AdmZip(dosyaYolu);
            const zipEntries = zip.getEntries();
            const slideEntries = zipEntries.filter(entry => entry.entryName.match(/ppt\/slides\/slide\d+\.xml/i));
            
            if (slideEntries.length === 0) {
                return reject(new Error("PPTX içinde geçerli slayt bulunamadı."));
            }

            // Slayt numaralarına göre sırala (slide1.xml, slide2.xml ...)
            slideEntries.sort((a, b) => {
                const numA = parseInt(a.entryName.match(/\d+/)[0], 10);
                const numB = parseInt(b.entryName.match(/\d+/)[0], 10);
                return numA - numB;
            });

            const parser = new XMLParser({
                ignoreAttributes: true,
                parseTagValue: true
            });

            let extractedText = "";

            slideEntries.forEach(entry => {
                const xmlData = entry.getData().toString("utf8");
                const obj = parser.parse(xmlData);
                
                // Extract text from slide xml recursively
                const extractTexts = (node) => {
                    let text = "";
                    if (typeof node === "string") {
                        text += node + " ";
                    } else if (typeof node === "object" && node !== null) {
                        for (let key in node) {
                            // In PPTX XML, 'a:t' tags contain the actual text
                            if (key === "a:t") {
                                if (typeof node[key] === "string" || typeof node[key] === "number") {
                                    text += node[key] + " ";
                                }
                            } else {
                                text += extractTexts(node[key]);
                            }
                        }
                    }
                    return text;
                };

                const slideText = extractTexts(obj);
                if (slideText.trim()) {
                    extractedText += slideText.trim() + "\n\n";
                }
            });

            if (!extractedText.trim()) {
                return reject(new Error("PPTX'ten metin çıkarılamadı veya boş."));
            }

            resolve(extractedText.trim());
        } catch (error) {
            reject(new Error("PPTX parse hatası: " + error.message));
        }
    });
};

const txtMetinCikar = async (dosyaYolu) => {
    const text = await fsPromises.readFile(dosyaYolu, "utf8");
    if (!text || text.trim().length === 0) {
        throw new Error("TXT dosyası boş.");
    }
    return text.trim();
};

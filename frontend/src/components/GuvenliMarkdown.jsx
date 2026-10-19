import { Fragment } from "react";

const guvenliBaglanti = (adres) => {
    try {
        const url = new URL(adres, window.location.origin);
        return ["http:", "https:"].includes(url.protocol) ? url.href : null;
    } catch {
        return null;
    }
};

const satirIciParcalar = (metin, anahtar) => {
    const desen = /(`[^`\n]+`|\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\n]+\*|_([^_\n]+)_|\[[^\]\n]+\]\([^\s)]+\))/g;
    const sonuc = [];
    let son = 0;
    let sira = 0;
    for (const eslesme of String(metin).matchAll(desen)) {
        if (eslesme.index > son) sonuc.push(metin.slice(son, eslesme.index));
        const parca = eslesme[0];
        const key = `${anahtar}-${sira++}`;
        if (parca.startsWith("`")) {
            sonuc.push(<code key={key} className="rounded bg-slate-500/15 px-1.5 py-0.5 font-mono text-[0.9em]">{parca.slice(1, -1)}</code>);
        } else if (parca.startsWith("**") || parca.startsWith("__")) {
            sonuc.push(<strong key={key} className="font-semibold">{parca.slice(2, -2)}</strong>);
        } else if (parca.startsWith("[")) {
            const baglanti = parca.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
            const href = baglanti ? guvenliBaglanti(baglanti[2]) : null;
            sonuc.push(href ? (
                <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="font-medium text-indigo-500 underline underline-offset-2 hover:text-indigo-400"
                >
                    {baglanti[1]}
                </a>
            ) : parca);
        } else {
            sonuc.push(<em key={key}>{parca.slice(1, -1)}</em>);
        }
        son = eslesme.index + parca.length;
    }
    if (son < metin.length) sonuc.push(metin.slice(son));
    return sonuc;
};

const paragrafSatirlari = (satirlar, anahtar) => satirlar.map((satir, index) => (
    <Fragment key={`${anahtar}-${index}`}>
        {index > 0 && <br />}
        {satirIciParcalar(satir, `${anahtar}-${index}`)}
    </Fragment>
));

function GuvenliMarkdown({ icerik }) {
    const satirlar = String(icerik || "").replace(/\r\n?/g, "\n").split("\n");
    const bloklar = [];
    let index = 0;

    while (index < satirlar.length) {
        const satir = satirlar[index];
        if (!satir.trim()) {
            index += 1;
            continue;
        }

        if (satir.trimStart().startsWith("```")) {
            const dil = satir.trim().slice(3).trim();
            const kod = [];
            index += 1;
            while (index < satirlar.length && !satirlar[index].trimStart().startsWith("```")) {
                kod.push(satirlar[index]);
                index += 1;
            }
            if (index < satirlar.length) index += 1;
            bloklar.push(
                <pre key={`kod-${index}`} className="my-3 overflow-x-auto rounded-xl bg-slate-950 p-4 text-[13px] leading-6 text-slate-100">
                    <code data-language={dil || undefined}>{kod.join("\n")}</code>
                </pre>
            );
            continue;
        }

        const baslik = satir.match(/^(#{1,3})\s+(.+)$/);
        if (baslik) {
            const Sinif = baslik[1].length === 1 ? "text-lg" : baslik[1].length === 2 ? "text-base" : "text-sm";
            bloklar.push(
                <p key={`baslik-${index}`} className={`mb-2 mt-3 font-bold ${Sinif}`}>
                    {satirIciParcalar(baslik[2], `baslik-${index}`)}
                </p>
            );
            index += 1;
            continue;
        }

        if (/^\s*[-*+]\s+/.test(satir)) {
            const maddeler = [];
            while (index < satirlar.length && /^\s*[-*+]\s+/.test(satirlar[index])) {
                maddeler.push(satirlar[index].replace(/^\s*[-*+]\s+/, ""));
                index += 1;
            }
            bloklar.push(
                <ul key={`liste-${index}`} className="my-2 list-disc space-y-1 pl-5">
                    {maddeler.map((madde, sira) => <li key={sira}>{satirIciParcalar(madde, `u-${index}-${sira}`)}</li>)}
                </ul>
            );
            continue;
        }

        if (/^\s*\d+[.)]\s+/.test(satir)) {
            const maddeler = [];
            while (index < satirlar.length && /^\s*\d+[.)]\s+/.test(satirlar[index])) {
                maddeler.push(satirlar[index].replace(/^\s*\d+[.)]\s+/, ""));
                index += 1;
            }
            bloklar.push(
                <ol key={`sirali-${index}`} className="my-2 list-decimal space-y-1 pl-5">
                    {maddeler.map((madde, sira) => <li key={sira}>{satirIciParcalar(madde, `o-${index}-${sira}`)}</li>)}
                </ol>
            );
            continue;
        }

        if (/^>\s?/.test(satir)) {
            const alinti = [];
            while (index < satirlar.length && /^>\s?/.test(satirlar[index])) {
                alinti.push(satirlar[index].replace(/^>\s?/, ""));
                index += 1;
            }
            bloklar.push(
                <blockquote key={`alinti-${index}`} className="my-3 border-l-2 border-indigo-400 pl-3 opacity-90">
                    {paragrafSatirlari(alinti, `alinti-${index}`)}
                </blockquote>
            );
            continue;
        }

        const paragraf = [satir];
        index += 1;
        while (
            index < satirlar.length && satirlar[index].trim() &&
            !/^(#{1,3})\s+|^\s*[-*+]\s+|^\s*\d+[.)]\s+|^>\s?|^```/.test(satirlar[index])
        ) {
            paragraf.push(satirlar[index]);
            index += 1;
        }
        bloklar.push(
            <p key={`paragraf-${index}`} className="my-2 leading-7">
                {paragrafSatirlari(paragraf, `p-${index}`)}
            </p>
        );
    }

    return <div className="break-words">{bloklar}</div>;
}

export default GuvenliMarkdown;

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
    BookOpenIcon,
    CheckIcon,
    ChevronDownIcon,
    DocumentIcon,
    DocumentTextIcon,
    ListBulletIcon,
    PresentationChartBarIcon,
} from "@heroicons/react/24/outline";

const dosyaBilgisi = (dosyaAdi = "") => {
    const uzanti = dosyaAdi.split(".").pop()?.toLowerCase();
    if (uzanti === "pdf") return { Ikon: DocumentTextIcon, renk: "text-rose-400", etiket: "PDF" };
    if (["ppt", "pptx"].includes(uzanti)) {
        return { Ikon: PresentationChartBarIcon, renk: "text-orange-400", etiket: uzanti.toUpperCase() };
    }
    if (["doc", "docx"].includes(uzanti)) {
        return { Ikon: DocumentTextIcon, renk: "text-sky-400", etiket: uzanti.toUpperCase() };
    }
    if (uzanti === "txt") return { Ikon: DocumentIcon, renk: "text-slate-400", etiket: "TXT" };
    return { Ikon: DocumentIcon, renk: "text-violet-400", etiket: "Dosya" };
};

const sinirla = (deger, alt, ust) => Math.min(Math.max(deger, alt), ust);

function OzetSecimDropdown({
    id,
    value,
    options,
    onChange,
    disabled = false,
    emptyLabel,
    tur,
    isDark,
}) {
    const otomatikId = useId();
    const listeId = `${id || otomatikId}-liste`;
    const tetikleyiciRef = useRef(null);
    const listeRef = useRef(null);
    const [acik, setAcik] = useState(false);
    const [aktifIndeks, setAktifIndeks] = useState(0);
    const [konum, setKonum] = useState({ top: 0, left: 0, width: 0, maxHeight: 280 });

    const seciliIndeks = useMemo(
        () => options.findIndex((secenek) => secenek.value === String(value)),
        [options, value]
    );
    const seciliSecenek = seciliIndeks >= 0 ? options[seciliIndeks] : null;
    const etkisiz = disabled || options.length === 0;

    const kapat = (odakla = false) => {
        setAcik(false);
        if (odakla) requestAnimationFrame(() => tetikleyiciRef.current?.focus());
    };

    const ac = () => {
        if (etkisiz) return;
        setAktifIndeks(seciliIndeks >= 0 ? seciliIndeks : 0);
        setAcik(true);
    };

    useLayoutEffect(() => {
        if (!acik) return undefined;

        const konumuGuncelle = () => {
            const dikdortgen = tetikleyiciRef.current?.getBoundingClientRect();
            if (!dikdortgen) return;

            const kenarBosluk = 12;
            const aralik = 7;
            const kullanilabilirGenislik = Math.max(240, window.innerWidth - (kenarBosluk * 2));
            const genislik = Math.min(Math.max(dikdortgen.width, 320), Math.min(440, kullanilabilirGenislik));
            const maksimumYukseklik = Math.min(304, Math.max(180, Math.floor(window.innerHeight * 0.44)));
            const asagiBosluk = window.innerHeight - dikdortgen.bottom - kenarBosluk;
            const yukariBosluk = dikdortgen.top - kenarBosluk;
            const yukariAc = asagiBosluk < 190 && yukariBosluk > asagiBosluk;
            const top = yukariAc
                ? Math.max(kenarBosluk, dikdortgen.top - maksimumYukseklik - aralik)
                : Math.min(dikdortgen.bottom + aralik, window.innerHeight - kenarBosluk - 80);
            const left = sinirla(
                dikdortgen.left,
                kenarBosluk,
                Math.max(kenarBosluk, window.innerWidth - genislik - kenarBosluk)
            );

            setKonum({ top, left, width: genislik, maxHeight: maksimumYukseklik });
        };

        const disariyaTiklama = (event) => {
            if (
                !tetikleyiciRef.current?.contains(event.target) &&
                !listeRef.current?.contains(event.target)
            ) {
                kapat();
            }
        };

        konumuGuncelle();
        const odakZamanlayicisi = requestAnimationFrame(() => listeRef.current?.focus());
        document.addEventListener("pointerdown", disariyaTiklama);
        window.addEventListener("resize", konumuGuncelle);
        window.addEventListener("scroll", konumuGuncelle, true);

        return () => {
            cancelAnimationFrame(odakZamanlayicisi);
            document.removeEventListener("pointerdown", disariyaTiklama);
            window.removeEventListener("resize", konumuGuncelle);
            window.removeEventListener("scroll", konumuGuncelle, true);
        };
    }, [acik]);

    useEffect(() => {
        if (!acik) return;
        listeRef.current
            ?.querySelector(`[data-option-index="${aktifIndeks}"]`)
            ?.scrollIntoView({ block: "nearest" });
    }, [acik, aktifIndeks]);

    const sec = (secenek) => {
        onChange(secenek.value);
        kapat(true);
    };

    const tetikleyiciKlavyesi = (event) => {
        if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
            event.preventDefault();
            if (acik) kapat();
            else ac();
        }
    };

    const listeKlavyesi = (event) => {
        if (event.key === "Escape") {
            event.preventDefault();
            kapat(true);
            return;
        }
        if (event.key === "Tab") {
            kapat();
            return;
        }
        if (event.key === "Home" || event.key === "End") {
            event.preventDefault();
            setAktifIndeks(event.key === "Home" ? 0 : options.length - 1);
            return;
        }
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            const yon = event.key === "ArrowDown" ? 1 : -1;
            setAktifIndeks((onceki) => (onceki + yon + options.length) % options.length);
            return;
        }
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            sec(options[aktifIndeks]);
        }
    };

    const tetikleyiciIkonu = tur === "konu"
        ? (seciliSecenek?.seviye === "alt_konu" ? ListBulletIcon : BookOpenIcon)
        : dosyaBilgisi(seciliSecenek?.label).Ikon;
    const TetikleyiciIkonu = tetikleyiciIkonu;

    return (
        <>
            <button
                ref={tetikleyiciRef}
                id={id}
                type="button"
                disabled={etkisiz}
                aria-haspopup="listbox"
                aria-expanded={acik}
                aria-controls={acik ? listeId : undefined}
                onClick={() => (acik ? kapat() : ac())}
                onKeyDown={tetikleyiciKlavyesi}
                className={`flex h-[46px] w-full items-center gap-2 rounded-xl border px-3 text-left text-[12px] outline-none transition-colors focus-visible:ring-2 focus-visible:ring-violet-500/50 disabled:cursor-not-allowed disabled:opacity-55 ${
                    isDark
                        ? "border-[#2B3C59] bg-[#111E33] text-[#F8FAFC] hover:border-violet-400/55"
                        : "border-[#D8DDE8] bg-white text-[#0F172A] hover:border-violet-300"
                }`}
            >
                {seciliSecenek && (
                    <TetikleyiciIkonu className="h-4 w-4 shrink-0 text-[#9B8CFF]" />
                )}
                <span
                    className={`min-w-0 flex-1 truncate ${seciliSecenek ? "" : isDark ? "text-[#8996AA]" : "text-[#64748B]"}`}
                    title={seciliSecenek?.tamEtiket || seciliSecenek?.label}
                >
                    {seciliSecenek?.label || emptyLabel}
                </span>
                <ChevronDownIcon className={`h-4 w-4 shrink-0 transition-transform ${
                    acik ? "rotate-180 text-violet-400" : isDark ? "text-[#7F8CA1]" : "text-[#64748B]"
                }`} />
            </button>

            {acik && createPortal(
                <div
                    ref={listeRef}
                    id={listeId}
                    role="listbox"
                    tabIndex={-1}
                    aria-activedescendant={`${listeId}-secenek-${aktifIndeks}`}
                    aria-label={tur === "konu" ? "Konu seçimi" : "Materyal seçimi"}
                    onKeyDown={listeKlavyesi}
                    className={`sohbet-mesaj-scrollbar fixed z-[100] overflow-y-auto overscroll-contain rounded-xl border p-1.5 shadow-2xl outline-none ${
                        isDark
                            ? "sohbet-mesaj-scrollbar--dark border-[#304361] bg-[#0E192B] shadow-black/35"
                            : "sohbet-mesaj-scrollbar--light border-[#D8DDE8] bg-white shadow-slate-900/15"
                    }`}
                    style={{
                        top: konum.top,
                        left: konum.left,
                        width: konum.width,
                        maxHeight: konum.maxHeight,
                    }}
                >
                    {options.map((secenek, index) => {
                        const secili = secenek.value === String(value);
                        const aktif = index === aktifIndeks;
                        const dosya = tur === "materyal" ? dosyaBilgisi(secenek.label) : null;
                        const SecenekIkonu = tur === "konu"
                            ? (secenek.seviye === "alt_konu" ? ListBulletIcon : BookOpenIcon)
                            : dosya.Ikon;

                        return (
                            <button
                                key={secenek.value}
                                id={`${listeId}-secenek-${index}`}
                                type="button"
                                role="option"
                                aria-selected={secili}
                                tabIndex={-1}
                                data-option-index={index}
                                title={secenek.tamEtiket || secenek.label}
                                onMouseEnter={() => setAktifIndeks(index)}
                                onClick={() => sec(secenek)}
                                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors ${
                                    secenek.seviye === "alt_konu" ? "pl-6" : ""
                                } ${
                                    secili
                                        ? isDark
                                            ? "bg-violet-500/15 text-violet-100"
                                            : "bg-violet-50 text-violet-900"
                                        : aktif
                                            ? isDark
                                                ? "bg-[#18263D] text-white"
                                                : "bg-slate-100 text-[#111827]"
                                            : isDark
                                                ? "text-[#C9D2E1]"
                                                : "text-[#475569]"
                                }`}
                            >
                                <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                                    isDark ? "bg-[#172640]" : "bg-slate-100"
                                }`}>
                                    <SecenekIkonu className={`h-[18px] w-[18px] ${dosya?.renk || "text-[#9B8CFF]"}`} />
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className={`block truncate text-[12px] ${
                                        secenek.seviye === "ana_konu" ? "font-bold" : "font-medium"
                                    }`}>
                                        {secenek.label}
                                    </span>
                                    <span className={`mt-0.5 block truncate text-[10px] ${
                                        isDark ? "text-[#8492A8]" : "text-[#64748B]"
                                    }`}>
                                        {tur === "konu"
                                            ? (secenek.seviye === "ana_konu" ? "Ana konu" : secenek.ustBaslik)
                                            : dosya.etiket}
                                    </span>
                                </span>
                                {secili && <CheckIcon className="h-4 w-4 shrink-0 text-violet-400" />}
                            </button>
                        );
                    })}
                </div>,
                document.body
            )}
        </>
    );
}

export default OzetSecimDropdown;

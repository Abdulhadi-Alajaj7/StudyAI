import {
    BeakerIcon,
    BookOpenIcon,
    CalculatorIcon,
    CircleStackIcon,
    CodeBracketIcon,
    ComputerDesktopIcon,
} from "@heroicons/react/24/outline";

export const DERS_RENKLERI = [
    { id: "indigo", etiket: "İndigo", secim: "bg-[#4F46E5]", zemin: "bg-indigo-500/10", metin: "text-indigo-500", metinKoyu: "text-indigo-400" },
    { id: "cyan", etiket: "Camgöbeği", secim: "bg-[#06B6D4]", zemin: "bg-cyan-500/10", metin: "text-cyan-600", metinKoyu: "text-cyan-400" },
    { id: "emerald", etiket: "Zümrüt", secim: "bg-[#10B981]", zemin: "bg-emerald-500/10", metin: "text-emerald-500", metinKoyu: "text-emerald-400" },
    { id: "amber", etiket: "Kehribar", secim: "bg-[#F59E0B]", zemin: "bg-amber-500/10", metin: "text-amber-500", metinKoyu: "text-amber-400" },
    { id: "rose", etiket: "Gül", secim: "bg-[#F43F5E]", zemin: "bg-rose-500/10", metin: "text-rose-500", metinKoyu: "text-rose-400" },
];

export const DERS_SIMGELERI = [
    { id: "book", icon: BookOpenIcon, etiket: "Kitap" },
    { id: "desktop", icon: ComputerDesktopIcon, etiket: "Bilgisayar" },
    { id: "code", icon: CodeBracketIcon, etiket: "Kod" },
    { id: "database", icon: CircleStackIcon, etiket: "Veritabanı" },
    { id: "calc", icon: CalculatorIcon, etiket: "Hesap" },
    { id: "science", icon: BeakerIcon, etiket: "Bilim" },
];

export const dersRengiGetir = (renk) => (
    DERS_RENKLERI.find((secenek) => secenek.id === renk) || DERS_RENKLERI[0]
);

export const dersSimgesiGetir = (simge) => (
    DERS_SIMGELERI.find((secenek) => secenek.id === simge) || DERS_SIMGELERI[1]
);

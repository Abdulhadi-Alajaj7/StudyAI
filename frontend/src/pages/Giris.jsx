import { useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRightIcon,
    ChartBarIcon,
    EyeIcon,
    EyeSlashIcon,
    LockClosedIcon,
    EnvelopeIcon,
    SparklesIcon,
    BookOpenIcon,
} from "@heroicons/react/24/outline";

function Giris() {
    const [sifreGoster, setSifreGoster] = useState(false);

    return (
        <main className="min-h-screen w-full flex bg-[#F7F9FC] text-[#0F172A]">

            {/* SOL PANEL */}
            <section className="w-full lg:w-1/2 xl:w-[47%] flex flex-col justify-between bg-white px-7 py-8 sm:px-12 md:px-16 lg:px-14 xl:px-20 border-r border-[#E2E8F0]">
                <div className="w-full max-w-[520px] mx-auto">

                    {/* Logo */}
                    <header className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-[10px] bg-[#0B1739] flex items-center justify-center">
                            <BookOpenIcon className="w-6 h-6 text-white" />
                        </div>

                        <div>
                            <div className="text-[22px] leading-tight font-bold tracking-tight text-[#0B1739]">
                                StudyAI
                            </div>

                            <div className="text-sm font-medium text-[#64748B] mt-0.5">
                                Akıllı Öğrenme Platformu
                            </div>
                        </div>
                    </header>

                    {/* Başlık */}
                    <div className="mt-12 lg:mt-14">
                        <h1 className="text-[32px] lg:text-[36px] leading-tight font-semibold tracking-tight text-[#0F172A]">
                            Tekrar hoş geldin
                        </h1>

                        <p className="text-base leading-7 text-[#64748B] mt-3 max-w-[470px]">
                            Derslerine, çalışma planına ve öğrenme sürecine kaldığın
                            yerden devam et.
                        </p>
                    </div>

                    {/* Form */}
                    <form
                        className="mt-8 space-y-5"
                        onSubmit={(e) => e.preventDefault()}
                    >
                        {/* E-posta */}
                        <div>
                            <label
                                htmlFor="email"
                                className="block text-[15px] font-semibold text-[#0F172A] mb-2"
                            >
                                E-posta Adresi
                            </label>

                            <div className="relative">
                                <EnvelopeIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />

                                <input
                                    id="email"
                                    name="email"
                                    type="email"
                                    required
                                    placeholder="ornek@email.com"
                                    className="w-full h-[50px] pl-12 pr-4 bg-white border border-[#E2E8F0] rounded-[10px] text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#2563EB] focus:ring-3 focus:ring-[#2563EB]/10"
                                />
                            </div>
                        </div>

                        {/* Şifre */}
                        <div>
                            <label
                                htmlFor="password"
                                className="block text-[15px] font-semibold text-[#0F172A] mb-2"
                            >
                                Şifre
                            </label>

                            <div className="relative">
                                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />

                                <input
                                    id="password"
                                    name="password"
                                    type={sifreGoster ? "text" : "password"}
                                    required
                                    placeholder="Şifreni gir"
                                    className="w-full h-[50px] pl-12 pr-12 bg-white border border-[#E2E8F0] rounded-[10px] text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#2563EB] focus:ring-3 focus:ring-[#2563EB]/10"
                                />

                                <button
                                    type="button"
                                    onClick={() => setSifreGoster(!sifreGoster)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] transition"
                                    aria-label="Şifreyi göster veya gizle"
                                >
                                    {sifreGoster ? (
                                        <EyeSlashIcon className="w-5 h-5" />
                                    ) : (
                                        <EyeIcon className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Seçenekler */}
                        <div className="flex items-center justify-between gap-4 pt-1">
                            <label className="flex items-center gap-2.5 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    className="w-4 h-4 rounded accent-[#2563EB]"
                                />

                                <span className="text-[14px] text-[#64748B]">
                                    Beni hatırla
                                </span>
                            </label>

                            <Link
                                to="/sifremi-unuttum"
                                className="text-[14px] font-semibold text-[#2563EB] hover:underline"
                            >
                                Şifremi unuttum
                            </Link>
                        </div>

                        {/* Giriş */}
                        <button
                            type="submit"
                            className="w-full h-[50px] flex items-center justify-center gap-2 rounded-[9px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[15px] font-semibold transition active:scale-[0.99] group"
                        >
                            Giriş Yap

                            <ArrowRightIcon className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                        </button>
                    </form>

                    {/* Ayırıcı */}
                    <div className="relative my-7">
                        <div className="absolute inset-0 flex items-center">
                            <div className="w-full border-t border-[#E2E8F0]" />
                        </div>

                        <div className="relative flex justify-center">
                            <span className="px-4 bg-white text-[13px] text-[#94A3B8]">
                                veya
                            </span>
                        </div>
                    </div>

                    {/* Google */}
                    <button
                        type="button"
                        className="w-full h-[50px] flex items-center justify-center gap-3 bg-white border border-[#E2E8F0] hover:bg-[#F8FAFC] rounded-[9px] text-[15px] font-semibold text-[#0F172A] transition"
                    >
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                            <path
                                d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.04h3.88c2.27-2.09 3.66-5.17 3.66-9.14z"
                                fill="#4285F4"
                            />
                            <path
                                d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.04c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.13C3.27 21.39 7.33 24 12 24z"
                                fill="#34A853"
                            />
                            <path
                                d="M5.28 14.28c-.25-.72-.38-1.49-.38-2.28s.13-1.56.38-2.28V6.59H1.26C.46 8.21 0 10.05 0 12s.46 3.79 1.26 5.41l4.02-3.13z"
                                fill="#FBBC05"
                            />
                            <path
                                d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.27 2.61 1.26 6.59l4.02 3.13c.95-2.83 3.6-4.97 6.72-4.97z"
                                fill="#EA4335"
                            />
                        </svg>

                        Google ile devam et
                    </button>

                    {/* Kayıt */}
                    <p className="text-center text-[15px] text-[#64748B] mt-7">
                        Hesabın yok mu?

                        <Link
                            to="/kayit"
                            className="font-semibold text-[#2563EB] hover:underline ml-1.5"
                        >
                            Kayıt Ol
                        </Link>
                    </p>
                </div>

                <footer className="w-full max-w-[520px] mx-auto mt-10 pt-6 border-t border-[#E2E8F0]">
                    <p className="text-[13px] text-[#94A3B8]">
                        © 2026 StudyAI
                    </p>
                </footer>
            </section>

            {/* SAĞ PANEL */}
            <section className="hidden lg:flex lg:w-1/2 xl:w-[53%] relative overflow-hidden bg-[#F7F9FC] px-12 xl:px-20 py-10 flex-col">

                {/* Arka Plan */}
                <div className="absolute top-[-120px] right-[-100px] w-[380px] h-[380px] rounded-full bg-[#2563EB]/5" />
                <div className="absolute bottom-[-160px] left-[-100px] w-[400px] h-[400px] rounded-full bg-[#06B6D4]/5" />

                {/* Üst Etiket */}
                <div className="relative z-10">
                    <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-[10px] bg-white border border-[#E2E8F0]">
                        <SparklesIcon className="w-[18px] h-[18px] text-[#06B6D4]" />

                        <span className="text-[14px] font-semibold text-[#0B1739]">
                            Yapay Zekâ Destekli Öğrenme
                        </span>
                    </div>
                </div>

                {/* Ana İçerik */}
                <div className="relative z-10 flex-1 flex items-center">
                    <div className="w-full max-w-[650px] mx-auto">

                        <p className="text-[15px] font-semibold text-[#2563EB] mb-3">
                            StudyAI ile öğrenme sürecin
                        </p>

                        <h2 className="text-[34px] xl:text-[40px] leading-[1.18] font-semibold tracking-tight text-[#0B1739] max-w-[580px]">
                            Çalışmalarını düzenle,
                            <br />
                            gelişimini adım adım takip et.
                        </h2>

                        <p className="mt-5 text-[16px] xl:text-[17px] leading-7 text-[#64748B] max-w-[550px]">
                            Derslerinden çalışma materyallerine, testlerden kişisel
                            gelişimine kadar öğrenme sürecini tek bir yerde yönet.
                        </p>

                        {/* Öğrenme Akışı */}
                        <div className="mt-12">
                            <p className="text-[13px] uppercase tracking-[0.12em] font-semibold text-[#94A3B8] mb-5">
                                Öğrenme Akışı
                            </p>

                            <div className="relative">
                                <div className="absolute top-[25px] left-[25px] right-[25px] h-[2px] bg-[#E2E8F0]" />

                                <div className="relative grid grid-cols-5 gap-3">

                                    {/* Ders */}
                                    <div className="flex flex-col items-center text-center">
                                        <div className="w-[50px] h-[50px] rounded-[12px] bg-white border border-[#E2E8F0] flex items-center justify-center shadow-sm">
                                            <BookOpenIcon className="w-5 h-5 text-[#2563EB]" />
                                        </div>

                                        <p className="mt-3 text-[14px] font-semibold">
                                            Ders
                                        </p>

                                        <p className="text-[12px] text-[#94A3B8] mt-1">
                                            Oluştur
                                        </p>
                                    </div>

                                    {/* Materyal */}
                                    <div className="flex flex-col items-center text-center">
                                        <div className="w-[50px] h-[50px] rounded-[12px] bg-white border border-[#E2E8F0] flex items-center justify-center shadow-sm">
                                            <svg
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                className="w-5 h-5 text-[#2563EB]"
                                                stroke="currentColor"
                                                strokeWidth="1.8"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M12 16V4m0 0L8 8m4-4 4 4M5 15v4h14v-4"
                                                />
                                            </svg>
                                        </div>

                                        <p className="mt-3 text-[14px] font-semibold">
                                            Materyal
                                        </p>

                                        <p className="text-[12px] text-[#94A3B8] mt-1">
                                            Yükle
                                        </p>
                                    </div>

                                    {/* Öğren */}
                                    <div className="flex flex-col items-center text-center">
                                        <div className="w-[50px] h-[50px] rounded-[12px] bg-[#ECFEFF] border border-[#A5F3FC] flex items-center justify-center shadow-sm">
                                            <SparklesIcon className="w-5 h-5 text-[#06B6D4]" />
                                        </div>

                                        <p className="mt-3 text-[14px] font-semibold">
                                            Öğren
                                        </p>

                                        <p className="text-[12px] text-[#06B6D4] font-medium mt-1">
                                            AI desteği
                                        </p>
                                    </div>

                                    {/* Test */}
                                    <div className="flex flex-col items-center text-center">
                                        <div className="w-[50px] h-[50px] rounded-[12px] bg-white border border-[#E2E8F0] flex items-center justify-center shadow-sm">
                                            <svg
                                                viewBox="0 0 24 24"
                                                fill="none"
                                                className="w-5 h-5 text-[#2563EB]"
                                                stroke="currentColor"
                                                strokeWidth="1.8"
                                            >
                                                <path
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                    d="M9 11l2 2 4-4M5 4h14v16H5V4z"
                                                />
                                            </svg>
                                        </div>

                                        <p className="mt-3 text-[14px] font-semibold">
                                            Test
                                        </p>

                                        <p className="text-[12px] text-[#94A3B8] mt-1">
                                            Kendini ölç
                                        </p>
                                    </div>

                                    {/* Gelişim */}
                                    <div className="flex flex-col items-center text-center">
                                        <div className="w-[50px] h-[50px] rounded-[12px] bg-white border border-[#E2E8F0] flex items-center justify-center shadow-sm">
                                            <ChartBarIcon className="w-5 h-5 text-[#2563EB]" />
                                        </div>

                                        <p className="mt-3 text-[14px] font-semibold">
                                            Gelişim
                                        </p>

                                        <p className="text-[12px] text-[#94A3B8] mt-1">
                                            Takip et
                                        </p>
                                    </div>

                                </div>
                            </div>
                        </div>

                        {/* Açıklama */}
                        <div className="mt-12 flex items-start gap-3 border-l-[3px] border-[#06B6D4] pl-4">
                            <SparklesIcon className="w-5 h-5 text-[#06B6D4] shrink-0 mt-0.5" />

                            <div>
                                <p className="text-[15px] font-semibold text-[#0F172A]">
                                    Sana göre şekillenen bir öğrenme süreci
                                </p>

                                <p className="text-[14px] leading-6 text-[#64748B] mt-1 max-w-[520px]">
                                    StudyAI, çalışma sonuçlarını kullanarak güçlü ve
                                    geliştirilmesi gereken konularını belirlemene yardımcı olur.
                                </p>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Alt */}
                <div className="relative z-10 border-t border-[#E2E8F0] pt-5">
                    <p className="text-[14px] text-[#64748B]">
                        Öğrenmek isteyen herkes için kişiselleştirilmiş çalışma deneyimi.
                    </p>
                </div>
            </section>

        </main>
    );
}

export default Giris;
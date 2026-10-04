import { useState } from "react";
import { Link } from "react-router-dom";
import {
    ArrowRightIcon,
    BookOpenIcon,
    CheckIcon,
    EnvelopeIcon,
    EyeIcon,
    EyeSlashIcon,
    LockClosedIcon,
    SparklesIcon,
    UserIcon,
} from "@heroicons/react/24/outline";

function Kayit() {
    const [sifreGoster, setSifreGoster] = useState(false);
    const [sifreTekrarGoster, setSifreTekrarGoster] = useState(false);

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
                    <div className="mt-10 lg:mt-12">
                        <h1 className="text-[32px] lg:text-[36px] leading-tight font-semibold tracking-tight text-[#0F172A]">
                            Hesabını oluştur
                        </h1>

                        <p className="text-base leading-7 text-[#64748B] mt-3 max-w-[470px]">
                            StudyAI hesabını oluştur ve öğrenme sürecini kendi ihtiyaçlarına
                            göre düzenlemeye başla.
                        </p>
                    </div>

                    {/* Form */}
                    <form
                        className="mt-7 space-y-4"
                        onSubmit={(e) => e.preventDefault()}
                    >

                        {/* Kullanıcı Adı */}
                        <div>
                            <label
                                htmlFor="kullaniciAdi"
                                className="block text-[15px] font-semibold text-[#0F172A] mb-2"
                            >
                                Kullanıcı Adı
                            </label>

                            <div className="relative">
                                <UserIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />

                                <input
                                    id="kullaniciAdi"
                                    name="kullaniciAdi"
                                    type="text"
                                    required
                                    minLength={3}
                                    placeholder="Kullanıcı adını gir"
                                    className="w-full h-[50px] pl-12 pr-4 bg-white border border-[#E2E8F0] rounded-[10px] text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#2563EB] focus:ring-3 focus:ring-[#2563EB]/10"
                                />
                            </div>
                        </div>

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
                                htmlFor="sifre"
                                className="block text-[15px] font-semibold text-[#0F172A] mb-2"
                            >
                                Şifre
                            </label>

                            <div className="relative">
                                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />

                                <input
                                    id="sifre"
                                    name="sifre"
                                    type={sifreGoster ? "text" : "password"}
                                    required
                                    minLength={6}
                                    placeholder="En az 6 karakter"
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

                        {/* Şifre Tekrar */}
                        <div>
                            <label
                                htmlFor="sifreTekrar"
                                className="block text-[15px] font-semibold text-[#0F172A] mb-2"
                            >
                                Şifre Tekrar
                            </label>

                            <div className="relative">
                                <LockClosedIcon className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-[#64748B]" />

                                <input
                                    id="sifreTekrar"
                                    name="sifreTekrar"
                                    type={sifreTekrarGoster ? "text" : "password"}
                                    required
                                    minLength={6}
                                    placeholder="Şifreni tekrar gir"
                                    className="w-full h-[50px] pl-12 pr-12 bg-white border border-[#E2E8F0] rounded-[10px] text-[15px] text-[#0F172A] placeholder:text-[#94A3B8] outline-none transition focus:border-[#2563EB] focus:ring-3 focus:ring-[#2563EB]/10"
                                />

                                <button
                                    type="button"
                                    onClick={() =>
                                        setSifreTekrarGoster(!sifreTekrarGoster)
                                    }
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A] transition"
                                    aria-label="Şifre tekrarını göster veya gizle"
                                >
                                    {sifreTekrarGoster ? (
                                        <EyeSlashIcon className="w-5 h-5" />
                                    ) : (
                                        <EyeIcon className="w-5 h-5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Şifre Bilgisi */}
                        <p className="text-[13px] leading-5 text-[#64748B]">
                            Şifren en az 6 karakterden oluşmalıdır.
                        </p>

                        {/* Kayıt Butonu */}
                        <button
                            type="submit"
                            className="w-full h-[50px] flex items-center justify-center gap-2 rounded-[9px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[15px] font-semibold transition active:scale-[0.99] group"
                        >
                            Hesap Oluştur

                            <ArrowRightIcon className="w-5 h-5 transition-transform group-hover:translate-x-0.5" />
                        </button>
                    </form>

                    {/* Giriş */}
                    <p className="text-center text-[15px] text-[#64748B] mt-7">
                        Zaten hesabın var mı?

                        <Link
                            to="/"
                            className="font-semibold text-[#2563EB] hover:underline ml-1.5"
                        >
                            Giriş Yap
                        </Link>
                    </p>
                </div>

                <footer className="w-full max-w-[520px] mx-auto mt-8 pt-5 border-t border-[#E2E8F0]">
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
                            Kişiselleştirilmiş Öğrenme
                        </span>
                    </div>
                </div>

                {/* İçerik */}
                <div className="relative z-10 flex-1 flex items-center">
                    <div className="w-full max-w-[620px] mx-auto">

                        <p className="text-[15px] font-semibold text-[#2563EB] mb-3">
                            StudyAI
                        </p>

                        <h2 className="text-[34px] xl:text-[40px] leading-[1.18] font-semibold tracking-tight text-[#0B1739] max-w-[580px]">
                            Kendi öğrenme alanını oluştur.
                        </h2>

                        <p className="mt-5 text-[16px] xl:text-[17px] leading-7 text-[#64748B] max-w-[550px]">
                            Derslerini ve materyallerini düzenle. Öğrendiklerini test et
                            ve çalışma sürecini ihtiyaçlarına göre geliştir.
                        </p>

                        {/* Özellikler */}
                        <div className="mt-10 space-y-3">

                            <div className="flex items-center gap-4 bg-white border border-[#E2E8F0] rounded-[12px] px-5 py-4">
                                <div className="w-9 h-9 rounded-[9px] bg-[#EFF6FF] flex items-center justify-center shrink-0">
                                    <CheckIcon className="w-5 h-5 text-[#2563EB]" />
                                </div>

                                <div>
                                    <p className="text-[15px] font-semibold text-[#0F172A]">
                                        Derslerini düzenle
                                    </p>

                                    <p className="text-[14px] text-[#64748B] mt-0.5">
                                        Çalışmalarını ders bazında tek yerde yönet.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 bg-white border border-[#E2E8F0] rounded-[12px] px-5 py-4">
                                <div className="w-9 h-9 rounded-[9px] bg-[#ECFEFF] flex items-center justify-center shrink-0">
                                    <SparklesIcon className="w-5 h-5 text-[#06B6D4]" />
                                </div>

                                <div>
                                    <p className="text-[15px] font-semibold text-[#0F172A]">
                                        Materyallerinden öğren
                                    </p>

                                    <p className="text-[14px] text-[#64748B] mt-0.5">
                                        İçeriklerini öğrenme araçlarıyla daha verimli kullan.
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4 bg-white border border-[#E2E8F0] rounded-[12px] px-5 py-4">
                                <div className="w-9 h-9 rounded-[9px] bg-[#EFF6FF] flex items-center justify-center shrink-0">
                                    <CheckIcon className="w-5 h-5 text-[#2563EB]" />
                                </div>

                                <div>
                                    <p className="text-[15px] font-semibold text-[#0F172A]">
                                        Gelişimini takip et
                                    </p>

                                    <p className="text-[14px] text-[#64748B] mt-0.5">
                                        Güçlü ve geliştirilmesi gereken konularını gör.
                                    </p>
                                </div>
                            </div>

                        </div>

                        {/* Alt Bilgi */}
                        <div className="mt-9 border-l-[3px] border-[#06B6D4] pl-4">
                            <p className="text-[15px] font-semibold text-[#0F172A]">
                                Her öğrenme süreci farklıdır.
                            </p>

                            <p className="text-[14px] leading-6 text-[#64748B] mt-1">
                                StudyAI, çalışma sürecini ilerledikçe sana göre
                                kişiselleştirmeyi amaçlar.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Alt */}
                <div className="relative z-10 border-t border-[#E2E8F0] pt-5">
                    <p className="text-[14px] text-[#64748B]">
                        Öğrenmek isteyen herkes için tasarlandı.
                    </p>
                </div>
            </section>

        </main>
    );
}

export default Kayit;
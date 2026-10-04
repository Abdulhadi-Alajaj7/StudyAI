import { Link } from "react-router-dom";
import {
    ArrowLeftIcon,
    BookOpenIcon,
    EnvelopeIcon,
    LockClosedIcon,
} from "@heroicons/react/24/outline";

function SifremiUnuttum() {
    return (
        <main className="min-h-screen bg-[#F7F9FC] flex items-center justify-center px-6">
            <div className="w-full max-w-[460px]">

                <div className="flex justify-center mb-8">
                    <div className="flex items-center gap-3">
                        <div className="w-11 h-11 rounded-[10px] bg-[#0B1739] flex items-center justify-center">
                            <BookOpenIcon className="w-6 h-6 text-white" />
                        </div>

                        <div>
                            <p className="text-[22px] font-bold text-[#0B1739]">
                                StudyAI
                            </p>

                            <p className="text-sm text-[#64748B]">
                                Akıllı Öğrenme Platformu
                            </p>
                        </div>
                    </div>
                </div>

                <div className="bg-white border border-[#E2E8F0] rounded-[16px] p-7 sm:p-9">
                    <div className="w-12 h-12 rounded-[12px] bg-[#EFF6FF] flex items-center justify-center mb-6">
                        <LockClosedIcon className="w-6 h-6 text-[#2563EB]" />
                    </div>

                    <h1 className="text-[28px] font-semibold tracking-tight text-[#0F172A]">
                        Şifreni mi unuttun?
                    </h1>

                    <p className="text-[15px] leading-6 text-[#64748B] mt-3">
                        Hesabına bağlı e-posta adresini gir. Şifreni yenilemek için
                        gerekli adımları sana göndereceğiz.
                    </p>

                    <form
                        className="mt-7"
                        onSubmit={(e) => e.preventDefault()}
                    >
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
                                type="email"
                                required
                                placeholder="ornek@email.com"
                                className="w-full h-[50px] pl-12 pr-4 border border-[#E2E8F0] rounded-[10px] text-[15px] outline-none transition focus:border-[#2563EB] focus:ring-3 focus:ring-[#2563EB]/10"
                            />
                        </div>

                        <button
                            type="submit"
                            className="w-full h-[50px] mt-5 rounded-[9px] bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-[15px] font-semibold transition"
                        >
                            Sıfırlama Bağlantısı Gönder
                        </button>
                    </form>

                    <Link
                        to="/"
                        className="mt-6 flex items-center justify-center gap-2 text-[14px] font-semibold text-[#64748B] hover:text-[#2563EB] transition"
                    >
                        <ArrowLeftIcon className="w-4 h-4" />
                        Giriş sayfasına dön
                    </Link>
                </div>
            </div>
        </main>
    );
}

export default SifremiUnuttum;
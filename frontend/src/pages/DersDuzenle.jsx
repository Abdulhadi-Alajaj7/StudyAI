import { useEffect, useState } from "react";
import {
    useNavigate,
    useOutletContext,
    useParams,
    useSearchParams,
} from "react-router-dom";
import {
    ArrowLeftIcon,
    CheckIcon,
    PencilSquareIcon,
} from "@heroicons/react/24/outline";

import api from "../api";
import DersKarti from "../components/DersKarti";
import { DERS_RENKLERI, DERS_SIMGELERI } from "../utils/dersGorunumu";
import { dersDetayYolu, gecerliDersKimligiMi } from "../utils/dersDetayYollari.mjs";

function DersDuzenle() {
    const { isDark } = useOutletContext();
    const { dersId } = useParams();
    const [aramaParametreleri] = useSearchParams();
    const navigate = useNavigate();
    const [form, setForm] = useState(null);
    const [yukleniyor, setYukleniyor] = useState(true);
    const [kaydediliyor, setKaydediliyor] = useState(false);
    const [hata, setHata] = useState("");

    const detaydanGeldi = aramaParametreleri.get("donus") === "detay";
    const geriDonusYolu = detaydanGeldi ? dersDetayYolu(dersId) : "/panel/dersler";

    useEffect(() => {
        const controller = new AbortController();

        const dersiGetir = async () => {
            if (!gecerliDersKimligiMi(dersId)) {
                setHata("Geçersiz ders bağlantısı.");
                setYukleniyor(false);
                return;
            }

            try {
                const yanit = await api.get(`/dersler/${dersId}`, {
                    withCredentials: true,
                    signal: controller.signal,
                });
                const ders = yanit.data.ders;
                if (!ders) {
                    setHata("Ders bulunamadı.");
                    return;
                }
                setForm({
                    _id: ders._id,
                    dersAdi: ders.dersAdi || "",
                    aciklama: ders.aciklama || "",
                    donem: ders.donem || "",
                    dersKodu: ders.dersKodu || "",
                    renk: ders.renk || "indigo",
                    simge: ders.simge || "desktop",
                    materyalSayisi: ders.materyalSayisi || 0,
                });
            } catch (istekHatasi) {
                if (istekHatasi.code === "ERR_CANCELED") return;
                setHata(
                    istekHatasi.response?.data?.hata ||
                    "Ders bilgileri yüklenirken bir hata oluştu."
                );
            } finally {
                if (!controller.signal.aborted) setYukleniyor(false);
            }
        };

        dersiGetir();
        return () => controller.abort();
    }, [dersId]);

    const kaydet = async (event) => {
        event.preventDefault();
        if (!form || kaydediliyor) return;

        setKaydediliyor(true);
        setHata("");
        try {
            const payload = {
                dersAdi: form.dersAdi.trim(),
                aciklama: form.aciklama.trim(),
                donem: form.donem.trim(),
                dersKodu: form.dersKodu.trim(),
                renk: form.renk,
                simge: form.simge,
            };
            const yanit = await api.put(`/dersler/${dersId}`, payload, { withCredentials: true });
            const guncelDers = { ...form, ...yanit.data.ders };
            navigate(geriDonusYolu, {
                replace: true,
                state: detaydanGeldi ? { ders: guncelDers } : null,
            });
        } catch (istekHatasi) {
            setHata(istekHatasi.response?.data?.hata || "Ders güncellenirken bir hata oluştu.");
        } finally {
            setKaydediliyor(false);
        }
    };

    const iptalEt = () => navigate(geriDonusYolu, { replace: true });
    const metinAna = isDark ? "text-[#F8FAFC]" : "text-[#0F172A]";
    const metinIkincil = isDark ? "text-[#A7B0C2]" : "text-[#64748B]";
    const kart = isDark ? "border-[#26334A] bg-[#10192C]" : "border-[#E7E5EF] bg-white";
    const input = isDark
        ? "border-[#26334A] bg-[#0B1120] text-[#F8FAFC] placeholder:text-[#667085]"
        : "border-[#D8D5E2] bg-white text-[#0F172A] placeholder:text-[#94A3B8]";

    if (yukleniyor) {
        return (
            <div className="flex min-h-[420px] items-center justify-center" role="status">
                <div className="flex flex-col items-center gap-3">
                    <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-[#4F46E5]/20 border-t-[#4F46E5]" />
                    <p className={`text-sm font-medium ${metinIkincil}`}>Ders bilgileri yükleniyor...</p>
                </div>
            </div>
        );
    }

    if (!form) {
        return (
            <div className="mx-auto max-w-[900px] rounded-2xl border border-red-500/20 bg-red-500/5 p-6 text-center">
                <p className="font-medium text-red-500">{hata || "Ders bulunamadı."}</p>
                <button type="button" onClick={iptalEt} className="mt-4 rounded-xl bg-[#4F46E5] px-5 py-2.5 text-sm font-semibold text-white">
                    Geri Dön
                </button>
            </div>
        );
    }

    return (
        <div className="mx-auto max-w-[1200px] pb-10">
            <div className="mb-7 flex items-start gap-3">
                <button
                    type="button"
                    onClick={iptalEt}
                    aria-label="Düzenleme ekranından çık"
                    className={`mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${kart}`}
                >
                    <ArrowLeftIcon className="h-5 w-5" />
                </button>
                <div>
                    <h1 className={`text-[28px] font-bold tracking-tight sm:text-[36px] ${metinAna}`}>Dersi Düzenle</h1>
                    <p className={`mt-1 text-[14px] sm:text-[15px] ${metinIkincil}`}>
                        Ders bilgilerini ve kart görünümünü güncelle.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-7 lg:grid-cols-12">
                <form onSubmit={kaydet} className={`rounded-2xl border p-5 sm:p-7 lg:col-span-8 ${kart}`}>
                    <div className={`mb-6 flex items-center gap-3 border-b pb-5 ${isDark ? "border-[#26334A]" : "border-[#E7E5EF]"}`}>
                        <PencilSquareIcon className="h-6 w-6 text-[#4F46E5]" />
                        <h2 className={`text-[19px] font-bold ${metinAna}`}>Ders Bilgileri</h2>
                    </div>

                    {hata && (
                        <div className="mb-5 rounded-xl border border-red-500/20 bg-red-500/5 p-4 text-sm text-red-500">
                            {hata}
                        </div>
                    )}

                    <div className="space-y-5">
                        <div>
                            <label htmlFor="ders-adi" className={`mb-1.5 block text-sm font-medium ${metinAna}`}>Ders Adı</label>
                            <input
                                id="ders-adi"
                                required
                                value={form.dersAdi}
                                onChange={(event) => setForm({ ...form, dersAdi: event.target.value })}
                                className={`w-full rounded-xl border px-4 py-3 outline-none transition focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20 ${input}`}
                            />
                        </div>

                        <div>
                            <div className="mb-1.5 flex justify-between gap-3">
                                <label htmlFor="ders-aciklamasi" className={`text-sm font-medium ${metinAna}`}>Ders Açıklaması</label>
                                <span className={`text-xs ${metinIkincil}`}>{form.aciklama.length} / 300</span>
                            </div>
                            <textarea
                                id="ders-aciklamasi"
                                rows="4"
                                maxLength="300"
                                value={form.aciklama}
                                onChange={(event) => setForm({ ...form, aciklama: event.target.value })}
                                className={`w-full resize-none rounded-xl border px-4 py-3 outline-none transition focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20 ${input}`}
                            />
                        </div>

                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <div>
                                <label htmlFor="ders-donemi" className={`mb-1.5 block text-sm font-medium ${metinAna}`}>Ders Dönemi</label>
                                <input
                                    id="ders-donemi"
                                    value={form.donem}
                                    onChange={(event) => setForm({ ...form, donem: event.target.value })}
                                    className={`w-full rounded-xl border px-4 py-3 outline-none transition focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20 ${input}`}
                                />
                            </div>
                            <div>
                                <label htmlFor="ders-kodu" className={`mb-1.5 block text-sm font-medium ${metinAna}`}>Ders Kodu</label>
                                <input
                                    id="ders-kodu"
                                    value={form.dersKodu}
                                    onChange={(event) => setForm({ ...form, dersKodu: event.target.value })}
                                    className={`w-full rounded-xl border px-4 py-3 outline-none transition focus:border-[#4F46E5] focus:ring-2 focus:ring-[#4F46E5]/20 ${input}`}
                                />
                            </div>
                        </div>

                        <fieldset className={`rounded-xl border p-4 sm:p-5 ${isDark ? "border-[#26334A] bg-[#0B1120]/50" : "border-[#E7E5EF] bg-[#F8F7FC]"}`}>
                            <legend className={`px-1 text-sm font-semibold ${metinAna}`}>Ders Görünümü</legend>

                            <p className={`mb-3 mt-1 text-[13px] ${metinIkincil}`}>Ders rengi</p>
                            <div className="flex flex-wrap gap-3">
                                {DERS_RENKLERI.map((renk) => (
                                    <button
                                        key={renk.id}
                                        type="button"
                                        aria-label={`${renk.etiket} ders rengini seç`}
                                        aria-pressed={form.renk === renk.id}
                                        onClick={() => setForm({ ...form, renk: renk.id })}
                                        className={`flex h-10 w-10 items-center justify-center rounded-full ${renk.secim} transition ${
                                            form.renk === renk.id
                                                ? `ring-2 ring-[#4F46E5] ring-offset-2 ${isDark ? "ring-offset-[#0B1120]" : "ring-offset-white"}`
                                                : "opacity-75 hover:opacity-100"
                                        }`}
                                    >
                                        {form.renk === renk.id && <CheckIcon className="h-5 w-5 text-white" />}
                                    </button>
                                ))}
                            </div>

                            <p className={`mb-3 mt-6 text-[13px] ${metinIkincil}`}>Ders simgesi</p>
                            <div className="grid grid-cols-3 gap-2 sm:flex sm:flex-wrap sm:gap-3">
                                {DERS_SIMGELERI.map((simge) => {
                                    const Simge = simge.icon;
                                    const secili = form.simge === simge.id;
                                    return (
                                        <button
                                            key={simge.id}
                                            type="button"
                                            aria-pressed={secili}
                                            onClick={() => setForm({ ...form, simge: simge.id })}
                                            className={`flex min-h-20 flex-col items-center justify-center rounded-xl border px-2 text-center transition sm:w-20 ${
                                                secili
                                                    ? "border-[#4F46E5] bg-[#4F46E5]/10 text-[#4F46E5]"
                                                    : `${isDark ? "border-[#26334A] text-[#A7B0C2]" : "border-[#D8D5E2] text-[#64748B]"} hover:border-[#4F46E5]/60`
                                            }`}
                                        >
                                            <Simge className="mb-1.5 h-6 w-6" />
                                            <span className="text-[11px] font-medium">{simge.etiket}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </fieldset>
                    </div>

                    <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                        <button type="button" onClick={iptalEt} className={`h-11 rounded-xl border px-5 font-semibold ${kart}`}>
                            İptal
                        </button>
                        <button
                            type="submit"
                            disabled={kaydediliyor || !form.dersAdi.trim()}
                            className="h-11 rounded-xl bg-[#4F46E5] px-6 font-semibold text-white transition hover:bg-[#4338CA] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                            {kaydediliyor ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}
                        </button>
                    </div>
                </form>

                <aside className="lg:col-span-4">
                    <div className="lg:sticky lg:top-28">
                        <h2 className={`mb-1 text-[18px] font-bold ${metinAna}`}>Kart Önizlemesi</h2>
                        <p className={`mb-4 text-[13px] ${metinIkincil}`}>Değişiklikler kaydetmeden önce burada görünür.</p>
                        <DersKarti ders={form} isDark={isDark} isMenuOpen={false} />
                    </div>
                </aside>
            </div>
        </div>
    );
}

export default DersDuzenle;

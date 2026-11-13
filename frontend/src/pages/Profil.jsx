import { createElement, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useOutletContext } from "react-router-dom";
import { EnvelopeIcon, UserIcon, LockClosedIcon, ArrowRightStartOnRectangleIcon } from "@heroicons/react/24/outline";
import authApi from "../services/authApi.mjs";
import { basHarfler, yeniSifreHatasi } from "../utils/authYardimcilari.mjs";
import { kullaniciHataMesaji } from "../utils/kullaniciHatasi.mjs";
import SifreAlani from "../components/SifreAlani.jsx";

function Bolum({ icon, baslik, aciklama, tema, ikincil, children }) {
    return <section className={`rounded-xl border p-5 sm:p-7 ${tema}`}>
        <div className="mb-6 flex items-center gap-3"><span className="rounded-xl bg-violet-500/10 p-2 text-violet-400">{createElement(icon, { className: "h-6 w-6" })}</span>
            <div><h2 className="text-lg font-semibold">{baslik}</h2><p className={`mt-1 text-sm ${ikincil}`}>{aciklama}</p></div></div>{children}</section>;
}
const ilkSifre = { mevcutSifre: "", yeniSifre: "", yeniSifreTekrar: "" };
const profilFormu = k => ({ kullaniciAdi: k.kullaniciAdi, email: k.bekleyenEmail || k.email });
export default function Profil() {
    const { isDark, kullaniciGuncelle } = useOutletContext();
    const navigate = useNavigate();
    const [kullanici, setKullanici] = useState(null), [form, setForm] = useState({ kullaniciAdi: "", email: "" });
    const [sifre, setSifre] = useState(ilkSifre);
    const [hata, setHata] = useState(""), [mesaj, setMesaj] = useState("");
    const [sifreHata, setSifreHata] = useState(""), [sifreMesaj, setSifreMesaj] = useState("");
    const [mesgul, setMesgul] = useState(""), [yukleniyor, setYukleniyor] = useState(true);
    const [yenileme, setYenileme] = useState(0), [girisGerekli, setGirisGerekli] = useState(false);
    const kilit = useRef(false);
    useEffect(() => {
        const c = new AbortController();
        authApi.profil(c.signal).then(r => {
            if (c.signal.aborted) return;
            const k = r.data.kullanici; setKullanici(k); setForm(profilFormu(k)); kullaniciGuncelle?.(k); setHata("");
        }).catch(e => { if (!c.signal.aborted) setHata(kullaniciHataMesaji(e)); })
            .finally(() => { if (!c.signal.aborted) setYukleniyor(false); });
        return () => c.abort();
    }, [kullaniciGuncelle, yenileme]);
    const tema = isDark ? "border-[#26334A] bg-[#111B2D]" : "border-[#E2E8F0] bg-white";
    const ikincil = isDark ? "text-slate-400" : "text-slate-500";
    const input = `h-11 w-full rounded-lg border px-4 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-500/15 ${isDark ? "border-[#465879] bg-[#0C1525] text-slate-100" : "border-slate-300 bg-white text-slate-900"}`;
    const buton = "rounded-lg bg-gradient-to-r from-[#6350F5] to-[#4F3FEF] px-5 py-3 text-sm font-semibold text-white transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-violet-400 disabled:cursor-not-allowed disabled:opacity-50";
    const iptal = () => { setForm(profilFormu(kullanici)); setHata(""); setMesaj(""); setGirisGerekli(false); };
    const kaydet = async e => {
        e.preventDefault(); if (kilit.current) return;
        kilit.current = true; setMesgul("profil"); setHata(""); setMesaj(""); setGirisGerekli(false);
        try {
            const r = await authApi.profilKaydet({ kullaniciAdi: form.kullaniciAdi.trim(), email: form.email.trim() });
            setKullanici(r.data.kullanici); kullaniciGuncelle?.(r.data.kullanici); setForm(profilFormu(r.data.kullanici));
            setMesaj(r.data.mesaj || "Kişisel bilgileriniz güncellendi.");
        } catch (err) { setHata(kullaniciHataMesaji(err)); setGirisGerekli(err.response?.status === 401); }
        finally { kilit.current = false; setMesgul(""); }
    };
    const sifreKaydet = async e => {
        e.preventDefault(); if (kilit.current) return;
        setSifreHata(""); setSifreMesaj(""); const sorun = yeniSifreHatasi(sifre.yeniSifre, sifre.yeniSifreTekrar);
        if (sorun) { setSifreHata(sorun); return; }
        kilit.current = true; setMesgul("sifre");
        try {
            const r = await authApi.sifreDegistir(sifre); setSifre(ilkSifre); setSifreMesaj(r.data.mesaj);
            setKullanici(k => ({ ...k, bekleyenEmail: undefined })); setForm(f => ({ ...f, email: kullanici.email }));
        } catch (err) { setSifreHata(kullaniciHataMesaji(err)); }
        finally { kilit.current = false; setMesgul(""); }
    };
    const cikis = async () => {
        if (kilit.current) return; kilit.current = true; setMesgul("cikis"); setHata("");
        try { await authApi.cikis(); navigate("/", { replace: true }); }
        catch (err) { setHata(kullaniciHataMesaji(err)); }
        finally { kilit.current = false; setMesgul(""); }
    };
    return <div className={`mx-auto max-w-[1000px] ${isDark ? "text-slate-100" : "text-slate-900"}`}>
        <h1 className="text-2xl font-semibold">Profil</h1><p className={`mb-7 mt-2 ${ikincil}`}>Hesap bilgilerini ve şifreni yönet.</p>
        {yukleniyor ? <p role="status">Profil yükleniyor...</p> : !kullanici ? <div role="alert"><p>{hata}</p>
            <button className={buton} onClick={() => { setYukleniyor(true); setYenileme(v => v + 1); }}>Yeniden Dene</button><Link to="/" className="ml-4 underline">Giriş Yap</Link></div> : <div className="space-y-6">
            <div className={`flex items-center gap-5 rounded-xl border p-6 sm:p-7 ${tema}`}>
                <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border-4 border-violet-400/25 bg-violet-500/20 text-2xl font-bold text-violet-400">{basHarfler(kullanici.kullaniciAdi)}</div>
                <div className="min-w-0"><p className="text-xl font-semibold break-words">{kullanici.kullaniciAdi}</p>
                    <p className={`mt-2 flex items-center gap-2 text-sm ${ikincil}`}><EnvelopeIcon className="h-5 w-5 shrink-0" /><span className="break-all">{kullanici.email}</span></p></div></div>
            <Bolum icon={UserIcon} baslik="Kişisel Bilgiler" aciklama="Hesap bilgilerini güncelleyebilirsin." tema={tema} ikincil={ikincil}>
                <form onSubmit={kaydet} className="space-y-4">
                    <div><label htmlFor="kullaniciAdi" className="mb-2 block text-sm font-medium">Kullanıcı Adı</label><input className={input} id="kullaniciAdi" autoComplete="nickname" required minLength={3} maxLength={100} value={form.kullaniciAdi} onChange={e => setForm({ ...form, kullaniciAdi: e.target.value })} disabled={!!mesgul} /></div>
                    <div><label htmlFor="email" className="mb-2 block text-sm font-medium">E-posta Adresi</label><input id="email" className={input} type="email" autoComplete="email" required maxLength={254} value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} disabled={!!mesgul} /></div>
                    {kullanici.bekleyenEmail && <p role="status" className="text-sm text-amber-500">{kullanici.bekleyenEmail} için doğrulama bekleniyor. Mevcut adresiniz korunuyor.</p>}
                    {hata && <p role="alert" className="text-sm text-red-500">{hata}</p>}
                    {girisGerekli && <Link to="/" className="text-sm text-violet-400 underline">Yeniden Giriş Yap</Link>}
                    {mesaj && <p role="status" className="text-sm text-emerald-500">{mesaj}</p>}
                    <div className="flex justify-end gap-3 pt-2"><button type="button" onClick={iptal} disabled={!!mesgul} className="rounded-lg border border-slate-500/30 bg-slate-400/10 px-5 py-3 text-sm disabled:opacity-50">İptal</button><button className={buton} disabled={!!mesgul}>{mesgul === "profil" ? "Kaydediliyor..." : "Değişiklikleri Kaydet"}</button></div>
                </form>
            </Bolum>
            <Bolum icon={LockClosedIcon} baslik="Şifre Değiştir" aciklama="Hesabının güvenliği için şifreni güncelleyebilirsin." tema={tema} ikincil={ikincil}>
                <form onSubmit={sifreKaydet} className="space-y-4">
                    {[["mevcutSifre", "Mevcut Şifre"], ["yeniSifre", "Yeni Şifre"], ["yeniSifreTekrar", "Yeni Şifre Tekrar"]].map(([id, baslik]) => <SifreAlani key={id} id={id} baslik={baslik} className={input} autoComplete={id === "mevcutSifre" ? "current-password" : "new-password"} value={sifre[id]} onChange={e => setSifre({ ...sifre, [id]: e.target.value })} disabled={!!mesgul} minLength={id === "mevcutSifre" ? undefined : 6} />)}
                    {sifreHata && <p role="alert" className="text-sm text-red-500">{sifreHata}</p>}{sifreMesaj && <p role="status" className="text-sm text-emerald-500">{sifreMesaj}</p>}
                    <div className="flex justify-end pt-2"><button className={buton} disabled={!!mesgul}>{mesgul === "sifre" ? "Güncelleniyor..." : "Şifreyi Güncelle"}</button></div>
                </form>
            </Bolum>
            <section className={`flex flex-wrap items-center justify-between gap-5 rounded-xl border p-5 sm:p-7 ${tema}`}>
                <div className="flex items-center gap-3"><span className="rounded-xl bg-violet-500/10 p-2 text-violet-400"><ArrowRightStartOnRectangleIcon className="h-6 w-6" /></span><div><h2 className="text-lg font-semibold">Oturumu Kapat</h2><p className={`mt-1 text-sm ${ikincil}`}>Mevcut oturumunu güvenli bir şekilde sonlandır.</p></div></div>
                <button onClick={cikis} disabled={!!mesgul} className="rounded-lg border border-slate-500 bg-slate-400/10 px-7 py-3 text-sm font-semibold disabled:opacity-50">{mesgul === "cikis" ? "Çıkış yapılıyor..." : "Çıkış Yap"}</button></section>
        </div>}
    </div>;
}

import nodemailer from "nodemailer";

export const epostaServisiOlustur = ({ env = process.env, transportOlustur = nodemailer.createTransport,
    logla = kod => console.error("[Eposta]", kod) } = {}) => {
    let transporter;
    const ayarlariGetir = () => {
        const user = env.EMAIL_USER?.trim(), pass = env.EMAIL_PASS?.trim();
        let url;
        try { url = new URL(env.CLIENT_URL); } catch { /* Ortak güvenli yapılandırma hatası. */ }
        const yerel = url && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
        if (!user || !pass || !url || url.username || url.password || url.search || url.hash ||
            (url.protocol !== "https:" && !(env.NODE_ENV !== "production" && yerel && url.protocol === "http:")) ||
            (env.SMTP_SECURE && env.SMTP_SECURE !== "true") || Number(env.SMTP_PORT || 465) !== 465) {
            throw Object.assign(new Error("E-posta servisi yapılandırılmamış."), { kod: "EPOSTA_YAPILANDIRMA", status: 503 });
        }
        return { user, pass, clientUrl: url.href.replace(/\/$/, "") };
    };
    const gonder = async ({ to, subject, text, html }) => {
        const ayar = ayarlariGetir();
        transporter ||= transportOlustur({ host: env.SMTP_HOST || "smtp.gmail.com", port: 465, secure: true,
            auth: { user: ayar.user, pass: ayar.pass }, tls: { rejectUnauthorized: true, minVersion: "TLSv1.2" },
            connectionTimeout: 5000, greetingTimeout: 5000, socketTimeout: 10000, logger: false, debug: false });
        try { await transporter.sendMail({ from: `"StudyAI" <${ayar.user}>`, to, subject, text, html }); }
        catch { throw Object.assign(new Error("E-posta gönderilemedi."), { kod: "EPOSTA_GONDERILEMEDI", status: 503 }); }
    };
    // SMTP süresi HTTP yanıtından ayrıdır; sınırlı kuyruk e-posta varlığını zamanlamayla açığa çıkarmaz.
    let aktif = false;
    const kuyruk = [];
    const isle = async () => {
        if (aktif) return;
        aktif = true;
        try {
            while (kuyruk.length) {
                const { mesaj, basarisiz } = kuyruk.shift();
                try { await gonder(mesaj); }
                catch { try { logla("EPOSTA_GONDERILEMEDI"); } catch { /* Gizli veri loglanmaz. */ }
                    try { await basarisiz(); } catch { /* Yeni token koşullu temizleme ile korunur. */ } }
            }
        } finally { aktif = false; }
    };
    return { ayarlariGetir, gonder,
        sirayaAl(mesaj, basarisiz = async () => {}) {
            if (kuyruk.length >= 20) return false;
            kuyruk.push({ mesaj, basarisiz }); setImmediate(() => { void isle(); }); return true;
        },
    };
};
export const epostaServisi = epostaServisiOlustur();

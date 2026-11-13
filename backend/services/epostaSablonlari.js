const htmlKacir = metin => metin.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const markaliGuvenlikEpostasi = (link, { baslik, buton, aciklama, sure, not, konu }) => {
    const url = new URL(link);
    if (!["http:", "https:"].includes(url.protocol) || /[\r\n]/.test(link)) throw new Error("Geçersiz e-posta bağlantısı.");
    const guvenliLink = htmlKacir(link);
    const text = `StudyAI — Akıllı Öğrenme Platformu

${baslik}

Merhaba,

${aciklama}

${buton}: ${link}

Bu bağlantı ${sure} geçerlidir ve yalnızca bir kez kullanılabilir.

${not}

Buton çalışmazsa bağlantıyı kopyalayıp tarayıcınızın adres çubuğuna yapıştırın:
${link}

StudyAI • Otomatik güvenlik bildirimi`;
    const html = `<!doctype html>
<html lang="tr" dir="ltr">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>StudyAI — ${htmlKacir(konu)}</title></head>
<body style="margin:0;padding:0;background-color:#F2F4F8;font-family:Arial,Helvetica,sans-serif;color:#172443;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">StudyAI doğrulama bağlantınız ${sure} geçerlidir.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background-color:#F2F4F8;">
<tr><td align="center" style="padding:20px 12px;">
<!--[if mso]><table role="presentation" width="640" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:640px;background-color:#FFFFFF;border:1px solid #E2E8F0;border-radius:18px;border-spacing:0;overflow:hidden;">
<tr><td align="center" bgcolor="#101C3D" style="padding:28px 24px 24px;background-color:#101C3D;border-radius:17px 17px 0 0;">
    <p style="margin:0 0 8px;color:#FFFFFF;font-size:28px;line-height:36px;font-weight:700;">StudyAI <span aria-hidden="true" style="font-size:23px;font-weight:400;">&#128214;</span></p>
    <p style="margin:0;color:#CDD5E8;font-size:15px;line-height:24px;">Akıllı Öğrenme Platformu</p>
</td></tr>
<tr><td align="right" style="padding:28px 24px 0;">
    <h1 style="margin:0 0 20px;font-size:23px;line-height:32px;font-weight:700;color:#172443;text-align:right;">${baslik}</h1>
    <p style="margin:0 0 16px;font-size:15px;line-height:25px;color:#53627C;">Merhaba,</p>
    <p style="margin:0 0 22px;font-size:15px;line-height:25px;color:#53627C;">${htmlKacir(aciklama)}</p>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr><td align="center" bgcolor="#6348FA" style="border-radius:10px;background-color:#6348FA;mso-padding-alt:18px 20px;">
        <a href="${guvenliLink}" style="display:block;padding:18px 20px;border:1px solid #6348FA;border-radius:10px;background-color:#6348FA;color:#FFFFFF;font-size:18px;line-height:24px;font-weight:700;text-align:center;text-decoration:none;">${buton}</a>
    </td></tr></table>
    <p style="margin:20px 0 24px;font-size:14px;line-height:24px;color:#687B9C;">Bu bağlantı <strong>${sure}</strong> geçerlidir ve yalnızca bir kez kullanılabilir.</p>
</td></tr>
<tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid #DFE5EF;font-size:1px;line-height:1px;">&nbsp;</td></tr></table></td></tr>
<tr><td align="right" style="padding:22px 24px 24px;">
    <p style="margin:0 0 18px;font-size:14px;line-height:24px;color:#687B9C;">${not}</p>
    <p style="margin:0 0 8px;font-size:13px;line-height:22px;color:#687B9C;">Buton çalışmazsa aşağıdaki bağlantıyı kopyalayıp tarayıcınızın adres çubuğuna yapıştırın:</p>
    <p dir="ltr" style="margin:0;font-size:12px;line-height:21px;text-align:left;word-break:break-all;overflow-wrap:anywhere;">
        <a href="${guvenliLink}" style="color:#6348FA;text-decoration:underline;word-break:break-all;">${guvenliLink}</a>
    </p>
</td></tr>
<tr><td align="center" bgcolor="#F8FAFC" style="padding:16px 20px;background-color:#F8FAFC;border-radius:0 0 17px 17px;font-size:12px;line-height:20px;color:#687B9C;">&copy; StudyAI &bull; Otomatik güvenlik bildirimi</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
    return { html, text };
};


export const sifreSifirlamaEpostasi = link => markaliGuvenlikEpostasi(link, {
    baslik: "Şifrenizi Sıfırlayın", buton: "Şifremi Sıfırla", konu: "Şifre Sıfırlama", sure: "15 dakika",
    aciklama: "StudyAI hesabınız için şifre sıfırlama talebi aldık. Yeni bir şifre oluşturmak için aşağıdaki bağlantıyı kullanabilirsiniz.",
    not: "Bu talebi siz oluşturmadıysanız bu e-postayı dikkate almayabilirsiniz. Şifreniz değişmez.",
});
export const kayitDogrulamaEpostasi = link => markaliGuvenlikEpostasi(link, {
    baslik: "E-posta Adresinizi Doğrulayın", buton: "E-posta Adresimi Doğrula", konu: "Hesap Doğrulama", sure: "1 saat",
    aciklama: "StudyAI'ye hoş geldiniz. Hesabınızı aktifleştirmek için e-posta adresinizi aşağıdaki bağlantıdan doğrulayın. Kayıt anından itibaren 1 saat içinde doğrulayın; yeniden gönderim süreyi uzatmaz.",
    not: "Bu hesabı siz oluşturmadıysanız bu e-postayı dikkate almayabilirsiniz. Doğrulanmayan hesaplar 1 saat dolduktan sonra temizlenir.",
});

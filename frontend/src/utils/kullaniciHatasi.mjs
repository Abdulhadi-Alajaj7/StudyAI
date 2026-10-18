const teknikMesajCevirileri = [
    [/unexpected field/i, "Dosya yükleme alanı geçersiz. Lütfen sayfayı yenileyip tekrar deneyin."],
    [/internal server error/i, "İşlem sırasında bir sorun oluştu. Lütfen biraz sonra tekrar deneyin."],
    [/network error|failed to fetch|econnrefused/i, "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."],
    [/unauthorized|invalid token|jwt expired/i, "Oturumunuz sona ermiş olabilir. Lütfen tekrar giriş yapın."]
];

export const kullaniciHataMesaji = (
    hata,
    varsayilanMesaj = "İşlem sırasında bir sorun oluştu. Lütfen tekrar deneyin."
) => {
    if (!hata?.response) {
        return hata?.isAxiosError || hata?.code === "ERR_NETWORK"
            ? "Bağlantı kurulamadı. İnternet bağlantınızı kontrol edip tekrar deneyin."
            : varsayilanMesaj;
    }

    const durum = hata.response.status;
    if (durum === 401) {
        return "Oturumunuz sona ermiş olabilir. Lütfen tekrar giriş yapın.";
    }
    if (durum >= 500) {
        return "İşlem sırasında bir sorun oluştu. Lütfen biraz sonra tekrar deneyin.";
    }

    const sunucuMesaji =
        hata.response?.data?.hata ||
        hata.response?.data?.mesaj ||
        hata.response?.data?.message;
    if (typeof sunucuMesaji === "string" && sunucuMesaji.trim()) {
        for (const [desen, turkceMesaj] of teknikMesajCevirileri) {
            if (desen.test(sunucuMesaji)) return turkceMesaj;
        }
        return sunucuMesaji;
    }

    return varsayilanMesaj;
};

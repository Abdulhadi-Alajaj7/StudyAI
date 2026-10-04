import mongoose from "mongoose";

const veritabaninaBaglan = async () => {
  try {
    const baglanti = await mongoose.connect(process.env.MONGODB_URI);

    console.log(
      `MongoDB bağlantısı başarılı: ${baglanti.connection.host}`
    );
  } catch (hata) {
    console.error(`MongoDB bağlantı hatası: ${hata.message}`);
    process.exit(1);
  }
};

export default veritabaninaBaglan;
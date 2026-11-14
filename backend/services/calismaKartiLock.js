// Tek bir Gemini çağrısı en fazla 60 saniye sürer. Kilit bozuk süreçten sonra
// güvenli biçimde yeniden alınabilsin diye lease 2 dakikada bayatlar.
import mongoose from "mongoose";
export const kartKilidiniAl = async (Ders,kullaniciId,dersId,token) => Ders.findOneAndUpdate(
 {_id:dersId,kullaniciId,temizleniyor:{$ne:true},$or:[{kartUretimToken:null},{kartUretimSonYenileme:{$lt:new Date(Date.now()-2*60*1000)}}]},
 {$set:{kartUretimToken:token,kartUretimSonYenileme:new Date()}},{new:true});
export const kartKilidiniBirak = async (Ders,kullaniciId,dersId,token) => Ders.updateOne(
 {_id:dersId,kullaniciId,kartUretimToken:token},{$set:{kartUretimToken:null,kartUretimSonYenileme:null}});

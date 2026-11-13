import mongoose from "mongoose";
import Ders from "../models/Ders.js";
import KonuHaritasi from "../models/KonuHaritasi.js";
import Materyal from "../models/Materyal.js";
import MetinParcasi from "../models/MetinParcasi.js";
import CalismaKarti from "../models/CalismaKarti.js";
import { geminiIleCalismaKartlariUret } from "./geminiService.js";
import { konuIcinParcalariSirala } from "./testService.js";
import { dengeliOzetParcalariniSec } from "./dersOzetiService.js";
import { kartKilidiniAl,kartKilidiniBirak } from "./calismaKartiLock.js";
export class CalismaKartiHatasi extends Error {
 constructor(message,status=422,kod="KART_HATASI"){super(message);this.status=status;this.kod=kod;}
}
export const konuListesiOlustur=harita=>(harita?.anaKonular||[]).flatMap(ana=>{
 const altlar=ana.altKonular||[];
 return (altlar.length?altlar:[ana]).map(k=>({
  konuId:k.konuId,baslik:k.baslik,sorgu:[ana.baslik,ana.aciklama,k.baslik,k.aciklama].filter(Boolean).join(" "),
  kaynakMateryalIds:k.kaynakMateryalIds?.length?k.kaynakMateryalIds:(ana.kaynakMateryalIds||[])
 }));
});
export const makulKartSayisiniBelirle=({konuSayisi,karakterSayisi})=>{
 if(!konuSayisi||karakterSayisi<80)return 0;
 return Math.min(60,Math.max(1,Math.min(konuSayisi*4,Math.ceil(karakterSayisi/1100))));
};
export const konuKotalariniBelirle=(konular,hedef)=>{
 const secilen=konular.filter(k=>k.parcalar.length&&k.karakterSayisi>=80);
 const sayac=new Map(secilen.map(k=>[k.konuId,0]));
 for(let i=0;i<Math.min(60,hedef);i++){
  const sirali=[...secilen].filter(k=>sayac.get(k.konuId)<8).sort((a,b)=>
    sayac.get(a.konuId)/a.karakterSayisi-sayac.get(b.konuId)/b.karakterSayisi||
    a.konuId.localeCompare(b.konuId));
  if(!sirali.length)break;
  sayac.set(sirali[0].konuId,sayac.get(sirali[0].konuId)+1);
 }
 return secilen.map(k=>({...k,adet:sayac.get(k.konuId)})).filter(k=>k.adet);
};
const deps=d=>({
 DersModel:d.DersModel||Ders,HaritaModel:d.HaritaModel||KonuHaritasi,
 MateryalModel:d.MateryalModel||Materyal,ParcaModel:d.ParcaModel||MetinParcasi,
 KartModel:d.KartModel||CalismaKarti,uret:d.uret||geminiIleCalismaKartlariUret
});
const dersGetir=async(kullaniciId,dersId,d)=>{
 const ders=await d.DersModel.findOne({_id:dersId,kullaniciId,temizleniyor:{$ne:true}}).lean();
 if(!ders)throw new CalismaKartiHatasi("Ders bulunamadı veya yetkiniz yok.",404,"DERS_BULUNAMADI");
 return ders;
};
export const calismaKartlariniListele=async({kullaniciId,dersId},d={})=>{
 const x=deps(d);await dersGetir(kullaniciId,dersId,x);
 return x.KartModel.find({kullaniciId,dersId}).sort({createdAt:1,_id:1}).lean();
};
export const calismaKartlariniOlustur=async({kullaniciId,dersId},d={})=>{
 const x=deps(d),ders=await dersGetir(kullaniciId,dersId,x);
 if(!ders.materyallerOnaylandi)throw new CalismaKartiHatasi("Önce ders materyallerini onaylayın.");
 const mevcut=await x.KartModel.find({kullaniciId,dersId}).sort({createdAt:1,_id:1}).lean();
 if(mevcut.length)return mevcut;
 const token=new mongoose.Types.ObjectId();
 const kilit=await kartKilidiniAl(x.DersModel,kullaniciId,dersId,token);
 if(!kilit)throw new CalismaKartiHatasi("Kart oluşturma işlemi devam ediyor.",409,"KART_URETIM_DEVAM_EDIYOR");
 try{
  const kontrol=await x.KartModel.find({kullaniciId,dersId}).lean();
  if(kontrol.length)return kontrol;
  const harita=await x.HaritaModel.findOne({kullaniciId,dersId,durum:"hazir"}).lean();
  if(!harita?.anaKonular?.length)throw new CalismaKartiHatasi("Hazır konu haritası bulunamadı.");
  const materyaller=await x.MateryalModel.find({kullaniciId,dersId,durum:"hazir",aktifIslemeId:{$ne:null}}).lean();
  if(!materyaller.length)throw new CalismaKartiHatasi("İşlenmiş materyal bulunamadı.");
  const parcalar=await x.ParcaModel.find({kullaniciId,dersId,$or:materyaller.map(m=>({materyalId:m._id,islemeId:m.aktifIslemeId}))})
   .select("materyalId parcaIndex icerik").sort({materyalId:1,parcaIndex:1}).lean();
  if(!parcalar.length)throw new CalismaKartiHatasi("İşlenmiş materyal metni bulunamadı.");
  const konular=konuListesiOlustur(harita).map(k=>{
   const eslesen=konuIcinParcalariSirala(parcalar,k);
   return {...k,parcalar:eslesen,karakterSayisi:eslesen.reduce((s,p)=>s+String(p.icerik||"").length,0)};
  });
  const hedef=makulKartSayisiniBelirle({konuSayisi:konular.length,karakterSayisi:konular.reduce((s,k)=>s+k.karakterSayisi,0)});
  const kotalar=konuKotalariniBelirle(konular,hedef);
  if(!kotalar.length)throw new CalismaKartiHatasi("Konu ile eşleşen yeterli içerik bulunamadı.");
  const materyalAdlari=new Map(materyaller.map(m=>[String(m._id),m.orijinalDosyaAdi||m.dosyaAdi]));
  const sonuc=[],sorular=new Set();
  for(const konu of kotalar){
   const yenile=await x.DersModel.updateOne({_id:dersId,kullaniciId,kartUretimToken:token,temizleniyor:{$ne:true}},{$currentDate:{kartUretimSonYenileme:true}});
   if((yenile.matchedCount??yenile.n)!==1)throw new CalismaKartiHatasi("Kart üretim kilidi kaybedildi.",409);

   const kaynaklar=dengeliOzetParcalariniSec(konu.parcalar,18000).slice(0,20).map((p,i)=>({
    kod:"K"+(i+1),materyalId:p.materyalId,parcaIndex:p.parcaIndex,
    dosyaAdi:materyalAdlari.get(String(p.materyalId))||"Materyal",icerik:String(p.icerik||"").slice(0,4000)
   }));
   if(!kaynaklar.length)continue;
   const yanit=await x.uret({dersAdi:ders.dersAdi,konuBasligi:konu.baslik,adet:konu.adet,kaynaklar});
   const kodHaritasi=new Map(kaynaklar.map(k=>[k.kod,k]));
   for(const kart of yanit.kartlar||[]){
    const soru=String(kart.soru||"").trim().slice(0,1000);
    const cevap=String(kart.cevap||"").trim().slice(0,2000);
    const anahtar=soru.toLocaleLowerCase("tr-TR");
    const atiflar=[...new Set(kart.kaynakKodlari||[])].map(k=>kodHaritasi.get(k)).filter(Boolean);
    if(!soru||!cevap||!atiflar.length||sorular.has(anahtar))continue;
    sorular.add(anahtar);
    sonuc.push({kullaniciId,dersId,konuId:konu.konuId,konuBasligi:konu.baslik,soru,cevap,
     kaynaklar:atiflar.map(k=>({materyalId:k.materyalId,dosyaAdi:k.dosyaAdi,parcaIndex:k.parcaIndex}))});
    if(sonuc.length>=60)break;
   }
  }
  if(!sonuc.length)throw new CalismaKartiHatasi("Güvenilir kart üretilemedi.");
  const guncel=await x.MateryalModel.find({kullaniciId,dersId,durum:"hazir",aktifIslemeId:{$ne:null}}).lean();
  const versiyon=arr=>arr.map(m=>String(m._id)+":"+String(m.aktifIslemeId)).sort().join("|");
  if(versiyon(materyaller)!==versiyon(guncel))throw new CalismaKartiHatasi("Materyal değişti; yeniden deneyin.",409);
  const sahibi=await x.DersModel.findOne({_id:dersId,kullaniciId,kartUretimToken:token,temizleniyor:{$ne:true}}).lean();
  if(!sahibi)throw new CalismaKartiHatasi("Kart işlemi sahipliği kaybedildi.",409);
  await x.KartModel.insertMany(sonuc);
  return x.KartModel.find({kullaniciId,dersId}).sort({createdAt:1,_id:1}).lean();
 }finally{await kartKilidiniBirak(x.DersModel,kullaniciId,dersId,token);}
};
export const calismaKartiDurumuGuncelle=async({kullaniciId,dersId,kartId,goruldu,yildizli},d={})=>{
 const x=deps(d);await dersGetir(kullaniciId,dersId,x);
 const set={};if(typeof goruldu==="boolean")set.goruldu=goruldu;
 if(typeof yildizli==="boolean")set.yildizli=yildizli;
 if(!Object.keys(set).length)throw new CalismaKartiHatasi("Geçersiz kart durumu.",400);
 const kart=await x.KartModel.findOneAndUpdate({_id:kartId,kullaniciId,dersId},{$set:set},{new:true,runValidators:true}).lean();
 if(!kart)throw new CalismaKartiHatasi("Kart bulunamadı.",404);
 return kart;
};

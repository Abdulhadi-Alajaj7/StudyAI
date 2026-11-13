import mongoose from "mongoose";
import {calismaKartlariniListele,calismaKartlariniOlustur,calismaKartiDurumuGuncelle} from "../services/calismaKartiService.js";
const valid=id=>mongoose.Types.ObjectId.isValid(id);
const error=(res,e)=>res.status(e.status||500).json({hata:e.status?e.message:"Çalışma kartı işlemi tamamlanamadı.",kod:e.kod||"KART_SUNUCU_HATASI"});
export const kartlariGetir=async(req,res)=>{
 if(!valid(req.params.dersId))return res.status(400).json({hata:"Geçersiz ders kimliği."});
 try{return res.json({kartlar:await calismaKartlariniListele({kullaniciId:req.user._id,dersId:req.params.dersId})});}catch(e){return error(res,e);}
};
export const kartlariOlustur=async(req,res)=>{
 if(!valid(req.params.dersId))return res.status(400).json({hata:"Geçersiz ders kimliği."});
 try{return res.status(201).json({kartlar:await calismaKartlariniOlustur({kullaniciId:req.user._id,dersId:req.params.dersId})});}catch(e){return error(res,e);}
};
export const kartDurumunuGuncelle=async(req,res)=>{
 if(!valid(req.params.dersId)||!valid(req.params.kartId))return res.status(400).json({hata:"Geçersiz kimlik."});
 if(!req.body||(typeof req.body.goruldu!=="boolean"&&typeof req.body.yildizli!=="boolean"))return res.status(400).json({hata:"Geçersiz kart durumu."});
 try{return res.json({kart:await calismaKartiDurumuGuncelle({kullaniciId:req.user._id,dersId:req.params.dersId,kartId:req.params.kartId,goruldu:req.body.goruldu,yildizli:req.body.yildizli})});}catch(e){return error(res,e);}
};

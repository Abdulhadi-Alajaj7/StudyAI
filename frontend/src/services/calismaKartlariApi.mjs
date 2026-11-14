import api from "../api.js";
const id=s=>encodeURIComponent(String(s));
const options=signal=>({withCredentials:true,...(signal?{signal}:{})});
const calismaKartlariApi={
 listele:(dersId,signal)=>api.get(`/dersler/${id(dersId)}/calisma-kartlari`,options(signal)),
 olustur:(dersId,signal,azamiKonuSayisi=3)=>api.post(`/dersler/${id(dersId)}/calisma-kartlari`,{azamiKonuSayisi},options(signal)),
 durumuGuncelle:(dersId,kartId,body)=>api.patch(`/dersler/${id(dersId)}/calisma-kartlari/${id(kartId)}`,body,options())
};
export default calismaKartlariApi;

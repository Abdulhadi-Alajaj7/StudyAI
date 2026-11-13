import api from "../api.js";
const id=s=>encodeURIComponent(String(s));
const options=signal=>({withCredentials:true,...(signal?{signal}:{})});
const calismaKartlariApi={
 listele:(dersId,signal)=>api.get(`/dersler/${id(dersId)}/calisma-kartlari`,options(signal)),
 olustur:dersId=>api.post(`/dersler/${id(dersId)}/calisma-kartlari`,{},options()),
 durumuGuncelle:(dersId,kartId,body)=>api.patch(`/dersler/${id(dersId)}/calisma-kartlari/${id(kartId)}`,body,options())
};
export default calismaKartlariApi;

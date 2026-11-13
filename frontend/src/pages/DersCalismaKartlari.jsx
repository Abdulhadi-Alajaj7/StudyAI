import {useEffect,useMemo,useRef,useState} from "react";
import {useOutletContext,useParams} from "react-router-dom";
import {ArchiveBoxIcon,ArrowPathIcon,ChevronLeftIcon,ChevronRightIcon,ClockIcon,EyeIcon,SparklesIcon,StarIcon} from "@heroicons/react/24/outline";
import api from "../services/calismaKartlariApi.mjs";
import {kullaniciHataMesaji} from "../utils/kullaniciHatasi.mjs";

function DersCalismaKartlari(){
 const {isDark}=useOutletContext(),{dersId}=useParams();
 const [kartlar,setKartlar]=useState([]),[yukleniyor,setYukleniyor]=useState(true),[olusturuluyor,setOlusturuluyor]=useState(false);
 const [hata,setHata]=useState(""),[filtre,setFiltre]=useState("tum"),[konu,setKonu]=useState("tum"),[index,setIndex]=useState(0),[cevapAcik,setCevapAcik]=useState(false);
 const islemRef=useRef(false);
 const panel=isDark?"border-[#263653] bg-[#111D31]":"border-[#E2E8F0] bg-white";
 const metin=isDark?"text-[#F8FAFC]":"text-[#0F172A]",ikincil=isDark?"text-[#92A7C5]":"text-[#64748B]";
 useEffect(()=>{
  const controller=new AbortController();
  setYukleniyor(true);setHata("");setKartlar([]);setIndex(0);setCevapAcik(false);setKonu("tum");setFiltre("tum");
  api.listele(dersId,controller.signal).then(r=>setKartlar(r.data.kartlar||[]))
   .catch(e=>{if(!controller.signal.aborted)setHata(kullaniciHataMesaji(e,"Kartlar yüklenemedi."));})
   .finally(()=>{if(!controller.signal.aborted)setYukleniyor(false);});
  return ()=>controller.abort();
 },[dersId]);
 const konular=useMemo(()=>[...new Map(kartlar.map(k=>[k.konuId,k.konuBasligi])).entries()],[kartlar]);
 const filtrelenmis=useMemo(()=>kartlar.filter(k=>(konu==="tum"||k.konuId===konu)&&
  (filtre==="tum"||(filtre==="gorulmeyen"&&!k.goruldu)||(filtre==="gorulen"&&k.goruldu)||(filtre==="yildizli"&&k.yildizli))),[kartlar,konu,filtre]);
 const aktif=filtrelenmis[Math.min(index,Math.max(0,filtrelenmis.length-1))];
 const sayilar=[["Tüm Kartlar",kartlar.length],["Görülmeyen Kartlar",kartlar.filter(k=>!k.goruldu).length],
  ["Görülen Kartlar",kartlar.filter(k=>k.goruldu).length],["Yıldızlı Kartlar",kartlar.filter(k=>k.yildizli).length]];
 const olustur=async()=>{
  if(islemRef.current)return;islemRef.current=true;setOlusturuluyor(true);setHata("");
  try{const r=await api.olustur(dersId);setKartlar(r.data.kartlar||[]);setIndex(0);setCevapAcik(false);}
  catch(e){setHata(e.response?.data?.hata||kullaniciHataMesaji(e,"Kart oluşturulamadı."));}
  finally{islemRef.current=false;setOlusturuluyor(false);}
 };
 const durum=async girdi=>{
  if(!aktif)return;const id=aktif._id;
  try{const r=await api.durumuGuncelle(dersId,id,girdi);setKartlar(eski=>eski.map(k=>k._id===id?r.data.kart:k));}
  catch(e){setHata(e.response?.data?.hata||kullaniciHataMesaji(e,"Kart güncellenemedi."));}
 };
 const ileri=fark=>{setIndex(i=>Math.max(0,Math.min(filtrelenmis.length-1,i+fark)));setCevapAcik(false);};
 const filtreDegistir=deger=>{setFiltre(deger);setIndex(0);setCevapAcik(false);};
 return <section className={`space-y-6 ${metin}`}>
  <div className="flex flex-wrap items-center justify-between gap-4">
   <div className="flex items-center gap-4"><div className="rounded-2xl bg-violet-500/15 p-3"><ArchiveBoxIcon className="h-7 w-7 text-violet-400"/></div>
    <div><h2 className="text-[25px] font-bold">Çalışma Kartları</h2><p className={`text-[13px] ${ikincil}`}>Konularını hatırla, bilgini pekiştir.</p></div></div>
   <div className={`flex items-center gap-3 rounded-xl border px-5 py-3 ${panel}`}><ClockIcon className="h-5 w-5 text-violet-400"/>
    <div><p className="text-sm font-semibold">Bugünkü Tekrarlar</p><p className={`text-xs ${ikincil}`}>Tekrar planlaması henüz etkin değil.</p></div><span className="ml-3 text-[10px] font-bold text-sky-400">YAKINDA</span></div>
  </div>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">{sayilar.map(([etiket,sayi])=><div key={etiket} className={`rounded-2xl border p-5 ${panel}`}><p className={`text-xs ${ikincil}`}>{etiket}</p><p className="mt-2 text-3xl font-bold">{sayi}</p></div>)}</div>
  {hata&&<p role="alert" className="rounded-xl border border-rose-400/40 bg-rose-500/10 p-4 text-sm text-rose-400">{hata}</p>}
  {yukleniyor?<div className="py-14 text-center">Kartlar yükleniyor...</div>:!kartlar.length?
   <div className={`flex min-h-[380px] flex-col items-center justify-center rounded-2xl border p-8 text-center ${panel}`}>
    <ArchiveBoxIcon className="h-14 w-14 text-violet-400"/>
    <h3 className="mt-5 text-xl font-bold">Bilgilerini kartlarla kalıcı hâle getir</h3>
    <p className={`mt-3 max-w-lg text-sm leading-6 ${ikincil}`}>Onaylanmış konu haritanız ve ders materyallerinizden her konuya uygun soru ve cevap kartları hazırlayalım.</p>
    <button disabled={olusturuluyor} onClick={olustur} className="mt-7 inline-flex items-center gap-2 rounded-xl bg-[#705CF5] px-6 py-3 font-semibold text-white hover:bg-[#6250DE] disabled:opacity-50">
     {olusturuluyor?<ArrowPathIcon className="h-5 w-5 animate-spin"/>:<SparklesIcon className="h-5 w-5"/>}{olusturuluyor?"Kartlar hazırlanıyor...":"Kartları Oluştur"}
    </button>
   </div>:<div className="space-y-5">
    <div className="flex flex-wrap items-center gap-3"><label htmlFor="konu-filtre" className="text-sm font-medium">Konu</label>
     <select id="konu-filtre" value={konu} onChange={e=>{setKonu(e.target.value);setIndex(0);setCevapAcik(false);}} className={`min-w-[190px] max-w-full rounded-xl border px-3 py-2 text-sm ${panel}`}>
      <option value="tum">Tüm Konular</option>{konular.map(([id,baslik])=><option key={id} value={id}>{baslik}</option>)}
     </select>
     <div className="flex flex-wrap gap-2">{[["tum","Tümü"],["gorulmeyen","Görülmeyen"],["gorulen","Görülen"],["yildizli","Yıldızlı"]].map(([value,label])=>
      <button key={value} onClick={()=>filtreDegistir(value)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${filtre===value?"border-violet-400 bg-violet-500/20 text-violet-400":panel}`}>{label}</button>)}</div>
    </div>
    {aktif?<div className={`mx-auto max-w-3xl rounded-2xl border p-6 sm:p-9 ${panel}`}>
     <div className="flex flex-wrap items-center justify-between gap-3"><p className={`text-sm font-medium ${ikincil}`}>{aktif.konuBasligi} · {index+1} / {filtrelenmis.length}</p>
      <button onClick={()=>durum({yildizli:!aktif.yildizli})} aria-label={aktif.yildizli?"Yıldızı kaldır":"Yıldız ekle"} className={`rounded-lg p-2 ${aktif.yildizli?"text-amber-400":ikincil}`}><StarIcon className="h-6 w-6" fill={aktif.yildizli?"currentColor":"none"}/></button></div>
     <p className="mt-8 min-h-[90px] whitespace-pre-wrap text-center text-xl font-semibold leading-8">{aktif.soru}</p>
     <div className="mt-5 text-center"><button onClick={()=>{setCevapAcik(!cevapAcik);if(!cevapAcik&&!aktif.goruldu)durum({goruldu:true});}}
      className="inline-flex items-center gap-2 rounded-xl bg-violet-600 px-5 py-3 text-sm font-semibold text-white"><EyeIcon className="h-5 w-5"/>{cevapAcik?"Cevabı Gizle":"Cevabı Göster"}</button></div>
     {cevapAcik&&<div className={`mt-6 rounded-xl border p-5 ${isDark?"border-violet-400/20 bg-violet-400/10":"border-violet-200 bg-violet-50"}`}><p className="whitespace-pre-wrap text-center text-base leading-7">{aktif.cevap}</p>
      <p className={`mt-4 text-center text-xs ${ikincil}`}>Kaynak: {aktif.kaynaklar?.map(k=>k.dosyaAdi).filter((x,i,a)=>a.indexOf(x)===i).join(", ")}</p></div>}
     <div className="mt-8 flex items-center justify-between"><button disabled={index===0} onClick={()=>ileri(-1)} className="inline-flex items-center gap-1 rounded-lg border border-violet-400/30 px-4 py-2 text-sm disabled:opacity-30"><ChevronLeftIcon className="h-4 w-4"/>Önceki</button>
      <button disabled={index>=filtrelenmis.length-1} onClick={()=>ileri(1)} className="inline-flex items-center gap-1 rounded-lg border border-violet-400/30 px-4 py-2 text-sm disabled:opacity-30">Sonraki<ChevronRightIcon className="h-4 w-4"/></button></div>
    </div>:<p className={`py-16 text-center ${ikincil}`}>Bu filtreye uygun kart bulunamadı.</p>}
   </div>}
 </section>;
}
export default DersCalismaKartlari;

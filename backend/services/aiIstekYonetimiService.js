import { geminiHazirlamaHatasiniSiniflandir } from "../utils/geminiHazirlamaHatasi.js";

const hata = (kod, status, mesaj) => Object.assign(new Error(mesaj), { kod, status });
const uyku = ms => new Promise(resolve => setTimeout(resolve, ms));
const tam = (deger, max) => {
    const n = Number(deger);
    return Number.isInteger(n) && n > 0 ? Math.min(n,max) : 0;
};
const gun = now => new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles", year:"numeric", month:"2-digit", day:"2-digit",
}).format(new Date(now));
const lite = model => ["gemini-3.5-flash-lite","gemini-3.1-flash-lite"].includes(model);
const googleModel = model => lite(model) || ["gemini-3.6-flash","gemini-3.8-flash",
    "gemini-3-flash","gemini-4-hydrogen"].includes(model);
export const aiModelSirasiGetir = (birincil, env=process.env, yedek) => {
    const ikinciAday = yedek ?? env.AI_GEMINI_YEDEK_MODELI?.trim() ?? "gemini-3.1-flash-lite";
    const ikinci = ikinciAday !== birincil && googleModel(ikinciAday) ? ikinciAday
        : birincil==="gemini-3.5-flash-lite" ? "gemini-3.1-flash-lite" : "gemini-3.5-flash-lite";
    const liste = (googleModel(birincil)?[birincil,ikinci]:[birincil]).map(model=>({
        saglayici:"gemini",model,rpm:lite(model)||!googleModel(model)?12:4,
        tpm:200000,rpd:lite(model)||!googleModel(model)?450:18,
    }));
    // Groq ancak ücretsiz model ve hesabın kota değerleri açıkça yapılandırılmışsa.
    if(googleModel(birincil)&&env.AI_GROQ_ETKIN==="true"&&env.GROQ_API_KEY?.trim()&&
        /^[a-zA-Z0-9._/-]{1,120}$/.test(env.GROQ_MODELI||"")) {
        const rpm=tam(env.GROQ_RPM,1000), tpm=tam(env.GROQ_TPM,100000), rpd=tam(env.GROQ_RPD,100000);
        const cikti=tam(env.GROQ_MAKS_CIKTI_TOKEN,65536);
        const tpd=tam(env.GROQ_TPD || "200000",100000000);
        if(rpm&&tpm&&rpd&&cikti&&tpd) liste.push({saglayici:"groq",model:env.GROQ_MODELI,rpm,tpm,rpd,cikti,tpd});
    }
    return liste;
};

// Tek backend sürecini kapsar. Sağlayıcı kotası her zaman asıl otoritedir.
export const aiIstekYonetimiOlustur = ({
    simdi=Date.now, bekle=uyku, rastgele=Math.random, logger=console, eszamanli=2,
}={}) => {
    const durumlar=new Map(); let aktif=0;
    const durum=aday=>{
        const key=aday.saglayici+"/"+aday.model,t=simdi(),tarih=gun(t);
        let d=durumlar.get(key);
        if(!d){d={tarih,gunluk:0,dakika:[],gunlukTokenlar:[],engel:0,ardArda:0};durumlar.set(key,d);}
        if(d.tarih!==tarih){d.tarih=tarih;d.gunluk=0;d.gunlukDolu=false;d.sonHata=null;}
        d.dakika=d.dakika.filter(k=>t-k.zaman<60000);
        d.gunlukTokenlar=d.gunlukTokenlar.filter(k=>t-k.zaman<86400000);
        return d;
    };
    const kapasite=(aday,token)=>{
        const d=durum(aday);
        return !d.gunlukDolu&&d.engel<=simdi()&&d.gunluk<aday.rpd&&
            d.dakika.length<aday.rpm&&d.dakika.reduce((a,k)=>a+k.token,0)+token<=aday.tpm&&
            (!aday.tpd||d.gunlukTokenlar.reduce((a,k)=>a+k.token,0)+token<=aday.tpd);
    };
    return {async calistir({adaylar,tahminiGirdi,maxOutputTokens=0,groqMaxOutputTokens=maxOutputTokens,sonZaman,istek,
        tekDenemeMs=55000,maxDeneme=2,oncelik="normal"}) {
        let sonHata,denemeSayisi=0;
        const bitis=Math.min(sonZaman??simdi()+120000,simdi()+120000);
        // Groq'un ücretsiz kotası için ayrı çıktı bütçesi; Gemini ayarına dokunulmaz.
        const cikti=aday=>aday.saglayici==="groq"?groqMaxOutputTokens:maxOutputTokens;
        const token=aday=>tahminiGirdi+(aday.saglayici==="groq"?128+cikti(aday):0);
        const uygunlar=adaylar.filter(a=>token(a)<=a.tpm&&
            (a.saglayici!=="groq"||(cikti(a)>0&&cikti(a)<=a.cikti)));
        for(let i=0;i<uygunlar.length;i++){
            const aday=uygunlar[i];
            for(let n=1;n<=Math.min(2,maxDeneme);n++){
                if(bitis-simdi()<=0)break;
                if(!kapasite(aday,token(aday))){sonHata??=durum(aday).sonHata;break;}
                const limit=oncelik==="arka_plan"?Math.max(1,eszamanli-1):eszamanli;
                // Bekleme üst sınırı; uzun yerel kuyruklar alternatiflerin bütçesini yemez.
                const kuyrukBitis=Math.min(bitis-1500,simdi()+3000);
                while(aktif>=limit&&simdi()<kuyrukBitis)await bekle(100);
                if(aktif>=limit||bitis-simdi()<=0||!kapasite(aday,token(aday)))break;
                const d=durum(aday);
                const digerleri=uygunlar.slice(i+1).filter(a=>kapasite(a,token(a))).length;
                const rezerve=digerleri*23000;
                const sure=Math.min(tekDenemeMs,bitis-simdi()-Math.min(rezerve,Math.max(0,bitis-simdi()-5000)));
                if(sure<=0)break;
                d.gunluk++;
                const rezervasyon={zaman:simdi(),token:token(aday)};
                d.dakika.push(rezervasyon);
                if(aday.tpd)d.gunlukTokenlar.push(rezervasyon);
                aktif++;denemeSayisi++;
                let timer,gecikme=null;
                const controller=new AbortController();
                try{
                    const sonuc=await Promise.race([
                        Promise.resolve().then(()=>istek({...aday,maxOutputTokens:cikti(aday)},sure,controller.signal)),
                        new Promise((_,reject)=>{timer=setTimeout(()=>{
                            const e=hata("GEMINI_ZAMAN_ASIMI",504,"Yapay zekâ isteği zaman aşımına uğradı.");
                            e.tanilama={hataKaynagi:"uygulama_timeout",orijinalHttpDurumu:null,
                                retryUygunMu:true,retryEdildiMi:n>1,model:aday.model,
                                istekMaxOutputTokens:cikti(aday),istekTimeoutMs:sure};
                            controller.abort();reject(e);
                        },sure);}),
                    ]);
                    d.ardArda=0;d.engel=0;d.sonHata=null;
                    return {sonuc,aday,denemeSayisi};
                }catch(ham){
                    sonHata=ham;d.sonHata=ham;
                    const sinif=geminiHazirlamaHatasiniSiniflandir(ham,simdi());
                    const status=sinif.status,kod=ham?.kod||sinif.kod;
                    const retry=[429,500,502,503,504].includes(status)||
                        ["GEMINI_GECERSIZ_YANIT","GEMINI_GECERSIZ_JSON","GEMINI_GECERSIZ_SEMA","GEMINI_BOS_YANIT","GEMINI_AG_HATASI","GEMINI_ZAMAN_ASIMI"].includes(kod);
                    logger.info?.("[AI] deneme başarısız",{saglayici:aday.saglayici,model:aday.model,deneme:n,status,kod});
                    if(sinif.kod==="GEMINI_GUNLUK_KOTA"||kod==="GEMINI_GUNLUK_KOTA"){d.gunlukDolu=true;break;}
                    if(kod==="GEMINI_ISTEK_YOGUNLUGU")throw ham;
                    if(status===429){d.engel=simdi()+Math.max(1000,sinif.retryAfterMs??60000);break;}
                    if(status===404||status===402){d.engel=simdi()+300000;break;}
                    if([400,401,403].includes(status)||kod==="GEMINI_YAPILANDIRMA"||kod==="AI_GUVENLIK_ENGELI")throw ham;
                    if(kod==="GEMINI_ISTEK_YOGUNLUGU" || (kod==="GEMINI_SERVIS_HATASI" && ham?.tanilama?.orijinalHttpDurumu==null) || sinif.kod==="HAZIRLAMA_HATASI" || !retry)throw ham;
                    if(status===503){d.ardArda++;if(d.ardArda>=2)d.engel=simdi()+Math.max(60000,sinif.retryAfterMs??0);}
                    gecikme=Math.max((status===503?2500:1200)+Math.floor(rastgele()*300),sinif.retryAfterMs??0);
                    if(sinif.retryAfterMs>5000)d.engel=Math.max(d.engel,simdi()+sinif.retryAfterMs);
                    if(n>=Math.min(2,maxDeneme)||gecikme>5000||bitis-simdi()-gecikme-rezerve<8000||d.engel>simdi())break;
                }finally{clearTimeout(timer);aktif--;}
                if(gecikme!=null)await bekle(gecikme);
            }
        }
        throw sonHata||hata("AI_KOTA_VEYA_SURE",503,"Yapay zekâ için uygun kota veya süre bulunamadı.");
    }};
};
export const ortakAiIstekYonetimi=aiIstekYonetimiOlustur();

// Dizi dahil tüm JSON cevapları bir nesneye sarıp mevcut Gemini yanıt biçimine çevirir.
export const groqIstemcisiOlustur=({apiKey=process.env.GROQ_API_KEY,fetcher=fetch}={})=>({
    models:{async generateContent({model,contents,config}){
        if(!apiKey?.trim())throw hata("GEMINI_YAPILANDIRMA",401,"Groq anahtarı yapılandırılmadı.");
        const cevap=await fetcher("https://api.groq.com/openai/v1/chat/completions",{
            method:"POST",headers:{Authorization:"Bearer "+apiKey.trim(),"Content-Type":"application/json"},
            signal:config.abortSignal,
            body:JSON.stringify({model,messages:[
                {role:"system",content:config.systemInstruction+"\nYanıtı tek JSON nesnesinin sonuc alanına koy. Asıl istenen JSON nesnesini/dizisini değiştirme: {\"sonuc\": ...}."},
                {role:"user",content:contents},
            ],response_format:{type:"json_object"},temperature:0.2,
            ...(["openai/gpt-oss-120b","openai/gpt-oss-20b"].includes(model)?{reasoning_effort:"low"}:{}),
            ...(config.maxOutputTokens?{max_completion_tokens:config.maxOutputTokens}:{})}),
        });
        if(!cevap.ok){
            const e=hata("AI_SAGLAYICI_HATASI",cevap.status,"Groq isteği başarısız.");
            e.response={headers:cevap.headers};throw e;
        }
        const veri=await cevap.json(),secim=veri.choices?.[0];
        if(secim?.finish_reason==="content_filter")throw hata("AI_GUVENLIK_ENGELI",403,"İçerik sağlayıcı tarafından engellendi.");
        if(secim?.finish_reason==="length")return {text:"",candidates:[{finishReason:"MAX_TOKENS"}]};
        const sarilmis=JSON.parse(secim?.message?.content||"");
        if(!sarilmis||!Object.hasOwn(sarilmis,"sonuc"))throw new SyntaxError("Groq JSON zarfı eksik.");
        return {text:JSON.stringify(sarilmis.sonuc),candidates:[{finishReason:"STOP"}],
            usageMetadata:{promptTokenCount:veri.usage?.prompt_tokens,candidatesTokenCount:veri.usage?.completion_tokens,totalTokenCount:veri.usage?.total_tokens}};
    }},
});

import test from "node:test";
import assert from "node:assert/strict";
import { aiModelSirasiGetir, aiIstekYonetimiOlustur, groqIstemcisiOlustur } from "../services/aiIstekYonetimiService.js";
const adaylar=aiModelSirasiGetir("gemini-3.5-flash-lite",{AI_GROQ_ETKIN:"true",GROQ_API_KEY:"test",GROQ_MODELI:"test-groq",GROQ_RPM:"20",GROQ_TPM:"8000",GROQ_RPD:"500",GROQ_MAKS_CIKTI_TOKEN:"2000"});
const hata=status=>Object.assign(new Error("provider"),{status});
const ortam=()=>aiIstekYonetimiOlustur({bekle:async()=>{},rastgele:()=>0,logger:{info(){}}});
test("ilk başarıdan sonra başka çağrı yok",async()=>{
    const calls=[];
    const r=await ortam().calistir({adaylar,tahminiGirdi:100,maxOutputTokens:100,istek:async a=>{calls.push(a.model);return "ok";}});
    assert.equal(r.sonuc,"ok");assert.equal(calls.length,1);
});
test("iki Google modeli en fazla iki kez denenir, Groq kurtarır",async()=>{
    const calls=[];
    const r=await ortam().calistir({adaylar,tahminiGirdi:100,maxOutputTokens:100,istek:async a=>{
        calls.push(a.model);if(a.saglayici==="gemini")throw hata(503);return "ok";
    }});
    assert.equal(r.aday.saglayici,"groq");assert.equal(calls.length,5);
    assert.deepEqual(calls,["gemini-3.5-flash-lite","gemini-3.5-flash-lite","gemini-3.1-flash-lite","gemini-3.1-flash-lite","test-groq"]);
});
test("büyük Groq isteği gönderilmez",async()=>{
    let n=0;await assert.rejects(ortam().calistir({adaylar,tahminiGirdi:9000,istek:async()=>{n++;throw hata(503);}}));
    assert.equal(n,4);
});
test("400 tekrar veya model geçişi oluşturmaz",async()=>{
    let n=0;await assert.rejects(ortam().calistir({adaylar,tahminiGirdi:100,maxOutputTokens:100,istek:async()=>{n++;throw hata(400);}}));assert.equal(n,1);
});
test("Groq açık onay ve kota olmadan seçilmez",()=>{
    assert.equal(aiModelSirasiGetir("gemini-3.5-flash-lite",{GROQ_API_KEY:"x"}).length,2);
});
test("Groq JSON zarfını açar",async()=>{
    const istemci=groqIstemcisiOlustur({apiKey:"test",fetcher:async()=>({ok:true,json:async()=>({choices:[{finish_reason:"stop",message:{content:'{"sonuc":[{"baslik":"A"}]}'}}]})})});
    const yanit=await istemci.models.generateContent({model:"x",contents:"test",config:{systemInstruction:"JSON"}});
    assert.deepEqual(JSON.parse(yanit.text),[{baslik:"A"}]);
});
test("devre açık modeli sonraki istekte atlar",async()=>{
    const m=ortam();const calls=[];
    await m.calistir({adaylar,tahminiGirdi:100,maxOutputTokens:100,istek:async a=>{if(a.model===adaylar[0].model)throw hata(503);return "ok";}});
    await m.calistir({adaylar,tahminiGirdi:100,maxOutputTokens:100,istek:async a=>{calls.push(a.model);return "ok";}});
    assert.equal(calls[0],adaylar[1].model);
});
test("son zaman geçtiyse istek gönderilmez",async()=>{
    let n=0;await assert.rejects(ortam().calistir({adaylar,tahminiGirdi:100,maxOutputTokens:100,sonZaman:Date.now()-1,istek:async()=>{n++;}}));assert.equal(n,0);
});

test("tüm uygun sağlayıcılar başarısızsa en fazla altı çağrı",async()=>{
    let n=0;await assert.rejects(ortam().calistir({adaylar,tahminiGirdi:100,maxOutputTokens:100,istek:async()=>{n++;throw hata(503);}}));assert.equal(n,6);
});
test("güvenlik engeli başka sağlayıcıya gönderilmez",async()=>{
    let n=0;await assert.rejects(ortam().calistir({adaylar,tahminiGirdi:100,maxOutputTokens:100,istek:async()=>{n++;throw Object.assign(hata(403),{kod:"AI_GUVENLIK_ENGELI"});}}));assert.equal(n,1);
});

test("Gemini çıktı bütçesi değişmez, Groq uygun ayrı bütçe alır",async()=>{
    const liste=adaylar.map(a=>a.saglayici==="groq"?{...a,cikti:65536}:a);
    const c=[];
    const r=await ortam().calistir({adaylar:liste,tahminiGirdi:1800,maxOutputTokens:14000,groqMaxOutputTokens:4000,istek:async a=>{
        c.push([a.saglayici,a.maxOutputTokens]);
        if(a.saglayici==="gemini")throw hata(503);return "ok";
    }});
    assert.equal(r.sonuc,"ok");
    assert.deepEqual(c,[["gemini",14000],["gemini",14000],["gemini",14000],["gemini",14000],["groq",4000]]);
});
test("günlük token bütçesi aşılmaz",async()=>{
    const m=ortam(),liste=[{...adaylar[2],tpd:1500}];let n=0;
    await m.calistir({adaylar:liste,tahminiGirdi:500,maxOutputTokens:500,istek:async()=>{n++;return "ok";}});
    await assert.rejects(m.calistir({adaylar:liste,tahminiGirdi:500,maxOutputTokens:500,istek:async()=>{n++;return "ok";}}));
    assert.equal(n,1);
});
test("GPT OSS için düşük düşünme ayarı gönderilir",async()=>{
    let govde;
    const client=groqIstemcisiOlustur({apiKey:"test",fetcher:async(_u,options)=>{
        govde=JSON.parse(options.body);
        return {ok:true,json:async()=>({choices:[{finish_reason:"stop",message:{content:'{"sonuc":{"yanit":"ok"}}'}}]})};
    }});
    await client.models.generateContent({model:"openai/gpt-oss-120b",contents:"test",config:{systemInstruction:"JSON",maxOutputTokens:4000}});
    assert.equal(govde.reasoning_effort,"low");assert.equal(govde.max_completion_tokens,4000);
});

test("parçalı harita Groq dakika kotasını yeni API çağrısı yapmadan bekler",async()=>{
    let now=0,calls=0;
    const m=aiIstekYonetimiOlustur({simdi:()=>now,bekle:async ms=>{now+=ms},logger:{}});
    const cfg={adaylar:[{saglayici:"groq",model:"test",rpm:30,tpm:8000,rpd:1000,tpd:200000,cikti:65536}],
        tahminiGirdi:3000,groqMaxOutputTokens:2500,maxDeneme:1,kotaBekleMs:65000,istek:async()=>{calls++;return true}};
    await m.calistir(cfg);
    await m.calistir(cfg);
    assert.equal(calls,2);
    assert.equal(now,60000);
});

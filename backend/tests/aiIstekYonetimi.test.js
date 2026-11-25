import test from "node:test";
import assert from "node:assert/strict";
import { aiModelSirasiGetir, aiIstekYonetimiOlustur, groqIstemcisiOlustur } from "../services/aiIstekYonetimiService.js";
const adaylar=aiModelSirasiGetir("gemini-3.5-flash-lite",{AI_GROQ_ETKIN:"true",GROQ_API_KEY:"test",GROQ_MODELI:"test-groq",GROQ_RPM:"20",GROQ_TPM:"8000",GROQ_RPD:"500",GROQ_MAKS_CIKTI_TOKEN:"2000"});
const hata=status=>Object.assign(new Error("provider"),{status});
const ortam=()=>aiIstekYonetimiOlustur({bekle:async()=>{},rastgele:()=>0,logger:{info(){}}});
test("ilk başarıdan sonra başka çağrı yok",async()=>{
    const calls=[];
    const r=await ortam().calistir({adaylar,tahminiGirdi:100,istek:async a=>{calls.push(a.model);return "ok";}});
    assert.equal(r.sonuc,"ok");assert.equal(calls.length,1);
});
test("iki Google modeli en fazla iki kez denenir, Groq kurtarır",async()=>{
    const calls=[];
    const r=await ortam().calistir({adaylar,tahminiGirdi:100,istek:async a=>{
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
    let n=0;await assert.rejects(ortam().calistir({adaylar,tahminiGirdi:100,istek:async()=>{n++;throw hata(400);}}));assert.equal(n,1);
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
    await m.calistir({adaylar,tahminiGirdi:100,istek:async a=>{if(a===adaylar[0])throw hata(503);return "ok";}});
    await m.calistir({adaylar,tahminiGirdi:100,istek:async a=>{calls.push(a.model);return "ok";}});
    assert.equal(calls[0],adaylar[1].model);
});
test("son zaman geçtiyse istek gönderilmez",async()=>{
    let n=0;await assert.rejects(ortam().calistir({adaylar,tahminiGirdi:100,sonZaman:Date.now()-1,istek:async()=>{n++;}}));assert.equal(n,0);
});

import test from "node:test";
import assert from "node:assert/strict";
import { semaDogrulaVeNormalizeEt, callGeminiStructuredJson } from "../services/geminiService.js";

test("kaynaklı konu haritası normalizasyonu ana ve alt parça kodlarını korur", () => {
    const veri = [{ baslik: "Modelleme", parcaKodlari: ["P1"], altKonular: [
        { baslik: "Veri Bölme", parcaKodlari: ["P2", "P3"] },
    ] }];
    const sonuc = semaDogrulaVeNormalizeEt(veri, { kaynakKodlariniKoru: true });
    assert.deepEqual(sonuc[0].parcaKodlari, ["P1"]);
    assert.deepEqual(sonuc[0].altKonular[0].parcaKodlari, ["P2", "P3"]);
    const eski = semaDogrulaVeNormalizeEt(veri);
    assert.equal("parcaKodlari" in eski[0], false);
    assert.equal("parcaKodlari" in eski[0].altKonular[0], false);
});

import { haritaSinirlayiciOlustur } from "../utils/geminiHaritaSiniri.js";
import { eksikParcaAtamalariniTamamla } from "../services/parcaKonuAtamaService.js";

test("ckart ile aynı istek ayarlarıyla tek çağrıda kaynak kodları korunur", async () => {
    const calls=[];
    const ai={models:{generateContent:async req=>{
        calls.push(req);
        return {text:JSON.stringify([{baslik:"Veri",parcaKodlari:["P1"],altKonular:[{baslik:"EDA",parcaKodlari:["P2"]}]}])};
    }}};
    const sonuc=await callGeminiStructuredJson(ai,"mock","[PARCA P1] Veri\n[PARCA P2] EDA","Talimat",{
        kaynakKodlariniKoru:true,
        ayarlar:{rpm:12,tpm:200000,rpd:450,maksDeneme:2,timeoutMs:60000,maksBeklemeMs:30000,maxOutputTokens:null},
        sinir:haritaSinirlayiciOlustur(),yedekModel:null,logger:{info(){}},
    });
    assert.equal(calls.length,1);
    assert.equal(calls[0].config.responseMimeType,"application/json");
    assert.equal(calls[0].config.temperature,0.2);
    assert.equal(Object.hasOwn(calls[0].config,"maxOutputTokens"),false);
    assert.deepEqual(sonuc[0].parcaKodlari,["P1"]);
    assert.deepEqual(sonuc[0].altKonular[0].parcaKodlari,["P2"]);
});

test("geçerli kaynak bağları yeniden üretilmez; yalnız eksik parça sınıflandırılır",async()=>{
    const parcalar=[{materyalId:"m",islemeId:"v",parcaIndex:0},{materyalId:"m",islemeId:"v",parcaIndex:1}];
    const anaKonular=[{konuId:"top",altKonular:[{konuId:"sub"}]}];
    const mevcut=[{...parcalar[0],konuIds:["sub"]}];
    let calls=0;
    const sonuc=await eksikParcaAtamalariniTamamla({parcalar,anaKonular,mevcutAtamalar:mevcut,siniflandir:async eksik=>{
        calls++;
        assert.deepEqual(eksik,[parcalar[1]]);
        return [{...parcalar[1],konuIds:["top"]}];
    }});
    assert.equal(calls,1);
    assert.deepEqual(sonuc.map(x=>x.konuIds),[["sub"],["top"]]);
    await eksikParcaAtamalariniTamamla({parcalar,anaKonular,mevcutAtamalar:sonuc,siniflandir:async()=>{throw Error("Ek çağrı yapılmamalı");}});
});

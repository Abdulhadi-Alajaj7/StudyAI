import test from "node:test";
import assert from "node:assert/strict";
import {haritaGrupPlani,haritaPlanImzasi,haritaKodlariniDogrula,haritaGruplariniBirlestir,haritaParcaliAnaliz} from "../services/konuHaritasiBatchService.js";
const konu=(kod,baslik="Diziler")=>[{baslik,parcaKodlari:[kod],altKonular:[]}];
const normalize=s=>s.toLowerCase();
const gruplar=haritaGrupPlani([{kod:"P1",metin:"abc"},{kod:"P2",metin:"def"},{kod:"P3",metin:"ghi"}],5);
test("Grup planı hiçbir parçayı kaybetmez ve sıra korunur",()=>{
    assert.deepEqual(gruplar.map(g=>g.kodlar),[["P1"],["P2"],["P3"]]);
    assert.equal(gruplar.map(g=>g.metin).join(""),"abcdefghi");
    assert.notEqual(haritaPlanImzasi(gruplar,[{surum:1}],{}),haritaPlanImzasi(gruplar,[{surum:2}],{}));
});
test("Kapsam eksik veya yabancı kaynak kodunu reddeder",()=>{
    assert.equal(haritaKodlariniDogrula(konu("P1"),["P1","P2"]),false);
    assert.equal(haritaKodlariniDogrula(konu("P2"),["P1"]),false);
    assert.equal(haritaKodlariniDogrula(konu("P1"),["P1"]),true);
});
test("Aynı başlıkta kaynaklar birleşir, farklı bağlam ve konular korunur",()=>{
    const a=haritaGruplariniBirlestir([konu("P1"),konu("P2"),konu("P3","Kuyruk")],normalize);
    assert.equal(a.length,2);
    assert.deepEqual(a[0].parcaKodlari,["P1","P2"]);
    assert.equal(haritaKodlariniDogrula(a,["P1","P2","P3"]),true);
});
test("503 sonrası checkpoint ile başarılı grup tekrar çağrılmaz",async()=>{
    let nokta, sayi=0;
    const ortak={gruplar,imza:"v1",normalize,dogrula:async()=>{},kaydet:async x=>{nokta=JSON.parse(JSON.stringify(x))},logger:{}};
    await assert.rejects(haritaParcaliAnaliz({...ortak,analiz:async g=>{sayi++;if(g.kodlar[0]==="P2")throw Object.assign(Error("503"),{status:503});return konu(g.kodlar[0]);}}));
    assert.equal(nokta.sonuclar.length,1);
    const sonuc=await haritaParcaliAnaliz({...ortak,kontrolNoktasi:nokta,analiz:async g=>{sayi++;return konu(g.kodlar[0]);}});
    assert.equal(sayi,4);
    assert.equal(haritaKodlariniDogrula(sonuc.konular,["P1","P2","P3"]),true);
});
test("Değişen imza eski checkpoint'i kullanmaz",async()=>{
    const islenen=[];
    await haritaParcaliAnaliz({gruplar,imza:"v2",kontrolNoktasi:{imza:"v1",sonuclar:[{konular:konu("P1")}]},normalize,dogrula:async()=>{},kaydet:async()=>{},logger:{},analiz:async g=>{islenen.push(g.kodlar[0]);return konu(g.kodlar[0]);}});
    assert.deepEqual(islenen,["P1","P2","P3"]);
});

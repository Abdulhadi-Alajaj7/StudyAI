import test from "node:test";
import assert from "node:assert/strict";
import { konuListesiOlustur,makulKartSayisiniBelirle,konuKotalariniBelirle } from "../services/calismaKartiService.js";
test("Alt konu kimlikleri korunur",()=>{
 const harita={anaKonular:[{konuId:"a",baslik:"A",altKonular:[{konuId:"a1",baslik:"A1"}]},{konuId:"b",baslik:"B"}]};
 assert.deepEqual(konuListesiOlustur(harita).map(x=>x.konuId),["a1","b"]);
});
test("Kart sayısı altmışı geçmez",()=>{
 assert.equal(makulKartSayisiniBelirle({konuSayisi:500,karakterSayisi:1000000}),60);
 assert.equal(makulKartSayisiniBelirle({konuSayisi:1,karakterSayisi:50}),0);
});
test("Tek konu en fazla sekiz kart alır",()=>{
 const kotalar=konuKotalariniBelirle([{konuId:"a",parcalar:[{}],karakterSayisi:40000}],60);
 assert.equal(kotalar[0].adet,8);
});

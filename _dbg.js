const { JSDOM, VirtualConsole } = require("jsdom");
const fs = require("fs");
const { webcrypto } = require("crypto");
const TEST_URL = "https://sync.test";
const htmlRaw = fs.readFileSync("index.html","utf8");
const pdfjs = fs.readFileSync("sheet-pdf.js","utf8");
const syncjs = fs.readFileSync("sync.js","utf8").replace('const SYNC_URL = "";', `const SYNC_URL = "${TEST_URL}";`);
const appjs = fs.readFileSync("app.js","utf8");
const KV = new Map();
function backendFetch(url,opts){opts=opts||{};const u=new URL(url);const m=u.pathname.match(/^\/space\/([A-Za-z0-9_-]{16,128})$/);const mk=(o,s)=>Promise.resolve({ok:s>=200&&s<300,status:s,json:()=>Promise.resolve(o)});if(!m)return mk({},404);const k=m[1];if(!opts.method||opts.method==="GET"){const c=KV.get(k);return c?mk({version:c.version,ciphertext:c.ciphertext},200):mk({version:0,ciphertext:null},404);}if(opts.method==="PUT"){const b=JSON.parse(opts.body);const e=Number(b.expectedVersion)||0;const c=KV.get(k)||{version:0,ciphertext:null};if(c.version!==e)return mk({conflict:true,version:c.version,ciphertext:c.ciphertext},409);KV.set(k,{version:e+1,ciphertext:b.ciphertext});return mk({version:e+1},200);}return mk({},405);}
const vc = new VirtualConsole();
vc.on("jsdomError", e => console.log("JSDOMERR:", e.detail ? (e.detail.stack||e.detail.message) : e.message));
["error","warn","log"].forEach(l => vc.on(l, (...a)=>console.log("PAGE."+l+":", ...a)));
let html = htmlRaw.replace(/<script src="https:\/\/cdn[^"]*"><\/script>/,"")
  .replace('<script src="sheet-pdf.js?v=5"></script>','<script>'+pdfjs+'</script>')
  .replace('<script src="sync.js?v=5"></script>','<script>'+syncjs+'</script>')
  .replace('<script src="app.js?v=5"></script>','<script>'+appjs+'</script>');
const dom = new JSDOM(html,{runScripts:"dangerously",url:"https://pages.test/Baby-Tracker/",virtualConsole:vc,
  beforeParse(window){
    Object.defineProperty(window,"crypto",{value:webcrypto,configurable:true,writable:true});
    window.HTMLElement.prototype.scrollIntoView=function(){};
    window.fetch=(u,o)=>backendFetch(typeof u==="string"?u:u.url,o);
  }});
const { window } = dom;
(async()=>{
  await new Promise(r=>setTimeout(r,50));
  console.log("state:", window.BabySync && window.BabySync.state());
  console.log("crypto.subtle:", !!(window.crypto && window.crypto.subtle));
  try { await window.BabySync.createSpace(); console.log("createSpace OK:", window.BabySync.shareLink(), "KV:", KV.size); }
  catch(e){ console.log("createSpace threw:", e && (e.stack||e.message) || e); }
})();

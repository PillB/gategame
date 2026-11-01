import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, readFile, writeFile, mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const sleep=ms=>new Promise(ok=>setTimeout(ok,ms));
const root=path.resolve("dist/pages");
const evidence=path.resolve("evidence/browser");
await mkdir(evidence,{recursive:true});
let server,chrome,socket,profile,send;
const errors=[];
const mime={".html":"text/html",".css":"text/css",".js":"text/javascript",
 ".json":"application/json",".svg":"image/svg+xml",".woff2":"font/woff2"};
const serverPort=await new Promise((resolve,reject)=>{
  server=createServer(async(req,res)=>{
    try{
      const url=new URL(req.url,"http://localhost");
      if(!url.pathname.startsWith("/gategame/")){res.writeHead(404);res.end();return;}
      const file=path.resolve(root,decodeURIComponent(url.pathname.slice(10))||"index.html");
      if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return;}
      const body=await readFile(file);
      res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});
      res.end(body);
    }catch{res.writeHead(404);res.end();}
  });
  server.once("error",reject);
  server.listen(0,"127.0.0.1",()=>resolve(server.address().port));
});
function findChrome(){
  for(const name of ["google-chrome","google-chrome-stable","chromium","chromium-browser"]){
    try{return execFileSync("which",[name],{encoding:"utf8"}).trim();}catch{}
  }
  throw Error("Chrome missing from GitHub runner");
}
async function evaluate(js){
  const response=await send("Runtime.evaluate",{expression:js,returnByValue:true,awaitPromise:true});
  if(response.exceptionDetails)throw Error("Browser JS exception: "+JSON.stringify(response.exceptionDetails));
  return response.result?.value;
}
async function waitFor(js,maxMs=17000){
  const deadline=Date.now()+maxMs;
  while(Date.now()<deadline){if(await evaluate(js))return;await sleep(100);}
  throw Error("Timed out waiting for "+js);
}
async function clickButton(label){
  const js="(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes("+JSON.stringify(label)+"));if(!b||b.disabled)return false;b.click();return true})()";
  assert.equal(await evaluate(js),true,"Button missing: "+label);
  await sleep(85);
}
async function screenshot(name){
  const image=await send("Page.captureScreenshot",{format:"png",captureBeyondViewport:true});
  await writeFile(path.join(evidence,name+".png"),Buffer.from(image.data,"base64"));
}
async function fullRound(preset,name){
  await clickButton(preset);
  await clickButton("2× Rápido");
  assert.equal(await evaluate("document.querySelector('button[aria-pressed=true]')?.textContent.includes('2× Rápido')"),true);
  await clickButton("Iniciar turno");
  await waitFor("document.querySelector('.metrics article:first-child strong')?.textContent!=='00:00'",7000);
  await screenshot(name+"-running");
  try {
    await waitFor("!!document.querySelector('section.debrief')",90000);
  } catch (error) {
    console.error("BROWSER_TIMEOUT_DIAGNOSTICS "+JSON.stringify(await evaluate("(()=>({time:document.querySelector('.metrics article:first-child strong')?.textContent,header:document.querySelector('.top-actions')?.textContent,objective:document.querySelector('.objective')?.textContent.slice(0,250),errors:document.querySelector('.toolbar')?.textContent.slice(0,160)}))()")));
    await screenshot(name+"-timeout");
    throw error;
  }
  const data=await evaluate("(()=>({score:Number(document.querySelector('.debrief-copy strong')?.textContent),cleared:document.querySelector('.debrief-copy')?.textContent,layout:document.querySelector('.toolbar .label')?.textContent}))()");
  assert.ok(Number.isInteger(data.score)&&data.score>=0&&data.score<=1000,JSON.stringify(data));
  assert.match(data.cleared,/25\/28/,"Passenger count unexpected");
  const delta=await evaluate("document.querySelector('.round-delta')?.textContent||''");
  if(preset==="División guiada")assert.equal(delta,"","First result has no previous-round comparison");
  if(preset==="Serpentina")assert.match(delta,/72 puntos menos/,"Second round must compare to Guided 868");
  if(preset==="Espacio libre")assert.match(delta,/Mejoraste 137 puntos/,"Third round must compare to Serpentine 796");
  await screenshot(name+"-debrief");
  console.info("BROWSER_ROUND "+JSON.stringify({preset,score:data.score,detail:data.cleared,layout:data.layout}));
}
try{
  profile=await mkdtemp(path.join(tmpdir(),"gateflow-ci-"));
  chrome=spawn(findChrome(),["--headless=new","--no-sandbox","--disable-dev-shm-usage",
    "--disable-gpu","--no-first-run","--disable-background-networking",
    "--remote-allow-origins=*","--remote-debugging-port=0",
    "--user-data-dir="+profile,"about:blank"],{stdio:"ignore"});
  let port=0;
  for(let i=0;i<120;i++){
    try{port=Number((await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0]);if(port>0)break;}catch{}
    if(chrome.exitCode!==null)throw Error("Chrome exited before CDP initialized");
    await sleep(100);
  }
  if(!port)throw Error("CDP port not ready");
  const targets=await(await fetch("http://127.0.0.1:"+port+"/json")).json();
  const target=targets.find(t=>t.type==="page");
  assert.ok(target?.webSocketDebuggerUrl);
  socket=new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{
    socket.addEventListener("open",ok,{once:true});
    socket.addEventListener("error",fail,{once:true});
  });
  let nextId=0;
  const pending=new Map();
  socket.addEventListener("message",event=>{
    let msg;try{msg=JSON.parse(event.data)}catch{return}
    if(msg.id&&pending.has(msg.id)){
      const p=pending.get(msg.id);
      clearTimeout(p.timeout);pending.delete(msg.id);
      msg.error?p.reject(Error(msg.error.message)):p.resolve(msg.result);
    }
    if(msg.method==="Runtime.exceptionThrown")errors.push("JS "+JSON.stringify(msg.params.exceptionDetails?.text));
    if(msg.method==="Network.loadingFailed"&&!msg.params.canceled)errors.push("NETWORK "+msg.params.errorText);
  });
  send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++nextId;
    const timeout=setTimeout(()=>{pending.delete(id);reject(Error("CDP command timeout "+method));},30000);
    pending.set(id,{resolve,reject,timeout});
    socket.send(JSON.stringify({id,method,params}));
  });
  await send("Page.enable");
  await send("Runtime.enable");
  await send("Network.enable");
  // Speed up only the CI browser's wall clock. Simulation DT and seed remain unchanged.
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.addScriptToEvaluateOnNewDocument",{source:
    "const originalInterval=window.setInterval.bind(window);window.setInterval=(fn,ms,...args)=>originalInterval(fn,Math.min(ms,10),...args);"});
  await send("Page.navigate",{url:"http://127.0.0.1:"+serverPort+"/gategame/"});
  await waitFor("document.querySelector('h1')?.textContent==='Gateflow'");
  await screenshot("01-desktop-build");
  assert.equal(await evaluate("document.documentElement.lang"),"es-PE");
  assert.equal(await evaluate("document.querySelectorAll('.game-canvas').length"),1);
  for(const speed of ["½ Lento","1× Normal","2× Rápido"]){
    await clickButton(speed);
    assert.equal(await evaluate("document.querySelector('button[aria-pressed=true]')?.textContent.includes("+JSON.stringify(speed)+")"),true);
  }
  const startLayout=await evaluate("document.querySelector('.toolbar .label')?.textContent");
  await clickButton("Serpentina");
  const otherLayout=await evaluate("document.querySelector('.toolbar .label')?.textContent");
  assert.notEqual(startLayout,otherLayout,"Preset did not change the layout");
  await clickButton("División guiada");
  await clickButton("Iniciar turno");
  await clickButton("Pausar turno");
  const paused=await evaluate("document.querySelector('.metrics article:first-child strong')?.textContent");
  await sleep(200);
  assert.equal(await evaluate("document.querySelector('.metrics article:first-child strong')?.textContent"),paused);
  await clickButton("Reiniciar turno");
  assert.equal(await evaluate("document.querySelector('.metrics article:first-child strong')?.textContent"),"00:00");
  await fullRound("División guiada","02-guided");
  await evaluate("document.querySelector('.score-ledger summary')?.click()");
  await screenshot("03-score-ledger");
  await clickButton("Copiar desafío");
  await fullRound("Serpentina","04-serpentine");
  await fullRound("Espacio libre","05-open-floor");
  await send("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await sleep(150);
  const width=await evaluate("({viewport:window.innerWidth,document:document.documentElement.scrollWidth})");
  assert.ok(width.document<=width.viewport+3,"Mobile viewport overflow "+JSON.stringify(width));
  const shortTargets=await evaluate("([...document.querySelectorAll('.debrief-actions button,.top-actions button,.toolbar-controls button,.run,.score-ledger summary')].filter(x=>getComputedStyle(x).display!=='none'&&x.getBoundingClientRect().height<43.5).map(x=>({text:x.textContent,height:x.getBoundingClientRect().height})))");
  assert.deepEqual(shortTargets,[],"Small touch targets in mobile view "+JSON.stringify(shortTargets));
  await screenshot("06-mobile-debrief");
  await send("Page.navigate",{url:"http://127.0.0.1:"+serverPort+"/gategame/?layout=G1&beat=947"});
  await waitFor("document.querySelector('.challenge-ribbon')?.textContent.includes('947')");
  await screenshot("07-shared-challenge");
  await send("Page.navigate",{url:"http://127.0.0.1:"+serverPort+"/gategame/?layout=G1&beat=1001"});
  await waitFor("document.querySelector('h1')?.textContent==='Gateflow'");
  await sleep(200);
  assert.equal(await evaluate("!!document.querySelector('.challenge-ribbon')"),false);
  assert.equal(errors.length,0,errors.join("\n"));
  console.info("BROWSER_SMOKE_PASS commit="+JSON.parse(await readFile(path.join(root,"version.json"),"utf8")).sourceRevision);
}finally{
  try{socket?.close();}catch{}
  try{chrome?.kill();}catch{}
  try{server?.close();}catch{}
  if(profile)await rm(profile,{recursive:true,force:true}).catch(()=>{});
}

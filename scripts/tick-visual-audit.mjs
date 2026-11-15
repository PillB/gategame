// Per-0.1-second screenshots of three missions, including an actual R06 edit.
// CI-only clock interception; the distributed client contains no testing backdoor.
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { Script } from "node:vm";
import ts from "typescript";
import { scoredElapsed } from "../lib/rounds.js";
import { encodeLayout, layoutFingerprint, scoreShiftBreakdown } from "../lib/simulation.js";

const root = path.resolve("dist/pages");
const evidence = path.resolve("evidence/tick-audit");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const require = createRequire(import.meta.url);
const source = await readFile(path.resolve("app/page.tsx"), "utf8");
const js = ts.transpileModule(source + "\nexport {tick,blank,GUIDED,SERPENTINE,TARGET,DT};\n", {
  fileName: "page.tsx", compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
    target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText;
const engine = { exports: {}, require: (id) => {
  if (id === "@/lib/challenges.js") return require("../lib/challenges.js");
  if (id === "@/lib/rounds.js") return require("../lib/rounds.js");
  if (id === "@/lib/simulation.js") return require("../lib/simulation.js");
  return require(id);
}};
new Script(js, { filename: "visual-audit-engine.cjs" }).runInNewContext(engine, { timeout: 5000 });
const { tick, blank, GUIDED, SERPENTINE, TARGET, DT } = engine.exports;
const scenarios = [
  { roundId: "r04", button: "R04 · Las maletas cantoras", preset:"División guiada", layout:GUIDED, expectedScore: 856, expectedElapsed: 59.2 },
  { roundId: "r05", button: "R05 · Dos vuelos, una pista", preset:"División guiada", layout:GUIDED, expectedScore: 866, expectedElapsed: 39.3 },
  { roundId: "r06", button: "R06 · La fila que respira", preset:"Serpentina", layout:SERPENTINE,
    breathRemoval:{grid:1,from:"4:9",to:"5:9"}, expectedScore:852, expectedElapsed:null },
];
const terminal = new Set(["done", "failed", "turnedAway", "left"]);
const mime = { ".html": "text/html", ".css": "text/css", ".js": "text/javascript",
  ".json": "application/json", ".svg": "image/svg+xml", ".woff2": "font/woff2" };
let server, chrome, socket, profile, send;
const runtimeErrors = [];

const clockSource = `(() => {
  const originalSet = window.setInterval.bind(window);
  const originalClear = window.clearInterval.bind(window);
  const callbacks = new Map(); let serial = 900000;
  window.setInterval = (fn, ms, ...args) => {
    if (ms >= 40 && ms <= 250) { const id = ++serial; callbacks.set(id, { fn, args }); return id; }
    return originalSet(fn, ms, ...args);
  };
  window.clearInterval = (id) => {
    if (callbacks.has(id)) { callbacks.delete(id); return; }
    return originalClear(id);
  };
  window.__gateflowAudit = {
    hasTimer: () => callbacks.size === 1,
    step: async () => {
      if (callbacks.size !== 1) throw Error('Exactly one simulation timer required');
      const timer = [...callbacks.values()][0]; timer.fn(...timer.args);
      await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      const metrics = [...document.querySelectorAll('.metrics article strong')].map((node) => node.textContent);
      return { time: metrics[0], cleared: parseInt(metrics[1], 10), queued: Number(metrics[2]),
        score: Number(metrics[3]), active: Number(document.querySelector('.metrics article:nth-child(2) small')?.textContent.match(/\\d+/)?.[0]),
        remaining: Number(document.querySelector('.objective>strong')?.textContent),
        feed: document.querySelectorAll('.incident-feed ol > li').length,
        finished: Boolean(document.querySelector('section.debrief')),
        breathUsed: document.querySelector('.breath-banner') ? Number(document.querySelector('.breath-banner strong')?.textContent.match(/(\\d)\\/1 usado/)?.[1]) : null };
    },
    canvasRect: () => {
      const rect = document.querySelector('.game-canvas').getBoundingClientRect();
      return { x: Math.floor(rect.x + window.scrollX), y: Math.floor(rect.y + window.scrollY),
        width: Math.floor(rect.width), height: Math.floor(rect.height), scale: 1 };
    },
  };
})();`;

async function evaluate(expression) {
  const result = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (result.exceptionDetails) throw Error("Chrome runtime error: " + JSON.stringify(result.exceptionDetails));
  return result.result?.value;
}
async function waitFor(expression, maxMs = 20000) {
  const end = Date.now() + maxMs;
  while (Date.now() < end) { if (await evaluate(expression)) return; await sleep(50); }
  throw Error("Timed out: " + expression);
}
async function clickButton(label) {
  const click = `(() => {const button=[...document.querySelectorAll('button')].find(b=>b.textContent.includes(${JSON.stringify(label)}));if(!button||button.disabled)return false;button.click();return true})()`;
  assert.equal(await evaluate(click), true, `Button missing: ${label}`);
  await sleep(70);
}
async function pressPost(label, count = 1) {
  for (let i=0;i<count;i++) {
    const expression=`(() => { const button=document.querySelector('button[aria-label=${JSON.stringify(label)}]'); if(!button||button.disabled)return false; button.click(); return true; })()`;
    assert.equal(await evaluate(expression),true,`Post control unavailable: ${label}`);
    await evaluate("new Promise(ok=>requestAnimationFrame(()=>requestAnimationFrame(()=>ok(true))))");
  }
}
async function screenshot(name, { full = false, clip = undefined } = {}) {
  const params = full ? {format:"png",captureBeyondViewport:true} :
    {format:"jpeg",quality:50,captureBeyondViewport:true,clip};
  const result = await send("Page.captureScreenshot", params);
  const bytes = Buffer.from(result.data, "base64");
  const filename = path.join(evidence, name + (full ? ".png" : ".jpg"));
  await writeFile(filename, bytes);
  return createHash("sha256").update(bytes).digest("hex");
}
function timeLabel(seconds) {
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;
}
function expectedMetrics(sim, roundId) {
  const resolved = sim.cleared + sim.failed + sim.turnedAway + sim.abandoned;
  const finished = sim.spawned === TARGET && resolved === TARGET;
  return { time: timeLabel(sim.elapsed), cleared: sim.cleared,
    queued: sim.agents.filter((a) => a.stage === "queue1" || a.stage === "queue2").length,
    score: scoreShiftBreakdown({processed:sim.cleared,elapsed:scoredElapsed(roundId,sim.elapsed),
      retries:sim.retries,target:TARGET,turnedAway:sim.turnedAway,abandoned:sim.abandoned,
      complete:finished,smartSwitches:sim.queueSwitches,repairs:sim.repairs,
      faultsLeft:sim.faults.filter((f)=>!f.repaired).length}).total,
    active: sim.agents.filter((a)=>!terminal.has(a.stage)).length,
    feed: Math.min(3,sim.events.length),
    remaining: TARGET - resolved, finished, breathUsed:roundId==="r06"?sim.breathEdits:null };
}

async function audit({ roundId, button, preset, layout:sourceLayout, breathRemoval, expectedScore, expectedElapsed }, url) {
  await send("Page.navigate", { url });
  await waitFor("document.querySelector('h1')?.textContent==='Gateflow'");
  // A heading can be present before the bundled React client has mounted.
  // The first CI attempt clicked inert pre-hydration markup and timed out.
  await waitFor("document.readyState==='complete' && !!document.querySelector('.round-picker button')");
  await sleep(250);
  const isSelected=`document.querySelector('.round-picker button[aria-pressed=true]')?.textContent.includes(${JSON.stringify(roundId.toUpperCase())})`;
  for(let attempt=0;attempt<3;attempt++){
    if(await evaluate(isSelected))break;
    await clickButton(button);
    await sleep(250);
  }
  assert.equal(await evaluate(isSelected),true,`React mission selection never committed for ${roundId}`);
  await clickButton(preset);
  await screenshot(`${roundId}/intro`, { full: true });
  await clickButton("Iniciar turno");
  await waitFor("window.__gateflowAudit?.hasTimer()");
  const clip = await evaluate("window.__gateflowAudit.canvasRect()");
  assert.ok(clip.width > 400 && clip.height > 600, `Unexpected game board geometry ${JSON.stringify(clip)}`);
  let sim = { ...blank(), running:true }, ticks = 0;
  const layout=sourceLayout.map(group=>group.map(edge=>({...edge})));
  const rows = [], hashes = new Set();
  const maxTicks = 1800;
  for (let i=0; i<maxTicks; i++) {
    // Match the pure-engine action at exactly the first eligible 14.0s tick.
    if (breathRemoval && i===140) {
      assert.equal(await evaluate("document.querySelector('.breath-banner')?.textContent.includes('Un cambio disponible')"),true,
        "One-time passage must be announced before use");
      assert.equal(await evaluate("document.querySelector('.presets button')?.disabled"),true,
        "Midgame passage must never unlock unrestricted preset changes");
      const before=await evaluate("document.querySelector('.toolbar .label')?.textContent");
      await pressPost("Cambiar zona del plano");
      await pressPost("Mover al poste de arriba",2);
      await pressPost("Mover al poste de la derecha",4);
      assert.match(await evaluate("document.querySelector('.mobile-post-control-heading')?.textContent"),/seguridad.*4:9/i);
      await pressPost("Seleccionar poste enfocado");
      await pressPost("Mover al poste de la derecha");
      await pressPost("Seleccionar poste enfocado");
      assert.equal(await evaluate("document.querySelector('.breath-banner strong')?.textContent.includes('1/1 usado')"),true);
      const edited=await evaluate("document.querySelector('.toolbar .label')?.textContent");
      assert.notEqual(edited,before,"Browser R06 action did not change the map");
      const index=layout[breathRemoval.grid].findIndex(edge=>edge.from===breathRemoval.from&&edge.to===breathRemoval.to);
      assert.ok(index>=0,"Independent engine could not find the browser belt");
      layout[breathRemoval.grid].splice(index,1);
      sim={...sim,breathEdits:1};
      await pressPost("Seleccionar poste enfocado");
      await pressPost("Mover al poste de la derecha");
      await pressPost("Seleccionar poste enfocado");
      assert.equal(await evaluate("document.querySelector('.toolbar .label')?.textContent"),edited,
        "A second unearned edit changed the map");
    }
    sim = tick(sim, layout, roundId);
    const ui = await evaluate("window.__gateflowAudit.step()");
    const expected = expectedMetrics(sim, roundId);
    assert.deepEqual(ui, expected, `Visual/engine divergence ${roundId} tick ${i+1}`);
    assert.equal(new Set(sim.events.map((event)=>event.id)).size,sim.events.length,
      `${roundId} duplicated incident ID at tick ${i+1}`);
    assert.equal(sim.spawned, sim.agents.length);
    assert.equal(sim.spawned, expected.active + sim.cleared + sim.failed + sim.turnedAway + sim.abandoned);
    const resolved=TARGET-expected.remaining;
    const awaitingArrival=TARGET-sim.spawned;
    const allPending=expected.active+awaitingArrival;
    assert.equal(awaitingArrival+sim.spawned,TARGET);
    assert.equal(resolved+allPending,TARGET,`${roundId} unresolved player count at tick ${i+1}`);
    assert.ok(awaitingArrival>=0 && expected.active>=0 && resolved>=0);
    const scoring=scoreShiftBreakdown({processed:sim.cleared,elapsed:scoredElapsed(roundId,sim.elapsed),
      retries:sim.retries,target:TARGET,turnedAway:sim.turnedAway,abandoned:sim.abandoned,
      complete:expected.finished,smartSwitches:sim.queueSwitches,repairs:sim.repairs,
      faultsLeft:sim.faults.filter((f)=>!f.repaired).length});
    assert.equal(scoring.total,expected.score,`${roundId} score-ledger discrepancy at tick ${i+1}`);
    const image = await screenshot(`${roundId}/tick-${String(i+1).padStart(4,"0")}`, {clip});
    hashes.add(image); ticks++;
    const phases = Object.fromEntries([...new Set(sim.agents.map((a)=>a.stage))]
      .map((stage)=>[stage,sim.agents.filter((a)=>a.stage===stage).length]));
    rows.push(JSON.stringify({tick:i+1,elapsed:+sim.elapsed.toFixed(3),spawned:sim.spawned,
      awaitingArrival,resolved,active:expected.active,remaining:expected.remaining,
      allPending,
      cleared:sim.cleared,turnedAway:sim.turnedAway,abandoned:sim.abandoned,failed:sim.failed,
      queued:expected.queued,retries:sim.retries,switches:sim.queueSwitches,repairs:sim.repairs,breathEdits:sim.breathEdits,
      score:expected.score,scoring,phases,feed:expected.feed,
      events:sim.events.map((event)=>({id:event.id,title:event.title})),frameSha256:image}));
    if ((i+1) % 100 === 0) console.info("TICK_VISUAL_PROGRESS "+JSON.stringify({roundId,tick:i+1,
      spawned:sim.spawned,active:expected.active,resolved,remaining:expected.remaining,score:expected.score}));
    if (!sim.running) break;
  }
  assert.equal(sim.running,false,`${roundId} did not finish within ${maxTicks*DT}s`);
  if(expectedElapsed!==null)assert.equal(+sim.elapsed.toFixed(1),expectedElapsed);
  assert.equal(expectedMetrics(sim,roundId).score,expectedScore);
  assert.ok(hashes.size > ticks/3,`${roundId} canvas appears frozen: ${hashes.size}/${ticks} unique frames`);
  if (breathRemoval) {
    assert.match(await evaluate("document.querySelector('.debrief')?.textContent"),/desafío compartido conserva tu plano/i);
    await evaluate("Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{window.__gateflowCapturedShare=value;}}})");
    await clickButton("Copiar desafío");
    const card=await evaluate("window.__gateflowCapturedShare");
    assert.ok(card,"R06 did not copy the challenge");
    const sharedUrl=new URL(card.trim().split("\n").at(-1));
    assert.equal(sharedUrl.searchParams.get("round"),"r06");
    assert.equal(sharedUrl.searchParams.get("rules"),"waves-1");
    assert.equal(sharedUrl.searchParams.get("beat"),String(expectedScore));
    assert.equal(sharedUrl.searchParams.get("layout"),encodeLayout(sourceLayout,15,12),
      "Shared a post-edit map as if it had been the starting map");
    assert.ok(card.includes(`Diseño ${layoutFingerprint(sourceLayout)}`));
  }
  await screenshot(`${roundId}/debrief`, {full:true});
  await writeFile(path.join(evidence,roundId,"state-trace.ndjson"),rows.join("\n")+"\n");
  return {roundId,ticks,uniqueFrames:hashes.size,elapsed:+sim.elapsed.toFixed(1),
    cleared:sim.cleared,abandoned:sim.abandoned,score:expectedScore,breathEdits:sim.breathEdits,
    verifiedEveryTick:true,canvasClip:clip};
}

try {
  await mkdir(evidence,{recursive:true});
  const port = await new Promise((resolve,reject) => {
    server = createServer(async (req,res) => {
      try {
        const url=new URL(req.url,"http://localhost");
        if (!url.pathname.startsWith("/gategame/")) {res.writeHead(404);res.end();return;}
        const file=path.resolve(root,decodeURIComponent(url.pathname.slice(10))||"index.html");
        if (!file.startsWith(root+path.sep)) {res.writeHead(403);res.end();return;}
        const body=await readFile(file);res.writeHead(200,{"Content-Type":mime[path.extname(file)]||"application/octet-stream"});res.end(body);
      } catch {res.writeHead(404);res.end();}
    });
    server.once("error",reject);server.listen(0,"127.0.0.1",()=>resolve(server.address().port));
  });
  const binary=["google-chrome","google-chrome-stable","chromium","chromium-browser"].map((name)=>{
    try {return execFileSync("which",[name],{encoding:"utf8"}).trim();} catch {return null;}
  }).find(Boolean);
  if (!binary) throw Error("Headless Chrome is required for a genuine screenshot-per-tick audit");
  profile=await mkdtemp(path.join(tmpdir(),"gateflow-tick-"));
  let chromeDiagnostics="";
  chrome=spawn(binary,["--headless=new","--no-sandbox","--disable-dev-shm-usage","--disable-gpu",
    "--no-first-run","--disable-background-networking","--remote-allow-origins=*",
    "--remote-debugging-port=0","--user-data-dir="+profile,"about:blank"],{stdio:["ignore","ignore","pipe"]});
  chrome.stderr?.on("data",(chunk)=>{chromeDiagnostics=(chromeDiagnostics+String(chunk)).slice(-6000);});
  let cdpPort=0;
  for(let i=0;i<400;i++){
    try {cdpPort=Number((await readFile(path.join(profile,"DevToolsActivePort"),"utf8")).split("\n")[0]);if(cdpPort>0)break;} catch {}
    if(chrome.exitCode!==null)throw Error("Chrome exited early. "+chromeDiagnostics);await sleep(100);
  }
  if(!cdpPort)throw Error("Chrome debugging port not found after 40 seconds. "+chromeDiagnostics);
  const targets=await(await fetch("http://127.0.0.1:"+cdpPort+"/json")).json();
  socket=new WebSocket(targets.find((target)=>target.type==="page").webSocketDebuggerUrl);
  await new Promise((ok,fail)=>{socket.addEventListener("open",ok,{once:true});socket.addEventListener("error",fail,{once:true});});
  let nextId=0;const pending=new Map();
  socket.addEventListener("message",(event)=>{
    let msg;try{msg=JSON.parse(event.data);}catch{return;}
    if(msg.id&&pending.has(msg.id)){const req=pending.get(msg.id);clearTimeout(req.timer);pending.delete(msg.id);
      if(msg.error)req.reject(Error(msg.error.message));else req.resolve(msg.result);}
    if(msg.method==="Runtime.exceptionThrown")runtimeErrors.push(msg.params.exceptionDetails?.text);
    if(msg.method==="Network.loadingFailed"&&!msg.params.canceled)runtimeErrors.push(msg.params.errorText);
  });
  send=(method,params={})=>new Promise((resolve,reject)=>{
    const id=++nextId,timer=setTimeout(()=>{pending.delete(id);reject(Error("CDP timeout "+method));},30000);
    pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));
  });
  await send("Page.enable");await send("Runtime.enable");await send("Network.enable");
  await send("Emulation.setDeviceMetricsOverride",{width:1440,height:900,deviceScaleFactor:1,mobile:false});
  await send("Page.addScriptToEvaluateOnNewDocument",{source:clockSource});
  const url="http://127.0.0.1:"+port+"/gategame/";
  const results=[];
  for(const scenario of scenarios){await mkdir(path.join(evidence,scenario.roundId),{recursive:true});results.push(await audit(scenario,url));}
  assert.deepEqual(runtimeErrors,[],"Browser console/network errors");
  const report={sourceRevision:JSON.parse(await readFile(path.join(root,"version.json"),"utf8")).sourceRevision,
    viewport:"1440×900",stepSeconds:DT,records:results,errors:runtimeErrors};
  await writeFile(path.join(evidence,"report.json"),JSON.stringify(report,null,2)+"\n");
  console.info("TICK_VISUAL_AUDIT_PASS "+JSON.stringify(report));
} finally {
  try{socket?.close();}catch{}
  try{chrome?.kill();}catch{}
  try{server?.close();}catch{}
  if(profile)await rm(profile,{recursive:true,force:true}).catch(()=>{});
}

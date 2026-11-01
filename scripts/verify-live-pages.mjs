import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const publicBase = "https://pillb.github.io/gategame/";

export function releaseAssets(html, sha) {
  assert.match(sha,/^[0-9a-f]{40}$/,"Expected a 40-character release revision");
  assert.ok(html.includes('<meta name="gateflow-source-revision" content="'+sha+'"'),
    "Published HTML has a stale/missing source revision");
  const matches=[...html.matchAll(/(?:src|href)="(\/gategame\/assets\/[^"]+)"/g)].map(m=>m[1]);
  const assets=[...new Set(matches)];
  assert.ok(assets.some(x=>x.endsWith(".js")),"Published HTML is missing a compiled JavaScript entry");
  assert.ok(assets.some(x=>x.endsWith(".css")),"Published HTML is missing a CSS asset");
  assert.ok(!html.includes('src="/src/main.tsx"'),"Uncompiled source was published as a website");
  return assets;
}

export function checkReleaseManifest(manifest, sha) {
  assert.deepEqual([manifest?.app,manifest?.sourceRevision,manifest?.base],
    ["Gateflow",sha,"/gategame/"],"Remote manifest does not match the expected deployment");
  return manifest;
}

export function cssFontUrls(css, cssAddress) {
  return [...new Set([...css.matchAll(/url\((?:["']?)([^)"']+\.woff2)(?:["']?)\)/g)]
    .map(m=>new URL(m[1],cssAddress).toString()))];
}

async function get(url) {
  const response=await fetch(url,{headers:{"Cache-Control":"no-cache","Pragma":"no-cache"},
    signal:AbortSignal.timeout(15000)});
  assert.ok(response.ok,"HTTP "+response.status+" for "+url);
  return {content:await response.text(),type:response.headers.get("content-type")||""};
}

export async function verifyLivePages(sha) {
  assert.match(sha,/^[0-9a-f]{40}$/);
  const bust="?release_sha="+sha;
  const manifest=JSON.parse((await get(publicBase+"version.json"+bust)).content);
  checkReleaseManifest(manifest,sha);
  const html=(await get(publicBase+bust)).content;
  const paths=releaseAssets(html,sha);
  const checked=[];
  for(const asset of paths){
    const address=new URL(asset,publicBase).toString();
    const response=await get(address+bust);
    if(asset.endsWith(".js"))assert.match(response.type,/javascript|ecmascript/i,"JS MIME type mismatch");
    if(asset.endsWith(".css")){
      assert.match(response.type,/text\/css/i,"CSS MIME type mismatch");
      const fontUrls=cssFontUrls(response.content,address);
      assert.ok(fontUrls.length>0,"Compiled CSS has no bundled local font references");
      for(const font of fontUrls){await get(font+bust);checked.push(font);}
    }
    checked.push(address);
  }
  return {sha,site:publicBase,files:checked,manifest:manifest.version};
}

async function main() {
  const sha=process.env.GITHUB_SHA;
  assert.match(sha||"",/^[0-9a-f]{40}$/,"GITHUB_SHA is required");
  let last;
  for(let attempt=1;attempt<=12;attempt++){
    try{
      const verified=await verifyLivePages(sha);
      console.info("REMOTE_PAGES_VERIFIED "+JSON.stringify({...verified,attempt}));
      return;
    }catch(error){
      last=error;
      console.warn("REMOTE_PAGES_RETRY "+attempt+" "+String(error));
      if(attempt<12)await new Promise(resolve=>setTimeout(resolve,10000));
    }
  }
  throw last;
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  await main();
}

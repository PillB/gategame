import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const out = path.resolve("dist/pages");

test("GitHub Pages build has an entrypoint and base-safe bundled assets", async () => {
  const html = await readFile(path.join(out, "index.html"), "utf8");
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /<html lang="es-PE">/);
  assert.match(html, /Gateflow: Estrategia de colas aeroportuarias/);
  assert.doesNotMatch(html, /codex-preview|\/workspace\/sites\//i);
  assert.match(html, /(?:src|href)="\/gategame\/assets\/[^\"]+"/);
  const version = JSON.parse(await readFile(path.join(out, "version.json"), "utf8"));
  assert.match(version.sourceRevision, /^[0-9a-f]{40}$/);
  if (process.env.GITHUB_SHA) assert.equal(version.sourceRevision, process.env.GITHUB_SHA);
  const packageJson = JSON.parse(await readFile(path.resolve("package.json"), "utf8"));
  assert.deepEqual(version, { app: "Gateflow", version: packageJson.version, sourceRevision: version.sourceRevision, base: "/gategame/" });
  assert.match(html, new RegExp(`<meta name="gateflow-source-revision" content="${version.sourceRevision}"`));

  const assets = await readdir(path.join(out, "assets"));
  assert.ok(assets.some((name) => name.endsWith(".js")), "JavaScript bundle missing");
  assert.ok(assets.some((name) => name.endsWith(".css")), "Stylesheet bundle missing");
  assert.ok(assets.some((name) => name.endsWith(".woff2")), "Local font bundle missing");
  assert.ok((await stat(path.join(out, "favicon.svg"))).size > 0, "Favicon missing");
  for (const name of assets.filter((name) => name.endsWith(".css"))) {
    const css = await readFile(path.join(out, "assets", name), "utf8");
    assert.doesNotMatch(css, /\/workspace\/sites\//i, `Absolute local font path leaked into ${name}`);
  }
});

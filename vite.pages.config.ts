import { readFileSync, statSync } from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const base = "/gategame/";
const projectRoot = process.cwd();
const packageVersion = JSON.parse(readFileSync(path.join(projectRoot, "package.json"), "utf8")).version;

// No child process: the Site build sandbox may deny spawnSync even for `git`.
function checkedOutRevision() {
  const gitEntry = path.join(projectRoot, ".git");
  const gitDir = statSync(gitEntry).isDirectory()
    ? gitEntry
    : path.resolve(projectRoot, readFileSync(gitEntry, "utf8").trim().replace(/^gitdir:\s*/, ""));
  const head = readFileSync(path.join(gitDir, "HEAD"), "utf8").trim();
  if (/^[0-9a-f]{40}$/.test(head)) return head;
  const ref = head.match(/^ref:\s+(.+)$/)?.[1];
  if (!ref) throw new Error("Could not resolve the Git HEAD reference");
  try {
    return readFileSync(path.join(gitDir, ref), "utf8").trim();
  } catch {
    const packed = readFileSync(path.join(gitDir, "packed-refs"), "utf8");
    return packed.split("\n").find((line) => line.endsWith(` ${ref}`))?.split(" ")[0] || "";
  }
}

const revision = process.env.GITHUB_SHA || checkedOutRevision();
if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error("A 40-character Git commit SHA is required for a traceable Pages artifact");

// Public GitHub Pages project route: https://<owner>.github.io/gategame/
// This is intentionally separate from the Vinext/Cloudflare Sites build.
export default defineConfig({
  base,
  plugins: [
    react(),
    {
      name: "gateflow-release-trace",
      transformIndexHtml: (html: string) => html.replace(
        "</head>",
        `  <meta name="gateflow-source-revision" content="${revision}" />\n  </head>`,
      ),
      generateBundle() {
        this.emitFile({
          type: "asset",
          fileName: "version.json",
          source: `${JSON.stringify({ app: "Gateflow", version: packageVersion, sourceRevision: revision, base }, null, 2)}\n`,
        });
      },
    },
  ],
  resolve: { alias: { "@": projectRoot } },
  build: { outDir: "dist/pages", emptyOutDir: true, sourcemap: false },
});

// CI gate, not a complexity score. The negative control ensures this rule
// actually rejects an intentionally high-branch function.
import assert from "node:assert/strict";
import { ESLint } from "eslint";

const eslint = new ESLint();
const libReports = await eslint.lintFiles(["lib/**/*.js"]);
const errors = libReports.flatMap((r) => r.messages
  .filter((m) => m.severity === 2)
  .map((m) => `${r.filePath}:${m.line}:${m.column} [${m.ruleId}] ${m.message}`));
if (errors.length) throw new Error("Complexity lint or other static rule failed:\n" + errors.join("\n"));

const path = "lib/__complexity_negative_control__.js";
const excessive = "export function tooComplex(n) {" +
  Array.from({ length: 25 }, (_, i) => `if (n === ${i}) return ${i};`).join("") +
  "return -1; }";
const negative = (await eslint.lintText(excessive, { filePath: path }))[0];
assert.ok(negative.messages.some((m) => m.ruleId === "complexity" && m.severity === 2),
  "chore(lint) is not enforcing the 20-branch complexity ceiling: the negative control survived");

const simple = (await eslint.lintText(
  "export function simple(n) { return n > 0 ? 1 : 0; }",
  { filePath: path },
))[0];
assert.ok(!simple.messages.some((m) => m.ruleId === "complexity"),
  "A basic branch is unexpectedly rejected by the complexity rule");

console.info("CHORE_LINT_COMPLEXITY_PASS " + JSON.stringify({
  ceiling: 20, scanned: libReports.length, rejectedComplexMutation: true, acceptedSimple: true,
}));

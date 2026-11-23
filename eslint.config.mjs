import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Every new round/challenge/engine helper in lib/ must remain understandable.
  // Legacy app/page.tsx mixes the React UI and simulation engine and has a
  // separately tracked extraction debt; do not silently raise this limit.
  {
    files: ["lib/**/*.js"],
    rules: { complexity: ["error", { max: 20 }] },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The figurelib test project's Python virtualenv (vendored JS inside matplotlib).
    "figurelib/.venv/**",
    // wrangler's local build output (wrangler pages dev, npm run dev:full).
    ".wrangler/**",
  ]),
]);

export default eslintConfig;

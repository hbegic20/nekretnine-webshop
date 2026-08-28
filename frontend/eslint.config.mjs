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
    // MapLibre's worker, copied in from node_modules before every dev and
    // build (scripts/copy-map-worker.mjs). It is vendor code that happens to
    // live under public/, and linting it produces a thousand warnings about
    // somebody else's minified bundle.
    "public/maplibre/**",
  ]),
]);

export default eslintConfig;

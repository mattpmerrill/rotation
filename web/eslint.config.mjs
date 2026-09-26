import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Layer rules (see ARCHITECTURE.md). Each layer may import only from the layers below it:
 *
 *   app  ->  features  ->  data  ->  domain  ->  lib
 *                  \-> ui --------------/
 *
 * - domain: pure rules and math. No React, no Next, no I/O.
 * - data:   Supabase, Discord, env. Never imports features, ui or app.
 * - ui:     presentational components. Never touches data or features.
 * - features: one folder per feature; a feature never imports another feature.
 * - app:    routes compose features. Only data/viewer (the access check) is imported directly.
 */
const layer = (files, patterns) => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns }] },
});

const noFramework = [
  { group: ["react", "react-dom", "react/*", "next", "next/*"], message: "domain and lib are framework-free." },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  layer(["src/lib/**"], [...noFramework, { group: ["@/*"], message: "lib imports nothing from the app." }]),
  layer(
    ["src/domain/**"],
    [
      ...noFramework,
      { group: ["@/data/*", "@/features/*", "@/ui/*", "@/app/*"], message: "domain is pure: only @/domain and @/lib." },
    ],
  ),
  layer(["src/data/**"], [{ group: ["@/features/*", "@/ui/*", "@/app/*"], message: "data is below features and ui." }]),
  layer(
    ["src/ui/**"],
    [{ group: ["@/data/*", "@/features/*", "@/app/*"], message: "ui is presentational: pass data in as props." }],
  ),
  layer(
    ["src/features/**"],
    [
      {
        group: ["@/features/*", "../../*"],
        message: "Features don't import each other. Compose them in app/, or move shared code down a layer.",
      },
      { group: ["@/app/*"], message: "features are below app." },
    ],
  ),
  layer(
    ["src/app/**", "src/proxy.ts"],
    [
      {
        group: ["@/data/*", "!@/data/viewer", "!@/data/session"],
        message: "Pages reach data through features (only data/viewer for access checks).",
      },
    ],
  ),
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/data/database.types.ts"]),
]);

export default eslintConfig;

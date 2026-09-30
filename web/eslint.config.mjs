import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

/**
 * Layer rules (see docs/architecture.md). Each layer may import only from the layers below it:
 *
 *   app -> features -> data ---------> domain -> lib
 *      \          \-> integrations --/
 *       \-> ui (features use ui too) -> domain
 *
 * - domain: pure rules and math. No React, no Next, no I/O.
 * - data: repositories (Supabase), env, failure translation. Imports only domain and lib.
 * - integrations: one adapter per outside vendor. Imports only domain and lib.
 * - ui: presentational components. Never touches data, integrations or features.
 * - features: one folder per feature; a feature never imports another feature. The only layer
 *   that imports data and integrations.
 * - app: routes compose features. Never imports data or integrations.
 */
const layer = (files, patterns) => ({
  files,
  rules: { "no-restricted-imports": ["error", { patterns }] },
});

const noFramework = [
  { group: ["react", "react-dom", "react/*", "next", "next/*"], message: "domain and lib are framework-free." },
];

/**
 * The frontend standard: no literal colour, radius, shadow or z-index in UI code. Use the tokens in
 * globals.css (bg-surface, text-btc, rounded-*, shadow-*); if the value you need is not on a
 * scale, add it to the scale.
 *
 * A ratchet: these files already had literals when the rule arrived (2026-09-28). The list may
 * only shrink. Do not add a file to it; fix the literal or add the token. Removing a file from
 * the list (after cleaning it) is the only change that should ever touch it.
 */
const LITERALS_STILL_PRESENT = [
  "src/app/(challenge)/page.tsx",
  "src/features/leaderboard/components/leaderboard-list.tsx",
  "src/features/picker/components/coin-picker.tsx",
  "src/features/picks/components/pick-card.tsx",
  "src/features/timing/components/timing-verdict.tsx",
  "src/features/trades/components/trade-form.tsx",
  "src/ui/button.tsx",
  "src/ui/coin-icon.tsx",
  "src/ui/medal.tsx",
  "src/ui/wordmark.tsx",
  "src/ui/charts/timing-chart.tsx",
];

/** Permanent, with a reason: the Google sign-in button must use Google's exact brand colours,
 *  and the viewport theme colour is a meta tag value that cannot reference a CSS variable. */
const LITERALS_ALLOWED = ["src/features/auth/components/login-form.tsx", "src/app/layout.tsx"];

const HEX = "#[0-9a-fA-F]{3,8}\\b";
const FN = "\\b(?:rgb|rgba|hsl|hsla|oklch)\\(";
const ARBITRARY = "\\b(?:z|rounded|shadow)-\\[";
const PALETTE =
  "\\b(?:bg|text|border|ring|from|to|via|fill|stroke)-(?:red|green|blue|yellow|orange|amber|lime|teal|cyan|sky|indigo|violet|purple|pink|rose|fuchsia|slate|gray|zinc|neutral|stone)-\\d{2,3}\\b";
const literalSelectors = (pattern, message) => [
  { selector: `Literal[value=/${pattern}/]`, message },
  { selector: `TemplateElement[value.raw=/${pattern}/]`, message },
];
const noLiterals = [
  ...literalSelectors(HEX, "No hex colour: use a token from globals.css (the frontend standard)."),
  ...literalSelectors(FN, "No literal colour function: use a token from globals.css (the frontend standard)."),
  ...literalSelectors(ARBITRARY, "No literal radius, shadow or z-index: add it to the scale (the frontend standard)."),
  ...literalSelectors(PALETTE, "No raw palette class: use the design tokens (the frontend standard)."),
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  layer(["src/lib/**"], [...noFramework, { group: ["@/*"], message: "lib imports nothing from the app." }]),
  layer(
    ["src/domain/**"],
    [
      ...noFramework,
      {
        group: ["@/data/*", "@/features/*", "@/ui/*", "@/app/*", "@/integrations/*"],
        message: "domain is pure: only @/domain and @/lib.",
      },
    ],
  ),
  layer(
    ["src/data/**"],
    [
      {
        group: ["@/features/*", "@/ui/*", "@/app/*", "@/integrations/*"],
        message: "data is below features and ui, and does not reach vendors: a feature passes the vendor call in.",
      },
    ],
  ),
  layer(
    ["src/integrations/**"],
    [
      {
        group: ["@/data/*", "@/features/*", "@/ui/*", "@/app/*"],
        message: "An integration adapter imports only @/domain and @/lib.",
      },
    ],
  ),
  layer(
    ["src/ui/**"],
    [
      {
        group: ["@/data/*", "@/integrations/*", "@/features/*", "@/app/*"],
        message: "ui is presentational: pass data in as props.",
      },
    ],
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
        group: ["@/data/*", "@/integrations/*"],
        message: "Routes reach data and vendors through features: call a feature query, action or guard.",
      },
    ],
  ),
  {
    // The TypeScript standard: non-null assertions are prohibited outside generated code. Handle the
    // missing case, or use defined() from @/lib/defined where its absence would be a bug.
    files: ["src/**/*.{ts,tsx}"],
    rules: { "@typescript-eslint/no-non-null-assertion": "error" },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: [...LITERALS_STILL_PRESENT, ...LITERALS_ALLOWED, "**/*.test.ts", "src/data/database.types.ts"],
    rules: { "no-restricted-syntax": ["error", ...noLiterals] },
  },
  {
    // The configuration standard: environment variables are parsed and validated once, in one module.
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/data/env.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        { object: "process", property: "env", message: "Read configuration through env() in @/data/env." },
      ],
    },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "src/data/database.types.ts"]),
]);

export default eslintConfig;

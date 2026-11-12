import { dirname } from "path";
import { fileURLToPath } from "url";
import { readFileSync } from "fs";
import { FlatCompat } from "@eslint/eslintrc";
// The entry point typescript-eslint itself uses to reach ESLint's built-in rules.
import { builtinRules } from "eslint/use-at-your-own-risk";
import { importDirectionConfig } from "./scripts/lib/import-rules.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

// Today's wrong-way imports, per rule. The list may only shrink
// (tests/unit/guardrails/import-rules.test.ts).
const importRuleExceptions = JSON.parse(
  readFileSync(new URL("./tests/unit/guardrails/import-rule-exceptions.json", import.meta.url), "utf8"),
).rules;

// Files written by a tool: not ours to lint (tests/unit/guardrails/generated-files.test.ts).
const generatedFiles = Object.keys(
  JSON.parse(readFileSync(new URL("./tests/unit/guardrails/generated-files.json", import.meta.url), "utf8")).files,
);

const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ...generatedFiles,
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "scripts/**",
      // Node CJS SQL harnesses, run with `node`, not bundled — same class as scripts/**
      "tests/sql/**",
      ".worktrees/**",
      ".claude/worktrees/**",
      "webnegosyo-desktop/out/**",
      // Remotion marketing videos — standalone package with its own deps
      "videos/**",
      // White-label customer app — Expo project with its own lint (npx expo lint)
      "customer-app/**",
    ],
  },
  // Which way imports may point (scripts/lib/import-rules.mjs holds the rules):
  // lib and platform never import components or app, and so on.
  ...importDirectionConfig(importRuleExceptions, {
    restrictedImports: builtinRules.get("no-restricted-imports"),
    restrictedSyntax: builtinRules.get("no-restricted-syntax"),
  }),
];

export default eslintConfig;

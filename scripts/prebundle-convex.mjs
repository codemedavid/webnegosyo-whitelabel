#!/usr/bin/env node

/**
 * Pre-bundles the Convex template into a push-ready JSON file.
 *
 * This script compiles all TypeScript files in convex-template/convex/ using
 * esbuild and outputs a JSON bundle that can be pushed to any Convex deployment
 * via the HTTP push API — no CLI needed at runtime.
 *
 * Run this script whenever convex-template/ files change:
 *   npm run convex:prebundle
 *
 * The output (src/lib/convex-push-bundle.json) should be committed to the repo.
 */

import { build } from "esbuild";
import { readFileSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONVEX_DIR = join(ROOT, "convex-template", "convex");
const OUTPUT_FILE = join(ROOT, "src", "lib", "convex-push-bundle.json");

// Read the installed convex version for udfServerVersion
const convexPkg = JSON.parse(
  readFileSync(join(ROOT, "node_modules", "convex", "package.json"), "utf-8")
);
const convexVersion = convexPkg.version;

/**
 * Compile a single TypeScript file to JavaScript using esbuild.
 * Keeps convex/* imports external (resolved by Convex runtime).
 * _generated/* imports are inlined so we don't push raw _generated files
 * (the Convex runtime rejects bare "convex/server" specifiers in raw modules).
 */
async function compileModule(filePath) {
  const result = await build({
    entryPoints: [filePath],
    bundle: true,
    write: false,
    format: "esm",
    target: "esnext",
    platform: "browser",
    external: ["convex", "convex/*"],
    sourcemap: "external",
    outfile: "out.js",
    logLevel: "silent",
  });

  const jsFile = result.outputFiles.find((f) => f.path.endsWith(".js"));
  const mapFile = result.outputFiles.find((f) => f.path.endsWith(".map"));

  return {
    source: jsFile.text,
    sourceMap: mapFile?.text,
  };
}

async function main() {
  console.log("Bundling Convex template...");
  console.log(`  Convex version: ${convexVersion}`);
  console.log(`  Source: ${CONVEX_DIR}`);

  // 1. Compile user TypeScript files (excluding _generated/)
  const tsFiles = readdirSync(CONVEX_DIR).filter(
    (f) => f.endsWith(".ts") && !f.startsWith("_")
  );

  const modules = [];

  for (const file of tsFiles) {
    const filePath = join(CONVEX_DIR, file);
    const jsName = file.replace(".ts", ".js");
    const compiled = await compileModule(filePath);

    modules.push({
      path: jsName,
      source: compiled.source,
      sourceMap: compiled.sourceMap,
      environment: "isolate",
    });

    console.log(`  Compiled: ${file} -> ${jsName}`);
  }

  // _generated/ files are NOT included as separate modules — they get inlined
  // into each user module by esbuild. The Convex runtime rejects bare
  // "convex/server" specifiers in raw module files.

  // 2. Separate schema module from function modules
  const schemaModule = modules.find((m) => m.path === "schema.js") || null;
  const functionModules = modules.filter((m) => m.path !== "schema.js");

  // 3. Build the push bundle (matches Convex startPushRequest format)
  const bundle = {
    functions: "convex",
    appDefinition: {
      definition: null,
      dependencies: [],
      schema: schemaModule,
      changedModules: functionModules,
      unchangedModuleHashes: [],
      udfServerVersion: convexVersion,
    },
    componentDefinitions: [],
    nodeDependencies: [],
    // Metadata for tracking
    _meta: {
      generatedAt: new Date().toISOString(),
      convexVersion,
      sourceFiles: tsFiles,
    },
  };

  writeFileSync(OUTPUT_FILE, JSON.stringify(bundle));
  console.log(`\nBundle written to: ${OUTPUT_FILE}`);
  console.log(
    `  Size: ${(Buffer.byteLength(JSON.stringify(bundle)) / 1024).toFixed(1)} KB`
  );
  console.log(`  Modules: ${modules.length}`);
}

main().catch((err) => {
  console.error("Failed to prebundle Convex template:", err);
  process.exit(1);
});

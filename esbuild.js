const esbuild = require("esbuild");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const esbuildErrorReporterPlugin = {
  name: "esbuild-error-reporter",
  setup(build) {
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
    });
  },
};

async function main() {
  const mainCtx = await esbuild.context({
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    logLevel: "silent",
    plugins: [esbuildErrorReporterPlugin],
    entryPoints: ["src/VSBloom.ts"],
    outfile: "build/VSBloom.js",
    external: ["vscode"],
  });

  const elevatedPatcherCtx = await esbuild.context({
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    logLevel: "silent",
    plugins: [esbuildErrorReporterPlugin],
    entryPoints: ["src/ElevatedClientPatcher.ts"],
    outfile: "build/ElevatedClientPatcher.js",
    external: [],
  });

  if (watch) {
    console.log("[watch] build started");
    await Promise.all([mainCtx.rebuild(), elevatedPatcherCtx.rebuild()]);
    console.log("[watch] build finished");

    await Promise.all([mainCtx.watch(), elevatedPatcherCtx.watch()]);
    console.log("[watch] watching for changes...");
  } else {
    console.log("[watch] build started");
    await Promise.all([mainCtx.rebuild(), elevatedPatcherCtx.rebuild()]);
    console.log("[watch] build finished");
    await Promise.all([mainCtx.dispose(), elevatedPatcherCtx.dispose()]);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

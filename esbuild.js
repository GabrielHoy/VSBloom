const esbuild = require("esbuild");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

const copyInjectedPlugin = {
  name: "copy-injected",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) {
        const srcDir = path.join(__dirname, "src", "Injected");
        const destDir = path.join(__dirname, "build", "Injected");
        
        // Remove old Injected folder if it exists
        if (fs.existsSync(destDir)) {
          fs.rmSync(destDir, { recursive: true });
        }
        
        // Copy fresh
        copyDir(srcDir, destDir);
        console.log("[copy-injected] Copied Injected folder to build/Injected");
      }
    });
  },
};

const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        if (location) {
          console.error(`    ${location.file}:${location.line}:${location.column}:`);
        }
      });
      console.log("[watch] build finished");
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/VSBloom.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "build/VSBloom.js",
    external: ["vscode"],
    logLevel: "silent",
    plugins: [
      copyInjectedPlugin,
      esbuildProblemMatcherPlugin,
    ],
  });

  if (watch) {
    await ctx.watch();
    console.log("[watch] watching for changes...");
  } else {
    await ctx.rebuild();
    await ctx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

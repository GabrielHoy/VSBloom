const esbuild = require("esbuild");
const fs = require("fs");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const buildBanners = {
  "build/VSBloom.js": `/* VS: Bloom Main Extension */\n//\n//Hi!\n//\n//This is the main VSBloom extension that runs within the VSCode Extension Host.\n//It's responsible for bootstrapping and managing the VSBloom Bridge Server,\n//as well as applying patches to VSCode's Electron Client to facilitate various effects and modifications\n//to the VSCode application UI.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what the extension-side of VSBloom does or how it works\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
  "build/VSBloomClient.js": `/* VS: Bloom Client */\n//\n//Hi!\n//\n//This is the client at the core of VSBloom.\n//It's a small runtime that attempts to establish a WebSocket connection to the *actual* VSBloom extension\n//running inside of VSCode, creating a critical bridge between the VSCode Extension Host and the Electron Client which renders your VSCode application.\n//Once that connection is made, the client can send and receive data from the extension in real-time\n//to facilitate dynamically loading and unloading 'effects' and modifications to\n//the VSCode application UI, as well as maintaining real-time synchronization of things like user settings and preferences.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what the client does or how it works\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
  "build/ElevatedClientPatcher.js": `/* VS: Bloom Elevated Client Patcher */\n//\n//Hi!\n//\n//This is a NodeJS script designed to be run within an environment\n//that has elevated privileges, it is exclusively used in the event\n//of VSBloom running into permission errors when patching the Electron Client,\n//this normally doesn't require any elevation, but if VSCode is\n//installed system-wide instead of being local to the user, its files will\n//be located within a system directory(varying based on OS and 'flavor' of VSCode) which unfortunately\n//requires process elevation to be able to perform file read/write operations inside of.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what the elevated patcher does or how it works\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
};

const esbuildOneLinerPlugin = {
  name: "esbuild-single-line",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.outputFiles) {
        return;
      }
      const outFile = build.initialOptions.outfile;
      if (!outFile || !fs.existsSync(outFile)) {
        return;
      }
      console.log(`[build]   collapsing "${outFile}" to single line...`);

      try {
        const { minify } = await import("terser");
        
        let code = fs.readFileSync(outFile, "utf8");
        
        const terserResult = await minify(code, {
          compress: { booleans_as_integers: true },
          mangle: false,
          format: {
            comments: /^!|@license|@preserve/i, // Keep license/preserve comments
            semicolons: true,
            beautify: false,
            max_line_len: false,
          },
        });

        if (terserResult.code) {
          const singleLine = (buildBanners[outFile] ? buildBanners[outFile] + "\n" : "") + terserResult.code
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join(" ");
          
          fs.writeFileSync(outFile, singleLine, "utf8");
          console.log(`[build]     - collapsed "${outFile}" to ${singleLine.length} chars`);
        }
      } catch (err) {
        console.error(`[build] Failed to collapse "${outFile}":`, err.message);
      }
    });
  },
};

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
  //main actual extension which runs within the vscode extension host
  const mainCtx = await esbuild.context({
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    logLevel: "silent",
    plugins: [esbuildErrorReporterPlugin, production ? esbuildOneLinerPlugin : undefined].filter(Boolean),
    entryPoints: ["src/VSBloom.ts"],
    outfile: "build/VSBloom.js",
    external: ["vscode"],
    banner: production ? {
      js: buildBanners["build/VSBloom.js"]
    } : undefined
  });

  //elevated patcher script, required if the vsc client is installed system-wide
  const elevatedPatcherCtx = await esbuild.context({
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    logLevel: "silent",
    plugins: [esbuildErrorReporterPlugin, production ? esbuildOneLinerPlugin : undefined].filter(Boolean),
    entryPoints: ["src/Patcher/ElevatedClientPatcher.ts"],
    outfile: "build/ElevatedClientPatcher.js",
    external: [],
    banner: production ? {
      js: buildBanners["build/ElevatedClientPatcher.js"]
    } : undefined
  });

  //the actual client that gets patched into the electron renderer/workbench.html
  const clientCtx = await esbuild.context({
    bundle: true,
    format: "iife",
    globalName: "VSBloomClient",
    minify: production,
    sourcemap: false, //no sourcemaps necessary for the patched client
    sourcesContent: false,
    platform: "browser",
    target: ["chrome120"], //electron's Chromium version
    logLevel: "silent",
    plugins: [esbuildErrorReporterPlugin, production ? esbuildOneLinerPlugin : undefined].filter(Boolean),
    entryPoints: ["src/ExtensionBridge/Client.ts"],
    outfile: "build/VSBloomClient.js",
    banner: production ? {
      js: buildBanners["build/VSBloomClient.js"]
    } : undefined
  });

  const allContexts = [mainCtx, elevatedPatcherCtx, clientCtx];

  if (watch) {
    console.log("[watch] build started");
    await Promise.all(allContexts.map(ctx => ctx.rebuild()));
    console.log("[watch] build finished");

    await Promise.all(allContexts.map(ctx => ctx.watch()));
    console.log("[watch] watching for changes...");
  } else {
    console.log("[build] build started");
    await Promise.all(allContexts.map(ctx => ctx.rebuild()));
    console.log("[build] build finished");
    await Promise.all(allContexts.map(ctx => ctx.dispose()));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

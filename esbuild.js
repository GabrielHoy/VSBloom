const esbuild = require("esbuild");
const chokidar = require("chokidar");
const fs = require("fs");
const path = require("path");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

const effectsDir = "src/Effects";
const effectsBuildDir = "build/Effects";
const effectNameSentinel = "<EFFECT_NAME_SENTINEL>";
const buildBanners = {
  "build/VSBloom.js": `/* VS: Bloom Main Extension */\n//\n//Hi!\n//\n//This is the main VSBloom extension that runs within the VSCode Extension Host.\n//It's responsible for bootstrapping and managing the VSBloom Bridge Server,\n//as well as applying patches to VSCode's Electron Client to facilitate various effects and modifications\n//to the VSCode application UI.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what the extension-side of VSBloom does or how it works\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
  "build/VSBloomClient.js": `/* VS: Bloom Client */\n//\n//Hi!\n//\n//This is the client at the core of VSBloom.\n//It's a small runtime that attempts to establish a WebSocket connection to the *actual* VSBloom extension\n//running inside of VSCode, creating a critical bridge between the VSCode Extension Host and the Electron Client which renders your VSCode application.\n//Once that connection is made, the client can send and receive data from the extension in real-time\n//to facilitate dynamically loading and unloading 'effects' and modifications to\n//the VSCode application UI, as well as maintaining real-time synchronization of things like user settings and preferences.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what the client does or how it works\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
  "build/ElevatedClientPatcher.js": `/* VS: Bloom Elevated Client Patcher */\n//\n//Hi!\n//\n//This is a NodeJS script designed to be run within an environment\n//that has elevated privileges, it is exclusively used in the event\n//of VSBloom running into permission errors when patching the Electron Client,\n//this normally doesn't require any elevation, but if VSCode is\n//installed system-wide instead of being local to the user, its files will\n//be located within a system directory(varying based on OS and 'flavor' of VSCode) which unfortunately\n//requires process elevation to be able to perform file read/write operations inside of.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what the elevated patcher does or how it works\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
  "__EFFECT_JS__": `/* VS: Bloom Effect JS */\n/* Effect Name: "${effectNameSentinel}" */\n//\n//Hi!\n//\n//This is the source code for a componentized effect script that the VSBloom Extension dynamically\n//loads and unloads within the Electron Renderer's DOM.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what effects do, how they work, or how to make your own\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
  "__EFFECT_CSS__": `/* VS: Bloom Effect CSS */\n/* Effect Name: "${effectNameSentinel}" */\n/*-*/\n/* Hi! */\n/*-*/\n/* This is the source code for a componentized effect's corresponding CSS stylesheet that the VSBloom Extension dynamically */\n/* loads and unloads within the Electron Renderer's DOM. */\n/*-*/\n/* This won't be very readable within a production environment, */\n/* so if you'd like to know more about what effects or this CSS does, how effects work, or how to make your own */\n/* you should visit the GitHub repo associated with VSBloom */\n/* for an un-minified version of this file! */\n/*-*/\n/* Build Date: ${new Date().toISOString()} */\n/*-*/`,
  "build/VSBloomSharedLibs.js": `/* VS: Bloom Shared Library Provider */\n//\n//Hi!\n//\n//This rather monolithic file serves to bundle shared libraries that are used across\n//multiple effects in VSBloom; it's meant to be loaded before the VSBloom Client to ensure that\n//libraries are available immediately when effects load.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what libraries we preload, how these shared imports are loaded, or how to add your own\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
};

async function ProcessEffectCSSFileChangedDuringWatch(cssFilePath) {
  const fileName = path.basename(cssFilePath);
  const effectDir = path.dirname(cssFilePath);
  const effectName = path.basename(effectDir);
  const outputDir = path.join(effectsBuildDir, effectName);
  const outputFilePath = path.join(outputDir, fileName);

  //make sure the output directory exists
  await fs.promises.mkdir(outputDir, { recursive: true });

  try {
    const csso = await import("csso");
    const fileContents = await fs.promises.readFile(cssFilePath, "utf8");
    const minified = await csso.minify(fileContents, { comments: false });
    const fileBanner = production 
      ? buildBanners["__EFFECT_CSS__"].replace(effectNameSentinel, effectName) + "\n" 
      : "";
    
    await fs.promises.writeFile(outputFilePath, fileBanner + minified.css, "utf8");
    console.log(`[watch]   CSS updated: ${fileName} -> ${outputFilePath}`);
  } catch (err) {
    console.error(`[watch]   Failed to process CSS "${cssFilePath}":`, err.message);
  }
}

const esbuildGSAPShimmerPlugin = {
  name: 'esbuild-gsap-shim',
  setup(build) {
      const gsapShimPath = path.resolve('src/EffectLib/Shims/gsap.ts');
      
      //intercept direct gsap imports
      build.onResolve({ filter: /^gsap$/ }, () => ({
          path: gsapShimPath,
      }));
      
      //more importantly intercept gsap/* imports
      //to allow things like ScrollTrigger to work
      //without 25 individual shim files for each plugin
      build.onResolve({ filter: /^gsap\/.+$/ }, () => ({
          path: gsapShimPath,
      }));
  }
};

const esbuildEffectPlugin = {
  name: "esbuild-effect",
  setup(build) {
    build.onEnd(async (result) => {
      if (result.outputFiles) {
        return;
      }
      const outFile = build.initialOptions.outfile;
      if (!outFile || !fs.existsSync(outFile)) {
        return;
      }
      console.log(`[build]   pulling non-script files for effect "${outFile}"...`);

      try {
        const effectDirectory = path.dirname(build.initialOptions.entryPoints[0]);
        const allFilesInEffectDir = fs.readdirSync(effectDirectory);
        const fileCopyPromises = [];
        for (const file of allFilesInEffectDir) {
          if (file.endsWith(".ts")) {
            //esbuild already handled the ts bundling&compilation side of things
            continue;
          }
          if (file.endsWith("tsconfig.json")) {
            //no need to pull the tsconfig.json file, it
            //just gives the ts language server context
            //on what in the world vsbloom is doing
            continue;
          }
          if (fs.statSync(path.join(effectDirectory, file)).isDirectory()) {
            //'file' is a directory, dont copy it over since directories
            //are currently only used for TS file organization in effects
            continue;
          }

          if (file.endsWith(".css")) {
            const csso = await import("csso");
            const outputFilePath = path.join(path.dirname(outFile), file);
            
            fileCopyPromises.push(fs.promises.readFile(path.join(effectDirectory, file), "utf8").then(async (fileContents) => {
              const minified = await csso.minify(fileContents, {
                comments: false
              });
              const fileBanner = production ? buildBanners["__EFFECT_CSS__"].replace(effectNameSentinel, path.basename(effectDirectory)) + "\n" : "";
              fs.promises.writeFile(outputFilePath, fileBanner + minified.css, "utf8");
              console.log(`[build]     - minified CSS file "${file}" and copied to "${outputFilePath}"`);
            }));
          } else if (file.endsWith(".json")) {
            //json files(apart from tsconfig.json) are simply copied over
            //as-is, though without any 'pretty print' json formatting
            //if we're in a production environment - after all we're not
            //really trying to obfuscate or hide anything with them; moreso
            //just micro-optimizing to reduce file size
            const outputFilePath = path.join(path.dirname(outFile), file);
            const jsonFileContents = fs.readFileSync(path.join(effectDirectory, file), "utf8");
            try {
              const json = JSON.parse(jsonFileContents);
              const whitespaceRemoved = JSON.stringify(json, null, production ? 0 : 4);
              fs.writeFileSync(outputFilePath, whitespaceRemoved, "utf8");
              console.log(`[build]     - copied JSON file "${file}" to "${outputFilePath}"`);
            } catch (err) {
              console.error(`[build] Failed to shorten and copy JSON file "${file}":`, err.message);
            }
          } else {
            //unknown exact file type, just copy it over
            const outputFilePath = path.join(path.dirname(outFile), file);
            fileCopyPromises.push(fs.promises.copyFile(path.join(effectDirectory, file), outputFilePath).then(() => {
              console.log(`[build]     - copied "${file}" to "${outputFilePath}"`);
            }));
          }

        }

        await Promise.all(fileCopyPromises);

      } catch (err) {
        console.error(`[build] Failed to update non-script files for effect "${outFile}":`, err.message);
      }

    });
  }
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
          const fileBannerIdentifier = outFile.includes(effectsBuildDir) ? "__EFFECT_JS__" : outFile;
          let fileBanner = buildBanners[fileBannerIdentifier] ? buildBanners[fileBannerIdentifier] + "\n" : "";
          if (fileBannerIdentifier === "__EFFECT_JS__") {
            const effectName = outFile.split("/").pop().split(".")[0];
            fileBanner = fileBanner.replace(effectNameSentinel, effectName);
          }

          const singleLine = fileBanner + terserResult.code
            .split("\n")
            .map(line => line.trim())
            .filter(line => line.length > 0)
            .join(" ");
          
          fs.writeFileSync(outFile, singleLine, "utf8");
          console.log(`[build]     - collapsed "${outFile}" to ${singleLine.length.toLocaleString()} chars`);
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
  if (production) {
    //if we're building for a production environment,
    //let's make sure no lingering dev files or build
    //artifacts are left over from previous dev builds
    //no need to make this complicated, just delete
    //the build directory and let esbuild take the wheel
    if (fs.existsSync("build") && fs.statSync("build").isDirectory()) {
      await fs.promises.rm("build", { recursive: true, force: true });
    }
  }

  //main actual extension which runs within the vscode extension host
  const mainCtx = await esbuild.context({
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: production ? false : "inline",
    sourcesContent: !production,
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
    sourcemap: production ? false : "inline",
    sourcesContent: !production,
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
    sourcemap: production ? false : "inline",
    sourcesContent: !production,
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

  //shared libraries runtime - bundles libs used by effects to avoid
  //us compiling and sending huge libraries to the client over a
  //websocket connection for every effect that uses them
  //this gets patched into workbench.html before the client
  //so that libraries are available immediately when effects load
  const sharedLibsCtx = await esbuild.context({
    bundle: true,
    format: "iife",
    minify: production,
    sourcemap: production ? false : "inline",
    sourcesContent: !production,
    platform: "browser",
    target: ["chrome120"], //electron's Chromium version
    logLevel: "silent",
    plugins: [esbuildErrorReporterPlugin, production ? esbuildOneLinerPlugin : undefined].filter(Boolean),
    entryPoints: ["src/EffectLib/SharedLibraries.ts"],
    outfile: "build/VSBloomSharedLibs.js",
    banner: production ? {
      js: buildBanners["build/VSBloomSharedLibs.js"]
    } : undefined
  });

  
  //the src/Effects directory contains a variety of effects that can be loaded into the client
  //each effect is a separate directory with .ts files inside of it,
  //and each of these effects needs to be individually built and bundled
  //into corresponding <EffectDirName>.js files so that their source can be
  //loaded dynamically on the client
  const effectContexts = [];
  const effectDirectories = fs.readdirSync(effectsDir).filter(dir => fs.statSync(path.join(effectsDir, dir)).isDirectory());
  
  //delete the old effect build directory if it exists
  //so that we can make sure any old effect build files are
  //removed along with any non-script files that got
  //pulled over to pair with those built effects
  if (fs.existsSync(effectsBuildDir)) {
    await fs.promises.rm(effectsBuildDir, { recursive: true, force: true });
  }

  for (const effectDir of effectDirectories) {
    effectContexts.push(await esbuild.context({
      bundle: true,
      format: "esm",
      minify: production,
      sourcemap: production ? false : "inline",
      sourcesContent: !production,
      platform: "browser",
      target: ["chrome120"], //electron's Chromium version
      logLevel: "silent",
      plugins: [esbuildErrorReporterPlugin, production ? esbuildOneLinerPlugin : undefined, esbuildEffectPlugin, esbuildGSAPShimmerPlugin].filter(Boolean),
      entryPoints: [`src/Effects/${effectDir}/${effectDir}.ts`],
      outfile: `build/Effects/${effectDir}/${effectDir}.js`,
      //alias shared library imports to appropriate shim files, so effects can use
      //clean `import gsap from 'gsap'` syntax while the actual library
      //is pre-loaded from window.__VSBLOOM__.libs
      alias: {
        'motion': path.resolve('src/EffectLib/Shims/motion.ts'),
        'bloom': path.resolve('src/EffectLib/Shims/bloom.ts'),
        'pixi.js': path.resolve('src/EffectLib/Shims/pixi.js.ts'),
      },
      banner: production ? {
        js: buildBanners["__EFFECT_JS__"].replace(effectNameSentinel, effectDir)
      } : undefined
    }));
  }

  const allContexts = [mainCtx, elevatedPatcherCtx, clientCtx, sharedLibsCtx, ...effectContexts];

  if (watch) {
    console.log("[watch] build started");
    await Promise.all(allContexts.map(ctx => ctx.rebuild()));
    console.log("[watch] build finished");

    await Promise.all(allContexts.map(ctx => ctx.watch()));
    console.log("[watch] setting up effect CSS file watchers...");
    //watch for non-ts file changes within effect directories
    const effectAssetWatcher = chokidar.watch(
      effectDirectories.map(dir => path.join(effectsDir, dir, `${dir}.css`)),
      {
        ignoreInitial: true,  //file already copied in first build from the esbuild side
        awaitWriteFinish: {   //wait for file write to complete
          stabilityThreshold: 100,
          pollInterval: 50,
        },
      }
    );
  
    effectAssetWatcher
      .on("add", ProcessEffectCSSFileChangedDuringWatch)
      .on("change", ProcessEffectCSSFileChangedDuringWatch)
      .on("unlink", async (filePath) => {
        //css file got deleted, remove the corresponding built file
        const effectDir = path.dirname(filePath);
        const effectName = path.basename(effectDir);
        const fileName = path.basename(filePath);
        const outputFilePath = path.join(effectsBuildDir, effectName, fileName);
        
        if (fs.existsSync(outputFilePath)) {
          await fs.promises.unlink(outputFilePath);
          console.log(`[watch]   Removed deleted CSS file: ${outputFilePath}`);
        }
      });

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

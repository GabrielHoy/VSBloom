import * as esbuild from "esbuild";
import chokidar from "chokidar";
import fs from "fs";
import * as os from "os";
import path from "path";
import { Worker } from "node:worker_threads";
import * as jsonc from "jsonc-parser";
import * as Colorful from "../src/Debug/Colorful.ts";
import { IsEffectEnabled } from "./EffectBuildConfigProvider";

import { RebuildPackageFile } from "./PackageBuilder";

const isProductionBuild: boolean = process.argv.includes("--production");
const shouldWatch: boolean = process.argv.includes("--watch");

const EFFECTS_DIR: string = "src/Effects";
const EFFECTS_BUILD_DIR: string = "build/Effects";
const EFFECT_NAME_SENTINEL: string = "<EFFECT_NAME_SENTINEL>";

const buildBanners: Record<string, string> = {
    "build/VSBloom.js": `/* VS: Bloom Main Extension */\n//\n//Hi!\n//\n//This is the main VSBloom extension that runs within the VSCode Extension Host.\n//It's responsible for bootstrapping and managing the VSBloom Bridge Server,\n//as well as applying patches to VSCode's Electron Client to facilitate various effects and modifications\n//to the VSCode application UI.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what the extension-side of VSBloom does or how it works\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
    "build/VSBloomClient.js": `/* VS: Bloom Client */\n//\n//Hi!\n//\n//This is the client at the core of VSBloom.\n//It's a small runtime that attempts to establish a WebSocket connection to the *actual* VSBloom extension\n//running inside of VSCode, creating a critical bridge between the VSCode Extension Host and the Electron Client which renders your VSCode application.\n//Once that connection is made, the client can send and receive data from the extension in real-time\n//to facilitate dynamically loading and unloading 'effects' and modifications to\n//the VSCode application UI, as well as maintaining real-time synchronization of things like user settings and preferences.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what the client does or how it works\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
    "build/ElevatedClientPatcher.js": `/* VS: Bloom Elevated Client Patcher */\n//\n//Hi!\n//\n//This is a NodeJS script designed to be run within an environment\n//that has elevated privileges, it is exclusively used in the event\n//of VSBloom running into permission errors when patching the Electron Client,\n//this normally doesn't require any elevation, but if VSCode is\n//installed system-wide instead of being local to the user, its files will\n//be located within a system directory(varying based on OS and 'flavor' of VSCode) which unfortunately\n//requires process elevation to be able to perform file read/write operations inside of.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what the elevated patcher does or how it works\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
    "__EFFECT_JS__": `/* VS: Bloom Effect JS */\n/* Effect Name: "${EFFECT_NAME_SENTINEL}" */\n//\n//Hi!\n//\n//This is the source code for a componentized effect script that the VSBloom Extension dynamically\n//loads and unloads within the Electron Renderer's DOM.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what effects do, how they work, or how to make your own\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
    "__EFFECT_CSS__": `/* VS: Bloom Effect CSS */\n/* Effect Name: "${EFFECT_NAME_SENTINEL}" */\n/*\n * Hi!\n *\n * This is the stylesheet for a componentized effect that the VSBloom Extension dynamically\n * loads and unloads within the Electron Renderer's DOM.\n *\n * This won't be very readable within a production environment,\n * so if you'd like to know more about what effects do, how they work, or how to make your own\n * you should visit the GitHub repo associated with VSBloom\n * for an un-minified version of this file!\n *\n * Build Date: ${new Date().toISOString()}\n */`,
    "__EFFECT_JSON__": `/* VS: Bloom Effect Configuration */\n/* Effect Name: "${EFFECT_NAME_SENTINEL}" */\n//\n//Hi!\n//\n//This is a configuration file utilized by a componentized effect that the VSBloom Extension dynamically\n//loads and unloads within the Electron Renderer's DOM.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what effects do, how they work, or how to make your own\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
    "build/VSBloomSharedLibs.js": `/* VS: Bloom Shared Library Provider */\n//\n//Hi!\n//\n//This rather monolithic file serves to bundle shared libraries that are used across\n//multiple effects in VSBloom; it's meant to be loaded before the VSBloom Client to ensure that\n//libraries are available immediately when effects load.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what libraries we preload, how these shared imports are loaded, or how to add your own\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
    "build/Webview/view.js": `/* VS: Bloom Webview Page */\n//\n//Hi!\n//\n//This is the main entry point for the VS: Bloom Webview, it's responsible for mounting a compiled Svelte application\n//into the webview's DOM.\n//\n//This won't be very readable within a production environment,\n//so if you'd like to know more about what the webview does or how it works\n//you should visit the GitHub repo associated with VSBloom\n//for an un-minified version of this file!\n//\n//Build Date: ${new Date().toISOString()}\n//`,
    "build/Webview/view.css": `/* VS: Bloom Webview Stylesheet */\n/*\n * Hi!\n *\n * This is the compiled stylesheet for the VS: Bloom Webview Page, it contains all of the Tailwind CSS\n * and globally-applied Svelte component styles needed to render the webview UI.\n *\n * This won't be very readable within a production environment,\n * so if you'd like to know more about what the webview does or how it works\n * you should visit the GitHub repo associated with VSBloom\n * for an un-minified version of this file!\n *\n * Build Date: ${new Date().toISOString()}\n */`,
};

type OneLinerWorkerResponse = {
    collapsed?: string;
    error?: string;
};

const PARALLEL_WORKER_LIMIT = Math.max(1, Math.min(os.availableParallelism(), 8));
let activeOneLinerWorkers = 0;
const oneLinerWorkerQueue: Array<() => void> = [];

async function AcquireOneLinerWorkerSlot(): Promise<void> {
    if (activeOneLinerWorkers < PARALLEL_WORKER_LIMIT) {
        activeOneLinerWorkers++;
        return;
    }

    await new Promise<void>((resolve) => oneLinerWorkerQueue.push(resolve));
    activeOneLinerWorkers++;
}

function ReleaseOneLinerWorkerSlot(): void {
    activeOneLinerWorkers--;
    oneLinerWorkerQueue.shift()?.();
}

async function CollapseJSCode(code: string, banner: string): Promise<string> {
    await AcquireOneLinerWorkerSlot();

    const worker = new Worker(
        `
        const { parentPort } = require("node:worker_threads");

        parentPort.on("message", async ({ code, banner }) => {
            try {
                const { minify } = await import("terser");
                const terserResult = await minify(code, {
                    mangle: false,
                    format: {
                        comments: /^!|@license|@preserve/i,
                        semicolons: true,
                        beautify: false,
                        max_line_len: false,
                    },
                });

                if (!terserResult.code) {
                    throw new Error("Terser returned no output.");
                }

                const collapsed =
                    banner +
                    terserResult.code
                        .split("\\n")
                        .map((line) => line.trim())
                        .filter((line) => line.length > 0)
                        .join(" ");

                parentPort.postMessage({ collapsed });
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                parentPort.postMessage({ error: message });
            }
        });
        `,
        { eval: true }
    );

    try {
        return await new Promise<string>((resolve, reject) => {
            worker.once("message", (message: OneLinerWorkerResponse) => {
                if (message.error) {
                    reject(new Error(message.error));
                    return;
                }

                if (!message.collapsed) {
                    reject(new Error("Worker returned no collapsed output."));
                    return;
                }

                resolve(message.collapsed);
            });

            worker.once("error", reject);
            worker.postMessage({ code, banner });
        });
    } finally {
        ReleaseOneLinerWorkerSlot();
        await worker.terminate();
    }
}

async function EffectCSSFileChangedDuringWatch(cssFilePath: string): Promise<void> {
    const fileName = path.basename(cssFilePath);
    const effectDir = path.dirname(cssFilePath);
    const effectName = path.basename(effectDir);
    const outputDir = path.join(EFFECTS_BUILD_DIR, effectName);
    const outputFilePath = path.join(outputDir, fileName);

    if (!await IsEffectEnabled(cssFilePath)) {
        return;
    }

    await fs.promises.mkdir(outputDir, { recursive: true });

    try {
        const fileContents = await fs.promises.readFile(cssFilePath, "utf8");
        let outputContents = fileContents;
        if (isProductionBuild) {
            outputContents = buildBanners["__EFFECT_CSS__"].replace(EFFECT_NAME_SENTINEL, effectName) + "\n" + fileContents;
        }
        await fs.promises.writeFile(outputFilePath, outputContents, "utf8");
        console.log(`[watch]   CSS updated: ${fileName} -> ${outputFilePath}`);
    } catch (err) {
        console.error(`[watch]   Failed to process CSS "${cssFilePath}":`, (err as Error).message);
    }
}

const jsoncImportPlugin: esbuild.Plugin = {
    name: "esbuild-jsonc-import",
    setup(build) {
        build.onLoad({ filter: /\.jsonc$/ }, async (args) => {
            const raw = await fs.promises.readFile(args.path, "utf8");
            const parsed = jsonc.parse(raw);
            return { contents: JSON.stringify(parsed), loader: "json" };
        });
    },
};

const gsapShimmerPlugin: esbuild.Plugin = {
    name: "esbuild-gsap-shim",
    setup(build) {
        const gsapShimPath = path.resolve("src/EffectLib/Shims/gsap.ts");

        build.onResolve({ filter: /^gsap$/ }, () => ({
            path: gsapShimPath,
        }));

        build.onResolve({ filter: /^gsap\/.+$/ }, () => ({
            path: gsapShimPath,
        }));
    },
};

const effectPlugin: esbuild.Plugin = {
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
            console.log(`[build]   pulling ${Colorful.GetColoredString([255,255,255], "non-script", ["bold"])} files for effect "${outFile}"...`);

            try {
                const entryPoints = build.initialOptions.entryPoints;
                if (!entryPoints || !Array.isArray(entryPoints) || typeof entryPoints[0] !== "string") {
                    return;
                }
                const effectDirectory = path.dirname(entryPoints[0]);
                if (!(await IsEffectEnabled(path.join(effectDirectory, `${effectDirectory}.json`)))) {
                    return;
                }
                const allFilesInEffectDir = fs.readdirSync(effectDirectory);
                const fileCopyPromises: Promise<void>[] = [];

                for (const file of allFilesInEffectDir) {
                    if (file.endsWith(".ts") || file.endsWith("tsconfig.json")) {
                        continue;
                    }
                    if (fs.statSync(path.join(effectDirectory, file)).isDirectory()) {
                        continue;
                    }

                    if (file.endsWith(".css")) {
                        const outputFilePath = path.join(path.dirname(outFile), file);
                        fileCopyPromises.push(
                            fs.promises.readFile(path.join(effectDirectory, file), "utf8").then(async (fileContents) => {
                                let outputContents = fileContents;
                                if (isProductionBuild) {
                                    const effectName = outFile.split("/").pop()?.split(".")[0] ?? "";
                                    outputContents = buildBanners["__EFFECT_CSS__"].replace(EFFECT_NAME_SENTINEL, effectName) + "\n" + fileContents;
                                }
                                await fs.promises.writeFile(outputFilePath, outputContents, "utf8");
                                console.log(`[build]     - minified ${Colorful.GetColoredString([144,0,255], "CSS", ["bold"])} file "${Colorful.GetColoredString([255,255,255], `${file}`, ["bold"])}" and copied to "${Colorful.GetColoredString([255,255,255], `${outputFilePath}`, ["bold"])}"`);
                            })
                        );
                    } else if (file.endsWith(".json") || file.endsWith(".jsonc")) {
                        const isJsonC = file.endsWith(".jsonc");

                        const outputFilePath = path.join(path.dirname(outFile), file);
                        const jsonFileContents = fs.readFileSync(path.join(effectDirectory, file), "utf8");
                        try {
                            const json: unknown = isJsonC ? jsonc.parse(jsonFileContents) : JSON.parse(jsonFileContents);
                            const whitespaceRemoved = JSON.stringify(json, null, isProductionBuild ? 0 : 4);
                            let outputContents = whitespaceRemoved;
                            if (isProductionBuild && isJsonC) {
                                const effectName = outFile.split("/").pop()?.split(".")[0] ?? "";
                                outputContents = buildBanners["__EFFECT_JSON__"].replace(EFFECT_NAME_SENTINEL, effectName) + "\n" + whitespaceRemoved;
                            }
                            fs.writeFileSync(outputFilePath, outputContents, "utf8");
                            console.log(`[build]     - copied ${Colorful.GetColoredString([255,255,0], isJsonC ? "JSON-C" : "JSON", ["bold"].concat(isJsonC ? ["underline", "inverse"] : []) as any)} file "${Colorful.GetColoredString([255,255,255], file, ["bold"])}" to "${Colorful.GetColoredString([255,255,255], outputFilePath, ["bold"])}"`);
                        } catch (err) {
                            console.error(`[build] ${Colorful.GetColoredString([255,0,0], `Failed to shorten and copy ${isJsonC ? "JSON-C" : "JSON"} file "${file}":`, ["bold", "underline"])}`, (err as Error).message);
                        }
                    } else {
                        const outputFilePath = path.join(path.dirname(outFile), file);
                        fileCopyPromises.push(
                            fs.promises.copyFile(path.join(effectDirectory, file), outputFilePath).then(() => {
                                console.log(`[build]     - copied ${Colorful.GetColoredString([255,255,255], "unexpected-extension", ["bold"])} file "${Colorful.GetColoredString([255,255,255], file, ["dim"])}" to "${Colorful.GetColoredString([255,255,255], outputFilePath, ["dim"])}"`);
                            })
                        );
                    }
                }

                await Promise.all(fileCopyPromises);
            } catch (err) {
                console.error(`[build] ${Colorful.GetColoredString([255,0,0], `Failed to update non-script files for effect "${outFile}":`, ["bold", "underline"])}`, (err as Error).message);
            }
        });
    },
};

const oneLinerPlugin: esbuild.Plugin = {
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
            console.log(`[build]   collapsing ${Colorful.GetColoredString([255,255,255], outFile, ["bold"])} to single line...`);

            try {
                const code = await fs.promises.readFile(outFile, "utf8");
                const fileBannerIdentifier = outFile.includes(EFFECTS_BUILD_DIR) ? "__EFFECT_JS__" : outFile;
                let fileBanner = buildBanners[fileBannerIdentifier] ? buildBanners[fileBannerIdentifier] + "\n" : "";
                if (fileBannerIdentifier === "__EFFECT_JS__") {
                    const effectName = outFile.split("/").pop()?.split(".")[0] ?? "";
                    fileBanner = fileBanner.replace(EFFECT_NAME_SENTINEL, effectName);
                }

                const singleLine = await CollapseJSCode(code, fileBanner);
                await fs.promises.writeFile(outFile, singleLine, "utf8");
                console.log(`[build]     - collapsed ${Colorful.GetColoredString([255,255,255], outFile, ["bold"])} to ${Colorful.GetColoredString([255,255,255], singleLine.length.toLocaleString(), ["bold"])} chars`);
            } catch (err) {
                console.error(`[build] ${Colorful.GetColoredString([255,0,0], `Failed to collapse "${outFile}":`, ["bold", "underline"])}`, (err as Error).message);
            }
        });
    },
};

const errorReporterPlugin: esbuild.Plugin = {
    name: "esbuild-error-reporter",
    setup(build) {
        build.onEnd((result) => {
            result.errors.forEach(({ text, location }) => {
                console.error(`✘ [ERROR] ${Colorful.GetColoredString([255,0,0], text, ["bold", "underline"])}`);
                if (location) {
                    console.error(`    ${Colorful.GetColoredString([255,255,255], `${location.file}:${location.line}:${location.column}:`, ["dim"])}`);
                }
            });
        });
    },
};

function ConditionalPlugins(...plugins: (esbuild.Plugin | undefined)[]): esbuild.Plugin[] {
    return plugins.filter((p): p is esbuild.Plugin => p !== undefined);
}

async function Main(): Promise<void> {
    const esbuildSvelte = (await import("esbuild-svelte")).default;
    const { sveltePreprocess } = await import("svelte-preprocess");
    const postcss = (await import("postcss")).default;
    const tailwindcss = (await import("@tailwindcss/postcss")).default;

    const postcssProcessor = postcss([tailwindcss()]);

    const esbuildTailwindPlugin: esbuild.Plugin = {
        name: "esbuild-tailwind",
        setup(build) {
            build.onLoad({ filter: /\.css$/, namespace: "file" }, async (args) => {
                const raw = await fs.promises.readFile(args.path, "utf8");
                const result = await postcssProcessor.process(raw, { from: args.path });
                return { contents: result.css, loader: "css" };
            });
        },
    };

    if (isProductionBuild) {
        if (fs.existsSync("build") && fs.statSync("build").isDirectory()) {
            await fs.promises.rm("build", { recursive: true, force: true });
        }
    }

    RebuildPackageFile();
    console.log(`[build] ${Colorful.GetColoredString([255,255,0], "package.json", ["bold", "underline"])} file rebuilt`);

    const mainCtx = await esbuild.context({
        bundle: true,
        format: "cjs",
        minify: isProductionBuild,
        sourcemap: isProductionBuild ? false : "inline",
        sourcesContent: !isProductionBuild,
        platform: "node",
        logLevel: "silent",
        plugins: ConditionalPlugins(errorReporterPlugin, isProductionBuild ? oneLinerPlugin : undefined),
        entryPoints: ["src/Extension/VSBloom.ts"],
        outfile: "build/VSBloom.js",
        external: ["vscode"],
        alias: {
            "jsonc-parser": path.resolve("node_modules/jsonc-parser/lib/esm/main.js"),
        },
        banner: isProductionBuild ? { js: buildBanners["build/VSBloom.js"] } : undefined,
    });

    const elevatedPatcherCtx = await esbuild.context({
        bundle: true,
        format: "cjs",
        minify: isProductionBuild,
        sourcemap: isProductionBuild ? false : "inline",
        sourcesContent: !isProductionBuild,
        platform: "node",
        logLevel: "silent",
        plugins: ConditionalPlugins(errorReporterPlugin, isProductionBuild ? oneLinerPlugin : undefined),
        entryPoints: ["src/Patcher/ElevatedClientPatcher.ts"],
        outfile: "build/ElevatedClientPatcher.js",
        external: [],
        banner: isProductionBuild ? { js: buildBanners["build/ElevatedClientPatcher.js"] } : undefined,
    });

    const clientCtx = await esbuild.context({
        bundle: true,
        format: "iife",
        globalName: "VSBloomClient",
        minify: isProductionBuild,
        sourcemap: isProductionBuild ? false : "inline",
        sourcesContent: !isProductionBuild,
        platform: "browser",
        target: ["chrome120"],
        logLevel: "silent",
        plugins: ConditionalPlugins(errorReporterPlugin, isProductionBuild ? oneLinerPlugin : undefined),
        entryPoints: ["src/ExtensionBridge/Client.ts"],
        outfile: "build/VSBloomClient.js",
        banner: isProductionBuild ? { js: buildBanners["build/VSBloomClient.js"] } : undefined,
    });

    const sharedLibsCtx = await esbuild.context({
        bundle: true,
        format: "iife",
        minify: isProductionBuild,
        sourcemap: isProductionBuild ? false : "inline",
        sourcesContent: !isProductionBuild,
        platform: "browser",
        target: ["chrome120"],
        logLevel: "silent",
        plugins: ConditionalPlugins(errorReporterPlugin, isProductionBuild ? oneLinerPlugin : undefined),
        entryPoints: ["src/EffectLib/SharedLibraries.ts"],
        outfile: "build/VSBloomSharedLibs.js",
        banner: isProductionBuild ? { js: buildBanners["build/VSBloomSharedLibs.js"] } : undefined,
    });

    const webviewCtx = await esbuild.context({
        bundle: true,
        format: "iife",
        globalName: "app",
        minify: isProductionBuild,
        sourcemap: isProductionBuild ? false : "inline",
        sourcesContent: !isProductionBuild,
        platform: "browser",
        target: ["chrome120"],
        logLevel: "silent",
        conditions: ["svelte", "browser"],
        plugins: [
            esbuildTailwindPlugin,
            esbuildSvelte({
                preprocess: sveltePreprocess({
                    sourceMap: !isProductionBuild,
                    typescript: {
                        tsconfigFile: "src/Webview/tsconfig.json",
                    },
                }),
                compilerOptions: {
                    dev: !isProductionBuild,
                    css: "external",
                },
            }),
            errorReporterPlugin,
        ],
        entryPoints: ["src/Webview/SvelteMounter.ts"],
        outdir: "build/Webview",
        entryNames: "view",
        alias: {
            "$webview-svelte-lib": path.resolve("src/Webview/Libraries"),
        },
        banner: isProductionBuild ? { js: buildBanners["build/Webview/view.js"], css: buildBanners["build/Webview/view.css"] } : undefined,
    });

    const effectContexts: esbuild.BuildContext[] = [];
    const effectDirectories = fs
        .readdirSync(EFFECTS_DIR)
        .filter((dir) => fs.statSync(path.join(EFFECTS_DIR, dir)).isDirectory());

    if (fs.existsSync(EFFECTS_BUILD_DIR)) {
        await fs.promises.rm(EFFECTS_BUILD_DIR, { recursive: true, force: true });
    }

    for (const effectDir of effectDirectories) {
        if (!(await IsEffectEnabled(path.join(EFFECTS_DIR, effectDir, `${effectDir}.json`)))) {
            continue;
        }

        effectContexts.push(
            await esbuild.context({
                bundle: true,
                format: "esm",
                minify: isProductionBuild,
                sourcemap: isProductionBuild ? false : "inline",
                sourcesContent: !isProductionBuild,
                platform: "browser",
                target: ["chrome120"],
                logLevel: "silent",
                plugins: ConditionalPlugins(
                    errorReporterPlugin,
                    isProductionBuild ? oneLinerPlugin : undefined,
                    effectPlugin,
                    gsapShimmerPlugin,
                    jsoncImportPlugin
                ),
                entryPoints: [`src/Effects/${effectDir}/${effectDir}.ts`],
                outfile: `build/Effects/${effectDir}/${effectDir}.js`,
                alias: {
                    motion: path.resolve("src/EffectLib/Shims/motion.ts"),
                    bloom: path.resolve("src/EffectLib/Shims/bloom.ts"),
                    "pixi.js": path.resolve("src/EffectLib/Shims/pixi.js.ts"),
                },
                banner: isProductionBuild
                    ? { js: buildBanners["__EFFECT_JS__"].replace(EFFECT_NAME_SENTINEL, effectDir) }
                    : undefined,
            })
        );
    }

    const allContexts: esbuild.BuildContext[] = [mainCtx, elevatedPatcherCtx, clientCtx, sharedLibsCtx, webviewCtx, ...effectContexts];

    if (shouldWatch) {
        console.log(`[watch] build ${Colorful.GetColoredString([200,255,200], "started!")}`);
        await Promise.all(allContexts.map((ctx) => ctx.rebuild()));
        console.log(`[watch] ${Colorful.GetColoredString([0,255,0], "Build finished!", ["bold"])}`);

        await Promise.all(allContexts.map((ctx) => ctx.watch()));
        console.log(`[watch] setting up effect ${Colorful.GetColoredString([144,0,255], "CSS file", ["bold"])} watchers...`);

        const effectAssetWatcher = chokidar.watch(
            effectDirectories.map((dir) => path.join(EFFECTS_DIR, dir, `${dir}.css`)),
            {
                ignoreInitial: true,
                awaitWriteFinish: {
                    stabilityThreshold: 100,
                    pollInterval: 50,
                },
            }
        );

        effectAssetWatcher
            .on("add", EffectCSSFileChangedDuringWatch)
            .on("change", EffectCSSFileChangedDuringWatch)
            .on("unlink", async (filePath: string) => {
                const effectDirPath = path.dirname(filePath);
                const effectName = path.basename(effectDirPath);
                const fileName = path.basename(filePath);
                const outputFilePath = path.join(EFFECTS_BUILD_DIR, effectName, fileName);

                if (fs.existsSync(outputFilePath)) {
                    await fs.promises.unlink(outputFilePath);
                    console.log(`[watch]   Removed a ${Colorful.GetColoredString([255,0,0], "deleted", ["bold"])} ${Colorful.GetColoredString([144,0,255], "CSS", ["bold"])} file: ${Colorful.GetColoredString([255,255,255], outputFilePath, ["bold"])}`);
                }
            });

        console.log(`[watch] ${Colorful.GetColoredString([255,255,255], "watching for changes...", ["italic"])}`);
    } else {
        console.log(`[build] Build ${Colorful.GetColoredString([200,255,200], "started")}`);
        await Promise.all(allContexts.map((ctx) => ctx.rebuild()));
        console.log(`[build] ${Colorful.GetColoredString([0,255,0], "Build finished!", ["bold"])}`);
        await Promise.all(allContexts.map((ctx) => ctx.dispose()));
    }
}

Main().catch((e: unknown) => {
    console.error(e);
    process.exit(1);
});

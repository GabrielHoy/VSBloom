/**
 * VSBloom Client Patcher
 * 
 * This module houses functionality relating to the actual
 * patching process that gets performed by the VSBloom
 * extension in order to facilitate more powerful and
 * flexible implementations of client effects/features
 * 
 * NOTE FOR CURIOUS READERS:
 * It's quite important that the patching process held
 * within this module is NOT performed 'completely' in
 * the background or otherwise without the user of the
 * extension being explicitly informed about, and approving
 * of, the modifications to the client that will be performed
 * during the patching process - Tampering with the client
 * in general can be a little bit of a touchy or 'suspicious'
 * subject(for good reason) so it's imperitive to maintain
 * transparency about the patching process and only perform
 * any kind of modifications upon explicit user approval,
 * as well as only providing means for 'automation' of
 * this patching(i.e re-patching when the client updates) on
 * a user-initiated basis that is DISABLED by default and
 * entirely opt-in by the user -- the core ideology I am
 * following with this patcher is that the user should
 * never, ever be surprised about what this extension does,
 * how it does it, or what it tampers with.
 * 
 */
import * as path from "path";
import * as fs from "fs";
import * as Common from "./Common";
import * as FileBackups from "./FileBackups";
import { Mutex } from "async-mutex";

export const HTML_FILE_PATCH_INDICATOR = `<!--\n\n\tThis file has been modified by the VSBloom Extension.\n\n\tIf you wish to revert the modifications made to this file,\n\tyou can do so at any time by simply disabling the VSBloom\n\textension inside of VSCode.\n\n\tAlternatively in the case that something has gone\n\twrong with VSBloom, you can manually restore the contents\n\tof this file by finding the '.bak${Common.VSBLOOM_FILE_EXTENSION}' file by the same name\n\tas this one inside of the same directory this\n\tfile is located in, deleting this file, and renaming the backup\n\tto this file's name accordingly.\n\n-->\n\n`;
export const JS_FILE_PATCH_INDICATOR = `/*\n\n\tThis file has been modified by the VSBloom Extension.\n\n\tIf you wish to revert the modifications made to this file,\n\tyou can do so at any time by simply disabling the VSBloom\n\textension inside of VSCode.\n\n\tAlternatively in the case that something has gone\n\twrong with VSBloom, you can manually restore the contents\n\tof this file by finding the '.bak${Common.VSBLOOM_FILE_EXTENSION}' file by the same name\n\tas this one inside of the same directory this\n\tfile is located in, deleting this file, and renaming the backup\n\tto this file's name accordingly.\n\n*/\n\n`;
export const ALL_POSSIBLE_FILES_PATCHED_BY_VSBLOOM = ["workbench.html", "workbench.desktop.main.js"];

export async function GetMainApplicationProductFile(vscode: typeof import("vscode")) {
    const config = vscode.workspace.getConfiguration();
    const appProductFileCfg = config.get<string>("vsbloom.patcher.appProductFile");

    if (appProductFileCfg === "auto") {
        const vsOutputDir = require.main ? path.dirname(require.main.filename) : (globalThis as any)._VSCODE_FILE_ROOT;
        if (!vsOutputDir) {
            throw new Error(Common.RaiseError("Unable to locate the output directory for the VSCode client; the extension cannot function without this information: Please provide the appropriate path for the 'product.json' file in the 'vsbloom.patcher.appProductFile' extension config to resolve this error."));
        }

        const mainVSAppDirectoryPath = path.join(vsOutputDir, "..");
        if (!await Common.IsThereADirectoryAtPath(mainVSAppDirectoryPath)) {
            throw new Error(Common.RaiseError("Unable to locate the main application directory for the VSCode client automatically, the extension cannot function without this information: Please provide the appropriate path for the 'product.json' file in the 'vsbloom.patcher.appProductFile' extension config to resolve this error."));
        }

        const hopefullyProductFilePath = path.join(mainVSAppDirectoryPath, "product.json");
        if (!await Common.IsThereAFileAtPath(hopefullyProductFilePath)) {
            throw new Error(Common.RaiseError("Unable to locate the 'product.json' file for the VSCode client automatically, the extension cannot function without this information: Please provide the appropriate path for the 'product.json' file in the 'vsbloom.patcher.appProductFile' extension config to resolve this error."));
        }
        if (!await Common.CanIMessWithThisFile(hopefullyProductFilePath)) {
            throw new Error(Common.RaiseError("The 'product.json' file associated with the VSCode client does not currently appear to be modifiable; depending on your operating system and VSC's installation path, you may need to re-launch the application as an administrator to allow this file to be modified by the VSBloom extension."));
        }

        return hopefullyProductFilePath;
    } else if (typeof appProductFileCfg === "string") {
        if (!fs.existsSync(appProductFileCfg)) {
            throw new Error(Common.RaiseError(`Invalid filesystem path provided for vsbloom.patcher.appProductFile - path does not exist: ${appProductFileCfg}`));
        }
        if (path.basename(appProductFileCfg) !== "product.json") {
            throw new Error(Common.RaiseError(`Invalid filesystem path provided for vsbloom.patcher.appProductFile - path does not point to a 'product.json' file: ${appProductFileCfg}`));
        }
        if (!fs.statSync(appProductFileCfg).isFile()) {
            throw new Error(Common.RaiseError(`Invalid filesystem path provided for vsbloom.patcher.appProductFile - path is not a file`));
        }
        if (!await Common.CanIMessWithThisFile(appProductFileCfg)) {
            throw new Error(Common.RaiseError("The 'product.json' file specified in the 'vsbloom.patcher.appProductFile' extension config does not currently appear to be modifiable; depending on your operating system and VSC's installation path, you may need to re-launch the application as an administrator to allow this file to be modified by the VSBloom extension."));
        }
        return appProductFileCfg;
    } else {
        throw new Error(Common.RaiseError("Invalid value provided for vsbloom.patcher.appProductFile - expected 'auto' or a filesystem path"));
    }
}

export async function GetFilePatchPathsForCurrentSettings(vscode: typeof import("vscode")): Promise<string[]> {
    const mainAppProductFilePath = await GetMainApplicationProductFile(vscode);
    const config = vscode.workspace.getConfiguration();
    const wantsClientCorruptWarningSupression = config.get<boolean>("vsbloom.patcher.suppressCorruptionWarning");

    const filePatchPaths = [];

    filePatchPaths.push(await GetPathToAppFile(mainAppProductFilePath, "workbench.html"));
    if (wantsClientCorruptWarningSupression) {
        filePatchPaths.push(await GetPathToAppFile(mainAppProductFilePath, "workbench.desktop.main.js"));
    }

    return filePatchPaths;
}

export async function GetPathToAppFile(mainAppProductFilePath: string, fileName: string) {
    const mainProductContents = await fs.promises.readFile(mainAppProductFilePath, "utf8");
    try {
        const productJSON = JSON.parse(mainProductContents);
        const checksums: Record<string, string> = productJSON.checksums;
        if (!checksums) {
            throw new Error(Common.RaiseError(`The main VSC application 'product.json' file is missing the 'checksums' field, unable to resolve paths to required product files.`));
        }

        //the key in the product.json file that contains the file name we want
        //will be a string that points to that file relative to product.json../out../<path>
        const fileKeyInProductJSON = Object.keys(checksums).find(key => key.includes(fileName));
        if (!fileKeyInProductJSON) {
            throw new Error(Common.RaiseError(`Attempt to resolve the path to the product file '${fileName}' failed, the file does not seem to be currently tracked in the main VSC application's 'product.json' file.`));
        }

        return path.join(path.dirname(mainAppProductFilePath), "out", fileKeyInProductJSON);
    } catch (err) {
        throw new Error(Common.RaiseError(`Unable to parse the main VSC application 'product.json' file, is the file corrupted or otherwise invalid JSON?`));
    }
}

export async function IsElectronHTMLFilePatched(initFilePath: string): Promise<boolean> {
    if (!await Common.IsThereAFileAtPath(initFilePath)) {
        throw new Error(Common.RaiseError(`The Electron init file at '${initFilePath}' does not exist or is not a file.`));
    }
    if (!await Common.CanIMessWithThisFile(initFilePath)) {
        throw new Error(Common.RaiseError(`The Electron init file at '${initFilePath}' is not accessible; the extension likely lacks permissions to read/write to it.`));
    }

    return fs.promises.readFile(initFilePath, "utf8").then(content => {
        return content.includes(HTML_FILE_PATCH_INDICATOR);
    }).catch(err => {
        throw new Error(Common.RaiseError(`Unable to read the contents of the Electron init file at '${initFilePath}'\n\nError: ${err.message}`));
    });
}

export async function IsElectronJSFilePatched(jsFilePath: string): Promise<boolean> {
    if (!await Common.IsThereAFileAtPath(jsFilePath)) {
        throw new Error(Common.RaiseError(`The Electron JS file at '${jsFilePath}' does not exist or is not a file.`));
    }
    if (!await Common.CanIMessWithThisFile(jsFilePath)) {
        throw new Error(Common.RaiseError(`The Electron JS file at '${jsFilePath}' is not accessible; the extension likely lacks permissions to read/write to it.`));
    }

    return fs.promises.readFile(jsFilePath, "utf8").then(content => {
        return content.includes(JS_FILE_PATCH_INDICATOR);
    }).catch(err => {
        throw new Error(Common.RaiseError(`Unable to read the contents of the Electron JS file at '${jsFilePath}'\n\nError: ${err.message}`));
    });
}

const applicationProductFileMutex = new Mutex();
export async function UpdateChecksumForTrackedFile(mainAppProductFilePath: string, filePath: string) {
    return applicationProductFileMutex.runExclusive(async () => {
        const mainProductContents = await fs.promises.readFile(mainAppProductFilePath, "utf8");
        try {
            const productJSON = JSON.parse(mainProductContents);
            const checksums: Record<string, string> = productJSON.checksums;
            if (!checksums) {
                throw new Error(Common.RaiseError(`The main VSC application 'product.json' file is missing the 'checksums' field, thus we cannot update internal VSC file checksums: This likely means that VSCode has updated their product.json format and VSBloom is out of date.`));
            }

            const fileName = path.basename(filePath);
            const fileKeyInProductJSON = Object.keys(checksums).find(key => key.includes(fileName));
            if (!fileKeyInProductJSON) {
                throw new Error(Common.RaiseError(`Attempt to update the VSC product checksum tracking for a file which does not seem to be currently tracked: '${filePath}'`));
            }

            const updatedFileChecksum = await Common.GetFileChecksum(filePath);
            productJSON.checksums[fileKeyInProductJSON] = updatedFileChecksum;

            await fs.promises.writeFile(mainAppProductFilePath, JSON.stringify(productJSON, null, '\t')).catch(err => {
                throw new Error(Common.RaiseError(`Unable to save the main VSC application 'product.json' file after updating a tracked file's checksum: ${err.message}`));
            });
        } catch (err) {
            throw new Error(Common.RaiseError(`Unable to parse the main VSC application 'product.json' file, is the file corrupted or otherwise invalid JSON?`));
        }
    });
}

/**
 * Generates the payload that should be
 * patched into the Electron Workbench HTML file as a <script>;
 * 
 * This script payload comes from the `VSBloomClient.js` file,
 * which is assumed to be bundled&compiled accordingly by the time
 * this function gets called
 * 
 * This 'step' is where static patching into the VSBloom Client
 * occurs of things like the auth/port constants
 * 
 * @param port The WebSocket server port
 * @param authToken The authentication token for WebSocket connections
 * @returns The complete script tag content to patch into the HTML
 */
export async function GetClientLauncherScriptElementString(port: number, authToken: string): Promise<string> {
    const clientScriptPath = path.join(__dirname, "VSBloomClient.js");
    
    if (!await Common.IsThereAFileAtPath(clientScriptPath)) {
        throw new Error(Common.RaiseError(`VSBloom Client script not found at '${clientScriptPath}'. Please ensure the extension is properly built.`));
    }
    
    const clientScript = await fs.promises.readFile(clientScriptPath, "utf8");
    
    //prefix with our port/auth token constants
    //so that the client can have a 'direct' reference
    //to them at runtime in a static manner without
    //needing to do any kind of handoff of communication
    //with the extension ahead of time in a manner that
    //would ultimately be much much more cumbersome and
    //hacky than this...it's not fantastic, but it works
    //nicely for our purposes here
    const wrappedScript = `
        var __VSBLOOM_PORT__ = ${port};
        var __VSBLOOM_AUTH__ = "${authToken}";
        ${clientScript}
    `;
    
    return `<script id="vsbloom-client">${wrappedScript}</script>`;
}

/**
 * Gets the SharedLibraries script content to be patched into workbench.html.
 * 
 * This script loads before the VSBloom Client and sets up window.__VSBLOOM__.libs
 * with shared libraries that effects can use without bundling
 * their own copies and sending them over a websocket connection
 * because we're not going to do that
 */
export async function GetSharedLibrariesScriptElementString(): Promise<string> {
    const sharedLibsPath = path.join(__dirname, "VSBloomSharedLibs.js");
    
    if (!await Common.IsThereAFileAtPath(sharedLibsPath)) {
        throw new Error(Common.RaiseError(
            `VSBloom SharedLibraries script not found at '${sharedLibsPath}'? Please ensure the extension is properly built.`
        ));
    }
    
    const sharedLibsScript = await fs.promises.readFile(sharedLibsPath, "utf8");
    return `<script id="vsbloom-shared-effect-libraries">${sharedLibsScript}</script>`;
}

function PatchElectronWorkbenchCSPElement(wbHtmlSource: string) {
    //i have come to learn to love regexes the more i have used
    //them, so let's vomit several of them here with no explanation :)
    const cspMetaElementExtractionRegex = /<meta\s+[^>]*http-equiv\s*=\s*(["'])Content-Security-Policy\1[^>]*content\s*=\s*(["'])(.*?)\2[^>]*\/?>/ims;

    const cspElementMatch = wbHtmlSource.match(cspMetaElementExtractionRegex);
    if (!cspElementMatch || !cspElementMatch.index) {
        //no CSP element found, the regex either doesnt work anymore
        //or the workbench file no longer uses CSP meta elements
        return wbHtmlSource;
    }

    const quoteUsedForContentDef = cspElementMatch[1]; //third match is the quote character used for `content=<"'>` syntax
    const unmodifiedCSPContent = cspElementMatch[3]; //fourth match is the actual content of the CSP directive, without quotes
    let cspContent = unmodifiedCSPContent;

    const scriptSrcRegex = /(script-src\s+)([^;]+)/i;
    const scriptSrcMatch = cspContent.match(scriptSrcRegex);
    const quoteUsedForScriptSrcSources = quoteUsedForContentDef === "'" ? '"' : "'";

    if (scriptSrcMatch) {
        //first match is the script-src directive along with whitespace between it and the first allowed source
        const scriptSrcDirective = scriptSrcMatch[1];
        //second match contains all of the allowed sources for the script-src directive (note though that this doesnt contain the semicolon to end the directive)
        const scriptSrcSources = scriptSrcMatch[2];

        const directivesToPatchIntoScriptSrcDirective = [];

        if (!scriptSrcSources.includes("unsafe-inline")) {
            directivesToPatchIntoScriptSrcDirective.push(`${quoteUsedForScriptSrcSources}unsafe-inline${quoteUsedForScriptSrcSources}`);
        }
        if (!scriptSrcSources.includes("blob:")) {
            directivesToPatchIntoScriptSrcDirective.push(`blob:`);
        }

        if (directivesToPatchIntoScriptSrcDirective.length > 0) {
            //substitution thus that `script-src 'source1' 'source2'` becomes `script-src <...patchedInDirectives...> 'source1' 'source2'`
            const patchedScriptSrcDirective = `${scriptSrcDirective}${directivesToPatchIntoScriptSrcDirective.join(`\n `)}\n`;

            //now we need to reconstruct the script-src directive in the acutal CSP content
            cspContent = cspContent.replace(scriptSrcDirective, patchedScriptSrcDirective);
        }

    }

    if (cspContent !== unmodifiedCSPContent) {
        //csp content changed, we need to reconstruct the html source
        //with the new CSP element and its associated content
        const unmodifiedFullCSPElement = wbHtmlSource.substring(cspElementMatch.index, cspElementMatch.index + cspElementMatch[0].length);

        const patchedFullCSPElement = unmodifiedFullCSPElement.replace(unmodifiedCSPContent, cspContent);

        const patchedHTMLSrc = wbHtmlSource.replace(unmodifiedFullCSPElement, patchedFullCSPElement);

        return patchedHTMLSrc;
    }

    //no patches were able to be applied to the workbench's source,
    //so we can just return the original value
    return wbHtmlSource;
}

export async function PatchElectronHTMLFile(
    mainAppProductFilePath: string,
    initFilePath: string,
    bridgePort: number,
    authToken: string,
) {
    if (!await Common.IsThereAFileAtPath(initFilePath)) {
        throw new Error(Common.RaiseError(`The Electron init file at '${initFilePath}' does not exist or is not a file.`));
    }
    if (!await Common.CanIMessWithThisFile(initFilePath)) {
        throw new Error(Common.RaiseError(`The Electron init file at '${initFilePath}' is not accessible; the extension likely lacks permissions to read/write to it.`));
    }
    
    const fileContents = await fs.promises.readFile(initFilePath, "utf8");
    if (fileContents.includes(HTML_FILE_PATCH_INDICATOR)) {
        throw new Error(Common.RaiseError(`Attempt to patch Electron init file at '${initFilePath}', but it was already patched(?)`));
    }

    //get the shared libraries script that loads before the client
    const sharedLibsPayload = await GetSharedLibrariesScriptElementString();

    //get a copy of the actual VSBloom Client script that we'll
    //be patching into the Electron init file
    const clientPayload = await GetClientLauncherScriptElementString(bridgePort, authToken);

    //prefix the file with the patch indicator to explain to curious users what's up
    let patchedFileContents = HTML_FILE_PATCH_INDICATOR + fileContents;

    //add some declarations in the CSP meta element to allow the client to load
    //things dynamically instead of being restricted to bundling all of the
    //effects/configs/behaviors into the workbench.html file directly
    patchedFileContents = PatchElectronWorkbenchCSPElement(patchedFileContents);

    //find the <head> tag and patch appropriate scripts *directly* after it is defined
    //order matters here: sharedLibsPayload first, then clientPayload
    patchedFileContents = patchedFileContents.replace(/<head([^>]*)>/i, `<head$1>${sharedLibsPayload}${clientPayload}`);

    //TODO: Maybe patch a small CSS payload too in order to facilitate a nice
    //TODO: animation or loading sequence etc while the VSBloom client & server
    //TODO: are establishing their connection to each other?

    await fs.promises.writeFile(initFilePath, patchedFileContents).catch(err => {
        throw new Error(Common.RaiseError(`Unable to save patches applied to VSC's Electron init file at '${initFilePath}': ${err.message}`));
    });
    await UpdateChecksumForTrackedFile(mainAppProductFilePath, initFilePath);
}

//VSBloom's process of patching files related to electron triggers
//a warning message/popup window/title change in the VSCode client telling
//the user that their installation is "corrupt" and asking them
//to reinstall - in theory this isn't exactly an *issue* per-se
//and we dont 100% *have* to disable it, but it's rather bad UX
//to trigger a 'scary' warning popup like that every single time
//the user opens or reloads a VSC window - so in this function
//we try to scan through the source code for the VSC workbench's
//"main" script and see if we can find the specific spot where
//they perform the "purity" check on the client and throw their
//warning accordingly -- then we just patch that code snippet
//to add an "or true" condition to the purity check so it always
//considers the client 'pure'
//
//this method of regexing through the source code is admittedly
//pretty fragile and prone to breaking if the VSC developers
//ever decide to change or refactor the code that checks for
//client purity, but it's a reasonably effective approach
//and uses a specific enough regex that it shouldn't accidentally
//match any other code that VSC would add in the future
//
//FOR MICROSOFT / VS CODE DEVELOPERS IF YOU'RE READING THIS:
//I realize this may be a bit of a 'controversial' function and
//that this extension suppressing warnings that genuinely
//tend to be useful outside of this specific use case may cross
//a certain line in the sand for you, so if you're not a fan
//of me doing this, would rather see me take a different approach,
//or otherwise are not OK with suppressing the client modification
//warning then - before you remove the extension from the marketplace
//or ban my publisher account  - please just reach out to me over at
//support@tamperedreality.net first and i would absolutely be more
//than happy to accomodate and address your concerns in a manner
//that you deem satisfactory!
//
//returns whether or not the function was able to successfully
//locate and suppress the associated conditional for the client's
//purity check and warning message/popup inside of the workbench script
export async function SuppressWorkbenchClientModificationWarning(mainAppProductFilePath: string, wbScriptPath: string): Promise<boolean> {
    const wbScriptContents = await fs.promises.readFile(wbScriptPath, "utf8");
    const purityCheckConditionExtractionRegex = /if\s?\((\w+)\)\s?return;\s?\w+\.[\w.]+\.warn\([`"'].*has been modified/is;

    const purityCheckRegexMatch = wbScriptContents.match(purityCheckConditionExtractionRegex);
    if (!purityCheckRegexMatch) {
        return false; //code was probably updated and this regex is no longer usable
    }

    if (!purityCheckRegexMatch[1] || !purityCheckRegexMatch.index) {
        return false; //code was probably updated and this regex is no longer usable
    }

    const purityCheckConditionalIdx = purityCheckRegexMatch[0].indexOf(purityCheckRegexMatch[1]);
    if (purityCheckConditionalIdx === -1) {
        return false; //code was probably updated and this regex is no longer usable
    }

    const patchedWbScriptContents =
        JS_FILE_PATCH_INDICATOR +
        wbScriptContents.slice(0, purityCheckRegexMatch.index) +
        purityCheckRegexMatch[0].slice(0, purityCheckConditionalIdx) +
        purityCheckRegexMatch[1] + "||true" +
        purityCheckRegexMatch[0].slice(purityCheckConditionalIdx + purityCheckRegexMatch[1].length) +
        wbScriptContents.slice(purityCheckRegexMatch.index + purityCheckRegexMatch[0].length);

    await fs.promises.writeFile(wbScriptPath, patchedWbScriptContents).catch(err => {
        throw new Error(Common.RaiseError(`Unable to save patches applied to VSC's Electron JS file at '${wbScriptPath}': ${err.message}`));
    });
    await UpdateChecksumForTrackedFile(mainAppProductFilePath, wbScriptPath);

    return true;
}

export async function WouldClientPatchingRequireElevation(mainAppProductFilePath: string): Promise<boolean> {
    let needsElevationToPatch = false;
    for (const file of ALL_POSSIBLE_FILES_PATCHED_BY_VSBLOOM) {
      const filePath = await GetPathToAppFile(mainAppProductFilePath, file);
      if (await Common.DoesFileRequireElevation(filePath)) {
        needsElevationToPatch = true;
        break;
      }
    }

    return needsElevationToPatch;
}

export async function PerformClientPatching(
    mainAppProductFilePath: string,
    wantsClientCorruptWarningSupression: boolean,
    bridgePort: number,
    authToken: string
) {
    //handle patching workbench.html to embed the VSBloom Bridge client script
    await GetPathToAppFile(mainAppProductFilePath, "workbench.html").then(async htmlPath => {
        const isWorkbenchAlreadyPatched = await IsElectronHTMLFilePatched(htmlPath);
        if (!isWorkbenchAlreadyPatched) {
            if (await FileBackups.DoesFileHaveBackup(htmlPath)) {
                //remove existing workbench.html vsbloom backup if
                //it exists but the current workbench.html isn't patched,
                //this will probably happen when VSCode updates, assuming
                //it doesn't just delete the backup too in the process
                await FileBackups.RemoveBackupFile(htmlPath);
            }

            await FileBackups.BackupFile(htmlPath);
            await PatchElectronHTMLFile(mainAppProductFilePath, htmlPath, bridgePort, authToken);
        }
    }).catch(err => {
        throw new Error(Common.RaiseError(`VSBloom's client patching process encountered an error during the HTML phase: ${err.message}`));
    });

    if (wantsClientCorruptWarningSupression) {
        //suppress client modification warning in the actual
        //VSC client's workbench.desktop.main.js script
        await GetPathToAppFile(mainAppProductFilePath, "workbench.desktop.main.js").then(async wbJsPath => {
            const isWorkbenchJSAlreadyPatched = await IsElectronJSFilePatched(wbJsPath);
            
            if (!isWorkbenchJSAlreadyPatched) {
                if (await FileBackups.DoesFileHaveBackup(wbJsPath)) {
                    //remove existing workbench JS vsbloom backup if
                    //it exists but the current workbench JS isn't patched,
                    //this will probably happen when VSCode updates, assuming
                    //it doesn't just delete the backup too in the process
                    await FileBackups.RemoveBackupFile(wbJsPath);
                }
    
                await FileBackups.BackupFile(wbJsPath);
                await SuppressWorkbenchClientModificationWarning(mainAppProductFilePath, wbJsPath);
            }
        }).catch(err => {
            throw new Error(Common.RaiseError(`VSBloom's client patching process encountered an error during the JS phase: ${err.message}`));
        });
    }
}

export async function IsClientPatched(mainAppProductFilePath: string): Promise<boolean> {
    const pathsToPatchedFiles = [];
    for (const file of ALL_POSSIBLE_FILES_PATCHED_BY_VSBLOOM) {
        pathsToPatchedFiles.push(await GetPathToAppFile(mainAppProductFilePath, file));
    }

    let isClientPatched = false;
    for (const filePath of pathsToPatchedFiles) {
        if (await FileBackups.DoesFileHaveBackup(filePath)) {
            isClientPatched = true;
            break;
        }
    }

    return isClientPatched;
}

export async function UnpatchClient(mainAppProductFilePath: string) {
    await GetPathToAppFile(mainAppProductFilePath, "workbench.html").then(async htmlPath => {
        const isWorkbenchHTMLPatched = await IsElectronHTMLFilePatched(htmlPath);
        if (isWorkbenchHTMLPatched) {
            const hasBackup = await FileBackups.DoesFileHaveBackup(htmlPath);
            if (!hasBackup) {
                throw new Error(Common.RaiseError(`Attempt to unpatch Electron HTML file at '${htmlPath}' failed, no backup file found(?)`));
            }

            await FileBackups.RestoreFileFromBackup(htmlPath, true);
        }
    }).catch(err => {
        throw new Error(Common.RaiseError(`VSBloom's client unpatching process encountered an error during the HTML phase: ${err.message}`));
    });

    await GetPathToAppFile(mainAppProductFilePath, "workbench.desktop.main.js").then(async wbJsPath => {
        const isWorkbenchJSPatched = await IsElectronJSFilePatched(wbJsPath);
        if (isWorkbenchJSPatched) {
            const hasBackup = await FileBackups.DoesFileHaveBackup(wbJsPath);
            if (!hasBackup) {
                throw new Error(Common.RaiseError(`Attempt to unpatch Electron JS file at '${wbJsPath}' failed, no backup file found(?)`));
            }
            await FileBackups.RestoreFileFromBackup(wbJsPath, true);
        }
    }).catch(err => {
        throw new Error(Common.RaiseError(`VSBloom's client patching process encountered an error during the JS phase: ${err.message}`));
    });
}
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as Common from "./Common";
import { Mutex } from "async-mutex";

export const HTML_FILE_PATCH_INDICATOR = `<!--\n\n\tThis file has been modified by the VSBloom Extension.\n\n\tIf you wish to revert the modifications made to this file,\n\tyou can do so at any time by simply disabling the VSBloom\n\textension inside of VSCode.\n\n\tAlternatively in the case that something has gone\n\twrong with VSBloom, you can manually restore the contents\n\tof this file by finding the '${Common.VSBLOOM_FILE_EXTENSION}.bak' file by the same name\n\tas this one inside of the same directory this\n\tfile is located in, deleting this file, and renaming the backup\n\tto this file's name accordingly.\n\n-->\n\n`;

export function GetElectronInitDirectory() {
    const config = vscode.workspace.getConfiguration();

    const workbenchDir = config.get<string>("vsbloom.patcher.workbenchDir");
    if (workbenchDir === "auto") {
        const vsOutputDir = require.main ? path.dirname(require.main.filename) : (globalThis as any)._VSCODE_FILE_ROOT;
        if (!vsOutputDir) {
            throw new Error(Common.RaiseError("Unable to locate the output directory for the VSCode client; the extension cannot function without this information: Please provide the appropriate path for this directory in the 'vsbloom.patcher.workbenchDir' extension config."));
        }

        const commonWorkbenchDirs = [
            ["electron-sandbox", "workbench"],
            ["electron-sandbox"],
            ["electron-browser", "workbench"],
            ["electron-browser"]
        ];

        for (const dirPathSegments of commonWorkbenchDirs) {
            const possibleWBDirPath = path.join(vsOutputDir, "vs", "code", ...dirPathSegments);
            if (!fs.existsSync(possibleWBDirPath)) {
                continue;
            }
            if (!fs.statSync(possibleWBDirPath).isDirectory()) {
                continue;
            }
            return possibleWBDirPath;
        }

        throw new Error(Common.RaiseError("Unable to locate the workbench directory for the Electron Client VSCode uses; the extension cannot function without this information: Please provide the appropriate path for this directory in the 'vsbloom.patcher.workbenchDir' extension config."));
    } else if (typeof workbenchDir === "string") {
        if (!fs.existsSync(workbenchDir)) {
            throw new Error(Common.RaiseError(`Invalid filesystem path provided for vsbloom.patcher.workbenchDir - path does not exist: ${workbenchDir}`));
        }
        if (!fs.statSync(workbenchDir).isDirectory()) {
            throw new Error(Common.RaiseError(`Invalid filesystem path provided for vsbloom.patcher.workbenchDir - path is not a directory`));
        }
        return workbenchDir;
    } else {
        throw new Error(Common.RaiseError("Invalid value provided for vsbloom.patcher.workbenchDir - expected 'auto' or a filesystem path"));
    }
}

export function GetElectronInitFilePath() {
    const config = vscode.workspace.getConfiguration();
    const initFileNames = config.get<string[]>("vsbloom.patcher.initFiles");
    if (!Array.isArray(initFileNames)) {
        throw new Error(Common.RaiseError("Unable to locate the initialization files for the Electron Client VSCode uses; the 'vsbloom.patcher.initFiles' extension config is not a valid array."));
    }
    if (initFileNames.length === 0) {
        throw new Error(Common.RaiseError("Unable to locate the initialization files for the Electron Client VSCode uses; the 'vsbloom.patcher.initFiles' extension config contains no entries."));
    }

    const workbenchDir = GetElectronInitDirectory();

    for (const initFileName of initFileNames) {
        const initFilePath = path.join(workbenchDir, initFileName);
        if (!fs.existsSync(initFilePath)) {
            continue;
        }
        if (!fs.statSync(initFilePath).isFile()) {
            continue;
        }

        return initFilePath;
    }

    throw new Error(Common.RaiseError("Unable to locate the initialization files for the Electron Client VSCode uses; none of the provided file names inside of the 'vsbloom.patcher.initFiles' extension config setting were able to be found inside of the workbench directory."));
}

export async function GetMainApplicationProductFile() {
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

const applicationProductFileMutex = new Mutex();
export async function UpdateChecksumForTrackedFile(filePath: string) {
    const mainAppProductFile = await GetMainApplicationProductFile();
    return applicationProductFileMutex.runExclusive(async () => {
        const mainProductContents = await fs.promises.readFile(mainAppProductFile, "utf8");
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

            await fs.promises.writeFile(mainAppProductFile, JSON.stringify(productJSON, null, '\t')).catch(err => {
                throw new Error(Common.RaiseError(`Unable to save the main VSC application 'product.json' file after updating a tracked file's checksum: ${err.message}`));
            });
        } catch (err) {
            throw new Error(Common.RaiseError(`Unable to parse the main VSC application 'product.json' file, is the file corrupted or otherwise invalid JSON?`));
        }
    });
}

export async function PatchElectronHTMLFile(initFilePath: string) {
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

    //prefix the file with the patch indicator
    //to explain to any curious users what's up
    let patchedFileContents = HTML_FILE_PATCH_INDICATOR + fileContents;

    //then find the <head> tag and inject our script contents accordingly
    patchedFileContents = patchedFileContents.replace(/<head([^>]*)>/i, `<head$1><script>console.log('test pre-startup...');</script>`);

    //we'll also inject any appropriate CSS into the head element,
    //though said css needs to be injected just before the head
    //element is closed in order to ensure that our styles end
    //up overriding any stylesheets etc VSC may have declared
    patchedFileContents = patchedFileContents.replace(/<\/head([^>]*)>/i, `<style>  </style></head$1>`);

    console.log("PATCHING HTML FILE CONTENTS...");
    await fs.promises.writeFile(initFilePath, patchedFileContents).catch(err => {
        throw new Error(Common.RaiseError(`Unable to save patches applied to VSC's Electron init file at '${initFilePath}': ${err.message}`));
    });
    console.log("UPDATING CHECKSUM FOR TRACKED FILE...");
    await UpdateChecksumForTrackedFile(initFilePath);
    console.log("CHECKSUM FUNC COMPLETE");
}
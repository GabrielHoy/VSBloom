import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import * as Common from "./Common";
import * as ClientPatcher from "./ClientPatcher";
import { Mutex } from "async-mutex";

const backupGlobalStateMutex = new Mutex();

//Takes a "base" file path and returns a path that would be used to store
//a backup of said file in the same directory
export function GetBackupFilePathFor(nonBackupFilePath: string): string {
    return path.join(path.dirname(nonBackupFilePath), path.basename(nonBackupFilePath) + ".bak." + Common.VSBLOOM_FILE_EXTENSION);
}

export async function DeleteAllVSBloomBackups(vsContext: vscode.ExtensionContext): Promise<void> {
    //first up if we have known stored backups, get rid of those
    const knownBackups = vsContext.globalState.get<string[]>("electronBackups");
    const backupClearOperation = vsContext.globalState.update("electronBackups", []);
    if (Array.isArray(knownBackups)) {
        await Common.PerformActionOnFiles(knownBackups.map(nonBackupPath => GetBackupFilePathFor(nonBackupPath)), async (validBackupPath: string) => {
            return fs.promises.unlink(validBackupPath);
        });
    }

    //now just incase something odd happened and the global state lost track of them
    //or if an update happened or what-have-you, we'll scan for any still existing
    //backups accordingly too...last thing we want to do is leak a bunch of old
    //electron backups lingering in the application folder when we're not quite
    //supposed to be toying around in this directory to begin with
    const currentInitDir = ClientPatcher.GetElectronInitDirectory();
    await fs.promises.readdir(currentInitDir).then(files => Common.PerformActionOnFiles(files.map(file => path.join(currentInitDir, file)), async (validFilePath: string) => {
        if (validFilePath.endsWith(".bak." + Common.VSBLOOM_FILE_EXTENSION)) {
            return fs.promises.unlink(validFilePath);
        }
    }));

    await backupClearOperation;
}

//backs up a file by copying it into a `<basename>.bak.<vsbloomfileextension>` file
//in the same directory, then tracks the fact that we've backed up this file in the
//extension's global state
export async function BackupFile(vsContext: vscode.ExtensionContext, nonBackupFilePath: string): Promise<void> {
    const backupFilePath = GetBackupFilePathFor(nonBackupFilePath);
    await fs.promises.copyFile(nonBackupFilePath, backupFilePath);

    await backupGlobalStateMutex.runExclusive(async () => {
        const currentBackups = vsContext.globalState.get<string[]>("electronBackups") || [];
        if (!currentBackups.includes(nonBackupFilePath)) {
            currentBackups.push(nonBackupFilePath);
            await vsContext.globalState.update("electronBackups", currentBackups);
        }
    });
}

//Checks whether the provided file has a backup file associated with it
//does *not* check, however, if that backup file still actually exists
//or is accessible on the filesystem - just whether the extension's state
//knows that there SHOULD be a backup file present for the provided path
export function DoesFileHaveBackup(vsContext: vscode.ExtensionContext, nonBackupFilePath: string): boolean {
    return (vsContext.globalState.get<string[]>("electronBackups") || []).includes(nonBackupFilePath);
}

//removes the backup associated with the provided file path from the extension's global state
//as well as deleting the backup file from the filesystem
export async function RemoveBackupFile(vsContext: vscode.ExtensionContext, nonBackupFilePath: string): Promise<void> {
    const backupFilePath = GetBackupFilePathFor(nonBackupFilePath);
    
    try {
        await fs.promises.unlink(backupFilePath);
    } catch {
        if (fs.existsSync(backupFilePath)) {
            throw new Error(Common.RaiseError(`Unable to delete a backup file for ${nonBackupFilePath}`));
        }
    }

    await backupGlobalStateMutex.runExclusive(async () => {
        const currentBackups = vsContext.globalState.get<string[]>("electronBackups") || [];
        const backupIdx = currentBackups.indexOf(nonBackupFilePath);
        if (backupIdx !== -1) {
            currentBackups.splice(backupIdx, 1);
            await vsContext.globalState.update("electronBackups", currentBackups);
        }
    });
}

//restores the provided file path's original contents from a backup file associated with it
//if the removeBackupOnceDone flag is true, the backup file will be removed afterwards
export async function RestoreFileFromBackup(vsContext: vscode.ExtensionContext, nonBackupFilePath: string, removeBackupOnceDone: boolean): Promise<void> {
    const backupFilePath = GetBackupFilePathFor(nonBackupFilePath);
    
    return fs.promises.access(backupFilePath, fs.constants.F_OK | fs.constants.R_OK).then(async () => {
        await fs.promises.copyFile(backupFilePath, nonBackupFilePath).then(() => {
            if (removeBackupOnceDone) {
                return RemoveBackupFile(vsContext, nonBackupFilePath);
            }
        }).catch(err => {
            throw new Error(Common.RaiseError(`Encountered an error while attempting to restore ${nonBackupFilePath} from backup: ${err.message}`));
        });
    }).catch(() => {
        throw new Error(Common.RaiseError(`Unable to locate - or did not have file permissions to access - a backup file for ${nonBackupFilePath}`));
    }) ;
}
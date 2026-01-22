import * as path from "path";
import * as fs from "fs";
import * as Common from "./Common";

export function GetBackupFilePathFor(nonBackupFilePath: string): string {
    return path.join(path.dirname(nonBackupFilePath), path.basename(nonBackupFilePath) + ".bak" + Common.VSBLOOM_FILE_EXTENSION);
}

export async function BackupFile(nonBackupFilePath: string) {
    await fs.promises.copyFile(nonBackupFilePath, GetBackupFilePathFor(nonBackupFilePath));
}

export async function DoesFileHaveBackup(nonBackupFilePath: string) {
    return fs.promises.stat(GetBackupFilePathFor(nonBackupFilePath)).then(statData => statData.isFile()).catch(() => false);
}

export async function RemoveBackupFile(nonBackupFilePath: string) {
    const backupFilePath = GetBackupFilePathFor(nonBackupFilePath);
    await fs.promises.unlink(backupFilePath);
}

export async function RestoreFileFromBackup(nonBackupFilePath: string, removeBackupOnceDone: boolean) {
    const backupFilePath = GetBackupFilePathFor(nonBackupFilePath);
    
    if (!await DoesFileHaveBackup(nonBackupFilePath)) {
        throw new Error(Common.RaiseError(`No backup file found for ${nonBackupFilePath}`));
    }

    await fs.promises.copyFile(backupFilePath, nonBackupFilePath);

    if (removeBackupOnceDone) {
        return RemoveBackupFile(nonBackupFilePath);
    }
}
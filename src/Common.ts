import * as vscode from "vscode";
import * as fs from "fs";
import * as crypto from "crypto";
import * as path from "path";

export const VSBLOOM_FILE_EXTENSION = ".vsbloom";

//Performs an action asynchronously on each of the provided file paths
//Returns a promise that resolves when all of the actions have completed,
//its resolved value will contain any files that did not exist, weren't files, or were inaccessible
export async function PerformActionOnFiles(
    filePaths: string[],
    action: (path: string) => Promise<void>
): Promise<string[]> {
    const invalidPaths: string[] = [];
    const actionPromises: Promise<void>[] = [];
    const accessMode = fs.constants.R_OK | fs.constants.W_OK; // readable & writable

    for (const filePath of filePaths) {
        actionPromises.push(
            fs.promises
                .access(filePath, accessMode)
                .then(() =>
                    fs.promises.stat(filePath)
                        .then(stat => {
                            if (!stat.isFile()) {
                                invalidPaths.push(filePath);
                                return;
                            }
                            return action(filePath)
                                .catch(err => {
                                    RaiseWarning(
                                        `An error occurred while performing a batched file operation on ${filePath}: ${err.message}`
                                    );
                                });
                        })
                )
                .catch(err => {
                    invalidPaths.push(filePath);
                })
        );
    }

    await Promise.all(actionPromises);

    return invalidPaths;
}

export async function IsThereAFileAtPath(filePath: string): Promise<boolean> {
    return fs.promises.stat(filePath).then(stat => {
        return stat.isFile();
    }).catch(() => false);
}

export async function IsThereADirectoryAtPath(filePath: string): Promise<boolean> {
    return fs.promises.stat(filePath).then(stat => {
        return stat.isDirectory();
    }).catch(() => false);
}

export async function CanIMessWithThisFile(filePath: string): Promise<boolean> {
    return fs.promises.stat(filePath).then(stat => {
        if (!stat.isFile()) {
            return false;
        }

        return fs.promises.access(filePath, fs.constants.F_OK | fs.constants.R_OK | fs.constants.W_OK).then(() => true).catch(() => false);
    }).catch(() => {
        return false;
    });
}

export async function GetFileChecksum(filePath: string): Promise<string> {
    return fs.promises.readFile(filePath, "utf8").then(fileContent => {
        return crypto.createHash("sha256").update(fileContent).digest("base64").replace(/=+$/, "");
    }).catch(err => {
        throw new Error(RaiseError(`Unable to read the contents of the file at '${filePath}' when attempting to generate its checksum: ${err.message}`));
    });
}

//Intended to always be provided as an argument to
//a throw clause via `throw new Error(RaiseError(...))`
export function RaiseError(errMsg: string) {
    vscode.window.showErrorMessage(`[VSBloom]: ${errMsg}`);
    return `[VSBloom]: ${errMsg}`;
}

export function RaiseWarning(warnMsg: string) {
    vscode.window.showWarningMessage(`[VSBloom]: ${warnMsg}`);
    console.warn(`[VSBloom]: ${warnMsg}`);
}
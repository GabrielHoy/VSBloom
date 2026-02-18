/**
 * Exposes some helpful functions for reflecting metadata
 * related to the VSBloom extension itself.
 */

import * as vscode from "vscode";
import * as path from "path";

export function GetExtensionDirectory() {
    // __dirname will point to the `build` directory
    return path.join(__dirname, "..");
}

export async function GetExtensionPackageJSON() {
    return vscode.extensions.getExtension("tamperedreality.vsbloom")?.packageJSON;
}
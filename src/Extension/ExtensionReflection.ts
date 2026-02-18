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

export function GetExtensionPackageJSON() {
    return vscode.extensions.getExtension("tamperedreality.vsbloom")?.packageJSON;
}

/**
 * The extension's launch.json configuration passes a
 * VSBLOOM_DEVELOPMENT_MODE environment variable to the
 * extension host process - we can detect that to see if
 * we're likely being debugged at the moment from a
 * development environment.
 */
export function IsDevelopmentEnvironment() {
    return process.env.VSBLOOM_DEVELOPMENT_MODE === "true";
}
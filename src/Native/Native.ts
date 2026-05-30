/**
 * Exposes API's related to VSBloom's native runtime and
 * the extension's interactions with it via dispatching
 * operating-system subprocesses and handling communication
 * to-and-from them.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { GetExtensionDirectory } from './ExtensionReflection';

/**
 * The name of the core native binary.
 *
 * This will be located at `build-native/<platform>/<CORE_NATIVE_BIN_NAME>[<.exe>]`.
 */
const CORE_NATIVE_BIN_NAME = 'VSBloomNativeRuntime';
/**
 * Whether we're running on the Windows platform or not - this will
 * determine whether we'll need to append a `.exe` suffix to the
 * core native binary name when looking for it in build subdirectories.
 */
const IS_WIN = process.platform === 'win32';
/**
 * A list of platform slugs that pre-built native binaries should
 * be available for inside of the `build-native/<platform>` subdirectory.
 */
const NATIVE_CAPABLE_PLATFORMS = ['win32-x64', 'linux-x64', 'darwin-x64', 'darwin-arm64'];
/**
 * The platform slug for the current platform.
 *
 * This will be used to determine which pre-built native binary we'll
 * be utilizing - if any can be, that is.
 */
const PLATFORM_SLUG = `${process.platform}-${process.arch}`;

/**
 * Gets the path to the directory containing pre-built native binaries for the current platform.
 * 
 * This will look something like `build-native/<PLATFORM_SLUG>`.
 * 
 * **The value of this variable does not predict that the directory
 * it points to actually exists, nor that any binaries are present
 * for this platform.**
 * 
 * @returns The path to the directory containing pre-built native binaries for the current platform.
 */
export function GetNativeBinaryBuildDirectoryForPlatform(): string {
    return path.join(GetExtensionDirectory(), 'build-native', PLATFORM_SLUG);
}

/**
 * Gets the path to the native binary for the current platform.
 * 
 * This will look something like `build-native/<PLATFORM_SLUG>/<CORE_NATIVE_BIN_NAME>[<.exe>]`.
 * 
 * **The value of this variable does not predict that the file
 * it points to actually exists, nor that it is a valid executable.**
 * 
 * @returns The path to the native binary for the current platform.
 */
export async function GetPathToNativeBinary(): Promise<string | null> {
    const nativeBinDir = GetNativeBinaryBuildDirectoryForPlatform();

    return path.join(nativeBinDir, `${CORE_NATIVE_BIN_NAME}${IS_WIN ? '.exe' : ''}`);
}

/**
 * Checks whether the current platform is capable of running VSBloom's
 * native runtime or not.
 * 
 * @returns A promise that resolves to whether the current platform is
 * capable of running VSBloom's native runtime or not.
 */
export async function IsNativeCapable(): Promise<boolean> {
    if (NATIVE_CAPABLE_PLATFORMS.includes(PLATFORM_SLUG)) {
        const nativeBinDir = GetNativeBinaryBuildDirectoryForPlatform();
        const nativeBinDirExists = fs.existsSync(nativeBinDir);

        return nativeBinDirExists && fs.statSync(nativeBinDir).isDirectory();
    } else {
        return false;
    }
}
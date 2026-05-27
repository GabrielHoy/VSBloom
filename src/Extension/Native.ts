/**
 * Exposes API's related to VSBloom's native runtime and
 * the extension's interactions with it via dispatching
 * operating-system subprocesses and handling communication
 * to-and-from them.
 */

import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * The name of the core native binary.
 *
 * This will be located at `build/Native/<platform>/<CORE_NATIVE_BIN_NAME>[<.exe>]`.
 */
const CORE_NATIVE_BIN_NAME = 'vsbloom-native';
/**
 * Whether we're running on the Windows platform or not - this will
 * determine whether we'll need to append a `.exe` suffix to the
 * core native binary name when looking for it in build subdirectories.
 */
const IS_WIN = process.platform === 'win32';
/**
 * A list of platform slugs that pre-built native binaries should
 * be available for inside of the `build/Native`
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
 * The path to the directory containing pre-built native binaries
 * for the platform we're currently running on.
 *
 * This will look something like `build/Native/<PLATFORM_SLUG>`.
 * 
 * **The value of this variable does not predict that the directory
 * it points to actually exists, nor that any binaries are present
 * for this platform.**
 */
const NATIVE_BIN_DIR: string = path.join(__dirname, 'Native', PLATFORM_SLUG);

/**
 * Checks whether the current platform is capable of running VSBloom's
 * native runtime or not.
 * 
 * @returns A promise that resolves to whether the current platform is
 * capable of running VSBloom's native runtime or not.
 */
export async function IsNativeCapable(): Promise<boolean> {
    if (NATIVE_CAPABLE_PLATFORMS.includes(PLATFORM_SLUG)) {
        const nativeBinDirExists = fs.existsSync(NATIVE_BIN_DIR);

        return nativeBinDirExists && fs.statSync(NATIVE_BIN_DIR).isDirectory();
    } else {
        return false;
    }
}

/**
 * Gets the path to the native binary for the current platform.
 * 
 * @returns A promise that resolves to the path to the native binary for the current platform,
 * or `null` if the current platform is not capable of running VSBloom's native runtime.
 */
export async function GetPathToNativeBinary(): Promise<string | null> {
    const isNativeCapable = await IsNativeCapable();
    if (isNativeCapable) {
        return path.join(NATIVE_BIN_DIR, `${CORE_NATIVE_BIN_NAME}${IS_WIN ? '.exe' : ''}`);
    } else {
        return null;
    }
}


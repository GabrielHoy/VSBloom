/**
 * Exposes some helpful functions for tracking
 * version information related to the VSBloom
 * extension itself.
 */

import nativeRuntimeVCPKGJSON from '../Native/cpp/vcpkg.json';
import * as ExtensionReflection from './ExtensionReflection';

export function GetCurrentExtensionVersion() {
	return ExtensionReflection.GetExtensionPackageJSON()?.version;
}

export function GetCurrentNativeRuntimeVersion() {
    return nativeRuntimeVCPKGJSON.version;
}
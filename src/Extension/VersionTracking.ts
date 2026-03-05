/**
 * Exposes some helpful functions for tracking
 * version information related to the VSBloom
 * extension itself.
 */

import * as ExtensionReflection from './ExtensionReflection';

export function GetCurrentExtensionVersion() {
	return ExtensionReflection.GetExtensionPackageJSON()?.version;
}

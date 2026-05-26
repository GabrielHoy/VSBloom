import * as vscode from 'vscode';
import type { TestExtensionExports, TestPatchedAPI } from './ExtensionHostTypes';

const EXTENSION_ID = 'tamperedreality.vsbloom';

export async function GetExtensionAPI(): Promise<TestPatchedAPI> {
	const ext = vscode.extensions.getExtension<TestExtensionExports>(EXTENSION_ID);
	if (!ext) {
		throw new Error(`Extension '${EXTENSION_ID}' not found in this VS Code instance`);
	}

	const exports = ext.isActive ? ext.exports : await ext.activate();
	const api = await exports.extensionAPI;

	if (!api.isClientPatched) {
		throw new Error(
			`Extension API resolved as unpatched - unpatchedClientState: ${api.unpatchedClientState}. ` +
			`Check that the test workspace settings point to a product.json whose workbench files ` +
			`have .bak.vsbloom backup markers.`,
		);
	}

	return api;
}

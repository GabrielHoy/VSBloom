import * as assert from 'assert';
import * as vscode from 'vscode';
import { GetExtensionAPI } from './Helpers/GetExtensionAPI';
import type { TestExtensionExports } from './Helpers/ExtensionHostTypes';

const EXTENSION_ID = 'tamperedreality.vsbloom';

suite('Activation', () => {
	test('extension is present in the extension registry', () => {
		const ext = vscode.extensions.getExtension<TestExtensionExports>(EXTENSION_ID);
		assert.ok(ext, `Extension '${EXTENSION_ID}' should be registered`);
	});

	test('extension is active', () => {
		const ext = vscode.extensions.getExtension<TestExtensionExports>(EXTENSION_ID);
		assert.ok(ext?.isActive, 'Extension should be active');
	});

	test('extensionAPI export is a thenable (Promise-like)', () => {
		const ext = vscode.extensions.getExtension<TestExtensionExports>(EXTENSION_ID);
		assert.ok(ext?.exports?.extensionAPI, 'exports.extensionAPI should exist');
		assert.strictEqual(
			typeof ext.exports.extensionAPI.then,
			'function',
			'extensionAPI should be thenable',
		);
	});

	test('extensionAPI resolves to a PatchedExtensionAPI given the fake pre-patched env', async () => {
		const api = await GetExtensionAPI();
		assert.strictEqual(api.isClientPatched, true);
	});

	test('PatchedExtensionAPI exposes GetBridgeServer and GetEffectManager', async () => {
		const api = await GetExtensionAPI();
		assert.strictEqual(typeof api.GetBridgeServer, 'function');
		assert.strictEqual(typeof api.GetEffectManager, 'function');
	});
});

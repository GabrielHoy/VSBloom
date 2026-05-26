import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
	GetClientLauncherScriptElementString,
	GetSharedLibrariesScriptElementString,
	HTML_FILE_PATCH_INDICATOR,
	IsElectronHTMLFilePatched,
	IsElectronJSFilePatched,
	JS_FILE_PATCH_INDICATOR,
} from '../../../src/Patcher/ClientPatcher';

//Patch indicator constants

describe('HTML_FILE_PATCH_INDICATOR', () => {
	test('is a non-empty string', () => {
		expect(typeof HTML_FILE_PATCH_INDICATOR).toBe('string');
		expect(HTML_FILE_PATCH_INDICATOR.length).toBeGreaterThan(0);
	});

	test('contains an HTML comment', () => {
		expect(HTML_FILE_PATCH_INDICATOR).toContain('<!--');
		expect(HTML_FILE_PATCH_INDICATOR).toContain('-->');
	});

	test('mentions VSBloom so readers understand what modified the file', () => {
		expect(HTML_FILE_PATCH_INDICATOR.toLowerCase()).toContain('vsbloom');
	});
});

describe('JS_FILE_PATCH_INDICATOR', () => {
	test('is a non-empty string', () => {
		expect(typeof JS_FILE_PATCH_INDICATOR).toBe('string');
		expect(JS_FILE_PATCH_INDICATOR.length).toBeGreaterThan(0);
	});

	test('contains a JS block comment', () => {
		expect(JS_FILE_PATCH_INDICATOR).toContain('/*');
		expect(JS_FILE_PATCH_INDICATOR).toContain('*/');
	});

	test('mentions VSBloom so readers understand what modified the file', () => {
		expect(JS_FILE_PATCH_INDICATOR.toLowerCase()).toContain('vsbloom');
	});
});

//Patch-detection helpers

describe('IsElectronHTMLFilePatched', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-htmlpatching-'));
	});

	afterEach(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('returns true when the file contains the HTML patch indicator', async () => {
		const file = path.join(tmpDir, 'workbench.html');
		await fs.promises.writeFile(file, HTML_FILE_PATCH_INDICATOR + '<html></html>', 'utf8');
		await expect(IsElectronHTMLFilePatched(file)).resolves.toBe(true);
	});

	test('returns false for an unpatched HTML file', async () => {
		const file = path.join(tmpDir, 'workbench.html');
		await fs.promises.writeFile(file, '<html><head></head><body></body></html>', 'utf8');
		await expect(IsElectronHTMLFilePatched(file)).resolves.toBe(false);
	});

	test('throws for a non-existent file', async () => {
		await expect(
			IsElectronHTMLFilePatched(path.join(tmpDir, 'ghost.html')),
		).rejects.toThrow(/\[VSBloom\]/);
	});
});

describe('IsElectronJSFilePatched', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-jspatching-'));
	});

	afterEach(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('returns true when the file contains the JS patch indicator', async () => {
		const file = path.join(tmpDir, 'workbench.desktop.main.js');
		await fs.promises.writeFile(file, JS_FILE_PATCH_INDICATOR + 'var x = 1;', 'utf8');
		await expect(IsElectronJSFilePatched(file)).resolves.toBe(true);
	});

	test('returns false for an unpatched JS file', async () => {
		const file = path.join(tmpDir, 'workbench.desktop.main.js');
		await fs.promises.writeFile(file, 'var x = 1; var y = 2;', 'utf8');
		await expect(IsElectronJSFilePatched(file)).resolves.toBe(false);
	});

	test('throws for a non-existent file', async () => {
		await expect(
			IsElectronJSFilePatched(path.join(tmpDir, 'ghost.js')),
		).rejects.toThrow(/\[VSBloom\]/);
	});
});

/**
 * Script element builders, tested via explicit paths so no real
 * build artifacts required here for now
*/
describe('GetClientLauncherScriptElementString', () => {
	let tmpDir: string;
	let fakeScript: string;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-fakeclientlauncher-'));
		fakeScript = path.join(tmpDir, 'FakeVSBloomClient.js');
		await fs.promises.writeFile(fakeScript, 'console.log("fake client");', 'utf8');
	});

	afterEach(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('returns a <script> element string', async () => {
		const result = await GetClientLauncherScriptElementString(52847, 'token', fakeScript);
		expect(result).toContain('<script');
		expect(result).toContain('</script>');
	});

	test('embeds the port number', async () => {
		const result = await GetClientLauncherScriptElementString(12345, 'token', fakeScript);
		expect(result).toContain('12345');
	});

	test('embeds the auth token', async () => {
		const result = await GetClientLauncherScriptElementString(52847, 'myToken', fakeScript);
		expect(result).toContain('myToken');
	});

	test('includes the script file content', async () => {
		const result = await GetClientLauncherScriptElementString(52847, 'token', fakeScript);
		expect(result).toContain('fake client');
	});

	test('throws when the script file does not exist', async () => {
		await expect(
			GetClientLauncherScriptElementString(52847, 'token', path.join(tmpDir, 'missing.js')),
		).rejects.toThrow(/\[VSBloom\]/);
	});
});

describe('GetSharedLibrariesScriptElementString', () => {
	let tmpDir: string;
	let fakeLibs: string;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-fakeSharedLibraries-'));
		fakeLibs = path.join(tmpDir, 'FakeVSBloomSharedLibs.js');
		await fs.promises.writeFile(fakeLibs, 'window.__VSBLOOM_LIBS__ = {};', 'utf8');
	});

	afterEach(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('returns a <script> element string', async () => {
		const result = await GetSharedLibrariesScriptElementString(fakeLibs);
		expect(result).toContain('<script');
		expect(result).toContain('</script>');
	});

	test('includes the script file content', async () => {
		const result = await GetSharedLibrariesScriptElementString(fakeLibs);
		expect(result).toContain('__VSBLOOM_LIBS__');
	});

	test('throws when the script file does not exist', async () => {
		await expect(
			GetSharedLibrariesScriptElementString(path.join(tmpDir, 'missing.js')),
		).rejects.toThrow(/\[VSBloom\]/);
	});
});

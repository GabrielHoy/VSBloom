import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import {
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
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-htmlp-'));
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
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-jsp-'));
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

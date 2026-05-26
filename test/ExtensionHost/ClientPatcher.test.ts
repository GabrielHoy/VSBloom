import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import * as ClientPatcher from '../../src/Patcher/ClientPatcher';

suite('ClientPatcher (extension host)', () => {
	test('GetMainApplicationProductFile resolves using workspace settings', async () => {
		const productFilePath = await ClientPatcher.GetMainApplicationProductFile(vscode);
		assert.ok(
			fs.existsSync(productFilePath),
			`product.json should exist at resolved path: ${productFilePath}`,
		);
		assert.strictEqual(
			path.basename(productFilePath),
			'product.json',
			'Resolved file should be named product.json',
		);
		const productJson = JSON.parse(fs.readFileSync(productFilePath, 'utf8')) as {
			checksums?: unknown;
		};
		assert.ok(productJson.checksums, 'product.json should contain checksums');
	});

	test('IsClientPatched returns true for the pre-patched test environment', async () => {
		const productFilePath = await ClientPatcher.GetMainApplicationProductFile(vscode);
		const isPatched = await ClientPatcher.IsClientPatched(productFilePath);
		assert.strictEqual(isPatched, true);
	});

	test('GetPathToAppFile resolves workbench.html to an existing file', async () => {
		const productFilePath = await ClientPatcher.GetMainApplicationProductFile(vscode);
		const htmlPath = await ClientPatcher.GetPathToAppFile(productFilePath, 'workbench.html');
		assert.ok(fs.existsSync(htmlPath), `workbench.html should exist at: ${htmlPath}`);
	});

	test('GetClientLauncherScriptElementString with explicit script path', async () => {
		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-cp-'));
		const fakeScript = path.join(tmpDir, 'FakeClient.js');
		await fs.promises.writeFile(fakeScript, 'console.log("fake vsbloom client");', 'utf8');

		try {
			const result = await ClientPatcher.GetClientLauncherScriptElementString(
				52847,
				'test-auth-token-xyz-abc-you-just-lost-the-game',
				fakeScript,
			);
			assert.ok(result.includes('<script'), 'Result should contain a <script> tag');
			assert.ok(result.includes('52847'), 'Result should embed the port number');
			assert.ok(result.includes('test-auth-token-xyz-abc-you-just-lost-the-game'), 'Result should embed the auth token');
			assert.ok(result.includes('fake vsbloom client'), 'Result should include script content');
		} finally {
			await fs.promises.rm(tmpDir, { recursive: true, force: true });
		}
	});

	test('GetSharedLibrariesScriptElementString with explicit script path', async () => {
		const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-sl-'));
		const fakeLibs = path.join(tmpDir, 'FakeSharedLibs.js');
		await fs.promises.writeFile(fakeLibs, 'window.__VSBLOOM__ = {};', 'utf8');

		try {
			const result = await ClientPatcher.GetSharedLibrariesScriptElementString(fakeLibs);
			assert.ok(result.includes('<script'), 'Result should contain a <script> tag');
			assert.ok(result.includes('__VSBLOOM__'), 'Result should include the script content');
		} finally {
			await fs.promises.rm(tmpDir, { recursive: true, force: true });
		}
	});
});

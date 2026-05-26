import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';

export interface ClonedEnvironment {
	tempDir: string;
	productJsonPath: string;
	filesCloned: string[];
}

/**
 * Locates the running VS Code installation's product.json via vscode.env.appRoot.
 * Only callable inside the VS Code extension host.
 */
export function FindProductJSONPath(): string {
	// vscode.env.appRoot = <install>/resources/app
	const productJsonPath = path.join(vscode.env.appRoot, 'product.json');
	if (!fs.existsSync(productJsonPath)) {
		throw new Error(`[VSBloom] product.json not found at expected path: ${productJsonPath}`);
	}
	return productJsonPath;
}

/**
 * Clones the VS Code workbench files tracked by a given product.json into a
 * fresh temp directory, placing empty .bak.vsbloom markers beside each clone.
 *
 * The markers make IsClientPatched() return true against the clone - this feeds
 * VSBloom a "fake pre-patched environment" such that we never get an activation
 * prompt during tests.
 */
export async function CloneEnvironment(productJsonPath: string): Promise<ClonedEnvironment> {
	const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-live-env-'));
	const filesCloned: string[] = [];

	const productJson = JSON.parse(
		await fs.promises.readFile(productJsonPath, 'utf8'),
	) as { checksums?: Record<string, string> };

	const checksums = productJson.checksums ?? {};
	const appDir = path.dirname(productJsonPath);

	await fs.promises.copyFile(productJsonPath, path.join(tempDir, 'product.json'));

	const targets = ['workbench.html', 'workbench.desktop.main.js'];

	for (const key of Object.keys(checksums)) {
		if (!targets.some((name) => key.includes(name))) {
			continue;
		}

		const srcPath = path.join(appDir, 'out', key);
		if (!fs.existsSync(srcPath)) {
			continue;
		}

		// If VSBloom has patched this file in the live install, the original
		// unpatched content is preserved in the .bak.vsbloom backup. Prefer
		// that as the clone source so tests always start from a clean file,
		// regardless of whether the editor under test is currently patched.
		const backupSrc = srcPath + '.bak.vsbloom';
		const effectiveSrc = fs.existsSync(backupSrc) ? backupSrc : srcPath;

		const destPath = path.join(tempDir, 'out', key);
		await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
		await fs.promises.copyFile(effectiveSrc, destPath);
		await fs.promises.writeFile(destPath + '.bak.vsbloom', '');
		filesCloned.push(destPath);
	}

	return {
		tempDir,
		productJsonPath: path.join(tempDir, 'product.json'),
		filesCloned,
	};
}

export async function DisposeOfClonedEnvironment(cloned: ClonedEnvironment): Promise<void> {
	await fs.promises.rm(cloned.tempDir, { recursive: true, force: true });
}

// @ts-check
import { defineConfig } from '@vscode/test-cli';
import { downloadAndUnzipVSCode } from '@vscode/test-electron';
import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const execFileAsync = promisify(execFile);

// These directories get populated as the setup runs;
// they all get wiped on exit.
/** @type {string[]} */
const ephemeralDirs = [];

// *VS Code
// downloadAndUnzipVSCode caches the download in .vscode-test/; subsequent runs
// return immediately. The returned path is the VS Code executable.

/** @type {string} */
const vscodePath = await downloadAndUnzipVSCode('stable');
CloneWorkbenchFiles('vscode', ResolveVSCodeProductJSON(vscodePath));

// *Cursor
// Cursor uses an InnoSetup installer on Windows (identifiable by unins000.exe),
// which no npm-available tool can extract. We find the existing installation via
// the Windows registry instead — works regardless of where the user installed it.

/** @type {{ executablePath: string; productJsonPath: string } | null} */
const cursorInstall = await FindLocallyInstalledEditor('Cursor', 'Cursor.exe', 'cursor');

// *Windsurf

/** @type {{ executablePath: string; productJsonPath: string } | null} */
const windsurfInstall = await FindLocallyInstalledEditor('Windsurf', 'windsurf.exe', 'windsurf');

// Cleanup on exit
// By default the entire .vscode-test/ directory is wiped on exit, including the
// downloaded VS Code archive (~700 MB). Set VSBLOOM_KEEP_VSCODE_CACHE=1 to
// preserve the archive across runs so the next run skips the re-download.
const STATIC_EPHEMERAL = process.env.VSBLOOM_KEEP_VSCODE_CACHE
	? [
		path.join(__dirname, '.vscode-test', 'extensions'),
		path.join(__dirname, '.vscode-test', 'user-data'),
	]
	: [path.join(__dirname, '.vscode-test')];

for (const sig of ['exit', 'SIGINT', 'SIGTERM']) {
	process.on(sig, () => {
		for (const dir of [...ephemeralDirs, ...STATIC_EPHEMERAL]) {
			try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
		}
	});
}

// Config export

const SHARED = {
	files: 'build-test/test/ExtensionHost/**/*.test.js',
	extensionDevelopmentPath: '.',
	mocha: { timeout: 30000 },
};

export default [
	defineConfig({ ...SHARED, label: 'VS Code',  workspaceFolder: 'test/MockWorkspace/vscode' }),
	...(cursorInstall ? [defineConfig({
		...SHARED,
		label: 'Cursor',
		workspaceFolder: 'test/MockWorkspace/cursor',
		useInstallation: {
			fromPath: cursorInstall.executablePath
		},
	})] : []),
	...(windsurfInstall ? [defineConfig({
		...SHARED,
		label: 'Windsurf',
		workspaceFolder: 'test/MockWorkspace/windsurf',
		useInstallation: {
			fromPath: windsurfInstall.executablePath
		},
	})] : []),
];

/**
 * Locates a locally installed VS Code-compatible editor via the Windows registry,
 * then clones its workbench files for testing. Returns null (with a warning) on
 * non-Windows or if the editor is not installed, so the run degrades gracefully.
 *
 * Cursor and Windsurf both use InnoSetup on Windows (identifiable by unins000.exe),
 * which cannot be extracted by 7z. The registry's InstallLocation is the reliable,
 * path-agnostic way to find them regardless of where the user installed them.
 *
 * @param {string} name               display name, e.g. 'Cursor'
 * @param {string} executableName     binary to locate, e.g. 'Cursor.exe'
 * @param {string} registrySearch     case-insensitive regex matched against DisplayName
 * @returns {Promise<{ executablePath: string; productJsonPath: string } | null>}
 */
async function FindLocallyInstalledEditor(name, executableName, registrySearch) {
	if (process.platform !== 'win32') {
		console.warn(`[VSBloom] ${name}: skipped since registry detection is Windows-only currently`);
		return null;
	}
	try {
		const installDir = await QueryRegistryInstallLocation(registrySearch);
		if (!installDir) {
			console.warn(`[VSBloom] Warning: The ${name} IDE was not found in the registry: Install it to include it in the deployment test run.`);
			return null;
		}

		const executablePath = FindFileDeep(installDir, executableName);
		const productJsonPath = FindFileDeep(installDir, 'product.json');
		if (!executablePath) {
			throw new Error(`${executableName} not found under ${installDir}`);
		}
		if (!productJsonPath) {
			throw new Error(`product.json not found under ${installDir}`);
		}

		console.log(`[VSBloom] Found ${name} at ${installDir}`);
		CloneWorkbenchFiles(name, productJsonPath);
		return { executablePath, productJsonPath };
	} catch (err) {
		console.warn(`[VSBloom] ${name} skipped: ${/** @type {Error} */ (err).message}`);
		return null;
	}
}

/**
 * Queries the Windows Uninstall registry hives for an entry whose DisplayName
 * matches the given case-insensitive regex, and returns its InstallLocation.
 *
 * @param {string} displayNameRegex
 * @returns {Promise<string | null>}
 */
async function QueryRegistryInstallLocation(displayNameRegex) {
	const script = `
$hives = @(
    'HKCU:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
    'HKLM:\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall'
)
$result = $hives | ForEach-Object {
    Get-ChildItem $_ -ErrorAction SilentlyContinue |
        Get-ItemProperty -ErrorAction SilentlyContinue |
        Where-Object { $_.DisplayName -match '${displayNameRegex}' -and $_.InstallLocation }
} | Select-Object -First 1 -ExpandProperty InstallLocation
if ($result) { Write-Output $result.TrimEnd('\\') }
`;
	const { stdout } = await execFileAsync(
		'powershell',
		['-NoProfile', '-NonInteractive', '-Command', script],
		{ timeout: 10_000 },
	);
	return stdout.trim() || null;
}

/**
 * Clones workbench files tracked by a product.json into a fresh temp directory,
 * places empty .bak.vsbloom markers (so IsClientPatched returns true without
 * touching the real install), and writes the per-editor workspace settings.json.
 *
 * @param {string} editorName
 * @param {string} productJsonPath
 */
function CloneWorkbenchFiles(editorName, productJsonPath) {
	const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `vsbloom-test-${editorName}-`));
	ephemeralDirs.push(tempDir);

	const productJson = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
	const checksums = /** @type {Record<string, string>} */ (productJson.checksums ?? {});
	const appDir = path.dirname(productJsonPath);

	fs.copyFileSync(productJsonPath, path.join(tempDir, 'product.json'));

	const targets = ['workbench.html', 'workbench.desktop.main.js'];
	for (const key of Object.keys(checksums)) {
		if (!targets.some((name) => key.includes(name))) {
			continue;
		}
		const src = path.join(appDir, 'out', key);
		if (!fs.existsSync(src)) {
			continue;
		}

		// If VSBloom has already patched this file in the live install, its
		// .bak.vsbloom backup holds the original unpatched content. Prefer that
		// as the clone source so the test environment always starts clean,
		// regardless of whether the editor being tested is currently patched.
		const backupSrc = src + '.bak.vsbloom';
		const effectiveSrc = fs.existsSync(backupSrc) ? backupSrc : src;
		if (effectiveSrc !== src) {
			console.log(`[VSBloom] ${editorName}: ${path.basename(src)} is patched in live install - falling back to .bak.vsbloom for file clone op to ensure a clean test slate`);
		}
		const dest = path.join(tempDir, 'out', key);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(effectiveSrc, dest);
		fs.writeFileSync(dest + '.bak.vsbloom', '');
	}

	const settingsDir = path.join(__dirname, 'test', 'MockWorkspace', editorName, '.vscode');
	fs.mkdirSync(settingsDir, { recursive: true });
	fs.writeFileSync(
		path.join(settingsDir, 'settings.json'),
		JSON.stringify({ 'vsbloom.patcher.appProductFile': path.join(tempDir, 'product.json') }, null, 2),
	);
}

/**
 * BFS search; find a file by name within a directory tree - case-insensitive.
 * Returns the first match found at the shallowest depth; returns null if no match is found.
 * 
 * @param {string} rootDir
 * @param {string} filename
 * @param {number} maxDepth
 * @returns {string | null}
 */
function FindFileDeep(rootDir, filename, maxDepth = 8) {
	const lower = filename.toLowerCase();
	/** @type {{ dir: string; depth: number }[]} */
	const queue = [{ dir: rootDir, depth: 0 }];
	while (queue.length > 0) {
		const { dir, depth } = /** @type {{ dir: string; depth: number }} */ (queue.shift());
		/** @type {import('node:fs').Dirent[]} */
		let entries;
		try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch {
			continue;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() && entry.name.toLowerCase() === lower) {
				return path.join(dir, entry.name);
			}
		}
		if (depth < maxDepth) {
			for (const entry of entries) {
				if (entry.isDirectory()) {
					queue.push({ dir: path.join(dir, entry.name), depth: depth + 1 });
				}
			}
		}
	}
	return null;
}

/**
 * Derives the product.json path from the executable returned by
 * downloadAndUnzipVSCode. The install structure differs by platform.
 *
 * @param {string} executablePath
 * @returns {string}
 */
function ResolveVSCodeProductJSON(executablePath) {
	if (process.platform === 'darwin') {
		// executable: .../Visual Studio Code.app/Contents/MacOS/Electron
		// product.json: .../Visual Studio Code.app/Contents/Resources/app/product.json
		const contentsDir = path.dirname(path.dirname(executablePath));
		return path.join(contentsDir, 'Resources', 'app', 'product.json');
	}
	// Windows/Linux flow - try for a direct path first (system installs), then scan one level
	// deep for a commit-hash subdirectory (Windows archive format - Code.exe is a
	// launcher; the actual app lives in e.g. f6cfa2ea24/resources/app/).
	const installDir = path.dirname(executablePath);
	const directPath = path.join(installDir, 'resources', 'app', 'product.json');
	if (fs.existsSync(directPath)) {
		return directPath;
	}
	for (const entry of fs.readdirSync(installDir, { withFileTypes: true })) {
		if (!entry.isDirectory()) {
			continue;
		}
		const candidate = path.join(installDir, entry.name, 'resources', 'app', 'product.json');
		if (fs.existsSync(candidate)) {
			return candidate;
		}
	}
	throw new Error(`[VSBloom] Warning: Could not find product.json under ${installDir}`);
}

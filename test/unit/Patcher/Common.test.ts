import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import * as Common from '../../../src/Patcher/Common';

//Pure functions

describe('RaiseError', () => {
	test('prefixes the message with [VSBloom]:', () => {
		expect(Common.RaiseError('something broke')).toBe('[VSBloom]: something broke');
	});

	test('returns a string', () => {
		expect(typeof Common.RaiseError('x')).toBe('string');
	});
});

describe('RaiseWarning', () => {
	test('calls console.warn with the [VSBloom] prefix', () => {
		const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
		Common.RaiseWarning('heads up');
		expect(spy).toHaveBeenCalledWith('[VSBloom]: heads up');
		spy.mockRestore();
	});
});

//fs-based helpers (real temp files)

describe('IsThereAFileAtPath', () => {
	let tmpFile: string;

	beforeEach(async () => {
		tmpFile = path.join(os.tmpdir(), `vsbloom-test-${Date.now()}.txt`);
		await fs.promises.writeFile(tmpFile, 'content', 'utf8');
	});

	afterEach(async () => {
		await fs.promises.unlink(tmpFile).catch(() => {});
	});

	test('returns true for an existing file', async () => {
		await expect(Common.IsThereAFileAtPath(tmpFile)).resolves.toBe(true);
	});

	test('returns false for a non-existent path', async () => {
		await expect(
			Common.IsThereAFileAtPath(tmpFile + '.nonexistent'),
		).resolves.toBe(false);
	});

	test('returns false for a directory', async () => {
		await expect(Common.IsThereAFileAtPath(os.tmpdir())).resolves.toBe(false);
	});
});

describe('IsThereADirectoryAtPath', () => {
	test('returns true for an existing directory', async () => {
		await expect(Common.IsThereADirectoryAtPath(os.tmpdir())).resolves.toBe(true);
	});

	test('returns false for a non-existent path', async () => {
		await expect(
			Common.IsThereADirectoryAtPath(path.join(os.tmpdir(), 'does-not-exist-vsbloom')),
		).resolves.toBe(false);
	});

	test('returns false for a file', async () => {
		const tmpFile = path.join(os.tmpdir(), `vsbloom-dirtest-${Date.now()}.txt`);
		await fs.promises.writeFile(tmpFile, '');
		try {
			await expect(Common.IsThereADirectoryAtPath(tmpFile)).resolves.toBe(false);
		} finally {
			await fs.promises.unlink(tmpFile).catch(() => {});
		}
	});
});

describe('GetFileChecksum', () => {
	let tmpFile: string;

	beforeEach(async () => {
		tmpFile = path.join(os.tmpdir(), `vsbloom-chk-${Date.now()}.txt`);
		await fs.promises.writeFile(tmpFile, 'checksum test content', 'utf8');
	});

	afterEach(async () => {
		await fs.promises.unlink(tmpFile).catch(() => {});
	});

	test('returns a non-empty string', async () => {
		const checksum = await Common.GetFileChecksum(tmpFile);
		expect(typeof checksum).toBe('string');
		expect(checksum.length).toBeGreaterThan(0);
	});

	test('does not include trailing padding characters', async () => {
		const checksum = await Common.GetFileChecksum(tmpFile);
		expect(checksum.endsWith('=')).toBe(false);
	});

	test('is deterministic - same file content gives same checksum', async () => {
		const a = await Common.GetFileChecksum(tmpFile);
		const b = await Common.GetFileChecksum(tmpFile);
		expect(a).toBe(b);
	});

	test('different content gives different checksums', async () => {
		const tmpFile2 = path.join(os.tmpdir(), `vsbloom-chk2-${Date.now()}.txt`);
		await fs.promises.writeFile(tmpFile2, 'completely different content', 'utf8');
		try {
			const a = await Common.GetFileChecksum(tmpFile);
			const b = await Common.GetFileChecksum(tmpFile2);
			expect(a).not.toBe(b);
		} finally {
			await fs.promises.unlink(tmpFile2).catch(() => {});
		}
	});

	test('throws for a non-existent file', async () => {
		await expect(
			Common.GetFileChecksum(tmpFile + '.nonexistent'),
		).rejects.toThrow();
	});
});

describe('PerformActionOnFiles', () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-paf-'));
	});

	afterEach(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('non-existent paths are returned as invalid', async () => {
		const missing = path.join(tmpDir, 'ghost.txt');
		const action = vi.fn().mockResolvedValue(undefined);
		const invalid = await Common.PerformActionOnFiles([missing], action);
		expect(invalid).toContain(missing);
		expect(action).not.toHaveBeenCalled();
	});

	test('calls the action for each valid, accessible file', async () => {
		const file = path.join(tmpDir, 'real.txt');
		await fs.promises.writeFile(file, 'data', 'utf8');
		const action = vi.fn().mockResolvedValue(undefined);
		const invalid = await Common.PerformActionOnFiles([file], action);
		expect(invalid).toHaveLength(0);
		expect(action).toHaveBeenCalledWith(file);
	});

	test('directories are returned as invalid and action is skipped', async () => {
		const action = vi.fn().mockResolvedValue(undefined);
		const invalid = await Common.PerformActionOnFiles([tmpDir], action);
		expect(invalid).toContain(tmpDir);
		expect(action).not.toHaveBeenCalled();
	});

	test('mixes of valid and invalid paths are handled correctly', async () => {
		const validFile = path.join(tmpDir, 'valid.txt');
		const missingFile = path.join(tmpDir, 'missing.txt');
		await fs.promises.writeFile(validFile, 'hi', 'utf8');
		const touched: string[] = [];
		const invalid = await Common.PerformActionOnFiles(
			[validFile, missingFile],
			async (p) => { touched.push(p); },
		);
		expect(touched).toContain(validFile);
		expect(touched).not.toContain(missingFile);
		expect(invalid).toContain(missingFile);
	});
});

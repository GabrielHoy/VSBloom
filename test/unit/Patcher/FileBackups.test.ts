import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { VSBLOOM_FILE_EXTENSION } from '../../../src/Patcher/Common';
import * as FileBackups from '../../../src/Patcher/FileBackups';

//Pure path utility

describe('GetBackupFilePathFor', () => {
	test('appends .bak.vsbloom to the filename', () => {
		const original = path.join('some', 'path', 'workbench.html');
		const result = FileBackups.GetBackupFilePathFor(original);
		expect(result).toBe(path.join('some', 'path', `workbench.html.bak${VSBLOOM_FILE_EXTENSION}`));
	});

	test('preserves the directory of the original file', () => {
		const original = path.join('a', 'b', 'c', 'file.txt');
		const backup = FileBackups.GetBackupFilePathFor(original);
		expect(path.dirname(backup)).toBe(path.join('a', 'b', 'c'));
	});

	test('backup name includes the original filename', () => {
		const backup = FileBackups.GetBackupFilePathFor('/dir/workbench.desktop.main.js');
		expect(path.basename(backup)).toContain('workbench.desktop.main.js');
	});
});

//Round-trip fs operations

const ORIGINAL_CONTENT = 'original file content: This is a VSBloom test file. If you\'re seeing this...something went wrong.';

describe('BackupFile / DoesFileHaveBackup / RestoreFileFromBackup / RemoveBackupFile', () => {
	let tmpDir: string;
	let tmpFile: string;

	beforeEach(async () => {
		tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'vsbloom-bk-'));
		tmpFile = path.join(tmpDir, 'workbench.html');
		await fs.promises.writeFile(tmpFile, ORIGINAL_CONTENT, 'utf8');
	});

	afterEach(async () => {
		await fs.promises.rm(tmpDir, { recursive: true, force: true });
	});

	test('DoesFileHaveBackup returns false before any backup is created', async () => {
		await expect(FileBackups.DoesFileHaveBackup(tmpFile)).resolves.toBe(false);
	});

	test('BackupFile creates a file at the expected backup path', async () => {
		await FileBackups.BackupFile(tmpFile);
		const backupPath = FileBackups.GetBackupFilePathFor(tmpFile);
		const exists = await fs.promises
			.stat(backupPath)
			.then((s) => s.isFile())
			.catch(() => false);
		expect(exists).toBe(true);
	});

	test('DoesFileHaveBackup returns true after BackupFile', async () => {
		await FileBackups.BackupFile(tmpFile);
		await expect(FileBackups.DoesFileHaveBackup(tmpFile)).resolves.toBe(true);
	});

	test('backup file content matches the original', async () => {
		await FileBackups.BackupFile(tmpFile);
		const backupContent = await fs.promises.readFile(
			FileBackups.GetBackupFilePathFor(tmpFile),
			'utf8',
		);
		expect(backupContent).toBe(ORIGINAL_CONTENT);
	});

	test('RestoreFileFromBackup restores the original content after the file was modified', async () => {
		await FileBackups.BackupFile(tmpFile);
		await fs.promises.writeFile(tmpFile, 'modified: this should be overwritten', 'utf8');
		await FileBackups.RestoreFileFromBackup(tmpFile, false);
		const restored = await fs.promises.readFile(tmpFile, 'utf8');
		expect(restored).toBe(ORIGINAL_CONTENT);
	});

	test('RestoreFileFromBackup with removeBackupOnceDone=true removes the backup', async () => {
		await FileBackups.BackupFile(tmpFile);
		await FileBackups.RestoreFileFromBackup(tmpFile, true);
		await expect(FileBackups.DoesFileHaveBackup(tmpFile)).resolves.toBe(false);
	});

	test('RestoreFileFromBackup with removeBackupOnceDone=false keeps the backup', async () => {
		await FileBackups.BackupFile(tmpFile);
		await FileBackups.RestoreFileFromBackup(tmpFile, false);
		await expect(FileBackups.DoesFileHaveBackup(tmpFile)).resolves.toBe(true);
	});

	test('RemoveBackupFile deletes the backup and DoesFileHaveBackup returns false', async () => {
		await FileBackups.BackupFile(tmpFile);
		await FileBackups.RemoveBackupFile(tmpFile);
		await expect(FileBackups.DoesFileHaveBackup(tmpFile)).resolves.toBe(false);
	});

	test('RestoreFileFromBackup throws if no backup exists', async () => {
		await expect(FileBackups.RestoreFileFromBackup(tmpFile, false)).rejects.toThrow(
			/\[VSBloom\]/,
		);
	});
});

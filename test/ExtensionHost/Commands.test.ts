import * as assert from 'assert';
import * as vscode from 'vscode';

const EXPECTED_COMMANDS = [
	'vsbloom.enable',
	'vsbloom.disable',
	'vsbloom.retryPatch',
	'vsbloom.reloadEffects',
	'vsbloom.openMenu',
	'vsbloom.openExtensionSettingsEditor',
];

suite('Commands', () => {
	let registeredCommands: string[];

	suiteSetup(async () => {
		registeredCommands = await vscode.commands.getCommands(true);
	});

	for (const cmd of EXPECTED_COMMANDS) {
		test(`'${cmd}' is registered`, () => {
			assert.ok(
				registeredCommands.includes(cmd),
				`Command '${cmd}' should be registered`,
			);
		});
	}
});

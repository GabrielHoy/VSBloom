import * as path from 'node:path';
import * as sudo from '@vscode/sudo-prompt';
import * as vscode from 'vscode';
import { ConstructVSBloomLogPrefix } from '../Debug/Colorful';
import { EffectManager } from '../Effects/EffectManager';
import { VSBloomBridgeServer } from '../ExtensionBridge/Server';
import * as ClientPatcher from '../Patcher/ClientPatcher';
import * as Common from '../Patcher/Common';
import * as Elevation from '../Patcher/Elevation';
import { StatusBarIconManager } from './StatusBarIconManager';
import * as VersionTracking from './VersionTracking';
import { MenuPanel } from './WebviewMenuPanel';

enum ClientPatchingStatus {
	PATCHED = 0,
	NEEDS_RESTART = 1,
	FAILED = 2,
	UNPATCHED = 3,
}

//Global references for the bridge and effect manager
let server: VSBloomBridgeServer | null = null;
let effectManager: EffectManager | null = null;
let statusBarIconManager: StatusBarIconManager | null = null;

/**
 * Get(or create) the bridge server singleton
 */
function GetBridgeServer(context: vscode.ExtensionContext): VSBloomBridgeServer {
	if (!server) {
		server = new VSBloomBridgeServer(context);
	}
	return server;
}

/**
 * Get(or create) the effect manager singleton
 */
function GetEffectManager(): EffectManager {
	if (!effectManager) {
    if (!server) {
      throw new Error('Server is not initialized, but effect manager is attempted to be created');
    }

		effectManager = new EffectManager(server);
	}
	return effectManager;
}

/**
 * Ensure that the current client is correctly patched and ready
 * to go - and patches it if it's not
 */
async function EnsureClientIsPatched(
	context: vscode.ExtensionContext,
	appProductFilePath: string,
): Promise<ClientPatchingStatus> {
	const isClientPatched = await ClientPatcher.IsClientPatched(appProductFilePath);

	if (isClientPatched) {
		return ClientPatchingStatus.PATCHED;
	}

	const config = vscode.workspace.getConfiguration();
	const suppressClientCorruptWarning =
		config.get<boolean>('vsbloom.patcher.suppressCorruptionWarning') === true;

	//get the bridge server's parameters for patching
	const currentBridge = GetBridgeServer(context);
	const bridgePort = currentBridge.GetServerPort();
	const authToken = currentBridge.GetAuthToken();

	//the client isn't patched, we need to patch it
	const amIElevated = await Elevation.HasElevation();
	if (!amIElevated) {
		//not a big deal as long as we can still patch app files,
		//but we'll need to elevate if the VSC installation is
		//installed system-wide instead of being user-local
		const needsElevationToPatch =
			await ClientPatcher.WouldClientPatchingRequireElevation(appProductFilePath);

		if (needsElevationToPatch) {
			//we'll have to prompt the user for elevation if we want
			//to apply the patches we need to in order for VSBloom's
			//launcher to function properly
			const elevatedPatcherScriptPath = path.join(__dirname, 'ElevatedClientPatcher.js');

			return new Promise<ClientPatchingStatus>((resolve, reject) => {
				//pass all required arguments to the elevated patcher
				const args = [
					`"${elevatedPatcherScriptPath}"`,
					`"patch"`,
					`"${appProductFilePath}"`,
					`"${suppressClientCorruptWarning.toString()}"`,
					`"${bridgePort}"`,
					`"${authToken}"`,
				].join(' ');

				sudo.exec(
					`node ${args}`,
					{
						name: 'VSBloom',
					},
					(error, stdout, stderr) => {
						if (error) {
							//error might just be that the user disallowed our elevation request
							if (error.message.includes('User did not grant permission')) {
								//fair enough
								vscode.window.showErrorMessage(
									"VSBloom's client patcher was denied process elevation, the VSBloom extension cannot correctly function without this.",
								);
								resolve(ClientPatchingStatus.FAILED);
								return;
							} else {
								reject(
									new Error(
										Common.RaiseError(
											`Elevation handoff encountered an error: ${error.message}`,
										),
									),
								);
								return;
							}
						}

						console.log(
							`${ConstructVSBloomLogPrefix('Extension', 'debug')}Elevated Client Patch - stdout:`,
							stdout,
						);
						console.log(
							`${ConstructVSBloomLogPrefix('Extension', 'debug')}Elevated Client Patch - stderr:`,
							stderr,
						);

						//if there's no error from the elevated script's process,
						//we can assume that the patching was successful
						resolve(ClientPatchingStatus.NEEDS_RESTART);
						return;
					},
				);
			});
		} else {
			//we don't need elevation to patch the client,
			//so we can do so without further ado
			await ClientPatcher.PerformClientPatching(
				appProductFilePath,
				suppressClientCorruptWarning,
				bridgePort,
				authToken,
			);
			return ClientPatchingStatus.NEEDS_RESTART;
		}
	} else {
		//if we're already elevated as is, we can
		//still perform our patching even with VSC
		//being installed system-wide
		await ClientPatcher.PerformClientPatching(
			appProductFilePath,
			suppressClientCorruptWarning,
			bridgePort,
			authToken,
		);
		return ClientPatchingStatus.NEEDS_RESTART;
	}
}

async function EnsureClientIsUnpatched(appProductFilePath: string): Promise<ClientPatchingStatus> {
	const isClientPatched = await ClientPatcher.IsClientPatched(appProductFilePath);

	if (!isClientPatched) {
		return ClientPatchingStatus.UNPATCHED;
	}

	//client is patched, we need to un-patch it
	const amIElevated = await Elevation.HasElevation();
	if (!amIElevated) {
		//not a big deal as long as we can still modify app files,
		//but we'll need to elevate if the VSC installation is
		//installed system-wide instead of being user-local
		const needsElevationToUnPatch =
			await ClientPatcher.WouldClientPatchingRequireElevation(appProductFilePath);

		if (needsElevationToUnPatch) {
			//we'll have to prompt the user for elevation if we want
			//to remove the patches we applied to the client
			const elevatedPatcherScriptPath = path.join(__dirname, 'ElevatedClientPatcher.js');

			return new Promise<ClientPatchingStatus>((resolve, reject) => {
				sudo.exec(
					`node "${elevatedPatcherScriptPath}" "unPatch" "${appProductFilePath}"`,
					{
						name: 'VSBloom',
					},
					(error, stdout, stderr) => {
						if (error) {
							//error might just be that the user disallowed our elevation request
							if (error.message.includes('User did not grant permission')) {
								vscode.window.showErrorMessage(
									'VSBloom was denied process elevation while trying to remove client patches, the extension cannot undo its changes to the client without this.',
								);
								resolve(ClientPatchingStatus.FAILED);
								return;
							} else {
								reject(
									new Error(
										Common.RaiseError(
											`Elevation handoff encountered an error: ${error.message}`,
										),
									),
								);
								return;
							}
						}

						console.log(
							`${ConstructVSBloomLogPrefix('Extension', 'debug')}Elevated Client Un-patch - stdout:`,
							stdout,
						);
						console.log(
							`${ConstructVSBloomLogPrefix('Extension', 'debug')}Elevated Client Un-patch - stderr:`,
							stderr,
						);

						//if there's no error from the elevated script's process,
						//we can assume that the un-patching was successful
						resolve(ClientPatchingStatus.NEEDS_RESTART);
						return;
					},
				);
			});
		} else {
			//we don't need elevation to un-patch the client,
			//so we can do so without further ado
			await ClientPatcher.UnPatchClient(appProductFilePath);
			return ClientPatchingStatus.NEEDS_RESTART;
		}
	} else {
		//if we're already elevated as is, we can
		//still un-patch the client even with VSCode
		//being installed system-wide
		await ClientPatcher.UnPatchClient(appProductFilePath);
		return ClientPatchingStatus.NEEDS_RESTART;
	}
}

/**
 * Show a prompt to the user asking if they're OK with
 * patching the client, then return their response
 */
async function ShowClientPatchRequestPrompt(context: vscode.ExtensionContext): Promise<boolean> {
	const userChoice = await vscode.window.showInformationMessage(
		"In order for VSBloom to function properly, we need to apply a patch to the Electron Client to make many of the extension's features possible. Are you OK with this?",
		'Yes',
		'No',
		"Don't Show Again",
	);

	if (userChoice === 'Yes') {
		return true;
	} else if (userChoice === "Don't Show Again") {
		context.globalState.update('vsbloom.patcher.doNotAskToPatchClient', true);
	}

	return false;
}

async function AttemptOpenMenu(context: vscode.ExtensionContext, pageNameOpenTo?: string) {
	if (!effectManager) {
		vscode.window.showErrorMessage(
			'Could not find the effect manager, try running this command on the window that has the Effect Manager channel open in the Output panel!',
		);
		return;
	}
	if (!server) {
		vscode.window.showErrorMessage(
			'Could not find the bridge server, try running this command on the window that has the VSBloom: Extension Bridge channel open in the Output panel!',
		);
		return;
	}

	MenuPanel.ShowPanel(
		'vsbloom',
		'VS: Bloom',
		context.extensionUri,
		context,
		server,
		pageNameOpenTo,
	);
}

/**
 * Called after the extension is activated and the current client is
 * verified to have been correctly patched and ready to go
 *
 * *For practical use this can be thought of as the 'real' extension entry point*
 */
async function ExtensionActivatedAndClientPatchingVerified(context: vscode.ExtensionContext) {
	try {
		vscode.commands.executeCommand('setContext', 'vsbloom.clientPatched', true);

		//initialize and start the WebSocket bridge
		const currentBridge = GetBridgeServer(context);

		console.log(
			`${ConstructVSBloomLogPrefix('Extension', 'info')}Attempting to fire up the extension bridge server`,
		);
		await currentBridge.Start();
		//add the bridge server to the extension subscriptions for cleanup
		context.subscriptions.push(currentBridge);
		console.log(
			`${ConstructVSBloomLogPrefix('Extension', 'info')}Extension bridge server started; we are now taking the role of the VSBloom master server`,
		);

		//initialize the effect manager and do the same for it
		const manager = GetEffectManager();
		context.subscriptions.push(manager);

		console.log(
			`${ConstructVSBloomLogPrefix('Extension', 'info')}Extension activation flow completed!`,
		);
	} catch (error) {
		console.error(
			`${ConstructVSBloomLogPrefix('Extension', 'error')}Failed to start bridge server:`,
			error,
		);
		vscode.window.showWarningMessage(
			'Failed to start the bridge server. Some features may not work correctly. ' +
				'Another VSCode window may already be hosting the bridge.',
		);
	}
}

async function OnExtensionConfigChanged(
	context: vscode.ExtensionContext,
	e: vscode.ConfigurationChangeEvent,
) {
	if (!e.affectsConfiguration('vsbloom')) {
		return; //this config change doesn't affect us
	}

	statusBarIconManager?.ExtensionConfigurationUpdated(e);

	if (e.affectsConfiguration('vsbloom.extensionConfigurationsNote.README')) {
		// If&when the user checks the 'readme' config, we'll attempt to redirect them to the menu
		// (and uncheck the config box accordingly)
		const config = vscode.workspace.getConfiguration();
		if (config.get<boolean>('vsbloom.extensionConfigurationsNote.README')) {
			// Just checked the readme config

			AttemptOpenMenu(context, 'Extension Settings');

			// Un-check the readme config by un-setting the config value
			// We'll try and handle odd cases as well here such as the user
			// manually editing it in a workspace .settings.json file etc.
			const readmeCfgData = config.inspect('vsbloom.extensionConfigurationsNote.README');
			if (readmeCfgData) {
				if (readmeCfgData.globalValue) {
					try {
						await config.update(
							'vsbloom.extensionConfigurationsNote.README',
							undefined,
							vscode.ConfigurationTarget.Global,
						);
					} catch {}
				}
				if (readmeCfgData.workspaceValue) {
					try {
						await config.update(
							'vsbloom.extensionConfigurationsNote.README',
							undefined,
							vscode.ConfigurationTarget.Workspace,
						);
					} catch {}
				}
				if (readmeCfgData.workspaceFolderValue) {
					try {
						await config.update(
							'vsbloom.extensionConfigurationsNote.README',
							undefined,
							vscode.ConfigurationTarget.WorkspaceFolder,
						);
					} catch {}
				}
			}
		}
	}
}

/**
 * VSCode's extension entry point
 */
export function activate(context: vscode.ExtensionContext) {
	console.log(
		`${ConstructVSBloomLogPrefix('Extension', 'info')}VSBloom extension activated by VSCode`,
	);
	ClientPatcher.GetMainApplicationProductFile(vscode)
		.then(async (appProductFilePath) => {
			console.log(
				`${ConstructVSBloomLogPrefix('Extension', 'info')}Successfully located the application's 'product.json' file`,
			);

			// First up, register our basic commands
			// Returns true if the client was just patched and the window needs to be reloaded
			const enableCmdDisp = vscode.commands.registerCommand(
				'vsbloom.enable',
				async (showReloadPromptOnSuccess: boolean = true) => {
					const clientPatchingStatus = await EnsureClientIsPatched(
						context,
						appProductFilePath,
					);
					if (clientPatchingStatus === ClientPatchingStatus.PATCHED) {
						vscode.window.showInformationMessage('The extension is already enabled!');
						return false;
					} else if (clientPatchingStatus === ClientPatchingStatus.FAILED) {
						vscode.window.showErrorMessage(
							"Something went wrong patching the Electron Client while attempting to enable VSBloom, please try again: If this error persists, you may need to manually specify a path to the application's 'product.json' file in VSBloom's extension's settings.",
						);
						return false;
					} else if (clientPatchingStatus === ClientPatchingStatus.NEEDS_RESTART) {
						//update last known client patch version in extension state
						context.globalState.update(
							'vsbloom.patcher.lastKnownClientPatchVersion',
							VersionTracking.GetCurrentExtensionVersion(),
						);

						vscode.window.showInformationMessage(
							'Successfully patched the Electron Client!',
						);
						if (showReloadPromptOnSuccess) {
							const reloadChoice = await vscode.window.showInformationMessage(
								'The application window needs to be reloaded for the extension to begin working, would you like to do so now?',
								'Reload Window',
							);
							if (reloadChoice !== undefined) {
								vscode.commands.executeCommand('workbench.action.reloadWindow');
								return true;
							}
						}
						return true;
					}
				},
			);
			context.subscriptions.push(enableCmdDisp);

			// Returns true if the client was just un-patched and the window needs to be reloaded
			const disableCmdDisp = vscode.commands.registerCommand(
				'vsbloom.disable',
				async (showReloadPromptOnSuccess: boolean = true) => {
					const clientUnPatchStatus = await EnsureClientIsUnpatched(appProductFilePath);

					if (clientUnPatchStatus === ClientPatchingStatus.NEEDS_RESTART) {
						vscode.window.showInformationMessage(
							'Successfully disabled VSBloom and un-patched the Electron Client.',
						);
						if (showReloadPromptOnSuccess) {
							const reloadChoice = await vscode.window.showInformationMessage(
								"You'll need to reload the window for these changes to take effect, would you like to do so now?",
								'Reload Window',
							);
							if (reloadChoice !== undefined) {
								vscode.commands.executeCommand('workbench.action.reloadWindow');
								return true;
							}
						}
						return true;
					} else if (clientUnPatchStatus === ClientPatchingStatus.FAILED) {
						vscode.window.showErrorMessage(
							"Something went wrong un-patching the Electron Client while attempting to disable VSBloom, please try again: If this error persists, you may need to manually specify a path to the application's 'product.json' file in VSBloom's extension's settings.",
						);
						return false;
					} else if (clientUnPatchStatus === ClientPatchingStatus.UNPATCHED) {
						vscode.window.showInformationMessage('The extension is already disabled!');
						return false;
					}
				},
			);
			context.subscriptions.push(disableCmdDisp);

			const retryPatchCmdDisp = vscode.commands.registerCommand(
				'vsbloom.retryPatch',
				async () => {
					vscode.window.withProgress(
						{
							location: vscode.ProgressLocation.Notification,
							title: 'Re-Patching the Electron Client...',
							cancellable: false,
						},
						(progress) => {
							return new Promise<void>((resolve, reject) => {
								progress.report({ increment: 0 });

								const getCurrentlyPatchedPromise =
									ClientPatcher.IsClientPatched(appProductFilePath);

								getCurrentlyPatchedPromise
									.then(async (isPatched) => {
										if (isPatched) {
											progress.report({
												increment: 33,
												message: 'Un-Patching the Electron Client...',
											});
											await vscode.commands.executeCommand(
												'vsbloom.disable',
												false,
											);
										}

										progress.report({
											increment: 65,
											message: 'Patching the Electron Client...',
										});

										await vscode.commands.executeCommand(
											'vsbloom.enable',
											false,
										);

										progress.report({
											increment: 100,
											message: 'Re-Patching of the Electron Client Complete!',
										});
										setTimeout(() => {
											vscode.window
												.showInformationMessage(
													'The application window needs to be reloaded for the latest Electron Client patch to take effect, would you like to do so now?',
													'Reload Window',
												)
												.then((reloadChoice) => {
													if (reloadChoice !== undefined) {
														vscode.commands.executeCommand(
															'workbench.action.reloadWindow',
														);
														return;
													}
												});

											resolve();
										}, 500);
									})
									.catch((err) => {
										reject(
											new Error(
												Common.RaiseError(
													`VSBloom's client re-patching process encountered an error: ${err.message}`,
												),
											),
										);
									});
							});
						},
					);
				},
			);
			context.subscriptions.push(retryPatchCmdDisp);

			//hookup the reload effects command now that we have a reference to the effect manager
			//TODO: look for a way to invoke this command from a different window if
			//TODO: the user invokes the command from a different window than the
			//TODO: one that hosts the effect manager
			const reloadEffectsCmdDisp = vscode.commands.registerCommand(
				'vsbloom.reloadEffects',
				async () => {
					if (!effectManager) {
						vscode.window.showErrorMessage(
							'Could not find the effect manager, try running this command on the window that has the Effect Manager channel open in the Output panel!',
						);
						return;
					}
					await effectManager.ReloadAllEffects();
					vscode.window.showInformationMessage(
						`Reloaded ${effectManager.GetLoadedEffects().length} effect(s)!`,
					);
				},
			);
			context.subscriptions.push(reloadEffectsCmdDisp);

			//hookup the command to open the webview for vsbloom
			const openWebViewCmdDisp = vscode.commands.registerCommand(
				'vsbloom.openMenu',
				async () => {
					await AttemptOpenMenu(context);
				},
			);
			context.subscriptions.push(openWebViewCmdDisp);

			const openSettingsEditorCmdDisp = vscode.commands.registerCommand(
				'vsbloom.openExtensionSettingsEditor',
				async () => {
					await AttemptOpenMenu(context, 'Extension Settings');
				},
			);
			context.subscriptions.push(openSettingsEditorCmdDisp);

			// Hookup an event listener for extension config changes
			// We also do this in a few other places, but this is a 'top level'
			// listener for actual extension reactivity vs. other areas for things like client replication
			const extensionCfgChangedDisp = vscode.workspace.onDidChangeConfiguration(
				(e: vscode.ConfigurationChangeEvent) => {
					OnExtensionConfigChanged(context, e);
				},
			);
			context.subscriptions.push(extensionCfgChangedDisp);

			// Initialize the status bar icon manager
			statusBarIconManager = new StatusBarIconManager();
			context.subscriptions.push(statusBarIconManager);

			//ensure that we're working with a patched client
			//before we continue with the rest of the extension
			//logic and initialization
			const wasClientAlreadyPatchedDuringExtensionActivation =
				await ClientPatcher.IsClientPatched(appProductFilePath);
			if (!wasClientAlreadyPatchedDuringExtensionActivation) {
				console.log(
					`${ConstructVSBloomLogPrefix('Extension', 'warn')}Client is not currently patched`,
				);

				const doNotAskToPatchClient =
					context.globalState.get<boolean>('vsbloom.patcher.doNotAskToPatchClient') ??
					false;
				if (doNotAskToPatchClient) {
					console.log(
						`${ConstructVSBloomLogPrefix('Extension', 'warn')}User indicated previously not to display the client patch prompt; going dormant`,
					);
					//the user previously said that they don't want us prompting them
					//to patch the client again in the future at some point, so we'll
					//assume they're going to patch it when they want and just go dormant
					return;
				}

				console.log(
					`${ConstructVSBloomLogPrefix('Extension', 'info')}Displaying client patch prompt, waiting for user response`,
				);

				const shouldPatchClient = await ShowClientPatchRequestPrompt(context);
				if (shouldPatchClient) {
					console.log(
						`${ConstructVSBloomLogPrefix('Extension', 'info')}User agreed to client patching`,
					);
					await vscode.commands.executeCommand('vsbloom.enable', true);
				} else {
					console.log(
						`${ConstructVSBloomLogPrefix('Extension', 'warn')}User declined client patching; going dormant`,
					);
					vscode.window.showInformationMessage(
						"Not patching the Electron Client, VSBloom will not be able to function until this patch is performed - you can trigger this patch at any time in the future to enable VSBloom by running the 'VSBloom: Enable and Patch Electron Client' command!",
					);
					return;
				}
			}

			//If the client was already patched, let's get chugging along!
			if (wasClientAlreadyPatchedDuringExtensionActivation) {
				console.log(
					`${ConstructVSBloomLogPrefix('Extension', 'info')}Client is currently patched; continuing with extension activation`,
				);

				await ExtensionActivatedAndClientPatchingVerified(context);
			}
		})
		.catch((err) => {
			throw new Error(
				Common.RaiseError(
					`VSBloom failed to find the application's 'product.json' file, you may need to manually specify an appropriate file path in VS Code's installation directory for this file -- Error: ${err.message}`,
				),
			);
		});
}

export function deactivate() {
	//cleanup is handled by the subscriptions system via Disposable interface
	//The bridge and effect manager are added to context.subscriptions
	//and will be disposed automatically

	//clear global references
	server = null;
	effectManager = null;
}

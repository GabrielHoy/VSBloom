/**
 * VSBloom Command Utilities
 *
 * Provides the implementation for every command that VSBloom registers
 * as well as utilities regarding them and safeguards against human error
 * during development.
 */

import * as vscode from 'vscode';
import { EffectManager } from '../Effects/EffectManager';
import {
	ConnectAsPseudoServer,
	VSBloomPseudoServer,
} from '../ExtensionBridge/BridgeServer/PseudoServer';
import { VSBloomBridgeServer } from '../ExtensionBridge/BridgeServer/Server';
import { VSBloomNativeRuntimeManager } from '../Native/NativeRuntimeManager';
import * as ClientPatcher from '../Patcher/ClientPatcher';
import * as Common from '../Patcher/Common';
import {
	ClientPatchingStatus,
	EnsureClientIsPatched,
	EnsureClientIsUnpatched,
} from '../Patcher/PatcherFrontend';
import { GetExtensionPackageJSON, IsDevelopmentEnvironment } from './ExtensionReflection';
import { MainOutputChannel } from './MainOutputChannel';
import * as VersionTracking from './VersionTracking';
import { MenuPanel } from './WebviewMenuPanel';

export async function RegisterVSBloomCommands(
	context: vscode.ExtensionContext,
	appProductFilePath: string,
): Promise<void> {
	const commandListToDefine = new Set<string>();
    for (const cmd of GetExtensionPackageJSON().contributes.commands) {
        commandListToDefine.add(cmd.command);
    }

	function DefineCommand<CMD_RET, CMD_ARGS, CMD_THIS>(
		cmdKey: string,
		cmdHandler: (...args: CMD_ARGS extends unknown[] ? CMD_ARGS : never) => Promise<CMD_RET>,
		thisArg?: CMD_THIS,
	): void {
		const didCmdExistInListToDefine = commandListToDefine.delete(cmdKey);
        if (!didCmdExistInListToDefine) {
            MainOutputChannel.Log(
                'error',
                `Command ${cmdKey} is not defined in the extension's package.json, but an attempt to define it was made.`,
            );
            throw new Error(`Command ${cmdKey} is not defined in the extension's package.json, but an attempt to define it was made.`);
        }
        
        const registeredCommandDisposable = vscode.commands.registerCommand(
			cmdKey,
			cmdHandler,
			thisArg,
		);
		context.subscriptions.push(registeredCommandDisposable);
	}

	// Returns true if the client was just patched and the window needs to be reloaded
	DefineCommand('vsbloom.enable', async (showReloadPromptOnSuccess: boolean = true) => {
		const clientPatchingResult = await EnsureClientIsPatched(context, appProductFilePath);
		if (clientPatchingResult.status === ClientPatchingStatus.PATCHED) {
			vscode.window.showInformationMessage('The extension is already enabled!');
			return false;
		} else if (clientPatchingResult.status === ClientPatchingStatus.FAILED) {
			vscode.window.showErrorMessage(
				"Something went wrong patching the Electron Client while attempting to enable VSBloom, please try again: If this error persists, you may need to manually specify a path to the application's 'product.json' file in VSBloom's extension's settings.",
			);
			return false;
		} else if (clientPatchingResult.status === ClientPatchingStatus.NEEDS_RESTART) {
			//update the current patch bridge port in extension state
			context.globalState.update(
				'vsbloom.electronBridge.currentClientBridgePort',
				clientPatchingResult.bridgePort,
			);
			//update last known client patch version in extension state
			context.globalState.update(
				'vsbloom.patcher.lastKnownClientPatchVersion',
				VersionTracking.GetCurrentExtensionVersion(),
			);

			vscode.window.showInformationMessage('Successfully patched the Electron Client!');
			if (showReloadPromptOnSuccess) {
				const reloadChoice = await vscode.window.showInformationMessage(
					'The application window needs to be reloaded for the extension to begin working, would you like to do so now?',
					'Reload Window',
					'Later',
				);
				if (reloadChoice === 'Reload Window') {
					vscode.commands.executeCommand('workbench.action.reloadWindow');
					return true;
				}
			}
			return true;
		}
	});

	// Returns true if the client was just un-patched and the window needs to be reloaded
	DefineCommand('vsbloom.disable', async (showReloadPromptOnSuccess: boolean = true) => {
		const clientUnPatchStatus = await EnsureClientIsUnpatched(appProductFilePath);

		if (clientUnPatchStatus === ClientPatchingStatus.NEEDS_RESTART) {
			vscode.window.showInformationMessage(
				'Successfully disabled VSBloom and un-patched the Electron Client.',
			);
			if (showReloadPromptOnSuccess) {
				const reloadChoice = await vscode.window.showInformationMessage(
					"You'll need to reload the window for these changes to take effect, would you like to do so now?",
					'Reload Window',
					'Later',
				);
				if (reloadChoice === 'Reload Window') {
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
	});

	DefineCommand('vsbloom.retryPatch', async () => {
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
								await vscode.commands.executeCommand('vsbloom.disable', false);
							}

							progress.report({
								increment: 65,
								message: 'Patching the Electron Client...',
							});

							await vscode.commands.executeCommand('vsbloom.enable', false);

							progress.report({
								increment: 100,
								message: 'Re-Patching of the Electron Client Complete!',
							});
							setTimeout(() => {
								vscode.window
									.showInformationMessage(
										'The application window needs to be reloaded for the latest Electron Client patch to take effect, would you like to do so now?',
										'Reload Window',
										'Later',
									)
									.then((reloadChoice) => {
										if (reloadChoice === 'Reload Window') {
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
	});

	DefineCommand('vsbloom.reloadEffects', async () => {
		if (VSBloomBridgeServer.isServerListening) {
			const effectManager = EffectManager.GetInstance();
			await effectManager.ReloadAllEffects();
			vscode.window.showInformationMessage(
				`Reloaded ${effectManager.GetLoadedEffects().length} effect(s)!`,
			);
		} else {
			// Secondary window, marshal the command to the main bridge server
			const pseudo = VSBloomPseudoServer.GetInstanceIfExists();
			if (pseudo?.IsRunning()) {
				pseudo.SendMarshalledCommand('reload-all-effects', null);
				vscode.window.showInformationMessage(
					'Attempting to marshal reload request for all effects to the Electron Client...',
				);
			} else {
				vscode.window.showErrorMessage(
					"Failed to reload effects: We couldn't establish a connection to the VSBloom Bridge Server.",
				);
			}
		}
	});

	DefineCommand('vsbloom.openMenu', async (pageNameOpenTo?: string) => {
		return MenuPanel.ShowPanel(context, pageNameOpenTo);
	});

	DefineCommand('vsbloom.openExtensionSettingsEditor', async () => {
		return MenuPanel.ShowPanel(context, 'Extension Settings');
	});

	DefineCommand('vsbloom.restartNativeRuntime', async () => {
		if (!(await VSBloomNativeRuntimeManager.IsNativeRuntimeSupported())) {
			vscode.window.showErrorMessage(
				'The native runtime is not supported on this platform, it cannot be restarted.',
			);
			return;
		}

		const nativeRuntime = VSBloomNativeRuntimeManager.GetInstance();
		const isNRActiveForRestart = VSBloomNativeRuntimeManager.IsNativeRuntimeActiveAnywhereOnSystem();
		if (!isNRActiveForRestart) {
			vscode.window.showWarningMessage(
				'The native runtime is not currently running, starting it instead of restarting.',
			);
			await vscode.commands.executeCommand('vsbloom.startNativeRuntime');
			return;
		}

		if (VSBloomBridgeServer.isServerListening) {
			const isNRNowActive = await nativeRuntime.RestartNativeRuntime();

			if (isNRNowActive) {
				vscode.window.showInformationMessage('Native runtime restarted.');
			} else {
				vscode.window.showErrorMessage('Failed to restart the native runtime.');
			}
		} else {
			const pseudo = VSBloomPseudoServer.GetInstanceIfExists();
			if (pseudo?.IsRunning()) {
				pseudo.SendMarshalledCommand('set-native-runtime-active', {
					shouldBeActive: true,
					shouldRestart: true,
				});

                vscode.window.showInformationMessage('Sending request to restart the native runtime...');
			} else {
				vscode.window.showErrorMessage(
					"Failed to restart the native runtime: We couldn't establish a connection to the VSBloom Bridge Server.",
				);
			}
		}
	});

	DefineCommand('vsbloom.startNativeRuntime', async () => {
		if (!(await VSBloomNativeRuntimeManager.IsNativeRuntimeSupported())) {
			vscode.window.showErrorMessage(
				'The native runtime is not supported on this platform, it cannot be restarted.',
			);
			return;
		}

		const nativeRuntime = VSBloomNativeRuntimeManager.GetInstance();
		const isNRActiveForStart = VSBloomNativeRuntimeManager.IsNativeRuntimeActiveAnywhereOnSystem();
		if (isNRActiveForStart) {
			vscode.window.showErrorMessage(
				'The native runtime is already active, it cannot be started twice.',
			);
			return;
		}

		if (VSBloomBridgeServer.isServerListening) {
			const isNRNowActive = await nativeRuntime.StartNativeRuntime();

			if (isNRNowActive) {
				vscode.window.showInformationMessage('Native runtime started.');
			} else {
				vscode.window.showErrorMessage('Failed to start the native runtime.');
			}
		} else {
			// Secondary window, marshal the command to the main bridge server
			const pseudo = VSBloomPseudoServer.GetInstanceIfExists();
			if (pseudo?.IsRunning()) {
				pseudo.SendMarshalledCommand('set-native-runtime-active', {
					shouldBeActive: true,
					shouldRestart: false,
				});

                vscode.window.showInformationMessage('Sending request to start the native runtime...');
			} else {
				vscode.window.showErrorMessage(
					"Failed to start the native runtime: We couldn't establish a connection to the VSBloom Bridge Server.",
				);
			}
		}
	});

	DefineCommand('vsbloom.stopNativeRuntime', async () => {
		if (!(await VSBloomNativeRuntimeManager.IsNativeRuntimeSupported())) {
			vscode.window.showErrorMessage(
				'The native runtime is not supported on this platform, it cannot be restarted.',
			);
			return;
		}

		const nativeRuntime = VSBloomNativeRuntimeManager.GetInstance();
		const isNRActiveForStop = VSBloomNativeRuntimeManager.IsNativeRuntimeActiveAnywhereOnSystem();
		if (!isNRActiveForStop) {
			vscode.window.showErrorMessage(
				'The native runtime is not currently active, there is nothing to stop.',
			);
			return;
		}

		if (VSBloomBridgeServer.isServerListening) {
			const wasNRStoppedSuccessfully = await nativeRuntime.StopNativeRuntime();
			if (wasNRStoppedSuccessfully) {
				vscode.window.showInformationMessage('Native runtime stopped.');
			} else {
				vscode.window.showErrorMessage(
					`${IsDevelopmentEnvironment() ? 'PIVOT TO INVESTIGATE: ' : ''} Something went wrong stopping the native runtime.`,
				);
			}
		} else {
			//Secondary window, marshal the command to the main bridge server
			const pseudo = VSBloomPseudoServer.GetInstanceIfExists();
			if (pseudo?.IsRunning()) {
				pseudo.SendMarshalledCommand('set-native-runtime-active', {
					shouldBeActive: false,
				});

                vscode.window.showInformationMessage("Sending request to stop the native runtime...");
			} else {
				vscode.window.showErrorMessage(
					"Failed to stop the native runtime: We couldn't establish a connection to the VSBloom Bridge Server.",
				);
			}
		}
	});

	DefineCommand('vsbloom.demoteWindowToPseudoServer', async () => {
		if (VSBloomBridgeServer.isServerListening) {
			const bridgeServer = VSBloomBridgeServer.GetInstance(context);
			await bridgeServer.Stop();
			vscode.window.showInformationMessage(
				'Extension Bridge Server stopped, window demoting to Pseudo-Server.',
			);
		} else {
			vscode.window.showErrorMessage(
				'Failed to demote window to Pseudo-Server, this window is not hosting the Extension Bridge - there is nothing to demote.',
			);
		}
	});

	DefineCommand('vsbloom.startBridgeServer', async () => {
		if (!VSBloomBridgeServer.isServerListening) {
			const bridgeServer = VSBloomBridgeServer.GetInstance(context);
			await bridgeServer.Start();

			if (VSBloomBridgeServer.isServerListening) {
				const effectManager = EffectManager.GetInstance();
				const effectManagerStarted = await effectManager.Start(bridgeServer);
				if (effectManagerStarted) {
					vscode.window.showInformationMessage(
						'Successfully started the Extension Bridge Server and Effect Manager.',
					);
				} else {
					vscode.window.showErrorMessage(
						'Failed to start the Bridge Server: The Effect Manager failed to start.',
					);
					await bridgeServer.Stop();
				}
			} else {
				MainOutputChannel.Log(
					'warn',
					'Failed to manually start the extension bridge server, another window is likely hosting it already. Attempting to connect as a pseudo-server instead.',
				);
				await ConnectAsPseudoServer(context);
				const pseudo = VSBloomPseudoServer.GetInstanceIfExists();
				if (pseudo?.IsRunning()) {
					vscode.window.showWarningMessage(
						'Successfully connected to an already-running VSBloom Bridge Server as a Pseudo-Server.',
					);
				} else {
					vscode.window.showErrorMessage(
						'Failed to connect to the VSBloom Bridge Server as either a Bridge Server or a Pseudo-Server.',
					);
				}
			}
		} else {
			vscode.window.showErrorMessage(
				'Failed to start the Bridge Server, this window is already hosting the Extension Bridge.',
			);
		}
	});

    //If we ever reach this and the commandListToDefine is not empty,
    //it means that the above `DefineCommand` functions did not end up
    //completely satisfying VSBloom's exposed command list - this is an
    //errorneous state and we should complain very loudly, a dev forgot
    //to implement something.
    if (commandListToDefine.size > 0) {
        const cmdComplaintMessage =  `The following commands were defined but not implemented:\n  - ${Array.from(commandListToDefine).join('\n  - ')}\n\nPlease implement them in the Commands.ts file before you commit any changes to GitHub.`;
        MainOutputChannel.Log(
            'error',
            cmdComplaintMessage,
        );
        vscode.window.showErrorMessage(`Hi Dev, you forgot to implement some commands - the following definitions are missing from Commands.ts: [${Array.from(commandListToDefine).join(', ')}].\n\n...If you're not a VSBloom developer, please immediately report this to a dev or in a GitHub Issue.`);
        throw new Error(cmdComplaintMessage);
    }
}

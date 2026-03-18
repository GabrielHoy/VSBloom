/**
 * VSBloom Patcher Frontend
 * 
 * The Patcher Frontend can be thought about as
 * part of the main Client Patching function
 * providers, though this frontend module is given
 * direct access to the `vscode` import whereas
 * we cannot make any assumption of its existence
 * within the ClientPatcher.ts module
 * 
 * (This is due to the fact that the ClientPatcher.ts
 * module may be running in a separate process if the
 * ElevatedClientPatcher had to be invoked to patch the
 * client)
 */
import * as path from 'node:path';
import * as vscode from 'vscode';
import * as sudo from '@vscode/sudo-prompt';
import * as Elevation from '../Patcher/Elevation';
import * as ClientPatcher from './ClientPatcher';
import * as Common from './Common';
import { VSBloomBridgeServer } from '../ExtensionBridge/Server';
import { ConstructVSBloomLogPrefix } from '../Debug/Colorful';
import { DEFAULT_BRIDGE_PORT } from '../ExtensionBridge/API';

export enum ClientPatchingStatus {
	PATCHED = 0,
	NEEDS_RESTART = 1,
	FAILED = 2,
	UNPATCHED = 3,
}

export interface ClientPatchingResult {
	status: ClientPatchingStatus;
	bridgePort?: number;
}

/**
 * Ensure that the current client is correctly patched and ready
 * to go - and patches it if it's not
 */
export async function EnsureClientIsPatched(
	context: vscode.ExtensionContext,
	appProductFilePath: string,
): Promise<ClientPatchingResult> {
	const isClientPatched = await ClientPatcher.IsClientPatched(appProductFilePath);

	if (isClientPatched) {
		return {
			status: ClientPatchingStatus.PATCHED,
		};
	}

	const config = vscode.workspace.getConfiguration();
	const suppressClientCorruptWarning =
		config.get<boolean>('vsbloom.patcher.suppressCorruptionWarning') === true;

	//get the bridge server's parameters for patching
	const currentBridge = VSBloomBridgeServer.GetInstance(context);
	const bridgePort = config.get<number>('vsbloom.electronBridge.port', DEFAULT_BRIDGE_PORT);
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

			return new Promise<ClientPatchingResult>((resolve, reject) => {
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
								resolve({ status: ClientPatchingStatus.FAILED });
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
						resolve({
							status: ClientPatchingStatus.NEEDS_RESTART,
							bridgePort: bridgePort,
						});
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
				vscode,
			);
			return {
				status: ClientPatchingStatus.NEEDS_RESTART,
				bridgePort: bridgePort,
			};
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
			vscode,
		);
		return {
			status: ClientPatchingStatus.NEEDS_RESTART,
			bridgePort: bridgePort,
		};
	}
}

/**
 * Ensure that the current client is correctly un-patched, and un-patches
 * it if it's not
 */
export async function EnsureClientIsUnpatched(appProductFilePath: string): Promise<ClientPatchingStatus> {
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
export async function ShowClientPatchRequestPrompt(context: vscode.ExtensionContext): Promise<boolean> {
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
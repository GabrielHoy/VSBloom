/**
 * VSBloom Main Extension Entry Point
 *
 * This file serves as the main entry point for the VSBloom extension.
 * It is responsible for the entirety of the Extension Host side of
 * VSBloom, including bootstrapping the extension and its commands etc.,
 * starting up and managing the VSBloom Bridge Server if it isn't running,
 * bootstrapping the Effect Manager, etc.
 *
 */
import * as vscode from 'vscode';
import { EffectManager } from '../Effects/EffectManager';
import { ConnectAsPseudoServer } from '../ExtensionBridge/BridgeServer/PseudoServer';
import {
	HandleMarshalledMessageFromPseudoServer,
	VSBloomBridgeServer,
} from '../ExtensionBridge/BridgeServer/Server';
import { VSBloomNativeRuntimeManager } from '../Native/NativeRuntimeManager';
import * as ClientPatcher from '../Patcher/ClientPatcher';
import * as Common from '../Patcher/Common';
import { ShowClientPatchRequestPrompt } from '../Patcher/PatcherFrontend';
import { DeferredResultProvider } from './API/DeferredResults';
import {
	type ExtensionAPI,
	type PatchedExtensionAPI,
	UnpatchedClientState,
	type UnpatchedExtensionAPI,
	type VSBloomExtensionExports,
} from './API/ExtensionAPI';
import { RegisterVSBloomCommands } from './Commands';
import { IsDevelopmentEnvironment } from './ExtensionReflection';
import { MainOutputChannel } from './MainOutputChannel';
import { StatusBarIconManager } from './StatusBarIconManager';
import { MenuPanel } from './WebviewMenuPanel';

/**
 * A factory function for instantiating an 'un-patched' extension API.
 *
 * If this is returned to external extensions, VSBloom should be considered
 * as newly-installed and/or otherwise un-patched.
 *
 * @param unpatchedClientState The state of the un-patched client.
 * @returns An 'un-patched' extension API.
 */
function UnpatchedExtensionAPIFactory(
	unpatchedClientState: UnpatchedClientState,
): UnpatchedExtensionAPI {
	return {
		isClientPatched: false,
		unpatchedClientState,
	};
}

/**
 * Called after the extension is activated and the current client is
 * verified to have been correctly patched and ready to go
 *
 * *For practical use this can be thought of as the 'real' extension entry point*
 *
 * This function is responsible for returning a promise which will be resolved
 * with the patched extension API, once the extension is fully activated and
 * the client is verified to have been correctly patched&ready to go
 */
async function ExtensionActivatedAndClientPatchingVerified(
	context: vscode.ExtensionContext,
): Promise<ExtensionAPI> {
	try {
		vscode.commands.executeCommand('setContext', 'vsbloom.clientPatched', true);
		vscode.commands.executeCommand(
			'setContext',
			'vsbloom.isDevEnvironment',
			IsDevelopmentEnvironment(),
		);

		//? WebSocket Bridge Initialization
		//initialize and start the WebSocket bridge
		const currentBridge = VSBloomBridgeServer.GetInstance(context);

		MainOutputChannel.Log(
			'info',
			'Attempting to fire up the extension bridge server: This is *expected* to gracefully fail if another window is already hosting it!',
		);
		await currentBridge.Start();
		//add the bridge server to the extension subscriptions for cleanup
		context.subscriptions.push(currentBridge);
		if (VSBloomBridgeServer.isServerListening) {
			MainOutputChannel.Log(
				'info',
				'Extension bridge server started; we are now taking the role of the main VSBloom Bridge Server',
			);
		} else {
			MainOutputChannel.Log(
				'warn',
				'Failed to start the extension bridge server, another window is likely hosting it already.',
			);
			await ConnectAsPseudoServer(context);
		}

		//? Effect Manager Initialization
		//initialize the effect manager and do the same for it
		const effectManager = EffectManager.GetInstance();
		context.subscriptions.push(effectManager);
		if (VSBloomBridgeServer.isServerListening) {
			await effectManager.Start(currentBridge);
			// Wire up marshalled command dispatch from pseudo-servers on this window
			context.subscriptions.push(
				currentBridge.OnPseudoServerMarshalledMessage((msg) => {
					HandleMarshalledMessageFromPseudoServer(currentBridge, msg);
				}),
			);
		}

		//? Status Bar Icon Manager Initialization
		//initialize the status bar icon manager
		const statusBarIconManager = StatusBarIconManager.GetInstance();
		context.subscriptions.push(statusBarIconManager);

		//? Native Runtime Manager Initialization
		//initialize the native runtime manager
		const nativeRuntimeManager = VSBloomNativeRuntimeManager.GetInstance();
		context.subscriptions.push(nativeRuntimeManager);

		const isNativeSupported = await VSBloomNativeRuntimeManager.IsNativeRuntimeSupported();
		vscode.commands.executeCommand(
			'setContext',
			'vsbloom.nativeRuntime.isSupported',
			isNativeSupported,
		);
		if (isNativeSupported) {
			MainOutputChannel.Log(
				'info',
				`The native runtime is supported on this platform - platform-specific functionality will be available if enabled.`,
			);
            // Trigger an update of the Native Runtime's state so that if anything
            // ended up initializing the NRT before we did above(particularly looking
            // at singletons like the bridge server), it can properly bootstrap the
            // actual runtime's binaries here etc. now that everything is properly
            // setup and initialized
            nativeRuntimeManager.UpdateNativeRuntimeEnabledState();
		} else {
			MainOutputChannel.Log(
				'warn',
				`The native runtime manager is not supported on this platform - platform-specific functionality will not be available.`,
			);
		}

		if (VSBloomBridgeServer.isServerListening) {
			// Broadcast native runtime state changes to all pseudo-servers so their
			// windows update vsbloom.nativeRuntime.isRunning and prevent double-start races
			context.subscriptions.push(
				nativeRuntimeManager.OnNativeRuntimeStateChanged((isRunning) => {
					currentBridge.BroadcastNativeRuntimeStateToPseudoServers(isRunning);
				}),
			);
			// Send current state immediately to each newly connected pseudo-server
			context.subscriptions.push(
				currentBridge.OnPseudoServerReady((_identifier) => {
					currentBridge.BroadcastNativeRuntimeStateToPseudoServers(
						nativeRuntimeManager.IsNativeRuntimeActive(),
					);
				}),
			);
		}

		//? Extension Activation Flow COMPLETE :tada:
		MainOutputChannel.Log('info', 'Extension activation flow completed!');

		return {
			isClientPatched: true,

			GetEffectManager: () => effectManager,
			GetBridgeServer: () => currentBridge,
		} as PatchedExtensionAPI;
	} catch (error) {
		MainOutputChannel.Log(
			'error',
			`Failed to fully activate the extension when patching was detected: ${error instanceof Error ? error.message : String(error)}`,
		);
		vscode.window.showWarningMessage(
			'Failed to start the bridge server. Some features may not work correctly. ',
		);

		// If we failed to bootstrap the extension's bridge server/effect manager,
		// to external extensions this should be considered as an 'un-patched' client
		// for all intents and purposes
		return UnpatchedExtensionAPIFactory(UnpatchedClientState.ACTIVATION_FAILED);
	}
}

async function OnExtensionConfigChanged(
	context: vscode.ExtensionContext,
	e: vscode.ConfigurationChangeEvent,
) {
	if (!e.affectsConfiguration('vsbloom')) {
		return; //this config change doesn't affect us
	}

	const statusBarIconManager = StatusBarIconManager.GetInstance();
	statusBarIconManager.ExtensionConfigurationUpdated(e);

    const nativeRuntimeManager = VSBloomNativeRuntimeManager.GetInstance();
    nativeRuntimeManager.ExtensionConfigurationUpdated(e);

	if (e.affectsConfiguration('vsbloom.extensionConfigurationsNote.README')) {
		// If&when the user checks the 'readme' config, we'll attempt to redirect them to the menu
		// (and uncheck the config box accordingly)
		const config = vscode.workspace.getConfiguration();
		if (config.get<boolean>('vsbloom.extensionConfigurationsNote.README')) {
			// Just checked the readme config

			MenuPanel.ShowPanel(context, 'Extension Settings');

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
export function activate(context: vscode.ExtensionContext): VSBloomExtensionExports {
    //Initialize the main output channel singleton for all of VSBloom's extension-side
    //general logging purposes
	context.subscriptions.push(MainOutputChannel.GetInstance());

	MainOutputChannel.Log('info', "VSBloom extension activated by VSCode. Let's get running!");

	// Before we enter this monolithic asynchronous function,
	// let's get an extension API provider reference that we can resolve
	// later on when we've determined whether the client is patched or not
	//
	// A consumer for this will be exposed to other extensions as a property
	// on this extension's exports object. We intentionally do not return the
	// deferred directly from `activate`, because VSCode awaits Thenable
	// return values during activation - it would be problematic if VSCode
	// awaited a DeferredResult that may only be resolved/rejected *much* later
	// down the line.
	const extensionAPIProvider = new DeferredResultProvider<ExtensionAPI>();

	ClientPatcher.GetMainApplicationProductFile(vscode)
		.then(async (appProductFilePath) => {
			MainOutputChannel.Log(
				'info',
				"Successfully located the application's 'product.json' file",
			);

			// First up, register all of VSBloom's commands;
            // this function should handle registration of every single
            // 'command' entry inside of `package.json` that is defined.
			await RegisterVSBloomCommands(context, appProductFilePath);

			// Hookup an event listener for extension config changes
			// We also do this in a few other places, but this is a 'top level'
			// listener for actual extension reactivity vs. other areas for things like client replication
			const extensionCfgChangedDisp = vscode.workspace.onDidChangeConfiguration(
				(e: vscode.ConfigurationChangeEvent) => {
					OnExtensionConfigChanged(context, e);
				},
			);
			context.subscriptions.push(extensionCfgChangedDisp);

			//ensure that we're working with a patched client
			//before we continue with the rest of the extension
			//logic and initialization
			const wasClientAlreadyPatchedDuringExtensionActivation =
				await ClientPatcher.IsClientPatched(appProductFilePath);

			if (!wasClientAlreadyPatchedDuringExtensionActivation) {
				MainOutputChannel.Log('warn', 'Client is not currently patched');

				const doNotAskToPatchClient =
					context.globalState.get<boolean>('vsbloom.patcher.doNotAskToPatchClient') ??
					false;
				if (doNotAskToPatchClient) {
					MainOutputChannel.Log(
						'warn',
						'User indicated previously not to display the client patch prompt; going dormant',
					);
					//the user previously said that they don't want us prompting them
					//to patch the client again in the future at some point, so we'll
					//assume they're going to patch it when they want and just go dormant.
					// This is still a valid "unpatched" state for API consumers.
					extensionAPIProvider.resolve(
						UnpatchedExtensionAPIFactory(UnpatchedClientState.PATCH_PROMPT_SUPPRESSED),
					);

					return;
				}

				MainOutputChannel.Log(
					'info',
					'Displaying client patch prompt, waiting for user response',
				);

				const shouldPatchClient = await ShowClientPatchRequestPrompt(context);
				if (shouldPatchClient) {
					MainOutputChannel.Log('info', 'User agreed to client patching');
					await vscode.commands.executeCommand('vsbloom.enable', true);

					// In this case we've just patched the client but it's not actually "running" yet,
					// so we'll resolve with an 'un-patched' client API to external consumers
					extensionAPIProvider.resolve(
						UnpatchedExtensionAPIFactory(UnpatchedClientState.PATCHED_RELOAD_REQUIRED),
					);
				} else {
					MainOutputChannel.Log('warn', 'User declined client patching; going dormant');
					vscode.window.showInformationMessage(
						"Not patching the Electron Client, VSBloom will not be able to function until this patch is performed - you can trigger this patch at any time in the future to enable VSBloom by running the 'VSBloom: Enable and Patch Electron Client' command!",
					);

					// In this case the user has just declined to patch the client so we'll
					// naturally resolve with an 'un-patched' client API to external consumers
					extensionAPIProvider.resolve(
						UnpatchedExtensionAPIFactory(UnpatchedClientState.PATCH_PROMPT_DECLINED),
					);
					return;
				}
			} else {
				//If the client was already patched, let's get chugging along!
				MainOutputChannel.Log(
					'info',
					'Client is currently patched; continuing with extension activation',
				);

				// This 'activated-and-patched' function is just to break us out
				// of this huge async chain and give us a clean code block to work with
				// once we've determined that the client is patched;
				// It will return a promise to us which is resolved with an
				// object that fulfills the ExtensionAPI interface, which we
				// will promptly use to resolve our provider promise and
				// drill the Extension API over to wherever it needs to go,
				// assuming other extensions want to utilize the VSBloom API
				ExtensionActivatedAndClientPatchingVerified(context)
					.then((api) => {
						extensionAPIProvider.resolve(api);
					})
					.catch((err) => {
						extensionAPIProvider.reject(err);
					});
			}
		})
		.catch((err) => {
			// If we fail to find the application's 'product.json' file, we'll
			// reject the API provider to let any consumers know that something
			// went rather wrong
			extensionAPIProvider.reject(
				new Error(
					Common.RaiseError(
						`VSBloom failed to find the application's 'product.json' file, you may need to manually specify an appropriate file path in VS Code's installation directory for this file -- Error: ${err.message}`,
					),
				),
			);
		});

	// Return a plain object so VSCode forwards it immediately as the
	// extension's public exports without awaiting the deferred API provider.
	return {
		extensionAPI: extensionAPIProvider.consumer,
	} as VSBloomExtensionExports;
}

export function deactivate() {
	//cleanup is handled by the subscriptions system via Disposable interface
	//The bridge and effect manager are added to context.subscriptions
	//and will be disposed automatically
}

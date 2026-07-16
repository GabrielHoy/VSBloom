import * as vscode from 'vscode';
import { type Disposable, Uri, ViewColumn } from 'vscode';
import { VSBloomBridgeServer } from '../ExtensionBridge/BridgeServer/Server';
import * as ClientPatcher from '../Patcher/ClientPatcher';
import type { BloomToSveltePayload, SvelteToBloomPayload } from '../Webview/WebviewNetworking';
import * as ExtensionReflection from './ExtensionReflection';
import * as VersionTracking from './VersionTracking';
import { SyncSnapshotPayload } from '../ExtensionBridge/SynchronizedState';
import { VSBloomSharedState } from '../ExtensionBridge/SharedState';
import { VSBloomPseudoServer } from '../ExtensionBridge/BridgeServer/PseudoServer';
import { MainOutputChannel } from './MainOutputChannel';

function GetWebviewURI(webview: vscode.Webview, extensionUri: Uri, pathList: string[]) {
	return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}

export function GetScriptNOnce() {
	let text = '';
	const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export class MenuPanel {
	private readonly panel: vscode.WebviewPanel;
	private disposables: Disposable[] = [];
	private readonly context: vscode.ExtensionContext;
	public static currentPanel: MenuPanel | undefined;
	public visible: boolean = false;

	private constructor(
		panel: vscode.WebviewPanel,
		uri: Uri,
		context: vscode.ExtensionContext,
		pageNameOpenTo?: string,
	) {
		this.panel = panel;
		this.context = context;
		this.panel.onDidDispose(
			() => {
				this.visible = false;
				vscode.commands.executeCommand('setContext', 'vsbloom.menuPanel.visible', false);
				this.dispose();
			},
			null,
			this.disposables,
		);
		this.panel.webview.html = this.GetWebviewContent(this.panel.webview, uri, pageNameOpenTo);
		this.panel.iconPath = Uri.joinPath(uri, 'imagery', 'logo', 'logo.png');
		this.SetWebviewMessageListener(this.panel.webview);
		this.SetupPanelChangeListeners();
	}

	public static ShowPanel(
		context: vscode.ExtensionContext,
		pageNameOpenTo?: string,
	) {
		if (MenuPanel.currentPanel) {
			MenuPanel.currentPanel.panel.reveal(ViewColumn.One);
			MenuPanel.currentPanel.visible = true;
			vscode.commands.executeCommand('setContext', 'vsbloom.menuPanel.visible', true);
			if (pageNameOpenTo) {
				MenuPanel.currentPanel.PostToSvelte({
					type: 'swap-page',
					data: {
						newPage: pageNameOpenTo,
					},
				});
			}
		} else {
			const panel = vscode.window.createWebviewPanel('vsbloom', 'VS: Bloom', ViewColumn.One, {
				enableScripts: true,
				localResourceRoots: [
					Uri.joinPath(context.extensionUri, 'build'),
					Uri.joinPath(context.extensionUri, 'imagery'),
				],
			});

			MenuPanel.currentPanel = new MenuPanel(
				panel,
				context.extensionUri,
				context,
				pageNameOpenTo,
			);
			MenuPanel.currentPanel.visible = true;
			vscode.commands.executeCommand('setContext', 'vsbloom.menuPanel.visible', true);
		}
	}

	public PostToSvelte(content: BloomToSveltePayload) {
		this.panel.webview.postMessage(content);
	}

	public dispose() {
		MenuPanel.currentPanel = undefined;
		this.ClearWebviewBinaryChannelDemand();
		this.panel.dispose();

		while (this.disposables.length) {
			const disposable = this.disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}

	public GetWebviewContent(webview: vscode.Webview, uri: Uri, initialPageName?: string) {
		const scriptUri = GetWebviewURI(webview, uri, ['build', 'Webview', 'view.js']);
		const styleUri = GetWebviewURI(webview, uri, ['build', 'Webview', 'view.css']);
		const iconUri = GetWebviewURI(webview, uri, ['imagery', 'logo', 'logo.png']);
		const nonce = GetScriptNOnce();

		/**
		 * 'boilerplate' HTML - bare minimum required to
		 * render the webview's contents and bootstrap
		 * the CSS/JS which will end up loading the svelte
		 * application in a 'secure' manner
		 */
		return `
            <!DOCTYPE html>
            <html lang="en">
                <head>
					<title>VS: Bloom Menu</title>
					<meta charset="UTF-8" />
					<meta name="viewport" content="width=device-width, initial-scale=1.0" />
					<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource};">
					<link rel="shortcut icon" href="${iconUri}">
					<link href="${styleUri}" rel="stylesheet" />
                </head>

                <body id="mount-sentinel-element" ${initialPageName ? `data-initial-page-name="${initialPageName}"` : ''} webview-imagery-uri="${GetWebviewURI(webview, uri, ['imagery'])}">
                	<script nonce="${nonce}" src="${scriptUri}"></script>
                </body>
            </html>
        `;
	}

	private SetupPanelChangeListeners() {
		vscode.workspace.onDidChangeConfiguration(
			(e) => {
				if (e.affectsConfiguration('vsbloom')) {
					this.SendSettingsListToSvelte();
				}
			},
			undefined,
			this.disposables,
		);

		this.panel.onDidChangeViewState(
			(_e) => {
				if (this.panel.visible) {
					this.visible = true;
					vscode.commands.executeCommand('setContext', 'vsbloom.menuPanel.visible', true);
				} else {
					this.visible = false;
					vscode.commands.executeCommand(
						'setContext',
						'vsbloom.menuPanel.visible',
						false,
					);
				}
			},
			undefined,
			this.disposables,
		);
	}

    private SyncSharedStateSnapshotToSvelte() {
        let payload: SyncSnapshotPayload<VSBloomSharedState>;
        if (VSBloomBridgeServer.isServerListening) {
            //We're the window with the Main Bridge Server running
            const server = VSBloomBridgeServer.GetInstance(this.context);
            payload = server.sharedState.Snapshot();
        } else {
            //We're a Pseudo-Server connected to the Main Bridge Server
            const pseudo = VSBloomPseudoServer.GetInstanceIfExists();
			if (pseudo?.IsRunning()) {
                payload = pseudo.sharedState.Snapshot();
            } else {
                MainOutputChannel.Log("warn", "Attempted to replicate a shared state snapshot to the Svelte Webview, but no Pseudo-Server is running to accomodate it.");
                return;
            }
        }

        this.PostToSvelte({
            type: 'replicate-shared-state',
            data: payload
        });
    }

    /**
     * Relays this webview's binary channel demand to whichever bridge role this
     * window is playing. On the main-server window it's recorded directly; on a
     * pseudo-server window it gets marshalled over the WebSocket.
     *
     * Note we don't gate on the pseudo-server being connected - it records demand
     * locally and re-announces on reconnect, so a webview holding a channel through
     * a bridge 'hiccup' still gets its frames back afterward.
     */
    private RouteWebviewBinaryChannelDemand(channelId: number, hasDemand: boolean) {
        if (VSBloomBridgeServer.isServerListening) {
            VSBloomBridgeServer.GetInstance(this.context).SetLocalWebviewBinaryChannelDemand(
                channelId,
                hasDemand,
            );
            return;
        }

        const pseudo = VSBloomPseudoServer.GetInstanceIfExists();
        if (pseudo) {
            pseudo.SetLocalWebviewBinaryChannelDemand(channelId, hasDemand);
        } else {
            MainOutputChannel.Log(
                'warn',
                'The Svelte Webview signalled binary channel demand, but this window is neither the Main Bridge Server nor a Pseudo-Server...demand cannot be routed anywhere.',
            );
        }
    }

    /**
     * Revoke everything this webview held. The webview is torn down wholesale on
     * dispose and never releases its own holds, so without this its demand would
     * keep a firehose running for a panel that no longer exists.
     */
    private ClearWebviewBinaryChannelDemand() {
        if (VSBloomBridgeServer.isServerListening) {
            VSBloomBridgeServer.GetInstance(this.context).ClearLocalWebviewBinaryChannelDemand();
            return;
        }
        VSBloomPseudoServer.GetInstanceIfExists()?.ClearLocalWebviewBinaryChannelDemand();
    }

	private SetWebviewMessageListener(webview: vscode.Webview) {
		webview.onDidReceiveMessage(
			(message: SvelteToBloomPayload) => {
				switch (message.type) {
					case 'send-notification':
						switch (message.data.type) {
							case 'info':
								vscode.window.showInformationMessage(message.data.message);
								break;
							case 'warning':
								vscode.window.showWarningMessage(message.data.message);
								break;
							case 'error':
								vscode.window.showErrorMessage(message.data.message);
								break;
						}
						return;
					case 'change-title':
						this.panel.title = message.data.newTitle ?? 'VS: Bloom';
						break;
					case 'webview-ready':
						this.SendMetadataUpdateToSvelte();
						this.SendSettingsListToSvelte();
						this.SyncSharedStateSnapshotToSvelte();
						break;
					case 'request-settings-sync':
						this.SendSettingsListToSvelte();
						break;
					case 'update-setting':
						this.UpdateSetting(message.data.internalSettingPath, message.data.newValue);
						break;
                    case 'request-shared-state-snapshot':
                        this.SyncSharedStateSnapshotToSvelte();
                        break;
                    case 'binary-channel-demand':
                        this.RouteWebviewBinaryChannelDemand(
                            message.data.channelId,
                            message.data.hasDemand,
                        );
                        break;
				}
			},
			undefined,
			this.disposables,
		);
	}

	private async SendMetadataUpdateToSvelte() {
		const appProductFilePath = await ClientPatcher.GetMainApplicationProductFile(vscode);
		this.PostToSvelte({
			type: 'meta-update',
			data: {
				extensionVersion: VersionTracking.GetCurrentExtensionVersion(),
				isClientPatched: await ClientPatcher.IsClientPatched(appProductFilePath),
				clientPatchVersion:
					this.context.globalState.get<string>(
						'vsbloom.patcher.lastKnownClientPatchVersion',
					) ?? 'unknown',
				isDevEnvironment: ExtensionReflection.IsDevelopmentEnvironment(),
			},
		});
	}

	private async SendSettingsListToSvelte() {
		const settings = VSBloomBridgeServer.GetCurrentExtensionConfig();
		this.PostToSvelte({
			type: 'sync-settings-list',
			data: settings,
		});
	}

	private async UpdateSetting(internalSettingPath: string, newValue: unknown) {
		if (!internalSettingPath.startsWith('vsbloom.')) {
			throw new Error(
				`Attempted to update a setting that is not a valid VS: Bloom setting path: ${internalSettingPath}`,
			);
		}

		//TODO: Add support for other configuration targets
		vscode.workspace
			.getConfiguration()
			.update(internalSettingPath, newValue, vscode.ConfigurationTarget.Global);
	}
}

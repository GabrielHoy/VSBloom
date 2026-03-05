import * as vscode from 'vscode';
import { type Disposable, Uri, ViewColumn } from 'vscode';
import type { VSBloomBridgeServer } from '../ExtensionBridge/Server';
import * as ClientPatcher from '../Patcher/ClientPatcher';
import type { BloomToSveltePayload, SvelteToBloomPayload } from '../Webview/WebviewNetworking';
import * as ExtensionReflection from './ExtensionReflection';
import * as VersionTracking from './VersionTracking';

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
	private readonly server: VSBloomBridgeServer;
	public static currentPanel: MenuPanel | undefined;
	public visible: boolean = false;

	private constructor(
		panel: vscode.WebviewPanel,
		uri: Uri,
		context: vscode.ExtensionContext,
		server: VSBloomBridgeServer,
		pageNameOpenTo?: string,
	) {
		this.panel = panel;
		this.context = context;
		this.server = server;
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
		this.panel.iconPath = Uri.joinPath(uri, 'imagery', 'logo.png');
		this.SetWebviewMessageListener(this.panel.webview);
		this.SetupPanelChangeListeners();
	}

	public static ShowPanel(
		view: string,
		name: string,
		webviewURI: Uri,
		context: vscode.ExtensionContext,
		server: VSBloomBridgeServer,
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
			const panel = vscode.window.createWebviewPanel(view, name, ViewColumn.One, {
				enableScripts: true,
				localResourceRoots: [
					Uri.joinPath(webviewURI, 'build'),
					Uri.joinPath(webviewURI, 'imagery'),
				],
			});

			MenuPanel.currentPanel = new MenuPanel(
				panel,
				webviewURI,
				context,
				server,
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
		const iconUri = GetWebviewURI(webview, uri, ['imagery', 'logo.png']);
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
						break;
					case 'request-settings-sync':
						this.SendSettingsListToSvelte();
						break;
					case 'update-setting':
						this.UpdateSetting(message.data.internalSettingPath, message.data.newValue);
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
		const settings = this.server.GetCurrentExtensionConfig();
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

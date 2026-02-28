import * as vscode from "vscode";
import type { VSBloomBridgeServer } from "../ExtensionBridge/Server";
import * as ClientPatcher from "../Patcher/ClientPatcher";
import { Uri, Disposable, ViewColumn } from "vscode";
import type { WebviewPanel, Webview } from "vscode";
import type { BloomToSveltePayload, SvelteToBloomPayload } from "./WebviewNetworking";
import * as ExtensionReflection from "../Extension/ExtensionReflection";
import * as VersionTracking from "../Extension/VersionTracking";

function GetWebviewURI(webview: Webview, extensionUri: Uri, pathList: string[]) {
	return webview.asWebviewUri(Uri.joinPath(extensionUri, ...pathList));
}

export function GetScriptNOnce() {
	let text = "";
	const possible =
		"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for (let i = 0; i < 32; i++) {
		text += possible.charAt(Math.floor(Math.random() * possible.length));
	}
	return text;
}

export class MenuPanel {
	private readonly panel: WebviewPanel;
	private disposables: Disposable[] = [];
	public static currentPanel: MenuPanel | undefined;
	private readonly context: vscode.ExtensionContext;
	private readonly server: VSBloomBridgeServer;

	private constructor(panel: WebviewPanel, uri: Uri, context: vscode.ExtensionContext, server: VSBloomBridgeServer) {
		this.panel = panel;
		this.context = context;
		this.server = server;
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
		this.panel.webview.html = this.GetWebviewContent(this.panel.webview, uri);
		this.panel.iconPath = Uri.joinPath(uri, "images", "logo.png");
		this.SetWebviewMessageListener(this.panel.webview);
		this.SetupExtensionConfigChangedListener();
	}

	public static ShowPanel(view: string, name: string, webviewURI: Uri, context: vscode.ExtensionContext, server: VSBloomBridgeServer) {
		if (MenuPanel.currentPanel) {
			MenuPanel.currentPanel.panel.reveal(ViewColumn.One);
		} else {
			const panel = vscode.window.createWebviewPanel(
				view,
				name,
				ViewColumn.One,
				{
					enableScripts: true,
					localResourceRoots: [Uri.joinPath(webviewURI, "build"), Uri.joinPath(webviewURI, "images")]
				}
			);

			MenuPanel.currentPanel = new MenuPanel(panel, webviewURI, context, server);
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

	public GetWebviewContent(webview: Webview, uri: Uri) {
		const scriptUri = GetWebviewURI(webview, uri, ["build", "Webview", "view.js"]);
		const styleUri = GetWebviewURI(webview, uri, ["build", "Webview", "view.css"]);
		const iconUri = GetWebviewURI(webview, uri, ["images", "logo.png"]);
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

                <body id="page" webview-images-uri="${GetWebviewURI(webview, uri, ["images"])}">
                	<script nonce="${nonce}" src="${scriptUri}"></script>
                </body>
            </html>
        `;
	}

	private SetupExtensionConfigChangedListener() {
		vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('vsbloom')) {
				this.SendSettingsListToSvelte();
			}
		}, undefined, this.disposables);
	}

	private SetWebviewMessageListener(webview: Webview) {
		webview.onDidReceiveMessage(
			(message: SvelteToBloomPayload) => {

				switch (message.type) {
					case "send-notification":
						switch (message.data.type) {
							case "info":
								vscode.window.showInformationMessage(message.data.message);
								break;
							case "warning":
								vscode.window.showWarningMessage(message.data.message);
								break;
							case "error":
								vscode.window.showErrorMessage(message.data.message);
								break;
						}
						return;
					case "change-title":
						this.panel.title = message.data.newTitle ?? "VS: Bloom";
						break;
					case "webview-ready":
						this.SendMetadataUpdateToSvelte();
						this.SendSettingsListToSvelte();
						break;
					case "request-settings-sync":
						this.SendSettingsListToSvelte();
						break;
					case "update-setting":
						this.UpdateSetting(message.data.internalSettingPath, message.data.newValue);
						break;
				}
			},
			undefined,
			this.disposables
		);
	}

	private async SendMetadataUpdateToSvelte() {
		const appProductFilePath = await ClientPatcher.GetMainApplicationProductFile(vscode);
		this.PostToSvelte({
			type: 'meta-update',
			data: {
				extensionVersion: VersionTracking.GetCurrentExtensionVersion(),
				isClientPatched: await ClientPatcher.IsClientPatched(appProductFilePath),
				clientPatchVersion: this.context.globalState.get<string>("vsbloom.patcher.lastKnownClientPatchVersion") ?? "unknown",
				isDevEnvironment: ExtensionReflection.IsDevelopmentEnvironment()
			}
		});
	}

	private async SendSettingsListToSvelte() {
		const settings = this.server.GetCurrentExtensionConfig();
		this.PostToSvelte({
			type: 'sync-settings-list',
			data: settings
		});
	}

	private async UpdateSetting(internalSettingPath: string, newValue: any) {
		if (!internalSettingPath.startsWith('vsbloom.')) {
			throw new Error(`Attempted to update a setting that is not a valid VS: Bloom setting path: ${internalSettingPath}`);
		}

		//TODO: Add support for other configuration targets
		vscode.workspace.getConfiguration().update(internalSettingPath, newValue, vscode.ConfigurationTarget.Global);
	}
}

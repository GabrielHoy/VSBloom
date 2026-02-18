import * as vscode from "vscode";
import { Uri, Disposable, ViewColumn } from "vscode";
import type { WebviewPanel, Webview } from "vscode";
import type { BloomToSveltePayload, SvelteToBloomPayload } from "./WebviewNetworking";

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

	private constructor(panel: WebviewPanel, uri: Uri) {
		this.panel = panel;
		this.panel.onDidDispose(() => this.dispose(), null, this.disposables);
		this.panel.webview.html = this.getWebviewContent(this.panel.webview, uri);
		this.panel.iconPath = Uri.joinPath(uri, "images", "logo.png");
		this.setWebviewMessageListener(this.panel.webview);
	}

	public static ShowPanel(view: string, name: string, webviewURI: Uri) {
		if (MenuPanel.currentPanel) {
			MenuPanel.currentPanel.panel.reveal(ViewColumn.One);
		} else {
			const panel = vscode.window.createWebviewPanel(
				view,
				name,
				ViewColumn.One,
				{
					enableScripts: true,
					localResourceRoots: [Uri.joinPath(webviewURI, "build"), Uri.joinPath(webviewURI, "images")],
				}
			);

			MenuPanel.currentPanel = new MenuPanel(panel, webviewURI);
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

	public getWebviewContent(webview: Webview, uri: Uri) {
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

	private setWebviewMessageListener(webview: Webview) {
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
					case "request-meta-update":
						vscode.window.showInformationMessage("Got meta update request");
				}
			},
			undefined,
			this.disposables
		);
	}
}

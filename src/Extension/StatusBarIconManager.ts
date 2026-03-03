import * as vscode from "vscode";

export class StatusBarIconManager {
    private readonly context: vscode.ExtensionContext;
    private statusBarItem: vscode.StatusBarItem | undefined;

    constructor(context: vscode.ExtensionContext) {
        this.context = context;

        this.UpdateStatusBarIconEnabledState();
    }

    private async CreateStatusBarIcon() {
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 1_000_000);
        this.statusBarItem.text = "$(vsbloom-simple) VS: Bloom";
        this.statusBarItem.command = "vsbloom.openMenu";
        this.statusBarItem.tooltip = "VS: Bloom Menu";
        this.statusBarItem.show();
    }

    private async UpdateStatusBarIconEnabledState() {
        const config = vscode.workspace.getConfiguration();
        const isStatusBarIconEnabled = config.get<boolean>("vsbloom.statusBarIcon.enabled");

        if (isStatusBarIconEnabled && !this.statusBarItem) {
            this.CreateStatusBarIcon();
        } else if (!isStatusBarIconEnabled && this.statusBarItem) {
            this.statusBarItem.dispose();
            this.statusBarItem = undefined;
        }
    }

    public async ExtensionConfigurationUpdated(e: vscode.ConfigurationChangeEvent) {
        if (!e.affectsConfiguration('vsbloom')) {
            return; //this config change doesn't affect us
        }

        if (e.affectsConfiguration('vsbloom.statusBarIcon.enabled')) {
            this.UpdateStatusBarIconEnabledState();
        }
    }

    dispose() {
        this.statusBarItem?.dispose();
        this.statusBarItem = undefined;
    }
}
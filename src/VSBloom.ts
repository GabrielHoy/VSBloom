import * as vscode from 'vscode';
import * as path from 'path';
import * as FileInjection from './FileInjection';

async function UpdateCustomCSSImportSettings() {
  const config = vscode.workspace.getConfiguration();

  const injectedFilePaths = FileInjection.GetInjectedFileNames().map(file => "file://" + path.join(FileInjection.injectedFileDirectory, file));
  const previousImportCfg = config.get<string[]>("vscode_custom_css.imports", []);

  const prevImportCfgIsDifferent = (
    previousImportCfg.length !== injectedFilePaths.length ||
    injectedFilePaths.some(file => !previousImportCfg.includes(file)) ||
    previousImportCfg.some(file => !injectedFilePaths.includes(file))
  );

  await config.update("vscode_custom_css.imports", injectedFilePaths, true);
  
  await vscode.workspace.saveAll();
  await vscode.commands.executeCommand("extension.updateCustomCSS");

  if (prevImportCfgIsDifferent) {
    return true;
  }
}

export function activate(context: vscode.ExtensionContext) {
  FileInjection.UpdateInjectedFiles();
  
  vscode.window.showInformationMessage("bruh");
  FileInjection.ExportCurrentExtensionSettings();

  const wasImportCfgUpToDate = UpdateCustomCSSImportSettings();

  vscode.window.showInformationMessage("WasImportCfgUpToDate: " + wasImportCfgUpToDate);

}

export function deactivate() {}

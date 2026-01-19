import * as vscode from 'vscode';
import * as FileInjection from './FileInjection';
import * as fs from 'fs';
import * as path from 'path';
import * as ClientPatcher from './ClientPatcher';

async function TriggerCustomCSSImportUpdate() {
  await vscode.workspace.saveAll();
  await vscode.commands.executeCommand("extension.updateCustomCSS");
}

//returns whether or not the CSS import configurations
//needed to be changed from what they were before the
//call to this function was made
async function UpdateCustomCSSImportSettings() {
  const config = vscode.workspace.getConfiguration();

  const injectedFilePaths: string[] = fs.readdirSync(FileInjection.injectedFileDirectory).map(filePath => "file://" + path.join(FileInjection.injectedFileDirectory, path.basename(filePath)));
  const previousImportCfg = config.get<string[]>("vscode_custom_css.imports", []);

  const prevImportCfgIsDifferent = (
    previousImportCfg.length !== injectedFilePaths.length ||
    injectedFilePaths.some(file => !previousImportCfg.includes(file)) ||
    previousImportCfg.some(file => !injectedFilePaths.includes(file))
  );
  
  if (prevImportCfgIsDifferent) {
    await config.update("vscode_custom_css.imports", injectedFilePaths, true);
    
    await TriggerCustomCSSImportUpdate();
    
    return true;
  }

  return false;
}

export function activate(context: vscode.ExtensionContext) {
  // FileInjection.UnpackDefaultInjectedFiles();
  // FileInjection.ExportCurrentExtensionSettings();

  // UpdateCustomCSSImportSettings().then(wasImportCfgOutOfDate => {
  //   vscode.window.showInformationMessage("Were Configs Out of Date: " + wasImportCfgOutOfDate);
  // });

  const onUsrCfgChangeDisposable = vscode.workspace.onDidChangeConfiguration((cfgChangeEvent: vscode.ConfigurationChangeEvent) => {
    console.log("User Configuration Changed: ", cfgChangeEvent);
  });

  context.subscriptions.push(onUsrCfgChangeDisposable);

  // const initFilePath = ClientPatcher.GetElectronInitFilePath();
  // ClientPatcher.PatchElectronHTMLFile(initFilePath);

}

export function deactivate() {}
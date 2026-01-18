import * as vscode from 'vscode';
import * as path from 'path';
import * as FileInjection from './FileInjection';

//returns whether or not the CSS import configurations
//needed to be changed from what they were before the
//call to this function was made
async function UpdateCustomCSSImportSettings() {
  const config = vscode.workspace.getConfiguration();

  const injectedFilePaths = FileInjection.GetInjectedFileNames().map(file => "file://" + path.join(FileInjection.injectedFileDirectory, file));
  const previousImportCfg = config.get<string[]>("vscode_custom_css.imports", []);

  const prevImportCfgIsDifferent = (
    previousImportCfg.length !== injectedFilePaths.length ||
    injectedFilePaths.some(file => !previousImportCfg.includes(file)) ||
    previousImportCfg.some(file => !injectedFilePaths.includes(file))
  );
  
  if (prevImportCfgIsDifferent) {
    await config.update("vscode_custom_css.imports", injectedFilePaths, true);
    
    await vscode.workspace.saveAll();
    await vscode.commands.executeCommand("extension.updateCustomCSS");
    
    return true;
  }

  return false;
}

export function activate(context: vscode.ExtensionContext) {
  FileInjection.UpdateInjectedFiles();
  
  FileInjection.ExportCurrentExtensionSettings();

  UpdateCustomCSSImportSettings().then(wasImportCfgOutOfDate => {
    vscode.window.showInformationMessage("Were Configs Out of Date: " + wasImportCfgOutOfDate);
  });

}

export function deactivate() {}
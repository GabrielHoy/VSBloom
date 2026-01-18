import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";

export const injectedFileDirectory = path.join(os.homedir(), ".vscode", "vsbloom");

export function GetInjectedFileNames() {
  const files = fs.readdirSync(path.join(__dirname, "Injected"));
  return files.map(file => path.basename(file));
}

export function UpdateInjectedFiles() {
  if (!fs.existsSync(injectedFileDirectory)) {
    fs.mkdirSync(injectedFileDirectory, {
      recursive: true
    });
  }

  const filesToInject = GetInjectedFileNames();
  for (const fileInject of filesToInject) {
    const extensionFilePath = path.join(__dirname, "Injected", fileInject);
    const injectedPath = path.join(injectedFileDirectory, fileInject); 
    fs.copyFileSync(extensionFilePath, injectedPath);
  }
};

export function ExportCurrentExtensionSettings() {
  const config = vscode.workspace.getConfiguration();

  const curVsBloomCfg = config.get("vsbloom");
  console.log("Current VSBloom Configuration: ", curVsBloomCfg);
}
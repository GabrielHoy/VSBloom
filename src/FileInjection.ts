import * as os from "os";
import * as path from "path";
import * as fs from "fs";
import * as vscode from "vscode";

export const injectedFileDirectory = path.join(os.homedir(), ".vscode", "vsbloom");

function GetDefaultInjectedFileNames() {
  const files = fs.readdirSync(path.join(__dirname, "Injected"));
  return files.map(file => path.basename(file));
}

export function UnpackDefaultInjectedFiles() {
  if (!fs.existsSync(injectedFileDirectory)) {
    fs.mkdirSync(injectedFileDirectory, {
      recursive: true
    });
  }

  const filesToInject = GetDefaultInjectedFileNames();
  for (const fileInject of filesToInject) {
    const extensionFilePath = path.join(__dirname, "Injected", fileInject);
    const injectedPath = path.join(injectedFileDirectory, fileInject); 
    fs.copyFileSync(extensionFilePath, injectedPath);
  }
};

export function ExportCurrentExtensionSettings() {
  const config = vscode.workspace.getConfiguration();

  const curVsBloomCfg = config.get("vsbloom");

  const cssVariableLines: string[] = [];

  function isPlainObject(val: any): boolean {
    return typeof val === 'object' && val !== null && !Array.isArray(val);
  }

  function ConvertToValidCSSDataType(value: string | number | boolean | Array<string | number | boolean>): string {
    switch (typeof value) {
      case 'string': {
        const escapedStr = value
          .replace(/\\/g, '\\\\')
          .replace(/"/g, '\\"');
        return `"${escapedStr}"`;
      }
      case 'number': {
        return value.toString();
      }
      case 'boolean': {
        return value.toString();
      }
      case 'object': {
        return ConvertToValidCSSDataType(JSON.stringify(value));
      }
      default: {
        return `"(Value type of ${typeof value} is not currently supported by VSBloom for export into a CSS variable)"`;
      }
    }
  }

  function walkConfig(obj: any, pathParts: string[]) {
    if (!isPlainObject(obj)) {
      return;
    }

    for (const key of Object.keys(obj)) {
      const value = obj[key];
      const nextPathParts = [...pathParts, key];

      if (isPlainObject(value)) {
        walkConfig(value, nextPathParts);
      } else {
        // Is a leaf value, produce CSS variable
        // Convert all pathParts to kebab-case
        // const kebabPath = nextPathParts.map(part => 
        //   part.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase()
        // ).join('-');
        const kebabPath = nextPathParts.join('-');
        cssVariableLines.push(`--vsbloom-${kebabPath}: ${ConvertToValidCSSDataType(value)};`);
      }
    }
  }

  if (curVsBloomCfg && typeof curVsBloomCfg === 'object') {
    walkConfig(curVsBloomCfg, []);

    const cssFileContent = `:root {\n${cssVariableLines.map(line => '  ' + line).join('\n')}\n}\n`;
    fs.writeFileSync(path.join(injectedFileDirectory, "UserSettings.css"), cssFileContent);
  }
}
import * as path from "path";
import * as vscode from "vscode";
import * as ClientPatcher from "./Patcher/ClientPatcher";
import * as Common from "./Patcher/Common";
import * as Elevation from "./Patcher/Elevation";
import * as sudo from "@vscode/sudo-prompt";
import { VSBloomBridgeServer } from "./ExtensionBridge/Server";
import { EffectManager } from "./Effects/EffectManager";
import { ConstructVSBloomLogPrefix } from "./Debug/Colorful";

enum ClientPatchingStatus {
  PATCHED = 0,
  NEEDS_RESTART = 1,
  FAILED = 2,
  UNPATCHED = 3
}

//Global references for the bridge and effect manager
let server: VSBloomBridgeServer | null = null;
let effectManager: EffectManager | null = null;

/**
 * Get(or create) the bridge server singleton
 */
function GetBridgeServer(context: vscode.ExtensionContext): VSBloomBridgeServer {
  if (!server) {
    server = new VSBloomBridgeServer(context);
  }
  return server;
}

/**
 * Get(or create) the effect manager singleton
 */
function GetEffectManager(context: vscode.ExtensionContext): EffectManager {
  if (!effectManager && server) {
    effectManager = new EffectManager(server, context);
  }
  return effectManager!;
}

/**
 * Ensure that the current client is correctly patched and ready
 * to go - and patches it if it's not
 */
async function EnsureClientIsPatched(
  context: vscode.ExtensionContext,
  appProductFilePath: string
): Promise<ClientPatchingStatus> {
  const isClientPatched = await ClientPatcher.IsClientPatched(appProductFilePath);

  if (isClientPatched) {
    return ClientPatchingStatus.PATCHED;
  }

  const config = vscode.workspace.getConfiguration();
  const suppressClientCorruptWarning = config.get<boolean>("vsbloom.patcher.suppressCorruptionWarning") === true;

  //get the bridge server's parameters for patching
  const currentBridge = GetBridgeServer(context);
  const bridgePort = currentBridge.GetServerPort();
  const authToken = currentBridge.GetAuthToken();

  //the client isn't patched, we need to patch it
  const amIElevated = await Elevation.HasElevation();
  if (!amIElevated) {
    //not a big deal as long as we can still patch app files,
    //but we'll need to elevate if the VSC installation is
    //installed system-wide instead of being user-local
    const needsElevationToPatch = await ClientPatcher.WouldClientPatchingRequireElevation(appProductFilePath);
    
    if (needsElevationToPatch) {
      //we'll have to prompt the user for elevation if we want
      //to apply the patches we need to in order for VSBloom's
      //launcher to function properly
      const elevatedPatcherScriptPath = path.join(__dirname, "ElevatedClientPatcher.js");

      return new Promise<ClientPatchingStatus>((resolve, reject) => {
        //pass all required arguments to the elevated patcher
        const args = [
          `"${elevatedPatcherScriptPath}"`,
          `"patch"`,
          `"${appProductFilePath}"`,
          `"${suppressClientCorruptWarning.toString()}"`,
          `"${bridgePort}"`,
          `"${authToken}"`
        ].join(" ");

        sudo.exec(`node ${args}`,
          {
            name: "VSBloom",
          },
          (error, stdout, stderr) => {
            if (error) {
              //error might just be that the user disallowed our elevation request
              if (error.message.includes("User did not grant permission")) {
                //fair enough
                vscode.window.showErrorMessage("VSBloom's client patcher was denied process elevation, the VSBloom extension cannot correctly function without this.");
                resolve(ClientPatchingStatus.FAILED);
                return;
              } else {
                reject(new Error(Common.RaiseError(`Elevation handoff encountered an error: ${error.message}`)));
                return;
              }
            }

            console.log(`${ConstructVSBloomLogPrefix("Extension", "debug")}Elevated Client Patch - stdout:`, stdout);
            console.log(`${ConstructVSBloomLogPrefix("Extension", "debug")}Elevated Client Patch - stderr:`, stderr);

            //if there's no error from the elevated script's process,
            //we can assume that the patching was successful
            resolve(ClientPatchingStatus.NEEDS_RESTART);
            return;
          }
        );
      });

    } else {
      //we don't need elevation to patch the client,
      //so we can do so without further ado
      await ClientPatcher.PerformClientPatching(
        appProductFilePath,
        suppressClientCorruptWarning,
        bridgePort,
        authToken
      );
      return ClientPatchingStatus.NEEDS_RESTART;
    }
  } else {
    //if we're already elevated as is, we can
    //still perform our patching even with VSC
    //being installed system-wide
    await ClientPatcher.PerformClientPatching(
      appProductFilePath,
      suppressClientCorruptWarning,
      bridgePort,
      authToken
    );
    return ClientPatchingStatus.NEEDS_RESTART;
  }
}

async function EnsureClientIsUnpatched(appProductFilePath: string): Promise<ClientPatchingStatus> {
  const isClientPatched = await ClientPatcher.IsClientPatched(appProductFilePath);

  if (!isClientPatched) {
    return ClientPatchingStatus.UNPATCHED;
  }

  //client is patched, we need to unpatch it
  const amIElevated = await Elevation.HasElevation();
  if (!amIElevated) {
    //not a big deal as long as we can still modify app files,
    //but we'll need to elevate if the VSC installation is
    //installed system-wide instead of being user-local
    const needsElevationToUnPatch = await ClientPatcher.WouldClientPatchingRequireElevation(appProductFilePath);
    
    if (needsElevationToUnPatch) {
      //we'll have to prompt the user for elevation if we want
      //to remove the patches we applied to the client
      const elevatedPatcherScriptPath = path.join(__dirname, "ElevatedClientPatcher.js");

      return new Promise<ClientPatchingStatus>((resolve, reject) => {
        sudo.exec(`node "${elevatedPatcherScriptPath}" "unpatch" "${appProductFilePath}"`,
          {
            name: "VSBloom",
          },
          (error, stdout, stderr) => {
            if (error) {
              //error might just be that the user disallowed our elevation request
              if (error.message.includes("User did not grant permission")) {
                vscode.window.showErrorMessage("VSBloom was denied process elevation while trying to remove client patches, the extension cannot undo its changes to the client without this.");
                resolve(ClientPatchingStatus.FAILED);
                return;
              } else {
                reject(new Error(Common.RaiseError(`Elevation handoff encountered an error: ${error.message}`)));
                return;
              }
            }

            console.log(`${ConstructVSBloomLogPrefix("Extension", "debug")}Elevated Client Unpatch - stdout:`, stdout);
            console.log(`${ConstructVSBloomLogPrefix("Extension", "debug")}Elevated Client Unpatch - stderr:`, stderr);

            //if there's no error from the elevated script's process,
            //we can assume that the unpatching was successful
            resolve(ClientPatchingStatus.NEEDS_RESTART);
            return;
          }
        );
      });

    } else {
      //we don't need elevation to unpatch the client,
      //so we can do so without further ado
      await ClientPatcher.UnpatchClient(appProductFilePath);
      return ClientPatchingStatus.NEEDS_RESTART;
    }
  } else {
    //if we're already elevated as is, we can
    //still unpatch the client even with VSCode
    //being installed system-wide
    await ClientPatcher.UnpatchClient(appProductFilePath);
    return ClientPatchingStatus.NEEDS_RESTART;
  }
}

/**
 * Show a prompt to the user asking if they're OK with
 * patching the client, then return their response
 */
async function ShowClientPatchRequestPrompt(context: vscode.ExtensionContext): Promise<boolean> {
  const userChoice = await vscode.window.showInformationMessage(
    "[VSBloom]: In order for VSBloom to function properly, we need to apply a patch to the Electron Client to make many of the extension's features possible. Are you OK with this?",
    "Yes",
    "No",
    "Don't Show Again"
  );

  if (userChoice === "Yes") {
    return true;
  } else if (userChoice === "Don't Show Again") {
    context.globalState.update("vsbloom.patcher.doNotAskToPatchClient", true);
  }

  return false;
}

/**
 * Called after the extension is activated and the current client is
 * verified to have been correctly patched and ready to go
 * 
 * *For practical use this can be thought of as the 'real' extension entry point*
 */
async function ExtensionActivatedAndClientPatchingVerified(context: vscode.ExtensionContext) {
  try {
    //initialize and start the WebSocket bridge
    const currentBridge = GetBridgeServer(context);

    console.log(`${ConstructVSBloomLogPrefix("Extension", "info")}Attempting to fire up the extension bridge server`);
    await currentBridge.Start();
    //add the bridge server to the extension subscriptions for cleanup
    context.subscriptions.push(currentBridge);
    console.log(`${ConstructVSBloomLogPrefix("Extension", "info")}Extension bridge server started; we are now taking the role of the VSBloom master server`);

    //initialize the effect manager and do the same for it
    const manager = GetEffectManager(context);
    context.subscriptions.push(manager);

    console.log(`${ConstructVSBloomLogPrefix("Extension", "info")}Extension activation flow completed!`);
  } catch (error) {
    console.error(`${ConstructVSBloomLogPrefix("Extension", "error")}Failed to start bridge server:`, error);
    vscode.window.showWarningMessage(
      "[VSBloom]: Failed to start the bridge server. Some features may not work correctly. " +
      "Another VSCode window may already be hosting the bridge."
    );
  }
}

/**
 * VSCode's extension entry point
 */
export function activate(context: vscode.ExtensionContext) {
  console.log(`${ConstructVSBloomLogPrefix("Extension", "info")}VSBloom extension activated by VSCode`);
  ClientPatcher.GetMainApplicationProductFile(vscode).then(async appProductFilePath => {
    console.log(`${ConstructVSBloomLogPrefix("Extension", "info")}Successfully located the application's 'product.json' file`);

    // First up, register our basic commands
    // Returns true if the client was just patched and the window needs to be reloaded
    const enableCmdDisp = vscode.commands.registerCommand("vsbloom.enable", async (showReloadPromptOnSuccess: boolean = true) => {
      const clientPatchingStatus = await EnsureClientIsPatched(context, appProductFilePath);
      if (clientPatchingStatus === ClientPatchingStatus.PATCHED) {
        vscode.window.showInformationMessage("[VSBloom]: The extension is already enabled!");
        return false;
      } else if (clientPatchingStatus === ClientPatchingStatus.FAILED) {
        vscode.window.showErrorMessage("[VSBloom]: Something went wrong patching the Electron Client while attempting to enable VSBloom, please try again: If this error persists, you may need to manually specify a path to the application's 'product.json' file in VSBloom's extension's settings.");
        return false;
      } else if (clientPatchingStatus === ClientPatchingStatus.NEEDS_RESTART) {
        vscode.window.showInformationMessage("[VSBloom]: Successfully patched the Electron Client!");
        if (showReloadPromptOnSuccess) {
          const reloadChoice = await vscode.window.showInformationMessage("[VSBloom]: The application window needs to be reloaded for the extension to begin working, would you like to do so now?", "Reload Window");
          if (reloadChoice !== undefined) {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
            return true;
          }
        }
        return true;
      }
    });
    context.subscriptions.push(enableCmdDisp);

    // Returns true if the client was just unpatched and the window needs to be reloaded
    const disableCmdDisp = vscode.commands.registerCommand("vsbloom.disable", async (showReloadPromptOnSuccess: boolean = true) => {
      const clientUnpatchStatus = await EnsureClientIsUnpatched(appProductFilePath);

      if (clientUnpatchStatus === ClientPatchingStatus.NEEDS_RESTART) {
        vscode.window.showInformationMessage("[VSBloom]: Successfully disabled VSBloom and un-patched the Electron Client.");
        if (showReloadPromptOnSuccess) {
          const reloadChoice = await vscode.window.showInformationMessage("[VSBloom]: You'll need to reload the window for these changes to take effect, would you like to do so now?", "Reload Window");
          if (reloadChoice !== undefined) {
            vscode.commands.executeCommand("workbench.action.reloadWindow");
            return true;
          }
        }
        return true;
      } else if (clientUnpatchStatus === ClientPatchingStatus.FAILED) {
        vscode.window.showErrorMessage("[VSBloom]: Something went wrong un-patching the Electron Client while attempting to disable VSBloom, please try again: If this error persists, you may need to manually specify a path to the application's 'product.json' file in VSBloom's extension's settings.");
        return false;
      } else if (clientUnpatchStatus === ClientPatchingStatus.UNPATCHED) {
        vscode.window.showInformationMessage("[VSBloom]: The extension is already disabled!");
        return false;
      }
    });
    context.subscriptions.push(disableCmdDisp);

    const retryPatchCmdDisp = vscode.commands.registerCommand("vsbloom.retryPatch", async () => {
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "[VSBloom]: Re-Patching the Electron Client...",
        cancellable: false
      }, (progress) => {
        return new Promise<void>((resolve, reject) => {
          progress.report({ increment: 0 });

          const getCurrentlyPatchedPromise = ClientPatcher.IsClientPatched(appProductFilePath);

          getCurrentlyPatchedPromise.then(async isPatched => {
            if (isPatched) {
              progress.report({ increment: 33, message: "[VSBloom]: Un-Patching the Electron Client..." });
              await vscode.commands.executeCommand("vsbloom.disable", false);
            }

            progress.report({ increment: 65, message: "[VSBloom]: Patching the Electron Client..." });

            await vscode.commands.executeCommand("vsbloom.enable", false);

            progress.report({ increment: 100, message: "[VSBloom]: Re-Patching of the Electron Client Complete!" });
            setTimeout(() => {
              vscode.window.showInformationMessage("[VSBloom]: The application window needs to be reloaded for the latest Electron Client patch to take effect, would you like to do so now?", "Reload Window").then(reloadChoice => {
                if (reloadChoice !== undefined) {
                  vscode.commands.executeCommand("workbench.action.reloadWindow");
                  return;
                }
              });

              resolve();
            }, 500);
          }).catch(err => {
            reject(new Error(Common.RaiseError(`VSBloom's client re-patching process encountered an error: ${err.message}`)));
          });
        });
      });
    });
    context.subscriptions.push(retryPatchCmdDisp);

    //hookup the reload effects command now that we have a reference to the effect manager
    //TODO: look for a way to invoke this command from a different window if
    //TODO: the user invokes the command from a different window than the
    //TODO: one that hosts the effect manager
    const reloadEffectsCmdDisp = vscode.commands.registerCommand("vsbloom.reloadEffects", async () => {
      if (!effectManager) {
        vscode.window.showErrorMessage("[VSBloom]: Could not find the effect manager, try running this command on the window that has the Effect Manager channel open in the Output panel!");
        return;
      }
      await effectManager.ReloadAllEffects();
      vscode.window.showInformationMessage(`[VSBloom]: Reloaded ${effectManager.GetLoadedEffects().length} effect(s)!`);
    });
    context.subscriptions.push(reloadEffectsCmdDisp);


    //ensure that we're working with a patched client
    //before we continue with the rest of the extension
    //logic and initialization
    const wasClientAlreadyPatchedDuringExtensionActivation = await ClientPatcher.IsClientPatched(appProductFilePath);
    if (!wasClientAlreadyPatchedDuringExtensionActivation) {
      console.log(`${ConstructVSBloomLogPrefix("Extension", "warn")}Client is not currently patched`);

      const doNotAskToPatchClient = context.globalState.get<boolean>("vsbloom.patcher.doNotAskToPatchClient") ?? false;
      if (doNotAskToPatchClient) {
        console.log(`${ConstructVSBloomLogPrefix("Extension", "warn")}User indicated previously not to display the client patch prompt; going dormant`);
        //the user previously said that they don't want us prompting them
        //to patch the client again in the future at some point, so we'll
        //assume they're going to patch it when they want and just go dormant
        return;
      }

      console.log(`${ConstructVSBloomLogPrefix("Extension", "info")}Displaying client patch prompt, waiting for user response`);

      const shouldPatchClient = await ShowClientPatchRequestPrompt(context);
      if (shouldPatchClient) {
        console.log(`${ConstructVSBloomLogPrefix("Extension", "info")}User agreed to client patching`);
        await vscode.commands.executeCommand("vsbloom.enable", true);
      } else {
        console.log(`${ConstructVSBloomLogPrefix("Extension", "warn")}User declined client patching; going dormant`);
        vscode.window.showInformationMessage("[VSBloom]: Not patching the Electron Client, VSBloom will not be able to function until this patch is performed - you can trigger this patch at any time in the future to enable VSBloom by running the 'VSBloom: Enable and Patch Electron Client' command!");
        return;
      }
    }

    //If the client was already patched, let's get chugging along!
    if (wasClientAlreadyPatchedDuringExtensionActivation) {
      console.log(`${ConstructVSBloomLogPrefix("Extension", "info")}Client is currently patched; continuing with extension activation`);

      await ExtensionActivatedAndClientPatchingVerified(context);
    }

  }).catch(err => {
    throw new Error(Common.RaiseError(`VSBloom failed to find the application's 'product.json' file, you may need to manually specify an appropriate file path in VS Code's installation directory for this file -- Error: ${err.message}`));
  });
}

export function deactivate() {
  //cleanup is handled by the subscriptions system via Disposable interface
  //The bridge and effect manager are added to context.subscriptions
  //and will be disposed automatically
  
  //clear global references
  server = null;
  effectManager = null;
}

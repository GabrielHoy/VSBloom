/**
 * VSBloom Effect Manager
 * 
 * Orchestrates loading/unloading/management of visual effect modules,
 * keeping all of the clients connected to the bridge server up to date
 * and in-sync regarding which effects are currently loaded and/or
 * not loaded on the client side.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { VSBloomBridgeServer } from '../ExtensionBridge/Server';
import type { EffectConfiguration } from '../ExtensionBridge/Bridge';
import { DoesExtensionConfigValueExist, GetExtensionConfigValue, GetInternalPathForEffectProperty } from '../ExtensionBridge/Bridge';
import { ConstructVSBloomLogPrefix } from "../Debug/Colorful";

interface LoadedEffect {
    effectName: string;
    js?: string;
    css?: string;
    loadedAt: Date;
}

export class EffectManager implements vscode.Disposable {
    private loadedEffects: Map<string, LoadedEffect> = new Map();
    private staticEffectConfigs: Map<string, EffectConfiguration> = new Map();
    private outputChannel: vscode.OutputChannel;
    private managerDisposables: vscode.Disposable[] = [];

    constructor(
        private server: VSBloomBridgeServer,
        private context: vscode.ExtensionContext
    ) {
        this.outputChannel = vscode.window.createOutputChannel('VSBloom: Effect Manager');
        this.managerDisposables.push(this.outputChannel);
    
        //Load all of the static effect configurations into
        //the `staticEffectConfigs` map
        this.LoadStaticEffectConfigs();

        //watch for new clients becoming ready so we can replicate
        //current effects to them & keep in sync
        this.managerDisposables.push(server.OnClientReady((windowId) => {
            this.Log('info', `A new client is ready, replicating current effects to it: ${windowId}`);
            //replicate all currently loaded effects to the new client
            this.ReplicateCurrentEffectsToClient(windowId);
        }));

        //listen for vsbloom config changes so we can enable or
        //disable effects accordingly based on new config values
        this.managerDisposables.push(vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('vsbloom')) {
                this.Log('debug', "Extension configuration changed, handling effect enable/disable states accordingly");
                this.HandleExtensionConfigsChanged();
            }
        }));

        
        //trigger an initial sync of effect enable/disable states
        this.HandleExtensionConfigsChanged();

        this.Log('debug', "Effect manager initialized and ready to go");
    }

    private HandleExtensionConfigsChanged(): void {
        const currentCfg = this.server.GetCurrentExtensionConfig();
        //Handle loading/unloading of effects based on
        //current config values
        for (const [effectName, effectConfig] of this.staticEffectConfigs.entries()) {
            //see if there's an enabled property defined for the effect
            //?maybe in the future facilitate a config entry in the JSON to specify a different name besides 'enabled' for pretty prop naming?
            const effectEnabledPropPath = GetInternalPathForEffectProperty(effectConfig.effectDisplayName, "enabled");
            const hasEnabledProperty = DoesExtensionConfigValueExist(currentCfg, effectEnabledPropPath);
            if (!hasEnabledProperty) {
                //no enabled property is defined for this effect,
                //for now we'll handle this as an 'uh oh' situation
                //but it by no means has to stay that way
                this.Log('error', `HandleExtensionConfigsChanged - Effect "${effectName}" does not have an 'enabled' property defined in its configuration: ${JSON.stringify(effectConfig, null, 2)}`);
                continue;
            }

            const shouldEffectBeEnabled: boolean = GetExtensionConfigValue(currentCfg, effectEnabledPropPath, false);
            //if the effect should be enabled right now, load it if it's not already loaded
            if (shouldEffectBeEnabled) {
                if (!this.IsEffectLoaded(effectName)) {
                    this.Log('info', `Effect "${effectName}" should be enabled based on config value "${effectEnabledPropPath}", but is not currently loaded: loading it`);
                    this.LoadEffect(effectName);
                }
            } else {
                //effect should be disabled, unload it if it's currently loaded
                if (this.IsEffectLoaded(effectName)) {
                    this.Log('info', `Effect "${effectName}" should be disabled based on config value "${effectEnabledPropPath}", but is currently loaded: unloading it`);
                    this.UnloadEffect(effectName);
                }
            }
        }
    }

    /**
     * Loads all of the static effect configuration JSON's from the
     * `build/Effects` directory and populates the `staticEffectConfigs`
     * map based upon their contents.
     */
    private LoadStaticEffectConfigs(): void {
        const effectConfigsDir = path.join(__dirname, "Effects");
        if (!fs.existsSync(effectConfigsDir)) {
            this.Log('error', `LoadStaticEffectConfigs called but the effects configuration directory "${effectConfigsDir}" does not exist`);
            return;
        }
        if (!fs.statSync(effectConfigsDir).isDirectory()) {
            this.Log('error', `LoadStaticEffectConfigs called but the effects configuration directory "${effectConfigsDir}" is not a directory`);
            return;
        }
        const staticEffectSubdirs = fs.readdirSync(effectConfigsDir).filter(dir => fs.statSync(path.join(effectConfigsDir, dir)).isDirectory());
        for (const staticEffectDir of staticEffectSubdirs) {
            const effectJSONPath = path.join(effectConfigsDir, staticEffectDir, `${staticEffectDir}.json`);
            if (!fs.existsSync(effectJSONPath)) {
                this.Log('error', `LoadStaticEffectConfigs - Effect "${staticEffectDir}" does not have a configuration JSON file at "${effectJSONPath}"`);
                continue;
            }

            try {
                const effectConfig = JSON.parse(fs.readFileSync(effectJSONPath, 'utf8')) as EffectConfiguration;
                this.staticEffectConfigs.set(staticEffectDir, effectConfig);
            } catch (error) {
                this.Log('error', `LoadStaticEffectConfigs - Error parsing effect configuration file "${effectJSONPath}": ${error}`);
                continue;
            }
        }
    }

    /**
     * Loads a bundled effect by name, this is the idiomatic vector
     * of choice for generally loading effects in VSBloom.
     */
    public LoadEffect(effectName: string, js?: string, css?: string): void {
        if (this.IsEffectLoaded(effectName)) {
            this.Log('error', `LoadEffect called with effect name "${effectName}" but an effect by this name is already currently loaded`);
            return;
        }

        if (js === undefined && css === undefined) {
            //the user did not manually specify
            //any kind of JS/CSS code to load,
            //let's try and fetch any appropriate
            //effect code from the `build/Effects/${effectName}`
            //directory contents
            const effectDir = path.join(__dirname, "Effects", effectName);
            if (!fs.existsSync(effectDir)) {
                this.Log('error', `LoadEffect called without manually specifying JS/CSS for effect and effect name "${effectName}" does not have a directory at "${effectDir}"`);
                return;
            }
            if (!fs.statSync(effectDir).isDirectory()) {
                this.Log('error', `LoadEffect called without manually specifying JS/CSS for effect and effect name "${effectName}" when searched for in static effects directory "${effectDir}" was not a directory`);
                return;
            }

            const jsFilePath = path.join(effectDir, `${effectName}.js`);
            const cssFilePath = path.join(effectDir, `${effectName}.css`);
            const jsExists = fs.existsSync(jsFilePath);
            const cssExists = fs.existsSync(cssFilePath);
            if (!jsExists && !cssExists) {
                //a static effect directory exists for this effect,
                //but it does not have either a JS or CSS file at the
                //expected paths, so we can't really do much here
                //this is most definitely an unintended state
                this.Log('error', `LoadEffect called without manually specifying JS/CSS for effect and effect name "${effectName}" when searched for in static effects directory "${effectDir}" did not have either a JS or CSS file at "${jsFilePath}" or "${cssFilePath}"`);
                return;
            }

            if (jsExists) {
                //get the JS we want to load from the file
                js = fs.readFileSync(jsFilePath, 'utf8');
            }
            if (cssExists) {
                //get the CSS we want to load from the file
                css = fs.readFileSync(cssFilePath, 'utf8');
            }
            //at this point we can let the below logic take the lead
            //as if either js/css was manually specified for loading,
            //since at least one of the previously non-existant `js`
            //and/or `css` variables should now be guarunteed to be defined
        }

        //otherwise we actually *do* have a bundled effect
        //and we can go ahead and load it accordingly
        this.loadedEffects.set(effectName, {
            effectName: effectName,
            js: js,
            css: css,
            loadedAt: new Date(),
        });

        //broadcast to all connected clients
        this.server.FireAllClients({
            type: 'enable-effect',
            effectName: effectName,
            js: js,
            css: css
        });

        this.Log('info', `Loaded Effect: "${effectName}"`);
    }

    /**
     * Unloads an effect by name.
     */
    public UnloadEffect(effectName: string): void {
        if (!this.IsEffectLoaded(effectName)) {
            this.Log('error', `UnloadEffect called with effect name "${effectName}" but an effect by this name is not currently loaded`);
            return;
        }

        this.loadedEffects.delete(effectName);

        //broadcast to all connected clients
        this.server.FireAllClients({
            type: 'stop-effect',
            effectName: effectName
        });

        this.Log('info', `Unloaded Effect: "${effectName}"`);
    }

    /**
     * Checks if an effect is currently loaded, by name.
     */
    public IsEffectLoaded(effectName: string): boolean {
        return this.loadedEffects.has(effectName);
    }

    /**
     * Gets an effect by name.
     * 
     * Returns undefined if the effect is not currently loaded.
     */
    public GetEffect(effectName: string): LoadedEffect | undefined {
        return this.loadedEffects.get(effectName);
    }

    /**
     * Get all currently loaded effect names.
     */
    public GetLoadedEffects(): string[] {
        return Array.from(this.loadedEffects.keys());
    }

    /**
     * Reload any and all currently loaded effects.
     */
    public async ReloadAllEffects(): Promise<void> {
        this.Log('info', `Reloading all ${this.loadedEffects.size} effect(s)`);

        const reloadingEffects: string[] = [];
        for (const effectName of this.loadedEffects.keys()) {
            reloadingEffects.push(effectName);
        }
        this.UnloadAllEffects();

        return new Promise((resolve) => {
            setTimeout(() => {
                for (const effectName of reloadingEffects) {
                    this.LoadEffect(effectName);
                }
                resolve();
            }, 100); //100ms should be enough time for the effects to stop for now until i can do this a better way
        });
    }

    /**
     * Unload all effects.
     */
    public UnloadAllEffects(): void {
        this.Log('info', `Unloading all ${this.loadedEffects.size} effect${this.loadedEffects.size === 1 ? '' : 's'}`);

        for (const effectName of this.loadedEffects.keys()) {
            this.UnloadEffect(effectName);
        }
    }

    /**
     * Send all of the currently loaded effects to a client,
     * ensuring that newly joining clients are up to speed.
     */
    public ReplicateCurrentEffectsToClient(windowId: string): void {
        this.Log('debug', `Replicating ${this.loadedEffects.size} currently loaded effect${this.loadedEffects.size === 1 ? '' : 's'} to client with Window ID "${windowId}"`);

        for (const [effectName, effect] of this.loadedEffects.entries()) {
            this.server.FireClient(windowId, {
                type: 'enable-effect',
                effectName: effectName,
                js: effect.js,
                css: effect.css
            });
        }
    }

    /**
     * Log a message to the output channel.
     */
    private Log(level: 'info' | 'warn' | 'error' | 'debug', message: string): void {
        this.outputChannel.appendLine(`[EffectManager/${level.toUpperCase()}]: ${message}`);
        console.log(`${ConstructVSBloomLogPrefix("EffectManager", level)}${message}`);
    }

    /**
     * Dispose of the manager.
     */
    public dispose(): void {
        this.UnloadAllEffects();
        this.managerDisposables.forEach(disposable => disposable.dispose());
    }
}

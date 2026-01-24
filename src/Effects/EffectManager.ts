/**
 * VSBloom Effect Manager
 * 
 * Orchestrates loading, unloading, and management of visual effect modules
 * 
 */

import * as vscode from 'vscode';
import { VSBloomBridgeServer } from '../ExtensionBridge/Server';
import { GetExtensionConfigValue } from '../ExtensionBridge/Bridge';
import { colorful, ConstructNonBrandedLogPrefix, ConstructVSBloomLogPrefix } from "../Debug/Colorful";

interface LoadedEffect {
    id: string;
    type: 'js' | 'css';
    code: string;
    loadedAt: Date;
}

export class EffectManager implements vscode.Disposable {
    private currentEffects: Map<string, LoadedEffect> = new Map();
    private outputChannel: vscode.OutputChannel;

    constructor(
        private server: VSBloomBridgeServer,
        private context: vscode.ExtensionContext
    ) {
        this.outputChannel = vscode.window.createOutputChannel('VSBloom: Effect Manager');
    }
    
    /**
     * Load a JavaScript effect by ID.
     * If an effect with the same ID is already loaded, it will be replaced.
     */
    public LoadJSEffect(id: string, code: string): void {
        // Track the loaded effect
        this.currentEffects.set(id, {
            id,
            type: 'js',
            code,
            loadedAt: new Date(),
        });

        // Broadcast to all connected clients
        this.server.FireAllClients({
            type: 'create-element',
            nodeType: 'js',
            payload: code,
            id
        });

        this.Log('info', `Loaded JS effect: ${id}`);
    }

    /**
     * Unload a JavaScript effect by ID.
     */
    public UnloadJSEffect(id: string): void {
        if (!this.currentEffects.has(id)) {
            this.Log('warn', `UnloadJSEffect called for effect that was not loaded: ${id}`);
            return;
        }

        this.currentEffects.delete(id);

        // Broadcast removal to all clients
        this.server.FireAllClients({
            type: 'remove-element',
            id,
        });

        this.Log('info', `Unloaded effect: ${id}`);
    }

    /**
     * Load a CSS stylesheet by ID.
     * If a stylesheet with the same ID is already loaded, it will be replaced.
     */
    public LoadCSS(id: string, css: string): void {
        // Track the loaded CSS
        this.currentEffects.set(id, {
            id,
            type: 'css',
            code: css,
            loadedAt: new Date(),
        });

        // Broadcast to all connected clients
        this.server.FireAllClients({
            type: 'create-element',
            nodeType: 'css',
            payload: css,
            id
        });

        this.Log('info', `Loaded CSS: ${id}`);
    }

    /**
     * Unload a CSS stylesheet by ID.
     */
    public UnloadCSS(id: string): void {
        this.UnloadJSEffect(id); // Same mechanism as JS
    }

    /**
     * Check if an effect is currently loaded.
     */
    public IsEffectLoaded(id: string): boolean {
        return this.currentEffects.has(id);
    }

    /**
     * Get all currently loaded effect IDs.
     */
    public GetLoadedEffects(): string[] {
        return Array.from(this.currentEffects.keys());
    }

    /**
     * Reload any and all currently loaded effects.
     */
    public ReloadAllEffects(): void {
        this.Log('info', `Reloading all effects (${this.currentEffects.size} total)`);

        for (const effect of this.currentEffects.values()) {
            if (effect.type === 'js') {
                this.server.FireAllClients({
                    type: 'create-element',
                    nodeType: 'js',
                    payload: effect.code,
                    id: effect.id
                });
            } else {
                this.server.FireAllClients({
                    type: 'create-element',
                    nodeType: 'css',
                    payload: effect.code,
                    id: effect.id,
                });
            }
        }
    }

    /**
     * Unload all effects.
     */
    public UnloadAllEffects(): void {
        this.Log('info', `Unloading all effects (${this.currentEffects.size} total)`);

        for (const id of this.currentEffects.keys()) {
            this.server.FireAllClients({
                type: 'remove-element',
                id,
            });
        }

        this.currentEffects.clear();
    }

    /**
     * Send all of the currently loaded effects to a client,
     * ensuring that newly joining clients are up to speed.
     */
    public ReplicateCurrentEffectsToClient(windowId: string): void {
        this.Log('debug', `Sending initial payload to ${windowId}`);

        for (const effect of this.currentEffects.values()) {
            if (effect.type === 'js') {
                this.server.FireClient(windowId, {
                    type: 'create-element',
                    nodeType: 'js',
                    payload: effect.code,
                    id: effect.id,
                });
            } else {
                this.server.FireClient(windowId, {
                    type: 'create-element',
                    nodeType: 'css',
                    payload: effect.code,
                    id: effect.id
                });
            }
        }
    }

    /**
     * Load default/base effects based on current configuration.
     * This is called during extension activation.
     */
    public async LoadDebugTestEffects(): Promise<void> {
        const config = this.server.GetCurrentExtensionConfig();
        this.Log('info', 'Loading "Debug Test" effects');

        const cursorTrailEnabled = GetExtensionConfigValue(config, 'cursorTrail.enabled', true);
        const cursorTrailDuration = GetExtensionConfigValue(config, 'cursorTrail.duration', 750);


        // For now, just load a test effect to verify the system works
        // Real effects will be implemented later
        if (cursorTrailEnabled) {
            this.LoadJSEffect('test-effect', `
                const test = window.console.log.bind(window.console);
                test('test binding for console');

                window.__VSBLOOM__.SendLog('debug', 'Test effect script running!', { cursorTrailEnabled: ${cursorTrailEnabled}, cursorTrailDuration: ${cursorTrailDuration} });
                console.log('[VSBloom/TEST_EFFECT]: Test effect loaded!');
                console.log('[VSBloom/TEST_EFFECT]: Cursor trail enabled:', ${cursorTrailEnabled});
                console.log('[VSBloom/TEST_EFFECT]: Cursor trail duration:', ${cursorTrailDuration});
            `);
        }

        // Load base CSS (can be expanded later)
        this.LoadCSS('base-styles', `
            /* VSBloom Base Styles */
            /* This will be populated with actual theme CSS in future updates */
        `);
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
        this.outputChannel.dispose();
    }
}

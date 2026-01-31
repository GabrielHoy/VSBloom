/**
 * VSBloom Runtime Electron Globals
 * 
 * Shared type definitions for the VSBloom runtime environment.
 * This file serves as a single source of truth for the global API
 * available in the Electron Renderer after the VSBloom client has
 * been patched in, and is utilized by both  Client.ts and effect
 * scripts.
 */

/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type {
    VSBloomClientConfig,
    VSBloomConfigValue,
    VSBloomConfigObject,
} from './Bridge';
import type { EffectConfigResolver } from '../EffectLib/Bloom/Configs';

//we'll re-export config types for convenience(laziness) here
export type {
    VSBloomClientConfig,
    VSBloomConfigValue,
    VSBloomConfigObject,
    EffectConfigResolver,
};

/**
 * Public interface for the VSBloom client.
 * 
 * This interface defines the public API surface of the VSBloom client
 * that may be accessed by effect scripts. The actual implementation
 * of this interface lies within the Client.ts file.
 * 
 * It's unexpected for effects to ever need to directly interact with the client,
 * but for robustness and type safety, we define it here regardless.
 */
export interface IVSBloomClient {
    /**
     * Whether the client is currently connected to the VSBloom extension's WebSocket server.
     */
    readonly isConnected: boolean;

    /**
     * A unique identifier for this client/window instance.
     * 
     * This is **NOT** a static identifier!
     */
    readonly windowId: string;
}

/**
 * The global VSBloom API available to effect scripts and the client.
 * 
 * This interface defines what is available on `window.__VSBLOOM__`
 * after the VSBloom client has initialized.
 */
export interface VSBloomGlobals {
    /**
     * Shared libraries pre-loaded by the SharedLibraries.ts file.
     * 
     * Should be available immediately by the time that
     * effects - or even the client - loads, since they're
     * pre-loaded by SharedLibraries.ts(which is patched
     * into the electron renderer's DOM before the client
     * even loads)
     */
    libs?: VSBloomSharedLibraries;

    /**
     * The current extension configuration, synchronized from
     * the VSBloom extension. May be undefined if not yet received.
     */
    extensionConfig: VSBloomClientConfig | undefined;

    /**
     * Direct reference to an instance of the VSBloom Client.
     */
    client: IVSBloomClient | undefined;

    /**
     * Send a log message to the VSBloom extension's output channel.
     * This is the preferred way for effects to log messages.
     * 
     * @param level - The log level
     * @param message - The message to log
     * @param data - Optional additional data to include
     * 
     * @example
     * window.__VSBLOOM__.Log('info', 'Effect initialized!');
     * window.__VSBLOOM__.Log('debug', 'Processing data', { count: 42 });
     */
    Log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void;
}

/**
 * Custom event fired when the extension configuration is updated.
 * Listen for this on the window object to react to config changes.
 * 
 * @example
 * window.addEventListener('vsbloom-config-update', (event) => {
 *     const { current, previous } = event.detail;
 *     console.log('Config updated:', current);
 * });
 */
export interface VSBloomConfigUpdateEvent extends CustomEvent<{
    current: VSBloomClientConfig;
    previous: VSBloomClientConfig | undefined;
}> {
    type: 'vsbloom-config-update';
}

/**
 * Shared libraries loaded for use by VSBloom Client Effects.
 * 
 * These libraries are bundled once in SharedLibraries.ts, patched into
 * workbench.html before the client, and made available to effects via
 * aliases for the libraries redirecting to shim files that re-export
 * from this object.
 * 
 * This is of course quite a hack internally, but it allows for
 * nice and neat import syntax for effects, i.e. `import gsap from 'gsap'`
 * without having to bundle the library into the effect's code
 * or otherwise complicate the process of actually developing effects.
 */
export interface VSBloomSharedLibraries {
    /**
     * GSAP animation library
     */
    gsap: typeof import('gsap').default;
    /**
     * Motion animation library
     */
    motion: typeof import('motion');
    /**
     * Bloom - VSBloom's All-Purpose Utility Container
     */
    bloom: typeof import('../EffectLib/Bloom/Bloom').default;
    /**
     * Pixi.JS 2D graphics library
     */
    pixi: typeof import('pixi.js');
}

/**
 * This describes the public interface that all "Effect" modules must implement.
 */
export interface VSBloomEffectModule {
    /**
     * Called as the effect is instantiated and loaded into the
     * client's DOM.
     * 
     * This is where any initialization, setup, connection
     * establishment, modifications to the DOM, etc. should be
     * performed.
     * 
     */
    Start: (configResolver: EffectConfigResolver) => void | Promise<void>;

    /**
     * Called as the effect is unloaded and removed from the
     * client's DOM.
     * 
     * This is where any cleanup, teardown, connection
     * termination, restoration of the DOM, etc. should be
     * performed.
     * 
     * The goal of this function should be - to the greatest
     * extent possible - undoing any changes made by the call to
     * the effect's `Start` function, and restoring the DOM to
     * the state it was originally in before the effect was
     * loaded.
     * 
     */
    Stop: () => void | Promise<void>;
}

/**
 * Internal tracking for a loaded effect module.
 */
export interface LoadedVSBloomEffectHandle {
    /**
     * The exports from the loaded effect module.
     */
    module: VSBloomEffectModule;
    /**
     * The blob URL of the effect's JS code.
     */
    jsBlobUrl?: string;
    /**
     * A hash of the effect's JS source code.
     * Useful for differentiating between different versions
     * of the same effect code, in the rare circumstance
     * that an effect is re-loaded with the same name but
     * different code(e.g. during development).
     */
    jsSrcHash?: string;
    /**
     * The ID of the CSS `<style>` element that was created
     * for the effect in the DOM.
     */
    cssElementId?: string;
    /**
     * A hash of the effect's CSS source code.
     * Useful for differentiating between different versions
     * of the same effect code, in the rare circumstance
     * that an effect is re-loaded with the same name but
     * different code(e.g. during development).
     */
    cssSrcHash?: string;
    /**
     * A timestamp indicating when the effect was loaded.
     */
    moduleLoadedAt: Date;
    /**
     * An indicator of whether the effect is currently enabled
     * on the client or not (*assuming that the effect's module
     * actually behaves like it should upon Start/Stop calls!*)
     */
    isEnabled: boolean;
}

//
// Window Global Augmentation
// 
// VSBloom performs some changes on the Window interface
// to include VSBloom-specific globals
//

declare global {
    interface Window {
        /**
         * The VSBloom global API object.
         * Available after the VSBloom client has initialized.
         * 
         * In theory, effects should never encounter a situation
         * where this ends up being `undefined` - but the possibility
         * of it happening is something that should be accounted for
         * regardless.
         * 
         */
        __VSBLOOM__: VSBloomGlobals;

        /**
         * The Trusted Types API - if available.
         * Used for CSP-compliant dynamic script injection.
         */
        trustedTypes?: TrustedTypePolicyFactory;
    }

    interface WindowEventMap {
        'vsbloom-config-update': VSBloomConfigUpdateEvent;
    }

    /**
     * Global reference to the Trusted Types factory - if available.
     */
    const trustedTypes: TrustedTypePolicyFactory | undefined;
}

/**
 * Type-safe accessor for nested configuration values
 * 
 * Navigates a dot-separated path (e.g., "cursorTrail.enabled") and returns
 * the found value with the specified type, or a default value if not found.
 * 
 * @param config - The configuration object to access
 * @param path - Dot-separated path to the value (e.g., "cursorTrail.enabled")
 * @param defaultValue - Default value to return if path doesn't exist
 * @returns The config value cast to `T`, or `defaultValue` if not found
 * 
 * @example
 * const config = window.__VSBLOOM__.extensionConfig;
 * if (config) {
 *     const enabled = getEffectConfigValue(config, 'cursorTrail.enabled', false);
 *     const duration = getEffectConfigValue(config, 'cursorTrail.duration', 750);
 * }
 */
export function GetEffectConfigValue<T extends VSBloomConfigValue>(
    config: VSBloomClientConfig,
    path: string,
    defaultValue: T
): T {
    const parts = path.split('.');
    let current: VSBloomConfigValue | VSBloomConfigObject = config;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return defaultValue;
        }
        if (typeof current !== 'object') {
            return defaultValue;
        }
        current = (current as VSBloomConfigObject)[part];
    }

    if (current === null || current === undefined) {
        return defaultValue;
    }

    const expectedType = typeof defaultValue;
    if (typeof current !== expectedType) {
        return defaultValue;
    }

    return current as T;
}

//
// polyfill for the "Trusted Types" API
// lib.dom.d.ts doesn't include the Trusted Types API, so we define it here
// for proper typechecker support when working with CSP-compliant dynamic script injection
//

export interface TrustedHTML {
    toString(): string;
}

export interface TrustedScript {
    toString(): string;
}

export interface TrustedTypePolicyOptions {
    createHTML?: (input: string, ...args: unknown[]) => string;
    createScript?: (input: string, ...args: unknown[]) => string;
    createScriptURL?: (input: string, ...args: unknown[]) => string;
}

export interface TrustedTypePolicy {
    readonly name: string;
    createHTML(input: string, ...args: unknown[]): TrustedHTML;
    createScript(input: string, ...args: unknown[]): TrustedScript;
    createScriptURL?(input: string, ...args: unknown[]): unknown;
}

export interface TrustedTypePolicyFactory {
    createPolicy(policyName: string, policyOptions?: TrustedTypePolicyOptions): TrustedTypePolicy;
    isHTML?(value: unknown): value is TrustedHTML;
    emptyHTML?(): TrustedHTML;
    getAttributeType?(tagName: string, attribute: string, elementNs?: string, attrNs?: string): string | null;
    getPropertyType?(tagName: string, property: string, elementNs?: string): string | null;
}
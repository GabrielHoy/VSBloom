/**
 * VSBloom Electron Client
 * 
 * This is the actual client script that gets
 * patched into VSC's Electron renderer,
 * the source code of this file - once compiled and
 * bundled with esbuild - is embedded into a <script> tag
 * at the very top of VSC's workbench.html <head> tag,
 * before anything else in the client actually loads
 * 
 */

/// <reference lib="dom" />
/// <reference lib="dom.iterable" />

import type {
    ExtensionToClientMessage,
    ClientToExtensionMessage,
} from './Bridge';

import {
    MAX_RECONNECT_DELAY_MS,
    INITIAL_RECONNECT_DELAY_MS,
} from './Bridge';

import type {
    VSBloomClientConfig,
    VSBloomGlobals,
    TrustedTypePolicy,
    IVSBloomClient,
    LoadedVSBloomEffectHandle,
    VSBloomEffectModule
} from './ElectronGlobals';
import './ElectronGlobals'; //side-effect import for global augmentation

//these constants are replaced during the esbuild
//compilation step with their 'actual' values
declare const __VSBLOOM_PORT__: number;
declare const __VSBLOOM_AUTH__: string;

//stub module interface for effect modules
//that do not have actual JS code associated
//with them
const stubEffectModule: VSBloomEffectModule = {
    Start: () => {},
    Stop: () => {},
};

//actual client class implementation
class VSBloomClient implements IVSBloomClient {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private reconnectTimeout: number | null = null;
    /**
     * Storage for HTML elements that have been created by the client.
     * 
     * Used for quick and easy tracking and removal of elements by their ID's.
     * 
     * Elements created by the client(at least by the top level VSBloomClient
     * instance) will always have an associated ID, and thus this map stores
     * those elements based upon elementID -> HTMLElement pairs.
     */
    private htmlElements: Map<string, HTMLElement> = new Map();
    /**
     * Storage for loaded effect 'handles', which correspond to
     * bundles of JS/CSS code(or one of the two) that have been
     * loaded into the client's DOM.
     * 
     * These 'effect handles' also facilitate easy tracking and
     * removal of the effect's actual HTMLElement objects within
     * the client's DOM.
     */
    private effectHandles: Map<string, LoadedVSBloomEffectHandle> = new Map();
    private trustedPolicy: TrustedTypePolicy | null = null;

    private _windowId: string = "WINDOW_ID_NOT_ASSIGNED_FOR_SOME_REASON";
    private set windowId(value: string) {
        const isInitialWindowIdAssignment = this._windowId === "WINDOW_ID_NOT_ASSIGNED_FOR_SOME_REASON";
        const lastWindowId = this._windowId;

        this._windowId = value;
        if (!isInitialWindowIdAssignment) {
            this.Log('info', `My window ID is being changed from "${lastWindowId}" -> "${this._windowId}"`);
            this.FireServer({
                type: 'change-window-id',
                newWindowId: this._windowId
            });
        }
    }
    private _isConnected = false;

    //public properties exposed via IVSBloomClient interface
    /**
     * A unique identifier for this client/window instance.
     * 
     * This is **NOT** a static identifier!
     */
    public get windowId(): string {
        return this._windowId;
    }
    /**
     * Whether the client is currently connected to the extension's WebSocket server.
     */
    public get isConnected(): boolean {
        return this._isConnected;
    }

    constructor(
        private port: number,
        private authToken: string
    ) {
        this.windowId = this.GetNewWindowId();
        this.SyncWindowIDUpdatesWithWindowTitleUpdates();

        //create the trusted types policy we need to dynamically run
        //code in a way that satisfies the CSP directives in vsc's workbench.html
        this.trustedPolicy = this.CreateTrustedTypesPolicy();

        //once that's done, get our global API setup on the window object
        this.SetupGlobalAPI();
        
        //we're good to go pretty much, let's go ahead and try to connect
        //to the websocket server hosted by the extension
        this.ConnectToWebsocketServer();

        this.Log('info', 'VSBloom Client Bootstrap Complete:', { 
            windowId: this._windowId,
            trustedTypesEnabled: this.trustedPolicy !== null
        });
    }

    /**
     * Creates a trusted types policy for dynamic JS execution
     * that adheres to the CSP directives in vsc's workbench.html
     */
    private CreateTrustedTypesPolicy(): TrustedTypePolicy | null {
        if (typeof trustedTypes === 'undefined' || !trustedTypes) {
            this.Log('warn', 'Trusted Types API not available, dynamic JS execution may fail(?)');
            return null;
        }

        try {
            return trustedTypes.createPolicy('vsbloom-client', {
                createHTML: (input: string) => input,
                createScript: (input: string) => input,
            });
        } catch (error) {
            // Policy with this name might already exist (e.g., after hot reload)
            this.Log('warn', 'Failed to create a Trusted Types policy for use by the VSBloom Client', { error: String(error) });
            return null;
        }
    }

    /**
     * Generates a new unique id for this client, we
     * could absolutely just use a proper GUID etc but
     * this is a little easier on the eyes during
     * development to identify which client corresponds
     * to which window
     */
    private GetNewWindowId(): string {
        const timestamp = Date.now().toString(36).slice(-3);
        const random = Math.random().toString(36).slice(-3);
        const currentWindowTitle = window.document.title.length > 0 ? window.document.title : "Untitled";

        return `#${random}${timestamp}/${currentWindowTitle}`;
    }

    /**
     * Attempts to establish a connection to the
     * websocket server hosted by the extension
     */
    private ConnectToWebsocketServer(): void {
        try {
            const url = `ws://127.0.0.1:${this.port}?token=${encodeURIComponent(this.authToken)}`;
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                this._isConnected = true;
                this.reconnectAttempts = 0;
                this.Log('info', 'Established a connection to the VSBloom Extension!');
                
                //send the client-ready message over to the server
                //so we can be registered on it and get sent over
                //our initial configuration etc
                this.FireServer({
                    type: 'client-ready',
                    windowId: this.windowId,
                });
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data as string) as ExtensionToClientMessage;
                    this.HandleMessageFromExtension(message);
                } catch (error) {
                    this.Log('error', 'Failed to parse message from server', { error: String(error) });
                }
            };

            this.ws.onclose = (event: CloseEvent) => {
                this._isConnected = false;
                this.ws = null;

                if (event.code === 4001) {
                    //unauthorized? don't reconnect, we won't have much luck with that
                    //likely an outdated patch in relation to the extension version or similar
                    this.Log('error', 'Connection rejected: Invalid auth token(?) - A re-patch is likely required');
                    return;
                }

                if (event.code === 1006 && event.reason === "" && event.target instanceof WebSocket && event.target.readyState === WebSocket.CLOSED) {
                    this.Log('debug', "WebSocket connection closed with an internal error code, server likely still initializing or not available", { event });
                    this.ScheduleReconnect();
                    return;
                }

                this.Log('warn', `Disconnected from VSBloom Host (code: ${event.code})`, { event });
                this.ScheduleReconnect();
            };

            this.ws.onerror = (error: Event) => {
                // WebSocket errors are typically followed by close events
                // Log but don't take action here
                if (error.target instanceof WebSocket && error.target.readyState === WebSocket.CLOSED) {
                    this.Log('debug', "An error occurred with the WebSocket while it was closed, this likely means that the server is either still initializing or is generally not available", { errorMessage: String(error) });
                    return;
                }
                this.Log('error', 'An internal error occurred with the WebSocket', { errorMessage: String(error) });
            };
        } catch (error) {
            this.Log('error', 'Failed to create WebSocket connection', { errorMessage: String(error) });
            this.ScheduleReconnect();
        }
    }

    /**
     * Schedule a reconnection attempt,
     * handling exponential backoff if needed
     */
    private ScheduleReconnect(): void {
        if (this.reconnectTimeout !== null) {
            return; //reconnection is already scheduled
        }

        const delay = Math.min(
            INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempts),
            MAX_RECONNECT_DELAY_MS
        );

        this.reconnectAttempts++;
        this.Log('info', `Scheduled reconnection to VSBloom Extension in ${delay}ms (attempt ${this.reconnectAttempts})`);

        this.reconnectTimeout = window.setTimeout(() => {
            this.reconnectTimeout = null;
            this.ConnectToWebsocketServer();
        }, delay);
    }

    /**
     * Sends a message over to the actual
     * VSC extension's websocket server
     */
    private FireServer(message: ClientToExtensionMessage): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(message));
        }
    }

    /**
     * Handles a message being received from the actual
     * VSC extension's websocket server and delegates
     * it to the appropriate client-sided handler
     */
    private HandleMessageFromExtension(message: ExtensionToClientMessage): void {
        switch (message.type) {
            case 'enable-effect':
                this.EnableClientEffect(message.effectName, message.js, message.css);
                break;
            case 'reload-effect':
                this.ReloadClientEffect(message.effectName);
                break;
            case 'stop-effect':
                this.StopClientEffect(message.effectName);
                break;
            case 'replicate-extension-config':
                if (message.settings) {
                    this.UpdateClientConfig(message.settings);
                }
                break;

            case 'are-u-alive':
                this.FireServer({ type: 'i-am-alive' });
                break;

            default:
                this.Log('warn', 'Received an unknown message type from the extension', { message: message });
                break;
        }
    }

    /**
     * Enables an effect module by name, loading it if necessary
     * and calling the module's Start method.
     */
    private async EnableClientEffect(effectName: string, js?: string, css?: string): Promise<void> {
        const effectHandle: LoadedVSBloomEffectHandle = await this.GetLoadedEffectHandle(effectName, js, css);

        if (effectHandle.isEnabled) {
            this.Log('error', `Effect "${effectName}" is already enabled during call to EnableClientEffect(?) - this is indicative of a synchronization issue`);
            return;
        }

        try {
            this.Log('debug', `Calling Start method on effect module "${effectName}"`, { effectHandle });
            if (css) {
                effectHandle.cssElementId = this.CreateCSSElement(`effect-css-${effectName}`, css);
            }
            const startResult = effectHandle.module.Start();
            if (startResult instanceof Promise) {
                await startResult;
            }
            effectHandle.isEnabled = true;
            this.Log('debug', `Effect "${effectName}" started successfully`, { effectHandle, startResult });
        } catch (error) {
            this.Log('error', `An error occurred while attempting to start effect "${effectName}": This may lead to undefined behavior or memory leaks!`, { errorMessage: String(error) });
        }
    }

    /**
     * Gets a handle for a loaded effect module by name,
     * creating a new one if necessary.
     */
    private async GetLoadedEffectHandle(effectName: string, js?: string, css?: string): Promise<LoadedVSBloomEffectHandle> {
        const jsHash = js ? this.NaiveHash(js) : undefined;
        const cssHash = css ? this.NaiveHash(css) : undefined;

        const preExistingHandle: LoadedVSBloomEffectHandle | undefined = this.effectHandles.get(effectName);
        if (preExistingHandle) {
            //ensure the handle's JS and CSS match the new ones if they're provided

            if (jsHash !== preExistingHandle.jsSrcHash || cssHash !== preExistingHandle.cssSrcHash) {
                //hash mismatch! a new version of the effect code has been provided
                //"invalidate" the existing handle and create a new one

                if (preExistingHandle.isEnabled) {
                    //stop the effect since it's currently enabled
                    await this.StopClientEffect(effectName);
                    preExistingHandle.isEnabled = false;
                }

                if (preExistingHandle.jsBlobUrl) {
                    //get rid of the blob URL to free up memory
                    //where we can at least 
                    URL.revokeObjectURL(preExistingHandle.jsBlobUrl);
                }
                if (preExistingHandle.cssElementId) {
                    this.RemoveCSSElement(preExistingHandle.cssElementId);
                    preExistingHandle.cssElementId = undefined;
                }

                this.effectHandles.delete(effectName);
            } else {
                //hashes of the source codes match up,
                //we can just return the existing handle
                return preExistingHandle;
            }
        }

        //at this point either no pre-existing handle was found,
        //or the source code hashes didn't match up and the last
        //handle was "invalidated" - in either case, we need to
        //create a new handle and return it
        const jsBlob = js ? new Blob([js], { type: 'text/javascript' }) : undefined;
        const jsBlobUrl = jsBlob ? URL.createObjectURL(jsBlob) : undefined;

        try {
            const effectModule = jsBlobUrl ? await import(jsBlobUrl) : stubEffectModule;

            //quick validation to ensure the effect module actually implements
            //the required interface
            if (typeof effectModule.Start !== 'function' || typeof effectModule.Stop !== 'function') {
                //failed validation; revoke blob URL if we're not using a stub and complain
                if (jsBlobUrl) {
                    URL.revokeObjectURL(jsBlobUrl);
                }
                this.Log('error', `Effect module for effect name "${effectName}" does not export the required interface`, { effectModule });
                throw new Error(`Effect module for effect name "${effectName}" does not export the required interface`);
            }

            const newEffectHandle: LoadedVSBloomEffectHandle = {
                module: effectModule,
                jsBlobUrl,
                jsSrcHash: jsHash,
                //CSS elements for these handles are created/removed on the fly as the effect is enabled/disabled
                cssElementId: undefined,
                cssSrcHash: cssHash,
                moduleLoadedAt: new Date(),
                isEnabled: false,
            };
            this.effectHandles.set(effectName, newEffectHandle);

            return newEffectHandle;
        } catch (error) {
            if (jsBlobUrl) {
                URL.revokeObjectURL(jsBlobUrl);
            }

            this.Log('error', `Failed to load effect module for effect with name "${effectName}"`, { errorMessage: String(error) });
            //re-throw to forward along the error
            throw error;
        }
    }

    /**
     * Calculates a quick, simple hash of a given string. Non-cryptographic.
     * Purely used for differentiation purposes, not meant for security, don't worry.
     * 
     * Returns hash as a hex string
     */
    private NaiveHash(input: string): string {
        // Simple FNV-1a 32-bit hash (thx chatgpt)
        let hash = 2166136261;
        for (let i = 0; i < input.length; i++) {
            hash ^= input.charCodeAt(i);
            hash += (hash << 1) + (hash << 4) + (hash << 7) + (hash << 8) + (hash << 24);
        }
        // Ensure uint32 wrap and stringify as hex
        return (hash >>> 0).toString(16).padStart(8, '0');
    }

    /**
     * Reloads an effect module by name
     */
    private async ReloadClientEffect(effectName: string): Promise<void> {
        const effectHandle: LoadedVSBloomEffectHandle | undefined = this.effectHandles.get(effectName);
        if (!effectHandle) {
            this.Log('error', `ReloadEffectModule called with effect name "${effectName}" but no effect by this name is currently loaded on the client`);
            return;
        }

        try {
            this.Log('debug', `Reloading effect "${effectName}"`, { effectHandle });
            const stopResult = effectHandle.module.Stop();
            if (stopResult instanceof Promise) {
                await stopResult;
            }
            effectHandle.isEnabled = false;
            const startResult = effectHandle.module.Start();
            if (startResult instanceof Promise) {
                await startResult;
            }
            effectHandle.isEnabled = true;
            this.Log('debug', `Reloaded effect "${effectName}" successfully`, { effectHandle, stopResult, startResult });
        } catch (error) {
            this.Log('error', `An error occurred while attempting to reload effect "${effectName}": This may lead to undefined behavior or memory leaks!`, { errorMessage: String(error) });
        }
    }

    /**
     * Stops an effect module by name, calling its Stop method and
     * cleaning up any CSS Stylesheets corresponding to it
     */
    private async StopClientEffect(effectName: string): Promise<void> {
        const effectHandle: LoadedVSBloomEffectHandle | undefined = this.effectHandles.get(effectName);
        if (!effectHandle) {
            this.Log('error', `StopClientEffect called with effect name "${effectName}" but no effect by this name is currently loaded on the client`);
            return;
        }

        try {
            this.Log('debug', `Stopping effect "${effectName}"`, { effectHandle });
            const stopResult = effectHandle.module.Stop();
            if (stopResult instanceof Promise) {
                await stopResult;
            }
            effectHandle.isEnabled = false;
        } catch (error) {
            this.Log('error', `An error occurred while attempting to stop effect "${effectName}": This may lead to undefined behavior or memory leaks!`, { errorMessage: String(error) });
        } finally {
            //remove the CSS stylesheet associated with the
            //effect - if it exists
            if (effectHandle.cssElementId) {
                this.RemoveCSSElement(effectHandle.cssElementId);
                effectHandle.cssElementId = undefined;
            }

            this.Log('debug', `Effect "${effectName}" stopped`, { effectHandle });
        }
    }

    /**
     * Creates a new CSS stylesheet in the document,
     * replacing any existing stylesheet by the same ID
     * 
     * Stylesheet ID's passed to this function are internally
     * prefixed with `vsbloom-` as to avoid conflicts with other
     * stylesheets that don't directly belong to VSBloom
     * 
     * Returns the (non-internal) ID of the created stylesheet
     * for ease of use
     */
    private CreateCSSElement(id: string, css: string): string {
        const internalDOMId = `vsbloom-${id}`;
        //if an element with the same ID already exists, remove it
        this.RemoveCSSElement(id);

        const newStyleElement: HTMLStyleElement = document.createElement('style');
        newStyleElement.id = internalDOMId;
        newStyleElement.textContent = css;
        this.htmlElements.set(internalDOMId, newStyleElement);

        //append the new stylesheet to the end
        //of the <head> tag in an attempt to
        //ensure highest specificity
        document.head.appendChild(newStyleElement);
        
        this.Log('debug', `Created a new CSS Stylesheet with ID "${internalDOMId}"`, { length: css.length });

        return id;
    }

    /**
     * Removes a CSS stylesheet based upon its ID
     */
    private RemoveCSSElement(id: string): void {
        const internalDOMId = `vsbloom-${id}`;
        const element: HTMLElement | undefined = this.htmlElements.get(internalDOMId);
        if (element) {
            element.remove();
            this.htmlElements.delete(internalDOMId);
            this.Log('debug', `Removed CSS Stylesheet with ID "${internalDOMId}"`);
        }
    }

    /**
     * Updates the global configuration object
     * containing a synchronized copy of the VSBloom
     * VSC extension's configuration settings
     */
    private UpdateClientConfig(settings: VSBloomClientConfig): void {
        const previousConfig = window.__VSBLOOM__.extensionConfig;
        window.__VSBLOOM__.extensionConfig = settings;

        //dispatch a custom event for config updates so that
        //any scripts can listen in on said changes
        const event = new CustomEvent('vsbloom-config-update', {
            detail: {
                current: settings,
                previous: previousConfig,
            },
        });
        window.dispatchEvent(event);

        this.Log('debug', 'Configuration updated', { settings });
    }

    /**
     * Sends a log message over to the actual
     * VSC extension's websocket server, ensuring
     * that it gets outputted on the extension's
     * output channel
     */
    private SendLogToExtension(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
        this.FireServer({
            type: 'replicate-log',
            level,
            message,
            data: data ? JSON.stringify(data) : undefined,
        });
    }

    /**
     * Logs a message to both the Electron console as well
     * as sending the log over to the actual VSC extension's
     * server so that it gets outputted on the extension's
     * output channel
     */
    private Log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
        //get the request spun off to the actual
        //VSC extension's websocket server
        this.SendLogToExtension(level, message, data);

        //then just log to the Electron console as usual
        const prefix = '[VSBloom]:';
        switch (level) {
            case 'error':
                console.error(prefix, message, data ?? '');
                break;
            case 'warn':
                console.warn(prefix, message, data ?? '');
                break;
            case 'debug':
                console.debug(prefix, message, data ?? '');
                break;
            default:
                console.log(prefix, message, data ?? '');
        }
    }

    /**
     * Syncronizes the window ID of this client with the title element
     * inside of the Electron Renderer's DOM
     */
    private SyncWindowIDUpdatesWithWindowTitleUpdates(): void {
        const getCurrentTitle = (): string => document.title;

        let lastKnownTitle = getCurrentTitle();

        let titleObserver: MutationObserver | null = null;

        const onTitleChange = () => {
            const newTitle = getCurrentTitle();
            if (lastKnownTitle !== newTitle) {
                lastKnownTitle = newTitle;
                this.windowId = this.GetNewWindowId();
            }
        };

        function observeTitleElement(titleEl: HTMLTitleElement) {
            disconnectTitleObserver();

            titleObserver = new MutationObserver(onTitleChange);
            titleObserver.observe(titleEl, { characterData: true, childList: true, subtree: true });
        }

        function disconnectTitleObserver() {
            if (titleObserver) {
                try { titleObserver.disconnect(); } catch { /* no-op */ }
                titleObserver = null;
            }
        }

        const observeHeadForTitle = () => {
            const head = document.head;
            if (!head) {
                //what
                return;
            }

            let currentTitleEl = head.querySelector('title');
            if (currentTitleEl) {
                observeTitleElement(currentTitleEl);
            }

            //mutation observer for title element addition/removal/replacement
            const headObserver = new MutationObserver((mutations) => {
                let needsRescan = false;
                mutations.forEach((mutation) => {
                    if (
                        mutation.type === 'childList' &&
                        Array.from(mutation.addedNodes).concat(Array.from(mutation.removedNodes)).some(
                            node => node.nodeType === Node.ELEMENT_NODE && (node as Element).tagName.toLowerCase() === 'title'
                        )
                    ) {
                        needsRescan = true;
                    }
                });
                if (needsRescan) {
                    disconnectTitleObserver();
                    const newTitleEl = head.querySelector('title');
                    if (newTitleEl) {
                        observeTitleElement(newTitleEl);
                        onTitleChange();
                    } else {
                        onTitleChange();
                    }
                }
            });
            headObserver.observe(head, { childList: true });

            const pollInterval = 250;
            let intervalId = setInterval(() => {
                onTitleChange();
            }, pollInterval);

            window.addEventListener('beforeunload', () => {
                headObserver.disconnect();
                disconnectTitleObserver();
                clearInterval(intervalId);
            });
        };

        observeHeadForTitle();
    }

    /**
     * Sets up the global API for created scripts so that they can
     * interface with this VSBloomClient instance and send messages etc
     * over to the VSC extension as they see fit
     */
    private SetupGlobalAPI(): void {
        //preserve libs that were set up by SharedLibraries.ts
        //since it loads and runs before this client script and
        //sets up a skeleton __VSBLOOM__ object which only
        //contains the `libs` field
        const existingLibs = (window as any).__VSBLOOM__?.libs;

        window.__VSBLOOM__ = {
            libs: existingLibs,
            extensionConfig: undefined,
            client: this,

            Log: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => {
                this.Log(level, message, data);
            },
        };

        //quick sanity check to see if libs weren't loaded for ~some~ reason
        if (!existingLibs) {
            this.Log('error', 'SharedLibraries seem to not have loaded before the VSBloom Client - Many things are probably going to break very shortly');
        }
    }

}


//self-executing init function for the client
//so that it's executed asap once the script is loaded
(function InitializeVSBloomClient() {
    //if we're already initialized for <some> reason, just return
    if (window.__VSBLOOM__ && window.__VSBLOOM__.client) {
        console.warn('[VSBloom] Client already initialized, skipping');
        return;
    }

    //these values are replaced at patch time with their 'actual' values by esbuild,
    //but we'll provide "defaults" to satisfy the typechecker accordingly
    const port = typeof __VSBLOOM_PORT__ !== 'undefined' ? __VSBLOOM_PORT__ : 52847;
    const auth = typeof __VSBLOOM_AUTH__ !== 'undefined' ? __VSBLOOM_AUTH__ : '';

    if (!auth) {
        console.error('[VSBloom] No auth token provided, cannot connect');
        return;
    }

    //good to go; let's fire up the client o7
    new VSBloomClient(port, auth);
})();

export {};

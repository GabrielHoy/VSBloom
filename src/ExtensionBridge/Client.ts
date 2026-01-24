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
} from './ElectronGlobals';
import './ElectronGlobals'; //side-effect import for global augmentation

//these constants are replaced during the esbuild
//compilation with their 'actual' values
declare const __VSBLOOM_PORT__: number;
declare const __VSBLOOM_AUTH__: string;

//actual client class object
class VSBloomClient implements IVSBloomClient {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private reconnectTimeout: number | null = null;
    private managedElements: Map<string, HTMLElement> = new Map();
    private trustedPolicy: TrustedTypePolicy | null = null;

    //public properties exposed via IVSBloomClient interface
    private _windowId: string = "WINDOW_ID_NOT_ASSIGNED_FOR_SOME_REASON";
    public get windowId(): string {
        return this._windowId;
    }
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
     * Generates a new unique id for this client instance
     * and, if this isn't the first time assigning a window
     * ID, sends a notification over to the extension so that
     * it can update our window ID on the server too
     */
    private GetNewWindowId(): string {
        const timestamp = Date.now().toString(36).slice(-3);
        const random = Math.random().toString(36).slice(-3);
        
        return `#${random}${timestamp}: "${window.document.title}"`;
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

            this.ws.onclose = (event) => {
                this._isConnected = false;
                this.ws = null;

                if (event.code === 4001) {
                    // Unauthorized - don't reconnect
                    this.Log('error', 'Connection rejected: Invalid auth token(?) - A re-patch is likely required');
                    return;
                }

                this.Log('warn', `Disconnected from VSBloom Host (code: ${event.code})`, { reason: event.reason });
                this.ScheduleReconnect();
            };

            this.ws.onerror = (error) => {
                // WebSocket errors are typically followed by close events
                // Log but don't take action here
                this.Log('error', 'An internal error occurred with the WebSocket', { error: error });
            };
        } catch (error) {
            this.Log('error', 'Failed to create WebSocket connection', { error: String(error) });
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
            case 'create-element':
                if (message.nodeType === 'js') {
                    this.CreateJSElement(message.id, message.payload);
                } else if (message.nodeType === 'css') {
                    this.CreateCSSElement(message.id, message.payload);
                } else {
                    this.Log('warn', 'Received a request to replicate content of an unknown type', { request: message });
                }
                break;

            case 'remove-element':
                if (message.id) {
                    this.RemoveManagedElement(message.id);
                }
                break;

            case 'replicate-extension-config':
                if (message.settings) {
                    this.UpdateClientConfig(message.settings);
                }
                break;

            case 'are-u-alive':
                this.FireServer({ type: 'i-am-alive' });
                break;

            case 'request-client-reload':
                this.Log('info', 'Reload requested by extension');
                window.location.reload();
                break;

            default:
                this.Log('warn', 'Received an unknown message type from the extension', { message: message });
                break;
        }
    }

    /**
     * Creates a new CSS stylesheet in the document,
     * replacing any existing stylesheet by the same ID
     * 
     * Stylesheet ID's passed to this function are prefixed
     * with `vsbloom-` as to avoid conflicts with other
     * stylesheets that don't directly belong to VSBloom
     */
    private CreateCSSElement(id: string, css: string): void {
        //if an element with the same ID already exists, remove it
        this.RemoveManagedElement(id);

        const style = document.createElement('style');
        style.id = `vsbloom-${id}`;
        style.textContent = css;
        
        //append the new stylesheet to the end
        //of the <head> tag in an attempt to
        //ensure highest specificity
        document.head.appendChild(style);
        this.managedElements.set(id, style);

        this.Log('debug', `Created a new CSS Stylesheet with ID "${id}"`, { length: css.length });
    }

    /**
     * Creates a new JS script in the document,
     * replacing any existing script with a matching ID
     * 
     * Script ID's passed to this function are prefixed
     * with `vsbloom-` as to avoid conflicts with other
     * scripts that don't directly belong to VSBloom
     */
    private CreateJSElement(id: string, code: string): void {
        //if an element with the same ID already exists, remove it
        this.RemoveManagedElement(id);

        const script = document.createElement('script');
        script.id = `vsbloom-${id}`;
        
        //wrap the script's source code as to
        //forward along any issues or errors that may occur
        //during its execution to the extension
        const wrappedCode = `
            try {
                ${code}
            } catch (e) {
                window.__VSBLOOM__.SendLog('error', 'Effect error in "${id}": ' + e.message, { stack: e.stack });
                console.error('[VSBloom/${id}]', e);
            }
        `;

        //utilize our trusted types policy to actually write the
        //script's source code in a way that satisfies the CSP directives,
        //assuming that the trusted policy is actually available and working
        if (this.trustedPolicy) {
            const trustedCode = this.trustedPolicy.createScript(wrappedCode);
            //TS doesn't like this assignment so we'll cast into unknown
            script.text = trustedCode as unknown as string;
        } else {
            //if there's no trusted types policy available for us to use,
            //just assign to textContent and ~hope for the best~
            script.textContent = wrappedCode;
        }

        //append the new script to the end of the <head> tag
        document.head.appendChild(script);
        this.managedElements.set(id, script);

        this.Log('debug', `Created JS element with ID "${id}"`, { length: code.length });
    }

    /**
     * Removes a managed element based upon its ID
     */
    private RemoveManagedElement(id: string): void {
        const element = this.managedElements.get(id);
        if (element) {
            element.remove();
            this.managedElements.delete(id);
            this.Log('debug', `Removed managed element with ID "${id}"`);
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
        window.__VSBLOOM__ = {
            extensionConfig: undefined,
            client: this,

            SendLog: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => {
                this.FireServer({
                    type: 'replicate-log',
                    level,
                    message,
                    data: data ? JSON.stringify(data) : undefined,
                });
            },
        };
    }

}


//self-executing init function for the client
//so that it's executed asap once the script is loaded
(function InitializeVSBloomClient() {
    //if we're already initialized for <some> reason, just return
    if (window.__VSBLOOM__) {
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

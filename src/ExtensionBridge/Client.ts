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
    VSBloomClientConfig,
    ExtensionToClientMessage,
    ClientToExtensionMessage,
} from './Bridge';

import {
    MAX_RECONNECT_DELAY_MS,
    INITIAL_RECONNECT_DELAY_MS,
} from './Bridge';

//these constants are replaced during the esbuild
//compilation with their 'actual' values
declare const __VSBLOOM_PORT__: number;
declare const __VSBLOOM_AUTH__: string;

//lib.dom.d.ts doesn't include trusted type api's so we'll define it here for
//nice pretty typechecker support
interface TrustedHTML {
    toString(): string;
}
interface TrustedScript {
    toString(): string;
}
interface TrustedTypePolicyOptions {
    createHTML?: (input: string, ...args: unknown[]) => string;
    createScript: (input: string, ...args: unknown[]) => TrustedScript;
    createScriptURL?: (input: string, ...args: unknown[]) => string;
}
interface TrustedTypePolicy {
    readonly name: string;
    createHTML(input: string, ...args: unknown[]): TrustedHTML;
    createScript(input: string, ...args: unknown[]): TrustedScript;
    createScriptURL?(input: string, ...args: unknown[]): unknown;
}
interface TrustedTypePolicyFactory {
    createPolicy(policyName: string, policyOptions?: TrustedTypePolicyOptions): TrustedTypePolicy;
    isHTML?(value: unknown): value is TrustedHTML;
    emptyHTML?(): TrustedHTML;
    getAttributeType?(tagName: string, attribute: string, elementNs?: string, attrNs?: string): string | null;
    getPropertyType?(tagName: string, property: string, elementNs?: string): string | null;
}

interface VSBloomWindowGlobals {
    extensionConfig: VSBloomClientConfig | undefined;
    client: VSBloomClient | undefined;

    SendLog: (level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown) => void;
}

//global state extensions for the client
declare global {
    interface Window {
        __VSBLOOM__: VSBloomWindowGlobals;
        trustedTypes?: TrustedTypePolicyFactory;
    }

    //also available as above global in window.trustedTypes
    const trustedTypes: TrustedTypePolicyFactory | undefined;
}

//actual client class object
class VSBloomClient {
    private ws: WebSocket | null = null;
    private reconnectAttempts = 0;
    private reconnectTimeout: number | null = null;
    private managedElements: Map<string, HTMLElement> = new Map();
    private windowId: string;
    private isConnected = false;
    private trustedPolicy: TrustedTypePolicy | null = null;

    constructor(
        private port: number,
        private authToken: string
    ) {
        this.windowId = this.GenerateWindowId();

        //create the trusted types policy we need to dynamically run
        //code in a way that satisfies the CSP directives in vsc's workbench.html
        this.trustedPolicy = this.CreateTrustedTypesPolicy();

        //once that's done, get our global API setup on the window object
        this.SetupGlobalAPI();
        
        //we're good to go pretty much, let's go ahead and try to connect
        //to the websocket server hosted by the extension
        this.ConnectToWebsocketServer();

        this.Log('info', 'VSBloom Client Bootstrap Complete:', { 
            windowId: this.windowId,
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
            this.Log('warn', 'Failed to create VSBloom\'s Trusted Types policy', { error: String(error) });
            return null;
        }
    }

    /**
     * Generates a new unique id for this client instance
     */
    private GenerateWindowId(): string {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substring(2, 8);
        
        return `BloomClient#${random}${timestamp}`;
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
                this.isConnected = true;
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
                this.isConnected = false;
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
                this.Log('error', 'An internal error occurred with the WebSocket', { error: String(error) });
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
            case 'replicate-content':
                if (message.contentType === 'js') {
                    this.CreateJSElement(message.id, message.payload);
                } else if (message.contentType === 'css') {
                    this.CreateCSSElement(message.id, message.payload);
                } else {
                    this.Log('warn', 'Received a request to replicate content of an unknown type', { request: message });
                }
                break;

            case 'remove':
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
            data
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
        const prefix = '[VSBloom]';
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
                    data,
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

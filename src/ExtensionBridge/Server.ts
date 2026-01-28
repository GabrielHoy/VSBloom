/**
 * VSBloom WebSocket Server
 * 
 * This server runs from within the VSC extension host and acts
 * as a "bridge" between the VSC extension and VSBloom Electron
 * client(s) running within the Electron Renderer windows
 * 
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { colorful, ConstructVSBloomLogPrefix, ConstructNonBrandedLogPrefix } from "../Debug/Colorful";
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'http';
import {
    ExtensionToClientMessage,
    ClientToExtensionMessage,
    VSBloomClientConfig,
    VSBloomConfigObject,
    VSBloomConfigValue,
    VSBLOOM_BRIDGE_PORT,
    PING_INTERVAL_MS,
    WS_CLOSE_CODES,
    LogMessage,
    WindowIdChangeMessage,
} from './Bridge';

interface ConnectedClient {
    ws: WebSocket;
    windowId: string;
    connectedAt: Date;
}

export class VSBloomBridgeServer implements vscode.Disposable {
    private wss: WebSocketServer | null = null;
    private clients: Map<string, ConnectedClient> = new Map();
    private authToken: string;
    private outputChannel: vscode.OutputChannel;
    private pingInterval: NodeJS.Timeout | null = null;
    private configChangeDisposable: vscode.Disposable | null = null;

    // Event emitter for when a client completes the connection handshake
    private readonly _onClientReady = new vscode.EventEmitter<string>();
    // Event emitter for when a client disconnects
    private readonly _onClientDisconnected = new vscode.EventEmitter<string>();

    /**
     * Event that fires when a client completes the connection handshake and is ready.
     * The event payload is the windowId of the connected client.
     * 
     * @example
     * bridge.onClientReady((windowId) => {
     *     console.log(`Client ready: ${windowId}`);
     *     effectManager.sendInitialPayload(windowId);
     * });
     */
    public readonly OnClientReady: vscode.Event<string> = this._onClientReady.event;

    /**
     * Event that fires when a client disconnects from the bridge.
     * The event payload is the windowId of the disconnected client.
     */
    public readonly OnClientDisconnected: vscode.Event<string> = this._onClientDisconnected.event;

    constructor(private context: vscode.ExtensionContext) {
        this.outputChannel = vscode.window.createOutputChannel('VSBloom: Extension Bridge');
        
        //retrieve or generate auth token
        const storedToken = context.globalState.get<string>('vsbloom.bridge.authToken');
        if (storedToken) {
            this.authToken = storedToken;
        } else {
            this.authToken = crypto.randomBytes(32).toString('hex');
            context.globalState.update('vsbloom.bridge.authToken', this.authToken);
        }
    }

    /**
     * Start the WebSocket server
     */
    public async Start(): Promise<void> {
        if (this.wss) {
            this.Log('warn', 'Bridge server already running');
            return;
        }

        return new Promise((resolve, reject) => {
            try {
                this.wss = new WebSocketServer({
                    port: VSBLOOM_BRIDGE_PORT,
                    host: '127.0.0.1',
                });

                this.wss.on('listening', () => {
                    this.Log('info', `Bridge server listening on ws://127.0.0.1:${VSBLOOM_BRIDGE_PORT}`);
                    this.DispatchKeepAlivePingDaemon();
                    this.SetupExtensionConfigChangedListener();
                    resolve();
                });

                this.wss.on('connection', (ws, req) => {
                    this.HandleNewClientWebSocketConnection(ws, req);
                });

                this.wss.on('error', (error: NodeJS.ErrnoException) => {
                    if (error.code === 'EADDRINUSE') {
                        this.Log('error', `Port ${VSBLOOM_BRIDGE_PORT} is already in use. Another VSCode window may be running VSBloom.`);
                        // This is not necessarily an error - another window may be hosting
                        resolve();
                    } else {
                        this.Log('error', `Bridge server error`, { error });
                        reject(error);
                    }
                });
            } catch (error) {
                reject(error);
            }
        });
    }

    /**
     * Stop the WebSocket server and clean up.
     */
    public Stop(): void {
        if (this.pingInterval) {
            clearInterval(this.pingInterval);
            this.pingInterval = null;
        }

        if (this.configChangeDisposable) {
            this.configChangeDisposable.dispose();
            this.configChangeDisposable = null;
        }

        // Close all client connections
        for (const client of this.clients.values()) {
            client.ws.close(WS_CLOSE_CODES.GOING_AWAY, 'Server shutting down');
        }
        this.clients.clear();

        if (this.wss) {
            this.wss.close();
            this.wss = null;
            this.Log('info', 'Bridge server stopped');
        }
    }

    /**
     * Get the port for which the server is running on.
     */
    public GetServerPort(): number {
        return VSBLOOM_BRIDGE_PORT;
    }

    /**
     * Get the auth token for client connections.
     */
    public GetAuthToken(): string {
        return this.authToken;
    }

    /**
     * Check if the server is running.
     */
    public IsRunning(): boolean {
        return this.wss !== null;
    }

    /**
     * Get the number of connected clients.
     */
    public GetClientCount(): number {
        return this.clients.size;
    }

    /**
     * Broadcast a message to all connected clients.
     */
    public FireAllClients(message: ExtensionToClientMessage): void {
        if (this.clients.size === 0) {
            this.Log('debug', `FireAllClients called with a message of type "${message.type}" but no clients connected; dropping message`, { message });
            return;
        }

        if (message.type !== 'are-u-alive') {
            this.Log('debug', `Broadcasting message`, { message });
        }
        const data = JSON.stringify(message);
        for (const client of this.clients.values()) {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.send(data);
            }
        }
    }

    /**
     * Send a message to a specific client by window ID.
     */
    public FireClient(windowId: string, message: ExtensionToClientMessage): boolean {
        const client = this.clients.get(windowId);
        if (client && client.ws.readyState === WebSocket.OPEN) {
            client.ws.send(JSON.stringify(message));
            return true;
        }

        return false;
    }

    /**
     * Broadcast the current configuration to all clients.
     */
    public ReplicateExtensionConfigToAllClients(): void {
        const config = this.GetCurrentExtensionConfig();
        this.FireAllClients({
            type: 'replicate-extension-config',
            settings: config,
        });
        this.Log('debug', 'Broadcasted config update to all clients');
    }

    /**
     * Get the current VSBloom configuration dynamically.
     * This extracts all vsbloom.* settings without needing to manually
     * specify each one, making it self-maintaining as new settings are added.
     */
    public GetCurrentExtensionConfig(): VSBloomClientConfig {
        const rawConfig = vscode.workspace.getConfiguration().get('vsbloom');
        
        if (!rawConfig || typeof rawConfig !== 'object') {
            return {};
        }

        // Recursively extract the configuration, filtering out non-serializable values
        return this.ExtractExtensionConfigObject(rawConfig as Record<string, unknown>);
    }

    /**
     * Check if a value is a plain object (not an array, null, or other object type).
     */
    private IsPlainJSObject(val: unknown): val is Record<string, unknown> {
        return typeof val === 'object' && val !== null && !Array.isArray(val);
    }

    /**
     * Check if a value is a valid config primitive that can be serialized.
     */
    private IsSerializableConfigPrimitive(val: unknown): val is VSBloomConfigValue {
        const type = typeof val;
        return type === 'string' || type === 'number' || type === 'boolean' || val === null || val === undefined;
    }

    /**
     * Recursively extract configuration values from an object.
     * Filters out functions, symbols, and other non-serializable values.
     */
    private ExtractExtensionConfigObject(obj: Record<string, unknown>): VSBloomConfigObject {
        const result: VSBloomConfigObject = {};

        for (const key of Object.keys(obj)) {
            const value = obj[key];

            if (this.IsPlainJSObject(value)) {
                // Recursively extract nested objects
                result[key] = this.ExtractExtensionConfigObject(value);
            } else if (this.IsSerializableConfigPrimitive(value)) {
                // Include primitive values directly
                result[key] = value;
            } else if (Array.isArray(value)) {
                // Convert arrays to JSON string for simplicity
                // (arrays of primitives are rare in VSCode config but possible)
                result[key] = JSON.stringify(value);
            }
            // Skip functions, symbols, and other non-serializable types
        }

        return result;
    }

    /**
     * Processes a new client attempting to connect to the server
     * and validates their authentication token
     */
    private HandleNewClientWebSocketConnection(ws: WebSocket, req: IncomingMessage): void {
        // Validate auth token from query string
        const url = new URL(req.url || '', `http://127.0.0.1:${VSBLOOM_BRIDGE_PORT}`);
        const token = url.searchParams.get('token');

        if (token !== this.authToken) {
            this.Log('error', 'A connection attempt was rejected due to having an invalid auth token');
            ws.close(WS_CLOSE_CODES.UNAUTHORIZED, 'Unauthorized');
            return;
        }

        this.Log('info', 'Connection authenticated with a client; awaiting ready handshake');

        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString()) as ClientToExtensionMessage;
                try {
                    this.ProcessClientMessage(ws, message);
                } catch (err) {
                    this.Log('error', `An error occurred handling a parsed client message: ${err}`);
                }
            } catch (err) {
                this.Log('error', `An error occurred attempting to parse a client's message as JSON: ${err}`);
                ws.close(WS_CLOSE_CODES.INVALID_MESSAGE, 'Invalid message format');
            }
        });

        ws.on('close', (code, reason) => {
            //find and remove the client from our internal list of connected clients
            for (const [windowId, client] of this.clients.entries()) {
                if (client.ws === ws) {
                    this.clients.delete(windowId);
                    this.Log('info', `Client disconnected: ${windowId} (code: ${code})`);
                    //fire the onClientDisconnected event so external code
                    //can react accordingly
                    this._onClientDisconnected.fire(windowId);
                    break;
                }
            }
        });

        ws.on('error', (error) => {
            this.Log('error', `A WebSocket error occurred with a client: ${error.message}`);
        });
    }

    /**
     * Processes a message from a client, delegating it to the appropriate handler
     * function defined below in the class
     */
    private ProcessClientMessage(ws: WebSocket, message: ClientToExtensionMessage): void {
        switch (message.type) {
            case 'client-ready':
                this.ClientReadyMessageReceived(ws, message.windowId);
                break;

            case 'i-am-alive':
                break;

            case 'replicate-log':
                this.ReplicateLogMessageFromClient(message);
                break;

            case 'change-window-id':
                this.ChangeClientWindowId(ws, message.newWindowId);
                break;

            default:
                this.Log('error', `Unknown message type received`);
        }
    }

    /**
     * Handles a client's ready message, registering them and sending
     * them their initial configuration etc
     */
    private ClientReadyMessageReceived(ws: WebSocket, windowId: string): void {
        //check if this windowId already exists,
        //if it does the client is likely attempting
        //to reconnect to the server for some reason
        const existing = this.clients.get(windowId);
        if (existing) {
            existing.ws.close(WS_CLOSE_CODES.GOING_AWAY, 'Replaced by new connection');
        }

        this.clients.set(windowId, {
            ws,
            windowId,
            connectedAt: new Date(),
        });

        this.Log('info', `Registered new window client as ready with window ID "${windowId}" (${this.clients.size} total clients)`);

        //send the current extension configuration over
        //to this client so they're synchronized appropriately
        const config = this.GetCurrentExtensionConfig();
        ws.send(JSON.stringify({
            type: 'replicate-extension-config',
            settings: config,
        } as ExtensionToClientMessage));

        //fire the onClientReady event so external code can react
        //to the client being ready etc and do whatever they need
        //to do accordingly
        this._onClientReady.fire(windowId);
    }

    private ChangeClientWindowId(ws: WebSocket, newWindowId: string): void {
        for (const [windowId, client] of this.clients.entries()) {
            if (client.ws === ws) {
                this.clients.delete(windowId);
                this.clients.set(newWindowId, {
                    ws,
                    windowId: newWindowId,
                    connectedAt: new Date(),
                });
                this.Log('debug', `A client is changing their window ID from "${windowId}" to "${newWindowId}"`);
                break;
            }
        }
    }

    /**
     * Handles log messages from clients
     */
    private ReplicateLogMessageFromClient(message: LogMessage): void {
        const prefix = `[Client/${message.level.toUpperCase()}]: `;
        const logLine = message.data 
            ? `${prefix}${message.message} ${JSON.stringify(message.data)}`
            : `${prefix}${message.message}`;

        this.outputChannel.appendLine(logLine);

        const hasDataAssociatedWithLog = message.data ?? false;
        let dataObject: unknown = null;
        if (hasDataAssociatedWithLog) {
            try {
                dataObject = JSON.parse(message.data as string);
            } catch (err) {
                dataObject = null;
            }
        }

        if (hasDataAssociatedWithLog) {
            console.log(`${ConstructVSBloomLogPrefix("Client", message.level)}${message.message}`, dataObject ?? "(Data was supplied but was invalid JSON)");
        } else {
            console.log(`${ConstructVSBloomLogPrefix("Client", message.level)}${message.message}`);
        }
    }

    /**
     * Spins off a daemon thread that periodically pings all clients to keep their connections alive
     */
    private DispatchKeepAlivePingDaemon(): void {
        this.pingInterval = setInterval(() => {
            this.FireAllClients({ type: 'are-u-alive' });
        }, PING_INTERVAL_MS);
    }

    /**
     * Sets up a configuration change listener so that
     * we can appropriately react to and replicate any
     * changes to the extension's configuration that
     * the user makes inside of the VSC application.
     */
    private SetupExtensionConfigChangedListener(): void {
        this.configChangeDisposable = vscode.workspace.onDidChangeConfiguration((e) => {
            if (e.affectsConfiguration('vsbloom')) {
                this.ReplicateExtensionConfigToAllClients();
            }
        });
    }

    /**
     * Logs a server message to the output channel.
     */
    private Log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
        this.outputChannel.appendLine(`[Server/${level.toUpperCase()}]: ${message} ${data ? JSON.stringify(data) : ''}`);
        console.log(`${ConstructVSBloomLogPrefix("Server", level)}${message}`, data ?? '');
        // console.log(`[${colorful.cyanBright(`VSBloom`)}/${colorful.cyanBright("Server")}]: ${message}`);
    }

    /**
     * Dispose of the bridge; called when the extension is deactivated
     */
    public dispose(): void {
        this.Stop();
        this._onClientReady.dispose();
        this._onClientDisconnected.dispose();
        this.outputChannel.dispose();
    }
}

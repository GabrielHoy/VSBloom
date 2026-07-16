/**
 * VSBloom WebSocket Server
 *
 * This server runs from within the VSC extension host and acts
 * as a "bridge" between the VSC extension and VSBloom Electron
 * client(s) running within the Electron Renderer windows
 *
 */

import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { WebSocket, WebSocketServer } from 'ws';
import { ConstructVSBloomLogPrefix } from '../../Debug/Colorful';
import { EffectManager } from '../../Effects/EffectManager';
import { IsDevelopmentEnvironment } from '../../Extension/ExtensionReflection';
import { MainOutputChannel } from '../../Extension/MainOutputChannel';
import { VSBloomNativeRuntimeManager } from '../../Native/NativeRuntimeManager';
import {
	type ClientToExtensionMessage,
	DEFAULT_BRIDGE_PORT,
	type ExtensionToClientMessage,
	type LogMessage,
	PING_INTERVAL_MS,
	type PseudoServerMarshalledMessage,
	type PseudoServerMarshalledMessageDecodedData,
	type PseudoServerMarshalledMessageEventPayload,
	PseudoServerRequestSharedStateSnapshotMessage,
	type PseudoServerToExtensionMessage,
	RequestSharedStateSnapshotMessage,
	type ServerToPseudoServerMessage,
	type VSBloomClientConfig,
	type VSBloomConfigObject,
	type VSBloomConfigValue,
	WS_CLOSE_CODES,
} from '../API';
import type { VSBloomBridgeServerContract } from './BloomServerContract';
import {
	MAX_PSEUDO_SERVER_IDENTIFIER_LENGTH,
	MAX_PSEUDO_SERVER_PAYLOAD_SIZE_BYTES,
} from './PseudoServer';
import { StatefulVSCodeContext } from './StatefulContext';
import { SynchronizedState, SyncPayload } from '../SynchronizedState';
import { defaultVSBloomSharedState, VSBloomSharedState } from '../SharedState';
import { MenuPanel } from '../../Extension/WebviewMenuPanel';
import Janitor from '../../EffectLib/Bloom/Janitors';

interface ConnectedClient {
	ws: WebSocket;
	windowId: string;
	connectedAt: Date;
}

interface ConnectedPseudoServer {
	ws: WebSocket;
	identifier: string;
	connectedAt: Date;
}

/**
 * A Static/Singleton class that manages the WebSocket server for the VSBloom extension.
 */
export class VSBloomBridgeServer implements VSBloomBridgeServerContract {
	private static instance: VSBloomBridgeServer | null = null;

	private wss: WebSocketServer | null = null;
	private clients: Map<string, ConnectedClient> = new Map();
	private pseudoServers: Map<string, ConnectedPseudoServer> = new Map();
	private pingInterval: NodeJS.Timeout | null = null;
    // Janitor for the lifetime of a single Bridge Server instance upon Start()'ing,
    // lasting until it gets `Stop()`'d by VSCode deactivating the extension
    private serverJanitor: Janitor = new Janitor();
    // Janitor for the entire lifetime of the class, until it gets `dispose()`'d by VSCode deactivating the extension
	private configChangeDisposable: vscode.Disposable | null = null;
    private extensionDisposalJanitor: Janitor;
	protected authToken: string;

	/**
	 *   Private Event Emitters
	 */

	// Event emitter for when a client completes the connection handshake
	private readonly _onClientReady = new vscode.EventEmitter<string>();
	// Event emitter for when a client disconnects
	private readonly _onClientDisconnected = new vscode.EventEmitter<string>();
	// Event emitter for when a pseudo-server completes the connection handshake
	private readonly _onPseudoServerReady = new vscode.EventEmitter<string>();
	// Event emitter for when a pseudo-server disconnects
	private readonly _onPseudoServerDisconnected = new vscode.EventEmitter<string>();
	// Event emitter for when a pseudo-server receives a marshalled message
	private readonly _onPseudoServerMarshalledMessage =
		new vscode.EventEmitter<PseudoServerMarshalledMessageEventPayload>();
	// Event emitter for when the server disconnects
    // TODO: Look into this event when time permits, doesn't seem like it's actually being fired anywhere
	private readonly _onServerDisconnected = new vscode.EventEmitter<void>();

	public static outputChannel: vscode.OutputChannel | null = null;
	public static isServerListening: boolean = false;

	/**
	 *   Stateful Contexts
	 */

	public static readonly anyBridgeServerRunningCtx = new StatefulVSCodeContext(
		'vsbloom.bridgeServer.isRunningAnywhere',
		(ctxSet: Set<string>) => ctxSet.size > 0,
	);

	public static readonly pseudoServerCountCtx = new StatefulVSCodeContext(
		'vsbloom.bridgeServer.connectedPseudoServers',
		(ctxSet: Set<string>) => ctxSet.size,
	);

	/**
	 *   Public Event Emitters
	 */

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
	 * Event that fires when a pseudo-server completes the connection handshake.
	 * The event payload is the identifier of the connected pseudo-server.
	 */
	public readonly OnPseudoServerReady: vscode.Event<string> = this._onPseudoServerReady.event;

	/**
	 * Event that fires when a pseudo-server disconnects from the bridge.
	 * The event payload is the identifier of the disconnected pseudo-server.
	 */
	public readonly OnPseudoServerDisconnected: vscode.Event<string> =
		this._onPseudoServerDisconnected.event;

	/**
	 * Event that fires when a pseudo-server receives a marshalled message.
	 * The event payload is the marshalled message received from the pseudo-server.
	 */
	public readonly OnPseudoServerMarshalledMessage: vscode.Event<PseudoServerMarshalledMessageEventPayload> =
		this._onPseudoServerMarshalledMessage.event;

	/**
	 * Event that fires when a client disconnects from the bridge.
	 * The event payload is the windowId of the disconnected client.
	 */
	public readonly OnClientDisconnected: vscode.Event<string> = this._onClientDisconnected.event;

	/**
	 * Event that fires when the main VSBloom Bridge Server disconnects.
	 */
	public readonly OnServerDisconnected: vscode.Event<void> = this._onServerDisconnected.event;

    /**
     * Globally Synchronized State
     */
    public readonly sharedState: SynchronizedState<VSBloomSharedState> = new SynchronizedState(defaultVSBloomSharedState, this.ReplicateSharedStatePayload.bind(this));

	/**
	 *   Methods
	 */

	private constructor(private context: vscode.ExtensionContext) {
		//retrieve or generate auth token
		const storedToken = context.globalState.get<string>('vsbloom.bridge.authToken');
		if (storedToken) {
			this.authToken = storedToken;
		} else {
			this.authToken = crypto.randomBytes(32).toString('hex');
			context.globalState.update('vsbloom.bridge.authToken', this.authToken);
		}
        
        this.extensionDisposalJanitor = new Janitor();
        this.extensionDisposalJanitor.Add(() => {
            // Dispose of all our event emitters when the bridge server is stopped
            this._onClientReady.dispose();
            this._onClientDisconnected.dispose();
            this._onPseudoServerReady.dispose();
            this._onPseudoServerDisconnected.dispose();
            this._onPseudoServerMarshalledMessage.dispose();
            this._onServerDisconnected.dispose();
        });
        
	}

	public static GetInstance(context: vscode.ExtensionContext): VSBloomBridgeServer {
		if (!VSBloomBridgeServer.instance) {
			VSBloomBridgeServer.instance = new VSBloomBridgeServer(context);
		}
		return VSBloomBridgeServer.instance;
	}

    /**
     * Handles replicating general payloads across the various
     * transport boundaries of VSBloom, representing either
     * complete synchronizations or partial updates of the shared
     * state.
     */
    private ReplicateSharedStatePayload(payload: SyncPayload<VSBloomSharedState>) {
        //Replicate to all connected Clients
        this.FireAllClients({
            type: 'replicate-shared-state',
            data: payload,
        });

        //Replicate to all connected Pseudo-Servers
        this.FireAllPseudoServers({
            type: 'replicate-shared-state',
            data: payload,
        });

        //Replicate to the Svelte Webview if it currently exists
        MenuPanel.currentPanel?.PostToSvelte({
            type: 'replicate-shared-state',
            data: payload,
        });
    }

	private static SetServerListeningState(isNowListening: boolean): void {
		VSBloomBridgeServer.isServerListening = isNowListening;

		vscode.commands.executeCommand(
			'setContext',
			'vsbloom.bridgeServer.isRunningOnThisWindow',
			isNowListening,
		);

		VSBloomBridgeServer.anyBridgeServerRunningCtx.AssignSetPresence(
			'WindowIsMainBridgeServer',
			isNowListening,
		);
	}

	private static SetBridgeOutputChannelPresent(shouldBePresent: boolean): void {
		if (shouldBePresent) {
			if (VSBloomBridgeServer.outputChannel) {
				return;
			}
			VSBloomBridgeServer.outputChannel = vscode.window.createOutputChannel(
				'VSBloom: Extension Bridge',
			);
		} else {
			if (!IsDevelopmentEnvironment()) {
				VSBloomBridgeServer.outputChannel?.dispose();
				VSBloomBridgeServer.outputChannel = null;
			}
		}
	}

    private SetupNativeRuntimeEventListeners(): void {
        const nativeRuntime = VSBloomNativeRuntimeManager.GetInstance();

        // Update the shared state whenever the native runtime gives us
        // a new list of available audio devices
        const audioDeviceUpdateDisposable = nativeRuntime.receivableMessageEvents['available-audio-device-list']((newAvailableDevices) => {
            this.sharedState.state.audio.availableDevices = newAvailableDevices;
            this.sharedState.Commit();
        });
        this.serverJanitor.Add(() => audioDeviceUpdateDisposable.dispose());
    }

	/**
	 * Start the WebSocket server
	 */
	public async Start(): Promise<void> {
		if (this.wss) {
			MainOutputChannel.Log('error', 'Bridge server already running');
			return;
		}

		return new Promise((resolve, reject) => {
			try {
				this.wss = new WebSocketServer({
					port: this.GetServerPort(),
					host: '127.0.0.1',
				});

				this.wss.on('listening', () => {
					VSBloomBridgeServer.SetBridgeOutputChannelPresent(true);
					VSBloomBridgeServer.outputChannel?.appendLine(
						`The Extension Bridge Server has started successfully!`,
					);

					this.Log(
						'info',
						`Bridge server listening on ws://127.0.0.1:${this.GetServerPort()}`,
					);
					this.DispatchKeepAlivePingDaemon();
					this.SetupExtensionConfigChangedListener();
                    this.SetupNativeRuntimeEventListeners();
					VSBloomBridgeServer.SetServerListeningState(true);

					resolve();
				});

				this.wss.on('connection', (ws, req) => {
					const url = new URL(req.url || '', `http://127.0.0.1:${this.GetServerPort()}`);
					const connectionType = url.searchParams.get('type') ?? 'client';
					const token = url.searchParams.get('token');

					if (connectionType !== 'client' && connectionType !== 'pseudo-server') {
						this.Log(
							'error',
							'A connection attempt was rejected due to having an invalid connection type.',
						);
						ws.close(WS_CLOSE_CODES.UNAUTHORIZED, 'Unauthorized');
						return;
					}

					// Validate auth token from query string
					if (token !== this.authToken) {
						this.Log(
							'error',
							'A connection attempt was rejected due to having an invalid auth token',
						);
						ws.close(WS_CLOSE_CODES.UNAUTHORIZED, 'Unauthorized');
						return;
					}

					if (connectionType === 'client') {
						this.HandleNewClientWebSocketConnection(ws, url);
					} else if (connectionType === 'pseudo-server') {
						this.HandleNewPseudoServerConnection(ws, url);
					}
				});

				this.wss.on('error', (error: NodeJS.ErrnoException) => {
					if (error.code === 'EADDRINUSE') {
						this.Log(
							'warn',
							`Port ${this.GetServerPort()} is already in use. Another VSCode window may be running VSBloom.`,
						);
						// This is not necessarily an error - another window may be hosting
						VSBloomBridgeServer.SetServerListeningState(false);

						VSBloomBridgeServer.SetBridgeOutputChannelPresent(false);

						resolve();
					} else {
						MainOutputChannel.Log('error', `Unexpected bridge server error`, { error });
						reject(error);
					}
				});
			} catch (error) {
				VSBloomBridgeServer.SetBridgeOutputChannelPresent(false);

				reject(error);
			}
		});
	}

	/**
	 * Stop the WebSocket server and clean up.
	 */
	public async Stop(): Promise<void> {
		if (this.pingInterval) {
			clearInterval(this.pingInterval);
			this.pingInterval = null;
		}

        void this.serverJanitor.CleanAll().catch((err) => {
            MainOutputChannel.Log("error", "An error occurred while cleaning up a Bridge Server's server-lifetime janitor", { error: err });
        });

		if (this.configChangeDisposable) {
			this.configChangeDisposable.dispose();
			this.configChangeDisposable = null;
		}

		if (VSBloomBridgeServer.isServerListening) {
			const effectManager = EffectManager.GetInstance();
			await effectManager.Stop();
		}

		VSBloomBridgeServer.SetServerListeningState(false);

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

		VSBloomBridgeServer.SetBridgeOutputChannelPresent(false);
	}

	/**
	 * Get the port for which the server is running on.
	 */
	public GetServerPort(): number {
		return this.context.globalState.get<number>(
			'vsbloom.electronBridge.currentClientBridgePort',
			DEFAULT_BRIDGE_PORT,
		);
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
			return;
		}

		const data = JSON.stringify(message);
		for (const client of this.clients.values()) {
			if (client.ws.readyState === WebSocket.OPEN) {
				client.ws.send(data);
			}
		}
	}

	/**
	 * Broadcast a message to all connected Pseudo-Servers.
	 *
	 * See PseudoServer.ts for more information on these!
	 */
	public FireAllPseudoServers(message: ServerToPseudoServerMessage): void {
		if (this.pseudoServers.size === 0) {
			return;
		}

		const data = JSON.stringify(message);
		for (const pseudoServer of this.pseudoServers.values()) {
			if (pseudoServer.ws.readyState === WebSocket.OPEN) {
				pseudoServer.ws.send(data);
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
	 * Send a message to a specific pseudo-server via its UUID.
	 */
	public FirePseudoServer(identifier: string, message: ServerToPseudoServerMessage): void {
		const pseudoServer = this.pseudoServers.get(identifier);
		if (pseudoServer && pseudoServer.ws.readyState === WebSocket.OPEN) {
			pseudoServer.ws.send(JSON.stringify(message));
		}
	}

	/**
	 * Query how many pseudo-servers are connected to the bridge server
	 * right now.
	 */
	public GetConnectedPseudoServerCount(): number {
		return this.pseudoServers.size;
	}

	/**
	 * Broadcasts the native runtime running state to all connected pseudo-servers so they can
	 * update their local `vsbloom.nativeRuntime.isRunning` context and prevent double-start races.
	 */
	public BroadcastNativeRuntimeStateToPseudoServers(isRunning: boolean): void {
		const data = JSON.stringify({
			type: 'native-runtime-state',
			isRunning,
		} as ServerToPseudoServerMessage);
		for (const pseudoServer of this.pseudoServers.values()) {
			if (pseudoServer.ws.readyState === WebSocket.OPEN) {
				pseudoServer.ws.send(data);
			}
		}
	}

	/**
	 * Broadcast the current configuration to all clients.
	 */
	public ReplicateExtensionConfigToAllClients(): void {
		const config = VSBloomBridgeServer.GetCurrentExtensionConfig();
		this.FireAllClients({
			type: 'replicate-extension-config',
			settings: config,
		});
	}

	/**
	 * Get the current VSBloom configuration dynamically.
	 * This extracts all vsbloom.* settings without needing to manually
	 * specify each one, making it self-maintaining as new settings are added.
	 */
	public static GetCurrentExtensionConfig(): VSBloomClientConfig {
		const rawConfig = vscode.workspace.getConfiguration().get('vsbloom');

		if (!rawConfig || typeof rawConfig !== 'object') {
			return {};
		}

		// Recursively extract the configuration, filtering out non-serializable values
		return VSBloomBridgeServer.ExtractExtensionConfigObject(
			rawConfig as Record<string, unknown>,
		);
	}

	/**
	 * Check if a value is a plain object (not an array, null, or other object type).
	 */
	private static IsPlainJSObject(val: unknown): val is Record<string, unknown> {
		return typeof val === 'object' && val !== null && !Array.isArray(val);
	}

	/**
	 * Check if a value is a valid config primitive that can be serialized.
	 */
	private static IsSerializableConfigPrimitive(val: unknown): val is VSBloomConfigValue {
		const type = typeof val;
		return (
			type === 'string' ||
			type === 'number' ||
			type === 'boolean' ||
			val === null ||
			val === undefined
		);
	}

	/**
	 * Recursively extract configuration values from an object.
	 * Filters out functions, symbols, and other non-serializable values.
	 */
	private static ExtractExtensionConfigObject(obj: Record<string, unknown>): VSBloomConfigObject {
		const result: VSBloomConfigObject = {};

		for (const key of Object.keys(obj)) {
			const value = obj[key];

			if (VSBloomBridgeServer.IsPlainJSObject(value)) {
				// Recursively extract nested objects
				result[key] = VSBloomBridgeServer.ExtractExtensionConfigObject(value);
			} else if (VSBloomBridgeServer.IsSerializableConfigPrimitive(value)) {
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

	private HandleNewPseudoServerConnection(ws: WebSocket, _url: URL): void {
		this.Log('info', 'Connection authenticated with a pseudo-server; awaiting ready handshake');

		ws.on('message', (data) => {
			try {
				const message = JSON.parse(data.toString()) as PseudoServerToExtensionMessage;
				try {
					this.ProcessPseudoServerMessage(ws, message);
				} catch (err) {
					this.Log(
						'error',
						`An error occurred handling a parsed pseudo-server message: ${err}`,
					);
				}
			} catch (err) {
				this.Log(
					'error',
					`An error occurred attempting to parse a pseudo-server's message as JSON: ${err}`,
				);
				ws.close(WS_CLOSE_CODES.INVALID_MESSAGE, 'Invalid message format');
			}
		});

		ws.on('close', (code, _reason) => {
			//find and remove the pseudo-server from our internal list of connected pseudo-servers
			for (const [identifier, client] of this.pseudoServers.entries()) {
				if (client.ws === ws) {
					this._onPseudoServerDisconnected.fire(identifier);
					VSBloomBridgeServer.pseudoServerCountCtx.Remove(identifier);
					this.pseudoServers.delete(identifier);
					this.Log('info', `Pseudo-Server disconnected: ${identifier} (code: ${code})`, {
						identifier,
					});

					break;
				}
			}
		});

		ws.on('error', (error) => {
			this.Log('error', `A WebSocket error occurred with a pseudo-server: ${error.message}`);
		});
	}

	private ProcessPseudoServerMessage(
		ws: WebSocket,
		message: PseudoServerToExtensionMessage,
	): void {
		switch (message.type) {
			case 'i-am-alive':
				break;
			case 'pseudo-server-ready':
				this.PseudoServerReadyMessageReceived(ws, message.identifier);
				break;
			case 'marshalled-message':
				this.PseudoServerMarshalledMessageReceived(ws, message);
				break;
			case 'request-shared-state-snapshot':
				this.PseudoServerSharedStateSnapshotRequestReceived(ws, message);
				break;
		}
	}

	/**
	 * Handles a pseudo-server's ready message, registering them accordingly
	 */
	private PseudoServerReadyMessageReceived(ws: WebSocket, identifier: string): void {
		//check if this identifier already exists,
		//if it does the pseudo-server is likely attempting
		//to reconnect to the server for some reason
		const existing = this.pseudoServers.get(identifier);
		if (existing) {
			existing.ws.close(WS_CLOSE_CODES.GOING_AWAY, 'Replaced by new connection');
		}

		this.pseudoServers.set(identifier, {
			ws,
			identifier,
			connectedAt: new Date(),
		});

		this._onPseudoServerReady.fire(identifier);
		VSBloomBridgeServer.pseudoServerCountCtx.Add(identifier);

        // Send a full snapshot of the current shared state to the pseudo-server
        // upon them connecting to us
        this.SendSharedStateSnapshotToPseudoServer(identifier);

		this.Log(
			'info',
			`Registered new pseudo-server as ready with identifier "${identifier}" (${this.pseudoServers.size} total pseudo-servers)`,
		);
	}

	/**
	 * Handles a pseudo-server's marshalled message, parsing it and
	 * forwarding it to the appropriate handler
	 */
	private PseudoServerMarshalledMessageReceived(
		ws: WebSocket,
		message: PseudoServerMarshalledMessage,
	): void {
		if (typeof message.data !== 'string') {
			this.Log(
				'error',
				'A pseudo-server marshalled message was received with a data property that was not a string',
			);
			return;
		}
		//1MB max message size
		if (message.data.length > MAX_PSEUDO_SERVER_PAYLOAD_SIZE_BYTES) {
			this.Log(
				'error',
				'A pseudo-server marshalled message was received with a data property that was too large',
			);
			return;
		}

		const pseudoServerIdentifier: unknown = typeof message.id === 'string' ? message.id : null;
		if (typeof pseudoServerIdentifier !== 'string') {
			this.Log(
				'error',
				'A pseudo-server marshalled message was received with an id property that was not a string',
			);
			return;
		}
		if (pseudoServerIdentifier.length > MAX_PSEUDO_SERVER_IDENTIFIER_LENGTH) {
			this.Log(
				'error',
				'A pseudo-server marshalled message was received with an id property that was too long',
			);
			return;
		}

		const registeredPseudoServer = this.pseudoServers.get(pseudoServerIdentifier);
		if (!registeredPseudoServer) {
			this.Log(
				'error',
				'A pseudo-server marshalled message was received from a pseudo-server that was not registered with the bridge server',
			);
			return;
		}
		if (registeredPseudoServer.ws !== ws) {
			this.Log(
				'error',
				'A pseudo-server marshalled message was received from a pseudo-server, but it sent an ID corresponding to a different pseudo-server: This is likely an attempt at impersonation.',
			);
			return;
		}

		try {
			const parsedMarshalledMessageData = JSON.parse(
				message.data,
			) as PseudoServerMarshalledMessageDecodedData;
			if (typeof parsedMarshalledMessageData.type !== 'string') {
				this.Log(
					'error',
					'A pseudo-server marshalled message was received with a data property that was not a string',
				);
				return;
			}

			this._onPseudoServerMarshalledMessage.fire({
				originServerID: pseudoServerIdentifier,
				payload: parsedMarshalledMessageData,
			});
		} catch {
			this.Log(
				'error',
				'A pseudo-server marshalled message was received with a data property that was not valid JSON',
			);
			return;
		}
	}

    private SendSharedStateSnapshotToPseudoServer(pseudoServerID: string): void {
        this.FirePseudoServer(pseudoServerID, {
            type: 'replicate-shared-state',
            data: this.sharedState.Snapshot()
        });
    }

    private SendSharedStateSnapshotToClient(windowId: string): void {
        this.FireClient(windowId, {
            type: 'replicate-shared-state',
            data: this.sharedState.Snapshot()
        });
    }

    protected ClientSharedStateSnapshotRequestReceived(message: RequestSharedStateSnapshotMessage): void {
        if (typeof message.windowId !== 'string') {
            this.Log(
                'error',
                'A client snapshot request was received with a windowId property that was not a string',
            );
            return;
        }
        if (message.windowId.length > 2048) {
            this.Log(
                'error',
                'A client snapshot request was received with a windowId property that was too long',
            );
            return;
        }

        this.SendSharedStateSnapshotToClient(message.windowId);
	}
    
    private PseudoServerSharedStateSnapshotRequestReceived(ws: WebSocket, message: PseudoServerRequestSharedStateSnapshotMessage): void {
        //Sanity checks...
        const pseudoServerIdentifier: unknown = typeof message.id === 'string' ? message.id : null;
		if (typeof pseudoServerIdentifier !== 'string') {
			this.Log(
				'error',
				'A pseudo-server snapshot request was received with an id property that was not a string',
			);
			return;
		}
		if (pseudoServerIdentifier.length > MAX_PSEUDO_SERVER_IDENTIFIER_LENGTH) {
			this.Log(
				'error',
				'A pseudo-server snapshot request was received with an id property that was too long',
			);
			return;
		}

		const registeredPseudoServer = this.pseudoServers.get(pseudoServerIdentifier);
		if (!registeredPseudoServer) {
			this.Log(
				'error',
				'A pseudo-server snapshot request was received from a pseudo-server that was not registered with the bridge server',
			);
			return;
		}
		if (registeredPseudoServer.ws !== ws) {
			this.Log(
				'error',
				'A pseudo-server snapshot request was received from a pseudo-server, but it sent an ID corresponding to a different pseudo-server: This is likely an attempt at impersonation.',
			);
			return;
		}

        //Send a full snapshot of the current shared state to the pseudo-server
        this.SendSharedStateSnapshotToPseudoServer(pseudoServerIdentifier);
    }

	/**
	 * Processes a new client attempting to connect to the server
	 * and validates their authentication token
	 */
	private HandleNewClientWebSocketConnection(ws: WebSocket, _url: URL): void {
		ws.on('message', (data) => {
			try {
				const message = JSON.parse(data.toString()) as ClientToExtensionMessage;
				try {
					this.ProcessClientMessage(ws, message);
				} catch (err) {
					this.Log('error', `An error occurred handling a parsed client message: ${err}`);
				}
			} catch (err) {
				this.Log(
					'error',
					`An error occurred attempting to parse a client's message as JSON: ${err}`,
				);
				ws.close(WS_CLOSE_CODES.INVALID_MESSAGE, 'Invalid message format');
			}
		});

		ws.on('close', (code, _reason) => {
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
            case 'request-shared-state-snapshot':
                this.ClientSharedStateSnapshotRequestReceived(message);
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

		this.Log(
			'info',
			`Registered new ready window client with window ID "${windowId}" (${this.clients.size} total client${this.clients.size > 1 ? "s" : ""})`,
		);

		//send the current extension configuration over
		//to this client so they're synchronized appropriately
		const config = VSBloomBridgeServer.GetCurrentExtensionConfig();
		ws.send(
			JSON.stringify({
				type: 'replicate-extension-config',
				settings: config,
			} as ExtensionToClientMessage),
		);

        // Send a full snapshot of the current shared state to the client
        // upon them connecting to us
        this.SendSharedStateSnapshotToClient(windowId);

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
				break;
			}
		}
	}

	/**
	 * Handles log messages from clients
	 */
	protected ReplicateLogMessageFromClient(message: LogMessage): void {
		const prefix = `[Client/${message.level.toUpperCase()}]: `;
		const logLine = message.data
			? `${prefix}${message.message} ${JSON.stringify(message.data)}`
			: `${prefix}${message.message}`;

		VSBloomBridgeServer.outputChannel?.appendLine(logLine);

		const hasDataAssociatedWithLog = message.data ?? false;
		let dataObject: unknown = null;
		if (hasDataAssociatedWithLog) {
			try {
				dataObject = JSON.parse(message.data as string);
			} catch (_err) {
				dataObject = null;
			}
		}

		if (hasDataAssociatedWithLog) {
			console.log(
				`${ConstructVSBloomLogPrefix('Client', message.level)}${message.message}`,
				dataObject ?? '(Data was supplied but was invalid JSON)',
			);
		} else {
			console.log(`${ConstructVSBloomLogPrefix('Client', message.level)}${message.message}`);
		}

		this.FireAllPseudoServers({
			type: 'replicate-log',
			level: message.level,
			message: message.message,
			data: dataObject,
		} as ServerToPseudoServerMessage);
	}

	/**
	 * Spins off a daemon thread that periodically pings all clients to keep their connections alive
	 */
	private DispatchKeepAlivePingDaemon(): void {
		this.pingInterval = setInterval(() => {
			this.FireAllClients({ type: 'are-u-alive' });
		}, PING_INTERVAL_MS);

		//now for pseudo-servers
		const data = JSON.stringify({ type: 'are-u-alive' } as ServerToPseudoServerMessage);
		for (const pseudoServer of this.pseudoServers.values()) {
			if (pseudoServer.ws.readyState === WebSocket.OPEN) {
				pseudoServer.ws.send(data);
			}
		}
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
	protected Log(
		level: 'info' | 'warn' | 'error' | 'debug',
		message: string,
		data?: unknown,
	): void {
		VSBloomBridgeServer.outputChannel?.appendLine(
			`[Server/${level.toUpperCase()}]: ${message} ${data ? JSON.stringify(data) : ''}`,
		);
		console.log(`${ConstructVSBloomLogPrefix('Server', level)}${message}`, data ?? '');
	}

	public GetContractExtendingInstance(): this {
		return this;
	}

	/**
	 * Dispose of the bridge; called when the extension is deactivated
	 */
	public dispose(): void {
		this.Stop().catch((err) => {
            MainOutputChannel.Log("error", "An error occurred while .Stop()'ing the bridge server", { error: err });
        });
        this.extensionDisposalJanitor.Destroy().catch((err) => {
            MainOutputChannel.Log("error", "An error occurred while .Destroy()'ing the Bridge Server's extension-lifetime janitor", { error: err });
        });

		VSBloomBridgeServer.outputChannel?.dispose();
		VSBloomBridgeServer.outputChannel = null;

		VSBloomBridgeServer.instance = null;
	}
}

/**
 * Dispatches a marshalled command forwarded from a pseudo-server to the appropriate
 * local service. Called upon the main Bridge Server's `OnPseudoServerMarshalledMessage`
 * event being raised.
 */
export function HandleMarshalledMessageFromPseudoServer(
	bridge: VSBloomBridgeServer,
	msg: PseudoServerMarshalledMessageEventPayload,
): void {
    const payload = msg.payload;

	switch (payload.type) {
		case 'fire-all-clients': {
			bridge.FireAllClients(payload.data);

			break;
		}
		case 'fire-client': {
			const fireData = payload.data;
			bridge.FireClient(fireData.windowId, fireData.message);

			break;
		}
		case 'replicate-extension-config': {
			bridge.ReplicateExtensionConfigToAllClients();

			break;
		}
		case 'reload-all-effects': {
			EffectManager.GetInstance()
				.ReloadAllEffects()
				.catch((err) => {
					MainOutputChannel.Log(
						'error',
						`Failed to reload effects (marshalled from pseudo-server): ${err}`,
					);
				});

			break;
		}
		case 'set-native-runtime-active': {
			const nativeAssignmentData = payload.data;
			if (typeof nativeAssignmentData !== 'object' || typeof nativeAssignmentData.shouldBeActive !== 'boolean') {
				MainOutputChannel.Log(
					'error',
					'A pseudo-server marshalled message was received with a data property that was not of a valid object structure when attempting to set the native runtime active state',
				);
				break;
			}

			const nativeRuntime = VSBloomNativeRuntimeManager.GetInstance();
			const isNRActive = nativeRuntime.IsNativeRuntimeActive();
            const shouldRestartNR =
                isNRActive === true &&
                nativeAssignmentData.shouldBeActive === true &&
                nativeAssignmentData.shouldRestart === true;

			if (
                isNRActive === nativeAssignmentData.shouldBeActive &&
                (
                    nativeAssignmentData.shouldBeActive === true &&
                    nativeAssignmentData.shouldRestart === false
                )
            ) {
				MainOutputChannel.Log(
					'warn',
					`A Pseudo-Server marshalled message was received with an instruction to make the native runtime ${nativeAssignmentData.shouldBeActive ? 'active' : 'inactive'}, but the current native runtime active state is already ${isNRActive ? 'active' : 'inactive'}`,
				);
				break;
			}

            //If we should restart the native runtime, stop it before re-starting it below
            if (shouldRestartNR) {
                nativeRuntime.StopNativeRuntime().then((wasSuccessful) => {
                    if (wasSuccessful) {
                        MainOutputChannel.Log(
                            'info',
                            'The native runtime was stopped successfully pending a restart, instructed to do so by a marshalled message from a pseudo-server'
                        );
                    } else {
                        MainOutputChannel.Log(
                            'error',
                            'Failed to stop the native runtime for a restart when instructed to do so by a marshalled message from a pseudo-server'
                        );
                    }
                }).catch((err) => {
                    MainOutputChannel.Log(
                        'error',
                        'An error occurred while attempting to stop the native runtime for a restart when instructed to do so by a marshalled message from a pseudo-server',
                        { error: err },
                    );
                });
            }

            //Depending on the desired state, start or stop the native runtime
			const nativeRuntimeStateChanger = nativeAssignmentData.shouldBeActive
				? () => nativeRuntime.StartNativeRuntime()
				: () => nativeRuntime.StopNativeRuntime();
			nativeRuntimeStateChanger()
				.then((wasSuccessful) => {
					if (wasSuccessful) {
						MainOutputChannel.Log(
							'info',
							`The native runtime was ${nativeAssignmentData.shouldBeActive ? 'started' : 'stopped'} successfully (instructed to do so by a marshalled message from a pseudo-server)`,
						);
					} else {
						MainOutputChannel.Log(
							'error',
							`Failed to ${nativeAssignmentData.shouldBeActive ? 'start' : 'stop'} the native runtime, when instructed to by a marshalled message from a pseudo-server`,
						);
					}
				})
				.catch((err) => {
					MainOutputChannel.Log(
						'error',
						`Failed to ${nativeAssignmentData.shouldBeActive ? 'start' : 'stop'} the native runtime, when instructed to by a marshalled message from a pseudo-server: `,
						{ error: err },
					);
				});

			break;
		}
		default: {
			MainOutputChannel.Log(
				'error',
				`Received unknown marshalled command '${String(payload as unknown as { type: string }).substring(0,1000)}' from pseudo-server`, //we just substring this to stop malicious payloads from being too long in the output channel
			);
			break;
		}
	}
}

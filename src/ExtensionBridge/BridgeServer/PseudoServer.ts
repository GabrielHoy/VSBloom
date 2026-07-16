/**
 * VSBloom Pseudo-Client Bridge Server "Pseudo-Server"
 *
 * This class is used to represent a remotely running
 * VSBloom Bridge Server that is currently hosted on
 * a *different* VSCode instance than the one which is
 * utilizing this class.
 * This enables the ability for a VSBloom Extension
 * which starts up after one already exists on another
 * window to communicate with the initial "master"
 * VSBloom Extension running on that window, via
 * its already-exposed WebSocket server, usually
 * utilized for the Electron Client to connect to.
 *
 * This class is not meant to facilitate any direct
 * behaviors in regards to interacting with any electron
 * related clients or native code etc. - but rather to
 * marshall messages to and from the VSBloom Bridge Server
 * running on the other window that *can* interact with
 * those clients, in order to command it to do so in various
 * ways.
 */

import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { WebSocket } from 'ws';
import { ConstructVSBloomLogPrefix } from '../../Debug/Colorful';
import { EffectManager } from '../../Effects/EffectManager';
import { IsDevelopmentEnvironment } from '../../Extension/ExtensionReflection';
import { MainOutputChannel } from '../../Extension/MainOutputChannel';
import {
	DEFAULT_BRIDGE_PORT,
	type ExtensionToClientMessage,
	INITIAL_RECONNECT_DELAY_MS,
	type LogMessage,
	MAX_RECONNECT_DELAY_MS,
	type PseudoServerMarshalledMessageDecodedData,
	type PseudoServerToExtensionMessage,
	type ServerToPseudoServerMessage,
	WS_CLOSE_CODES,
} from '../API';
import type { VSBloomBridgeServerContract } from './BloomServerContract';
import { HandleMarshalledMessageFromPseudoServer, VSBloomBridgeServer } from './Server';
import { RemoteState, SyncPayload } from '../SynchronizedState';
import { defaultVSBloomSharedState, VSBloomSharedState } from '../SharedState';
import { MenuPanel } from '../../Extension/WebviewMenuPanel';

export const MAX_PSEUDO_SERVER_PAYLOAD_SIZE_BYTES = 1024 * 1024;
export const MAX_PSEUDO_SERVER_IDENTIFIER_LENGTH = 1000;

/**
 * A singleton class that represents a pseudo-server
 * facilitating message marshalling to and from the
 * VSBloom Bridge Server running on a window unrelated
 * to the one that this VSBloom extension is running on.
 */
export class VSBloomPseudoServer implements VSBloomBridgeServerContract {
	private static instance: VSBloomPseudoServer | null = null;
	private static outputChannel: vscode.OutputChannel | null = null;

	private ws: WebSocket | null = null;
	private reconnectAttempts = 0;
	private reconnectTimeout: NodeJS.Timeout | null = null;
	private isStopping = false;
	private masterNativeRuntimeIsRunning = false;

	// Resolver/Rejector pair held across reconnect attempts until the first successful open or
	// a rejection for missing authorization occurs.
	private _startResolve: (() => void) | null = null;
	private _startReject: ((error: unknown) => void) | null = null;

	private readonly _onServerDisconnected = new vscode.EventEmitter<void>();

	/**
	 * Fires when the VSBloom Bridge Server 'goes away' unexpectedly.
	 *
	 * **The activation layer implementing usage of Pseudo-Servers is responsible
	 * for handling promotion of a Pseudo-Server to main bridge server status. This
	 * is not done automatically by the Pseudo-Server itself!**
	 */
	public readonly OnServerDisconnected: vscode.Event<void> = this._onServerDisconnected.event;

    public readonly sharedState: RemoteState<VSBloomSharedState> = new RemoteState(defaultVSBloomSharedState);
    private _sharedStateOnDesyncSubscription: (() => void) | null = null;

	private myIdentifier: string;
	private authToken: string;

	private constructor(private context: vscode.ExtensionContext) {
		this.myIdentifier = crypto.randomUUID();

		const storedToken = context.globalState.get<string>('vsbloom.bridge.authToken');
		if (storedToken) {
			this.authToken = storedToken;
		} else {
			this.authToken = crypto.randomBytes(32).toString('hex');
			context.globalState.update('vsbloom.bridge.authToken', this.authToken);
		}

        this._sharedStateOnDesyncSubscription = this.sharedState.OnDesync(() => {
            this.RequestSharedStateSnapshotFromMainServer();
        });
	}

	public static GetInstance(context: vscode.ExtensionContext): VSBloomPseudoServer {
		if (!VSBloomPseudoServer.instance) {
			VSBloomPseudoServer.instance = new VSBloomPseudoServer(context);
		}
		return VSBloomPseudoServer.instance;
	}

	public static GetInstanceIfExists(): VSBloomPseudoServer | null {
		return VSBloomPseudoServer.instance;
	}

	private ReplicateLogMessageFromClient(message: LogMessage): void {
		const prefix = `[Client/${message.level.toUpperCase()}]: `;
		const logLine = message.data
			? `${prefix}${message.message} ${JSON.stringify(message.data)}`
			: `${prefix}${message.message}`;

		VSBloomPseudoServer.outputChannel?.appendLine(logLine);

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
	}

	private static SetBridgeOutputChannelPresent(shouldBePresent: boolean): void {
		if (shouldBePresent) {
			if (VSBloomPseudoServer.outputChannel) {
				return;
			}
			VSBloomPseudoServer.outputChannel =
				vscode.window.createOutputChannel('VSBloom: Pseudo-Bridge');
		} else {
			if (!IsDevelopmentEnvironment()) {
				VSBloomPseudoServer.outputChannel?.dispose();
				VSBloomPseudoServer.outputChannel = null;
			}
		}
	}

	protected Log(
		level: 'info' | 'warn' | 'error' | 'debug',
		message: string,
		data?: unknown,
	): void {
		VSBloomPseudoServer.outputChannel?.appendLine(
			`[PseudoServer/${level.toUpperCase()}]: ${message} ${data ? JSON.stringify(data) : ''}`,
		);
		console.log(`${ConstructVSBloomLogPrefix('PseudoServer', level)}${message}`, data ?? '');
	}

	/**
	 * Connect to the VSBloom Bridge Server as a pseudo-server.
	 *
	 * Resolves once a connection is first established.
	 * Rejects only on `UNAUTHORIZED` (4001): All other
	 * failures retry internally with backoff.
	 */
	public async Start(): Promise<void> {
		if (this.ws) {
			return;
		}
		this.isStopping = false;

		return new Promise<void>((resolve, reject) => {
			this._startResolve = resolve;
			this._startReject = reject;
			this.ConnectToWebSocketServer();
		});
	}

	/**
	 * Opens the WebSocket to the main bridge server and wires up all event handlers.
	 * Called by Start() for the initial attempt and by ScheduleReconnect() on retry.
	 */
	private ConnectToWebSocketServer(): void {
		if (this.isStopping) {
			return;
		}

		try {
			this.ws = new WebSocket(
				`ws://127.0.0.1:${this.GetServerPort()}?type=pseudo-server&token=${encodeURIComponent(this.GetAuthToken())}`,
			);

			this.ws.on('open', () => {
				this.reconnectAttempts = 0;
				VSBloomPseudoServer.SetBridgeOutputChannelPresent(true);

				vscode.commands.executeCommand(
					'setContext',
					'vsbloom.bridgeServer.isRunningAsPseudoServer',
					true,
				);
				VSBloomBridgeServer.anyBridgeServerRunningCtx.Add('WindowIsPseudoServer');

				this.Log(
					'info',
					`Connected to the VSBloom Bridge Server located on port ${this.GetServerPort()} as a Pseudo-Server.`,
				);

				this.FireServer({
					type: 'pseudo-server-ready',
					identifier: this.myIdentifier,
				});

				// Resolve the pending Start() promise; cleared so reconnects are silent
				if (this._startResolve) {
					this._startResolve();
					this._startResolve = null;
					this._startReject = null;
				}
			});

			this.ws.on('message', (data, isBinary) => {
				if (isBinary) {
					// A binary frame from the Main Bridge Server;
                    // We relay it verbatim to any Webviews that VSBloom has
                    // open on this window, and don't much care for the contents
                    // ourselves.
					const bytes = Array.isArray(data) ? Buffer.concat(data) : (data as Buffer);
					MenuPanel.currentPanel?.PostToSvelte({
						type: 'binary-frame',
						data: new Uint8Array(bytes),
					});
					return;
				}

				try {
					const message = JSON.parse(data.toString()) as ServerToPseudoServerMessage;
					this.MessageReceivedFromMainServer(message);
				} catch (err) {
					this.Log(
						'error',
						`Failed to parse message from the VSBloom Bridge Server: ${err}`,
					);
				}
			});

			this.ws.on('close', (code) => {
				this.ws = null;

				vscode.commands.executeCommand(
					'setContext',
					'vsbloom.bridgeServer.isRunningAsPseudoServer',
					false,
				);
				VSBloomBridgeServer.anyBridgeServerRunningCtx.Remove('WindowIsPseudoServer');

				if (code === WS_CLOSE_CODES.UNAUTHORIZED) {
					// Token mismatch...oof
					// Retrying won't help, a re-patch is likely needed
					this.Log(
						'error',
						'Connection rejected: Invalid auth token. Will not reconnect; a re-patch is required',
					);
					if (this._startReject) {
						this._startReject(new Error('Unauthorized'));
						this._startResolve = null;
						this._startReject = null;
					}
					return;
				}

				this.Log('warn', `Disconnected from the VSBloom Bridge Server, code ${code}`);

				if (!this.isStopping) {
					// Signal the activation layer so it can decide whether to promote
					this._onServerDisconnected.fire();
					this.ScheduleReconnect();
				}
			});

			this.ws.on('error', (error) => {
				// errors are typically followed by a close event, just log
				this.Log(
					'error',
					`An internal WebSocket error occurred with the VSBloom Bridge Server: ${error.message}`,
				);
			});
		} catch (error) {
			this.Log(
				'error',
				`Failed to create WebSocket connection to the VSBloom Bridge Server: ${error}`,
			);
			this.ScheduleReconnect();
		}
	}

	private ScheduleReconnect(): void {
		if (this.reconnectTimeout !== null || this.isStopping) {
			return;
		}

		const delay = Math.min(
			INITIAL_RECONNECT_DELAY_MS * 2 ** this.reconnectAttempts,
			MAX_RECONNECT_DELAY_MS,
		);

		this.reconnectAttempts++;
		this.Log(
			'info',
			`Scheduled reconnection to the VSBloom Bridge Server in ${delay}ms (attempt ${this.reconnectAttempts})`,
		);

		this.reconnectTimeout = setTimeout(() => {
			this.reconnectTimeout = null;
			this.ConnectToWebSocketServer();
		}, delay);
	}

	private MessageReceivedFromMainServer(message: ServerToPseudoServerMessage): void {
		switch (message.type) {
			case 'are-u-alive':
				this.FireServer({ type: 'i-am-alive' });
				break;
			case 'replicate-log':
				this.ReplicateLogMessageFromClient(message);
				break;
			case 'native-runtime-state':
				this.masterNativeRuntimeIsRunning = message.isRunning;
				vscode.commands.executeCommand(
					'setContext',
					'vsbloom.nativeRuntime.isRunning',
					message.isRunning,
				);
				break;
            case 'replicate-shared-state':
                this.ApplySharedStateUpdateFromMainServer(message.data);
                break;
		}
	}

    private ApplySharedStateUpdateFromMainServer(payload: SyncPayload<VSBloomSharedState>): void {
        this.sharedState.ApplyPayload(payload);

        MenuPanel.currentPanel?.PostToSvelte({
            type: 'replicate-shared-state',
            data: payload,
        });
    }

    private RequestSharedStateSnapshotFromMainServer(): void {
        this.FireServer({
            type: 'request-shared-state-snapshot',
            id: this.myIdentifier
        });
    }

	/**
	 * Returns the native runtime running state as last reported by the master bridge server.
	 * Use this instead of `VSBloomNativeRuntimeManager.IsNativeRuntimeActive()` on pseudo-server windows,
	 * where the child process is not local.
	 */
	public GetMasterNativeRuntimeIsRunning(): boolean {
		return this.masterNativeRuntimeIsRunning;
	}

	private FireServer(message: PseudoServerToExtensionMessage): void {
		if (this.ws && this.ws.readyState === WebSocket.OPEN) {
			this.ws.send(JSON.stringify(message));
		}
	}

	public async Stop(): Promise<void> {
		this.isStopping = true;

		if (this.reconnectTimeout !== null) {
			clearTimeout(this.reconnectTimeout);
			this.reconnectTimeout = null;
		}

		if (this.ws) {
			this.ws.close(WS_CLOSE_CODES.GOING_AWAY, 'Pseudo-server stopping');
			this.ws = null;
		}

		VSBloomPseudoServer.SetBridgeOutputChannelPresent(false);
		vscode.commands.executeCommand(
			'setContext',
			'vsbloom.bridgeServer.isRunningAsPseudoServer',
			false,
		);
		VSBloomBridgeServer.anyBridgeServerRunningCtx.Remove('WindowIsPseudoServer');

		VSBloomPseudoServer.instance = null;
	}

	public GetServerPort(): number {
		return this.context.globalState.get<number>(
			'vsbloom.electronBridge.currentClientBridgePort',
			DEFAULT_BRIDGE_PORT,
		);
	}

	public GetAuthToken(): string {
		return this.authToken;
	}

	public IsRunning(): boolean {
		return this.ws !== null && this.ws.readyState === WebSocket.OPEN;
	}

	/**
	 * Always returns 0, due to the fact that a pseudo-server has no
	 * visibility into the main bridge server's client map.
	 */
	public GetClientCount(): number {
		return 0;
	}

	public FireAllClients(message: ExtensionToClientMessage): void {
		this.FireServer({
			type: 'marshalled-message',
            id: this.myIdentifier,
			data: JSON.stringify({ type: 'fire-all-clients', data: message }),
		});
	}

	/**
	 * Marshals the call to the main bridge server. Returns true optimistically,
	 * but cannot synchronously confirm whether the target window exists on
	 * the main bridge server without potentially unreasonable round-trip delays.
	 */
	public FireClient(windowId: string, message: ExtensionToClientMessage): boolean {
		this.FireServer({
			type: 'marshalled-message',
            id: this.myIdentifier,
			data: JSON.stringify({ type: 'fire-client', data: { windowId, message } }),
		});
		return true;
	}

	/**
	 * Signals the main bridge server to read the current VSCode config
	 * and thusly replicate it to all clients.
	 */
	public ReplicateExtensionConfigToAllClients(): void {
		this.FireServer({
			type: 'marshalled-message',
            id: this.myIdentifier,
			data: JSON.stringify({ type: 'replicate-extension-config', data: null }),
		});
	}

	/**
	 * Sends an arbitrary named command to the main bridge server as a marshalled message.
	 * The main bridge server's job is to dispatch it via `OnPseudoServerMarshalledMessage`.
	 */
	public SendMarshalledCommand(
		type: PseudoServerMarshalledMessageDecodedData['type'],
		data: PseudoServerMarshalledMessageDecodedData['data'],
	): void {
		this.FireServer({
			type: 'marshalled-message',
            id: this.myIdentifier,
			data: JSON.stringify({ type, data }),
		});
	}

	public GetContractExtendingInstance(): this {
		return this;
	}

	public dispose(): void {
        const sharedStateDesyncUnsubscriber = this._sharedStateOnDesyncSubscription;
        if (sharedStateDesyncUnsubscriber) {
            this._sharedStateOnDesyncSubscription = null;
            sharedStateDesyncUnsubscriber();
        }

		this._onServerDisconnected.dispose();
		void this.Stop();
		VSBloomPseudoServer.outputChannel?.dispose();
		VSBloomPseudoServer.outputChannel = null;
		VSBloomPseudoServer.instance = null;
	}
}

/**
 * Connects this window to the VSBloom Bridge Server as a pseudo-server and sets up promotion
 * listeners so that if the primary bridge server disappears, all pseudo-servers race to take over.
 */
export async function ConnectAsPseudoServer(context: vscode.ExtensionContext): Promise<void> {
	const pseudo = VSBloomPseudoServer.GetInstance(context);
	try {
		await pseudo.Start();
		context.subscriptions.push(pseudo);

		const disconnectDisp = pseudo.OnServerDisconnected(async () => {
			disconnectDisp.dispose();
			// Cancel the pseudo-server's internal reconnect loop before we race for main server status
			await pseudo.Stop();
			await AttemptPromotion(context);
		});
		context.subscriptions.push(disconnectDisp);

		MainOutputChannel.Log(
			'info',
			'Connected to the VSBloom Bridge Server as Pseudo-Bridge Server',
		);
	} catch (err) {
		// probably either an `UNAUTHORIZED` or persistent failure, clean up so GetInstance doesn't return a dead instance
		await pseudo.Stop();
		MainOutputChannel.Log(
			'error',
			`Failed to connect to the VSBloom Bridge Server as a pseudo-server: ${err}`,
		);
	}
}

/**
 * Called when this window's pseudo-server loses its connection to the main bridge server.
 * All pseudo-servers race to bind the bridge port; the OS *should* ensure exactly one wins.
 * The winner becomes the main bridge server; losers reconnect as pseudo-servers once more.
 */
export async function AttemptPromotion(context: vscode.ExtensionContext): Promise<void> {
	MainOutputChannel.Log(
		'info',
		'The VSBloom Bridge Server disconnected, attempting promotion of ourselves to main bridge server status',
	);

	const server = VSBloomBridgeServer.GetInstance(context);
	// Reset any stale WebSocketServer state before rebinding since we likely would've
	// failed to bind the port earlier already before a Pseudo-Server was even established
	await server.Stop();
	await server.Start();

	if (VSBloomBridgeServer.isServerListening) {
		MainOutputChannel.Log(
			'info',
			'Promotion successful: This window has now taken the role of the VSBloom Bridge Server.',
		);

		context.subscriptions.push(
			server.OnPseudoServerMarshalledMessage((msg) => {
				HandleMarshalledMessageFromPseudoServer(server, msg);
			}),
		);

		const effectManager = EffectManager.GetInstance();
		await effectManager.Start(server);
	} else {
		MainOutputChannel.Log(
			'info',
			'Promotion race lost, reconnecting to assumed new main bridge server as a pseudo-server',
		);
		await ConnectAsPseudoServer(context);
	}
}

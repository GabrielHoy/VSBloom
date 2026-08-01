/**
 * VSBloom Native Runtime Manager
 *
 * Manages the lifecycle of VSBloom's native runtime,
 * which is a C++ project compiled and ran alongside
 * the VSBloom WebSocket Server to supplement VSBloom's
 * functionality with any operating-specific features
 * that may be needed.
 *
 */

import * as childProcess from 'node:child_process';
import * as crypto from 'node:crypto';
import * as readline from 'node:readline';
import * as asyncMutex from 'async-mutex';
import * as vscode from 'vscode';
import { ConstructVSBloomLogPrefix } from '../Debug/Colorful';
import { IsDevelopmentEnvironment } from '../Extension/ExtensionReflection';
import { MainOutputChannel } from '../Extension/MainOutputChannel';
import { VSBloomPseudoServer } from '../ExtensionBridge/BridgeServer/PseudoServer';
import { VSBloomBridgeServer } from '../ExtensionBridge/BridgeServer/Server';
import { GetPathToNativeBinary, IsNativeCapable, PLATFORM_SLUG } from './NativeCompatibility';
import type * as NativeMessages from './NativeMessages';

/**
 * A list of message types that are *not* generally handled directly
 * by the Native Runtime Manager itself, but are exposed as events
 * that get raised when they're sent from the Native Runtime so other
 * parts of VSBloom can observe them and respond accordingly.
 */
export const NATIVE_RUNTIME_EVENT_BASED_MESSAGE_NAMES = [
    'new-audio-analysis-frame',
    'available-audio-device-list',
    'currently-captured-audio-device-list'
] as const satisfies readonly (NativeMessages.Receivable.MessagePayload["type"])[];

type NativeReceivableEventMessageName = (typeof NATIVE_RUNTIME_EVENT_BASED_MESSAGE_NAMES)[number]

/**
 * The `data` payload carried by the receivable message whose `type` is `MSG_TYPE`.
 * */
type NativeReceivableEventPayload<MSG_TYPE extends NativeReceivableEventMessageName> =
    Extract<NativeMessages.Receivable.MessagePayload, { type: MSG_TYPE }>['data'];

type NativeReceivableEventEmitterList = {
    [MSG_TYPE in (typeof NATIVE_RUNTIME_EVENT_BASED_MESSAGE_NAMES)[number]]: vscode.EventEmitter<NativeReceivableEventPayload<MSG_TYPE>>;
}

/**
 * The publicly observable `.event` side of {@link NativeReceivableEventEmitterList}.
 * */
type NativeReceivableEventList = {
    readonly [MSG_TYPE in NativeReceivableEventMessageName]: vscode.Event<NativeReceivableEventPayload<MSG_TYPE>>;
}

export class VSBloomNativeRuntimeManager implements vscode.Disposable {
	private static instance: VSBloomNativeRuntimeManager | null = null;

	private outputChannel: vscode.OutputChannel | null = null;
	private childProc: childProcess.ChildProcessWithoutNullStreams | null = null;
	private childProcLineReader: readline.Interface | null = null;
	private encryptionKey: Buffer | null = null;
	private runtimeEnabledSettingChangeMutex = new asyncMutex.Mutex();
	//This is private because the IsNativeRuntimeActive method is less prone to desync and should always be used instead
	//The reason this exists at all is to provide a self-checking mechanism to try and make sure we're not accidentally
	//ever desynchronizing from the actual state of the native runtime during development.
	private static isRunning: boolean = false;

	private readonly _onNativeRuntimeStateChanged = new vscode.EventEmitter<boolean>();
	/**
	 * Fires when the native runtime starts or stops.
	 * Payload is the new running state: `true` = started, `false` = stopped.
	 */
	public readonly OnNativeRuntimeStateChanged: vscode.Event<boolean> =
		this._onNativeRuntimeStateChanged.event;
    
    private readonly receivableMessageEventEmitters: NativeReceivableEventEmitterList =
        NATIVE_RUNTIME_EVENT_BASED_MESSAGE_NAMES.reduce((accum, msgName) => {
            accum[msgName] = new vscode.EventEmitter();
            return accum;
        }, {} as Record<NativeReceivableEventMessageName, vscode.EventEmitter<unknown>>) as NativeReceivableEventEmitterList;

    public readonly receivableMessageEvents: NativeReceivableEventList =
        NATIVE_RUNTIME_EVENT_BASED_MESSAGE_NAMES.reduce((accum, msgName) => {
            accum[msgName] = this.receivableMessageEventEmitters[msgName].event;
            return accum;
        }, {} as Record<NativeReceivableEventMessageName, vscode.Event<unknown>>) as NativeReceivableEventList;

	private constructor() {
		MainOutputChannel.Log('info', 'Native Runtime Manager initialized');

        this.UpdateNativeRuntimeEnabledState();
	}

	public static GetInstance(): VSBloomNativeRuntimeManager {
		if (!VSBloomNativeRuntimeManager.instance) {
			VSBloomNativeRuntimeManager.instance = new VSBloomNativeRuntimeManager();
		}

		return VSBloomNativeRuntimeManager.instance;
	}

	/**
	 * Checks whether the current platform is capable of running VSBloom's
	 * native runtime or not.
	 *
	 * @returns A promise that resolves to whether the current platform is
	 * capable of running VSBloom's native runtime or not.
	 */
	public static async IsNativeRuntimeSupported(): Promise<boolean> {
		//This exists purely to provide a singular point of
		//access to native runtime logic for other parts of the
		//codebase instead of making them import NativeCompatibility.
		return await IsNativeCapable();
	}

	/**
	 * Starts the native runtime if it is not already running.
	 *
	 * **This should only be called if the native runtime is actually
	 * supported on the current platform.**
	 */
	public async StartNativeRuntime(): Promise<boolean> {
        if (!VSBloomBridgeServer.isServerListening) {
            MainOutputChannel.Log(
                'error',
                'Bridge Server is not initialized, but native runtime manager has attempted to be started. This cannot be facilitated until Pseudo-Sockets are complete to marshall native traffic to the primary VSCode window.',
            );
            return false;
        }
        if (this.IsNativeRuntimeActive()) {
            MainOutputChannel.Log(
                'warn',
                'A request was made to start the native runtime, but it is already running.',
            );
            return true;
        }

        if (!(await VSBloomNativeRuntimeManager.IsNativeRuntimeSupported())) {
            MainOutputChannel.Log(
                'error',
                `A request was made to start the native runtime, but it is not capable of running on the ${PLATFORM_SLUG} platform.`,
            );
            return false;
        }

        if (!this.outputChannel) {
            this.outputChannel = vscode.window.createOutputChannel('VSBloom: Native Runtime');
        } else {
            //This is an ugly line. It's just a pretty dev-indicator to print out a
            //block of dashes with a title in the middle stating that we're starting
            //a new native runtime session.
            this.Log(
                'info',
                `\n\n${`${`-`.repeat(50)}\n`.repeat(2)}${`-`.repeat(10)}  NEW NATIVE RUNTIME SESSION  ${`-`.repeat(10)}\n${`${`-`.repeat(50)}\n`.repeat(2)}\n`,
            );
        }

        this.Log('debug', 'Attempting to start the native runtime...');

        const nativeBinPath = await GetPathToNativeBinary();

        this.Log('debug', `Located the Native Runtime binary!`);

        this.childProc = childProcess.spawn(nativeBinPath, [], {
            stdio: ['pipe', 'pipe', 'pipe'],
            shell: undefined,
            windowsHide: false,
        });

        this.childProc.stderr?.on('data', (chunk: Buffer) => {
            const s = chunk.toString();
            this.Log('error', `Something went wrong in the Native Runtime: ${s}`);
        });

        this.childProc.on('close', (code: number) => {
            this.Log('debug', `Native runtime closed with code ${code}.`);
            if (VSBloomNativeRuntimeManager.isRunning) {
                VSBloomNativeRuntimeManager.SetIsRunningState(false);
            }

            if (!IsDevelopmentEnvironment()) {
                //We only want to actively dispose of the output channel in non-development environments
                //since this would make life very very difficult for me and any contributors to the project
                //if we had our debug output channel close on us upon program crashes or termination.
                this.outputChannel?.dispose();
                this.outputChannel = null;
            }

            this.childProc = null;
            this.encryptionKey = null;
            this.childProcLineReader?.close();
            this.childProcLineReader = null;
        });

        this.childProcLineReader = readline.createInterface({
            input: this.childProc.stdout,
            output: process.stdout,
        });

        this.childProcLineReader.on('line', (messageFromChildProc: string) => {
            //We assume that each message from the native runtime's stdout channel
            //will be an NDJSON message from the native runtime (encrypted once the
            //session key has been received via the i-am-alive handshake).
            const parsedMessage = VSBloomNativeRuntimeManager.TryParseNativeReceivedMessage(
                messageFromChildProc,
                this.encryptionKey,
            );
            if (!parsedMessage) {
                this.Log(
                    'error',
                    `Received an invalid message from the Native Runtime: ${messageFromChildProc}`,
                );
                return;
            }

            this.HandleNativeReceivedMessage(parsedMessage);
        });

        const isNowActive = this.IsNativeRuntimeActive();
        VSBloomNativeRuntimeManager.SetIsRunningState(isNowActive);
        return isNowActive;
	}

	private static SetIsRunningState(isNowRunning: boolean): void {
		vscode.commands.executeCommand(
			'setContext',
			'vsbloom.nativeRuntime.isRunning',
			isNowRunning,
		);

		if (VSBloomNativeRuntimeManager.isRunning === isNowRunning) {
			MainOutputChannel.Log(
				'error',
				'A request was made to set the native runtime active state, but the state was already the same as the requested state. A desync like this should not be allowed to happen with the Native Runtime.',
			);
			if (IsDevelopmentEnvironment()) {
				vscode.window.showErrorMessage(
					'PIVOT TO INVESTIGATE: A request was made to set the native runtime active state, but the state was already the same as the requested state.',
				);
			}
		}

		VSBloomNativeRuntimeManager.isRunning = isNowRunning;
		VSBloomNativeRuntimeManager.instance?._onNativeRuntimeStateChanged.fire(isNowRunning);
	}

	/**
	 * Checks whether the native runtime is active or not on the local VSCode window
	 * instance.
	 *
	 * @returns A boolean indicating whether the native runtime is active or not.
	 */
	public IsNativeRuntimeActive(): boolean {
		return (
			this.childProc !== null && !this.childProc.killed && this.childProc.exitCode === null
		);
	}

	/**
	 * Checks whether the native runtime is active *anywhere* on the system,
	 * including both the local VSCode window instance and the main bridge
	 * server instance that should actually be hosting it if it is running.
	 *
	 * @returns A boolean indicating whether the native runtime is active anywhere on the system.
	 */
	public static IsNativeRuntimeActiveAnywhereOnSystem(): boolean {
		const nativeRuntime = VSBloomNativeRuntimeManager.GetInstance();

		return VSBloomBridgeServer.isServerListening
			? (nativeRuntime.IsNativeRuntimeActive() ?? false)
			: (VSBloomPseudoServer.GetInstanceIfExists()?.GetMasterNativeRuntimeIsRunning() ??
					false);
	}

	/**
	 * Stops the native runtime if it was running.
	 */
	public async StopNativeRuntime(): Promise<boolean> {
        if (!this.IsNativeRuntimeActive()) {
            MainOutputChannel.Log(
                'warn',
                'A request was made to stop the native runtime, but it was not running.',
            );
            return false;
        }

        this.Log('debug', 'Stopping the native runtime...');

        const procStillRunning = this.childProc?.exitCode === null;
        const procExitPromise = procStillRunning
            ? new Promise<void>((resolve) => {
                    if (this.childProc) {
                        this.childProc.once('exit', () => resolve());
                    } else {
                        resolve();
                    }
                })
            : Promise.resolve();

        const couldKill = this.childProc?.kill('SIGTERM');
        if (!couldKill) {
            MainOutputChannel.Log(
                'error',
                'A request was made to stop the native runtime, but it could not be successfully killed.',
            );
            if (IsDevelopmentEnvironment()) {
                vscode.window.showErrorMessage(
                    'PIVOT TO INVESTIGATE: A request was made to stop the native runtime, but it could not be successfully killed.',
                );

                return false;
            }
            return false;
        }
        //Wait for the process to actually *exit* before proceeding
        await procExitPromise;

        this.childProcLineReader?.close();
        this.childProcLineReader = null;
        this.childProc = null;
        this.encryptionKey = null;

        if (VSBloomNativeRuntimeManager.isRunning) {
            VSBloomNativeRuntimeManager.SetIsRunningState(false);
        }

        if (!IsDevelopmentEnvironment()) {
            //We only want to actively dispose of the output channel in non-development environments
            //since this would make life very very difficult for me and any contributors to the project
            //if we had our debug output channel close on us upon program crashes or termination.
            this.outputChannel?.dispose();
            this.outputChannel = null;
        }

        return true;
	}

	/**
	 * Restarts the native runtime if it was running, starting it if it was not.
	 *
	 * **This should only be called if the native runtime is actually
	 * supported on the current platform.**
	 *
	 * @returns A promise that resolves to whether the native runtime was successfully restarted or not.
	 */
	public async RestartNativeRuntime(): Promise<boolean> {
		if (this.IsNativeRuntimeActive()) {
			this.Log('debug', 'Restarting the native runtime...');
			await this.StopNativeRuntime();
		}

		return await this.StartNativeRuntime();
	}

	//B64-encoded, first twelve bytes are nonce, last sixteen bytes are the gcm_tag,
	//everything in between is ciphertext.
	private static AESGCMEncrypt(key: Buffer, plaintext: string): string {
		const nonce = crypto.randomBytes(12);
		const cipher = crypto.createCipheriv('aes-256-gcm', key, nonce);
		const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
		const tag = cipher.getAuthTag();
		return Buffer.concat([nonce, ciphertext, tag]).toString('base64');
	}

	//B64-encoded, first twelve bytes are nonce, last sixteen bytes are the gcm_tag,
	//everything in between is ciphertext.
	private static AESGCMDecrypt(key: Buffer, encryptedBase64: string): string {
		const packed = Buffer.from(encryptedBase64, 'base64');
		const nonce = packed.subarray(0, 12);
		const tag = packed.subarray(packed.length - 16);
		const ciphertext = packed.subarray(12, packed.length - 16);
		const decipher = crypto.createDecipheriv('aes-256-gcm', key, nonce);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
	}

	private static TryParseNativeReceivedMessage(
		message: string,
		sessionKey: Buffer | null,
	): NativeMessages.Receivable.MessagePayload | null {
		try {
			let jsonString = message;

			if (sessionKey !== null) {
				const outer = JSON.parse(message) as { enc?: unknown };
				if (typeof outer.enc !== 'string') {
					return null; // reject unencrypted messages after the key is established
				}
				jsonString = VSBloomNativeRuntimeManager.AESGCMDecrypt(sessionKey, outer.enc);
			}

			const parsedMessage = JSON.parse(jsonString) as NativeMessages.Receivable.MessagePayload;

			if (!('type' in parsedMessage)) {
				return null;
			}

			return parsedMessage;
		} catch {
			return null;
		}
	}

	/**
	 * Handles a native runtime received message, forwarding
	 * it along to the appropriate handler function.
	 *
	 * Assumes the message has already been parsed and validated
	 * as a NativeReceivableMessage-fulfilling interface.
	 */
	private HandleNativeReceivedMessage(message: NativeMessages.Receivable.MessagePayload): void {
		const messageType = message.type;

		switch (messageType) {
			case 'i-am-alive': {
				this.NativeRuntimeAliveMessageHandler(message);
				break;
			}
			case 'method-exception': {
				this.NativeMethodExceptionRaisedMessageHandler(message);
				break;
			}
			case 'secure-acknowledgement': {
				this.NativeSecureAcknowledgementMessageHandler(message);
				break;
			}
			default: {
                /**
                 * Some message types from the Native Runtime are 'event-emitters',
                 * meaning they don't themselves invoke any behavior when received
                 * from the Native Runtime, but rather simply raise an event on the
                 * TypeScript side here in the Native Runtime Manager - This allows
                 * for different parts of the codebase to subscribe to these events
                 * and implement their own behavior w/o establishing dependencies to
                 * them from within the Native Runtime Manager itself.
                */
                if (messageType in this.receivableMessageEventEmitters) {
                    const eventMsgType = messageType as NativeReceivableEventMessageName;
                    const eventEmitter = this.receivableMessageEventEmitters[eventMsgType];
                    const eventPayload = message.data as NativeReceivableEventPayload<typeof eventMsgType>;

                    eventEmitter.fire(eventPayload as Extract<NativeReceivableEventPayload<typeof eventMsgType>, typeof eventMsgType>);

                    break;
                }

				this.Log(
					'error',
					`Received an unknown message type from the native runtime: ${messageType}`,
                    IsDevelopmentEnvironment() ? message : undefined
				);
				break;
			}
		}
	}

	private NativeMethodExceptionRaisedMessageHandler(
		message: NativeMessages.Receivable.Messages["MethodExceptionRaised"]
	): void {
		this.Log('error', `EXCEPTION RAISED in Native Runtime:`, message);
	}

	private NativeSecureAcknowledgementMessageHandler(
		message: NativeMessages.Receivable.Messages["SecureAcknowledgement"]
	): void {
		const keyByteLength = this.encryptionKey?.length ?? 0;

		this.Log(
			'info',
			`Established ${keyByteLength * 8}-bit AES-256-GCM encrypted session, our IPC channel should now be secure.`,
			{ message },
		);
	}

	private NativeRuntimeAliveMessageHandler(
		message: NativeMessages.Receivable.Messages["StartupSuccess"],
	): void {
		this.encryptionKey = Buffer.from(message.data.k, 'hex');

		// All messages sent from here onward are AES-256-GCM encrypted.
		// We'll test this fact by sending a 'test-secure-message' payload
		// to the Native Runtime immediately after establishing the encryption
		// key; if TypeScript and C++ agree on the session's encryption, this
		// will immediately prompt a 'secure-acknowledgement' message from the
		// Native Runtime - completing the secure session establishment handshake.
		this.SendMessageToNativeRuntime('test-secure-message', {
			message: '<probe>',
		});
	}

	/**
	 * Serializes a native runtime sendable message (encrypting it
	 * with AES-256-GCM once the encryption key has been established
	 * during the i-am-alive handshake initiation from the native side)
	 */
	private static SerializeNativeSendableMessage(
		messagePayload: NativeMessages.Sendable.MessagePayload,
		keyForEncryption: Buffer | null,
	): string {
		const jsonifiedMessage = JSON.stringify(messagePayload);
		if (keyForEncryption !== null) {
			return JSON.stringify({
				enc: VSBloomNativeRuntimeManager.AESGCMEncrypt(keyForEncryption, jsonifiedMessage),
			});
		}
		return jsonifiedMessage;
	}

	/**
	 * Sends a message to the native runtime.
	 *
	 * This is the ***primary and only mechanism of communication***
	 * to the Native Runtime from the Bridge Server.
	 */
	public async SendMessageToNativeRuntime<MSG_TYPE extends NativeMessages.Sendable.MessageType>(
		messageType: MSG_TYPE,
		data: Extract<NativeMessages.Sendable.MessagePayload, { type: MSG_TYPE }>['data'],
	) {
		const payloadToSend = {
			type: messageType,
			data: data,
		};

		const serializedPayload = VSBloomNativeRuntimeManager.SerializeNativeSendableMessage(
			payloadToSend as NativeMessages.Sendable.MessagePayload,
			this.encryptionKey,
		);

		if (this.childProc?.stdin) {
			//The newline at the end of the message stands as the delimiter
			//between messages in the NDJSON format that the Native Runtime
			//expects to see from any messages sent to it from us.
			this.childProc.stdin.write(`${serializedPayload}\n`);
		} else {
			this.Log(
				'error',
				`A request was made to send a message to the Native Runtime, but it was either not running or stdin did not exist. Message:`,
				payloadToSend,
			);
		}
	}

	public async UpdateNativeRuntimeEnabledState() {
        const config = vscode.workspace.getConfiguration();
        const isNativeRuntimeSettingEnabled = config.get<boolean>('vsbloom.nativeRuntime.enabled');

        vscode.commands.executeCommand('setContext', 'vsbloom.nativeRuntime.isEnabled', isNativeRuntimeSettingEnabled);

        const areWeMainBridgeServer = VSBloomBridgeServer.isServerListening;
        if (!areWeMainBridgeServer) {
            // We're not the actual main bridge server window, so we aren't
            // the one responsible for managing the Native Runtime's binary;
            // leave it to the instance hosting the main bridge server to
            // start and stop accordingly.
            return;
        }

        await this.runtimeEnabledSettingChangeMutex.runExclusive(async () => {
            const isNRActive = this.IsNativeRuntimeActive();
    
            if (isNativeRuntimeSettingEnabled && !isNRActive) {
                await this.StartNativeRuntime();
            } else if (!isNativeRuntimeSettingEnabled && isNRActive) {
                await this.StopNativeRuntime();
            }
        });
	}

	public async ExtensionConfigurationUpdated(e: vscode.ConfigurationChangeEvent) {
		if (!e.affectsConfiguration('vsbloom')) {
			return; //this config change doesn't affect us
		}

		if (e.affectsConfiguration('vsbloom.nativeRuntime.enabled')) {
			await this.UpdateNativeRuntimeEnabledState();
		}
	}

	/**
	 * Logs a native runtime message to the output channel.
	 */
	private Log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
		this.outputChannel?.appendLine(
			`[Native/${level.toUpperCase()}]: ${message} ${data ? JSON.stringify(data) : ''}`,
		);

		console.log(`${ConstructVSBloomLogPrefix('Native', level)}${message}`, data ?? '');
	}

	public dispose(): void {
		if (this.IsNativeRuntimeActive()) {
			this.StopNativeRuntime();
		}

		this.outputChannel?.dispose();
		this.outputChannel = null;

		this._onNativeRuntimeStateChanged.dispose();
		VSBloomNativeRuntimeManager.instance = null;
	}
}

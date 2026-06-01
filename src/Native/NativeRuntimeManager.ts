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
import * as vscode from 'vscode';
import { ConstructVSBloomLogPrefix } from '../Debug/Colorful';
import { IsDevelopmentEnvironment } from '../Extension/ExtensionReflection';
import { MainOutputChannel } from '../Extension/MainOutputChannel';
import { VSBloomPseudoServer } from '../ExtensionBridge/BridgeServer/PseudoServer';
import { VSBloomBridgeServer } from '../ExtensionBridge/BridgeServer/Server';
import { GetPathToNativeBinary, IsNativeCapable, PLATFORM_SLUG } from './NativeCompatibility';

export class VSBloomNativeRuntimeManager implements vscode.Disposable {
	private static instance: VSBloomNativeRuntimeManager | null = null;

	private outputChannel: vscode.OutputChannel | null = null;
	private childProc: childProcess.ChildProcess | null = null;
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

	private constructor() {
		MainOutputChannel.Log('info', 'Native Runtime Manager initialized');
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
            this.Log('info', `\n\n${`${(`-`.repeat(50))}\n`.repeat(2)}${`-`.repeat(10)}  NEW NATIVE RUNTIME SESSION  ${`-`.repeat(10)}\n${`${(`-`.repeat(50))}\n`.repeat(2)}\n`);
        }

		this.Log('info', 'Attempting to start the native runtime...');

		const nativeBinPath = await GetPathToNativeBinary();

		this.Log('info', `The native runtime binary was found at ${nativeBinPath}.`);

		this.childProc = childProcess.spawn(nativeBinPath, [], {
			stdio: ['pipe', 'pipe', 'pipe'],
			shell: undefined,
			windowsHide: false,
		});

		this.childProc.stdout?.on('data', (chunk: Buffer) => {
			const s = chunk.toString();
			this.Log('debug', `Native runtime stdout: ${s}`);
		});

		this.childProc.stderr?.on('data', (chunk: Buffer) => {
			const s = chunk.toString();
			this.Log('debug', `Native runtime stderr: ${s}`);
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

		this.childProc = null;

		VSBloomNativeRuntimeManager.SetIsRunningState(false);

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
			this.StopNativeRuntime();
		}

		return await this.StartNativeRuntime();
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

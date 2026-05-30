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
import { VSBloomBridgeServer } from '../ExtensionBridge/Server';
import { GetPathToNativeBinary, IsNativeCapable, PLATFORM_SLUG } from './NativeCompatibility';

export class VSBloomNativeRuntimeManager implements vscode.Disposable {
	private static instance: VSBloomNativeRuntimeManager | null = null;

	private outputChannel: vscode.OutputChannel | null = null;
	private childProc: childProcess.ChildProcess | null = null;

	public static isRunning: boolean = false;

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

		this.outputChannel = vscode.window.createOutputChannel('VSBloom: Native Runtime');

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
			VSBloomNativeRuntimeManager.SetIsRunningState(false);

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

		VSBloomNativeRuntimeManager.isRunning = isNowRunning;
	}

	/**
	 * Checks whether the native runtime is active or not.
	 *
	 * @returns A boolean indicating whether the native runtime is active or not.
	 */
	public IsNativeRuntimeActive(): boolean {
		return (
			this.childProc !== null && !this.childProc.killed && this.childProc.exitCode === null
		);
	}

	/**
	 * Stops the native runtime if it was running.
	 */
	public StopNativeRuntime(): boolean {
		if (!this.IsNativeRuntimeActive()) {
			MainOutputChannel.Log(
				'warn',
				'A request was made to stop the native runtime, but it was not running.',
			);
			return false;
		}

		this.Log('debug', 'Stopping the native runtime...');
		this.childProc?.kill('SIGTERM');
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

		VSBloomNativeRuntimeManager.instance = null;
	}
}

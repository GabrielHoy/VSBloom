/**
 * VSBloom Main Output Channel
 * 
 * This file stands as a static singleton allowing anything
 * across VSBloom's Extension Host context to log messages directly
 * to the main output channel of the VSBloom extension, whether
 * because said component is too small to have its own channel,
 * or because its channel is not valid, not yet initialized, or
 * otherwise in an errorneous state.
 */

import * as vscode from 'vscode';
import { ConstructVSBloomLogPrefix } from '../Debug/Colorful';

export class MainOutputChannel implements vscode.Disposable {
    private static instance: MainOutputChannel | null = null;

    public static outputChannel: vscode.OutputChannel | null = null;

    private constructor() {
        MainOutputChannel.outputChannel = vscode.window.createOutputChannel('VSBloom: Main Output');
    }

    public static GetInstance(): MainOutputChannel {
        if (!MainOutputChannel.instance) {
            MainOutputChannel.instance = new MainOutputChannel();
        }
        return MainOutputChannel.instance;
    }

    public static Log(level: 'info' | 'warn' | 'error' | 'debug', message: string, data?: unknown): void {
        MainOutputChannel.outputChannel?.appendLine(
            `[VSBloom/${level.toUpperCase()}]: ${message} ${data ? JSON.stringify(data) : ''}`,
        );
        console.log(`${ConstructVSBloomLogPrefix('VSBloom', level)}${message}`, data ?? '');
    }

    public dispose(): void {
        MainOutputChannel.outputChannel?.dispose();
        MainOutputChannel.outputChannel = null;
        MainOutputChannel.instance = null;
    }
}
import type * as vscode from 'vscode';

/**
 * Minimal shapes of the VSBloom bridge/effect APIs used in Extension Host tests.
 * 
 * Defined locally so tests don't drag in the full src/ type graph.
 */

export interface TestBridgeServer {
	IsRunning(): boolean;
	GetServerPort(): number;
	GetAuthToken(): string;
	GetClientCount(): number;
	readonly OnClientReady: vscode.Event<string>;
	readonly OnClientDisconnected: vscode.Event<string>;
}

export interface TestEffectManager {
	GetLoadedEffects(): unknown[];
	IsEffectLoaded(name: string): boolean;
}

export interface TestPatchedAPI {
	isClientPatched: true;
	GetBridgeServer(): TestBridgeServer;
	GetEffectManager(): TestEffectManager;
}

export interface TestUnpatchedAPI {
	isClientPatched: false;
	unpatchedClientState: string;
}

export type TestExtensionAPI = TestPatchedAPI | TestUnpatchedAPI;

export interface TestExtensionExports {
	extensionAPI: Promise<TestExtensionAPI>;
}

/**
 * VSBloom Bridge: Server Contract
 *
 * This contract defines the exposed fields and API
 * for which anything that either *is* - or on the
 * flipside is *pretending* to be - a VSBloom Bridge
 * Server - must completely implement in order to be
 * considered valid and usable by the VSBloom extension.
 *
 * This is not meant to be a 'real' instantiable data
 * type of any kind - classes should implement it.
 *
 */

import type * as vscode from 'vscode';
import type { ExtensionToClientMessage } from '../API';

export interface VSBloomBridgeServerContract extends vscode.Disposable {
    Start(): Promise<void>;
    Stop(): Promise<void>;
    IsRunning(): boolean;
    GetServerPort(): number;
    GetAuthToken(): string;
    GetClientCount(): number;
    FireAllClients(message: ExtensionToClientMessage): void;
    FireClient(windowId: string, message: ExtensionToClientMessage): boolean;
    ReplicateExtensionConfigToAllClients(): void;
    GetContractExtendingInstance(): this;
    readonly OnServerDisconnected: vscode.Event<void>; // only Pseudo-Servers really care about this
}
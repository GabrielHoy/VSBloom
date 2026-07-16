import type { VSBloomClientConfig } from '../ExtensionBridge/API';
import type { VSBloomSharedState } from '../ExtensionBridge/SharedState';
import type { SyncPayload } from '../ExtensionBridge/SynchronizedState';
import type { PageDescriptor } from './Global/Pages.svelte';

//Bloom Extension -> Svelte
export interface SyncSettingsListMessage {
	type: 'sync-settings-list';
	data: VSBloomClientConfig;
}
export interface UpdateMetadataMessage {
	type: 'meta-update';
	data: {
		extensionVersion: string;
		isDevEnvironment: boolean;
		isClientPatched: boolean;
		clientPatchVersion: string;
	};
}
export interface ExternalPageSwapMessage {
	type: 'swap-page';
	data: {
		newPage: PageDescriptor['name'];
	};
}

export interface ReplicateSharedStateMessage {
    type: 'replicate-shared-state';
    data: SyncPayload<VSBloomSharedState>;
}

/**
 * A binary data-plane frame (see BinaryTransport.ts) relayed to the webview. The
 * bytes survive `webview.postMessage`'s structured clone as a `Uint8Array`; the
 * webview's stream hub decodes them. Kept out of the JSON control-plane message
 * shapes on purpose...this is intended to be a data firehose.
 */
export interface BinaryFrameMessage {
    type: 'binary-frame';
    data: Uint8Array;
}

export type BloomToSveltePayload =
	| SyncSettingsListMessage
	| UpdateMetadataMessage
	| ExternalPageSwapMessage
	| ReplicateSharedStateMessage
	| BinaryFrameMessage;

//Svelte -> Bloom Extension
export interface SendWindowNotificationMessage {
	type: 'send-notification';
	data: {
		type: 'info' | 'warning' | 'error';
		message: string;
	};
}
export interface WebviewReadyMessage {
	type: 'webview-ready';
	data: undefined;
}
export interface ChangeWebviewTitleMessage {
	type: 'change-title';
	data: {
		newTitle?: string;
	};
}
export interface UpdateSettingMessage {
	type: 'update-setting';
	data: {
		internalSettingPath: string;
		newValue: unknown;
	};
}
export interface RequestSettingsSyncMessage {
	type: 'request-settings-sync';
	data: undefined;
}
export interface RequestSharedStateSnapshotMessage {
    type: 'request-shared-state-snapshot';
    data: undefined;
}
export type SvelteToBloomPayload =
	| SendWindowNotificationMessage
	| WebviewReadyMessage
	| ChangeWebviewTitleMessage
	| UpdateSettingMessage
	| RequestSettingsSyncMessage
	| RequestSharedStateSnapshotMessage;

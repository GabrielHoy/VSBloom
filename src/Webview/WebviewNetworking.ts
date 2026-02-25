import type { VSBloomClientConfig } from "../ExtensionBridge/Bridge";

//Bloom Extension -> Svelte
export interface SyncSettingsListMessage {
    type: 'sync-settings-list',
    data: VSBloomClientConfig;
}
export interface UpdateMetadataMessage {
    type: 'meta-update',
    data: {
        extensionVersion: string;
        isDevEnvironment: boolean;
        isClientPatched: boolean;
        clientPatchVersion: string;
    }
}
export type BloomToSveltePayload = SyncSettingsListMessage | UpdateMetadataMessage;


//Svelte -> Bloom Extension
export interface SendWindowNotificationMessage {
    type: 'send-notification',
    data: {
        type: 'info' | 'warning' | 'error',
        message: string
    };
}
export interface WebviewReadyMessage {
    type: 'webview-ready',
    data: undefined;
}
export interface ChangeWebviewTitleMessage {
    type: 'change-title',
    data: {
        newTitle?: string
    };
}
export interface RequestCurrentSettingsMessage {
    type: 'request-current-settings',
    data: undefined;
}
export type SvelteToBloomPayload = SendWindowNotificationMessage | WebviewReadyMessage | ChangeWebviewTitleMessage | RequestCurrentSettingsMessage;

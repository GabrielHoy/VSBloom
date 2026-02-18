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
//TODO implement this on the extension side
export interface SendLogMessage {
    type: 'send-log',
    data: {
        level: 'debug' | 'info' | 'warning' | 'error',
        message: string,
        data?: unknown
    };
}
export interface RequestMetadataUpdateMessage {
    type: 'request-meta-update',
    data: undefined;
}
export type SvelteToBloomPayload = SendWindowNotificationMessage | SendLogMessage | RequestMetadataUpdateMessage;

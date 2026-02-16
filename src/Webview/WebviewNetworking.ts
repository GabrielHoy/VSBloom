//Bloom Extension -> Svelte
export interface SyncSettingsListMessage {
    type: 'sync-settings-list',
    data: unknown;
}
export type BloomToSveltePayload = SyncSettingsListMessage;


//Svelte -> Bloom Extension
export interface SendWindowNotificationMessage {
    type: 'send-notification',
    data: {
        type: 'info' | 'warning' | 'error',
        message: string
    };
}
export type SvelteToBloomPayload = SendWindowNotificationMessage;

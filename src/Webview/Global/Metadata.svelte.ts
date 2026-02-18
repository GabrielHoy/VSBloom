/**
 * Populated dynamically via a handshake with the VSCode extension.
 */
export const extensionMetadata = $state({
    metaLoaded: false,
    lastMetaUpdateTimestamp: 0,

    extensionVersion: '...',
    clientPatchVersion: '...',
    isClientPatched: false,
    isClientPatchOutOfDate: false,
    isDevEnvironment: false
});
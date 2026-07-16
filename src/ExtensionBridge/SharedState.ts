/**
 * VSBloom Shared State
 * 
 * Defines the structure and default values for
 * VSBloom's 'shared state', which is owned by
 * the main VSBloom Bridge Server and synchronized
 * across all of the transport boundaries that exist
 * across VSBloom(i.e the client, pseudo-servers, 
 * webview, etc.)
 */

import type { AudioDevice } from "../Native/Audio/AudioDevice";

export interface VSBloomSharedState {
    audio: {
        availableDevices: AudioDevice[];
    };
}

export const defaultVSBloomSharedState: VSBloomSharedState = {
    audio: {
        availableDevices: []
    }
};
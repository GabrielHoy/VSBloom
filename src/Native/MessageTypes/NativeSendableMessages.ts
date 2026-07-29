/**
 * Sendable Native Messages
 * 
 * Defines every message that the Bridge Server can send to the Native Runtime
 * in order to request various actions to be taken by the Native Runtime.
 * 
 * All messages that get exposed inside of the file located in the
 * Native Runtime's codebase at `cpp/src/IPC/Methods/IPCMethods.cpp`
 * should thusly be defined here as well to complete the 'bridge'
 * between the Native Runtime and the Bridge Server's IPC-based
 * communication mechanism. Currently this is a manual process.
 */

import { AudioDevice } from "../Audio/AudioDevice";

interface NativeSendableInterfaceMapping {
    /**
     * Expected NativeReceivable Response: `SecureAcknowledgement`
    */
    'TestSecuredMessage': {
        type: 'test-secure-message',
        data: {
            message: string
        };
    };
    /**
     * Only available in `-DDEBUG` builds of the VSBloom Native Runtime.
     * 
     * Currently the `message` field is unused.
    */
    'DebugTestMessage': {
        type: 'debug-test-message',
        data: {
            message: string
        };
    };
    /**
     * Expected NativeReceivable Response: `AvailableAudioDeviceList`
    */
    'GetAvailableAudioDevices': {
        type: 'get-available-audio-devices',
        data: never;
    };
    /**
     * Expected NativeReceivable Response: `CurrentlyCapturedAudioDeviceList`
     * 
     * Said response will echo back the list of audio device ID's *actually* being
     * captured by the Native Runtime, since they may differ from the list
     * that we request to be captured if something goes wrong with capturing
     * or if we send over some kind of invalid ID list, etc.
    */
    'SetCurrentlyCapturedAudioDevices': {
        type: 'set-currently-captured-audio-devices',
        data: {
            /**
             * A list of audio device ID's that are to be captured,
             * corresponding to the ID's of AudioDevice objects obtained from
             * the `AvailableAudioDeviceList` message.
             */
            devices: AudioDevice["id"][];
        };
    };
    /**
     * Expected NativeReceivable Response: `CurrentlyCapturedAudioDeviceList`
    */
    'GetCurrentlyCapturedAudioDevices': {
        type: 'get-currently-captured-audio-devices',
        data: never;
    };
}

export type Messages = {
    [K in keyof NativeSendableInterfaceMapping]: NativeSendableInterfaceMapping[K]
};
export type MessagePayload = Messages[keyof Messages];
export type MessageData = MessagePayload["data"];
export type MessageType = MessagePayload["type"];
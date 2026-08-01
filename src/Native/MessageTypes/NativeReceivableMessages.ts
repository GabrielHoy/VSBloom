/**
 * Receivable Native Messages
 * 
 * Defines every message that the Native Runtime can send to the Bridge Server
 * either in response to some message we sent them, or as an independent event
 * to invoke some action on our part.
 * 
 * All messages that get exposed inside of the file located in the
 * Native Runtime's codebase at `cpp/src/IPC/IPCSendables.hpp`
 * should thusly be defined here as well to complete the 'bridge'
 * between the Native Runtime and the Bridge Server's IPC-based
 * communication mechanism. Currently this is a manual process.
 */

import { AnalyzedAudioFrame } from "../Audio/AnalysisFrames";
import { AudioDevice } from "../Audio/AudioDevice";

interface NativeReceivableInterfaceMapping {
    'MethodExceptionRaised': {
        type: 'method-exception';
        data: {
            methodThatThrew: string;
            exceptionThrown: string;
        };
    };
    'StartupSuccess': {
        type: 'i-am-alive';
        data: {
            /**
             * This will be a hex-encoded 32-byte AES-256 key.
             * Every message sent (after this one is received from the
             * Native Runtime) should be AES-256-GCM encrypted with it.
            */ 
            k: string;
        };
    };
    'SecureAcknowledgement': {
        type: 'secure-acknowledgement';
        data: {
            acknowledgement: string;
        };
    };
    'AvailableAudioDeviceList': {
        type: 'available-audio-device-list';
        data: AudioDevice[];
    };
    'CurrentlyCapturedAudioDeviceList': {
        type: 'currently-captured-audio-device-list';
        /**
         * A list of audio device ID's that are currently being captured,
         * corresponding to the ID's of AudioDevice objects obtained from
         * the `AvailableAudioDeviceList` message.
         * 
         * Might be `null` if the list of captured devices isn't available,
         * the most likely case for this is when the user isn't capturing
         * any audio or the AudioCaptureState generally isn't initialized
         * on the C++ side of things - see `AudioCaptureState.hpp` for more
         * if something isn't right here
         */
        data?: AudioDevice["id"][];
    }
    'NewAudioAnalysisFrame': {
        type: 'new-audio-analysis-frame';
        data: AnalyzedAudioFrame;
    };
}

export type Messages = {
    [K in keyof NativeReceivableInterfaceMapping]: NativeReceivableInterfaceMapping[K]
};
export type MessagePayload = Messages[keyof Messages];
export type MessageData = MessagePayload["data"];
export type MessageType = MessagePayload["type"];
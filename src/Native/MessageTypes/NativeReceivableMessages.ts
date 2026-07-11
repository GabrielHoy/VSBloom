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

export interface NativeReceivableMethodExceptionRaisedMessage {
    type: 'method-exception';
    data: {
        methodThatThrew: string;
        exceptionThrown: string;
    };
}

export interface NativeReceivableStartupSuccessMessage {
    type: 'i-am-alive';
    data: {
        // This will be a hex-encoded 32-byte AES-256 key.
        // Every message sent after this one is received from the
        // Native Runtime should be AES-256-GCM encrypted with it.
        k: string;
    };
}

export interface NativeReceivableSecureAcknowledgementMessage {
    type: 'secure-acknowledgement';
    data: {
        acknowledgement: string;
    };
}

export interface NativeReceivableAvailableAudioDeviceListMessage {
    type: 'available-audio-device-list';
    data: AudioDevice[];
}

export interface NativeReceivableNewAudioAnalysisFrameMessage {
    type: 'new-audio-analysis-frame';
    data: AnalyzedAudioFrame;
}

export type NativeReceivableMessage =
    NativeReceivableStartupSuccessMessage |
    NativeReceivableMethodExceptionRaisedMessage |
    NativeReceivableSecureAcknowledgementMessage |
    NativeReceivableAvailableAudioDeviceListMessage | 
    NativeReceivableNewAudioAnalysisFrameMessage;
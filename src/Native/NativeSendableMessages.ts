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

//Expected response: NativeReceivableSecureAcknowledgementMessage
export interface NativeSendableTestSecuredMessage {
    type: 'test-secure-message';
    data: {
        message: string;
    };
}

export type NativeSendableMessage = NativeSendableTestSecuredMessage;
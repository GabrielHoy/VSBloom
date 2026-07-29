/**
 * VSBloom Sendable Native Messages
 *
 * Defines the various messages that the VSBloom Bridge Server
 * can send over to the Native Runtime in order to interact with
 * and control Native Runtime functionality, as well messages that
 * the Native Runtime may send to the Bridge Server - either in
 * response to a message we sent it, or as an independent event
 * to invoke some action on our part.
 */

//Forward declarations along so we don't have to individually
//import sendables/receivables separately
export * as Receivable from './MessageTypes/NativeReceivableMessages';
export * as Sendable from './MessageTypes/NativeSendableMessages';
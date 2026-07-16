/**
 * VSBloom Binary Channel Registry
 *
 * The single composition root that binds each BinaryChannelId to its payload
 * codec. BinaryTransport.ts stays domain-agnostic (envelope + hub only); this
 * module is the one place that knows *which* streams exist and how to decode
 * them, so producers and consumers can't disagree on the wire format.
 *
 * Consumers import the typed channel handle (e.g. `AudioAnalysisFrameChannel`)
 * and Subscribe / GetLatest with it - `T` flows from the handle, so frames come
 * back fully typed with no casts. Adding a stream = add a codec, declare a
 * `BinaryChannel<T>` here, and drop it in `ALL_BINARY_CHANNELS`.
 */

import {
	type BinaryChannel,
	BinaryChannelId,
	type BinaryStreamHub,
} from './BinaryTransport';
import {
	DecodeAudioAnalysisPayload,
	type DecodedAudioAnalysisFrame,
} from '../Native/Audio/AudioAnalysisFrameCodec';

/** Log-binned FFT spectrum + average amplitude, emitted by the native runtime. */
export const AudioAnalysisFrameChannel: BinaryChannel<DecodedAudioAnalysisFrame> = {
	id: BinaryChannelId.AudioAnalysisFrame,
	decode: DecodeAudioAnalysisPayload,
};

/** Every built-in channel, for bulk registration on a hub. */
const ALL_BINARY_CHANNELS: readonly BinaryChannel<unknown>[] = [AudioAnalysisFrameChannel];

/**
 * Register every built-in channel's decoder on a hub so incoming frames are
 * decoded once on ingest. Call this right after constructing a consumer-side hub
 * (Electron client + webview). Subscribe self-registers too, but this makes
 * GetLatest-only consumers work before any subscription exists.
 */
export function RegisterBuiltinBinaryChannels(hub: BinaryStreamHub): void {
	for (const channel of ALL_BINARY_CHANNELS) {
		hub.RegisterChannel(channel);
	}
}

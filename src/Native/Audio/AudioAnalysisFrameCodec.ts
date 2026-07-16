/**
 * Audio Analysis Frame Codec
 *
 * The domain-specific payload codec for the `AudioAnalysisFrame` binary channel.
 * The generic envelope (BinaryTransport.ts) is audio-agnostic, so only this file
 * knows the on-wire layout of an analyzed audio frame...that being:
 *   [ f32 avgAmplitude ][ f32 * N fftBins ]
 *
 * `binCount` is recovered from the payload byte length, so the frame is fully
 * self-describing without a per-payload sub-header thankfully.
 */

import type { AnalyzedAudioFrame } from './AnalysisFrames';

/**
 * The decoded audio frame. `fftBins` is a `Float32Array` view over the decoded
 * payload buffer (zero-copy) - do not retain it past the frame's lifetime if the
 * consumer recycles buffers; copy if you need to hold it.
 */
export interface DecodedAudioAnalysisFrame {
	avgAmplitude: number;
	fftBins: Float32Array;
}

/**
 * Pack an `AnalyzedAudioFrame` (as delivered by the native runtime, `number[]`
 * bins) into the audio channel's binary payload.
 */
export function EncodeAudioAnalysisPayload(frame: AnalyzedAudioFrame): ArrayBuffer {
	const binCount = frame.fftBins.length;
	const buffer = new ArrayBuffer(4 + binCount * 4);

	new DataView(buffer).setFloat32(0, frame.avgAmplitude, true);
	// Float32Array view fills the bins region directly - the number[] -> f32
	// narrowing happens here, once, on the producer side.
	new Float32Array(buffer, 4, binCount).set(frame.fftBins);

	return buffer;
}

/**
 * Unpack an audio channel payload (the `payload` from a DecodedBinaryFrame) back
 * into scalars + a typed bin array.
 */
export function DecodeAudioAnalysisPayload(payload: ArrayBuffer): DecodedAudioAnalysisFrame {
	const avgAmplitude = new DataView(payload).getFloat32(0, true);
	const fftBins = new Float32Array(payload, 4, (payload.byteLength - 4) / 4);

	return { avgAmplitude, fftBins };
}

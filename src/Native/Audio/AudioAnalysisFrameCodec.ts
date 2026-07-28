/**
 * Audio Analysis Frame Codec
 *
 * The domain-specific payload codec for the `AudioAnalysisFrame` binary channel.
 * The generic envelope (BinaryTransport.ts) is audio-agnostic, so only this file
 * knows the on-wire layout of an analyzed audio frame...that being:
 *   [ f32 avgAmplitude ][ f32 * N instEQBands ][ f32 * N smoothEQBands ][ f32 * N fftBins ]
 *
 * `binCount` is recovered from the payload byte length, so the frame is fully
 * self-describing without a per-payload sub-header thankfully.
 * 
 * The number of `eqBands` as well as what the array indexes map to when encoded
 * is fully defined in the `audioEQBandNames` array as well, so we don't need to
 * send that data over the wire either.
 */

import { type AnalyzedAudioFrame, AudioEQBand } from './AnalysisFrames';

/**
 * The decoded audio frame. `fftBins` is a `Float32Array` view over the decoded
 * payload buffer (zero-copy) - do not retain it past the frame's lifetime if the
 * consumer recycles buffers; copy if you need to hold it.
 */
export interface DecodedAudioAnalysisFrame {
    avgAmplitude: number;
    instEQ: Float32Array;
    smoothEQ: Float32Array;
	fftBins: Float32Array;
}

const ENCODED_AVG_AMPLITUDE_BYTE_SIZE = 4;

// x2 to encode both instantaneous and smoothed EQ bands
const ENCODED_EQ_BYTE_SIZE = (AudioEQBand.__Count__ * Float32Array.BYTES_PER_ELEMENT) * 2;

/**
 * Pack an `AnalyzedAudioFrame` (as delivered by the native runtime, `number[]`
 * eq bands & fft bins) into the audio channel's binary payload.
 */
export function EncodeAudioAnalysisPayload(frame: AnalyzedAudioFrame): ArrayBuffer {
	const binCount = frame.fftBins.length;
    const fftBinsByteSize = binCount * Float32Array.BYTES_PER_ELEMENT;

    const totalBufferSizeNeeded = ENCODED_AVG_AMPLITUDE_BYTE_SIZE + ENCODED_EQ_BYTE_SIZE + fftBinsByteSize;
	const buffer = new ArrayBuffer(totalBufferSizeNeeded);

    // Encode the average amplitude
	new DataView(buffer).setFloat32(0, frame.avgAmplitude, true);
    
    // Encode the Instant & Smoothed EQ bands
    new Float32Array(buffer, ENCODED_AVG_AMPLITUDE_BYTE_SIZE, AudioEQBand.__Count__).set(frame.instEQ);
    new Float32Array(buffer, ENCODED_AVG_AMPLITUDE_BYTE_SIZE + (AudioEQBand.__Count__ * Float32Array.BYTES_PER_ELEMENT), AudioEQBand.__Count__).set(frame.smoothEQ);

	// Float32Array view fills the bins region directly - the number[] -> f32
	// narrowing happens here, once, on the producer side.
	new Float32Array(buffer, (ENCODED_AVG_AMPLITUDE_BYTE_SIZE + ENCODED_EQ_BYTE_SIZE), binCount).set(frame.fftBins);

	return buffer;
}

/**
 * Unpack an audio channel payload (the `payload` from a DecodedBinaryFrame) back
 * into scalars + a typed bin array.
 */
export function DecodeAudioAnalysisPayload(payload: ArrayBuffer): DecodedAudioAnalysisFrame {
	const avgAmplitude = new DataView(payload).getFloat32(0, true);

    const instEQ = new Float32Array(payload, ENCODED_AVG_AMPLITUDE_BYTE_SIZE, AudioEQBand.__Count__);
    const smoothEQ = new Float32Array(payload, ENCODED_AVG_AMPLITUDE_BYTE_SIZE + (AudioEQBand.__Count__ * Float32Array.BYTES_PER_ELEMENT), AudioEQBand.__Count__);

	const fftBins = new Float32Array(payload, ENCODED_AVG_AMPLITUDE_BYTE_SIZE + ENCODED_EQ_BYTE_SIZE, (payload.byteLength - ENCODED_AVG_AMPLITUDE_BYTE_SIZE - ENCODED_EQ_BYTE_SIZE) / Float32Array.BYTES_PER_ELEMENT);

	return { avgAmplitude, instEQ, smoothEQ, fftBins };
}

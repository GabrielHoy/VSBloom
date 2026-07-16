import { describe, expect, test, vi } from 'vitest';
import {
	BINARY_FRAME_HEADER_BYTES,
	type BinaryChannel,
	BinaryChannelId,
	BinaryStreamHub,
	DecodeBinaryFrame,
	EncodeBinaryFrame,
} from '../../../src/ExtensionBridge/BinaryTransport';
import {
	DecodeAudioAnalysisPayload,
	EncodeAudioAnalysisPayload,
} from '../../../src/Native/Audio/AudioAnalysisFrameCodec';

function makeF32Payload(values: number[]): ArrayBuffer {
	return Float32Array.from(values).buffer;
}

describe('BinaryTransport envelope', () => {
	test('round-trips channel, seq, timestamp, and payload bytes', () => {
		const payload = makeF32Payload([1, 2, 3, 4]);
		const buffer = EncodeBinaryFrame(BinaryChannelId.AudioAnalysisFrame, 42, 123.5, payload);

		const decoded = DecodeBinaryFrame(buffer);
		expect(decoded).not.toBeNull();
		if (!decoded) {
			throw new Error('expected a decoded frame');
		}

		expect(decoded.channelId).toBe(BinaryChannelId.AudioAnalysisFrame);
		expect(decoded.seq).toBe(42);
		expect(decoded.timestampMs).toBe(123.5);
		expect(new Float32Array(decoded.payload)).toEqual(new Float32Array([1, 2, 3, 4]));
	});

	test('accepts a Uint8Array view (Node ws / webview clone shape)', () => {
		const buffer = EncodeBinaryFrame(BinaryChannelId.AudioAnalysisFrame, 1, 0, makeF32Payload([9]));
		// Wrap in a Uint8Array sitting at a non-zero offset inside a larger buffer,
		// mimicking a Node Buffer that views into a shared pool.
		const backing = new Uint8Array(buffer.byteLength + 8);
		backing.set(new Uint8Array(buffer), 8);
		const view = backing.subarray(8);

		const decoded = DecodeBinaryFrame(view);
		expect(decoded).not.toBeNull();
		expect(decoded?.seq).toBe(1);
		expect(new Float32Array(decoded?.payload as ArrayBuffer)).toEqual(new Float32Array([9]));
	});

	test('decoded payload is a standalone, correctly-aligned buffer', () => {
		const buffer = EncodeBinaryFrame(BinaryChannelId.AudioAnalysisFrame, 1, 0, makeF32Payload([7]));
		const decoded = DecodeBinaryFrame(buffer);
		if (!decoded) {
			throw new Error('expected a decoded frame');
		}

		// Not aliasing the source envelope, and a Float32Array view over it is legal.
		expect(decoded.payload.byteLength).toBe(4);
		expect(decoded.payload).not.toBe(buffer);
		expect(() => new Float32Array(decoded.payload)).not.toThrow();
	});

	test('empty payload round-trips', () => {
		const buffer = EncodeBinaryFrame(7, 3, 0, new ArrayBuffer(0));
		const decoded = DecodeBinaryFrame(buffer);
		expect(decoded?.channelId).toBe(7);
		expect(decoded?.payload.byteLength).toBe(0);
	});

	test('rejects a buffer that is too short to hold a header', () => {
		expect(DecodeBinaryFrame(new ArrayBuffer(BINARY_FRAME_HEADER_BYTES - 1))).toBeNull();
	});

	test('rejects a wrong magic', () => {
		const buffer = EncodeBinaryFrame(1, 1, 0, makeF32Payload([1]));
		new DataView(buffer).setUint32(0, 0xdeadbeef, true);
		expect(DecodeBinaryFrame(buffer)).toBeNull();
	});

	test('rejects a truncated payload', () => {
		const buffer = EncodeBinaryFrame(1, 1, 0, makeF32Payload([1, 2, 3]));
		// Lop off the last 4 bytes so payloadByteLength overshoots the real length.
		const truncated = buffer.slice(0, buffer.byteLength - 4);
		expect(DecodeBinaryFrame(truncated)).toBeNull();
	});
});

describe('AudioAnalysisCodec', () => {
	test('round-trips avgAmplitude and fftBins through the full envelope', () => {
		const frame = { avgAmplitude: 0.5, fftBins: [0.1, 0.2, 0.3, 0.4, 0.5] };

		const envelope = EncodeBinaryFrame(
			BinaryChannelId.AudioAnalysisFrame,
			1,
			0,
			EncodeAudioAnalysisPayload(frame),
		);
		const decodedFrame = DecodeBinaryFrame(envelope);
		if (!decodedFrame) {
			throw new Error('expected a decoded frame');
		}

		const audio = DecodeAudioAnalysisPayload(decodedFrame.payload);
		// Float32 precision: compare with tolerance rather than exact equality.
		expect(audio.avgAmplitude).toBeCloseTo(0.5, 6);
		expect(audio.fftBins).toHaveLength(5);
		for (let i = 0; i < frame.fftBins.length; i++) {
			expect(audio.fftBins[i]).toBeCloseTo(frame.fftBins[i], 6);
		}
	});

	test('handles an empty spectrum', () => {
		const audio = DecodeAudioAnalysisPayload(
			EncodeAudioAnalysisPayload({ avgAmplitude: 0, fftBins: [] }),
		);
		expect(audio.fftBins).toHaveLength(0);
		expect(audio.avgAmplitude).toBe(0);
	});
});

describe('BinaryStreamHub', () => {
	function frameFor(channelId: number, seq: number, values: number[]): ArrayBuffer {
		return EncodeBinaryFrame(channelId, seq, seq, makeF32Payload(values));
	}

	// A test channel whose decoder simply views the payload as a Float32Array.
	function f32Channel(id: number): BinaryChannel<Float32Array> {
		return { id, decode: (payload) => new Float32Array(payload) };
	}

	test('decodes once and stores the latest value per channel', () => {
		const hub = new BinaryStreamHub();
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);
		const hold = hub.Listen(channel);

		hub.Ingest(frameFor(channel.id, 1, [1]));
		hub.Ingest(frameFor(channel.id, 2, [2]));

		const latest = hold.GetLatest();
		expect(latest?.seq).toBe(2);
		expect(latest?.value).toEqual(new Float32Array([2]));
	});

	test('keeps channels independent', () => {
		const hub = new BinaryStreamHub();
		const holdA = hub.Listen(f32Channel(1));
		const holdB = hub.Listen(f32Channel(2));
		const holdC = hub.Listen(f32Channel(3));

		hub.Ingest(frameFor(1, 5, [10]));
		hub.Ingest(frameFor(2, 1, [20]));

		expect(holdA.GetLatest()?.seq).toBe(5);
		expect(holdB.GetLatest()?.seq).toBe(1);
		expect(holdC.GetLatest()).toBeNull();
	});

	test('decodes exactly once regardless of subscriber count', () => {
		const hub = new BinaryStreamHub();
		const decode = vi.fn((payload: ArrayBuffer) => new Float32Array(payload));
		const channel: BinaryChannel<Float32Array> = {
			id: BinaryChannelId.AudioAnalysisFrame,
			decode,
		};

		hub.Subscribe(channel, () => {});
		hub.Subscribe(channel, () => {});
		hub.Subscribe(channel, () => {});

		hub.Ingest(frameFor(channel.id, 1, [1]));
		expect(decode).toHaveBeenCalledTimes(1);
	});

	test('hands every subscriber the same already-decoded value instance', () => {
		const hub = new BinaryStreamHub();
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);
		const seen: Float32Array[] = [];
		hub.Subscribe(channel, (frame) => seen.push(frame.value));
		hub.Subscribe(channel, (frame) => seen.push(frame.value));

		const hold = hub.Listen(channel);
		hub.Ingest(frameFor(channel.id, 1, [7]));
		expect(seen).toHaveLength(2);
		// Same decoded object across subscribers - not re-decoded per listener.
		expect(seen[0]).toBe(seen[1]);
		expect(seen[0]).toBe(hold.GetLatest()?.value);
	});

	test('Subscribe fires once per frame on its channel and unsubscribe stops it', () => {
		const hub = new BinaryStreamHub();
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);
		const otherChannel = f32Channel(99);
		hub.RegisterChannel(otherChannel);

		const listener = vi.fn();
		const unsubscribe = hub.Subscribe(channel, listener);

		hub.Ingest(frameFor(channel.id, 1, [1]));
		hub.Ingest(frameFor(channel.id, 2, [2]));
		expect(listener).toHaveBeenCalledTimes(2);

		// A frame on a different channel must not notify this listener.
		hub.Ingest(frameFor(otherChannel.id, 1, [3]));
		expect(listener).toHaveBeenCalledTimes(2);

		unsubscribe();
		hub.Ingest(frameFor(channel.id, 3, [3]));
		expect(listener).toHaveBeenCalledTimes(2);
	});

	test('drops frames on channels with no registered decoder', () => {
		const hub = new BinaryStreamHub();
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);

		// Nothing has registered or held this channel yet, so the frame has no decoder.
		hub.Ingest(frameFor(channel.id, 1, [1]));

		// Acquiring registers the decoder - but the earlier frame must have been
		// dropped outright, not stashed away raw and decoded retroactively.
		expect(hub.Listen(channel).GetLatest()).toBeNull();
	});

	test('a throwing decoder drops the frame without notifying', () => {
		const hub = new BinaryStreamHub();
		const listener = vi.fn();
		const channel: BinaryChannel<Float32Array> = {
			id: BinaryChannelId.AudioAnalysisFrame,
			decode: () => {
				throw new Error('bad payload');
			},
		};
		hub.Subscribe(channel, listener);
		const hold = hub.Listen(channel);

		expect(() => hub.Ingest(frameFor(channel.id, 1, [1]))).not.toThrow();
		expect(listener).not.toHaveBeenCalled();
		expect(hold.GetLatest()).toBeNull();
	});

	test('ignores a malformed frame without throwing or notifying', () => {
		const hub = new BinaryStreamHub();
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);
		const listener = vi.fn();
		hub.Subscribe(channel, listener);
		const hold = hub.Listen(channel);

		expect(() => hub.Ingest(new ArrayBuffer(4))).not.toThrow();
		expect(listener).not.toHaveBeenCalled();
		expect(hold.GetLatest()).toBeNull();
	});

	test('a throwing listener does not wedge others', () => {
		const hub = new BinaryStreamHub();
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);
		const good = vi.fn();
		hub.Subscribe(channel, () => {
			throw new Error('boom');
		});
		hub.Subscribe(channel, good);

		expect(() => hub.Ingest(frameFor(channel.id, 1, [1]))).not.toThrow();
		expect(good).toHaveBeenCalledTimes(1);
	});
});

describe('BinaryStreamHub demand gating', () => {
	function frameFor(channelId: number, seq: number, values: number[]): ArrayBuffer {
		return EncodeBinaryFrame(channelId, seq, seq, makeF32Payload(values));
	}
	function f32Channel(id: number): BinaryChannel<Float32Array> {
		return { id, decode: (payload) => new Float32Array(payload) };
	}

	test('reports only demand edges, not every hold', () => {
		const hub = new BinaryStreamHub();
		const observer = vi.fn();
		hub.SetDemandObserver(observer);
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);

		const first = hub.Listen(channel);
		const second = hub.Listen(channel);
		const third = hub.Listen(channel);

		// Three holds, but only the 0 -> 1 transition is worth a round-trip upstream.
		expect(observer).toHaveBeenCalledTimes(1);
		expect(observer).toHaveBeenCalledWith(channel.id, true);

		first.Release();
		second.Release();
		expect(observer).toHaveBeenCalledTimes(1); // still held by `third`

		third.Release();
		expect(observer).toHaveBeenCalledTimes(2);
		expect(observer).toHaveBeenLastCalledWith(channel.id, false);
	});

	test('Subscribe holds the channel and unsubscribing drops it', () => {
		const hub = new BinaryStreamHub();
		const observer = vi.fn();
		hub.SetDemandObserver(observer);
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);

		const unsubscribe = hub.Subscribe(channel, () => {});
		expect(hub.HasDemandFor(channel.id)).toBe(true);

		unsubscribe();
		expect(hub.HasDemandFor(channel.id)).toBe(false);
		expect(observer).toHaveBeenLastCalledWith(channel.id, false);
	});

	test('a double Release does not corrupt the ref-count', () => {
		const hub = new BinaryStreamHub();
		const observer = vi.fn();
		hub.SetDemandObserver(observer);
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);

		const first = hub.Listen(channel);
		const second = hub.Listen(channel);

		first.Release();
		first.Release(); // a sloppy caller must not release `second`'s hold for it
		expect(hub.HasDemandFor(channel.id)).toBe(true);
		expect(observer).toHaveBeenCalledTimes(1);

		second.Release();
		expect(hub.HasDemandFor(channel.id)).toBe(false);
	});

	test('a double unsubscribe does not corrupt the ref-count', () => {
		const hub = new BinaryStreamHub();
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);

		const unsubscribeFirst = hub.Subscribe(channel, () => {});
		hub.Subscribe(channel, () => {});

		unsubscribeFirst();
		unsubscribeFirst();
		expect(hub.HasDemandFor(channel.id)).toBe(true);
	});

	test('GetHeldChannels reports exactly what is held, for reconnect re-announcement', () => {
		const hub = new BinaryStreamHub();
		const holdA = hub.Listen(f32Channel(1));
		hub.Listen(f32Channel(2));

		expect([...hub.GetHeldChannels()].sort()).toEqual([1, 2]);

		holdA.Release();
		expect(hub.GetHeldChannels()).toEqual([2]);
	});

	test('a released hold reads null even if frames are still arriving', () => {
		const hub = new BinaryStreamHub();
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);
		const keepAlive = hub.Listen(channel);
		const hold = hub.Listen(channel);

		hub.Ingest(frameFor(channel.id, 1, [1]));
		expect(hold.GetLatest()).not.toBeNull();

		hold.Release();
		hub.Ingest(frameFor(channel.id, 2, [2]));
		expect(hold.GetLatest()).toBeNull();
		// ...but the still-live hold is unaffected.
		expect(keepAlive.GetLatest()?.seq).toBe(2);
	});

	test('drops the cached frame when demand goes dark, so a later hold sees no stale data', () => {
		const hub = new BinaryStreamHub();
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);

		const hold = hub.Listen(channel);
		hub.Ingest(frameFor(channel.id, 1, [1]));
		expect(hold.GetLatest()?.seq).toBe(1);
		hold.Release();

		// Re-acquiring after a gap must not resurrect a frame from whenever demand
		// last lapsed - for a firehose, an old frame is worse than no frame.
		expect(hub.Listen(channel).GetLatest()).toBeNull();
	});

	test('a throwing demand observer does not corrupt the ref-count', () => {
		const hub = new BinaryStreamHub();
		hub.SetDemandObserver(() => {
			throw new Error('transport is down');
		});
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);

		expect(() => hub.Listen(channel)).not.toThrow();
		expect(hub.HasDemandFor(channel.id)).toBe(true);
	});

	test('frames still ingest normally while held', () => {
		const hub = new BinaryStreamHub();
		const channel = f32Channel(BinaryChannelId.AudioAnalysisFrame);
		const listener = vi.fn();
		hub.Subscribe(channel, listener);

		hub.Ingest(frameFor(channel.id, 1, [1]));
		expect(listener).toHaveBeenCalledTimes(1);
	});
});

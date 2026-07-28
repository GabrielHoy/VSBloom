/**
 * VSBloom Binary Transport Protocol
 *
 * A tiny, transport-agnostic framing format for VSBloom's data plane -
 * high-throughput, drop-newest streams that shouldn't ride the JSON control
 * plane (for that, we currently utilize SynchronizedState.ts).
 *
 * The envelope is channel-tagged; every frame carries a `channelId` so a single
 * binary pipe can multiplex N independent streams together. Adding a new stream
 * goes roughly along the lines of "reserve a BinaryChannelId, write a payload codec",
 * this saves us from being stuck in message-contract hell when making changes to
 * broadcast paths or trying to manage pseudo-server / webview / main bridge / etc.
 * synchronization all the time.
 *
 * This MUST be kept environment-agnostic since it's a shared module between all
 * of VSBloom's transport boundaries.
 *
 * (Endianness note: the header is written/read with explicit little-endian
 * DataView calls. Payloads may use platform-endian typed-array views since
 * every VSBloom process runs on the same machine, so producer and consumer
 * endianness always just-so-happen to match.)
 */

/** "VBLM" - cheap sanity check so a garbage frame can't be
 * somehow misread as a stream frame. */
export const BINARY_FRAME_HEADER_IDENTIFIER = 0x56424c4d;
export const BINARY_FRAME_VERSION = 1;
export const BINARY_FRAME_HEADER_BYTES = 24;

/**
 * Central registry of stream channels.
 *
 * a future stream reserves an ID here; everything else forms around it.
 */
export enum BinaryChannelId {
	AudioAnalysisFrame = 1,
}

/**
 * A parsed envelope whose payload is still raw bytes. This is the low-level
 * result of DecodeBinaryFrame; consumers generally never touch it - the hub
 * decodes the payload into a domain `value` (DecodedBinaryFrame<T>) exactly once
 * on ingest before fanning it out.
 *
 * `payload` is a fresh, standalone `ArrayBuffer` (8-aligned, so any typed-array
 * view over it should be legal) owned by this frame.
 */
export interface RawBinaryFrame {
	channelId: number;
	/** 'Monotonic' per-channel counter assigned by the producer. Drop diagnostics **only**. */
	seq: number;
	/** Producer-side timestamp, in milliseconds. */
	timestampMs: number;
	payload: ArrayBuffer;
}

/** Turns a channel's raw payload buffer into its decoded domain value. */
export type BinaryPayloadDecoder<T> = (payload: ArrayBuffer) => T;

/**
 * A typed channel handle: its numeric id plus the decoder that turns raw payload
 * bytes into a domain value. This is the unit you register on a hub and the typed
 * key you Subscribe / GetLatest with - `T` flows from here, so consumers get full
 * type inference without restating types or casting. Define channels in one place
 * (BinaryChannels.ts) so producers and consumers agree on the wire format.
 */
export interface BinaryChannel<T> {
	readonly id: number;
	readonly decode: BinaryPayloadDecoder<T>;
}

/**
 * A fully decoded frame as delivered by the hub: envelope metadata plus the
 * channel's domain payload `value`, decoded exactly once on ingest and shared by
 * every subscriber / GetLatest reader.
 */
export interface DecodedBinaryFrame<T> {
	channelId: number;
	seq: number;
	timestampMs: number;
	value: T;
}

/** Coerce any buffer/view into a Uint8Array over exactly its bytes w/o a copy. */
function AsByteView(payload: ArrayBuffer | ArrayBufferView): Uint8Array {
	if (payload instanceof ArrayBuffer) {
		return new Uint8Array(payload);
	}
	return new Uint8Array(payload.buffer, payload.byteOffset, payload.byteLength);
}

/**
 * Frame a payload into a self-describing binary envelope. The returned buffer is
 * ready to hand straight to `ws.send(buffer, { binary: true })` or to wrap in a
 * `Uint8Array` for `webview.postMessage`.
 */
export function EncodeBinaryFrame(
	channelId: number,
	seq: number,
	timestampMs: number,
	payload: ArrayBuffer | ArrayBufferView,
): ArrayBuffer {
	const payloadBytes = AsByteView(payload);
	const buffer = new ArrayBuffer(BINARY_FRAME_HEADER_BYTES + payloadBytes.byteLength);
	const view = new DataView(buffer);

	view.setUint32(0, BINARY_FRAME_HEADER_IDENTIFIER, true);
	view.setUint16(4, channelId, true);
	view.setUint8(6, BINARY_FRAME_VERSION);
	view.setUint8(7, 0); // flags (reserved)
	view.setFloat64(8, timestampMs, true);
	view.setUint32(16, seq >>> 0, true);
	view.setUint32(20, payloadBytes.byteLength, true);

	new Uint8Array(buffer, BINARY_FRAME_HEADER_BYTES).set(payloadBytes);
	return buffer;
}

/**
 * Parse an envelope. Returns `null` (never throws) for anything that isn't a
 * well-formed VSBloom binary frame, so a malformed frame is ignored rather than
 * ending up wedging any consumers downstream.
 *
 * Accepts either an `ArrayBuffer` (browser `WebSocket` with binaryType `arraybuffer`)
 * or a `Uint8Array` (Node `ws` Buffer / webview structured-clone).
 */
export function DecodeBinaryFrame(input: ArrayBuffer | Uint8Array): RawBinaryFrame | null {
	// Normalize to a byte view over exactly the frame's bytes. Using the view's
	// own buffer/offset keeps this zero-copy for the most common Node-Buffer case.
	const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);

	if (bytes.byteLength < BINARY_FRAME_HEADER_BYTES) {
		return null;
	}

	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	if (view.getUint32(0, true) !== BINARY_FRAME_HEADER_IDENTIFIER) {
		return null;
	}
	if (view.getUint8(6) !== BINARY_FRAME_VERSION) {
		return null;
	}

	const channelId = view.getUint16(4, true);
	const timestampMs = view.getFloat64(8, true);
	const seq = view.getUint32(16, true);
	const payloadByteLength = view.getUint32(20, true);

	if (BINARY_FRAME_HEADER_BYTES + payloadByteLength > bytes.byteLength) {
		return null; // truncated
	}

	// A fresh, standalone, 8-aligned ArrayBuffer that outlives the source, should
	// be safe for any typed-array view a payload codec might construct over it.
	const payload = new ArrayBuffer(payloadByteLength);
	new Uint8Array(payload).set(
		bytes.subarray(BINARY_FRAME_HEADER_BYTES, BINARY_FRAME_HEADER_BYTES + payloadByteLength),
	);

	return { channelId, seq, timestampMs, payload };
}

export type BinaryFrameListener<T> = (frame: DecodedBinaryFrame<T>) => void;

/**
 * A live claim on a channel, handed back by {@link BinaryStreamHub.Listen}.
 *
 * Holding one is what tells the producer (across every transport boundary) that
 * this consumer actually wants the channel's frames - so `GetLatest` lives *here*
 * rather than on the hub. A passive `hub.GetLatest(channel)` would be invisible to
 * demand ref-counting, meaning a polling consumer would silently be starved of the
 * binary frames it's polling for. Making the read only reachable through the hold
 * makes that failure unrepresentable instead of just-documenting-it.
 *
 * **Always Release() when done** (Janitor / effect Stop() / component teardown),
 * or the channel stays pinned open and keeps burning throughput for nobody.
 */
export interface BinaryChannelHold<T> {
	/** The newest decoded frame on this channel, or `null` if none has arrived yet. */
	GetLatest(): DecodedBinaryFrame<T> | null;
	/** Drop this claim. Idempotent; a double Release won't corrupt the ref-count. */
	Release(): void;
}

/**
 * Notified only on demand *edges* for a channel (first hold acquired -> `true`,
 * last hold released -> `false`), NOT on every Listen/Release. The transport
 * layer wires this to whatever upstream signal tells the producer to start or
 * stop emitting the channel.
 */
export type BinaryChannelDemandObserver = (channelId: number, hasDemand: boolean) => void;

/**
 * Consumer-side multiplexer, shared by the Electron client and the webview. Feed
 * every received buffer to `Ingest`; the hub decodes each frame's payload ONCE
 * (via the channel's registered decoder) and hands that same decoded `value` to
 * every Subscribe listener and GetLatest reader - so N subscribers cost one
 * decode per frame, not N.
 *
 * Register channels up front (see BinaryChannels.RegisterBuiltinBinaryChannels);
 * Listen/Subscribe also self-register their channel as a safety net. Frames on an
 * unregistered channel are dropped, since a producer may emit a channel a given
 * consumer build doesn't understand yet.
 *
 * Reading a channel requires *holding* it (`Listen`, or `Subscribe` which holds
 * on your behalf). Holds are ref-counted per channel, and the hub reports only the
 * 0<->1 edges to its {@link BinaryChannelDemandObserver} - that signal is what the
 * transport layer relays upstream so the producer can skip emitting a channel
 * nobody wants. No holds means no bytes on the wire.
 *
 * Semantics are deliberately last-arrived-wins with no ordering/gap enforcement:
 * this scaffolding is for firehoses, not replicated state. Missed frames are
 * forgotten (the next supersedes it), and `seq` is surfaced purely so a consumer
 * that cares can detect drops.
 *
 * **TL;DR...UDP stream hub.**
 */
export class BinaryStreamHub {
	private readonly decodersByChannel = new Map<number, BinaryPayloadDecoder<unknown>>();
	private readonly latestByChannel = new Map<number, DecodedBinaryFrame<unknown>>();
	private readonly listenersByChannel = new Map<number, Set<BinaryFrameListener<unknown>>>();
	/**
	 * Live hold count per channel. A channel is only ever present here while its
	 * count is >= 1, so the key set *is* the set of channels currently in demand.
	 */
	private readonly holdCountByChannel = new Map<number, number>();
	private demandObserver: BinaryChannelDemandObserver | null = null;

	/**
	 * Register a channel's decoder so its payloads are decoded on ingest. Idempotent
	 * per channel id (re-registering simply replaces the decoder).
	 */
	public RegisterChannel<T>(channel: BinaryChannel<T>): void {
		this.decodersByChannel.set(channel.id, channel.decode as BinaryPayloadDecoder<unknown>);
	}

	/**
	 * Install the observer notified on this hub's demand edges. Set once during
	 * transport wiring; passing `null` detaches it.
	 *
	 * Note this does *NOT* replay existing demand - callers that attach late (or
	 * re-attach after a reconnect) should announce {@link GetHeldChannels} themselves.
	 */
	public SetDemandObserver(observer: BinaryChannelDemandObserver | null): void {
		this.demandObserver = observer;
	}

	/**
	 * Every channel currently held by at least one consumer. Used to re-announce
	 * demand upstream after a reconnect, since the producer forgets a consumer's
	 * demand the moment its transport drops.
	 */
	public GetHeldChannels(): number[] {
		return [...this.holdCountByChannel.keys()];
	}

	/** Whether anything on this hub currently holds `channelId`. */
	public HasDemandFor(channelId: number): boolean {
		return this.holdCountByChannel.has(channelId);
	}

	private AddHold(channelId: number): void {
		const previous = this.holdCountByChannel.get(channelId) ?? 0;
		this.holdCountByChannel.set(channelId, previous + 1);

		if (previous === 0) {
			this.NotifyDemandChanged(channelId, true);
		}
	}

	private ReleaseHold(channelId: number): void {
		const previous = this.holdCountByChannel.get(channelId) ?? 0;
		if (previous <= 1) {
			this.holdCountByChannel.delete(channelId);
			// Nobody's holding this channel anymore, so the cached frame is about to
			// go stale for however long demand stays dark. Drop it now rather than
			// letting a later Listen read a frame from minutes ago as if it were live.
			this.latestByChannel.delete(channelId);
			if (previous === 1) {
				this.NotifyDemandChanged(channelId, false);
			}
			return;
		}

		this.holdCountByChannel.set(channelId, previous - 1);
	}

	private NotifyDemandChanged(channelId: number, hasDemand: boolean): void {
		try {
			this.demandObserver?.(channelId, hasDemand);
		} catch {
			// A throwing observer must not corrupt the ref-count or take out the caller.
		}
	}

	public Ingest(input: ArrayBuffer | Uint8Array): void {
		const raw = DecodeBinaryFrame(input);
		if (!raw) {
			return;
		}

		const decoder = this.decodersByChannel.get(raw.channelId);
		if (!decoder) {
			return; // unknown/unregistered channel - ignore it
		}

		let value: unknown;
		try {
			value = decoder(raw.payload);
		} catch {
			// A decoder that chokes on a malformed payload shouldn't wedge the stream.
			return;
		}

		const frame: DecodedBinaryFrame<unknown> = {
			channelId: raw.channelId,
			seq: raw.seq,
			timestampMs: raw.timestampMs,
			value,
		};
		this.latestByChannel.set(raw.channelId, frame);

		const listeners = this.listenersByChannel.get(raw.channelId);
		if (!listeners) {
			return;
		}
		for (const listener of listeners) {
			try {
				listener(frame);
			} catch {
				// A misbehaving listener shouldn't wedge the entire pipeline.
			}
		}
	}

	/**
	 * Claim `channel`, marking it as in-demand for as long as the returned hold is
	 * alive, and returning the handle you read it through.
	 *
	 * This is the primitive for *pull*-style consumers - an effect's render loop that
	 * wants the newest frame whenever it happens to draw, rather than a callback per
	 * frame. Push-style consumers want {@link Subscribe}, which holds for you.
	 *
	 * @example
	 * const audio = hub.Listen(AudioAnalysisFrameChannel);
	 * // ...in a rAF loop:
	 * const frame = audio.GetLatest();
	 * if (frame) { DrawSpectrum(frame.value.fftBins); }
	 * // ...on teardown:
	 * audio.Release();
	 */
	public Listen<T>(channel: BinaryChannel<T>): BinaryChannelHold<T> {
		this.RegisterChannel(channel);
		this.AddHold(channel.id);

		let released = false;
		return {
			GetLatest: (): DecodedBinaryFrame<T> | null => {
				if (released) {
					return null;
				}
				return (
					(this.latestByChannel.get(channel.id) as DecodedBinaryFrame<T> | undefined) ?? null
				);
			},
			Release: (): void => {
				if (released) {
					return;
				}
				released = true;
				this.ReleaseHold(channel.id);
			},
		};
	}

	/**
	 * Register a listener fired with the already-decoded frame on every arrival for
	 * `channel`, holding the channel for the life of the subscription.
	 *
	 * Sugar over {@link Listen} - the returned callback both unsubscribes and drops
	 * the hold, so demand can't outlive the listener.
     * Idempotent.
	 */
	public Subscribe<T>(channel: BinaryChannel<T>, listener: BinaryFrameListener<T>): () => void {
		const hold = this.Listen(channel);

		let listeners = this.listenersByChannel.get(channel.id);
		if (!listeners) {
			listeners = new Set();
			this.listenersByChannel.set(channel.id, listeners);
		}
		listeners.add(listener as BinaryFrameListener<unknown>);

		let unsubscribed = false;
		return () => {
			if (unsubscribed) {
				return;
			}
			unsubscribed = true;

			this.listenersByChannel.get(channel.id)?.delete(listener as BinaryFrameListener<unknown>);
			hold.Release();
		};
	}
}

/**
 * VSBloom Synchronized State
 *
 * A tiny, transport-agnostic state-replication primitive for shuttling a
 * plain-data object across VSBloom's process boundaries without hand
 * writing a message contract for every field.
 */

import {
	applyPatches,
	createDraft,
	type Draft,
	enablePatches,
	finishDraft,
	type Immutable,
	type Objectish,
	type Patch,
} from 'immer';

// Immer's patch machinery is an opt-in plugin; activate it once upon module load.
//
// We deliberately do NOT enable the array-methods plugin (`enableArrayMethods`):
// it's a performance optimization that changes array callback semantics -
// callbacks receive base values rather than drafts - and our data isn't
// array-hot enough to justify that surprise.
//
// Auto-freeze is left at its default (on): it turns an accidental out-of-band
// mutation of committed state into a loud throw instead of a silent desync.
// Flip it with Immer's `setAutoFreeze(false)` if a profile ever shows freezing
// to be a hot spot for large states.
enablePatches();

/**
 * Full-state payload, used to bootstrap a freshly-created or desynced
 * `RemoteState`. `ver` is the authority's version at snapshot time.
 */
export interface SyncSnapshotPayload<T> {
	k: 'snapshot';
	ver: number;
	state: T;
}

/**
 * Incremental payload emitted by `Commit()`. `base` is the version this patch
 * must be applied on top of; if a mirror's version doesn't match, assume it
 * missed a prior patch and try to fetch a fresh snapshot rather than risking
 * something like data desync/corruption.
 */
export interface SyncPatchPayload {
	k: 'patch';
	base: number;
	ver: number;
	ops: Patch[];
}

/**
 * General type specifying the possible payloads a `SynchronizedState` and its
 * `RemoteState`s can send/receive. Generally the only time that we'll encounter
 * these types outside of this file is going to be when we're actively marshalling
 * the objects across VSBloom transport boundaries.
 */
export type SyncPayload<T> = SyncSnapshotPayload<T> | SyncPatchPayload;

/**
 * Transport hook invoked by `Commit()` when there are changes to broadcast.
 * This is where network activity actually occurs.
 * */
export type PushChangesCallback<T> = (payload: SyncPayload<T>) => void;

/**
 * The authoritative & mutable side of a synchronized object.
 * 
 * Exactly one of these should exist per object.
 * Any number of `RemoteState`s are intended to mirror it.
 */
export class SynchronizedState<T extends Objectish> {
	private current: T;
	private draft: Draft<T>;
	private _version = 0;

	/**
	 * @param initial     The starting state, this gets deep-cloned so caller
	 *                    objects aren't mutated/aliased by this class.
     * 
	 * @param pushChanges Invoked by `Commit()` with a patch payload to send.
	 *                    This is the point where network activity actually occurs
     *                    (e.g. the VSBloom bridge server's `FireAllClients` and
     *                    equivalent networking) - Not called for empty commits.
     *                    
	 */
	constructor(
		initial: T,
		private readonly pushChanges: PushChangesCallback<T>,
	) {
		this.current = structuredClone(initial);
		this.draft = createDraft(this.current);
	}

	/**
	 * The live, mutable state. Read and writable freely - nothing gets sent
     * 'over the wire' until `Commit()` is called.
	 *
	 * IMPORTANT: always reach through `.state` "fresh" - never cache a nested
	 * reference with a variable (`const f = sync.state.foo`) across a `Commit()`.
     * Committing finalizes an underlying Immer draft, revoking it;
     * a stale reference will throw when next accessed.
	 */
	public get state(): Draft<T> {
		return this.draft;
	}

	/**
     * The authority's current version (bumped once per non-empty `Commit()`).
     * */
	public get version(): number {
		return this._version;
	}

	/**
	 * Flush every change made since the last commit as a single minimal patch.
	 * no-ops if nothing changed/commit is empty.
	 * Regardless of commit contents a fresh draft is opened afterwards, to make
     * sure `.state` stays live.
	 */
	public Commit(): void {
		const previousVersion = this._version;
		let capturedPatches: Patch[] = [];

		// `finishDraft(Draft<T>)` yields `T` at runtime, but Immer's conditional
		// return type can't collapse back to `T` for an unresolved generic
		// (works for concrete types though); casting bridges that issue.
		const next = finishDraft(this.draft, (patches) => {
			capturedPatches = patches;
		}) as T;

		// Adopt the finalized state and immediately re-open a draft to ensure
        // `.state` is always live, regardless of whether we actually emit anything
        // or not.
		this.current = next;
		this.draft = createDraft(this.current);

		// If there are no patches, there's nothing to send.
		if (capturedPatches.length === 0) {
			return;
		}

		// Bump the version and send patches. Woot!
		this._version = previousVersion + 1;
		this.pushChanges({
			k: 'patch',
			base: previousVersion,
			ver: this._version,
			ops: capturedPatches,
		});
	}

	/**
	 * Produce a full-state payload for bootstrapping a specific new or desynced
	 * remote (send it via a targeted transport call, e.g. `FireClient`).
     * 
     * Returns the current committed state; uncommitted draft edits are not included.
     * 
     * Generally, this is mostly used to bootstrap new or desynced remote states.
	 */
	public Snapshot(): SyncSnapshotPayload<T> {
		return {
			k: 'snapshot',
			ver: this._version,
			state: this.current,
		};
	}
}

/**
 * Every dot-separated path that can be walked inside `T`, as a union of string
 * literals - so `Subscribe` gets autocomplete and a compile error on typos
 * rather than silently watching a path that will never fire.
 *
 * Arrays contribute a `${number}` segment, so `audio.availableDevices.0.name`
 * typechecks just as `audio.availableDevices` does.
 *
 * `Depth` bounds the recursion so a (directly or mutually) recursive state type
 * can't send the typechecker into an infinite expansion. 8 levels is far deeper
 * than any plausible shared-state shape; raise it only if something legitimately
 * nests further.
 */
export type StatePath<T, Depth extends number = 8> = [Depth] extends [never]
	? never
	: T extends readonly (infer Element)[]
		? `${number}` | `${number}.${StatePath<Element, DecrementDepth[Depth]>}`
		: T extends object
			? {
					[K in Extract<keyof T, string>]:
						| K
						| `${K}.${StatePath<T[K], DecrementDepth[Depth]>}`;
				}[Extract<keyof T, string>]
			: never;

/** Recursion fuel for {@link StatePath} / {@link PathValue}. */
type DecrementDepth = [never, 0, 1, 2, 3, 4, 5, 6, 7];

/**
 * The type sitting at dot-path `P` inside `T`. Lets a path subscriber receive
 * its value already narrowed, instead of re-walking the path by hand and
 * casting - which would throw away everything {@link StatePath} just bought us.
 */
export type PathValue<T, P extends string> = P extends `${infer Head}.${infer Rest}`
	? Head extends keyof T
		? PathValue<T[Head], Rest>
		: T extends readonly (infer Element)[]
			? Head extends `${number}`
				? PathValue<Element, Rest>
				: never
			: never
	: P extends keyof T
		? T[P]
		: T extends readonly (infer Element)[]
			? P extends `${number}`
				? Element
				: never
			: never;

/** A path listener as stored internally, with `T`/`P` erased. */
type ErasedPathListener = (value: unknown) => void;

/**
 * One distinct watched path. Keyed by its dot-string in `RemoteState` so a path
 * is resolved and compared exactly once per payload no matter how many
 * subscribers share it.
 */
interface WatchedPath {
	/** The dot-path pre-split, so we don't re-split it on every payload. */
	readonly segments: readonly string[];
	readonly listeners: Set<ErasedPathListener>;
}

/**
 * Walk `segments` into `root`, yielding `undefined` the moment the path runs off
 * the end of the data (a missing key, or an index past an array's length).
 *
 * A path that doesn't resolve is not an error - shared state is allowed to not
 * have grown a branch yet, and "undefined -> a value" is exactly the transition
 * a subscriber wants to hear about.
 */
function ResolveStatePath(root: unknown, segments: readonly string[]): unknown {
	let current: unknown = root;

	for (const segment of segments) {
		if (current === null || typeof current !== 'object') {
			return undefined;
		}
		current = (current as Record<string, unknown>)[segment];
	}

	return current;
}

/**
 * Structural equality for the plain-data values that live in a synchronized
 * state. Deliberately only handles what survives the wire (primitives, arrays,
 * plain objects) - a `Map`/`Set`/`Date` in shared state wouldn't survive JSON
 * marshalling in the first place, so there's nothing here to support.
 *
 * The leading `Object.is` is what makes path subscriptions cheap on the patch
 * path: `applyPatches` shares untouched subtrees by reference, so an unchanged
 * branch bails on the first comparison instead of being walked.
 */
function DeepEquals(a: unknown, b: unknown): boolean {
	if (Object.is(a, b)) {
		return true;
	}

	if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) {
		return false;
	}

	const aIsArray = Array.isArray(a);
	if (aIsArray !== Array.isArray(b)) {
		return false;
	}

	if (aIsArray) {
		const arrayA = a as readonly unknown[];
		const arrayB = b as readonly unknown[];
		if (arrayA.length !== arrayB.length) {
			return false;
		}
		for (let i = 0; i < arrayA.length; i++) {
			if (!DeepEquals(arrayA[i], arrayB[i])) {
				return false;
			}
		}
		return true;
	}

	const objectA = a as Record<string, unknown>;
	const objectB = b as Record<string, unknown>;
	const keysA = Object.keys(objectA);
	if (keysA.length !== Object.keys(objectB).length) {
		return false;
	}
	for (const key of keysA) {
		if (!Object.prototype.hasOwnProperty.call(objectB, key)) {
			return false;
		}
		if (!DeepEquals(objectA[key], objectB[key])) {
			return false;
		}
	}
	return true;
}

/**
 * A read-only 'mirror' of an external `SynchronizedState`, often times lying
 * across some transport boundary. Feed it received payloads you receive via
 * `ApplyPayload` through however networking is setup for the current boundary;
 * read the mirrored data via `.state` & react to updates via `Subscribe`.
 */
export class RemoteState<T extends Objectish> {
	private current: T;
	// -1 is an impossible authority version since they only tend to start at 0,
	// so a freshly-constructed mirror rejects *any* patch until a snapshot
	// initializes it - this is intended to enforce "snapshot before patches".
	private _version = -1;
	private readonly changeListeners = new Set<() => void>();
	private readonly desyncListeners = new Set<() => void>();
	/**
	 * Watched paths keyed by their dot-string. Only paths with at least one live
	 * subscriber are present, so a mirror nobody path-subscribes to pays literally
	 * nothing on the apply path.
	 */
	private readonly watchedPaths = new Map<string, WatchedPath>();

	/**
	 * @param initial The 'initial' PRE-SYNC value that `.state` should return before
     *                actually receiving a snapshot - Deep-cloned.
	 */
	constructor(initial: T) {
		this.current = structuredClone(initial);
	}

	/**
     * The current mirrored state; Deep-readonly and client-side;
     * SynchronizedState's are one-way only.
     * */
	public get state(): Immutable<T> {
		return this.current as Immutable<T>;
	}

	/**
     * This mirror's version (or -1 if it has not yet received a snapshot)
     * */
	public get version(): number {
		return this._version;
	}

	/**
	 * The single entry point for data arriving from the authority. Hand it
	 * whatever your transport receives (after parsing things back into
     * object(s) again, that is)
	 *
	 * - snapshot: replaces the mirror completely.
	 * - patch: applied only if its `base` matches our version; otherwise we fire
	 *   `OnDesync` and leave state untouched - in this case you should respond by
	 *   requesting/sending a fresh snapshot promptly.
	 */
	public ApplyPayload(payload: SyncPayload<T>): void {
		if (payload.k === 'snapshot') {
			const watchedValuesBefore = this.CaptureWatchedPathValues();

			this.current = structuredClone(payload.state);
			this._version = payload.ver;

			this.NotifyChange();
			this.NotifyChangedPaths(watchedValuesBefore);
			return;
		}

        // If the base version doesn't match, we're out of sync.
		if (payload.base !== this._version) {
			this.NotifyDesync();
			return;
		}

        // If the base version matches, we can apply any&all received
        // patches.
		const watchedValuesBefore = this.CaptureWatchedPathValues();

		this.current = applyPatches(this.current, payload.ops);
		this._version = payload.ver;

		this.NotifyChange();
		this.NotifyChangedPaths(watchedValuesBefore);
	}

	/**
	 * Register a listener to be fired after every successfully applied payload
	 * (snapshot or patch).
     *
     * Returns an unsubscribe function.
	 *
	 * For the VSBloom webview Svelte will bind to this hook & provide reactivity:
	 * `remote.Subscribe(() => (s = remote.state))` - since each apply yields a
	 * new object, reassigning a `$state` ref is all the reactivity we'll need.
	 */
	public Subscribe(listener: () => void): () => void;
	/**
	 * Register a listener fired only when the value at dot-path `path` actually
	 * *changes* - so an effect that only cares about, say, the audio device list
	 * isn't woken by every unrelated write anywhere else in shared state.
	 *
	 * The listener receives the new value at that path, already narrowed to the
	 * right type. `path` is checked against {@link StatePath}, so a typo is a
	 * compile error rather than a subscription that silently never fires.
	 *
	 * Semantics worth knowing (they differ from the pathless overload above -
	 * that one means "a payload was applied", this one means "this value is now
	 * different"):
	 * - Ancestor and descendant writes both count. Subscribing to `a.b` fires
	 *   whether the whole `a` subtree was replaced or just `a.b.c.d` was poked -
	 *   but *only* if that made `a.b` genuinely different.
	 * - A snapshot that happens to carry the same value at `path` does NOT fire.
	 *   This is what keeps a reconnect/desync-recovery snapshot from stampeding
	 *   every path subscriber in the process over state that never moved.
	 * - Comparison is structural, not by identity, and the path is *not* fired
	 *   on initial subscribe (read `.state` directly for the current value).
	 *
	 * Cost is one path resolution plus a structural compare per distinct watched
	 * path per payload - fine for the control plane, which is what this is for.
	 * High-throughput data belongs on the binary plane (see Binary/BinaryTransport.ts),
	 * not here.
	 *
	 * @example
	 * const unsubscribe = vsbloom.sharedState.Subscribe(
	 *     'audio.availableDevices',
	 *     (devices) => RebuildDeviceMenu(devices),
	 * );
	 */
	public Subscribe<P extends StatePath<T>>(
		path: P,
		listener: (value: Immutable<PathValue<T, P>>) => void,
	): () => void;
	public Subscribe(
		pathOrListener: string | (() => void),
		maybePathListener?: (value: never) => void,
	): () => void {
		if (typeof pathOrListener === 'function') {
			const listener = pathOrListener;
			this.changeListeners.add(listener);
			return () => {
				this.changeListeners.delete(listener);
			};
		}

		const path = pathOrListener;
		const listener = maybePathListener as ErasedPathListener;

		let watched = this.watchedPaths.get(path);
		if (!watched) {
			watched = { segments: path.split('.'), listeners: new Set() };
			this.watchedPaths.set(path, watched);
		}
		watched.listeners.add(listener);

		let unsubscribed = false;
		return () => {
			if (unsubscribed) {
				return;
			}
			unsubscribed = true;

			const stillWatched = this.watchedPaths.get(path);
			if (!stillWatched) {
				return;
			}

			stillWatched.listeners.delete(listener);
			// Last subscriber out drops the whole entry, so we stop resolving and
			// comparing a path nobody is watching anymore.
			if (stillWatched.listeners.size === 0) {
				this.watchedPaths.delete(path);
			}
		};
	}

    /**
     * Produce a full-state payload as if we were the authority of
     * the `SynchronizedState` object for which we are mirroring,
     * useful for things like Pseudo-Servers replicating their
     * copy of shared state over to Webviews etc.
     */
    public Snapshot(): SyncSnapshotPayload<T> {
		return {
			k: 'snapshot',
			ver: this._version,
			state: this.current,
		};
	}

	/**
	 * Register a listener fired when a patch can't be applied because a prior
	 * one was missed (a version gap, e.g. after a reconnect). The handler should
	 * arrange for a fresh snapshot to be sent.
     * 
     * Returns an unsubscribe function.
	 */
	public OnDesync(listener: () => void): () => void {
		this.desyncListeners.add(listener);
		return () => {
			this.desyncListeners.delete(listener);
		};
	}

	/**
	 * Snapshot the current value at every watched path, to be compared against
	 * after a payload lands. Returns an empty map when nothing is path-subscribed,
	 * which is the common case and costs nothing.
	 *
	 * These are *references* into the pre-apply state, not clones - safe because
	 * neither `applyPatches` nor the snapshot assignment mutates the old root in
	 * place, so what we captured stays valid to compare against.
	 */
	private CaptureWatchedPathValues(): Map<string, unknown> {
		const captured = new Map<string, unknown>();
		if (this.watchedPaths.size === 0) {
			return captured;
		}

		for (const [path, watched] of this.watchedPaths) {
			captured.set(path, ResolveStatePath(this.current, watched.segments));
		}
		return captured;
	}

	/**
	 * Fire the subscribers of every watched path whose value differs from what
	 * {@link CaptureWatchedPathValues} recorded before the payload was applied.
	 */
	private NotifyChangedPaths(valuesBefore: Map<string, unknown>): void {
		if (valuesBefore.size === 0) {
			return;
		}

		// Iterate a snapshot of the registry: a listener is free to subscribe or
		// unsubscribe while we're notifying, and mutating the live Map mid-iteration
		// would be a mess. Anything subscribed *during* this pass is intentionally
		// skipped - it has no 'before' value, so we'd have nothing to compare it to.
		for (const [path, watched] of [...this.watchedPaths]) {
			// The entry can be dropped (or replaced wholesale) by an earlier
			// listener in this same pass; don't notify a dead subscription.
			if (this.watchedPaths.get(path) !== watched) {
				continue;
			}

			const valueBefore = valuesBefore.get(path);
			const valueAfter = ResolveStatePath(this.current, watched.segments);
			if (DeepEquals(valueBefore, valueAfter)) {
				continue;
			}

			for (const listener of [...watched.listeners]) {
				try {
					listener(valueAfter);
				} catch {
					// Same isolation as NotifyChange - one bad path subscriber
					// shouldn't take out the others, or the apply itself.
				}
			}
		}
	}

	private NotifyChange(): void {
		for (const listener of [...this.changeListeners]) {
			try {
				listener();
			} catch {
				// (A misbehaving listener shouldn't wedge the rest
                // of the system.)
			}
		}
	}

	private NotifyDesync(): void {
		for (const listener of [...this.desyncListeners]) {
			try {
				listener();
			} catch {
				// Isolation between listeners; same as NotifyChange logic
			}
		}
	}
}

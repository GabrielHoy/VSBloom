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
			this.current = structuredClone(payload.state);
			this._version = payload.ver;
			this.NotifyChange();
			return;
		}

        // If the base version doesn't match, we're out of sync.
		if (payload.base !== this._version) {
			this.NotifyDesync();
			return;
		}

        // If the base version matches, we can apply any&all received
        // patches.
		this.current = applyPatches(this.current, payload.ops);
		this._version = payload.ver;
		this.NotifyChange();
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
	public Subscribe(listener: () => void): () => void {
		this.changeListeners.add(listener);
		return () => {
			this.changeListeners.delete(listener);
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

	private NotifyChange(): void {
		for (const listener of this.changeListeners) {
			try {
				listener();
			} catch {
				// (A misbehaving listener shouldn't wedge the rest
                // of the system.)
			}
		}
	}

	private NotifyDesync(): void {
		for (const listener of this.desyncListeners) {
			try {
				listener();
			} catch {
				// Isolation between listeners; same as NotifyChange logic
			}
		}
	}
}

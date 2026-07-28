import { describe, expect, test, vi } from 'vitest';
import {
	RemoteState,
	type SyncPayload,
	SynchronizedState,
} from '../../../src/ExtensionBridge/SynchronizedState';

/**
 * Simulate a payload crossing a real boundary: everything a
 * `SynchronizedState` emits is expected to survive JSON marshalling, so we
 * round-trip through JSON in the tests both to mimic the wire and to assert
 * (implicitly) that payloads are always serializable.
 */
function wire<T>(payload: SyncPayload<T>): SyncPayload<T> {
	return JSON.parse(JSON.stringify(payload)) as SyncPayload<T>;
}

interface Sample {
	a: number;
	nested: { b: string; c: number };
}

function makeSample(): Sample {
	return { a: 1, nested: { b: 'x', c: 2 } };
}

/**
 * Wires an authority to a single mirror through an outbox, bootstrapping the
 * mirror with a snapshot (the realistic "remote just connected" flow). The
 * outbox retains every emitted patch so tests can inspect or replay them.
 */
function wirePair<T extends object>(initial: T) {
	const outbox: SyncPayload<T>[] = [];
	const remote = new RemoteState<T>(initial);
	const sync = new SynchronizedState<T>(initial, (payload) => {
		outbox.push(wire(payload));
	});
	remote.ApplyPayload(wire(sync.Snapshot()));
	return { sync, remote, outbox };
}

describe('SynchronizedState / RemoteState', () => {
	test('round-trips mutations from authority to mirror', () => {
		const { sync, remote, outbox } = wirePair(makeSample());

		sync.state.a = 10;
		sync.state.nested.b = 'y';
		sync.Commit();

		expect(outbox).toHaveLength(1);
		remote.ApplyPayload(outbox[0]);

		expect(remote.state).toEqual({ a: 10, nested: { b: 'y', c: 2 } });
		expect(remote.version).toBe(1);
		expect(sync.version).toBe(1);
	});

	test('coalesces repeated writes to the same leaf into one final op', () => {
		const { sync, remote, outbox } = wirePair(makeSample());

		sync.state.nested.c = 5;
		sync.state.nested.c = 7;
		sync.Commit();

		expect(outbox).toHaveLength(1);
		const payload = outbox[0];
		expect(payload.k).toBe('patch');
		if (payload.k !== 'patch') {
			throw new Error('expected a patch payload');
		}

		expect(payload.ops).toHaveLength(1);
		expect(payload.ops[0].path).toEqual(['nested', 'c']);
		expect(payload.ops[0].value).toBe(7);

		remote.ApplyPayload(payload);
		expect(remote.state.nested.c).toBe(7);
	});

	test('folds a child write into a whole-subtree replacement (no double-send)', () => {
		const { sync, remote, outbox } = wirePair(makeSample());

		sync.state.nested = { b: 'z', c: 9 };
		sync.state.nested.c = 100;
		sync.Commit();

		const payload = outbox[0];
		if (payload.k !== 'patch') {
			throw new Error('expected a patch payload');
		}

		// A single op replacing the whole `nested` subtree - not a separate
		// replace of `nested` *and* `nested.c`.
		expect(payload.ops).toHaveLength(1);
		expect(payload.ops[0].path).toEqual(['nested']);

		remote.ApplyPayload(payload);
		expect(remote.state).toEqual({ a: 1, nested: { b: 'z', c: 100 } });
	});

	test('propagates key deletions', () => {
		interface Deletable {
			a?: number;
			b: number;
		}
		const { sync, remote, outbox } = wirePair<Deletable>({ a: 1, b: 2 });

		delete sync.state.a;
		sync.Commit();

		remote.ApplyPayload(outbox[0]);
		expect(remote.state).toEqual({ b: 2 });
		expect('a' in remote.state).toBe(false);
	});

	test('replicates array mutations (push / splice / index set)', () => {
		interface WithList {
			list: number[];
		}
		const { sync, remote, outbox } = wirePair<WithList>({ list: [1, 2, 3] });

		sync.state.list.push(4);
		sync.Commit();
		remote.ApplyPayload(outbox[outbox.length - 1]);
		expect(remote.state.list).toEqual([1, 2, 3, 4]);

		sync.state.list.splice(1, 1);
		sync.Commit();
		remote.ApplyPayload(outbox[outbox.length - 1]);
		expect(remote.state.list).toEqual([1, 3, 4]);

		sync.state.list[0] = 99;
		sync.Commit();
		remote.ApplyPayload(outbox[outbox.length - 1]);
		expect(remote.state.list).toEqual([99, 3, 4]);

		expect(remote.version).toBe(3);
	});

	test('an empty commit pushes nothing and does not bump the version', () => {
		const pushChanges = vi.fn();
		const sync = new SynchronizedState(makeSample(), pushChanges);

		sync.Commit();
		expect(pushChanges).not.toHaveBeenCalled();
		expect(sync.version).toBe(0);

		sync.state.a = 5;
		sync.Commit();
		expect(pushChanges).toHaveBeenCalledTimes(1);
		expect(sync.version).toBe(1);
	});

	test('bootstraps a late joiner via snapshot, then continues with patches', () => {
		const outbox: SyncPayload<Sample>[] = [];
		const sync = new SynchronizedState(makeSample(), (p) => outbox.push(wire(p)));

		// The authority evolves before any mirror exists.
		sync.state.a = 2;
		sync.Commit();
		sync.state.a = 3;
		sync.Commit();
		expect(sync.version).toBe(2);

		// A mirror joins now and is bootstrapped straight to the current state -
		// it never sees the two earlier patches.
		const remote = new RemoteState(makeSample());
		remote.ApplyPayload(wire(sync.Snapshot()));
		expect(remote.version).toBe(2);
		expect(remote.state).toEqual({ a: 3, nested: { b: 'x', c: 2 } });

		// A subsequent patch applies cleanly on top of the snapshot.
		sync.state.a = 4;
		sync.Commit();
		remote.ApplyPayload(outbox[outbox.length - 1]);
		expect(remote.state.a).toBe(4);
		expect(remote.version).toBe(3);
	});

	test('detects a dropped patch, fires OnDesync, and recovers from a snapshot', () => {
		const outbox: SyncPayload<Sample>[] = [];
		const sync = new SynchronizedState(makeSample(), (p) => outbox.push(wire(p)));

		const remote = new RemoteState(makeSample());
		remote.ApplyPayload(wire(sync.Snapshot())); // version 0

		sync.state.a = 2;
		sync.Commit(); // outbox[0]: base 0 -> ver 1
		sync.state.a = 3;
		sync.Commit(); // outbox[1]: base 1 -> ver 2

		const onDesync = vi.fn();
		remote.OnDesync(onDesync);

		// Deliver ONLY the second patch (base 1) while the mirror is still at 0.
		remote.ApplyPayload(outbox[1]);

		expect(onDesync).toHaveBeenCalledTimes(1);
		expect(remote.version).toBe(0);
		expect(remote.state.a).toBe(1); // untouched - not corrupted

		// A fresh snapshot heals the mirror.
		remote.ApplyPayload(wire(sync.Snapshot()));
		expect(remote.version).toBe(2);
		expect(remote.state.a).toBe(3);
	});

	test('a fresh mirror rejects patches until it has been snapshotted', () => {
		const outbox: SyncPayload<Sample>[] = [];
		const sync = new SynchronizedState(makeSample(), (p) => outbox.push(wire(p)));

		const remote = new RemoteState(makeSample());
		expect(remote.version).toBe(-1);

		const onDesync = vi.fn();
		remote.OnDesync(onDesync);

		sync.state.a = 2;
		sync.Commit(); // base 0 -> ver 1

		remote.ApplyPayload(outbox[0]); // base 0 !== -1 -> desync
		expect(onDesync).toHaveBeenCalledTimes(1);
		expect(remote.state.a).toBe(1);
	});

	test('a nested draft reference cached across a Commit is revoked', () => {
		const sync = new SynchronizedState(makeSample(), () => {});

		const staleNested = sync.state.nested;
		sync.state.a = 2;
		sync.Commit();

		expect(() => {
			staleNested.b = 'boom';
		}).toThrow();
		expect(() => staleNested.b).toThrow();

		// Reaching through `.state` fresh works fine.
		sync.state.nested.b = 'ok';
		sync.Commit();
	});

	test('Subscribe fires once per applied payload and stops after unsubscribe', () => {
		const outbox: SyncPayload<Sample>[] = [];
		const sync = new SynchronizedState(makeSample(), (p) => outbox.push(wire(p)));
		const remote = new RemoteState(makeSample());

		const listener = vi.fn();
		const unsubscribe = remote.Subscribe(listener);

		remote.ApplyPayload(wire(sync.Snapshot())); // snapshot counts as a change
		expect(listener).toHaveBeenCalledTimes(1);

		sync.state.a = 5;
		sync.Commit();
		remote.ApplyPayload(outbox[outbox.length - 1]);
		expect(listener).toHaveBeenCalledTimes(2);

		unsubscribe();
		remote.ApplyPayload(wire(sync.Snapshot()));
		expect(listener).toHaveBeenCalledTimes(2);
	});

	describe('path subscriptions', () => {
		interface Pathy {
			audio: { devices: { id: string; name: string }[]; volume: number };
			unrelated: string;
		}

		function makePathy(): Pathy {
			return {
				audio: { devices: [{ id: 'a', name: 'Speakers' }], volume: 1 },
				unrelated: 'x',
			};
		}

		test('fires only when the watched path changes, not on unrelated writes', () => {
			const { sync, remote, outbox } = wirePair(makePathy());

			const listener = vi.fn();
			remote.Subscribe('audio.devices', listener);

			// An unrelated write elsewhere in the tree.
			sync.state.unrelated = 'y';
			sync.Commit();
			remote.ApplyPayload(outbox[outbox.length - 1]);
			expect(listener).not.toHaveBeenCalled();

			// A sibling under the same parent still isn't our path.
			sync.state.audio.volume = 0.5;
			sync.Commit();
			remote.ApplyPayload(outbox[outbox.length - 1]);
			expect(listener).not.toHaveBeenCalled();

			sync.state.audio.devices.push({ id: 'b', name: 'Headphones' });
			sync.Commit();
			remote.ApplyPayload(outbox[outbox.length - 1]);
			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener).toHaveBeenLastCalledWith([
				{ id: 'a', name: 'Speakers' },
				{ id: 'b', name: 'Headphones' },
			]);
		});

		test('a descendant write wakes an ancestor subscription', () => {
			const { sync, remote, outbox } = wirePair(makePathy());

			const listener = vi.fn();
			remote.Subscribe('audio.devices', listener);

			// Deep write, several levels below the watched path.
			sync.state.audio.devices[0].name = 'Renamed';
			sync.Commit();
			remote.ApplyPayload(outbox[outbox.length - 1]);

			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener).toHaveBeenLastCalledWith([{ id: 'a', name: 'Renamed' }]);
		});

		test('an ancestor replacement wakes a descendant subscription only if the value moved', () => {
			const { sync, remote, outbox } = wirePair(makePathy());

			const nameListener = vi.fn();
			const idListener = vi.fn();
			remote.Subscribe('audio.devices.0.name', nameListener);
			remote.Subscribe('audio.devices.0.id', idListener);

			// Replace the whole `audio` subtree, changing only the device name.
			sync.state.audio = { devices: [{ id: 'a', name: 'Renamed' }], volume: 1 };
			sync.Commit();
			remote.ApplyPayload(outbox[outbox.length - 1]);

			expect(nameListener).toHaveBeenCalledTimes(1);
			expect(nameListener).toHaveBeenLastCalledWith('Renamed');
			// `id` sits under the replaced subtree but its value never moved.
			expect(idListener).not.toHaveBeenCalled();
		});

		test('a snapshot carrying an unchanged value does not fire the path', () => {
			const outbox: SyncPayload<Pathy>[] = [];
			const sync = new SynchronizedState(makePathy(), (p) => outbox.push(wire(p)));
			const remote = new RemoteState(makePathy());
			remote.ApplyPayload(wire(sync.Snapshot()));

			const devicesListener = vi.fn();
			const rootListener = vi.fn();
			remote.Subscribe('audio.devices', devicesListener);
			remote.Subscribe(rootListener);

			// The desync-recovery case: a fresh snapshot over identical state.
			remote.ApplyPayload(wire(sync.Snapshot()));

			expect(devicesListener).not.toHaveBeenCalled();
			// The pathless overload keeps its "a payload was applied" meaning.
			expect(rootListener).toHaveBeenCalledTimes(1);
		});

		test('a snapshot that does move the value fires the path', () => {
			const outbox: SyncPayload<Pathy>[] = [];
			const sync = new SynchronizedState(makePathy(), (p) => outbox.push(wire(p)));
			const remote = new RemoteState(makePathy());
			remote.ApplyPayload(wire(sync.Snapshot()));

			const listener = vi.fn();
			remote.Subscribe('audio.volume', listener);

			sync.state.audio.volume = 0.25;
			sync.Commit();
			// Deliver via snapshot rather than the patch, as desync recovery would.
			remote.ApplyPayload(wire(sync.Snapshot()));

			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener).toHaveBeenLastCalledWith(0.25);
		});

		test('resolves to undefined for a path that has not grown yet, and fires when it does', () => {
			interface Sparse {
				maybe?: { value: number };
			}
			const outbox: SyncPayload<Sparse>[] = [];
			const sync = new SynchronizedState<Sparse>({}, (p) => outbox.push(wire(p)));
			const remote = new RemoteState<Sparse>({});
			remote.ApplyPayload(wire(sync.Snapshot()));

			const listener = vi.fn();
			remote.Subscribe('maybe.value', listener);

			sync.state.maybe = { value: 7 };
			sync.Commit();
			remote.ApplyPayload(outbox[outbox.length - 1]);

			expect(listener).toHaveBeenCalledTimes(1);
			expect(listener).toHaveBeenLastCalledWith(7);
		});

		test('a desync fires no path subscribers', () => {
			const outbox: SyncPayload<Pathy>[] = [];
			const sync = new SynchronizedState(makePathy(), (p) => outbox.push(wire(p)));
			const remote = new RemoteState(makePathy());
			remote.ApplyPayload(wire(sync.Snapshot()));

			const listener = vi.fn();
			remote.Subscribe('audio.volume', listener);

			sync.state.audio.volume = 2;
			sync.Commit(); // base 0 -> ver 1
			sync.state.audio.volume = 3;
			sync.Commit(); // base 1 -> ver 2

			remote.ApplyPayload(outbox[1]); // gap -> desync
			expect(listener).not.toHaveBeenCalled();
		});

		test('unsubscribing stops delivery and leaves co-subscribers on the same path intact', () => {
			const { sync, remote, outbox } = wirePair(makePathy());

			const first = vi.fn();
			const second = vi.fn();
			const unsubscribeFirst = remote.Subscribe('audio.volume', first);
			remote.Subscribe('audio.volume', second);

			sync.state.audio.volume = 0.5;
			sync.Commit();
			remote.ApplyPayload(outbox[outbox.length - 1]);
			expect(first).toHaveBeenCalledTimes(1);
			expect(second).toHaveBeenCalledTimes(1);

			unsubscribeFirst();
			unsubscribeFirst(); // idempotent - must not disturb `second`

			sync.state.audio.volume = 0.25;
			sync.Commit();
			remote.ApplyPayload(outbox[outbox.length - 1]);
			expect(first).toHaveBeenCalledTimes(1);
			expect(second).toHaveBeenCalledTimes(2);
		});

		test('a throwing path subscriber does not stop the others', () => {
			const { sync, remote, outbox } = wirePair(makePathy());

			const thrower = vi.fn(() => {
				throw new Error('boom');
			});
			const survivor = vi.fn();
			remote.Subscribe('audio.volume', thrower);
			remote.Subscribe('audio.volume', survivor);

			sync.state.audio.volume = 0.5;
			sync.Commit();
			expect(() => remote.ApplyPayload(outbox[outbox.length - 1])).not.toThrow();

			expect(thrower).toHaveBeenCalledTimes(1);
			expect(survivor).toHaveBeenCalledTimes(1);
		});

		test('unsubscribing from within a notification is safe', () => {
			const { sync, remote, outbox } = wirePair(makePathy());

			const second = vi.fn();
			const unsubscribeSecond = remote.Subscribe('audio.volume', second);
			// Registered after `second`, but fires first only if ordering happens to
			// put it there; either way tearing down mid-pass must not throw.
			remote.Subscribe('audio.volume', () => unsubscribeSecond());

			sync.state.audio.volume = 0.5;
			sync.Commit();
			expect(() => remote.ApplyPayload(outbox[outbox.length - 1])).not.toThrow();

			sync.state.audio.volume = 0.25;
			sync.Commit();
			remote.ApplyPayload(outbox[outbox.length - 1]);
			expect(second).toHaveBeenCalledTimes(1);
		});
	});

	test('a desync does not fire change subscribers', () => {
		const outbox: SyncPayload<Sample>[] = [];
		const sync = new SynchronizedState(makeSample(), (p) => outbox.push(wire(p)));
		const remote = new RemoteState(makeSample());
		remote.ApplyPayload(wire(sync.Snapshot()));

		const listener = vi.fn();
		remote.Subscribe(listener);
		listener.mockClear();

		sync.state.a = 2;
		sync.Commit(); // base 0 -> ver 1
		sync.state.a = 3;
		sync.Commit(); // base 1 -> ver 2

		remote.ApplyPayload(outbox[1]); // gap -> desync, no change
		expect(listener).not.toHaveBeenCalled();
	});
});

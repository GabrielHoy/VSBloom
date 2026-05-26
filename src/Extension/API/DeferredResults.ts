/**
 * Promise exposed to other extensions. Resolved by {@link DeferredResultProvider}
 * once the deferred value is ready.
 */
export type DeferredResultConsumer<T> = Promise<T>;

export class DeferredResultProvider<T> {
	public readonly consumer: DeferredResultConsumer<T>;
	public resolve!: (value: T | PromiseLike<T>) => void;
	public reject!: (reason?: unknown) => void;

	public constructor() {
		this.consumer = new Promise<T>((resolve, reject) => {
			this.resolve = resolve;
			this.reject = reject;
		});
	}
}


export interface DeferredShared<T> extends PromiseLike<T> {
    then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): DeferredResultConsumer<TResult1 | TResult2>;
    catch<TResult = never>(
        onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
    ): DeferredResultConsumer<T | TResult>;
}

export interface DeferredResultConsumer<T> extends DeferredShared<T> {}

class DeferredResultConsumerImpl<T> implements DeferredResultConsumer<T> {
    public constructor(private readonly promise: Promise<T>) {}

    public then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): DeferredResultConsumer<TResult1 | TResult2> {
        return new DeferredResultConsumerImpl(this.promise.then(onfulfilled, onrejected));
    }

    public catch<TResult = never>(
        onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
    ): DeferredResultConsumer<T | TResult> {
        return new DeferredResultConsumerImpl(this.promise.catch(onrejected));
    }
}

export class DeferredResultProvider<T> implements DeferredShared<T> {
    private readonly promise: Promise<T>;
    public readonly consumer: DeferredResultConsumer<T>;
    public resolve!: (value: T | PromiseLike<T>) => void;
    public reject!: (reason?: unknown) => void;

    public constructor() {
        this.promise = new Promise<T>((resolve, reject) => {
            this.resolve = resolve;
            this.reject = reject;
        });
        this.consumer = new DeferredResultConsumerImpl(this.promise);
    }

    public then<TResult1 = T, TResult2 = never>(
        onfulfilled?: ((value: T) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): DeferredResultConsumer<TResult1 | TResult2> {
        return this.consumer.then(onfulfilled, onrejected);
    }

    public catch<TResult = never>(
        onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
    ): DeferredResultConsumer<T | TResult> {
        return this.consumer.catch(onrejected);
    }
}
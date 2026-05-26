import { describe, test, expect } from 'vitest';
import { DeferredResultProvider } from '../../src/Extension/API/DeferredResults';

describe('DeferredResultProvider', () => {
	test('consumer is a Promise', () => {
		const provider = new DeferredResultProvider<number>();
		expect(provider.consumer).toBeInstanceOf(Promise);
	});

	test('resolve() resolves the consumer with the given value', async () => {
		const provider = new DeferredResultProvider<string>();
		provider.resolve('hello');
		await expect(provider.consumer).resolves.toBe('hello');
	});

	test('reject() rejects the consumer with the given reason', async () => {
		const provider = new DeferredResultProvider<string>();
		provider.reject(new Error('boom'));
		await expect(provider.consumer).rejects.toThrow('boom');
	});

	test('multiple awaits on the same consumer see the same resolved value', async () => {
		const provider = new DeferredResultProvider<number>();
		provider.resolve(42);
		const [a, b] = await Promise.all([provider.consumer, provider.consumer]);
		expect(a).toBe(42);
		expect(b).toBe(42);
	});

	test('resolve() with a PromiseLike chains correctly', async () => {
		const provider = new DeferredResultProvider<number>();
		provider.resolve(Promise.resolve(99));
		await expect(provider.consumer).resolves.toBe(99);
	});
});

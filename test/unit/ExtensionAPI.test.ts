import { describe, test, expect } from 'vitest';
import { UnpatchedClientState } from '../../src/Extension/API/ExtensionAPI';

/**
 * These tests lock down the public string values of UnpatchedClientState.
 * Consumer extensions may branch on these string discriminants, so stability
 * of the actual values is part of the public API contract.
 */
describe('UnpatchedClientState', () => {
	test('all values are strings; not numeric', () => {
		for (const key of Object.keys(UnpatchedClientState)) {
			expect(typeof UnpatchedClientState[key as keyof typeof UnpatchedClientState]).toBe(
				'string',
			);
		}
	});

	test('NOT_PATCHED', () => {
		expect(UnpatchedClientState.NOT_PATCHED).toBe('NOT_PATCHED');
	});

	test('PATCH_PROMPT_SUPPRESSED', () => {
		expect(UnpatchedClientState.PATCH_PROMPT_SUPPRESSED).toBe('PATCH_PROMPT_SUPPRESSED');
	});

	test('PATCH_PROMPT_DECLINED', () => {
		expect(UnpatchedClientState.PATCH_PROMPT_DECLINED).toBe('PATCH_PROMPT_DECLINED');
	});

	test('PATCHED_RELOAD_REQUIRED', () => {
		expect(UnpatchedClientState.PATCHED_RELOAD_REQUIRED).toBe('PATCHED_RELOAD_REQUIRED');
	});

	test('ACTIVATION_FAILED', () => {
		expect(UnpatchedClientState.ACTIVATION_FAILED).toBe('ACTIVATION_FAILED');
	});

	test('enum has exactly 5 members', () => {
		expect(Object.keys(UnpatchedClientState)).toHaveLength(5);
	});
});

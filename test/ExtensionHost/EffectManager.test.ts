import * as assert from 'assert';
import { GetExtensionAPI } from './Helpers/GetExtensionAPI';
import type { TestEffectManager } from './Helpers/ExtensionHostTypes';

suite('EffectManager', () => {
	let effectManager: TestEffectManager;

	suiteSetup(async () => {
		const api = await GetExtensionAPI();
		effectManager = api.GetEffectManager();
	});

	test('GetEffectManager returns a non-null object', () => {
		assert.ok(effectManager);
	});

	test('GetLoadedEffects returns an array', () => {
		const effects = effectManager.GetLoadedEffects();
		assert.ok(Array.isArray(effects), 'GetLoadedEffects should return an array');
	});

	test('IsEffectLoaded returns a boolean', () => {
		const result = effectManager.IsEffectLoaded('CursorTrails');
		assert.strictEqual(typeof result, 'boolean');
	});
});

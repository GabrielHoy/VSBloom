import { describe, test, expect } from 'vitest';
import { IsJSValid } from '../../../src/Patcher/SafeJSPatching';

//Simple JS parser validation to ensure it actually works as expected

describe('IsJSValid', () => {
	test('returns [true, undefined] for valid JavaScript', () => {
		const [isValid, err] = IsJSValid('const x = 1;');
		expect(isValid).toBe(true);
		expect(err).toBeUndefined();
	});

	test('returns [false, Error] for invalid JavaScript', () => {
		const [isValid, err] = IsJSValid('const = 1;');
		expect(isValid).toBe(false);
		expect(err).toBeInstanceOf(Error);
	});

	test('empty string is valid', () => {
		const [isValid] = IsJSValid('');
		expect(isValid).toBe(true);
	});

	test('ES module import/export syntax is valid', () => {
		const [isValid] = IsJSValid('export const x = 1;\nimport { y } from "module";');
		expect(isValid).toBe(true);
	});

	test('unbalanced braces are invalid', () => {
		const [isValid, err] = IsJSValid('function foo( { return; }');
		expect(isValid).toBe(false);
		expect(err?.message).toBeDefined();
	});

	test('unclosed string literal is invalid', () => {
		const [isValid, err] = IsJSValid('const x = "unclosed;');
		expect(isValid).toBe(false);
		expect(err).toBeInstanceOf(Error);
	});

	test('complex valid function is accepted', () => {
		const code = `
			async function fetchData(url) {
				const resp = await fetch(url);
				return resp.json();
			}
		`;
		const [isValid] = IsJSValid(code);
		expect(isValid).toBe(true);
	});

	test('error message is populated on syntax error', () => {
		const [, err] = IsJSValid('???');
		expect(err?.message).toBeTruthy();
	});
});
